"""Pedidos, conversiones de solicitudes y transiciones de estado con historial."""
from __future__ import annotations

import secrets
from datetime import datetime
from typing import Any

from app.core.http import HTTPError
from app.db import query, transaction
from app.services.delivery import rate_price_cents
from app.services.inventory import add_movement


def _code() -> str:
    return "OV-" + datetime.now().strftime("%Y%m%d") + "-" + secrets.token_hex(3).upper()


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create_order(*, customer_id: int, product_id: int, quantity: int, zone_id: int | None,
                 shipping_cents: int = 0, notes: str = "", user_id: int | None = None,
                 variant_id: int | None = None, source: str = "manual", payment_method: str = "",
                 payment_status: str = "unpaid", paid_at: str | None = None) -> int:
    if quantity < 1:
        raise HTTPError(400, "La cantidad debe ser mayor a cero")
    if payment_status not in {"unpaid", "paid"}:
        raise HTTPError(400, "Estado de pago no válido")
    if payment_status == "paid" and not paid_at:
        paid_at = _now()
    source = source if source in {"manual", "request"} else "manual"
    with transaction() as conn:
        product = conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
        if not product:
            raise HTTPError(404, "Producto no encontrado")
        customer = conn.execute("SELECT id FROM customers WHERE id=?", (customer_id,)).fetchone()
        if not customer:
            raise HTTPError(404, "Cliente no encontrado")
        if product["modality"] == "stock":
            if product["stock"] < quantity:
                raise HTTPError(400, "Inventario insuficiente para este pedido")
        price = product["price_cents"]
        if variant_id:
            variant = conn.execute("SELECT * FROM product_variants WHERE id=? AND product_id=?", (variant_id, product_id)).fetchone()
            if variant:
                price += variant["price_delta_cents"]
        subtotal = price * quantity
        shipping = max(0, int(shipping_cents or 0))
        unit_cost = max(0, int(product["cost_cents"] or 0))
        initial_status = "pending" if product["modality"] == "stock" else "importing"
        order_id = conn.execute(
            "INSERT INTO orders(code,customer_id,status,modality,zone_id,shipping_address,subtotal_cents,"
            "shipping_cents,total_cents,notes,source,payment_method,payment_status,paid_at,created_by) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (_code(), customer_id, initial_status, product["modality"], zone_id, "", subtotal,
             shipping, subtotal + shipping, notes[:1000], source, payment_method.strip()[:80],
             payment_status, paid_at, user_id),
        ).lastrowid
        conn.execute(
            "INSERT INTO order_items(order_id,product_id,variant_id,name_snapshot,quantity,price_cents,cost_cents,modality) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (order_id, product_id, variant_id, product["name"], quantity, price, unit_cost, product["modality"]),
        )
        creation_note = f"Pedido creado desde el panel administrativo ({source})"
        if payment_status == "paid":
            creation_note += "; pago registrado manualmente"
        conn.execute(
            "INSERT INTO order_history(order_id,from_status,to_status,note,user_id) VALUES (?,?,?,?,?)",
            (order_id, "", initial_status, creation_note, user_id),
        )
        conn.execute("UPDATE products SET purchases=purchases+? WHERE id=?", (quantity, product_id))
    if product["modality"] == "stock":
        add_movement(product_id, "exit", quantity, cost_cents=unit_cost,
                     note=f"Pedido {order_id}", user_id=user_id)
    return order_id


def convert_request(request_id: int, user_id: int | None, shipping_cents: int | None = None) -> int:
    with transaction() as conn:
        req = conn.execute("SELECT * FROM purchase_requests WHERE id=?", (request_id,)).fetchone()
        if not req:
            raise HTTPError(404, "Solicitud no encontrada")
        if req["status"] == "converted":
            raise HTTPError(400, "La solicitud ya fue convertida")
        if not req["product_id"] or not req["customer_id"]:
            raise HTTPError(400, "La solicitud no tiene producto o cliente asociado")
        product = conn.execute("SELECT modality FROM products WHERE id=?", (req["product_id"],)).fetchone()
    zone_id = req["zone_id"]
    shipping = int(shipping_cents) if shipping_cents is not None else rate_price_cents(
        zone_id, product["modality"] if product else "stock"
    )
    order_id = create_order(
        customer_id=req["customer_id"], product_id=req["product_id"],
        quantity=req["quantity"], zone_id=zone_id, shipping_cents=shipping,
        notes=f"Convertida de solicitud {req['code']}", user_id=user_id, source="request",
    )
    with transaction() as conn:
        conn.execute("UPDATE purchase_requests SET status='converted' WHERE id=?", (request_id,))
    return order_id


