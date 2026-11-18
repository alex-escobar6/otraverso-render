"""Panel administrativo OTRAVERSO: sesión, dashboard y utilidades compartidas."""
from __future__ import annotations

import io
import math
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from app.config import Config, UPLOAD_DIR
from app.core.auth import login as auth_login
from app.core.auth import logout as auth_logout
from app.core.http import HTTPError, Request, Response, redirect
from app.core.render import esc, money, render, render_page
from app.db import audit as db_audit
from app.db import query, settings_group
from app.security import safe_filename

SIDEBAR = [
    ("dashboard", "Dashboard", "/admin", "dashboard.view"),
    ("products", "Productos", "/admin/products", "products.view"),
    ("inventory", "Inventario", "/admin/inventory", "inventory.view"),
    ("orders", "Pedidos", "/admin/orders", "orders.view"),
    ("requests", "Solicitudes", "/admin/requests", "orders.view"),
    ("customers", "Clientes", "/admin/customers", "customers.view"),
    ("marketing", "Marketing", "/admin/marketing", "marketing.edit"),
    ("coverage", "Cobertura", "/admin/coverage", "coverage.manage"),
    ("whatsapp", "WhatsApp", "/admin/settings/whatsapp", "whatsapp.manage"),
    ("settings", "Configuración", "/admin/settings/commercial", "settings.edit"),
    ("seo", "SEO", "/admin/settings/seo", "seo.manage"),
    ("analytics", "Analítica", "/admin/analytics", "analytics.view"),
    ("users", "Usuarios", "/admin/users", "users.manage"),
    ("audit", "Bitácora", "/admin/audit", "audit.view"),
    ("backups", "Copias", "/admin/backups", "backup.manage"),
]


def register(router) -> None:
    router.get("/admin/login", login_form, name="admin.login")
    router.post("/admin/login", login_submit, name="admin.login.submit")
    router.post("/admin/logout", logout, name="admin.logout")
    router.get("/admin", dashboard, permission="dashboard.view", name="admin.dashboard")

    from . import analytics, coverage, customers, inventory, marketing, orders, products
    from . import settings as settings_module
    from . import users, backups
    for module in (products, inventory, orders, customers, marketing, coverage,
                   settings_module, analytics, users, backups):
        module.register(router)


def csrf_input(request: Request) -> str:
    return f'<input type="hidden" name="csrf" value="{esc(request.csrf_token)}">'


def admin_page(request: Request, title: str, content: str, active: str = "", *,
               head_extra: str = "", scripts: str = "") -> Response:
    links = []
    for key, label, href, permission in SIDEBAR:
        if permission in request.permission_codes:
            css = "active" if active == key else ""
            links.append(f'<a class="{css}" href="{href}">{label}</a>')
    commercial = settings_group("commercial")
    sidebar = "".join(links)
    logout_form = (
        f'<form method="post" action="/admin/logout">{csrf_input(request)}'
        '<button class="btn btn-ghost btn-sm" type="submit" style="color:#d8d8ea;border-color:#3d3d5c">Salir</button></form>'
    )
    body = render("admin/base.html",
        SIDEBAR=sidebar,
        TOPBAR="",
        TITLE=esc(title),
        USER=esc(request.user["name"] if request.user else ""),
        LOGOUT_FORM=logout_form,
        FLASH=flash(request),
        CONTENT=content,
        SITE_NAME=esc(commercial.get("business_name", "OTRAVERSO")),
    )
    return Response(render_page(title, body, body_class="mode-admin", active="", request=request,
                                head_extra=head_extra, scripts=scripts))


def flash(request: Request) -> str:
    if request.query.get("ok"):
        return f'<div class="flash">{esc(request.query["ok"])}</div>'
    if request.query.get("error"):
        return f'<div class="flash error">{esc(request.query["error"])}</div>'
    return ""


def go(path: str, *, ok: str = "", error: str = "") -> Response:
    params = {k: v for k, v in (("ok", ok), ("error", error)) if v}
    suffix = ("?" + urllib.parse.urlencode(params)) if params else ""
    return redirect(path + suffix)


def audit(request: Request, action: str, entity: str, entity_id: Any = "", details: dict | None = None) -> None:
    db_audit(request.user["id"] if request.user else None, action, entity, entity_id, details, request.ip)


def parse_specs(text: str) -> str:
    import json
    result = {}
    for line in (text or "").splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key, value = key.strip(), value.strip()
        if key and value:
            result[key[:60]] = value[:300]
    return json.dumps(result, ensure_ascii=False)


