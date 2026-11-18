"""Administración de clientes y su historial comercial."""
from __future__ import annotations

from app.core.http import HTTPError, Request, Response
from app.core.render import esc, render
from app.db import execute, one, query
from . import admin_page, audit, csrf_input, go


def register(router) -> None:
    router.get("/admin/customers", customers_list, permission="customers.view", name="admin.customers")
    router.get("/admin/customers/{cid}", customer_view, permission="customers.view", name="admin.customer.view")
    router.post("/admin/customers/{cid}/update", customer_update, permission="customers.edit", name="admin.customer.update")


def customers_list(request: Request) -> Response:
    search = request.query.get("q", "").strip()
    rows = query(
        "SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id) AS orders, "
        "(SELECT COUNT(*) FROM purchase_requests r WHERE r.customer_id=c.id) AS requests "
        "FROM customers c WHERE LOWER(c.name) LIKE ? OR c.phone LIKE ? ORDER BY c.created_at DESC LIMIT 200",
        (f"%{search.lower()}%", f"%{search}%"),
    )
    body = "".join(
        f'<tr><td><a href="/admin/customers/{r["id"]}">{esc(r["name"])}</a></td><td>{esc(r["phone"])}</td>'
        f'<td>{esc(r["municipality"] or "—")}</td><td>{r["orders"]}</td><td>{r["requests"]}</td>'
        f'<td>{r["created_at"][:10]}</td></tr>' for r in rows
    )
    content = render("admin/customers.html", Q=esc(search), ROWS=body or '<tr><td colspan="6">Sin clientes registrados.</td></tr>')
    return admin_page(request, "Clientes", content, "customers")


def customer_view(request: Request, cid: int) -> Response:
    customer = one("SELECT * FROM customers WHERE id=?", (cid,))
    if not customer:
        raise HTTPError(404, "Cliente no encontrado")
    orders = query("SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC", (cid,))
    requests = query("SELECT * FROM purchase_requests WHERE customer_id=? ORDER BY created_at DESC", (cid,))
    order_rows = "".join(
        f'<tr><td>{esc(o["code"])}</td><td>{esc(o["status"])}</td><td>${o["total_cents"]/100:,.0f}</td><td>{o["created_at"][:10]}</td></tr>'
        for o in orders
    ) or '<tr><td colspan="4">Sin pedidos</td></tr>'
    request_rows = "".join(
        f'<tr><td>{esc(r["code"])}</td><td>{esc(r["status"])}</td><td>{esc(r["source"])}</td><td>{r["created_at"][:10]}</td></tr>'
        for r in requests
    ) or '<tr><td colspan="4">Sin solicitudes</td></tr>'
    content = render("admin/customer_detail.html", CSRF=csrf_input(request), ID=str(cid),
        NAME=esc(customer["name"]), PHONE=esc(customer["phone"]), EMAIL=esc(customer["email"]),
        MUNICIPALITY=esc(customer["municipality"]), ADDRESS=esc(customer["address"]),
        CONSENT=" checked" if customer["data_consent"] else "",
        REGISTERED=esc(customer["created_at"]), NOTES=esc(customer["notes"]),
        ORDERS=order_rows, REQUESTS=request_rows)
    return admin_page(request, customer["name"], content, "customers")


def customer_update(request: Request, cid: int) -> Response:
    execute(
        "UPDATE customers SET name=?,phone=?,email=?,municipality=?,address=?,data_consent=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (request.param("name", "").strip(), request.param("phone", "").strip(), request.param("email", "").strip(),
         request.param("municipality", "").strip(), request.param("address", "").strip(),
         1 if request.param("consent") == "1" else 0, request.param("notes", "").strip(), cid),
    )
    audit(request, "update", "customer", cid)
    return go(f"/admin/customers/{cid}", ok="Cliente actualizado")
