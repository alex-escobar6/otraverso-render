"""Marketing configurable: banners, promociones, cupones y secciones de inicio."""
from __future__ import annotations

from app.core.http import Request, Response
from app.core.render import esc, render
from app.db import execute, query, transaction
from . import admin_page, audit, csrf_input, go, upload_image


def register(router) -> None:
    router.get("/admin/marketing", marketing_home, permission="marketing.edit", name="admin.marketing")
    router.post("/admin/marketing/banners", banner_create, permission="marketing.edit", name="admin.banner.create")
    router.post("/admin/marketing/banners/{bid}/toggle", banner_toggle, permission="marketing.edit", name="admin.banner.toggle")
    router.post("/admin/marketing/banners/{bid}/delete", banner_delete, permission="marketing.edit", name="admin.banner.delete")
    router.post("/admin/marketing/promotions", promotion_create, permission="marketing.edit", name="admin.promotion.create")
    router.post("/admin/marketing/promotions/{pid}/toggle", promotion_toggle, permission="marketing.edit", name="admin.promotion.toggle")
    router.post("/admin/marketing/coupons", coupon_create, permission="marketing.edit", name="admin.coupon.create")
    router.post("/admin/marketing/coupons/{cid}/toggle", coupon_toggle, permission="marketing.edit", name="admin.coupon.toggle")
    router.post("/admin/marketing/sections", sections_save, permission="marketing.edit", name="admin.sections.save")


def marketing_home(request: Request) -> Response:
    banners = query("SELECT * FROM banners ORDER BY sort_order,id")
    promotions = query("SELECT * FROM promotions ORDER BY id DESC")
    coupons = query("SELECT * FROM coupons ORDER BY id DESC")
    sections = query("SELECT * FROM home_sections ORDER BY sort_order,id")

    banner_rows = "".join(
        f'<tr><td>{esc(b["title"])}</td><td>{esc(b["subtitle"])}</td><td><span class="status-tag {"ok" if b["active"] else "warn"}">{"Activo" if b["active"] else "Inactivo"}</span></td>'
        f'<td><div class="row-actions">'
        f'<form method="post" action="/admin/marketing/banners/{b["id"]}/toggle">{csrf_input(request)}<button class="btn btn-sm" type="submit">Alternar</button></form>'
        f'<form method="post" action="/admin/marketing/banners/{b["id"]}/delete">{csrf_input(request)}<button class="btn btn-sm btn-danger" type="submit">Eliminar</button></form>'
        '</div></td></tr>' for b in banners
    )
    promo_rows = "".join(
        f'<tr><td>{esc(p["name"])}</td><td>{p["discount_percent"]}%</td><td>{esc(p["starts_at"] or "—")} / {esc(p["ends_at"] or "—")}</td>'
        f'<td><form method="post" action="/admin/marketing/promotions/{p["id"]}/toggle">{csrf_input(request)}'
        f'<button class="btn btn-sm" type="submit">{"Desactivar" if p["active"] else "Activar"}</button></form></td></tr>'
        for p in promotions
    )
    coupon_rows = "".join(
        f'<tr><td><strong>{esc(c["code"])}</strong></td><td>${c["value_cents"]/100:,.0f}</td><td>{c["uses"]}/{c["max_uses"]}</td>'
        f'<td><form method="post" action="/admin/marketing/coupons/{c["id"]}/toggle">{csrf_input(request)}'
        f'<button class="btn btn-sm" type="submit">{"Desactivar" if c["active"] else "Activar"}</button></form></td></tr>'
        for c in coupons
    )
    section_rows = "".join(
        f'<tr><td>{esc(s["name"])}</td>'
        f'<td><label class="checkline"><input type="checkbox" name="section_{s["id"]}_enabled" value="1"{" checked" if s["enabled"] else ""}> Visible</label></td>'
        f'<td><input type="number" name="section_{s["id"]}_order" value="{s["sort_order"]}" style="width:80px"></td></tr>'
        for s in sections
    )
    content = render("admin/marketing.html", CSRF=csrf_input(request), BANNERS=banner_rows,
        PROMOTIONS=promo_rows or '<tr><td colspan="4">Sin promociones.</td></tr>',
        COUPONS=coupon_rows or '<tr><td colspan="4">Sin cupones.</td></tr>',
        SECTIONS=section_rows)
    return admin_page(request, "Marketing", content, "marketing")