def specs_text(raw: str) -> str:
    import json
    try:
        data = json.loads(raw or "{}")
        return "\n".join(f"{k}: {v}" for k, v in data.items())
    except (ValueError, TypeError, AttributeError):
        return ""


def parse_ids(text: str) -> list[int]:
    result = []
    for chunk in (text or "").replace(";", ",").split(","):
        try:
            value = int(chunk.strip())
            if value > 0:
                result.append(value)
        except ValueError:
            continue
    return result


def int_or_none(value: Any) -> int | None:
    try:
        number = int(value)
        return number if number > 0 else None
    except (TypeError, ValueError):
        return None


def _save_upload(upload) -> str:
    if len(upload.data) > Config.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPError(413, "La imagen supera el tamaño máximo permitido")
    try:
        from PIL import Image
        with io.BytesIO(upload.data) as buffer:
            with Image.open(buffer) as image:
                image.verify()
    except ImportError:
        allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}
        if Path(upload.filename).suffix.lower() not in allowed:
            raise HTTPError(400, "Formato de imagen no permitido")
    except HTTPError:
        raise
    except Exception:
        raise HTTPError(400, "El archivo no es una imagen válida")
    name = safe_filename(upload.filename)
    (UPLOAD_DIR / name).write_bytes(upload.data)
    return f"/uploads/{name}"


def upload_image(request: Request, field: str = "image") -> str:
    files = [f for f in request.files if f.field == field and f.data]
    if not files:
        raise HTTPError(400, "Seleccione una imagen")
    return _save_upload(files[0])


def upload_images(request: Request, field: str = "images") -> list[str]:
    urls = [_save_upload(f) for f in request.files if f.field == field and f.data]
    if not urls:
        raise HTTPError(400, "Seleccione al menos una imagen")
    return urls


def remove_upload(url: str) -> None:
    if not url.startswith("/uploads/"):
        return
    path = UPLOAD_DIR / Path(url).name
    if path.exists() and path.is_file():
        path.unlink()


def date_bounds(request: Request) -> tuple[str, str]:
    today = datetime.now().date()
    default_from = (today - timedelta(days=30)).isoformat()
    date_from = request.query.get("from", default_from)
    date_to = request.query.get("to", today.isoformat())
    return date_from, date_to


def login_form(request: Request) -> Response:
    from app.core.auth import public_csrf_token
    if request.user:
        return redirect("/admin")
    body = render("admin/login.html", CSRF=esc(public_csrf_token()),
                  ERROR='<div class="flash error">Credenciales inválidas o cuenta inactiva.</div>' if request.query.get("error") else "")
    return Response(render_page("Acceso administrativo — OTRAVERSO", body,
                                body_class="mode-admin", request=request))


def login_submit(request: Request) -> Response:
    attempts = query(
        "SELECT COUNT(*) AS total FROM audit_log WHERE action='login_failed' AND ip=? "
        "AND created_at > datetime('now','-15 minutes')", (request.ip,)
    )[0]["total"]
    if attempts >= 8:
        audit(request, "login_blocked", "session", details={"ip": request.ip})
        raise HTTPError(429, "Demasiados intentos. Intente nuevamente en unos minutos")
    token = auth_login(request.param("email"), request.param("password"), request)
    if not token:
        audit(request, "login_failed", "session", details={"email": request.param("email", "")[:120]})
        return go("/admin/login", error="Credenciales inválidas o cuenta inactiva")
    audit(request, "login", "session")
    response = go("/admin", ok="Sesión iniciada")
    cookie = (f"otraverso_session={token}; HttpOnly; SameSite=Lax; Path=/; "
              f"Max-Age={Config.SESSION_HOURS * 3600}")
    if Config.BASE_URL.startswith("https://"):
        cookie += "; Secure"
    response.headers["Set-Cookie"] = cookie
    return response


def logout(request: Request) -> Response:
    audit(request, "logout", "session")
    auth_logout(request)
    response = go("/admin/login", ok="Sesión cerrada")
    response.headers["Set-Cookie"] = "otraverso_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    return response


