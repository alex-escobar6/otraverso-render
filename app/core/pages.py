"""Registro y control granular de disponibilidad de las páginas públicas."""
from __future__ import annotations

import html
from typing import Any

from app.db import (
    PAGE_ELEMENT_REGISTRY, PAGE_REGISTRY, one, play_element_code, query,
)
from app.services.play.catalog import GAMES

STATUSES = ("available", "page_only", "coming_soon", "hidden")
STATUS_LABELS = {
    "available": "COMPLETAMENTE DISPONIBLE",
    "page_only": "SOLO PÁGINA VISIBLE",
    "coming_soon": "VISIBLE, PERO NO ACCESIBLE",
    "hidden": "COMPLETAMENTE OCULTA",
}
ACCESS_LABELS = {
    "available": "ACCESO HABILITADO",
    "page_only": "SOLO PRESENTACIÓN",
    "coming_soon": "ACCESO BLOQUEADO",
    "hidden": "SIN ACCESO",
}
INFORMATIONAL_TYPES = {"universe", "page"}
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
STATEFUL_GET_PATHS = ("/api/play/v1/progress",)


def _esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def _rows_map() -> dict[str, dict[str, Any]]:
    return {row["code"]: dict(row) for row in query("SELECT * FROM site_pages")}


def public_pages() -> list[dict[str, Any]]:
    return [dict(row) for row in query(
        "SELECT * FROM site_pages ORDER BY CASE WHEN parent_code='' THEN 0 ELSE 1 END, "
        "universe, parent_code, sort_order, id"
    )]


def registered_routes() -> tuple[tuple[str, str], ...]:
    return tuple((page["route"], page["name"]) for page in PAGE_REGISTRY)


def registered_page_map() -> dict[str, dict]:
    return {page["code"]: page for page in PAGE_REGISTRY}


def registered_element_map() -> dict[str, dict]:
    return {page["code"]: page for page in PAGE_ELEMENT_REGISTRY}


def play_game_code(game_code: str) -> str:
    return play_element_code(game_code)


def _matches(path: str, prefix: str) -> bool:
    if not prefix:
        return False
    if prefix == "/":
        return path == "/"
    return path == prefix or path.startswith(prefix + "/")


def page_for_path(path: str) -> dict[str, Any] | None:
    for row in query("SELECT * FROM site_pages WHERE route<>'' ORDER BY LENGTH(route) DESC, id"):
        spec = next((page for page in PAGE_ELEMENT_REGISTRY if page["code"] == row["code"]), None)
        prefixes = (row["route"],) + tuple(spec.get("prefixes", ()) if spec else ())
        if any(_matches(path, prefix) for prefix in prefixes):
            return dict(row)
    return None


def element_row(code: str) -> dict[str, Any] | None:
    row = one("SELECT * FROM site_pages WHERE code=?", (code,))
    return dict(row) if row else None


