"""On-demand single-card price refresh.

The daily GitHub Actions job keeps the whole catalog fresh; this powers the "refresh price"
button on a card. It re-fetches ONE card from pokemontcg.io (licensed, via the ingest client —
no scraping) and upserts its current prices + card metadata. History stays a daily concern.

Rate-limited per user (a small in-memory cooldown) so the button can't hammer the upstream API.
"""

from __future__ import annotations

import time
import uuid

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingest import mappers
from app.ingest.client import PokemonTcgClient, PokemonTcgError
from app.models.card import Card
from app.models.price import CardPriceCurrent
from app.schemas.card import CardRead
from app.services import cards as cards_service

# Per-user cooldown between manual refreshes (seconds). In-memory + per-process — fine for a
# free-tier single/low-worker deploy; the daily job is the real freshness guarantee.
REFRESH_COOLDOWN_SECONDS = 20.0
_last_refresh: dict[uuid.UUID, float] = {}


class RefreshCoolingDown(Exception):
    """Raised when a user refreshes again before their cooldown elapses."""

    def __init__(self, retry_after: int) -> None:
        super().__init__(f"retry after {retry_after}s")
        self.retry_after = retry_after


class RefreshUnavailable(Exception):
    """The upstream API failed or has no such card."""


def _check_cooldown(user_id: uuid.UUID) -> None:
    now = time.monotonic()
    last = _last_refresh.get(user_id)
    if last is not None and (elapsed := now - last) < REFRESH_COOLDOWN_SECONDS:
        raise RefreshCoolingDown(retry_after=max(1, int(REFRESH_COOLDOWN_SECONDS - elapsed)))
    _last_refresh[user_id] = now


async def _upsert_prices(session: AsyncSession, rows: list[dict]) -> None:
    if not rows:
        return
    key = ("card_id", "source", "variant")
    rows = [{**r, "updated_at": func.now()} for r in rows]
    stmt = insert(CardPriceCurrent).values(rows)
    update = {k: getattr(stmt.excluded, k) for k in rows[0] if k not in key}
    await session.execute(stmt.on_conflict_do_update(index_elements=list(key), set_=update))


async def refresh_card(session: AsyncSession, user_id: uuid.UUID, card_id: str) -> CardRead | None:
    """Re-fetch one card's prices from pokemontcg.io and upsert them.

    Returns the updated card, or None if the card isn't in our catalog. Raises
    ``RefreshCoolingDown`` / ``RefreshUnavailable``.
    """
    if await session.get(Card, card_id) is None:
        return None
    _check_cooldown(user_id)

    # Interactive path: fail fast rather than hang. Few retries + short timeout so a rate-limited
    # upstream returns a prompt "try again shortly" (the daily job is the real freshness guarantee).
    try:
        async with PokemonTcgClient(max_retries=2, timeout=10.0) as client:
            payload = await client.get_card(card_id)
    except PokemonTcgError as exc:
        raise RefreshUnavailable(str(exc)) from exc
    if payload is None:
        raise RefreshUnavailable(f"upstream has no card {card_id}")

    # Refresh current prices + the stored payload (raw_json / urls); leave catalog identity as-is.
    await _upsert_prices(session, mappers.price_rows_from_card(payload))
    values = mappers.card_to_values(payload)
    card = await session.get(Card, card_id)
    if card is not None:
        card.raw_json = values["raw_json"]
        card.tcgplayer_url = values["tcgplayer_url"]
        card.cardmarket_url = values["cardmarket_url"]
    await session.commit()
    return await cards_service.get_card(session, card_id)