def dashboard(request: Request) -> Response:
    date_from, date_to = date_bounds(request)
    params = (date_from, date_to)
    stats = {
        "orders": query("SELECT COUNT(*) AS n FROM orders WHERE date(created_at) BETWEEN date(?) AND date(?)", params)[0]["n"],
        "income": query("SELECT COALESCE(SUM(total_cents),0) AS n FROM orders WHERE status<>'cancelled' AND date(created_at) BETWEEN date(?) AND date(?)", params)[0]["n"],
        "profit": query(
            "SELECT COALESCE(SUM((oi.price_cents-COALESCE(p.cost_cents,0))*oi.quantity),0) AS n "
            "FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id "
            "WHERE o.status<>'cancelled' AND date(o.created_at) BETWEEN date(?) AND date(?)", params)[0]["n"],
        "pending": query("SELECT COUNT(*) AS n FROM orders WHERE status='pending'", ())[0]["n"],
        "confirmed": query("SELECT COUNT(*) AS n FROM orders WHERE status IN ('confirmed','preparing','shipped')", ())[0]["n"],
        "stock_products": query("SELECT COUNT(*) AS n FROM products WHERE modality='stock' AND status='active'", ())[0]["n"],
        "order_products": query("SELECT COUNT(*) AS n FROM products WHERE modality='order' AND status='active'", ())[0]["n"],
        "low_stock": query("SELECT COUNT(*) AS n FROM products WHERE modality='stock' AND status='active' AND stock<=low_stock_threshold", ())[0]["n"],
        "clicks": query("SELECT COUNT(*) AS n FROM whatsapp_clicks WHERE date(created_at) BETWEEN date(?) AND date(?)", params)[0]["n"],
        "requests": query("SELECT COUNT(*) AS n FROM purchase_requests WHERE date(created_at) BETWEEN date(?) AND date(?)", params)[0]["n"],
        "visits": query("SELECT COUNT(*) AS n FROM visits WHERE date(created_at) BETWEEN date(?) AND date(?)", params)[0]["n"],
    }
    stats["conversion"] = round((stats["orders"] / stats["clicks"] * 100) if stats["clicks"] else 0, 1)
    top_viewed = query("SELECT name,views FROM products WHERE status='active' ORDER BY views DESC,id LIMIT 5")
    top_sold = query("SELECT name,purchases FROM products WHERE status='active' ORDER BY purchases DESC,id LIMIT 5")
    recent = query(
        "SELECT 'auditoría' AS kind, action AS label, created_at FROM audit_log "
        "UNION ALL SELECT 'pedido', 'Pedido '||code, created_at FROM orders "
        "UNION ALL SELECT 'solicitud', 'Solicitud '||code, created_at FROM purchase_requests "
        "ORDER BY created_at DESC LIMIT 8"
    )
    daily = query(
        "SELECT date(created_at) AS day, COUNT(*) AS total FROM visits "
        "WHERE date(created_at)>=date('now','-6 days') GROUP BY date(created_at) ORDER BY day"
    )
    values = {row["day"]: row["total"] for row in daily}
    days = [(datetime.now().date() - timedelta(days=offset)).isoformat() for offset in range(6, -1, -1)]
    peak = max(values.values(), default=1) or 1
    bars = "".join(
        f'<div title="{day}: {values.get(day,0)} visitas" style="height:{max(3, round(values.get(day,0)/peak*100))}%"></div>'
        for day in days
    )
    cards = [
        ("Ventas (pedidos)", stats["orders"], "en el rango"),
        ("Ingresos", money(stats["income"]), "pedidos no cancelados"),
        ("Ganancia estimada", money(stats["profit"]), "precio menos costo"),
        ("Conversión", f'{stats["conversion"]} %', "pedidos / clics WhatsApp"),
        ("Pedidos pendientes", stats["pending"], "estado actual"),
        ("Pedidos confirmados", stats["confirmed"], "confirmados, preparación y envío"),
        ("Productos en inventario", stats["stock_products"], "activos"),
        ("Productos bajo pedido", stats["order_products"], "activos"),
        ("Stock bajo", stats["low_stock"], "requieren revisión"),
        ("Clics WhatsApp", stats["clicks"], "en el rango"),
        ("Solicitudes", stats["requests"], "registradas"),
        ("Visitas", stats["visits"], "páginas públicas"),
    ]
    card_html = "".join(
        f'<div class="stat-card"><span>{esc(label)}</span><strong>{esc(value)}</strong><small>{esc(note)}</small></div>'
        for label, value, note in cards
    )
    content = render("admin/dashboard.html",
        DATE_FROM=esc(date_from), DATE_TO=esc(date_to), CARDS=card_html, BARS=bars,
        DAYS="".join(f'<span>{day[5:]}</span>' for day in days),
        TOP_VIEWED="".join(f'<tr><td>{esc(r["name"])}</td><td>{r["views"]}</td></tr>' for r in top_viewed),
        TOP_SOLD="".join(f'<tr><td>{esc(r["name"])}</td><td>{r["purchases"]}</td></tr>' for r in top_sold),
        RECENT="".join(f'<tr><td>{esc(r["kind"])}</td><td>{esc(r["label"])}</td><td>{esc(r["created_at"])}</td></tr>' for r in recent),
    )
    return admin_page(request, "Dashboard", content, "dashboard")
