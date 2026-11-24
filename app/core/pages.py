"""Registro y control de disponibilidad de las páginas públicas."""
from __future__ import annotations

from typing import Any

from app.db import PAGE_REGISTRY, query

STATUSES = ("available", "coming_soon", "hidden")
STATUS_LABELS = {
    "available": "DISPONIBLE",
    "coming_soon": "PRÓXIMAMENTE",
    "hidden": "OCULTA",
}


def public_pages() -> list[dict[str, Any]]:
    return [dict(row) for row in query("SELECT * FROM site_pages ORDER BY sort_order, id")]


def registered_routes() -> tuple[tuple[str, str], ...]:
    return tuple((page["route"], page["name"]) for page in PAGE_REGISTRY)


def _matches(path: str, prefix: str) -> bool:
    if prefix == "/":
        return path == "/"
    return path == prefix or path.startswith(prefix + "/")


def page_for_path(path: str) -> dict[str, Any] | None:
    for row in query("SELECT * FROM site_pages ORDER BY LENGTH(route) DESC, id"):
        spec = next((page for page in PAGE_REGISTRY if page["code"] == row["code"]), None)
        prefixes = (row["route"],) + tuple(spec["prefixes"] if spec else ())
        if any(_matches(path, prefix) for prefix in prefixes):
            return dict(row)
    return None


def guard_request(request: Any) -> dict[str, Any] | None:
    """Bloquea accesos según el estado de la página; el administrador siempre puede previsualizar."""
    from app.core.http import HTTPError

    page = page_for_path(request.path)
    if not page:
        return None
    if request.user and "pages.manage" in request.permission_codes:
        return page
    if page["status"] == "hidden":
        raise HTTPError(404, "Página no disponible", "page_hidden")
    if page["status"] == "coming_soon" and request.method == "POST":
        message = page["coming_soon_message"] or "Esta página estará disponible próximamente."
        raise HTTPError(403, message, "page_coming_soon")
    return page
