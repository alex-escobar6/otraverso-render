"""GESTIÓN DE PÁGINAS: disponibilidad jerárquica de universos, páginas y experiencias."""
from __future__ import annotations

from app.core.http import Request, Response
from app.core.pages import (
    ACCESS_LABELS, STATUS_LABELS, STATUSES, element_state, public_pages,
    registered_element_map, registered_routes,
)
from app.core.render import date_label, esc, render
from app.db import execute, one, transaction

from . import admin_page, audit, csrf_input, go, int_or_none

ELEMENT_LABELS = {
    "universe": "Universo", "page": "Página", "hub": "HUB", "profile": "Perfil",
    "catalog": "Catálogo", "service": "Servicio", "game": "Juego",
    "experience": "Experiencia",
}


def register(router) -> None:
    router.get("/admin/pages", page_list, permission="pages.manage", name="admin.pages")
    router.get("/admin/pages/{pid}/edit", edit_form, permission="pages.manage", name="admin.pages.edit")
    router.post("/admin/pages/{pid}", save, permission="pages.manage", name="admin.pages.save")
    router.post("/admin/pages/{pid}/status", change_status, permission="pages.manage", name="admin.pages.status")


def _status_css(status: str) -> str:
    return {"available": "ok", "page_only": "warn", "coming_soon": "warn", "hidden": "bad"}.get(status, "")


def _status_options(selected: str) -> str:
    return "".join(
        f'<option value="{key}"{" selected" if key == selected else ""}>{label}</option>'
        for key, label in STATUS_LABELS.items()
    )


def page_list(request: Request) -> Response:
    rows = []
    for page in public_pages():
        state = element_state(page["code"])
        status = STATUS_LABELS.get(page["status"], page["status"])
        access = ACCESS_LABELS.get(state["status"], state["status"])
        blocker = state["blocker"]
        blocked_by = ""
        if blocker and blocker["code"] != page["code"]:
            blocked_by = f'Bloqueado por {blocker["name"]}'
        name = esc(page["name"])
        if page["parent_code"]:
            name = f'<span class="hint">↳</span> {name}'
        rows.append(
            f'<tr><td><strong>{name}</strong><br><small>{esc(page["code"])}</small></td>'
            f'<td>{esc(page["route"] or "—")}</td>'
            f'<td>{esc(ELEMENT_LABELS.get(page["element_type"], page["element_type"]))}</td>'
            f'<td>{esc(page["universe"])}</td>'
            f'<td><span class="status-tag {_status_css(page["status"])}">{status}</span></td>'
            f'<td>{esc(access)}</td>'
            f'<td>{esc(blocked_by or "—")}</td>'
            f'<td>{"Sí" if page["nav_visible"] else "No"}</td><td>{page["sort_order"]}</td>'
            f'<td>{esc(date_label(page["updated_at"]))}</td>'
            f'<td><a class="btn btn-sm" href="/admin/pages/{page["id"]}/edit">Editar</a>'
            f'<form method="post" action="/admin/pages/{page["id"]}/status" style="margin-top:.4rem">'
            f'{csrf_input(request)}<select name="status" aria-label="Estado de {esc(page["name"])}">'
            f'{_status_options(page["status"])}</select> '
            '<button class="btn btn-sm" type="submit">Aplicar</button></form></td></tr>'
        )
    content = render("admin/pages.html", CSRF=csrf_input(request),
                     ROWS="".join(rows) or '<tr><td colspan="11">No hay elementos registrados.</td></tr>')
    return admin_page(request, "Disponibilidad de páginas", content, "pages")


