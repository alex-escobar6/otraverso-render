"""Consultas de catálogo reutilizables por tienda, administración y analítica."""
from __future__ import annotations

import re
import sqlite3
from typing import Any

from app.db import query

PUBLIC_PRODUCT_FIELDS = (
    "id", "category_id", "name", "slug", "short_description", "description", "modality",
    "status", "price_cents", "compare_price_cents", "stock", "delivery_hours", "import_days",
    "tags", "attributes", "whatsapp_message", "featured", "best_seller", "is_new",
    "views", "purchases", "seo_title", "seo_description", "created_at", "updated_at", "published_at",
)
PUBLIC_PRODUCT_SELECT = ", ".join(PUBLIC_PRODUCT_FIELDS)
PUBLIC_PRODUCT_COLUMNS = ", ".join(f"p.{field}" for field in PUBLIC_PRODUCT_FIELDS)

SORT_SQL = {
    "newest": "p.created_at DESC, p.id DESC",
    "price_asc": "p.price_cents ASC, p.id DESC",
    "price_desc": "p.price_cents DESC, p.id DESC",
    "popular": "p.purchases DESC, p.views DESC, p.id DESC",
    "name": "p.name ASC",
}


def parse_cents(value: object) -> int:
    try:
        return max(0, int(round(float(str(value or 0).replace(",", ".")) * 100)))
    except (TypeError, ValueError):
        return 0


def margin_cents(cost_cents: int, price_cents: int) -> int:
    return max(0, int(price_cents or 0) - int(cost_cents or 0))


def margin_percent(cost_cents: int, price_cents: int) -> float:
    price = int(price_cents or 0)
    if price <= 0:
        return 0.0
    return round(margin_cents(cost_cents, price) / price * 100, 1)


def discount_percent(price_cents: int, compare_cents: int) -> float:
    compare = int(compare_cents or 0)
    if compare <= 0:
        return 0.0
    return round(max(0, compare - int(price_cents or 0)) / compare * 100, 1)


def suggested_price(cost_cents: int, target_percent: int) -> int:
    cost = max(0, int(cost_cents or 0))
    target = min(100, max(0, int(target_percent or 0)))
    if target >= 100:
        return 0
    return int(round(cost / (1 - target / 100)))


def slugify(value: str) -> str:
    value = value.strip().lower()
    replacements = {"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ñ": "n"}
    for source, target in replacements.items():
        value = value.replace(source, target)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "producto"


def category_ids(category_id: int) -> list[int]:
    rows = query("SELECT id, parent_id FROM categories")
    children: dict[int | None, list[int]] = {}
    for row in rows:
        children.setdefault(row["parent_id"], []).append(row["id"])
    result, pending = [], [category_id]
    while pending:
        current = pending.pop()
        if current in result:
            continue
        result.append(current)
        pending.extend(children.get(current, []))
    return result


def _where(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    clauses = ["p.status='active'"]
    params: list[Any] = []

    search = filters.get("q", "").strip()
    if search:
        clauses.append("(LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(p.short_description) LIKE ? OR LOWER(p.tags) LIKE ?)")
        like = f"%{search.lower()}%"
        params.extend([like] * 4)

    category = filters.get("category")
    if category:
        ids = category_ids(int(category))
        placeholders = ",".join("?" for _ in ids)
        clauses.append(f"p.category_id IN ({placeholders})")
        params.extend(ids)

    availability = filters.get("availability", "all")
    if availability == "stock":
        clauses.append("p.modality='stock' AND p.stock > 0")
    elif availability == "order":
        clauses.append("p.modality='order'")
    elif availability == "soldout":
        clauses.append("p.modality='stock' AND p.stock = 0")

    delivery = filters.get("delivery", "all")
    if delivery == "fast":
        clauses.append("p.modality='stock' AND p.delivery_hours <= 24")
    elif delivery == "local":
        clauses.append("p.modality='stock'")
    elif delivery == "import":
        clauses.append("p.modality='order'")

    try:
        minimum = int(filters.get("min_price") or 0)
        maximum = int(filters.get("max_price") or 0)
    except (TypeError, ValueError):
        minimum = maximum = 0
    if minimum > 0:
        clauses.append("p.price_cents >= ?")
        params.append(minimum * 100)
    if maximum > 0:
        clauses.append("p.price_cents <= ?")
        params.append(maximum * 100)

    if filters.get("featured"):
        clauses.append("p.featured=1")
    return " AND ".join(clauses), params


def list_products(filters: dict[str, Any], *, limit: int = 12, offset: int = 0) -> list[sqlite3.Row]:
    where, params = _where(filters)
    sort = SORT_SQL.get(filters.get("sort", "newest"), SORT_SQL["newest"])
    sql = (
        f"SELECT {PUBLIC_PRODUCT_COLUMNS}, c.name AS category_name, "
        "(SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY i.sort_order,i.id LIMIT 1) AS image "
        "FROM products p LEFT JOIN categories c ON c.id=p.category_id "
        f"WHERE {where} ORDER BY {sort} LIMIT ? OFFSET ?"
    )
    return query(sql, [*params, limit, offset])


def count_products(filters: dict[str, Any]) -> int:
    where, params = _where(filters)
    return query(f"SELECT COUNT(*) AS total FROM products p WHERE {where}", params)[0]["total"]


def get_product_by_slug(slug: str) -> sqlite3.Row | None:
    rows = query(
        f"SELECT {PUBLIC_PRODUCT_COLUMNS}, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id "
        "WHERE p.slug=? AND p.status='active'", (slug,)
    )
    return rows[0] if rows else None


def product_images(product_id: int) -> list[sqlite3.Row]:
    return query("SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order,id", (product_id,))


def product_variants(product_id: int) -> list[sqlite3.Row]:
    return query("SELECT * FROM product_variants WHERE product_id=? AND active=1 ORDER BY id", (product_id,))


def related_products(product: sqlite3.Row, limit: int = 4) -> list[sqlite3.Row]:
    explicit = query(
        f"SELECT {PUBLIC_PRODUCT_COLUMNS}, (SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY i.sort_order LIMIT 1) AS image "
        "FROM product_related pr JOIN products p ON p.id=pr.related_id "
        "WHERE pr.product_id=? AND p.status='active' ORDER BY p.id LIMIT ?",
        (product["id"], limit),
    )
    if explicit:
        return explicit
    return query(
        f"SELECT {PUBLIC_PRODUCT_COLUMNS}, (SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY i.sort_order LIMIT 1) AS image "
        "FROM products p WHERE p.status='active' AND p.id<>? AND p.category_id=? ORDER BY p.purchases DESC,p.id DESC LIMIT ?",
        (product["id"], product["category_id"], limit),
    )


def categories_with_counts() -> list[sqlite3.Row]:
    return query(
        "SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.status='active') AS product_count "
        "FROM categories c WHERE c.active=1 ORDER BY c.sort_order,c.name"
    )


def active_promotions() -> list[sqlite3.Row]:
    return query(
        "SELECT * FROM promotions WHERE active=1 AND (starts_at IS NULL OR date(starts_at)<=date('now')) "
        "AND (ends_at IS NULL OR date(ends_at)>=date('now')) ORDER BY id DESC"
    )
