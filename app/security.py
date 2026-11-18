"""Primitivas criptográficas y de sesión, sin dependencias externas."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from pathlib import Path

ITERATIONS = 210_000


def hash_password(password: str, *, salt: bytes | None = None, iterations: int = ITERATIONS) -> str:
    if not password or len(password) < 10:
        raise ValueError("La contraseña debe tener al menos 10 caracteres")
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def safe_equal(left: str, right: str) -> bool:
    return hmac.compare_digest(left, right)


def safe_filename(filename: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}
    if suffix not in allowed:
        suffix = ".png"
    return f"{uuid.uuid4().hex}{suffix}"
