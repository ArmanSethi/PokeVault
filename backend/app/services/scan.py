"""Free OCR card scanning.

Pipeline: preprocess the uploaded photo (Pillow) -> read text (Tesseract) -> parse the
card name + collector number -> fuzzy-match (rapidfuzz) against the local catalog ->
return ranked candidates with a confidence score and current price. It *proposes* only;
adding to a collection is always an explicit, separate user action.

No paid vision APIs: Tesseract is open-source OCR and the fuzzy match runs locally.
"""

from __future__ import annotations

import io
import re

import pytesseract
from PIL import Image, ImageOps
from rapidfuzz import fuzz, process
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import Card
from app.models.price import CardPriceCurrent
from app.schemas.scan import ScanCandidate, ScanResult
from app.services.cards import select_primary_price

# Collector number like "125/198" (number / set total) or a bare leading number.
_NUMBER_RE = re.compile(r"\b(\d{1,3})\s*/\s*(\d{1,4})\b")
# Keep letters, spaces, and the few punctuation marks that appear in Pokémon names.
_NAME_CLEAN_RE = re.compile(r"[^A-Za-z '\-.]")

# Noise lines that are never a card name.
_STOPWORDS = {
    "hp",
    "basic",
    "stage",
    "stage1",
    "stage2",
    "trainer",
    "energy",
    "pokemon",
    "pokémon",
    "weakness",
    "resistance",
    "retreat",
    "illus",
    "ability",
}


def _preprocess(data: bytes) -> Image.Image:
    """Grayscale + orient + autocontrast + upscale small images for better OCR."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    img = img.convert("L")
    # Tesseract likes larger text; upscale if the card photo is small.
    w, h = img.size
    if max(w, h) < 1000:
        scale = 1000 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)))
    return ImageOps.autocontrast(img)


def _clean_name_line(line: str) -> str:
    return _NAME_CLEAN_RE.sub("", line).strip()


def parse_ocr(text: str) -> tuple[str | None, str | None]:
    """Extract the best-guess card name and collector number from raw OCR text."""
    number: str | None = None
    m = _NUMBER_RE.search(text)
    if m:
        number = m.group(1).lstrip("0") or m.group(1)

    # The name is the strongest alphabetic line — prefer earlier (top of card) lines.
    best: tuple[float, str] | None = None
    for idx, raw in enumerate(text.splitlines()):
        cleaned = _clean_name_line(raw)
        letters = [ch for ch in cleaned if ch.isalpha()]
        if len(letters) < 3:
            continue
        if cleaned.lower().strip() in _STOPWORDS:
            continue
        alpha_ratio = len(letters) / max(len(cleaned), 1)
        if alpha_ratio < 0.6:
            continue
        # Score longer, more-alphabetic, higher-up lines best.
        score = len(letters) * alpha_ratio - idx * 0.5
        if best is None or score > best[0]:
            best = (score, cleaned)

    name = best[1] if best else None
    return name, number


async def _prices_for(session: AsyncSession, card_ids: list[str]) -> dict[str, CardPriceCurrent]:
    """Map card_id -> its primary (TCGPlayer USD) current price row, for the given ids."""
    if not card_ids:
        return {}
    rows = (
        (
            await session.execute(
                select(CardPriceCurrent).where(CardPriceCurrent.card_id.in_(card_ids))
            )
        )
        .scalars()
        .all()
    )
    by_card: dict[str, list[CardPriceCurrent]] = {}
    for r in rows:
        by_card.setdefault(r.card_id, []).append(r)
    return {cid: p for cid in card_ids if (p := select_primary_price(by_card.get(cid, [])))}


async def propose_candidates(
    session: AsyncSession,
    image_bytes: bytes,
    *,
    limit: int = 5,
    min_confidence: float = 0.4,
) -> ScanResult:
    """Return ranked candidate cards for a photo. Empty/low-confidence for poor input."""
    text = pytesseract.image_to_string(_preprocess(image_bytes))
    name, number = parse_ocr(text)

    if not name and not number:
        return ScanResult(detected_name=None, detected_number=None, candidates=[])

    # Lightweight columns only — scoring 15k names must not load ORM rows + prices.
    cols = select(Card.id, Card.name, Card.number, Card.set_id, Card.image_small)
    if number:
        # A collector number narrows the pool to ~one card per set: high precision.
        pool = (await session.execute(cols.where(Card.number == number))).all()
    else:
        pool = []
    if not pool:
        pool = (await session.execute(cols)).all()

    scored: list[tuple[float, tuple]] = []
    if name:
        names = [row.name for row in pool]
        # process.extract is fast over the full name list; map results back to rows.
        matches = process.extract(name, names, scorer=fuzz.WRatio, limit=max(limit * 4, 20))
        idx_by_pos = {i: pool[i] for i in range(len(pool))}
        for _matched_name, score, pos in matches:
            row = idx_by_pos[pos]
            name_score = score / 100.0
            num_match = bool(number and row.number == number)
            if number:
                confidence = 0.6 * name_score + 0.4 * (1.0 if num_match else 0.0)
            else:
                confidence = name_score
            scored.append((confidence, row))
    else:
        # Number only: every pooled row shares the number; rank by set recency-agnostic id.
        for row in pool:
            scored.append((0.5, row))

    scored.sort(key=lambda t: t[0], reverse=True)
    top = [(conf, row) for conf, row in scored if conf >= min_confidence][:limit]

    prices = await _prices_for(session, [row.id for _c, row in top])
    candidates = [
        ScanCandidate(
            card_id=row.id,
            name=row.name,
            set_id=row.set_id,
            number=row.number,
            image_url=row.image_small,
            market_price=(prices[row.id].market if row.id in prices else None),
            currency=(prices[row.id].currency if row.id in prices else None),
            confidence=round(float(conf), 3),
        )
        for conf, row in top
    ]
    return ScanResult(detected_name=name, detected_number=number, candidates=candidates)
