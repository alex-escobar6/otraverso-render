"""Aplicación WSGI de OTRAVERSO: middleware, enrutamiento y archivos estáticos."""
from __future__ import annotations

import mimetypes
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path

from app.config import DATA_DIR, STATIC_DIR, Config
from app.core.auth import SESSION_COOKIE, check_csrf, load_session, require_permission
from app.core.http import HTTPError, Request, Response, Router, error_page, json_response
from app.core.pages import UNSAFE_METHODS, guard_request, guard_static_asset
from app.db import init_db
from app.modules import admin, draconia, play, portal, shop, whatif
from app.services import storage
from app.services.analytics import track_visit


def create_app() -> Router:
    init_db()
    router = Router()
    portal.register(router)
    play.register(router)
    shop.register(router)
    whatif.register(router)
    draconia.register(router)
    admin.register(router)
    return router


def _serve_file(path: Path) -> Response:
    if not path.exists() or not path.is_file():
        raise HTTPError(404, "Archivo no encontrado")
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if content_type.startswith("text/") or content_type in {"application/javascript", "application/json", "image/svg+xml"}:
        content_type += "; charset=utf-8"
    return Response(path.read_bytes(), content_type=content_type,
                    headers={"Cache-Control": "public, max-age=3600"})


def _static(path: str, root: Path) -> Response:
    relative = path.lstrip("/")
    candidate = (root / relative).resolve()
    if root.resolve() not in candidate.parents and candidate != root.resolve():
        raise HTTPError(403, "Ruta no permitida")
    return _serve_file(candidate)


def _log_exception(exc: Exception) -> None:
    if Config.LOG_TO_STDOUT:
        print(f"[{datetime.now().isoformat(timespec='seconds')}] {type(exc).__name__}: {exc}", flush=True)
        traceback.print_exc()
        return
    log = DATA_DIR / "errors.log"
    with log.open("a", encoding="utf-8") as handle:
        handle.write(f"\n[{datetime.now().isoformat(timespec='seconds')}] {type(exc).__name__}: {exc}\n")
        handle.write(traceback.format_exc())


_RATE_LOCK = threading.Lock()
_RATE_BUCKETS: dict[tuple[str, int], int] = {}


def _rate_limited(ip: str) -> bool:
    if Config.RATE_LIMIT_PER_MINUTE <= 0:
        return False
    window = int(time.time() // 60)
    key = (ip or "unknown", window)
    with _RATE_LOCK:
        for existing in list(_RATE_BUCKETS):
            if existing[1] < window:
                _RATE_BUCKETS.pop(existing, None)
        count = _RATE_BUCKETS.get(key, 0) + 1
        _RATE_BUCKETS[key] = count
    return count > Config.RATE_LIMIT_PER_MINUTE


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET").upper()
    request = Request.from_environ(environ)
    if method == "HEAD":
        method = "GET"
    try:
        if request.path == "/health":
            payload = {"ok": True, "status": "ok", "service": "otraverso", "db": Config.DB_BACKEND}
            return json_response(payload, 200)(environ, start_response)
        if request.path.startswith("/static/"):
            load_session(request)
            guard_static_asset(request, request.path[len("/static"):])
            return _static(request.path[len("/static"):], STATIC_DIR)(environ, start_response)
        if request.path.startswith("/uploads/"):
            name = request.path[len("/uploads/"):].split("/", 1)[0]
            asset = storage.read_upload(name)
            if asset is None:
                raise HTTPError(404, "Archivo no encontrado")
            content, content_type = asset
            if content_type.startswith("text/") or content_type in {"application/javascript", "application/json", "image/svg+xml"}:
                content_type += "; charset=utf-8"
            return Response(content, content_type=content_type,
                            headers={"Cache-Control": "public, max-age=3600"})(environ, start_response)
        if _rate_limited(request.ip):
            raise HTTPError(429, "Demasiadas solicitudes. Intente nuevamente en unos segundos", "rate_limited")

        load_session(request)
        guard_request(request)
        if request.method in UNSAFE_METHODS:
            check_csrf(request)
        if method == "GET" and not request.path.startswith("/admin"):
            track_visit(request)

        handler, kwargs, permission = getattr(application, "router").match(method, request.path)
        require_permission(request, permission)
        response = handler(request, **kwargs)
        response.headers["X-Request-ID"] = request.request_id
        if getattr(request, "renew_session", False) and request.cookies.get(SESSION_COOKIE):
            cookie = (f"{SESSION_COOKIE}={request.cookies[SESSION_COOKIE]}; HttpOnly; SameSite=Lax; "
                      f"Path=/; Max-Age={Config.SESSION_HOURS * 3600}")
            if Config.BASE_URL.startswith("https://") or request.scheme == "https":
                cookie += "; Secure"
            response.headers["Set-Cookie"] = cookie
        if method == "GET" and environ.get("REQUEST_METHOD") == "HEAD":
            response.body = b""
        return response(environ, start_response)
    except HTTPError as exc:
        is_api = request.path.startswith(("/api/", "/draconia/api/"))
        if is_api and exc.status >= 400:
            line = f"{datetime.now().isoformat(timespec='seconds')} {exc.status} {request.path} {exc.message}"
            if Config.LOG_TO_STDOUT:
                print(line, flush=True)
            else:
                with (DATA_DIR / "api-errors.log").open("a", encoding="utf-8") as handle:
                    handle.write(line + "\n")
            if request.path.startswith("/api/what-if/v1/"):
                stage = ("validacion_csrf" if exc.code in {"csrf_invalid", "csrf_expired", "session_expired"}
                         else "middleware")
                whatif.log_api_event(request.request_id, stage, exc.status,
                                     exc.code or "request_failed", type(exc).__name__, request)
        payload = {"ok": False, "error": exc.message}
        if exc.code:
            payload["code"] = exc.code
        response = (json_response(payload, exc.status)
                    if is_api else error_page(exc.status, exc.message))
        response.headers["X-Request-ID"] = request.request_id
        return response(environ, start_response)
    except Exception as exc:
        _log_exception(exc)
        if Config.DEBUG:
            raise
        response = (json_response({"ok": False, "error": "Ocurrió un error inesperado"}, 500)
                    if request.path.startswith(("/api/", "/draconia/api/"))
                    else error_page(500, "Ocurrió un error inesperado"))
        response.headers["X-Request-ID"] = request.request_id
        return response(environ, start_response)


application.router = create_app()
