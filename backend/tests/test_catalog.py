"""Integration tests for the read-only catalog API: /sets and /cards.

Catalog reads are unauthenticated, but we use the ``auth_client`` fixture because it
overrides ``get_session`` with the rolled-back test session (so seeded rows are visible
and nothing persists). The live DB may already hold committed catalog rows (sv3, base
sets, …), so every assertion is scoped to a unique seeded set id (``zzt1``) and uses the
``set_id`` filter to isolate results deterministically.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.core.config import settings
from app.models.card import Card, Set
from app.models.price import CardPriceCurrent

_SETS = f"{settings.API_V1_PREFIX}/sets"
_CARDS = f"{settings.API_V1_PREFIX}/cards"


@pytest.fixture
async def catalog(db_session):
    """A unique seeded set with three named, priced cards (inside the test txn)."""
    db_session.add(
        Set(id="zzt1", name="Zzz Test Expansion", series="TestSeries", printed_total=3, total=3)
    )
    # Rarities include a catalog-unique value ("ZzTestRare") so the rarity filter is
    # deterministic despite the shared live catalog.
    db_session.add(
        Card(id="zzt1-1", set_id="zzt1", name="Pikachu VMAX", number="1", rarity="ZzTestRare")
    )
    db_session.add(
        Card(id="zzt1-2", set_id="zzt1", name="Raichu", number="2", rarity="ZzTestCommon")
    )
    db_session.add(
        Card(id="zzt1-3", set_id="zzt1", name="Charizard", number="3", rarity="ZzTestCommon")
    )
    await db_session.flush()
    db_session.add_all(
        [
            CardPriceCurrent(
                card_id="zzt1-1",
                source="tcgplayer",
                variant="normal",
                market=Decimal("12.34"),
                currency="USD",
            ),
            # a cardmarket (EUR) row must NOT become the headline USD price
            CardPriceCurrent(
                card_id="zzt1-1",
                source="cardmarket",
                variant="normal",
                market=Decimal("9.99"),
                currency="EUR",
            ),
        ]
    )
    await db_session.flush()


# ---- sets ----------------------------------------------------------------


async def test_list_sets_includes_seeded(auth_client, catalog):
    resp = await auth_client.get(_SETS, params={"limit": 500})
    assert resp.status_code == 200
    by_id = {s["id"]: s for s in resp.json()}
    assert "zzt1" in by_id
    assert by_id["zzt1"]["name"] == "Zzz Test Expansion"
    assert by_id["zzt1"]["total"] == 3


async def test_get_set_by_id(auth_client, catalog):
    resp = await auth_client.get(f"{_SETS}/zzt1")
    assert resp.status_code == 200
    assert resp.json()["series"] == "TestSeries"


async def test_get_set_unknown_404(auth_client, catalog):
    assert (await auth_client.get(f"{_SETS}/does-not-exist")).status_code == 404


async def test_sets_name_search(auth_client, catalog):
    resp = await auth_client.get(_SETS, params={"q": "Zzz Test", "limit": 500})
    assert resp.status_code == 200
    ids = {s["id"] for s in resp.json()}
    assert ids == {"zzt1"}


# ---- cards ---------------------------------------------------------------


async def test_list_cards_filtered_by_set(auth_client, catalog):
    resp = await auth_client.get(_CARDS, params={"set_id": "zzt1"})
    assert resp.status_code == 200
    cards = resp.json()
    assert {c["id"] for c in cards} == {"zzt1-1", "zzt1-2", "zzt1-3"}


async def test_cards_name_search_within_set(auth_client, catalog):
    resp = await auth_client.get(_CARDS, params={"set_id": "zzt1", "q": "chu"})
    assert resp.status_code == 200
    # "Pikachu VMAX" and "Raichu" match "chu"; "Charizard" does not.
    assert {c["name"] for c in resp.json()} == {"Pikachu VMAX", "Raichu"}


async def test_cards_pagination(auth_client, catalog):
    page1 = await auth_client.get(_CARDS, params={"set_id": "zzt1", "limit": 2, "offset": 0})
    page2 = await auth_client.get(_CARDS, params={"set_id": "zzt1", "limit": 2, "offset": 2})
    assert page1.status_code == page2.status_code == 200
    assert len(page1.json()) == 2
    assert len(page2.json()) == 1
    # no overlap across pages
    ids1 = {c["id"] for c in page1.json()}
    ids2 = {c["id"] for c in page2.json()}
    assert ids1.isdisjoint(ids2)


async def test_get_card_has_usd_market_price(auth_client, catalog):
    resp = await auth_client.get(f"{_CARDS}/zzt1-1")
    assert resp.status_code == 200
    body = resp.json()
    # Headline price comes from the tcgplayer USD row, never the cardmarket EUR row.
    assert float(body["market_price"]) == 12.34
    assert body["currency"] == "USD"
    # Both price rows are still exposed under `prices`.
    assert {p["source"] for p in body["prices"]} == {"tcgplayer", "cardmarket"}


async def test_get_card_unknown_404(auth_client, catalog):
    assert (await auth_client.get(f"{_CARDS}/zzt1-999")).status_code == 404


async def test_cards_search_matches_number(auth_client, catalog):
    # q should match the collector number as well as the name.
    resp = await auth_client.get(_CARDS, params={"set_id": "zzt1", "q": "2"})
    assert resp.status_code == 200
    assert {c["id"] for c in resp.json()} == {"zzt1-2"}


async def test_cards_rarity_filter(auth_client, catalog):
    resp = await auth_client.get(_CARDS, params={"rarity": "ZzTestRare"})
    assert resp.status_code == 200
    assert {c["id"] for c in resp.json()} == {"zzt1-1"}


async def test_cards_sort_by_name(auth_client, catalog):
    resp = await auth_client.get(_CARDS, params={"set_id": "zzt1", "sort": "name"})
    assert resp.status_code == 200
    names = [c["name"] for c in resp.json()]
    assert names == ["Charizard", "Pikachu VMAX", "Raichu"]


async def test_cards_sort_by_price_desc(auth_client, catalog):
    resp = await auth_client.get(_CARDS, params={"set_id": "zzt1", "sort": "price_desc"})
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()]
    # zzt1-1 is the only priced card, so it must lead; the unpriced two sort last.
    assert ids[0] == "zzt1-1"
    assert set(ids) == {"zzt1-1", "zzt1-2", "zzt1-3"}


async def test_cards_invalid_sort_rejected(auth_client, catalog):
    resp = await auth_client.get(_CARDS, params={"set_id": "zzt1", "sort": "bogus"})
    assert resp.status_code == 422  # Literal validation


async def test_rarities_endpoint_includes_seeded(auth_client, catalog):
    resp = await auth_client.get(f"{_CARDS}/rarities")
    assert resp.status_code == 200
    rarities = resp.json()
    assert "ZzTestRare" in rarities and "ZzTestCommon" in rarities
