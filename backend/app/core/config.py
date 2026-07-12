"""Application configuration, loaded from the environment / .env file."""

from __future__ import annotations

from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings.

    Values are read from environment variables, falling back to a local `.env` file.
    See `.env.example` for the full list of supported variables.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    APP_NAME: str = "PokeVault"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # Public origin of the web app (Vercel), used to build absolute URLs in the sitemap so
    # they point at the indexable SPA pages rather than the API host. No trailing slash.
    PUBLIC_WEB_ORIGIN: str = "http://localhost:5173"

    # Database (Supabase-managed Postgres)
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/postgres",
        description="Async SQLAlchemy database URL (asyncpg driver).",
    )

    # pokemontcg.io (card & set catalog + pricing)
    POKEMONTCG_API_KEY: str | None = None
    POKEMONTCG_API_BASE: str = "https://api.pokemontcg.io/v2"

    # Portfolio valuation is single-currency USD. CardMarket prices are quoted in EUR, so a
    # card priced only on CardMarket is converted with this rate before it enters any USD
    # total (we never add EUR magnitudes to USD ones). A configurable daily-ish constant is
    # enough for a heuristic valuation; override via the env when a fresher rate is wanted.
    EUR_USD_RATE: float = 1.08

    # Auth (Supabase). The backend verifies Supabase-issued access tokens; it does not
    # issue its own. Only the project URL is needed — public signing keys are fetched
    # from the JWKS endpoint below. No shared secret is stored server-side.
    SUPABASE_URL: str | None = None  # e.g. https://<project-ref>.supabase.co
    SUPABASE_JWT_AUD: str = "authenticated"

    @property
    def supabase_issuer(self) -> str:
        """The `iss` claim Supabase stamps on access tokens."""
        if not self.SUPABASE_URL:
            raise RuntimeError("SUPABASE_URL is not configured.")
        return f"{self.SUPABASE_URL.rstrip('/')}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        """Discovery endpoint for the project's public signing keys."""
        return f"{self.supabase_issuer}/.well-known/jwks.json"

    # CORS. NoDecode stops pydantic-settings from JSON-parsing the env value so the
    # validator below can accept a plain comma-separated string (e.g. "a,b,c").
    # localhost and 127.0.0.1 are distinct CORS origins — allow both so the Vite
    # dev server works regardless of which host it binds to.
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Regex matching every Vercel hostname for this project: stable aliases
    # (poke-vault-eta, poke-vault-ace67), branch aliases (poke-vault-git-main-ace67), and
    # per-deploy / preview hosts (poke-vault-<hash>-ace67). Vercel mints a new hostname per
    # deploy, so an exact allow-list can't cover them — the regex does. Env-overridable.
    BACKEND_CORS_ORIGIN_REGEX: str | None = r"https://poke-vault-[a-z0-9-]+\.vercel\.app"

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Allow a comma-separated string in the environment."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


settings = Settings()
