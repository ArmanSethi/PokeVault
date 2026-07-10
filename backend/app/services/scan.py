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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.price import CardPriceCurrent
from app.schemas.scan import ScanCandidate, ScanResult
from app.services.cards import select_primary_price
from app.services.matching import match_card

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

    # Fuzzy-match the OCR read-out against the catalog (shared with CSV import).
    matches = await match_card(
        session, name, number, limit=limit, min_confidence=min_confidence
    )

    prices = await _prices_for(session, [m.card_id for m in matches])
    candidates = [
        ScanCandidate(
            card_id=m.card_id,
            name=m.name,
            set_id=m.set_id,
            number=m.number,
            image_url=m.image_url,
            market_price=(prices[m.card_id].market if m.card_id in prices else None),
            currency=(prices[m.card_id].currency if m.card_id in prices else None),
            confidence=m.confidence,
        )
        for m in matches
    ]
    return ScanResult(detected_name=name, detected_number=number, candidates=candidates)
