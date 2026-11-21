"""Email/password signup without the broken Supabase mailer.

Supabase Auth's built-in confirmation email is bounce-throttled on this project, so
``POST {SUPABASE_URL}/auth/v1/signup`` fails with ``unexpected_failure: Error sending
confirmation email`` and rolls back the user creation. This service creates the same
auth identity directly (confirmed, with a bcrypt hash GoTrue can verify), after which the
frontend signs in through Supabase's normal token endpoint and gets a real JWT.

Only ``auth.users`` / ``auth.identities`` are touched — application profile rows are still
created lazily by ``app.api.deps.get_current_user`` on the first authenticated request.
"""

from __future__ import annotations

import asyncio
import json
import re
import uuid

import bcrypt
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_NIL_UUID = "00000000-0000-0000-0000-000000000000"


class InvalidSignup(Exception):
    """Raised when email or password fails validation."""


def validate(email: str, password: str) -> str:
    """Normalize + validate credentials; return the lowercase email."""
    clean = email.strip().lower()
    if not _EMAIL_RE.fullmatch(clean) or len(clean) > 320:
        raise InvalidSignup("Enter a valid email address.")
    if len(password) < 6:
        raise InvalidSignup("Password must be at least 6 characters.")
    if len(password) > 128:
        raise InvalidSignup("Password must be at most 128 characters.")
    return clean


async def create_confirmed_user(session: AsyncSession, email: str, password: str) -> bool:
    """Create a confirmed Supabase auth user.

    Returns ``True`` when a new user was inserted, ``False`` when the email already has
    an account (no error is raised — the frontend deliberately stays neutral about
    whether an email is registered).
    """
    clean_email = validate(email, password)
    user_id = str(uuid.uuid4())
    # bcrypt cost 10 matches GoTrue's default; run off the event loop (it is CPU-bound).
    raw_hash = await asyncio.to_thread(
        lambda: bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("ascii")
    )

    try:
        await session.execute(
            text("""
                INSERT INTO auth.users (
                    instance_id, id, aud, role, email, encrypted_password,
                    email_confirmed_at, confirmation_token, recovery_token,
                    email_change, email_change_token_new, email_change_token_current,
                    reauthentication_token, phone_change_token,
                    raw_app_meta_data, raw_user_meta_data,
                    created_at, updated_at, is_sso_user, is_anonymous
                ) VALUES (
                    :nil_uuid, :id, 'authenticated', 'authenticated', :email, :password_hash,
                    now(), '', '', '', '', '', '', '', '',
                    :app_meta, '{}'::jsonb,
                    now(), now(), false, false
                )
            """),
            {
                "nil_uuid": _NIL_UUID,
                "id": user_id,
                "email": clean_email,
                "password_hash": raw_hash,
                "app_meta": json.dumps({"provider": "email", "providers": ["email"]}),
            },
        )
        await session.execute(
            text("""
                INSERT INTO auth.identities (
                    provider_id, user_id, identity_data, provider, created_at, updated_at
                ) VALUES (
                    :id, :id, :identity_data::jsonb, 'email', now(), now()
                )
                ON CONFLICT (provider_id, provider) DO NOTHING
            """),
            {
                "id": user_id,
                "identity_data": json.dumps(
                    {"sub": user_id, "email": clean_email, "email_verified": True}
                ),
            },
        )
        await session.commit()
    except IntegrityError:
        # Email already registered (unique index on auth.users.email).
        await session.rollback()
        return False
    return True
