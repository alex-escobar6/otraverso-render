"""Panel de pedidos, solicitudes de compra y cambios de estado."""
from __future__ import annotations

from app.core.http import Request, Response
from app.core.render import esc, money, render
from app.db import one, query, transaction
from app.services.delivery import zones
from app.services.orders import convert_request, create_order, list_orders, order_detail, update_status
from . import admin_page, audit, csrf_input, go, int_or_none


def register(router) -> None:
    router.get("/admin/orders", orders_list, permission="orders.view", name="admin.orders")
    router.get("/admin/orders/new", order_form, permission="orders.edit", name="admin.order.new")
    router.post("/admin/orders/create", order_create, permission="orders.edit", name="admin.order.create")
    router.get("/admin/orders/{oid}", order_view, permission="orders.view", name="admin.order.view")
    router.post("/admin/orders/{oid}/status", order_status, permission="orders.edit", name="admin.order.status")
    router.get("/admin/requests", requests_list, permission="orders.view", name="admin.requests")
    router.post("/admin/requests/{rid}/convert", request_convert, permission="orders.edit", name="admin.request.convert")
    router.post("/admin/requests/{rid}/close", request_close, permission="orders.edit", name="admin.request.close")


def orders_list(request: Request) -> Response:
    filters = {k: request.query[k] for k in ("status", "modality", "q", "from", "to") if request.query.get(k)}
    rows = list_orders(filters)
    statuses = query("SELECT * FROM order_statuses ORDER BY sort_order")
    body = "".join(
        f'<tr><td><a href="/admin/orders/{r["id"]}"><strong>{esc(r["code"])}</strong></a></td>'
        f'<td>{esc(r["customer_name"] or "—")}</td><td>{r["created_at"][:16]}</td>'
        f'<td>{"Inventario" if r["modality"]=="stock" else "Bajo pedido"}</td>'
        f'<td>{money(r["total_cents"])}</td>'
        f'<td><span class="status-tag {"ok" if r["status"]=="delivered" else ("bad" if r["status"]=="cancelled" else "warn")}">{esc(r["status"])}</span></td></tr>'
        for r in rows
    )
    status_options = '<option value="">Todos</option>' + "".join(
        f'<option value="{s["code"]}"{" selected" if filters.get("status")==s["code"] else ""}>{esc(s["name"])}</option>'
        for s in statuses
    )
    content = render("admin/orders.html", CSRF=csrf_input(request), ROWS=body or '<tr><td colspan="6">Sin pedidos registrados.</td></tr>',
                     STATUS_OPTIONS=status_options, Q=esc(filters.get("q", "")),
                     FROM=esc(filters.get("from", "")), TO=esc(filters.get("to", "")))
    return admin_page(request, "Pedidos", content, "orders")


def order_form(request: Request) -> Response:
    products = query("SELECT id,name,modality,price_cents,stock FROM products WHERE status='active' ORDER BY name")
    product_options = "".join(
        f'<option value="{p["id"]}" data-price="{p["price_cents"]/100:.0f}">'
        f'{esc(p["name"])} — {"Inventario" if p["modality"]=="stock" else "Bajo pedido"} '
        f'({money(p["price_cents"])})</option>' for p in products
    )
    zones_options = '<option value="">Sin zona específica</option>' + "".join(
        f'<option value="{z["id"]}">{esc(z["municipality_name"] + " — " + z["name"])}</option>' for z in zones()
    )
    content = render("admin/order_form.html", CSRF=csrf_input(request), PRODUCT_OPTIONS=product_options,
                     ZONE_OPTIONS=zones_options)
    return admin_page(request, "Nuevo pedido", content, "orders")


def order_create(request: Request) -> Response:
    name, phone = request.param("name", "").strip(), request.param("phone", "").strip()
    if len(name) < 2 or len(phone) < 7:
        return go("/admin/orders/new", error="Nombre y teléfono del cliente son obligatorios")
    with transaction() as conn:
        import re
        digits = re.sub(r"\D", "", phone)
        customer = conn.execute("SELECT id FROM customers WHERE phone=?", (digits,)).fetchone()
        if customer:
            customer_id = customer["id"]
        else:
            customer_id = conn.execute(
                "INSERT INTO customers(name,phone,whatsapp,municipality,address,data_consent) VALUES (?,?,?,?,?,1)",
                (name, digits, digits, request.param("municipality", "").strip(), request.param("address", "").strip()),
            ).lastrowid
    try:
        order_id = create_order(
            customer_id=customer_id, product_id=request.int_param("product_id"),
            quantity=max(1, request.int_param("quantity", 1)), zone_id=int_or_none(request.param("zone_id")),
            shipping_cents=int(request.param("shipping", "0") or 0) * 100,
            notes=request.param("notes", ""), user_id=request.user["id"],
        )
    except Exception as exc:
        from app.core.http import HTTPError
        if isinstance(exc, HTTPError):
            return go("/admin/orders/new", error=exc.message)
        raise
    audit(request, "create", "order", order_id, {"customer": name})
    return go(f"/admin/orders/{order_id}", ok="Pedido creado correctamente")


