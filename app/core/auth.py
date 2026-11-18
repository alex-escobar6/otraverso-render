"""Autenticación, permisos y tokens CSRF para formularios públicos y administrativos."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone

from app.config import Config
from app.core.http import HTTPError, Request
from app.db import execute, one, query
from app.security import generate_token, hash_token, verify_password

SESSION_COOKIE = "otraverso_session"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def load_session(request: Request) -> None:
    token = request.cookies.get(SESSION_COOKIE, "")
    if not token:
        return
    row = one(
        "SELECT s.id AS session_id, s.user_id AS id, s.token_hash, s.csrf_token, s.expires_at, "
        "s.ip, s.user_agent, s.created_at AS session_created_at, "
        "u.name AS name, u.email, u.role_id, r.code AS role_code, u.active "
        "FROM sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=u.role_id "
        "WHERE s.token_hash=? AND s.expires_at > ?",
        (hash_token(token), _now()),
    )
    if not row or not row["active"]:
        return
    request.session = row
    request.user = row
    request.csrf_token = row["csrf_token"]
    request.permission_codes = {
        r[0] for r in query(
            "SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id "
            "WHERE rp.role_id=?", (row["role_id"],)
        )
    }


def login(email: str, password: str, request: Request) -> str | None:
    email = email.strip().lower()
    user = one("SELECT * FROM users WHERE email=? AND active=1", (email,))
    if not user or not verify_password(password, user["password_hash"]):
        return None
    token = generate_token()
    expires = datetime.now(timezone.utc) + timedelta(hours=Config.SESSION_HOURS)
    execute(
        "INSERT INTO sessions(user_id,token_hash,csrf_token,expires_at,ip,user_agent) VALUES (?,?,?,?,?,?)",
        (user["id"], hash_token(token), generate_token(),
         expires.strftime("%Y-%m-%d %H:%M:%S"), request.ip, request.user_agent),
    )
    execute("UPDATE users SET last_login_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (_now(), user["id"]))
    return token


def logout(request: Request) -> None:
    if request.session:
        execute("DELETE FROM sessions WHERE id=?", (request.session["session_id"],))


def require_permission(request: Request, permission: str | None) -> None:
    if not permission:
        return
    if not request.user:
        raise HTTPError(401, "Debe iniciar sesión")
    if permission not in request.permission_codes:
        raise HTTPError(403, "No tiene permiso para esta sección")


def require_user(request: Request) -> None:
    if not request.user:
        raise HTTPError(401, "Debe iniciar sesión")


def check_csrf(request: Request) -> None:
    sent = request.param("csrf", "")
    if request.user and request.session:
        valid = bool(sent) and hmac.compare_digest(sent, request.session["csrf_token"])
    else:
        valid = verify_public_csrf(sent)
    if not valid:
        raise HTTPError(400, "Token de seguridad inválido o expirado")


def public_csrf_token() -> str:
    expires = int(time.time()) + 3600
    nonce = secrets.token_hex(12)
    payload = f"{expires}.{nonce}"
    signature = hmac.new(Config.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
    return f"{payload}.{signature}"


def verify_public_csrf(token: str) -> bool:
    try:
        expires_s, nonce, signature = token.split(".")
        expires = int(expires_s)
        now = int(time.time())
        if expires < now or expires > now + 7200:
            return False
        payload = f"{expires_s}.{nonce}"
        expected = hmac.new(Config.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
        return hmac.compare_digest(signature, expected) and len(nonce) >= 16
    except (ValueError, AttributeError):
        return False
