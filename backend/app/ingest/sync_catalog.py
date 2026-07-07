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


def _dedupe(rows: list[dict], key: tuple[str, ...]) -> list[dict]:
    """Keep the last row per conflict key.

    A single ``INSERT ... ON CONFLICT DO UPDATE`` statement cannot touch the same target
    row twice, so any intra-batch key collision must be collapsed before the upsert.
    """
    seen: dict[tuple, dict] = {}
    for r in rows:
        seen[tuple(r[k] for k in key)] = r
    return list(seen.values())


async def _upsert_sets(session: AsyncSession, rows: list[dict]) -> None:
    if not rows:
        return
    rows = _dedupe(rows, ("id",))
    stmt = insert(Set).values(rows)
    update = {k: getattr(stmt.excluded, k) for k in rows[0] if k != "id"}
    await session.execute(stmt.on_conflict_do_update(index_elements=[Set.id], set_=update))


async def _upsert_cards(session: AsyncSession, rows: list[dict]) -> None:
    if not rows:
        return
    rows = _dedupe(rows, ("id",))
    stmt = insert(Card).values(rows)
    update = {k: getattr(stmt.excluded, k) for k in rows[0] if k != "id"}
    await session.execute(stmt.on_conflict_do_update(index_elements=[Card.id], set_=update))


async def _upsert_prices(session: AsyncSession, rows: list[dict]) -> None:
    # Stamp updated_at on both insert and update so "current" always means latest.
    key = ("card_id", "source", "variant")
    if not rows:
        return
    rows = [{**r, "updated_at": func.now()} for r in _dedupe(rows, key)]
    stmt = insert(CardPriceCurrent).values(rows)
    update = {k: getattr(stmt.excluded, k) for k in rows[0] if k not in key}
    await session.execute(stmt.on_conflict_do_update(index_elements=list(key), set_=update))


async def _upsert_price_history(session: AsyncSession, rows: list[dict]) -> None:
    # One market observation per (card, source, variant, day). Re-running on the same
    # day refreshes today's row; distinct days accumulate for trend charts.
    key = ("card_id", "source", "variant", "snapshot_date")
    if not rows:
        return
    rows = [{**r, "snapshot_date": func.current_date()} for r in rows]
    # Dedupe by the full conflict key (snapshot_date is uniform within a run).
    rows = _dedupe(rows, ("card_id", "source", "variant"))
    stmt = insert(PriceHistory).values(rows)
    update = {k: getattr(stmt.excluded, k) for k in rows[0] if k not in key}
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

        # Respect --start-at by trimming the head of the (sorted) set list.
        if start_at is not None:
            idx = next((k for k, s in enumerate(sets) if s["id"] == start_at), None)
            if idx is None:
                logger.warning("--start-at %s not found; processing all sets", start_at)
            else:
                sets = sets[idx:]
                total = len(sets)

        async def process_set(s: dict, i: int, total_n: int) -> None:
            """Fetch + upsert one set. Raises on failure so the caller can retry/skip."""
            set_id = s["id"]
            cards = [c async for c in client.iter_cards(set_id)]

            price_rows: list[dict] = []
            history_rows: list[dict] = []
            for c in cards:
                price_rows.extend(mappers.price_rows_from_card(c))
                history_rows.extend(mappers.history_rows_from_card(c))

            if dry_run:
                logger.info(
                    "[%d/%d] %s %s - %d cards, %d price rows, %d history rows (dry-run)",
                    i,
                    total_n,
                    set_id,
                    s.get("name"),
                    len(cards),
                    len(price_rows),
                    len(history_rows),
                )
                return

            # Batch per set: a handful of multi-row upserts instead of thousands of
            # per-row round-trips over the pooler. Still idempotent and committed per set.
            async with SessionLocal() as session:
                await _upsert_sets(session, [mappers.set_to_values(s)])
                await _upsert_cards(session, [mappers.card_to_values(c) for c in cards])
                await _upsert_prices(session, price_rows)
                await _upsert_price_history(session, history_rows)
                await session.commit()

            logger.info(
                "[%d/%d] %s %s - %d cards, %d price rows, %d history rows",
                i,
                total_n,
                set_id,
                s.get("name"),
                len(cards),
                len(price_rows),
                len(history_rows),
            )

        # Process each set independently. The pokemontcg.io API intermittently returns
        # transient 404s / timeouts under load, so a single set's failure must not abort
        # the whole run — record it and retry once at the end.
        failed: list[dict] = []
        for i, s in enumerate(sets, start=1):
            try:
                await process_set(s, i, total)
            except Exception as exc:  # noqa: BLE001 - keep going; one bad set != whole catalog
                logger.warning(
                    "[%d/%d] %s - FAILED (%s); will retry at end", i, total, s["id"], exc
                )
                failed.append(s)

        if failed:
            logger.info("Retrying %d failed set(s)...", len(failed))
            retry, failed = failed, []
            for j, s in enumerate(retry, start=1):
                try:
                    await process_set(s, j, len(retry))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Retry FAILED for %s (%s)", s["id"], exc)
                    failed.append(s)

        if failed:
            logger.warning(
                "%d set(s) still unsynced: %s", len(failed), ", ".join(s["id"] for s in failed)
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
