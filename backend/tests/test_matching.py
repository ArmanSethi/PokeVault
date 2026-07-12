"""Catalog matching tests (real DB) — covers the name-only fallback fix (M1).

Not stubbed: these run the real fuzzy match against the live catalog via the rollback
``db_session``. Skipped automatically when no DB is reachable (see conftest).
"""

from __future__ import annotations

from app.services.matching import match_card


async def test_number_path_ranks_exact_match_first(db_session):
    """With a collector number, the exact printing ranks #1 and scores vary (regression)."""
    res = await match_card(db_session, "Pikachu", "58", limit=5)
    assert res, "no candidates for Pikachu #58"
    assert res[0].card_id == "base1-58", f"expected base1-58 first, got {[m.card_id for m in res]}"
    assert res[0].confidence > 0.9  # exact name + number match
    assert len({m.confidence for m in res}) > 1, "scores should vary"


async def test_name_only_surfaces_base_printing_and_varies(db_session):
    """M1 fix: no number → the base-set Charizard still appears AND scores are not flat."""
    res = await match_card(db_session, "Charizard", None, limit=5)
    ids = [m.card_id for m in res]
    confs = [m.confidence for m in res]
    assert res, "no candidates for name-only Charizard"
    # The exact printing the user scanned must be present even without a number.
    assert "base1-4" in ids, f"base1-4 (Base Set Charizard) absent from {ids}"
    # Scores must vary in the fallback — no flat 0.90 across the board.
    assert len(set(confs)) > 1, f"flat scores in name-only fallback: {confs}"
    # Every returned card should genuinely be a Charizard-named match.
    assert all("charizard" in m.name.lower() for m in res), [m.name for m in res]
