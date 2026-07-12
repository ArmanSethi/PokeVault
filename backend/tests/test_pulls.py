"""Virtual pull collection + leaderboard tests (real DB via db_session).

Key gate: keeping a pull must NEVER touch the IRL collection_entries.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import func, select, update

from app.models.card import Card, Set
from app.models.collection import CollectionEntry
from app.models.pack_pull import PackPull
from app.models.price import CardPriceCurrent
from app.models.user import User
from app.schemas.pull import PackPullCreate
from app.services import pulls as svc


async def _user(db_session, *, public=True, handle=True) -> User:
    u = User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4().hex[:8]}@pokevault.dev",
        handle=("u" + uuid.uuid4().hex[:12]) if handle else None,
        is_public=public,
    )
    db_session.add(u)
    await db_session.flush()
    return u


async def _card(db_session, price: str | None) -> Card:
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


async def _collection_count(db_session, uid) -> int:
    return await db_session.scalar(
        select(func.count()).select_from(CollectionEntry).where(CollectionEntry.user_id == uid)
    )


async def test_keep_does_not_touch_collection(db_session):
    user = await _user(db_session)
    card = await _card(db_session, "10.00")
    before = await _collection_count(db_session, user.id)
    pull = await svc.keep_pull(db_session, user.id, PackPullCreate(card_id=card.id))
    after = await _collection_count(db_session, user.id)
    assert before == after == 0  # IRL collection untouched
    assert pull.price_at_pull == Decimal("10.00")  # frozen at keep
    n = await db_session.scalar(
        select(func.count()).select_from(PackPull).where(PackPull.user_id == user.id)
    )
    assert n == 1


async def test_current_value_diverges_from_frozen(db_session):
    user = await _user(db_session)
    card = await _card(db_session, "10.00")
    await svc.keep_pull(db_session, user.id, PackPullCreate(card_id=card.id))
    # Price moves after the pull.
    await db_session.execute(
        update(CardPriceCurrent)
        .where(CardPriceCurrent.card_id == card.id, CardPriceCurrent.variant == "normal")
        .values(market=Decimal("40.00"))
    )
    lst = await svc.list_pulls(db_session, user.id)
    assert lst[0].price_at_pull == Decimal("10.00")  # frozen
    assert lst[0].current_value == Decimal("40.00")  # live


async def test_best_single_ranks_frozen_and_excludes_private_and_null(db_session):
    a = await _user(db_session)
    b = await _user(db_session)
    priv = await _user(db_session, public=False)
    c10 = await _card(db_session, "10.00")
    c99 = await _card(db_session, "99.00")
    cnull = await _card(db_session, None)  # unpriced → null price_at_pull
    await svc.keep_pull(db_session, a.id, PackPullCreate(card_id=c99.id))  # a: best 99
    await svc.keep_pull(db_session, a.id, PackPullCreate(card_id=c10.id))
    await svc.keep_pull(db_session, b.id, PackPullCreate(card_id=c10.id))  # b: best 10
    await svc.keep_pull(db_session, priv.id, PackPullCreate(card_id=c99.id))  # private → excluded
    await svc.keep_pull(db_session, a.id, PackPullCreate(card_id=cnull.id))  # null → not the max

    board = await svc.leaderboard(db_session, "best_single", "all_time")
    handles = [e.handle for e in board]
    assert priv.handle not in handles
    top = next(e for e in board if e.handle == a.handle)
    assert top.score == Decimal("99.00") and top.card.card_id == c99.id
    # a (99) ranks above b (10)
    assert handles.index(a.handle) < handles.index(b.handle)


async def test_total_value_and_monthly_window(db_session):
    u = await _user(db_session)
    c10 = await _card(db_session, "10.00")
    c40 = await _card(db_session, "40.00")
    cnull = await _card(db_session, None)
    await svc.keep_pull(db_session, u.id, PackPullCreate(card_id=c10.id))
    await svc.keep_pull(db_session, u.id, PackPullCreate(card_id=c40.id))
    await svc.keep_pull(db_session, u.id, PackPullCreate(card_id=cnull.id))  # null → 0

    all_time = await svc.leaderboard(db_session, "total_value", "all_time")
    me = next(e for e in all_time if e.handle == u.handle)
    assert me.score == Decimal("50.00") and me.pull_count == 3

    # Backdate one pull to last month and re-check monthly excludes it.
    last_month = dt.datetime.now(dt.UTC).replace(day=1) - dt.timedelta(days=2)
    await db_session.execute(
        update(PackPull)
        .where(PackPull.user_id == u.id, PackPull.card_id == c40.id)
        .values(pulled_at=last_month)
    )
    monthly = await svc.leaderboard(db_session, "total_value", "monthly")
    me_m = next(e for e in monthly if e.handle == u.handle)
    assert me_m.score == Decimal(
        "10.00"
    )  # only the c10 pull is this month (c40 backdated, cnull=0)
