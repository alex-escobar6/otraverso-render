"""Cobertura geográfica, tarifas y cálculo visible de plazos por modalidad."""
from __future__ import annotations

import sqlite3

from app.db import query


def municipalities() -> list[sqlite3.Row]:
    return query(
        "SELECT m.*, d.name AS department_name FROM municipalities m "
        "JOIN departments d ON d.id=m.department_id WHERE m.active=1 ORDER BY m.name"
    )


def zones(municipality_id: int | None = None) -> list[sqlite3.Row]:
    sql = (
        "SELECT z.*, m.name AS municipality_name, d.name AS department_name "
        "FROM delivery_zones z JOIN municipalities m ON m.id=z.municipality_id "
        "JOIN departments d ON d.id=m.department_id WHERE z.active=1 AND m.active=1"
    )
    params: list[object] = []
    if municipality_id:
        sql += " AND z.municipality_id=?"
        params.append(municipality_id)
    sql += " ORDER BY m.name,z.name"
    return query(sql, params)


def rates_for_zone(zone_id: int) -> list[sqlite3.Row]:
    return query("SELECT * FROM zone_rates WHERE zone_id=? AND active=1 ORDER BY modality", (zone_id,))


def rate_price_cents(zone_id: int | None, modality: str) -> int:
    if not zone_id:
        return 0
    rows = query("SELECT price_cents FROM zone_rates WHERE zone_id=? AND modality=? AND active=1 LIMIT 1",
                 (zone_id, modality))
    return int(rows[0]["price_cents"] or 0) if rows else 0


def human_duration(hours: int) -> str:
    if hours < 24:
        return f"hasta {hours} horas"
    days = round(hours / 24)
    return f"hasta {days} día{'s' if days != 1 else ''}"


def product_delivery(product: sqlite3.Row, zone_id: int | None = None) -> tuple[str, str]:
    """Devuelve (etiqueta corta, explicación detallada)."""
    if product["modality"] == "order":
        days = product["import_days"] or 30
        short = f"Importación aprox. {days} días"
        detail = (
            f"Producto bajo pedido: no está en inventario. El tiempo estimado de importación es de "
            f"aproximadamente {days} días y se cuenta por separado del tiempo de entrega local."
        )
        if zone_id:
            rate = query("SELECT * FROM zone_rates WHERE zone_id=? AND modality='order' AND active=1", (zone_id,))
            if rate:
                detail += f" Entrega local estimada: {human_duration(rate[0]['estimated_hours'])}."
        return short, detail
    hours = product["delivery_hours"] or 24
    short = f"Entrega local {human_duration(hours)}"
    detail = (
        f"Producto disponible en inventario. Entrega local estimada: {human_duration(hours)} "
        f"según la zona de destino y confirmación del pedido."
    )
    if zone_id:
        rate = query("SELECT * FROM zone_rates WHERE zone_id=? AND modality='stock' AND active=1", (zone_id,))
        if rate:
            detail = (
                "Producto disponible en inventario. Entrega estimada: "
                f"{human_duration(rate[0]['estimated_hours'])} en {rate[0]['label']}."
            )
    return short, detail
