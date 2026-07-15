"""Shared numeric input limits.

Enforced at the API boundary via Pydantic ``Field`` constraints (a crafted request over the
limit is rejected with 422) and defensively in services where a value can grow past the max
without a fresh validated payload (e.g. add-or-increment) or arrives in bulk (CSV import),
where we clamp instead of rejecting the whole batch. The frontend mirrors these in
``src/lib/limits.ts`` for inline UX, but the backend is the source of truth.
"""

from __future__ import annotations

# Card copies per stack (collection entries and deck cards).
MIN_CARD_QTY = 1
MAX_CARD_QTY = 99

# Deck target size ("dream deck" — larger than a real 60-card deck, but bounded).
MIN_DECK_TARGET = 1
MAX_DECK_TARGET = 100

# Sealed product quantity (packs/boxes can be held in larger numbers than single-card stacks).
MIN_SEALED_QTY = 1
MAX_SEALED_QTY = 9999

# Money fields (e.g. wishlist target price). Cards can be worth thousands, so this is
# deliberately high — not a 99 cap — while still fitting Numeric(10,2).
MIN_MONEY = 0
MAX_MONEY = 1_000_000


def clamp_int(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))
