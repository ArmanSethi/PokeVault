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


def _name_band_text(img: Image.Image) -> str:
    """OCR just the card's title band (top strip), where the name lives.

    Reading the name region in isolation avoids the whole-card failure mode where the
    long flavor / Pokédex / attack text outweighs the (short, stylised) name line. Uses
    ``--psm 6`` (a uniform block of text) on a 2x-upscaled crop of the top ~5–22% of the card.
    """
    w, h = img.size
    band = img.crop((0, int(0.05 * h), w, int(0.22 * h)))
    band = band.resize((band.width * 2, band.height * 2))
    try:
        return pytesseract.image_to_string(band, config="--psm 6")
    except pytesseract.TesseractError:
        return ""


def _clean_name_line(line: str) -> str:
    # Collapse runs of whitespace so noisy OCR ("F  Charizard  HP") reads cleanly.
    return " ".join(_NAME_CLEAN_RE.sub("", line).split())


def _name_candidates(text: str, region_bonus: float) -> list[tuple[float, str]]:
    """Score each line as a possible card name. ``region_bonus`` favours lines that came
    from the title-band crop (which are much more likely to be the name)."""
    out: list[tuple[float, str]] = []
    for idx, raw in enumerate(text.splitlines()):
        cleaned = _clean_name_line(raw)
        letters = sum(ch.isalpha() for ch in cleaned)
        if letters < 3 or cleaned.lower() in _STOPWORDS:
            continue
        alpha_ratio = letters / max(len(cleaned), 1)
        if alpha_ratio < 0.5:
            continue
        # Card names are SHORT and near the TOP. Penalise long lines (flavor/attack text,
        # the old bug) and lines further down; reward clean, mostly-alphabetic short lines.
        length_penalty = max(0, letters - 18) * 1.5
        position_penalty = idx * 2.0
        score = (
            alpha_ratio * 5 + min(letters, 18) + region_bonus - length_penalty - position_penalty
        )
        out.append((score, cleaned))
    return out


def parse_ocr(text: str, name_hint: str | None = None) -> tuple[str | None, str | None]:
    """Extract the best-guess card name and collector number from OCR text.

    ``text`` is the full-card OCR; ``name_hint`` (optional) is OCR of just the title band.
    The collector number is read strictly as ``N/M`` from the full text — if it can't be
    read cleanly it stays ``None`` (a *wrong* number is worse than none, since it would
    narrow matching to the wrong card).
    """
    number: str | None = None
    m = _NUMBER_RE.search(text)
    if m:
        number = m.group(1).lstrip("0") or m.group(1)

    candidates = _name_candidates(text, 0.0)
    if name_hint:
        candidates += _name_candidates(name_hint, region_bonus=20.0)
    if not candidates:
        return None, number
    candidates.sort(key=lambda t: t[0], reverse=True)
    # Drop stopword tokens ("HP", "Stage", ...) that ride along on the OCR'd name line.
    tokens = [t for t in candidates[0][1].split() if t.lower() not in _STOPWORDS]
    name = " ".join(tokens) or candidates[0][1]
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
    img = _preprocess(image_bytes)
    text = pytesseract.image_to_string(img)
    name, number = parse_ocr(text, _name_band_text(img))

    if not name and not number:
        return ScanResult(detected_name=None, detected_number=None, candidates=[])

    # Fuzzy-match the OCR read-out against the catalog (shared with CSV import).
    matches = await match_card(session, name, number, limit=limit, min_confidence=min_confidence)

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
