"""Schemas for CSV collection import (preview + confirm) and export."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

RowStatus = Literal["matched", "ambiguous", "unmatched"]


class ImportCandidate(BaseModel):
    """A catalog card proposed for an imported CSV row."""

    card_id: str
    name: str
    set_id: str
    number: str
    image_url: str | None = None
    confidence: float


class ImportRow(BaseModel):
    """One parsed CSV row with its reconciliation result (proposal only, not committed)."""

    row_index: int
    # Parsed intent from the CSV.
    name: str | None = None
    number: str | None = None
    set_name: str | None = None
    quantity: int = 1
    condition: str | None = None
    is_foil: bool = False
    # Reconciliation.
    status: RowStatus
    candidates: list[ImportCandidate] = []
    selected_card_id: str | None = None  # best match when status == "matched"


class ImportPreview(BaseModel):
    """Full reconciliation of an uploaded CSV — nothing is written yet."""

    rows: list[ImportRow] = []
    matched: int = 0
    ambiguous: int = 0
    unmatched: int = 0
    total: int = 0


class ImportConfirmRow(BaseModel):
    """A user-resolved row to actually add to the collection."""

    card_id: str
    quantity: int = Field(default=1, ge=1)
    condition: str | None = None
    is_foil: bool = False


class ImportConfirm(BaseModel):
    rows: list[ImportConfirmRow] = []


class ImportConfirmResult(BaseModel):
    added: int
    skipped: int = 0
