"""Map pokemontcg.io v2 JSON payloads onto ORM column values.

Kept free of DB/session concerns so it is trivially unit-testable.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any


def parse_api_date(value: str | None) -> date | None:
    """Parse pokemontcg.io date strings (``YYYY/MM/DD``, tolerant of ``-``)."""
    if not value:
        return None
    for fmt in ("%Y/%m/%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def set_to_values(s: dict[str, Any]) -> dict[str, Any]:
    """Set payload → ``sets`` column values."""
    images = s.get("images") or {}
    return {
        "id": s["id"],
        "name": s.get("name"),
        "series": s.get("series"),
        "printed_total": s.get("printedTotal"),
        "total": s.get("total"),
        "release_date": parse_api_date(s.get("releaseDate")),
        "ptcgo_code": s.get("ptcgoCode"),
        "symbol_url": images.get("symbol"),
        "logo_url": images.get("logo"),
    }


def card_to_values(c: dict[str, Any]) -> dict[str, Any]:
    """Card payload → ``cards`` column values (stores the full payload in raw_json)."""
    images = c.get("images") or {}
    tcgplayer = c.get("tcgplayer") or {}
    cardmarket = c.get("cardmarket") or {}
    return {
        "id": c["id"],
        "set_id": (c.get("set") or {}).get("id"),
        "name": c.get("name"),
        "number": c.get("number"),
        "supertype": c.get("supertype"),
        "subtypes": c.get("subtypes"),
        "rarity": c.get("rarity"),
        "artist": c.get("artist"),
        "image_small": images.get("small"),
        "image_large": images.get("large"),
        "national_pokedex_numbers": c.get("nationalPokedexNumbers"),
        "tcgplayer_url": tcgplayer.get("url"),
        "cardmarket_url": cardmarket.get("url"),
        "raw_json": c,
    }


def _cm_base_variant(rarity: str | None) -> str:
    """Cardmarket has no variant breakdown; its main price tracks the card's BASE printing.

    Align that base row with the TCGplayer base variant so the two markets pair per variant:
    a holo rarity's base printing is the holofoil; everything else is normal.
    """
    return "holofoil" if "holo" in (rarity or "").lower() else "normal"


def price_rows_from_card(c: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract ``card_prices_current`` rows from a card's price blocks.

    - tcgplayer: one row per variant (normal, holofoil, reverseHolofoil, …), USD, from ``market``.
    - cardmarket: no variant breakdown, so map its main price (``trendPrice``, else
      ``averageSellPrice``) onto the card's BASE variant (holofoil for holo rarities, else normal)
      so it pairs with the
      TCGplayer base row; also emit a ``reverseHolofoil`` row from the ``reverseHolo*`` fields when
      Cardmarket carries them. EUR.
    """
    card_id = c["id"]
    rows: list[dict[str, Any]] = []

    tcgplayer = c.get("tcgplayer") or {}
    for variant, prices in (tcgplayer.get("prices") or {}).items():
        if not isinstance(prices, dict):
            continue
        rows.append(
            {
                "card_id": card_id,
                "source": "tcgplayer",
                "variant": variant,
                "low": prices.get("low"),
                "mid": prices.get("mid"),
                "high": prices.get("high"),
                "market": prices.get("market"),
                "direct_low": prices.get("directLow"),
                "currency": "USD",
            }
        )

    cardmarket = c.get("cardmarket") or {}
    cm_prices = cardmarket.get("prices") or {}
    if cm_prices:
        market = cm_prices.get("trendPrice")
        if market is None:
            market = cm_prices.get("averageSellPrice")
        rows.append(
            {
                "card_id": card_id,
                "source": "cardmarket",
                "variant": _cm_base_variant(c.get("rarity")),
                "low": cm_prices.get("lowPrice"),
                "mid": None,
                "high": None,
                "market": market,
                "direct_low": None,
                "currency": "EUR",
            }
        )
        # Reverse-holo sub-prices, when Cardmarket carries them (0.0 means "not applicable").
        rev_market = cm_prices.get("reverseHoloTrend") or cm_prices.get("reverseHoloSell")
        rev_low = cm_prices.get("reverseHoloLow")
        if (rev_market and rev_market > 0) or (rev_low and rev_low > 0):
            rows.append(
                {
                    "card_id": card_id,
                    "source": "cardmarket",
                    "variant": "reverseHolofoil",
                    "low": rev_low if rev_low and rev_low > 0 else None,
                    "mid": None,
                    "high": None,
                    "market": rev_market if rev_market and rev_market > 0 else None,
                    "direct_low": None,
                    "currency": "EUR",
                }
            )

    return rows


def history_rows_from_card(c: dict[str, Any]) -> list[dict[str, Any]]:
    """Derive ``price_history`` rows (one market observation per source / variant).

    Reuses ``price_rows_from_card`` and keeps only rows that carry a market price.
    ``snapshot_date`` is left to the writer (set to the DB's current date).
    """
    return [
        {
            "card_id": row["card_id"],
            "source": row["source"],
            "variant": row["variant"],
            "market_price": row["market"],
            "currency": row["currency"],
        }
        for row in price_rows_from_card(c)
        if row["market"] is not None
    ]