def edit_form(request: Request, pid: str) -> Response:
    page_id = int_or_none(pid)
    row = one("SELECT * FROM site_pages WHERE id=?", (page_id,)) if page_id else None
    if not row:
        return go("/admin/pages", error="Elemento no encontrado")
    if row["parent_code"]:
        route_field = (
            f'<input type="hidden" name="route" value="{esc(row["route"])}">'
            f'<input value="{esc(row["route"] or "Ruta no pública")}" readonly>'
            '<small class="hint">Las secciones internas conservan su ruta real.</small>'
        )
    else:
        route_options = "".join(
            f'<option value="{esc(route)}"{" selected" if route == row["route"] else ""}>{esc(route)} — {esc(label)}</option>'
            for route, label in registered_routes()
        )
        route_field = f'<select name="route">{route_options}</select>'
    state = element_state(row["code"])
    blocked_by = state["blocker"]["name"] if state["blocker"] and state["blocker"]["code"] != row["code"] else "—"
    content = render(
        "admin/page_form.html",
        CSRF=csrf_input(request), ID=row["id"], NAME=esc(row["name"]), DESCRIPTION=esc(row["description"]),
        ROUTE_FIELD=route_field, UNIVERSE=esc(row["universe"]), CATEGORY=esc(row["category"]),
        ELEMENT_TYPE=esc(ELEMENT_LABELS.get(row["element_type"], row["element_type"])),
        STATUS_OPTIONS=_status_options(row["status"]), ICON=esc(row["icon"]), IMAGE=esc(row["image"]),
        MESSAGE=esc(row["coming_soon_message"]), ORDER=row["sort_order"],
        NOTICE_TITLE=esc(row["notice_title"]), NOTICE_DESCRIPTION=esc(row["notice_description"]),
        NOTICE_BUTTON=esc(row["notice_button"]), NOTICE_IMAGE=esc(row["notice_image"]),
        NAV_CHECKED=" checked" if row["nav_visible"] else "", CODE=esc(row["code"]),
        BLOCKED_BY=esc(blocked_by), UPDATED=esc(date_label(row["updated_at"])),
    )
    return admin_page(request, "Editar disponibilidad — " + row["name"], content, "pages")


def _valid_image(value: str) -> bool:
    return not value or value.startswith(("/", "https://", "http://"))


def save(request: Request, pid: str) -> Response:
    page_id = int_or_none(pid)
    row = one("SELECT * FROM site_pages WHERE id=?", (page_id,)) if page_id else None
    if not row:
        return go("/admin/pages", error="Elemento no encontrado")
    name = request.param("name").strip()[:120]
    route = request.param("route")
    status = request.param("status")
    image = request.param("image").strip()[:300]
    notice_image = request.param("notice_image").strip()[:300]
    if not name:
        return go("/admin/pages", error="El nombre del elemento es obligatorio")
    allowed_routes = {page["route"] for page in registered_element_map().values() if page["route"]}
    if route not in allowed_routes:
        return go("/admin/pages", error="La ruta indicada no corresponde a una página existente")
    if row["parent_code"] and route != row["route"]:
        return go("/admin/pages", error="La ruta de una sección interna no se puede cambiar")
    if status not in STATUSES:
        return go("/admin/pages", error="Estado de disponibilidad no válido")
    if not _valid_image(image) or not _valid_image(notice_image):
        return go("/admin/pages", error="La imagen debe ser una ruta local o una URL http(s)")
    try:
        sort_order = max(-100, min(1000, int(request.param("sort_order", "0"))))
    except ValueError:
        sort_order = 0
    values = (
        name, request.param("description").strip()[:500], route,
        request.param("universe").strip()[:80], request.param("category").strip()[:80], status,
        request.param("icon").strip()[:80], image,
        request.param("notice_title").strip()[:120], request.param("notice_description").strip()[:500],
        request.param("notice_button").strip()[:80], notice_image,
        request.param("coming_soon_message").strip()[:500],
        sort_order, 1 if request.param("nav_visible") in {"1", "on", "true"} else 0, page_id,
    )
    with transaction() as conn:
        conn.execute(
            "UPDATE site_pages SET name=?, description=?, route=?, universe=?, category=?, status=?, "
            "icon=?, image=?, notice_title=?, notice_description=?, notice_button=?, notice_image=?, "
            "coming_soon_message=?, sort_order=?, nav_visible=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", values,
        )
    audit(request, "update", "site_page", page_id, details={"route": route, "status": status, "name": name})
    return go("/admin/pages", ok="Disponibilidad actualizada")


def change_status(request: Request, pid: str) -> Response:
    page_id = int_or_none(pid)
    status = request.param("status")
    if not page_id or status not in STATUSES:
        return go("/admin/pages", error="Estado de disponibilidad no válido")
    updated = execute(
        "UPDATE site_pages SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (status, page_id)
    )
    if not updated.rowcount:
        return go("/admin/pages", error="Elemento no encontrado")
    audit(request, "update", "site_page_status", page_id, details={"status": status})
    return go("/admin/pages", ok="Estado actualizado")
