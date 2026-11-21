"""Signup endpoint — creates Supabase auth users without the broken confirmation mailer."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.schemas.user import SignUpRequest
from app.services import signup as signup_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.post("/signup")
async def sign_up(data: SignUpRequest, session: SessionDep) -> dict[str, bool]:
    """Create a confirmed Supabase account.

    Always returns 200 so the UI cannot enumerate registered emails. The frontend follows
    this with a normal Supabase password login to obtain a JWT.
    """
    try:
        created = await signup_service.create_confirmed_user(session, data.email, data.password)
    except signup_service.InvalidSignup as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return {"created": created}
