"""Panel de analítica con eventos persistidos y rendimiento comercial."""
from __future__ import annotations

from app.core.http import Request, Response
from app.core.render import esc, render
from app.db import query
from . import admin_page, date_bounds


def register(router) -> None:
    router.get("/admin/analytics", analytics_home, permission="analytics.view", name="admin.analytics")


def analytics_home(request: Request) -> Response:
    date_from, date_to = date_bounds(request)
    params = (date_from, date_to)
    counts = query(
        "SELECT event_type, COUNT(*) AS total FROM analytics_events "
        "WHERE date(created_at) BETWEEN date(?) AND date(?) GROUP BY event_type ORDER BY total DESC", params
    )
    searches = query(
        "SELECT query, COUNT(*) AS total FROM analytics_events WHERE event_type='search' AND query<>'' "
        "AND date(created_at) BETWEEN date(?) AND date(?) GROUP BY query ORDER BY total DESC LIMIT 20", params
    )
    top_products = query(
        "SELECT p.name, p.views, p.purchases FROM products p ORDER BY p.views DESC,p.id DESC LIMIT 10"
    )
    categories = query(
        "SELECT c.name, COUNT(p.id) AS products, SUM(p.views) AS views, SUM(p.purchases) AS sales "
        "FROM categories c LEFT JOIN products p ON p.category_id=c.id GROUP BY c.id ORDER BY views DESC LIMIT 10"
    )
    recent = query(
        "SELECT e.event_type,e.path,e.query,e.created_at,p.name AS product FROM analytics_events e "
        "LEFT JOIN products p ON p.id=e.product_id ORDER BY e.created_at DESC,e.id DESC LIMIT 30"
    )
    clicks = query("SELECT COUNT(*) AS n FROM whatsapp_clicks WHERE date(created_at) BETWEEN date(?) AND date(?)", params)[0]["n"]
    requests = query("SELECT COUNT(*) AS n FROM purchase_requests WHERE date(created_at) BETWEEN date(?) AND date(?)", params)[0]["n"]
    orders = query("SELECT COUNT(*) AS n FROM orders WHERE date(created_at) BETWEEN date(?) AND date(?)", params)[0]["n"]
    conversion = round((orders / clicks * 100) if clicks else 0, 1)
    content = render("admin/analytics.html",
        DATE_FROM=esc(date_from), DATE_TO=esc(date_to),
        COUNTS="".join(f'<tr><td>{esc(r["event_type"])}</td><td>{r["total"]}</td></tr>' for r in counts) or '<tr><td colspan="2">Sin eventos</td></tr>',
        SEARCHES="".join(f'<tr><td>{esc(r["query"])}</td><td>{r["total"]}</td></tr>' for r in searches) or '<tr><td colspan="2">Sin búsquedas</td></tr>',
        PRODUCTS="".join(f'<tr><td>{esc(r["name"])}</td><td>{r["views"]}</td><td>{r["purchases"]}</td></tr>' for r in top_products) or '<tr><td colspan="3">Sin productos</td></tr>',
        CATEGORIES="".join(f'<tr><td>{esc(r["name"])}</td><td>{r["products"]}</td><td>{r["views"] or 0}</td><td>{r["sales"] or 0}</td></tr>' for r in categories) or '<tr><td colspan="4">Sin categorías</td></tr>',
        RECENT="".join(f'<tr><td>{esc(r["event_type"])}</td><td>{esc(r["path"])}</td><td>{esc(r["query"] or r["product"] or "")}</td><td>{esc(r["created_at"])}</td></tr>' for r in recent),
        CLICKS=str(clicks), REQUESTS=str(requests), ORDERS=str(orders), CONVERSION=f"{conversion} %",
    )
    return admin_page(request, "Analítica", content, "analytics")
