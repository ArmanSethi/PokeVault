"""Virtual pull collection + leaderboard tests (real DB via db_session).

Gates covered: total separation from the IRL collection, server-authoritative keep (only the
stored roll is trusted), the 2-packs/UTC-day quota, frozen-vs-live value, and the opt-in-gated
leaderboard.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import func, select, update

from app.models.card import Card, Set
from app.models.collection import CollectionEntry
from app.models.pack_open import PackOpen
from app.models.pack_pull import PackPull
from app.models.price import CardPriceCurrent
from app.models.user import User
from app.services import pulls as svc
from app.services import simulator as sim


async def _user(db_session, *, opt_in=True, public=False, handle=True) -> User:
    u = User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4().hex[:8]}@pokevault.dev",
        handle=("u" + uuid.uuid4().hex[:12]) if handle else None,
        is_public=public,
        leaderboard_opt_in=opt_in,
    )
    db_session.add(u)
    await db_session.flush()
    return u


async def _card(db_session, price: str | None) -> Card:
    """A standalone set + single card (+ optional price). Distinct per call."""
    sid = "pp" + uuid.uuid4().hex[:6]
    db_session.add(Set(id=sid, name="Pull Set", printed_total=1, total=1))
    cid = f"{sid}-1"
    db_session.add(Card(id=cid, set_id=sid, name="Chase", number="1", rarity="Rare Holo"))
    if price is not None:
        db_session.add(
            CardPriceCurrent(
                card_id=cid,
                source="tcgplayer",
                variant="normal",
                market=Decimal(price),
                currency="USD",
            )
        )
    await db_session.flush()
    return await db_session.get(Card, cid)


async def _set_with_cards(db_session) -> str:
    """A full 10-card set: 6 commons + 3 uncommons + 1 hit, all priced (hit = $50)."""
    sid = "ps" + uuid.uuid4().hex[:6]
    db_session.add(Set(id=sid, name="Booster Set", printed_total=10, total=10))

    def mk(n: int, rarity: str, price: str) -> None:
        cid = f"{sid}-{n}"
        db_session.add(Card(id=cid, set_id=sid, name=f"Card {n}", number=str(n), rarity=rarity))
        db_session.add(
            CardPriceCurrent(
                card_id=cid,
                source="tcgplayer",
                variant="normal",
                market=Decimal(price),
                currency="USD",
            )
        )

    for i in range(1, 7):
        mk(i, "Common", "1.00")
    for i in range(7, 10):
        mk(i, "Uncommon", "2.00")
    mk(10, "Rare Holo", "50.00")
    await db_session.flush()
    return sid


async def _add_pull(db_session, user_id, card_id, price, *, rarity="Rare Holo", pulled_at=None):
    p = PackPull(
        user_id=user_id,
        card_id=card_id,
        price_at_pull=Decimal(price) if price is not None else None,
        rarity=rarity,
    )
    if pulled_at is not None:
        p.pulled_at = pulled_at
    db_session.add(p)
    await db_session.flush()
    return p


async def _collection_count(db_session, uid) -> int:
    return await db_session.scalar(
        select(func.count()).select_from(CollectionEntry).where(CollectionEntry.user_id == uid)
    )


async def _pull_count(db_session, uid) -> int:
    return await db_session.scalar(
        select(func.count()).select_from(PackPull).where(PackPull.user_id == uid)
    )


# ---- open + roll persistence ----------------------------------------------------------------


async def test_open_persists_authoritative_roll_best_last(db_session):
    user = await _user(db_session)
    sid = await _set_with_cards(db_session)
    result = await sim.open_pack(db_session, user.id, sid)
    assert result is not None
    assert result.open_id and len(result.cards) == 10
    assert result.packs_remaining_today == 1
    # The single hit fills the last slot (revealed last).
    assert result.cards[-1].slot_kind == "hit"
    assert result.cards[-1].price_at_open == Decimal("50.00")
    # The roll is persisted verbatim, with open-time prices as strings.
    po = await db_session.get(PackOpen, result.open_id)
    assert po is not None and len(po.rolled_cards) == 10
    assert all(rc.get("price_at_open") is not None for rc in po.rolled_cards)


# ---- separation + server authority ----------------------------------------------------------


async def test_keep_subset_does_not_touch_collection(db_session):
    user = await _user(db_session)
    sid = await _set_with_cards(db_session)
    result = await sim.open_pack(db_session, user.id, sid)
    before = await _collection_count(db_session, user.id)
    kept = [result.cards[0].card.id, result.cards[-1].card.id]  # a common + the hit
    pulls = await svc.keep_from_open(db_session, user.id, result.open_id, kept)
    after = await _collection_count(db_session, user.id)
    assert before == after == 0  # IRL collection untouched
    assert len(pulls) == 2
    assert await _pull_count(db_session, user.id) == 2
    # Frozen price == the server's stored price_at_open (the hit was $50).
    hit_pull = next(p for p in pulls if p.card_id == result.cards[-1].card.id)
    assert hit_pull.price_at_pull == Decimal("50.00")


async def test_keep_rejects_card_not_in_open(db_session):
    user = await _user(db_session)
    sid = await _set_with_cards(db_session)
    result = await sim.open_pack(db_session, user.id, sid)
    with pytest.raises(svc.InvalidKeep):
        await svc.keep_from_open(db_session, user.id, result.open_id, ["totally-fake-1"])
    assert await _pull_count(db_session, user.id) == 0  # nothing inserted


async def test_keep_is_idempotent_per_open(db_session):
    user = await _user(db_session)
    sid = await _set_with_cards(db_session)
    result = await sim.open_pack(db_session, user.id, sid)
    await svc.keep_from_open(db_session, user.id, result.open_id, [result.cards[0].card.id])
    with pytest.raises(svc.AlreadyKept):
        await svc.keep_from_open(db_session, user.id, result.open_id, [result.cards[1].card.id])


async def test_keep_rejects_foreign_open(db_session):
    owner = await _user(db_session)
    intruder = await _user(db_session)
    sid = await _set_with_cards(db_session)
    result = await sim.open_pack(db_session, owner.id, sid)
    with pytest.raises(svc.OpenNotFound):
        await svc.keep_from_open(db_session, intruder.id, result.open_id, [result.cards[0].card.id])


# ---- quota (UTC daily, query-time) ----------------------------------------------------------


async def test_quota_blocks_third_open_and_unblocks_next_day(db_session):
    user = await _user(db_session)
    sid = await _set_with_cards(db_session)
    r1 = await sim.open_pack(db_session, user.id, sid)
    assert r1.packs_remaining_today == 1
    r2 = await sim.open_pack(db_session, user.id, sid)
    assert r2.packs_remaining_today == 0
    with pytest.raises(sim.QuotaExceeded):
        await sim.open_pack(db_session, user.id, sid)
    # Backdate today's opens to yesterday (UTC) → quota resets.
    yesterday = dt.datetime.now(dt.UTC) - dt.timedelta(days=1)
    await db_session.execute(
        update(PackOpen).where(PackOpen.user_id == user.id).values(opened_at=yesterday)
    )
    assert await sim.packs_remaining_today(db_session, user.id) == 2
    r3 = await sim.open_pack(db_session, user.id, sid)  # now allowed again
    assert r3 is not None


# ---- frozen vs live -------------------------------------------------------------------------


async def test_current_value_diverges_from_frozen(db_session):
    user = await _user(db_session)
    sid = await _set_with_cards(db_session)
    result = await sim.open_pack(db_session, user.id, sid)
    hit_id = result.cards[-1].card.id
    pulls = await svc.keep_from_open(db_session, user.id, result.open_id, [hit_id])
    assert pulls[0].price_at_pull == Decimal("50.00")
    # Price moves after the pull.
    await db_session.execute(
        update(CardPriceCurrent)
        .where(CardPriceCurrent.card_id == hit_id, CardPriceCurrent.variant == "normal")
        .values(market=Decimal("80.00"))
    )
    lst = await svc.list_pulls(db_session, user.id)
    row = next(p for p in lst if p.card_id == hit_id)
    assert row.price_at_pull == Decimal("50.00")  # frozen
    assert row.current_value == Decimal("80.00")  # live


# ---- leaderboard (opt-in gated; showcase visibility separate) -------------------------------


async def test_best_single_requires_optin_and_excludes_null(db_session):
    a = await _user(db_session, opt_in=True, public=True)
    b = await _user(db_session, opt_in=True, public=False)
    optout = await _user(db_session, opt_in=False, public=True)  # public but NOT opted in
    c10 = await _card(db_session, "10.00")
    c99 = await _card(db_session, "99.00")
    cnull = await _card(db_session, None)
    await _add_pull(db_session, a.id, c99.id, "99.00")
    await _add_pull(db_session, a.id, c10.id, "10.00")
    await _add_pull(db_session, b.id, c10.id, "10.00")
    await _add_pull(db_session, optout.id, c99.id, "99.00")  # opted out → excluded
    await _add_pull(db_session, a.id, cnull.id, None)  # null → never the max

    board = await svc.leaderboard(db_session, "best_single", "all_time")
    handles = [e.handle for e in board]
    assert optout.handle not in handles  # opt-in required even though public
    top = next(e for e in board if e.handle == a.handle)
    assert top.score == Decimal("99.00") and top.card.card_id == c99.id
    assert top.showcase_public is True  # a is public → linkable to /u/{handle}
    b_entry = next(e for e in board if e.handle == b.handle)
    assert b_entry.showcase_public is False  # opted in but private → unlinked
    assert handles.index(a.handle) < handles.index(b.handle)


async def test_total_value_and_monthly_window(db_session):
    u = await _user(db_session, opt_in=True, public=False)
    c10 = await _card(db_session, "10.00")
    c40 = await _card(db_session, "40.00")
    cnull = await _card(db_session, None)
    await _add_pull(db_session, u.id, c10.id, "10.00")
    await _add_pull(db_session, u.id, c40.id, "40.00")
    await _add_pull(db_session, u.id, cnull.id, None)  # null → 0

    all_time = await svc.leaderboard(db_session, "total_value", "all_time")
    me = next(e for e in all_time if e.handle == u.handle)
    assert me.score == Decimal("50.00") and me.pull_count == 3
    assert me.showcase_public is False

    # Backdate one pull to last month; monthly must exclude it.
    last_month = dt.datetime.now(dt.UTC).replace(day=1) - dt.timedelta(days=2)
    await db_session.execute(
        update(PackPull)
        .where(PackPull.user_id == u.id, PackPull.card_id == c40.id)
        .values(pulled_at=last_month)
    )
    monthly = await svc.leaderboard(db_session, "total_value", "monthly")
    me_m = next(e for e in monthly if e.handle == u.handle)
    assert me_m.score == Decimal("10.00")  # only the c10 pull is this month
