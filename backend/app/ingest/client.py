"""Async HTTP client for the pokemontcg.io v2 API.

Handles auth (X-Api-Key), pagination (pageSize=250), and rate-limit backoff.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_MAX_BACKOFF_SECONDS = 60.0


class PokemonTcgError(RuntimeError):
    """Raised when the API keeps failing after all retries."""


class PokemonTcgClient:
    """Thin async wrapper over the pokemontcg.io REST API."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        page_size: int = 250,
        max_retries: int = 6,
        timeout: float = 30.0,
    ) -> None:
        self.page_size = page_size
        self.max_retries = max_retries

        # Key is read from settings (env / .env) unless explicitly passed; never hardcoded.
        key = api_key if api_key is not None else settings.POKEMONTCG_API_KEY
        headers: dict[str, str] = {}
        if key:
            headers["X-Api-Key"] = key
        else:
            logger.warning("No POKEMONTCG_API_KEY set - proceeding keyless at reduced rate limits.")

        self._client = httpx.AsyncClient(
            base_url=base_url or settings.POKEMONTCG_API_BASE,
            headers=headers,
            timeout=timeout,
        )

    async def __aenter__(self) -> PokemonTcgClient:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        """GET with exponential backoff on 429 / 5xx / transport errors."""
        delay = 1.0
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = await self._client.get(path, params=params)
            except httpx.TransportError as exc:
                if attempt == self.max_retries:
                    raise PokemonTcgError(f"GET {path} failed: {exc}") from exc
                logger.warning(
                    "Transport error on %s (attempt %d/%d): %s; retrying in %.1fs",
                    path,
                    attempt,
                    self.max_retries,
                    exc,
                    delay,
                )
                await asyncio.sleep(delay)
                delay = min(delay * 2, _MAX_BACKOFF_SECONDS)
                continue

            if resp.status_code == 429 or resp.status_code >= 500:
                if attempt == self.max_retries:
                    raise PokemonTcgError(
                        f"GET {path} returned {resp.status_code} after {attempt} attempts"
                    )
                retry_after = resp.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else delay
                logger.warning(
                    "HTTP %d on %s (attempt %d/%d); backing off %.1fs",
                    resp.status_code,
                    path,
                    attempt,
                    self.max_retries,
                    wait,
                )
                await asyncio.sleep(wait)
                delay = min(delay * 2, _MAX_BACKOFF_SECONDS)
                continue

            resp.raise_for_status()
            return resp.json()

        raise PokemonTcgError(f"GET {path}: exhausted retries")  # pragma: no cover

    async def _paginate(
        self, path: str, params: dict[str, Any] | None = None
    ) -> AsyncIterator[dict[str, Any]]:
        query = dict(params or {})
        query["pageSize"] = self.page_size
        page = 1
        while True:
            query["page"] = page
            payload = await self._get(path, query)
            data: list[dict[str, Any]] = payload.get("data") or []
            for item in data:
                yield item

            total = payload.get("totalCount")
            if not data or len(data) < self.page_size:
                break
            if total is not None and page * self.page_size >= total:
                break
            page += 1

    def iter_sets(self) -> AsyncIterator[dict[str, Any]]:
        """Yield every set, oldest first."""
        return self._paginate("/sets", {"orderBy": "releaseDate"})

    def iter_cards(self, set_id: str) -> AsyncIterator[dict[str, Any]]:
        """Yield every card in a set, ordered by card number."""
        return self._paginate("/cards", {"q": f"set.id:{set_id}", "orderBy": "number"})

    async def get_card(self, card_id: str) -> dict[str, Any] | None:
        """Fetch a single card by id (e.g. ``base1-4``), or None if the API has no such card."""
        payload = await self._get(f"/cards/{card_id}", {})
        return payload.get("data")
