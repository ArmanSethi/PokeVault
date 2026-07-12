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

from app.models.card import Card, Set


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

    # Lightweight columns only — scoring ~20k names must not load ORM rows. release_date
    # (joined from Set) is a tiebreak for the name-only fallback below.
    cols = select(
        Card.id, Card.name, Card.number, Card.set_id, Card.image_small, Set.release_date
    ).join(Set, Card.set_id == Set.id)
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
    if name and number:
        # Number narrows the pool; blend the fuzzy name score with a number-match bonus.
        names = [row.name for row in pool]
        matches = process.extract(name, names, scorer=fuzz.WRatio, limit=max(limit * 4, 20))
        for _matched_name, score, pos in matches:
            row = pool[pos]
            name_score = score / 100.0
            num_match = row.number == number
            confidence = 0.6 * name_score + 0.4 * (1.0 if num_match else 0.0)
            scored.append((confidence, row))
    elif name:
        # Name-only fallback (OCR missed the collector number). Many cards can share a name
        # (e.g. dozens of "Charizard"), so a pure fuzzy score ties them all at one value and,
        # with a small top-K cut, drops the printing the user actually has. Score the WHOLE
        # pool and add a small set-age tiebreak: identical-name cards then get distinct scores
        # and the earliest/iconic printing surfaces instead of an arbitrary 5 tying at 0.90.
        names = [row.name for row in pool]
        matches = process.extract(name, names, scorer=fuzz.WRatio, limit=None)
        cand = [(pool[pos], score / 100.0) for _matched_name, score, pos in matches]
        dated = [r.release_date for r, _ in cand if r.release_date is not None]
        if dated and max(dated) != min(dated):
            newest, oldest = max(dated), min(dated)
            span = (newest - oldest).days or 1

            def age_bonus(r) -> float:
                # Older printing -> higher bonus (1.0 oldest .. 0.0 newest); unknown date -> 0.
                return (newest - r.release_date).days / span if r.release_date else 0.0
        else:

            def age_bonus(_r) -> float:
                return 0.0

        for row, name_score in cand:
            # Name dominates; age only breaks ties among same/similar names (max 0.1 shift).
            scored.append((0.9 * name_score + 0.1 * age_bonus(row), row))
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