def update_status(order_id: int, new_status: str, note: str, user_id: int | None) -> None:
    with transaction() as conn:
        status = conn.execute("SELECT code FROM order_statuses WHERE code=?", (new_status,)).fetchone()
        if not status:
            raise HTTPError(400, "Estado de pedido inválido")
        order = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
        if not order:
            raise HTTPError(404, "Pedido no encontrado")
        if order["status"] != new_status:
            conn.execute(
                "UPDATE orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (new_status, order_id),
            )
            conn.execute(
                "INSERT INTO order_history(order_id,from_status,to_status,note,user_id) VALUES (?,?,?,?,?)",
                (order_id, order["status"], new_status, note[:500], user_id),
            )


def update_payment(order_id: int, payment_status: str, payment_method: str,
                   user_id: int | None) -> None:
    if payment_status not in {"unpaid", "paid"}:
        raise HTTPError(400, "Estado de pago no válido")
    with transaction() as conn:
        order = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
        if not order:
            raise HTTPError(404, "Pedido no encontrado")
        if order["payment_status"] == payment_status and order["payment_method"] == payment_method.strip()[:80]:
            return
        paid_at = _now() if payment_status == "paid" else None
        conn.execute(
            "UPDATE orders SET payment_status=?,payment_method=?,paid_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (payment_status, payment_method.strip()[:80], paid_at, order_id),
        )
        conn.execute(
            "INSERT INTO order_history(order_id,from_status,to_status,note,user_id) VALUES (?,?,?,?,?)",
            (order_id, order["payment_status"], payment_status,
             f"Pago registrado manualmente como {payment_status}", user_id),
        )


def list_orders(filters: dict[str, Any] | None = None, limit: int = 100) -> list:
    filters = filters or {}
    clauses, params = ["1=1"], []
    if filters.get("status"):
        clauses.append("o.status=?"); params.append(filters["status"])
    if filters.get("modality"):
        clauses.append("o.modality=?"); params.append(filters["modality"])
    if filters.get("payment_status"):
        clauses.append("o.payment_status=?"); params.append(filters["payment_status"])
    if filters.get("source"):
        clauses.append("o.source=?"); params.append(filters["source"])
    if filters.get("q"):
        clauses.append("(LOWER(c.name) LIKE ? OR LOWER(o.code) LIKE ?)")
        like = f"%{filters['q'].lower()}%"; params.extend([like, like])
    if filters.get("from"):
        clauses.append("date(o.created_at)>=date(?)"); params.append(filters["from"])
    if filters.get("to"):
        clauses.append("date(o.created_at)<=date(?)"); params.append(filters["to"])
    return query(
        "SELECT o.*, c.name AS customer_name, c.phone FROM orders o LEFT JOIN customers c ON c.id=o.customer_id "
        "WHERE " + " AND ".join(clauses) + " ORDER BY o.created_at DESC,o.id DESC LIMIT ?",
        [*params, limit],
    )


def order_detail(order_id: int):
    orders = query(
        "SELECT o.*, c.name AS customer_name, c.phone, c.email, c.municipality, c.address "
        "FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.id=?", (order_id,)
    )
    if not orders:
        return None
    items = query("SELECT * FROM order_items WHERE order_id=?", (order_id,))
    history = query(
        "SELECT h.*, u.name AS user_name FROM order_history h LEFT JOIN users u ON u.id=h.user_id "
        "WHERE h.order_id=? ORDER BY h.created_at,h.id", (order_id,)
    )
    return orders[0], items, history
