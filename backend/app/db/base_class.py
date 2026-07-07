"""The declarative base, isolated so models can import it without import cycles.

Model modules import ``Base`` from here; ``app.db.base`` is the aggregator that
imports ``Base`` *and* every model so ``Base.metadata`` is fully populated for
Alembic autogenerate.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
