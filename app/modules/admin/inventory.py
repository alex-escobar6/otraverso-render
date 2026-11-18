"""Panel de inventario: existencias, alertas e historial de movimientos."""
from __future__ import annotations

from app.core.http import Request, Response
from app.core.render import esc, render
from app.db import query
from app.services.inventory import TYPES, add_movement, low_stock, movements
from . import admin_page, audit, csrf_input, go


def register(router) -> None:
    router.get("/admin/inventory", inventory_home, permission="inventory.view", name="admin.inventory")
    router.post("/admin/inventory/movement", movement_create, permission="inventory.move", name="admin.inventory.movement")


def inventory_home(request: Request) -> Response:
    product_id = request.int_param("producto", 0)
    rows = query(
        "SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id "
        "WHERE p.modality='stock' ORDER BY p.stock ASC,p.name LIMIT 200"
    )
    def stock_tag(row) -> str:
        if row["stock"] == 0:
            return '<span class="status-tag bad">Agotado</span>'
        if row["stock"] <= row["low_stock_threshold"]:
            return '<span class="status-tag warn">Stock bajo</span>'
        return '<span class="status-tag ok">Normal</span>'

    product_rows = "".join(
        f"<tr><td>{esc(r['name'])}</td><td>{esc(r['category_name'] or '—')}</td><td>{r['stock']}</td>"
        f"<td>{r['low_stock_threshold']}</td><td>${r['cost_cents']/100:,.0f}</td>"
        f"<td>{stock_tag(r)}</td>"
        f'<td><form method="get" action="/admin/inventory">{csrf_input(request)}'
        f'<input type="hidden" name="producto" value="{r["id"]}">'
        '<button class="btn btn-sm" type="submit">Ver movimientos</button></form></td></tr>'
        for r in rows
    )
    selected = query("SELECT name FROM products WHERE id=?", (product_id,))
    history = movements(product_id or None)
    history_rows = "".join(
        f"<tr><td>{esc(r['created_at'])}</td><td>{esc(r['product_name'])}</td><td>{esc(TYPES.get(r['movement_type'],r['movement_type']))}</td>"
        f"<td>{r['quantity']}</td><td>${r['cost_cents']/100:,.0f}</td><td>{esc(r['note'])}</td><td>{esc(r['user_name'] or 'Sistema')}</td></tr>"
        for r in history
    )
    options = '<option value="">Todos los productos</option>' + "".join(
        f'<option value="{r["id"]}"{" selected" if r["id"]==product_id else ""}>{esc(r["name"])}</option>'
        for r in rows
    )
    alerts = low_stock()
    alert_html = "".join(
        f'<li>{esc(r["name"])} — {r["stock"]} unidades</li>' for r in alerts
    ) or "<li>Sin alertas activas</li>"
    content = render("admin/inventory.html",
        CSRF=csrf_input(request), PRODUCT_OPTIONS=options, ROWS=product_rows,
        HISTORY=history_rows or '<tr><td colspan="7">Sin movimientos registrados.</td></tr>',
        ALERTS=alert_html,
        SCOPE=esc(selected[0]["name"] if selected else "todos los productos"),
    )
    return admin_page(request, "Inventario", content, "inventory")


def movement_create(request: Request) -> Response:
    product_id = request.int_param("product_id")
    try:
        quantity = int(request.param("quantity", "0"))
    except ValueError:
        return go("/admin/inventory", error="Cantidad inválida")
    movement_id = add_movement(
        product_id, request.param("movement_type"), quantity,
        cost_cents=int(request.param("cost_cents", "0") or 0) * 100,
        note=request.param("note", ""), user_id=request.user["id"],
    )
    audit(request, "create", "inventory_movement", movement_id, {"product_id": product_id, "quantity": quantity})
    return go("/admin/inventory", ok="Movimiento de inventario registrado")
