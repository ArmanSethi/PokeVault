"""CSV collection import/export.

Import is a two-step, non-destructive flow: ``preview_import`` parses an uploaded CSV
(Collectr / TCG Collector / generic layouts), fuzzy-matches each row against the catalog via
``services/matching.py``, and returns a reconciliation the user can correct; a separate
confirm step (the endpoint, via ``services/collection.add_or_increment``) actually writes.

Export streams the user's collection back out as CSV that round-trips through import.
"""

from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.card import Card, Set
from app.models.collection import CollectionEntry
from app.schemas.importer import ImportCandidate, ImportPreview, ImportRow
from app.services.cards import market_price_for_entry
from app.services.matching import match_card

# Column-name synonyms → canonical field. Headers are lowercased/stripped before lookup, so
# a wide range of Collectr / TCG Collector / generic exports map onto the same fields.
_COLUMN_SYNONYMS: dict[str, str] = {
    "name": "name",
    "card": "name",
    "card name": "name",
    "product name": "name",
    "productname": "name",
    "number": "number",
    "card number": "number",
    "collector number": "number",
    "cardnumber": "number",
    "no": "number",
    "no.": "number",
    "#": "number",
    "set": "set",
    "set name": "set",
    "expansion": "set",
    "setname": "set",
    "series": "set",
    "quantity": "quantity",
    "qty": "quantity",
    "count": "quantity",
    "amount": "quantity",
    "condition": "condition",
    "cond": "condition",
    "foil": "foil",
    "printing": "foil",
    "finish": "foil",
    "is foil": "foil",
    "variant": "foil",
    "holo": "foil",
    "price": "price",
    "paid": "price",
    "price paid": "price",
    "acquired price": "price",
    "purchase price": "price",
    "cost": "price",
    "market price": "price",
}

# Confidence thresholds for auto-classifying a matched row.
_STRONG = 0.9  # top candidate at/above this → "matched"
_LEAD = 0.1  # …and clearly ahead of the runner-up
_VIABLE = 0.6  # below this even the best candidate is too weak to be a real match → "unmatched"


@dataclass
class ParsedRow:
    """A CSV row reduced to import intent (no catalog lookup yet)."""

    row_index: int
    name: str | None = None
    number: str | None = None
    set_name: str | None = None
    quantity: int = 1
    condition: str | None = None
    is_foil: bool = False
    acquired_price: Decimal | None = None
    extras: dict[str, str] = field(default_factory=dict)


def _norm_header(h: str) -> str:
    return h.strip().lower()


def _parse_int(value: str | None, default: int = 1) -> int:
    if not value:
        return default
    try:
        n = int(float(value.strip()))
        return n if n >= 1 else default
    except (ValueError, AttributeError):
        return default


def _parse_price(value: str | None) -> Decimal | None:
    if not value:
        return None
    cleaned = value.strip().lstrip("$€£").replace(",", "")
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def _parse_foil(value: str | None) -> bool:
    if not value:
        return False
    v = value.strip().lower()
    if v in {"", "no", "false", "0", "normal", "non-foil", "nonfoil", "regular"}:
        return False
    return any(tok in v for tok in ("foil", "holo", "reverse", "yes", "true", "1"))


def _clean_number(value: str | None) -> str | None:
    """Reduce a collector-number cell to the bare printed number (e.g. '125/198' -> '125')."""
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    head = raw.split("/", 1)[0].strip()
    head = head.lstrip("0") or head  # keep at least one digit for '0'
    return head or None


def parse_csv(data: bytes) -> list[ParsedRow]:
    """Parse CSV bytes into ``ParsedRow`` intent. Pure — no catalog/DB access.

    Unknown columns are preserved in ``extras``. Missing/garbled cells degrade gracefully
    (quantity defaults to 1, price to None) rather than raising.
    """
    text = data.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        return []

    # Map each real header to its canonical field (first synonym wins per canonical name).
    header_map: dict[str, str] = {}
    for h in reader.fieldnames:
        canon = _COLUMN_SYNONYMS.get(_norm_header(h))
        if canon and canon not in header_map.values():
            header_map[h] = canon

    rows: list[ParsedRow] = []
    for idx, raw in enumerate(reader):
        fields: dict[str, str] = {}
        extras: dict[str, str] = {}
        for key, val in raw.items():
            if key is None:
                continue
            canon = header_map.get(key)
            if canon:
                fields[canon] = (val or "").strip()
            elif val:
                extras[_norm_header(key)] = val.strip()

        name = fields.get("name") or None
        number = _clean_number(fields.get("number"))
        # A name/number-only export sometimes crams the number into the name; leave as-is.
        if not name and not number:
            continue  # blank line — skip
        rows.append(
            ParsedRow(
                row_index=idx,
                name=name,
                number=number,
                set_name=fields.get("set") or None,
                quantity=_parse_int(fields.get("quantity")),
                condition=fields.get("condition") or None,
                is_foil=_parse_foil(fields.get("foil")),
                acquired_price=_parse_price(fields.get("price")),
                extras=extras,
            )
        )
    return rows


