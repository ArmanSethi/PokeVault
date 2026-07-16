"""Model registry for SQLAlchemy / Alembic.

Imports the declarative ``Base`` and every ORM model so that ``Base.metadata`` is
fully populated when Alembic autogenerates migrations. New model modules must be
imported below. Models themselves import ``Base`` from ``app.db.base_class`` to
avoid an import cycle.
"""

from __future__ import annotations

from app.db.base_class import Base  # noqa: F401

# Import models so they register with Base.metadata for Alembic autogenerate.
# (Imported for side effects; noqa keeps linters from flagging them as unused.)
from app.models.alert_log import AlertLog  # noqa: E402, F401
from app.models.card import Card, Set  # noqa: E402, F401
from app.models.collection import CollectionEntry  # noqa: E402, F401
from app.models.comment import ShowcaseComment  # noqa: E402, F401
from app.models.deck import Deck, DeckCard  # noqa: E402, F401
from app.models.pack_open import PackOpen  # noqa: E402, F401
from app.models.pack_pull import PackPull  # noqa: E402, F401
from app.models.portfolio import PortfolioValueDaily  # noqa: E402, F401
from app.models.price import CardPriceCurrent, PriceHistory  # noqa: E402, F401
from app.models.scan import Scan  # noqa: E402, F401
from app.models.sealed_item import SealedItem  # noqa: E402, F401
from app.models.social import (  # noqa: E402, F401
    Block,
    Conversation,
    Friendship,
    Message,
)
from app.models.user import User  # noqa: E402, F401
from app.models.wishlist import WishlistItem  # noqa: E402, F401
