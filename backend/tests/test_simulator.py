"""Pure unit tests for the pack-simulator odds engine (no DB)."""

from __future__ import annotations

import random
from types import SimpleNamespace

from app.services.simulator import (
    _bucket,
    build_pack,
    tier_for_rarity,
)


def _card(i: int, rarity: str) -> SimpleNamespace:
    return SimpleNamespace(id=f"c-{i}", rarity=rarity)


def _set(commons=10, uncommons=8, rares=4, holos=3, ultras=0, secrets=0):
    cards = []
    n = 0
    for rarity, count in [
        ("Common", commons),
        ("Uncommon", uncommons),
        ("Rare", rares),
        ("Rare Holo", holos),
        ("Ultra Rare", ultras),
        ("Rare Secret", secrets),
    ]:
        for _ in range(count):
            cards.append(_card(n, rarity))
            n += 1
    return cards


def test_tier_mapping():
    assert tier_for_rarity("Common") == "common"
    assert tier_for_rarity("Uncommon") == "uncommon"
    assert tier_for_rarity("Rare") == "rare"
    assert tier_for_rarity("Rare Holo") == "holo"
    assert tier_for_rarity("Ultra Rare") == "ultra"
    assert tier_for_rarity("Special Illustration Rare") == "illustration"
    assert tier_for_rarity("Rare Rainbow") == "secret"
    assert tier_for_rarity("Promo") is None  # fallback only
    assert tier_for_rarity(None) is None


def test_pack_structure_and_hit_is_rare_or_better():
    rng = random.Random(42)
    by_tier = _bucket(_set())
    for _ in range(200):
        pack = build_pack(by_tier, rng)
        assert len(pack) == 10  # 6 + 3 + 1
        kinds = [k for k, _ in pack]
        assert kinds.count("common") == 6
        assert kinds.count("uncommon") == 3
        assert kinds.count("hit") == 1
        # common/uncommon slots draw from their own tier
        assert all(c.rarity == "Common" for k, c in pack if k == "common")
        assert all(c.rarity == "Uncommon" for k, c in pack if k == "uncommon")
        # the hit is always Rare or better (never a Common/Uncommon)
        hit = next(c for k, c in pack if k == "hit")
        assert hit.rarity not in ("Common", "Uncommon")


def test_hit_only_uses_present_tiers():
    """A set with only Rare + Rare Holo must never yield an ultra/secret in the hit slot."""
    rng = random.Random(7)
    by_tier = _bucket(_set(ultras=0, secrets=0))
    seen = set()
    for _ in range(300):
        hit = next(c for k, c in build_pack(by_tier, rng) if k == "hit")
        seen.add(hit.rarity)
    assert seen <= {"Rare", "Rare Holo"}


def test_weighting_varies_across_present_tiers():
    """With ultras + secrets present, the hit tier should vary (not one flat outcome)."""
    rng = random.Random(3)
    by_tier = _bucket(_set(ultras=6, secrets=4))
    tiers = {next(c for k, c in build_pack(by_tier, rng) if k == "hit").rarity for _ in range(500)}
    assert len(tiers) >= 2  # weighting genuinely spreads across tiers


def test_no_commons_falls_back_without_crashing():
    rng = random.Random(1)
    by_tier = _bucket(_set(commons=0, uncommons=0, rares=5, holos=0))
    pack = build_pack(by_tier, rng)
    assert len(pack) == 10  # commons/uncommons fall back to available cards