def _classify(candidates: list[ImportCandidate]) -> tuple[str, str | None]:
    """Decide a row's status from its ranked candidates. Pure."""
    if not candidates:
        return "unmatched", None
    top = candidates[0]
    # A best candidate below the viability floor means the fuzzy matcher only found weak,
    # coincidental name overlaps (e.g. a junk row) — surface it as unmatched, not a suggestion.
    if top.confidence < _VIABLE:
        return "unmatched", None
    runner = candidates[1].confidence if len(candidates) > 1 else 0.0
    if top.confidence >= _STRONG and (top.confidence - runner) >= _LEAD:
        return "matched", top.card_id
    return "ambiguous", None


async def _resolve_set_id(session: AsyncSession, set_name: str | None) -> str | None:
    """Best-effort map a CSV set name to a catalog set id (exact-ish, case-insensitive)."""
    if not set_name:
        return None
    stmt = select(Set.id).where(Set.name.ilike(set_name.strip())).limit(1)
    exact = (await session.execute(stmt)).scalar_one_or_none()
    if exact:
        return exact
    # Fall back to a contains match (handles "Base" vs "Base Set" style differences).
    stmt = select(Set.id).where(Set.name.ilike(f"%{set_name.strip()}%")).limit(1)
    return (await session.execute(stmt)).scalar_one_or_none()


async def preview_import(session: AsyncSession, data: bytes) -> ImportPreview:
    """Parse + reconcile a CSV against the catalog. Writes nothing."""
    parsed = parse_csv(data)
    rows: list[ImportRow] = []
    counts = {"matched": 0, "ambiguous": 0, "unmatched": 0}

    for pr in parsed:
        set_id = await _resolve_set_id(session, pr.set_name)
        matches = await match_card(session, pr.name, pr.number, set_id=set_id, limit=5)
        candidates = [
            ImportCandidate(
                card_id=m.card_id,
                name=m.name,
                set_id=m.set_id,
                number=m.number,
                image_url=m.image_url,
                confidence=m.confidence,
            )
            for m in matches
        ]
        status, selected = _classify(candidates)
        counts[status] += 1
        rows.append(
            ImportRow(
                row_index=pr.row_index,
                name=pr.name,
                number=pr.number,
                set_name=pr.set_name,
                quantity=pr.quantity,
                condition=pr.condition,
                is_foil=pr.is_foil,
                acquired_price=pr.acquired_price,
                status=status,
                candidates=candidates,
                selected_card_id=selected,
            )
        )

    return ImportPreview(
        rows=rows,
        matched=counts["matched"],
        ambiguous=counts["ambiguous"],
        unmatched=counts["unmatched"],
        total=len(rows),
    )


# Export column order — chosen so a re-import round-trips cleanly through parse_csv.
_EXPORT_HEADER = [
    "name",
    "set",
    "number",
    "quantity",
    "condition",
    "grade",
    "foil",
    "acquired_price",
    "market_price",
    "market_value",
]


async def export_csv(session: AsyncSession, user_id: uuid.UUID) -> str:
    """Serialize a user's collection to CSV text (with current market valuation)."""
    stmt = (
        select(CollectionEntry)
        .where(CollectionEntry.user_id == user_id)
        .options(selectinload(CollectionEntry.card).selectinload(Card.prices_current))
        .order_by(CollectionEntry.id)
    )
    entries = (await session.execute(stmt)).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_EXPORT_HEADER)
    for e in entries:
        unit = market_price_for_entry(e.card.prices_current, is_foil=e.is_foil)
        value = unit * e.quantity if unit is not None else None
        writer.writerow(
            [
                e.card.name if e.card else "",
                e.card.set_id if e.card else "",
                e.card.number if e.card else "",
                e.quantity,
                e.condition or "",
                e.grade or "",
                "foil" if e.is_foil else "normal",
                e.acquired_price if e.acquired_price is not None else "",
                unit if unit is not None else "",
                value if value is not None else "",
            ]
        )
    return buf.getvalue()
