"""Aplicación WSGI de OTRAVERSO: middleware, enrutamiento y archivos estáticos."""
from __future__ import annotations

import mimetypes
import traceback
from datetime import datetime
from pathlib import Path

from app.config import DATA_DIR, STATIC_DIR, UPLOAD_DIR, Config
from app.core.auth import check_csrf, load_session, require_permission
from app.core.http import HTTPError, Request, Response, Router, error_page
from app.db import init_db
from app.modules import admin, play, portal, shop
from app.services.analytics import track_visit


def create_app() -> Router:
    init_db()
    router = Router()
    portal.register(router)
    play.register(router)
    shop.register(router)
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
    log = DATA_DIR / "errors.log"
    with log.open("a", encoding="utf-8") as handle:
        handle.write(f"\n[{datetime.now().isoformat(timespec='seconds')}] {type(exc).__name__}: {exc}\n")
        handle.write(traceback.format_exc())


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET").upper()
    request = Request.from_environ(environ)
    if method == "HEAD":
        method = "GET"
    try:
        if request.path.startswith("/static/"):
            return _static(request.path[len("/static"):], STATIC_DIR)(environ, start_response)
        if request.path.startswith("/uploads/"):
            return _static(request.path[len("/uploads"):], UPLOAD_DIR)(environ, start_response)

        load_session(request)
        if request.method == "POST":
            check_csrf(request)
        if method == "GET" and not request.path.startswith("/admin"):
            track_visit(request)

        handler, kwargs, permission = getattr(application, "router").match(method, request.path)
        require_permission(request, permission)
        response = handler(request, **kwargs)
        if method == "GET" and environ.get("REQUEST_METHOD") == "HEAD":
            response.body = b""
        return response(environ, start_response)
    except HTTPError as exc:
        return error_page(exc.status, exc.message)(environ, start_response)
    except Exception as exc:
        _log_exception(exc)
        if Config.DEBUG:
            raise
        return error_page(500, "Ocurrió un error inesperado")(environ, start_response)


application.router = create_app()
