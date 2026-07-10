"""Fuzzy catalog matching — map a free-text card name + collector number to catalog cards.

Extracted from the OCR scan pipeline so it can be reused by CSV import. This module owns
*only* the matching (name/number -> ranked catalog candidates); OCR (see ``services/scan.py``)
and pricing (see ``services/cards.py``) stay separate. The scoring is intentionally identical
to the original in-scan logic so scan behavior is unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass

from rapidfuzz import fuzz, process
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import Card


@dataclass
class CardMatch:
    """A catalog card proposed as a match, with a 0..1 confidence score."""

    card_id: str
    name: str
    set_id: str
    number: str
    image_url: str | None
    confidence: float


async def match_card(
    session: AsyncSession,
    name: str | None,
    number: str | None,
    *,
    set_id: str | None = None,
    limit: int = 5,
    min_confidence: float = 0.4,
) -> list[CardMatch]:
    """Return ranked catalog candidates for a card name + collector number.

    A collector ``number`` narrows the pool to ~one card per set (high precision); an
    optional ``set_id`` narrows it further (used by import, which knows the set). With
    neither a name nor a number, returns an empty list. Scoring blends the fuzzy name score
    with a number-match bonus, mirroring the OCR scan's original behavior.
    """
    if not name and not number:
        return []

    # Lightweight columns only — scoring ~20k names must not load ORM rows.
    cols = select(Card.id, Card.name, Card.number, Card.set_id, Card.image_small)
    if set_id:
        cols = cols.where(Card.set_id == set_id)

    if number:
        # A collector number narrows the pool to ~one card per set: high precision.
        pool = (await session.execute(cols.where(Card.number == number))).all()
    else:
        pool = []
    if not pool:
        pool = (await session.execute(cols)).all()

    scored: list[tuple[float, object]] = []
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
        # Number only: every pooled row shares the number; assign a flat mid confidence.
        for row in pool:
            scored.append((0.5, row))

    scored.sort(key=lambda t: t[0], reverse=True)
    top = [(conf, row) for conf, row in scored if conf >= min_confidence][:limit]

    return [
        CardMatch(
            card_id=row.id,
            name=row.name,
            set_id=row.set_id,
            number=row.number,
            image_url=row.image_small,
            confidence=round(float(conf), 3),
        )
        for conf, row in top
    ]
