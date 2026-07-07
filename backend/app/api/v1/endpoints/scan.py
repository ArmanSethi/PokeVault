"""Card-scan endpoint — upload a photo, get ranked catalog candidates (propose-only)."""

from __future__ import annotations

from typing import Annotated

import pytesseract
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from PIL import UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.schemas.scan import ScanResult
from app.services import scan as scan_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]

_MAX_BYTES = 10 * 1024 * 1024  # 10 MB upload cap


@router.post("", response_model=ScanResult)
async def scan_card(
    session: SessionDep,
    file: Annotated[UploadFile, File(description="A photo of a single Pokémon card.")],
    limit: int = Query(default=5, ge=1, le=20),
) -> ScanResult:
    """OCR an uploaded card photo and return ranked catalog matches (never auto-adds)."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="Empty upload.")
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 10 MB).")

    try:
        return await scan_service.propose_candidates(session, data, limit=limit)
    except UnidentifiedImageError:
        raise HTTPException(status_code=422, detail="Not a readable image.") from None
    except pytesseract.TesseractNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="OCR engine (Tesseract) is not installed on the server.",
        ) from None
