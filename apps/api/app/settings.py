from functools import lru_cache
from pathlib import Path
from pydantic import BaseModel
import os


def _environment() -> str:
    return os.getenv("SYNTHETIC_RELIC_ENV", os.getenv("ENV", "development"))


def _is_production() -> bool:
    return _environment().lower() in {"prod", "production"}


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _allowed_origins() -> list[str]:
    raw = os.getenv("SYNTHETIC_RELIC_ORIGINS")
    if raw is None and _is_production():
        return []
    raw = raw or (
        "http://127.0.0.1:3000,http://localhost:3000,"
        "http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,"
        "http://localhost:5173,http://localhost:5174,http://localhost:5175"
    )
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    if _is_production():
        return [origin for origin in origins if origin != "*"]
    return origins


class Settings(BaseModel):
    environment: str = _environment()
    database_path: Path = Path(os.getenv("SYNTHETIC_RELIC_DB", "apps/api/relic.db"))
    admin_token: str | None = os.getenv("SYNTHETIC_RELIC_ADMIN_TOKEN")
    allow_insecure_admin: bool = _env_bool(
        "SYNTHETIC_RELIC_ALLOW_INSECURE_ADMIN",
        not _is_production(),
    )
    allowed_origins: list[str] = _allowed_origins()
    enforce_https: bool = _env_bool("SYNTHETIC_RELIC_ENFORCE_HTTPS", _is_production())
    max_body_bytes: int = _env_int("SYNTHETIC_RELIC_MAX_BODY_BYTES", 1_000_000)
    rate_limit_window_seconds: int = _env_int("SYNTHETIC_RELIC_RATE_LIMIT_WINDOW_SECONDS", 60)
    rate_limit_max_requests: int = _env_int("SYNTHETIC_RELIC_RATE_LIMIT_MAX_REQUESTS", 180)
    admin_session_ttl_seconds: int = _env_int("SYNTHETIC_RELIC_ADMIN_SESSION_TTL_SECONDS", 3600)
    agent_challenge_ttl_seconds: int = _env_int("SYNTHETIC_RELIC_AGENT_CHALLENGE_TTL_SECONDS", 300)
    require_agent_challenge: bool = _env_bool("SYNTHETIC_RELIC_REQUIRE_AGENT_CHALLENGE", True)
    registration_intent_ttl_seconds: int = _env_int(
        "SYNTHETIC_RELIC_REGISTRATION_INTENT_TTL_SECONDS",
        86400,
    )
    backup_interval_minutes: int = _env_int(
        "SYNTHETIC_RELIC_BACKUP_INTERVAL_MINUTES",
        360 if _is_production() else 0,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
