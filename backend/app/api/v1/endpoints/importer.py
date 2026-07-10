"""CSV import/export endpoints for a user's collection.

Mounted under ``/collection``. Import is two-step: ``POST /import`` returns a non-committing
reconciliation preview; ``POST /import/confirm`` writes the user-resolved rows. ``GET /export``
streams the collection back out as CSV.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.collection import CollectionEntryCreate
from app.schemas.importer import ImportConfirm, ImportConfirmResult, ImportPreview
from app.services import collection as collection_service
from app.services import import_export as import_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]

_MAX_BYTES = 5 * 1024 * 1024  # 5 MB CSV cap


@router.post("/import", response_model=ImportPreview)
async def import_preview(
    user: CurrentUser,
    session: SessionDep,
    file: Annotated[UploadFile, File(description="A CSV export from Collectr, TCG Collector, …")],
) -> ImportPreview:
    """Parse + fuzzy-match an uploaded CSV and return a reconciliation. Writes nothing."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="Empty upload.")
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="CSV too large (max 5 MB).")
    return await import_service.preview_import(session, data)


@router.post("/import/confirm", response_model=ImportConfirmResult)
async def import_confirm(
    user: CurrentUser, session: SessionDep, payload: ImportConfirm
) -> ImportConfirmResult:
    """Add the user-resolved rows to the collection (stack-increment dedupes automatically)."""
    added = 0
    skipped = 0
    for row in payload.rows:
        try:
            await collection_service.add_or_increment(
                session,
                user.id,
                CollectionEntryCreate(
                    card_id=row.card_id,
                    quantity=row.quantity,
                    condition=row.condition,
                    is_foil=row.is_foil,
                    acquired_price=row.acquired_price,
                    notes=row.notes,
                ),
            )
            added += 1
        except collection_service.UnknownCard:
            skipped += 1
    return ImportConfirmResult(added=added, skipped=skipped)


@router.get("/export")
async def export_collection(user: CurrentUser, session: SessionDep) -> StreamingResponse:
    """Download the user's collection as CSV (round-trips through import)."""
    body = await import_service.export_csv(session, user.id)
    return StreamingResponse(
        iter([body]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="pokevault-collection.csv"'},
    )
