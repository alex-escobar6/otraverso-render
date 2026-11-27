"""Acceso privado y escena 3D del compañero dragón de DRACONIA."""
from __future__ import annotations

import json
from pathlib import Path

from app.config import Config
from app.core.auth import login as auth_login, logout as auth_logout, public_csrf_token
from app.core.http import HTTPError, Request, Response, redirect
from app.core.render import esc, render
from app.db import audit as db_audit
from app.db import one, query
from app.services.draconia import profile

from . import PREFIX, allowed

PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow"}
ASSET_BASE = "/static/draconia/1.0.0/"
DRAGON_CONFIG_PATH = Path(__file__).resolve().parents[2] / "static" / "draconia" / "1.0.0" / "assets" / "dragon.config.json"


def _dragon_assets() -> dict:
    try:
        model = json.loads(DRAGON_CONFIG_PATH.read_text(encoding="utf-8"))
        if not isinstance(model, dict):
            model = {}
    except (OSError, ValueError):
        model = {}
    path = str(model.get("path") or "assets/dragon_organic/dragon.glb").strip().lstrip("/")
    payload = dict(model)
    payload["path"] = path
    return {"base": ASSET_BASE, "dragon": ASSET_BASE + path, "model": payload}


def _cookie(token: str) -> str:
    value = (f"otraverso_session={token}; HttpOnly; SameSite=Lax; Path=/; "
             f"Max-Age={Config.SESSION_HOURS * 3600}")
    if Config.BASE_URL.startswith("https://"):
        value += "; Secure"
    return value


def _has_access(email: str) -> bool:
    row = one(
        "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id "
        "JOIN role_permissions rp ON rp.role_id=r.id "
        "JOIN permissions p ON p.id=rp.permission_id "
        "WHERE u.email=? AND u.active=1 AND p.code='draconia.view' LIMIT 1",
        (email.strip().lower(),),
    )
    return row is not None


def login_form(request: Request) -> Response:
    if allowed(request):
        return redirect(PREFIX)
    body = render("draconia/login.html", CSRF=esc(public_csrf_token()),
                  ERROR=(" Credenciales inválidas o cuenta sin acceso al compañero 3D."
                         if request.query.get("error") else ""))
    return Response(body, headers=PRIVATE_HEADERS)


def login_submit(request: Request) -> Response:
    attempts = query(
        "SELECT COUNT(*) AS total FROM audit_log WHERE action='draconia_login_failed' AND ip=? "
        "AND created_at > datetime('now','-15 minutes')", (request.ip,)
    )[0]["total"]
    if attempts >= 8:
        raise HTTPError(429, "Demasiados intentos. Intente nuevamente en unos minutos")
    email = request.param("email")
    token = auth_login(email, request.param("password"), request)
    if not token or not _has_access(email):
        if token:
            auth_logout(request)
        db_audit(None, "draconia_login_failed", "session",
                 details={"email": email[:120]}, ip=request.ip)
        return redirect(PREFIX + "/entrar?error=1")
    user = one("SELECT id FROM users WHERE email=?", (email.strip().lower(),))
    db_audit(user["id"], "draconia_login", "session", ip=request.ip)
    response = redirect(PREFIX)
    response.headers["Set-Cookie"] = _cookie(token)
    return response


def logout(request: Request) -> Response:
    if request.user:
        db_audit(request.user["id"], "draconia_logout", "session", ip=request.ip)
    auth_logout(request)
    response = redirect(PREFIX + "/entrar")
    response.headers["Set-Cookie"] = "otraverso_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    return response


def shell(request: Request) -> Response:
    if not request.user:
        raise HTTPError(401, "Debe iniciar sesión para entrar en DRACONIA")
    user = profile.build(request.user["id"])
    data = {
        "version": 4,
        "api": PREFIX + "/api/v1",
        "csrf": request.csrf_token,
        "user": {
            "id": request.user["id"],
            "name": request.user["name"],
            "creator": "draconia.manage" in request.permission_codes,
        },
        "profile": user,
        "capabilities": {
            "renderer": "three",
            "animations": list(profile.ANIMATIONS),
            "states": list(profile.STATES),
            "transitions": {key: sorted(value) for key, value in profile.TRANSITIONS.items()},
            "last_state": user["last_state"],
            "reduced_motion": user["reduced_motion"],
        },
        "assets": _dragon_assets(),
    }
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    content = render("draconia/shell.html",
                     TITLE="DRACONIA",
                     SUBTITLE="Un espacio pequeño para estar con tu dragón",
                     DRAGON_NAME=esc(user["dragon_name"]),
                     OWNER=esc(request.user["name"]),
                     CSRF=esc(request.csrf_token))
    body = render("draconia/base.html",
                  TITLE="DRACONIA — Compañero 3D",
                  CONTENT=content,
                  CONFIG=payload,
                  ASSET_BASE=esc(ASSET_BASE),
                  GFX_SRC="/static/js/webgl-runtime.js",
                  VENDOR_SRC="/static/js/vendor/three.min.js",
                  LOADER_SRC="/static/js/vendor/GLTFLoader.js",
                  WORLD_SRC=esc(ASSET_BASE + "world.js"),
                  APP_SRC=esc(ASSET_BASE + "draconia.js"))
    return Response(body, headers=PRIVATE_HEADERS)
