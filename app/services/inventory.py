"""Movimientos de inventario reales y alertas de stock bajo."""
from __future__ import annotations

from app.core.http import HTTPError
from app.db import query, transaction

TYPES = {"entry": "Entrada", "exit": "Salida", "adjustment": "Ajuste"}


def add_movement(product_id: int, movement_type: str, quantity: int, *,
                 cost_cents: int = 0, note: str = "", user_id: int | None = None,
                 variant_id: int | None = None) -> int:
    if movement_type not in TYPES:
        raise HTTPError(400, "Tipo de movimiento inválido")
    if movement_type == "adjustment":
        if quantity == 0:
            raise HTTPError(400, "El ajuste debe ser positivo o negativo")
    elif quantity <= 0:
        raise HTTPError(400, "La cantidad debe ser mayor a cero")
    with transaction() as conn:
        product = conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
        if not product:
            raise HTTPError(404, "Producto no encontrado")
        if product["modality"] == "order":
            raise HTTPError(400, "Los productos bajo pedido no manejan inventario físico")
        current = product["stock"]
        if movement_type == "entry":
            new_stock = current + quantity
        elif movement_type == "exit":
            new_stock = current - quantity
        else:
            new_stock = current + quantity
        if new_stock < 0:
            raise HTTPError(400, "No hay existencias suficientes para este movimiento")
        cost = cost_cents if movement_type == "entry" else 0
        movement_id = conn.execute(
            "INSERT INTO inventory_movements(product_id,variant_id,movement_type,quantity,cost_cents,note,user_id) "
            "VALUES (?,?,?,?,?,?,?)",
            (product_id, variant_id, movement_type, abs(quantity) if movement_type != "adjustment" else quantity,
             max(0, cost), note[:500], user_id),
        ).lastrowid
        updates = ["stock=?", "updated_at=CURRENT_TIMESTAMP"]
        params: list[object] = [new_stock]
        if movement_type == "entry" and cost > 0:
            updates.append("cost_cents=?")
            params.append(cost)
        params.append(product_id)
        conn.execute(f"UPDATE products SET {','.join(updates)} WHERE id=?", params)
        return movement_id


def low_stock(limit: int = 50) -> list:
    return query(
        "SELECT * FROM products WHERE status='active' AND modality='stock' AND stock <= low_stock_threshold "
        "ORDER BY stock ASC,id LIMIT ?", (limit,)
    )


def movements(product_id: int | None = None, limit: int = 100) -> list:
    sql = (
        "SELECT m.*, p.name AS product_name, u.name AS user_name FROM inventory_movements m "
        "JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id"
    )
    params: list[object] = []
    if product_id:
        sql += " WHERE m.product_id=?"
        params.append(product_id)
    sql += " ORDER BY m.created_at DESC,m.id DESC LIMIT ?"
    params.append(limit)
    return query(sql, params)
