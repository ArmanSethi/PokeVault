"""1:1 messaging endpoints (mounted at /messages). Manual-refresh delivery; no websockets."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_session
from app.schemas.social import (
    ConversationDetail,
    ConversationRead,
    MessageCreate,
    MessageRead,
    StartConversationRequest,
    UnreadCount,
)
from app.services import messages as messages_service

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.post("/start")
async def start_conversation(
    user: CurrentUser, session: SessionDep, data: StartConversationRequest
) -> dict[str, int]:
    """Get-or-create the 1:1 conversation with a friend (guarded)."""
    try:
        conversation_id = await messages_service.start_conversation(
            session, user, data.friend_user_id
        )
    except messages_service.NotAllowed:
        raise HTTPException(status_code=403, detail="You can only message friends") from None
    return {"conversation_id": conversation_id}


@router.get("/conversations", response_model=list[ConversationRead])
async def list_conversations(user: CurrentUser, session: SessionDep) -> list[ConversationRead]:
    return await messages_service.list_conversations(session, user)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    user: CurrentUser, session: SessionDep, conversation_id: int
) -> ConversationDetail:
    """Thread messages; marks the other party's messages read on fetch."""
    try:
        return await messages_service.get_messages(session, user, conversation_id)
    except messages_service.NotParticipant:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
    except messages_service.NotAllowed:
        raise HTTPException(status_code=403, detail="Unavailable") from None


@router.post("/conversations/{conversation_id}", response_model=MessageRead)
async def send_message(
    user: CurrentUser, session: SessionDep, conversation_id: int, data: MessageCreate
) -> MessageRead:
    try:
        return await messages_service.send_message(session, user, conversation_id, data.body)
    except messages_service.NotParticipant:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
    except messages_service.NotAllowed:
        raise HTTPException(status_code=403, detail="You can only message friends") from None
    except messages_service.RateLimited:
        raise HTTPException(status_code=429, detail="Slow down — too many messages") from None
    except ValueError:
        raise HTTPException(status_code=400, detail="Message must be 1–2000 characters") from None


@router.get("/unread_count", response_model=UnreadCount)
async def unread_count(user: CurrentUser, session: SessionDep) -> UnreadCount:
    return UnreadCount(unread=await messages_service.unread_count(session, user))
