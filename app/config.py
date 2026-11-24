"""Configuración central de OTRAVERSO.

Las variables de entorno tienen prioridad sobre el archivo .env. El secreto de sesiones
se genera una sola vez en data/secret.key si no se definió SECRET_KEY; en producción
debe definirse explícitamente.
"""
from __future__ import annotations

import os
import secrets
import stat
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
BACKUP_DIR = DATA_DIR / "backups"
TEMPLATE_DIR = BASE_DIR / "app" / "templates"
STATIC_DIR = BASE_DIR / "app" / "static"


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(BASE_DIR / ".env")


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def _flag(name: str, default: bool = False) -> bool:
    return env(name, "1" if default else "0").strip().lower() in {"1", "true", "yes", "on"}


def _positive_int(name: str, default: int) -> int:
    try:
        return max(1, int(env(name, str(default))))
    except ValueError:
        return default


def _secret_key() -> str:
    configured = env("SECRET_KEY").strip()
    if configured:
        return configured
    path = DATA_DIR / "secret.key"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(secrets.token_urlsafe(48), encoding="utf-8")
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    return path.read_text(encoding="utf-8").strip()


class Config:
    RENDER = _flag("RENDER") or bool(env("RENDER_GIT_COMMIT"))
    PRODUCTION = _flag("PRODUCTION") or RENDER
    DB_PATH = Path(env("DATABASE_PATH", str(DATA_DIR / "otraverso.db")))
    DATABASE_URL = env("DATABASE_URL", "").strip() or env("POSTGRES_URL", "").strip()
    DB_BACKEND = "postgres" if DATABASE_URL.lower().startswith(("postgres://", "postgresql://")) else "sqlite"
    SECRET_KEY = _secret_key()
    HOST = env("HOST", "0.0.0.0" if RENDER or PRODUCTION else "127.0.0.1")
    PORT = _positive_int("PORT", 8000)
    DEBUG = _flag("DEBUG")
    SESSION_HOURS = _positive_int("SESSION_HOURS", 12)
    BASE_URL = env("BASE_URL", "").strip().rstrip("/") or f"http://localhost:{PORT}"
    ADMIN_EMAIL = env("ADMIN_EMAIL", "").strip().lower()
    ADMIN_PASSWORD = env("ADMIN_PASSWORD", "")
    WHATSAPP_DEFAULT = env("WHATSAPP_DEFAULT", "573000000000")
    MAX_UPLOAD_MB = _positive_int("MAX_UPLOAD_MB", 8)
    CURRENCY = env("CURRENCY", "COP")
    WHATIF_API_KEY = env("WHATIF_API_KEY", "")
    WHATIF_IMAGE_API_KEY = env("WHATIF_IMAGE_API_KEY", "")
    WHATIF_DEBUG = _flag("WHATIF_DEBUG")
    TRUST_PROXY = _flag("TRUST_PROXY", RENDER or PRODUCTION)
    RATE_LIMIT_PER_MINUTE = _positive_int("RATE_LIMIT_PER_MINUTE", 600)
    LOG_TO_STDOUT = _flag("LOG_TO_STDOUT", RENDER or PRODUCTION)
    STORAGE_BACKEND = (env("STORAGE_BACKEND", "").strip().lower()
                       or ("supabase" if env("SUPABASE_URL", "").strip() and env("SUPABASE_SERVICE_ROLE_KEY", "").strip() else "local"))
    SUPABASE_URL = env("SUPABASE_URL", "").strip().rstrip("/")
    SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    SUPABASE_STORAGE_BUCKET = env("SUPABASE_STORAGE_BUCKET", "otraverso").strip()


if Config.RENDER:
    _missing = []
    if not Config.DATABASE_URL:
        _missing.append("DATABASE_URL")
    if not env("SECRET_KEY").strip():
        _missing.append("SECRET_KEY")
    if not Config.ADMIN_EMAIL or not Config.ADMIN_PASSWORD:
        _missing.append("ADMIN_EMAIL y ADMIN_PASSWORD")
    if Config.STORAGE_BACKEND != "supabase":
        _missing.append("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_STORAGE_BUCKET")
    if _missing:
        raise RuntimeError("Variables obligatorias en Render: " + ", ".join(_missing))


for _directory in (DATA_DIR, UPLOAD_DIR, BACKUP_DIR):
    _directory.mkdir(parents=True, exist_ok=True)
