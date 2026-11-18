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
    DB_PATH = Path(env("DATABASE_PATH", str(DATA_DIR / "otraverso.db")))
    SECRET_KEY = _secret_key()
    HOST = env("HOST", "127.0.0.1")
    PORT = int(env("PORT", "8000"))
    DEBUG = env("DEBUG", "0") in {"1", "true", "True"}
    SESSION_HOURS = int(env("SESSION_HOURS", "12"))
    BASE_URL = env("BASE_URL", f"http://{HOST}:{PORT}").rstrip("/")
    ADMIN_EMAIL = env("ADMIN_EMAIL", "").strip().lower()
    ADMIN_PASSWORD = env("ADMIN_PASSWORD", "")
    WHATSAPP_DEFAULT = env("WHATSAPP_DEFAULT", "573000000000")
    MAX_UPLOAD_MB = int(env("MAX_UPLOAD_MB", "8"))
    CURRENCY = env("CURRENCY", "COP")


for _directory in (DATA_DIR, UPLOAD_DIR, BACKUP_DIR):
    _directory.mkdir(parents=True, exist_ok=True)
