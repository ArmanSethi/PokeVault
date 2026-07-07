# Assumption: pokemontcg.io's catalog is treated as the English catalog. The v2
# API does not expose non-English printings, so every set, card, and price ingested
# here represents the English release.
"""Sync the full pokemontcg.io catalog (sets, cards, current prices) into Postgres.

Idempotent: every write is an ``INSERT ... ON CONFLICT DO UPDATE``, so re-running is
safe and simply refreshes rows. Work is committed per set, and sets are processed in
a stable id order, so an interrupted run resumes cleanly (optionally jump ahead with
``--start-at``).

Usage:
    python -m app.ingest.sync_catalog                 # full sync
    python -m app.ingest.sync_catalog --start-at sv3  # resume from a set id
    python -m app.ingest.sync_catalog --sets sv3,sv4  # only these sets
    python -m app.ingest.sync_catalog --dry-run       # fetch + map, no DB writes
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionLocal
from app.ingest import mappers
from app.ingest.client import PokemonTcgClient
from app.models.card import Card, Set
from app.models.price import CardPriceCurrent, PriceHistory

logger = logging.getLogger("app.ingest.sync_catalog")


async def _upsert_set(session: AsyncSession, values: dict) -> None:
    stmt = insert(Set).values(**values)
    update = {k: getattr(stmt.excluded, k) for k in values if k != "id"}
    await session.execute(stmt.on_conflict_do_update(index_elements=[Set.id], set_=update))


async def _upsert_card(session: AsyncSession, values: dict) -> None:
    stmt = insert(Card).values(**values)
    update = {k: getattr(stmt.excluded, k) for k in values if k != "id"}
    await session.execute(stmt.on_conflict_do_update(index_elements=[Card.id], set_=update))


async def _upsert_price(session: AsyncSession, values: dict) -> None:
    # Stamp updated_at on both insert and update so "current" always means latest.
    values = {**values, "updated_at": func.now()}
    key = ("card_id", "source", "variant")
    stmt = insert(CardPriceCurrent).values(**values)
    update = {k: getattr(stmt.excluded, k) for k in values if k not in key}
    await session.execute(stmt.on_conflict_do_update(index_elements=list(key), set_=update))


async def _upsert_price_history(session: AsyncSession, values: dict) -> None:
    # One market observation per (card, source, variant, day). Re-running on the same
    # day refreshes today's row; distinct days accumulate for trend charts.
    values = {**values, "snapshot_date": func.current_date()}
    key = ("card_id", "source", "variant", "snapshot_date")
    stmt = insert(PriceHistory).values(**values)
    update = {k: getattr(stmt.excluded, k) for k in values if k not in key}
    await session.execute(
        stmt.on_conflict_do_update(
            constraint="uq_price_history_card_source_variant_day", set_=update
        )
    )


async def sync(
    *,
    start_at: str | None = None,
    only_sets: list[str] | None = None,
    dry_run: bool = False,
    page_size: int = 250,
) -> None:
    async with PokemonTcgClient(page_size=page_size) as client:
        logger.info("Fetching set list...")
        sets = [s async for s in client.iter_sets()]
        sets.sort(key=lambda s: s.get("id", ""))
        if only_sets:
            wanted = set(only_sets)
            sets = [s for s in sets if s.get("id") in wanted]
        total = len(sets)
        logger.info("Discovered %d sets%s", total, " (dry-run)" if dry_run else "")

        reached = start_at is None
        for i, s in enumerate(sets, start=1):
            set_id = s["id"]
            if not reached:
                if set_id == start_at:
                    reached = True
                else:
                    logger.info("[%d/%d] %s - skipped (before --start-at)", i, total, set_id)
                    continue

            cards = [c async for c in client.iter_cards(set_id)]

            if dry_run:
                price_rows = sum(len(mappers.price_rows_from_card(c)) for c in cards)
                history_rows = sum(len(mappers.history_rows_from_card(c)) for c in cards)
                logger.info(
                    "[%d/%d] %s %s - %d cards, %d price rows, %d history rows (dry-run)",
                    i,
                    total,
                    set_id,
                    s.get("name"),
                    len(cards),
                    price_rows,
                    history_rows,
                )
                continue

            n_prices = 0
            n_history = 0
            async with SessionLocal() as session:
                await _upsert_set(session, mappers.set_to_values(s))
                for c in cards:
                    await _upsert_card(session, mappers.card_to_values(c))
                    for row in mappers.price_rows_from_card(c):
                        await _upsert_price(session, row)
                        n_prices += 1
                    for hrow in mappers.history_rows_from_card(c):
                        await _upsert_price_history(session, hrow)
                        n_history += 1
                await session.commit()

            logger.info(
                "[%d/%d] %s %s - %d cards, %d price rows, %d history rows",
                i,
                total,
                set_id,
                s.get("name"),
                len(cards),
                n_prices,
                n_history,
            )

    logger.info("Catalog sync complete.")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m app.ingest.sync_catalog",
        description="Sync the pokemontcg.io catalog and current prices into the database.",
    )
    parser.add_argument(
        "--start-at", metavar="SET_ID", help="Resume from this set id (sorted by id)."
    )
    parser.add_argument("--sets", help="Comma-separated set ids to limit the sync to.")
    parser.add_argument("--page-size", type=int, default=250, help="API page size (max 250).")
    parser.add_argument(
        "--dry-run", action="store_true", help="Fetch and map but do not write to the DB."
    )
    parser.add_argument("--log-level", default="INFO", help="Logging level (default INFO).")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    logging.basicConfig(
        level=args.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    only_sets = [x.strip() for x in args.sets.split(",") if x.strip()] if args.sets else None
    asyncio.run(
        sync(
            start_at=args.start_at,
            only_sets=only_sets,
            dry_run=args.dry_run,
            page_size=args.page_size,
        )
    )


if __name__ == "__main__":
    main()