def banner_create(request: Request) -> Response:
    title = request.param("title", "").strip()
    if not title:
        return go("/admin/marketing", error="El título del banner es obligatorio")
    image = upload_image(request, "image") if [f for f in request.files if f.field == "image" and f.data] else ""
    try:
        execute("INSERT INTO banners(code,title,subtitle,image,link,sort_order) VALUES (?,?,?,?,?,?)",
                (esc(title).lower().replace(" ", "-"), title, request.param("subtitle", "").strip(),
                 image, request.param("link", "/shop/catalogo").strip(), request.int_param("sort_order", 0)))
    except Exception:
        return go("/admin/marketing", error="Ya existe un banner con ese código")
    audit(request, "create", "banner", title)
    return go("/admin/marketing", ok="Banner creado")


def banner_toggle(request: Request, bid: int) -> Response:
    execute("UPDATE banners SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?", (bid,))
    audit(request, "toggle", "banner", bid)
    return go("/admin/marketing", ok="Banner actualizado")


def banner_delete(request: Request, bid: int) -> Response:
    execute("DELETE FROM banners WHERE id=?", (bid,))
    audit(request, "delete", "banner", bid)
    return go("/admin/marketing", ok="Banner eliminado")


def promotion_create(request: Request) -> Response:
    name = request.param("name", "").strip()
    if not name:
        return go("/admin/marketing", error="El nombre de la promoción es obligatorio")
    execute("INSERT INTO promotions(name,description,discount_percent,starts_at,ends_at) VALUES (?,?,?,?,?)",
            (name, request.param("description", "").strip(),
             min(100, max(0, request.int_param("discount_percent", 0))),
             request.param("starts_at") or None, request.param("ends_at") or None))
    audit(request, "create", "promotion", name)
    return go("/admin/marketing", ok="Promoción creada")


def promotion_toggle(request: Request, pid: int) -> Response:
    execute("UPDATE promotions SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?", (pid,))
    audit(request, "toggle", "promotion", pid)
    return go("/admin/marketing", ok="Promoción actualizada")


def coupon_create(request: Request) -> Response:
    code = request.param("code", "").strip().upper()
    if not code:
        return go("/admin/marketing", error="El código del cupón es obligatorio")
    try:
        execute("INSERT INTO coupons(code,description,value_cents,max_uses,expires_at) VALUES (?,?,?,?,?)",
                (code, request.param("description", "").strip(),
                 request.int_param("value", 0) * 100, max(1, request.int_param("max_uses", 1)),
                 request.param("expires_at") or None))
    except Exception:
        return go("/admin/marketing", error="Ya existe ese cupón")
    audit(request, "create", "coupon", code)
    return go("/admin/marketing", ok="Cupón creado")


def coupon_toggle(request: Request, cid: int) -> Response:
    execute("UPDATE coupons SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?", (cid,))
    audit(request, "toggle", "coupon", cid)
    return go("/admin/marketing", ok="Cupón actualizado")


def sections_save(request: Request) -> Response:
    sections = query("SELECT id FROM home_sections")
    with transaction() as conn:
        for section in sections:
            sid = section["id"]
            enabled = 1 if request.param(f"section_{sid}_enabled") == "1" else 0
            order = request.int_param(f"section_{sid}_order", 0)
            conn.execute("UPDATE home_sections SET enabled=?,sort_order=? WHERE id=?", (enabled, order, sid))
    audit(request, "update", "home_sections")
    return go("/admin/marketing", ok="Secciones de inicio actualizadas")
