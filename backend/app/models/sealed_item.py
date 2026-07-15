"""ORM model for user-owned sealed product (packs, booster boxes, ETBs, bundles, …).

A wholly separate domain from card singles (``collection_entries``) and sim-vault pulls
(``pack_pulls``): sealed product isn't in the card catalog and can't be auto-priced, so its
``value`` is a manual figure the user enters (NULL = no value). Each row is an independently
managed holding — adds never stack/increment; ``quantity`` is edited in place. Optionally tied to
a set (``set_id``); a set-less item is fine.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base
from app.models.card import Set
from app.models.user import User


class SealedItem(Base):
    """A sealed product the owner holds, with a manual value."""

    __tablename__ = "sealed_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # One of app.schemas.sealed.PRODUCT_TYPES (pack | booster_box | etb | bundle | other). Stored
    # as a plain string (house style — no DB enums); validated at the API boundary by a Literal.
    product_type: Mapped[str] = mapped_column(String(16))
    # Optional link to a catalog set; NULL = not tied to a set. SET NULL (not CASCADE) so deleting
    # a set — rare catalog maintenance — keeps the sealed holding rather than dropping it.
    set_id: Mapped[str | None] = mapped_column(
        ForeignKey("sets.id", ondelete="SET NULL"), default=None, index=True
    )
    name: Mapped[str | None] = mapped_column(String(200), default=None)
    quantity: Mapped[int] = mapped_column(default=1)
    # Manual value (USD). NULL = no value → shows "—" and contributes 0 to any total.
    value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=None)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    set: Mapped[Set | None] = relationship()
    user: Mapped[User] = relationship()
