"""Card-scan endpoint — upload a photo, get ranked catalog candidates (propose-only).

Requires auth: scanning is gated by a daily quota (Free: 50/UTC-day; Pro: unlimited), counted from
a lightweight ``scans`` row per successful scan. Proposing never adds anything to the collection.
"""

from __future__ import annotations

from typing import Annotated

import pytesseract
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from PIL import UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.scan import ScanQuotaRead, ScanResult
from app.services import scan as scan_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]

_MAX_BYTES = 10 * 1024 * 1024  # 10 MB upload cap


@router.post("", response_model=ScanResult)
async def scan_card(
    user: CurrentUser,
    session: SessionDep,
    file: Annotated[UploadFile, File(description="A photo of a single Pokémon card.")],
    limit: int = Query(default=5, ge=1, le=20),
) -> ScanResult:
    """OCR an uploaded card photo and return ranked catalog matches (never auto-adds).

    Enforces the daily scan quota before doing any work; a successful scan is then recorded so it
    counts toward the cap.
    """
    cap = scan_service.effective_daily_scan_limit(user)
    if cap is not None and await scan_service.scans_today_count(session, user.id) >= cap:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Daily scan limit reached ({cap}/day on the free plan). "
                "Upgrade to Pro for unlimited scans, or try again after UTC midnight."
            ),
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="Empty upload.")
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 10 MB).")

    try:
        result = await scan_service.propose_candidates(session, data, limit=limit)
    except UnidentifiedImageError:
        raise HTTPException(status_code=422, detail="Not a readable image.") from None
    except pytesseract.TesseractNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="OCR engine (Tesseract) is not installed on the server.",
        ) from None

    await scan_service.record_scan(session, user.id)
    return result


@router.get("/quota", response_model=ScanQuotaRead)
async def scan_quota(user: CurrentUser, session: SessionDep) -> ScanQuotaRead:
    """Scans the user may still run today (UTC), plus their effective daily cap (None = Pro)."""
    cap = scan_service.effective_daily_scan_limit(user)
    remaining = await scan_service.scans_remaining_today(session, user.id, cap)
    return ScanQuotaRead(scans_remaining_today=remaining, daily_limit=cap)
