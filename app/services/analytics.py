"""Registro de visitas y eventos comerciales reales (sin datos simulados)."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from app.config import Config
from app.core.http import Request
from app.db import execute, query


def track_event(request: Request, event_type: str, **extra: Any) -> None:
    execute(
        "INSERT INTO analytics_events(event_type,path,product_id,category_id,query,referrer,extra) "
        "VALUES (?,?,?,?,?,?,?)",
        (
            event_type,
            request.path[:255],
            extra.get("product_id"),
            extra.get("category_id"),
            str(extra.get("query", ""))[:255],
            request.referrer[:500],
            json.dumps({k: v for k, v in extra.items() if k not in {"product_id", "category_id", "query"}},
                       ensure_ascii=False, default=str),
        ),
    )


def track_visit(request: Request) -> None:
    ip_hash = hashlib.sha256(f"{Config.SECRET_KEY}:{request.ip}".encode()).hexdigest()[:24]
    execute(
        "INSERT INTO visits(path,ip_hash,user_agent) VALUES (?,?,?)",
        (request.path[:255], ip_hash, request.user_agent[:500]),
    )


def dashboard_metrics(date_from: str, date_to: str) -> dict[str, Any]:
    params = (date_from, date_to)
    paid_filter = "o.status<>'cancelled' AND (o.payment_status='paid' OR o.status='paid')"

    def value(sql: str) -> int:
        return int(query(sql, params if "?" in sql else ())[0]["n"] or 0)

    stats = {
        "orders": value("SELECT COUNT(*) AS n FROM orders WHERE date(created_at) BETWEEN date(?) AND date(?)"),
        "paid_orders": value(
            f"SELECT COUNT(*) AS n FROM orders o WHERE {paid_filter} AND date(o.created_at) BETWEEN date(?) AND date(?)"
        ),
        "income": value(
            f"SELECT COALESCE(SUM(o.total_cents),0) AS n FROM orders o WHERE {paid_filter} "
            "AND date(o.created_at) BETWEEN date(?) AND date(?)"
        ),
        "profit": value(
            "SELECT COALESCE(SUM((oi.price_cents-COALESCE(oi.cost_cents,p.cost_cents,0))*oi.quantity),0) AS n "
            "FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id "
            f"WHERE {paid_filter} AND date(o.created_at) BETWEEN date(?) AND date(?)"
        ),
        "pending": value("SELECT COUNT(*) AS n FROM orders WHERE status='pending'"),
        "confirmed": value("SELECT COUNT(*) AS n FROM orders WHERE status IN ('confirmed','preparing','shipped')"),
        "stock_products": value("SELECT COUNT(*) AS n FROM products WHERE modality='stock' AND status='active'"),
        "order_products": value("SELECT COUNT(*) AS n FROM products WHERE modality='order' AND status='active'"),
        "low_stock": value(
            "SELECT COUNT(*) AS n FROM products WHERE modality='stock' AND status='active' AND stock<=low_stock_threshold"
        ),
        "clicks": value("SELECT COUNT(*) AS n FROM whatsapp_clicks WHERE date(created_at) BETWEEN date(?) AND date(?)"),
        "requests": value("SELECT COUNT(*) AS n FROM purchase_requests WHERE date(created_at) BETWEEN date(?) AND date(?)"),
        "converted_requests": value(
            "SELECT COUNT(*) AS n FROM purchase_requests WHERE status='converted' "
            "AND date(created_at) BETWEEN date(?) AND date(?)"
        ),
        "manual_orders": value(
            "SELECT COUNT(*) AS n FROM orders WHERE source='manual' AND date(created_at) BETWEEN date(?) AND date(?)"
        ),
        "visits": value("SELECT COUNT(*) AS n FROM visits WHERE date(created_at) BETWEEN date(?) AND date(?)"),
    }
    clicks = stats["clicks"]
    stats["conversion_requests"] = round(stats["converted_requests"] / clicks * 100, 1) if clicks else 0.0
    stats["conversion_manual"] = round(stats["manual_orders"] / clicks * 100, 1) if clicks else 0.0
    return stats