def element_state(code: str, rows: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    rows = rows if rows is not None else _rows_map()
    row = rows.get(code)
    if not row:
        return {"row": None, "status": "available", "own_status": "available",
                "blocker": None, "visible": True, "accessible": True}
    chain: list[dict[str, Any]] = []
    seen: set[str] = set()
    current: dict[str, Any] | None = row
    while current and current["code"] not in seen:
        chain.append(current)
        seen.add(current["code"])
        parent = current.get("parent_code") or ""
        current = rows.get(parent) if parent else None
    status = "available"
    blocker = None
    for item in reversed(chain):
        item_status = item["status"]
        if item_status == "hidden":
            status, blocker = "hidden", item
        elif status == "available" and item_status in {"page_only", "coming_soon"}:
            status, blocker = item_status, item
    return {
        "row": row,
        "status": status,
        "own_status": row["status"],
        "blocker": blocker,
        "visible": status != "hidden",
        "accessible": status == "available",
    }


def resolve_path(path: str) -> dict[str, Any] | None:
    page = page_for_path(path)
    if not page:
        return None
    state = element_state(page["code"])
    page["_state"] = state
    page["_effective_status"] = state["status"]
    page["_blocker"] = state["blocker"]
    return page


def visibility_for_path(path: str) -> dict[str, Any] | None:
    page = resolve_path(path)
    return page["_state"] if page else None


def is_visible(code: str) -> bool:
    return element_state(code)["visible"]


def is_available(code: str) -> bool:
    return element_state(code)["accessible"]


def is_admin_preview(request: Any) -> bool:
    return bool(getattr(request, "user", None)
                and "pages.manage" in getattr(request, "permission_codes", set()))


def notice_message(page: dict[str, Any], state: dict[str, Any]) -> str:
    source = state.get("blocker") or page
    title = source.get("notice_title") or source.get("name") or "Contenido no disponible"
    description = (source.get("notice_description")
                   or source.get("coming_soon_message") or "")
    return f"{title}: {description}" if description else str(title)


def guard_request(request: Any) -> dict[str, Any] | None:
    """Bloquea accesos según el estado efectivo; el administrador puede previsualizar."""
    from app.core.http import HTTPError

    page = resolve_path(request.path)
    if not page:
        return None
    if is_admin_preview(request):
        return page
    state = page["_state"]
    status = state["status"]
    if status == "hidden":
        raise HTTPError(404, "Página no disponible", "page_hidden")
    if status == "available":
        return page

    source = state.get("blocker") or page
    message = notice_message(page, state)
    code = "page_coming_soon" if status == "coming_soon" else "page_only"
    is_service = page.get("element_type") == "service" or request.path.startswith("/api/")
    blocked_method = request.method in UNSAFE_METHODS or (
        request.method in {"GET", "HEAD"} and request.path in STATEFUL_GET_PATHS
    )
    informational_page = (
        status in {"page_only", "coming_soon"}
        and page.get("element_type") in INFORMATIONAL_TYPES
        and state.get("blocker")
        and state["blocker"]["code"] == page["code"]
    )
    if is_service or blocked_method or not informational_page:
        raise HTTPError(403, message, code)
    return page


def page_banner(path: str, request: Any) -> str:
    page = resolve_path(path)
    if not page or is_admin_preview(request):
        return ""
    state = page["_state"]
    if state["status"] not in {"page_only", "coming_soon"}:
        return ""
    blocker = state.get("blocker")
    if blocker and blocker["code"] != page["code"]:
        return ""
    source = blocker or page
    label = "SOLO PÁGINA VISIBLE" if state["status"] == "page_only" else "PRÓXIMAMENTE"
    title = source.get("notice_title") or source.get("name") or ""
    description = source.get("notice_description") or source.get("coming_soon_message") or ""
    button = source.get("notice_button") or ""
    image = source.get("notice_image") or ""
    parts = [f'<div class="page-status-banner" role="status"><strong>{_esc(label)} · {_esc(title)}</strong>']
    if description:
        parts.append(f'<span>{_esc(description)}</span>')
    if button:
        parts.append(f'<span class="page-status-banner__note">{_esc(button)}</span>')
    if image:
        parts.append(f'<img class="page-status-banner__image" src="{_esc(image)}" alt="">')
    parts.append("</div>")
    return "".join(parts)


def _play_static_assets() -> dict[str, str]:
    assets: dict[str, str] = {}
    for game in GAMES.values():
        code = play_element_code(game["code"])
        for path in [game.get("entry", ""), *game.get("css", [])]:
            if path.startswith("/static/") and "/vendor/" not in path:
                assets[path] = code
        if game.get("route", "").startswith("/play/games/"):
            assets[f"/static/play/games/{game['code']}/"] = code
    assets["/static/play/hub/"] = "play_hub"
    return assets


_PLAY_STATIC_ASSETS = sorted(_play_static_assets().items(), key=lambda item: len(item[0]), reverse=True)


def guard_static_asset(request: Any, static_path: str) -> None:
    from app.core.http import HTTPError

    if is_admin_preview(request):
        return
    full_path = "/static/" + static_path.lstrip("/")
    for asset, code in _PLAY_STATIC_ASSETS:
        if full_path == asset or full_path.startswith(asset):
            if not is_available(code):
                raise HTTPError(404, "Recurso no disponible", "asset_unavailable")
            return
