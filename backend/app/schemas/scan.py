"""Schemas for the free OCR card-scan endpoint."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel


class ScanCandidate(BaseModel):
    """A catalog card proposed as a match for an uploaded photo."""

    card_id: str
    name: str
    set_id: str
    number: str
    image_url: str | None = None
    market_price: Decimal | None = None
    currency: str | None = None
    confidence: float  # 0..1


class ScanResult(BaseModel):
    """OCR read-out plus ranked candidate matches. Proposes only — never auto-adds."""

    detected_name: str | None = None
    detected_number: str | None = None
    candidates: list[ScanCandidate] = []