def order_view(request: Request, oid: int) -> Response:
    detail = order_detail(oid)
    if not detail:
        from app.core.http import HTTPError
        raise HTTPError(404, "Pedido no encontrado")
    order, items, history = detail
    statuses = query("SELECT * FROM order_statuses ORDER BY sort_order")
    status_options = "".join(
        f'<option value="{s["code"]}"{" selected" if order["status"]==s["code"] else ""}>{esc(s["name"])}</option>'
        for s in statuses
    )
    item_rows = "".join(
        f'<tr><td>{esc(i["name_snapshot"])}</td><td>{i["quantity"]}</td><td>{money(i["price_cents"])}</td>'
        f'<td>{"Inventario" if i["modality"]=="stock" else "Bajo pedido"}</td></tr>' for i in items
    )
    history_rows = "".join(
        f'<tr><td>{esc(h["created_at"])}</td><td>{esc(h["from_status"] or "—")}</td><td>{esc(h["to_status"])}</td>'
        f'<td>{esc(h["note"])}</td><td>{esc(h["user_name"] or "Sistema")}</td></tr>' for h in history
    )
    content = render("admin/order_detail.html", CSRF=csrf_input(request), ORDER_ID=str(oid), CODE=esc(order["code"]),
        STATUS=esc(order["status"]), CUSTOMER=esc(order["customer_name"] or "—"),
        PHONE=esc(order["phone"] or ""), EMAIL=esc(order["email"] or ""),
        ADDRESS=esc(order["municipality"] + " " + order["address"]),
        CREATED=esc(order["created_at"]), MODALITY="Inventario" if order["modality"]=="stock" else "Bajo pedido",
        SUBTOTAL=money(order["subtotal_cents"]), SHIPPING=money(order["shipping_cents"]),
        TOTAL=money(order["total_cents"]), NOTES=esc(order["notes"]),
        STATUS_OPTIONS=status_options, ITEMS=item_rows, HISTORY=history_rows)
    return admin_page(request, f'Pedido {order["code"]}', content, "orders")


def order_status(request: Request, oid: int) -> Response:
    update_status(oid, request.param("status"), request.param("note", ""), request.user["id"])
    audit(request, "status", "order", oid, {"status": request.param("status")})
    return go(f"/admin/orders/{oid}", ok="Estado del pedido actualizado")


def requests_list(request: Request) -> Response:
    rows = query(
        "SELECT r.*, p.name AS product_name FROM purchase_requests r LEFT JOIN products p ON p.id=r.product_id "
        "ORDER BY r.created_at DESC,r.id DESC LIMIT 200"
    )
    body = "".join(
        f'<tr><td>{esc(r["code"])}</td><td>{esc(r["name"])}</td><td>{esc(r["phone"])}</td>'
        f'<td>{esc(r["product_name"] or "—")}</td><td>{r["quantity"]}</td><td>{r["created_at"][:16]}</td>'
        f'<td><span class="status-tag {"ok" if r["status"]=="converted" else "warn"}">{esc(r["status"])}</span></td>'
        f'<td><div class="row-actions">'
        f'<form method="post" action="/admin/requests/{r["id"]}/convert">{csrf_input(request)}'
        '<button class="btn btn-sm btn-primary" type="submit">Convertir</button></form>'
        f'<form method="post" action="/admin/requests/{r["id"]}/close">{csrf_input(request)}'
        '<button class="btn btn-sm" type="submit">Cerrar</button></form></div></td></tr>'
        for r in rows
    )
    content = render("admin/requests.html", ROWS=body or '<tr><td colspan="8">Sin solicitudes registradas.</td></tr>')
    return admin_page(request, "Solicitudes de compra", content, "requests")


def request_convert(request: Request, rid: int) -> Response:
    try:
        order_id = convert_request(rid, request.user["id"],
                                   shipping_cents=int(request.param("shipping", "0") or 0) * 100)
    except Exception as exc:
        from app.core.http import HTTPError
        if isinstance(exc, HTTPError):
            return go("/admin/requests", error=exc.message)
        raise
    audit(request, "convert", "purchase_request", rid, {"order_id": order_id})
    return go(f"/admin/orders/{order_id}", ok="Solicitud convertida en pedido")


def request_close(request: Request, rid: int) -> Response:
    row = one("SELECT status FROM purchase_requests WHERE id=?", (rid,))
    if row and row["status"] != "converted":
        from app.db import execute
        execute("UPDATE purchase_requests SET status='closed' WHERE id=?", (rid,))
        audit(request, "close", "purchase_request", rid)
    return go("/admin/requests", ok="Solicitud cerrada")
