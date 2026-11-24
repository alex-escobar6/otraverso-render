"""GESTIÓN DE PÁGINAS: disponibilidad, navegación y acceso de las páginas públicas."""
from __future__ import annotations

from app.core.http import Request, Response
from app.core.pages import STATUS_LABELS, STATUSES, public_pages, registered_routes
from app.core.render import esc, render
from app.db import execute, one, transaction

from . import admin_page, audit, csrf_input, go, int_or_none


def register(router) -> None:
    router.get("/admin/pages", page_list, permission="pages.manage", name="admin.pages")
    router.get("/admin/pages/{pid}/edit", edit_form, permission="pages.manage", name="admin.pages.edit")
    router.post("/admin/pages/{pid}", save, permission="pages.manage", name="admin.pages.save")
    router.post("/admin/pages/{pid}/status", change_status, permission="pages.manage", name="admin.pages.status")


def _status_css(status: str) -> str:
    return {"available": "ok", "coming_soon": "warn", "hidden": "bad"}.get(status, "")


def page_list(request: Request) -> Response:
    rows = []
    for page in public_pages():
        status = STATUS_LABELS.get(page["status"], page["status"])
        options = "".join(
            f'<option value="{key}"{" selected" if key == page["status"] else ""}>{label}</option>'
            for key, label in STATUS_LABELS.items()
        )
        rows.append(
            f'<tr><td><strong>{esc(page["name"])}</strong><br><small>{esc(page["code"])}</small></td>'
            f'<td>{esc(page["route"])}</td><td>{esc(page["universe"])}</td>'
            f'<td>{esc(page["category"])}</td>'
            f'<td><span class="status-tag {_status_css(page["status"])}">{status}</span></td>'
            f'<td>{"Sí" if page["nav_visible"] else "No"}</td><td>{page["sort_order"]}</td>'
            f'<td><a class="btn btn-sm" href="/admin/pages/{page["id"]}/edit">Editar</a>'
            f'<form method="post" action="/admin/pages/{page["id"]}/status" style="margin-top:.4rem">'
            f'{csrf_input(request)}<select name="status" aria-label="Estado de {esc(page["name"])}">{options}</select> '
            '<button class="btn btn-sm" type="submit">Aplicar</button></form></td></tr>'
        )
    content = render("admin/pages.html", CSRF=csrf_input(request),
                     ROWS="".join(rows) or '<tr><td colspan="8">No hay páginas registradas.</td></tr>')
    return admin_page(request, "Gestión de páginas", content, "pages")


def edit_form(request: Request, pid: str) -> Response:
    page_id = int_or_none(pid)
    row = one("SELECT * FROM site_pages WHERE id=?", (page_id,)) if page_id else None
    if not row:
        return go("/admin/pages", error="Página no encontrada")
    route_options = "".join(
        f'<option value="{esc(route)}"{" selected" if route == row["route"] else ""}>{esc(route)} — {esc(label)}</option>'
        for route, label in registered_routes()
    )
    status_options = "".join(
        f'<option value="{key}"{" selected" if key == row["status"] else ""}>{label}</option>'
        for key, label in STATUS_LABELS.items()
    )
    content = render(
        "admin/page_form.html",
        CSRF=csrf_input(request), ID=row["id"], NAME=esc(row["name"]), DESCRIPTION=esc(row["description"]),
        ROUTE_OPTIONS=route_options, UNIVERSE=esc(row["universe"]), CATEGORY=esc(row["category"]),
        STATUS_OPTIONS=status_options, ICON=esc(row["icon"]), IMAGE=esc(row["image"]),
        MESSAGE=esc(row["coming_soon_message"]), ORDER=row["sort_order"],
        NAV_CHECKED=" checked" if row["nav_visible"] else "", CODE=esc(row["code"]),
    )
    return admin_page(request, "Editar página — " + row["name"], content, "pages")


def _valid_image(value: str) -> bool:
    return not value or value.startswith(("/", "https://", "http://"))


def save(request: Request, pid: str) -> Response:
    page_id = int_or_none(pid)
    row = one("SELECT * FROM site_pages WHERE id=?", (page_id,)) if page_id else None
    if not row:
        return go("/admin/pages", error="Página no encontrada")
    name = request.param("name").strip()[:120]
    route = request.param("route")
    status = request.param("status")
    image = request.param("image").strip()[:300]
    if not name:
        return go("/admin/pages", error="El nombre de la página es obligatorio")
    if route not in dict(registered_routes()):
        return go("/admin/pages", error="La ruta indicada no corresponde a una página existente")
    if status not in STATUSES:
        return go("/admin/pages", error="Estado de página no válido")
    if not _valid_image(image):
        return go("/admin/pages", error="La imagen debe ser una ruta local o una URL http(s)")
    try:
        sort_order = max(-100, min(1000, int(request.param("sort_order", "0"))))
    except ValueError:
        sort_order = 0
    values = (
        name, request.param("description").strip()[:500], route,
        request.param("universe").strip()[:80], request.param("category").strip()[:80], status,
        request.param("icon").strip()[:80], image, request.param("coming_soon_message").strip()[:500],
        sort_order, 1 if request.param("nav_visible") in {"1", "on", "true"} else 0, page_id,
    )
    with transaction() as conn:
        conn.execute(
            "UPDATE site_pages SET name=?, description=?, route=?, universe=?, category=?, status=?, "
            "icon=?, image=?, coming_soon_message=?, sort_order=?, nav_visible=?, "
            "updated_at=CURRENT_TIMESTAMP WHERE id=?", values,
        )
    audit(request, "update", "site_page", page_id, details={"route": route, "status": status, "name": name})
    return go("/admin/pages", ok="Página actualizada")


def change_status(request: Request, pid: str) -> Response:
    page_id = int_or_none(pid)
    status = request.param("status")
    if not page_id or status not in STATUSES:
        return go("/admin/pages", error="Estado de página no válido")
    updated = execute(
        "UPDATE site_pages SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (status, page_id)
    )
    if not updated.rowcount:
        return go("/admin/pages", error="Página no encontrada")
    audit(request, "update", "site_page_status", page_id, details={"status": status})
    return go("/admin/pages", ok="Estado de la página actualizado")
