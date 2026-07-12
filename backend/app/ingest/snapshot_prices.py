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

from sqlalchemy import func, select, union
from sqlalchemy.dialects.postgresql import insert

# Import the full model registry so SQLAlchemy can resolve inter-model relationships
# (e.g. CardPriceCurrent.card -> Card) when this job runs standalone via `python -m ...`.
import app.db.base  # noqa: F401
from app.db.session import SessionLocal
from app.models.collection import CollectionEntry
from app.models.portfolio import PortfolioValueDaily
from app.models.price import CardPriceCurrent, PriceHistory
from app.models.wishlist import WishlistItem
from app.services.alerts import detect_and_log_alerts
from app.services.portfolio import compute_portfolio_values_usd

logger = logging.getLogger("app.ingest.snapshot_prices")

# Snapshot only cards someone owns OR wishlists. price_history is consumed for owned-card
# charts + the portfolio series, and now also to detect wishlist price drops; snapshotting
# the whole ~52k-card catalog daily would just burn the Supabase free-tier quota (~30 MB/day).
# Wishlisted cards add negligible volume and keep alert prices fresh.
_tracked = union(
    select(CollectionEntry.card_id.label("card_id")),
    select(WishlistItem.card_id.label("card_id")),
).subquery()
_owned_card_ids = select(_tracked.c.card_id)


def _snapshot_statement():
    """INSERT ... SELECT today's rows from current prices, upserting on the daily key."""
    source = select(
        CardPriceCurrent.card_id,
        CardPriceCurrent.source,
        CardPriceCurrent.variant,
        CardPriceCurrent.market.label("market_price"),
        CardPriceCurrent.currency,
        func.current_date().label("snapshot_date"),
    ).where(
        CardPriceCurrent.market.is_not(None),
        CardPriceCurrent.card_id.in_(_owned_card_ids),
    )

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


async def snapshot_portfolio_values(session) -> int:
    """Upsert today's total portfolio value (USD) for every user who owns cards.

    One row per ``(user_id, today)``; re-running the same day updates in place. Returns the
    number of user rows written. Value uses the canonical USD valuation (EUR converted, PSA
    multiplier applied); unpriced cards contribute 0 and are logged by the valuation service.
    """
    totals, _unpriced = await compute_portfolio_values_usd(session)
    if not totals:
        logger.info("No collections to value — 0 portfolio_value_daily rows.")
        return 0

    today = await session.scalar(select(func.current_date()))
    rows = [
        {"user_id": user_id, "snapshot_date": today, "total_value_usd": total}
        for user_id, total in totals.items()
    ]
    stmt = insert(PortfolioValueDaily).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "snapshot_date"],
        set_={"total_value_usd": stmt.excluded.total_value_usd},
    )
    await session.execute(stmt)
    logger.info("Portfolio snapshot: %d user value rows for %s.", len(rows), today)
    return len(rows)


async def snapshot(*, dry_run: bool = False) -> int:
    """Write (or, in dry-run, count) today's price-history rows. Returns the row count."""
    async with SessionLocal() as session:
        eligible = await session.scalar(
            select(func.count())
            .select_from(CardPriceCurrent)
            .where(
                CardPriceCurrent.market.is_not(None),
                CardPriceCurrent.card_id.in_(_owned_card_ids),
            )
        )
        eligible = eligible or 0
        if dry_run:
            logger.info("%d priced rows eligible for snapshot (dry-run)", eligible)
            return eligible

        await session.execute(_snapshot_statement())
        # Per-user daily portfolio value (the Dashboard "value over time" series reads these).
        await snapshot_portfolio_values(session)
        await session.commit()
        logger.info("Snapshot complete: %d price_history rows for today.", eligible)

        # With fresh prices + today's snapshot in place, fire wishlist price alerts.
        await detect_and_log_alerts(session)
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
