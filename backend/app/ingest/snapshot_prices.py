"""Daily price-history snapshot job.

pokemontcg.io's free feed has no price history, so PokéVault takes its own: this job
copies the current snapshot (``card_prices_current``) into ``price_history`` with today's
date. It is DB-only (no API calls) and idempotent — one row per card/source/variant/day —
so it is safe to run on a daily cron and to re-run within the same day.

Usage:
    python -m app.ingest.snapshot_prices            # write today's snapshot
    python -m app.ingest.snapshot_prices --dry-run  # count eligible rows, write nothing
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app.db.session import SessionLocal
from app.models.price import CardPriceCurrent, PriceHistory

logger = logging.getLogger("app.ingest.snapshot_prices")


def _snapshot_statement():
    """INSERT ... SELECT today's rows from current prices, upserting on the daily key."""
    source = select(
        CardPriceCurrent.card_id,
        CardPriceCurrent.source,
        CardPriceCurrent.variant,
        CardPriceCurrent.market.label("market_price"),
        CardPriceCurrent.currency,
        func.current_date().label("snapshot_date"),
    ).where(CardPriceCurrent.market.is_not(None))

    stmt = insert(PriceHistory).from_select(
        ["card_id", "source", "variant", "market_price", "currency", "snapshot_date"],
        source,
    )
    return stmt.on_conflict_do_update(
        constraint="uq_price_history_card_source_variant_day",
        set_={
            "market_price": stmt.excluded.market_price,
            "currency": stmt.excluded.currency,
        },
    )


async def snapshot(*, dry_run: bool = False) -> int:
    """Write (or, in dry-run, count) today's price-history rows. Returns the row count."""
    async with SessionLocal() as session:
        eligible = await session.scalar(
            select(func.count())
            .select_from(CardPriceCurrent)
            .where(CardPriceCurrent.market.is_not(None))
        )
        eligible = eligible or 0
        if dry_run:
            logger.info("%d priced rows eligible for snapshot (dry-run)", eligible)
            return eligible

        await session.execute(_snapshot_statement())
        await session.commit()
        logger.info("Snapshot complete: %d price_history rows for today.", eligible)
        return eligible


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m app.ingest.snapshot_prices",
        description="Snapshot current prices into daily price history.",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Count eligible rows without writing."
    )
    parser.add_argument("--log-level", default="INFO", help="Logging level (default INFO).")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    logging.basicConfig(
        level=args.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    asyncio.run(snapshot(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
