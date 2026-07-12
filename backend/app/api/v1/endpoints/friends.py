"""Friends + blocks endpoints (mounted at /friends). All guards live in the service layer."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.social import (
    FriendRequestCreate,
    FriendRequestRead,
    FriendStateRead,
    FriendUser,
)
from app.services import friends as friends_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.post("/request", status_code=status.HTTP_201_CREATED)
async def create_request(
    user: CurrentUser, session: SessionDep, data: FriendRequestCreate
) -> dict[str, bool]:
    """Send a friend request by handle (guards: no self, no block, not already pending/friends)."""
    try:
        await friends_service.request_friend(session, user, data.handle)
    except friends_service.NotFound:
        raise HTTPException(status_code=404, detail="User not found") from None
    except friends_service.SelfAction:
        raise HTTPException(status_code=400, detail="You can't friend yourself") from None
    except friends_service.Blocked:
        raise HTTPException(status_code=403, detail="Unavailable") from None  # hide block direction
    except friends_service.AlreadyExists:
        raise HTTPException(
            status_code=409, detail="A request or friendship already exists"
        ) from None
    return {"ok": True}


@router.post("/requests/{request_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
async def accept_request(user: CurrentUser, session: SessionDep, request_id: int) -> Response:
    try:
        await friends_service.accept_request(session, user, request_id)
    except friends_service.NotFound:
        raise HTTPException(status_code=404, detail="Request not found") from None
    except friends_service.Blocked:
        raise HTTPException(status_code=403, detail="Unavailable") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/requests/{request_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_request(user: CurrentUser, session: SessionDep, request_id: int) -> Response:
    try:
        await friends_service.decline_request(session, user, request_id)
    except friends_service.NotFound:
        raise HTTPException(status_code=404, detail="Request not found") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("", response_model=list[FriendUser])
async def list_friends(user: CurrentUser, session: SessionDep) -> list[FriendUser]:
    return await friends_service.list_friends(session, user)


@router.get("/requests", response_model=list[FriendRequestRead])
async def list_requests(user: CurrentUser, session: SessionDep) -> list[FriendRequestRead]:
    """Pending requests involving the user (incoming and outgoing, for UI state)."""
    return await friends_service.list_requests(session, user)


@router.get("/state/{handle}", response_model=FriendStateRead)
async def get_state(user: CurrentUser, session: SessionDep, handle: str) -> FriendStateRead:
    """Add-friend button state for a profile (none/pending_out/pending_in/friends/blocked/self)."""
    try:
        state, user_id = await friends_service.state_for_handle(session, user, handle)
    except friends_service.NotFound:
        raise HTTPException(status_code=404, detail="User not found") from None
    return FriendStateRead(state=state, user_id=user_id)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unfriend(user: CurrentUser, session: SessionDep, user_id: uuid.UUID) -> Response:
    await friends_service.unfriend(session, user, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def block_user(user: CurrentUser, session: SessionDep, user_id: uuid.UUID) -> Response:
    try:
        await friends_service.block(session, user, user_id)
    except friends_service.SelfAction:
        raise HTTPException(status_code=400, detail="You can't block yourself") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def unblock_user(user: CurrentUser, session: SessionDep, user_id: uuid.UUID) -> Response:
    await friends_service.unblock(session, user, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
