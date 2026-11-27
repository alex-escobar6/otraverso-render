"""Módulo OTRAVERSO SHOP: portada comercial, catálogo, ficha y conversión por WhatsApp."""
from __future__ import annotations

import json
import math
import urllib.parse
from datetime import datetime
from xml.sax.saxutils import escape as xml_escape

from app.config import Config
from app.core.auth import public_csrf_token
from app.core.http import HTTPError, Request, Response, json_response, redirect
from app.core.render import esc, money, render, render_page
from app.db import get_setting, query, settings_group
from app.services.analytics import track_event
from app.services.catalog import (
    PUBLIC_PRODUCT_SELECT, active_promotions, categories_with_counts, count_products,
    get_product_by_slug, list_products, product_images, product_variants,
    related_products,
)
from app.services.delivery import human_duration, municipalities, product_delivery, rates_for_zone, zones
from app.services.whatsapp import contact_url, enabled as whatsapp_enabled, log_click, register_request


def register(router) -> None:
    router.get("/shop", home, name="shop.home")
    router.get("/shop/catalogo", catalog, name="shop.catalog")
    router.get("/shop/categoria/{slug}", category, name="shop.category")
    router.get("/shop/producto/{slug}", product, name="shop.product")
    router.post("/shop/whatsapp", whatsapp_request, name="shop.whatsapp")
    router.post("/shop/whatsapp/click", whatsapp_click, name="shop.whatsapp.click")
    router.get("/shop/cobertura", coverage, name="shop.coverage")
    router.get("/pages/{slug}", page, name="shop.page")
    router.get("/sitemap.xml", sitemap, name="shop.sitemap")
    router.get("/robots.txt", robots, name="shop.robots")
    router.get("/buscar", search_alias, name="shop.search")


def _page(title: str, content: str, request: Request, *, seo: dict[str, str] | None = None, **kwargs) -> Response:
    return Response(render_page(title, content, body_class="mode-shop", active="shop", request=request,
                                seo_override=seo, **kwargs))


def _wa_enabled() -> bool:
    return whatsapp_enabled(settings_group("whatsapp"))


def _wa_link() -> str:
    return contact_url() if _wa_enabled() else ""


def _wa_csrf(request: Request) -> str:
    return "" if request.user else public_csrf_token()


def _wa_button(request: Request, url: str, label: str, source: str) -> str:
    if not url:
        return ""
    return (f'<a class="btn btn-primary" href="{esc(url)}" target="_blank" rel="noopener noreferrer" '
            f'data-wa-log="{esc(source)}" data-wa-csrf="{esc(_wa_csrf(request))}" '
            f'data-wa-url="{esc(url)}">{esc(label)}</a>')


def product_card(row) -> str:
    image = (f'<img src="{esc(row["image"])}" alt="{esc(row["name"])}" loading="lazy">'
             if row["image"] else '<span class="product-placeholder">O/</span>')
    modality = "stock" if row["modality"] == "stock" else "order"
    badge_label = "En inventario" if modality == "stock" else "Bajo pedido"
    badges = [f'<span class="badge {modality}">{badge_label}</span>']
    if modality == "stock":
        if row["stock"] <= 0:
            badges.append('<span class="badge hot">Agotado</span>')
        elif row["delivery_hours"] <= 24:
            badges.append('<span class="badge new">Entrega 24 h</span>')
    if row["is_new"]:
        badges.append('<span class="badge new">Novedad</span>')
    if row["compare_price_cents"] > row["price_cents"]:
        badges.append('<span class="badge hot">Oferta</span>')
    old = (f'<span class="product-old">{money(row["compare_price_cents"])}</span>'
           if row["compare_price_cents"] > row["price_cents"] else "")
    currency = get_setting("commercial", "currency", "COP")
    return f"""
    <article class="product-card">
      <a class="product-image" href="/shop/producto/{esc(row['slug'])}">{image}</a>
      <div class="product-body">
        <h3 class="product-title"><a href="/shop/producto/{esc(row['slug'])}">{esc(row['name'])}</a></h3>
        <p class="product-desc">{esc(row['short_description'] or row['description'])}</p>
        <div><span class="product-price">{money(row['price_cents'], currency)}</span>{old}</div>
        <div class="product-meta">{''.join(badges)}</div>
        <div class="product-actions">
          <a class="btn btn-primary btn-sm" href="/shop/producto/{esc(row['slug'])}">Ver producto</a>
        </div>
      </div>
    </article>"""


def product_grid(rows) -> str:
    if not rows:
        return '<div class="empty-state">Aún no hay productos publicados en esta sección.</div>'
    return f'<div class="product-grid">{"".join(product_card(row) for row in rows)}</div>'


def product_section(title: str, subtitle: str, rows, link: str = "/shop/catalogo") -> str:
    return render("shop/section.html",
        TITLE=esc(title), SUBTITLE=esc(subtitle), LINK=esc(link), PRODUCTS=product_grid(rows))


def home(request: Request) -> Response:
    commercial = settings_group("commercial")
    visual = settings_group("visual")
    banners = query("SELECT * FROM banners WHERE active=1 ORDER BY sort_order,id")
    banner_html = []
    for banner in banners:
        image = f'<img src="{esc(banner["image"])}" alt="{esc(banner["title"])}">' if banner["image"] else ""
        banner_html.append(f"""
        <div class="banner-card">
          <div><span class="eyebrow">Promoción</span><h2>{esc(banner['title'])}</h2>
          <p>{esc(banner['subtitle'])}</p></div>
          <div>{image}<a class="btn btn-secondary" href="{esc(banner['link'] or '/shop/catalogo')}">Ver más</a></div>
        </div>""")

    categories = categories_with_counts()
    chips = "".join(
        f'<a class="category-chip" href="/shop/categoria/{esc(row["slug"])}">{esc(row["name"])} '
        f'<small>({row["product_count"]})</small></a>' for row in categories
    ) or '<p class="hint">Todavía no hay categorías activas.</p>'

    promos = active_promotions()
    promo_html = "".join(
        f'<div class="benefit"><div class="icon">%</div><h4>{esc(p["name"])}</h4><p>{esc(p["description"])}</p></div>'
        for p in promos
    )

    sections = {row["code"]: row["enabled"] for row in query("SELECT code,enabled FROM home_sections")}
    pieces = []
    if sections.get("benefits", 1):
        pieces.append(render("shop/benefits.html"))
    if sections.get("categories", 1):
        pieces.append(f'<section class="section"><div class="container"><div class="section-head">'
                      f'<div><span class="eyebrow">Explora</span><h2>Categorías</h2></div></div>'
                      f'<div class="category-chips">{chips}</div></div></section>')
    if sections.get("featured", 1):
        pieces.append(product_section("Productos destacados", "Seleccionados por OTRAVERSO",
                                      list_products({"featured": True}, limit=8)))
    if sections.get("fast", 1):
        pieces.append(product_section("Entrega rápida", "Disponibles en inventario con entrega local",
                                      list_products({"availability": "stock", "delivery": "fast", "sort": "newest"}, limit=8)))
    if sections.get("new", 1):
        pieces.append(product_section("Novedades", "Lo más reciente del catálogo",
                                      list_products({"sort": "newest"}, limit=8)))
    if sections.get("bestsellers", 1):
        pieces.append(product_section("Más vendidos", "Preferencias de nuestros clientes",
                                      list_products({"sort": "popular"}, limit=8)))
    if sections.get("order", 1):
        pieces.append(product_section("Productos bajo pedido", "No están en inventario: plazos de importación claros",
                                      list_products({"availability": "order"}, limit=8)))
    if sections.get("promotions", 1) and promo_html:
        pieces.append(f'<section class="section"><div class="container"><div class="section-head">'
                      f'<div><span class="eyebrow">Ofertas</span><h2>Promociones activas</h2></div></div>'
                      f'<div class="benefits">{promo_html}</div></div></section>')
    if sections.get("coverage", 1):
        rate_rows = query(
            "SELECT m.name AS municipality, dz.name AS zone, zr.modality, zr.estimated_hours, zr.price_cents, zr.conditions "
            "FROM zone_rates zr JOIN delivery_zones dz ON dz.id=zr.zone_id "
            "JOIN municipalities m ON m.id=dz.municipality_id "
            "WHERE zr.active=1 AND dz.active=1 AND m.active=1 "
            "ORDER BY zr.estimated_hours,zr.id LIMIT 6"
        )
        summary = "".join(
            f'<div class="coverage-row"><div><strong>{esc(r["municipality"])}</strong><br><small>{esc(r["zone"])}</small></div>'
            f'<div>{"Inventario" if r["modality"]=="stock" else "Bajo pedido"}</div>'
            f'<div><strong>{human_duration(r["estimated_hours"])}</strong><br>'
            f'<small>{money(r["price_cents"])} · {esc(r["conditions"] or "Sin condiciones especiales")}</small></div></div>'
            for r in rate_rows
        ) or '<p class="hint">Aún no hay tarifas activas configuradas.</p>'
        pieces.append(render("shop/coverage_summary.html",
            NOTE=esc(commercial.get("delivery_note", "")), SUMMARY=summary))

    content = render("shop/home.html",
        HERO_TITLE=esc(visual.get("shop_hero_title", "Bienvenido a la tienda")),
        HERO_SUBTITLE=esc(visual.get("shop_hero_subtitle", "")),
        BANNERS="".join(banner_html),
        SECTIONS="".join(pieces),
    )
    return _page(commercial.get("business_name", "OTRAVERSO SHOP"), content, request)


def _filters_html(filters: dict[str, str]) -> str:
    categories = categories_with_counts()
    options = '<option value="">Todas las categorías</option>'
    for row in categories:
        selected = " selected" if str(filters.get("category", "")) == str(row["id"]) else ""
        options += f'<option value="{row["id"]}"{selected}>{esc(row["name"])}</option>'
    availability = [
        ("all", "Todas"), ("stock", "Disponible en inventario"),
        ("order", "Bajo pedido"), ("soldout", "Agotado"),
    ]
    delivery = [("all", "Cualquiera"), ("fast", "Entrega rápida (24 h)"),
                ("local", "Envío local"), ("import", "Importación")]
    sorting = [("newest", "Novedades"), ("price_asc", "Menor precio"),
               ("price_desc", "Mayor precio"), ("popular", "Popularidad"), ("name", "Nombre")]
    def select_options(values, current):
        return "".join(f'<option value="{v}"{" selected" if filters.get(current)==v else ""}>{esc(label)}</option>'
                       for v, label in values)
    return f"""
    <form class="filters" method="get" action="/shop/catalogo">
      <h3>Filtros</h3>
      <div class="filter-group"><label for="q">Buscar</label>
        <input id="q" name="q" value="{esc(filters.get('q',''))}" placeholder="Nombre o descripción"></div>
      <div class="filter-group"><label for="category">Categoría</label>
        <select id="category" name="category">{options}</select></div>
      <div class="filter-group"><label for="availability">Disponibilidad</label>
        <select id="availability" name="availability">{select_options(availability,'availability')}</select></div>
      <div class="filter-group"><label for="delivery">Modalidad de entrega</label>
        <select id="delivery" name="delivery">{select_options(delivery,'delivery')}</select></div>
      <div class="filter-group"><label>Precio (COP)</label>
        <div class="form-grid"><input name="min_price" type="number" min="0" placeholder="Mínimo" value="{esc(filters.get('min_price',''))}">
        <input name="max_price" type="number" min="0" placeholder="Máximo" value="{esc(filters.get('max_price',''))}"></div></div>
      <div class="filter-group"><label for="sort">Ordenar por</label>
        <select id="sort" name="sort">{select_options(sorting,'sort')}</select></div>
      <button class="btn btn-primary btn-block" type="submit">Aplicar filtros</button>
      <a class="btn btn-ghost btn-block" style="margin-top:.5rem" href="/shop/catalogo">Limpiar</a>
    </form>"""


def _catalog(request: Request, forced_category: int | None = None, custom_title: str = "",
             seo: dict[str, str] | None = None) -> Response:
    filters = dict(request.query)
    if forced_category:
        filters["category"] = str(forced_category)
    rows = list_products(filters, limit=12, offset=0)
    total = count_products(filters)
    pages = max(1, math.ceil(total / 12))
    page_number = max(1, min(pages, request.int_param("page", 1)))
    if page_number > 1:
        rows = list_products(filters, limit=12, offset=(page_number - 1) * 12)
    clean_filters = {k: v for k, v in filters.items() if k != "page"}
    paging = []
    for number in range(1, pages + 1):
        params = urllib.parse.urlencode({**clean_filters, "page": number})
        css = "current" if number == page_number else ""
        paging.append(f'<a class="{css}" href="/shop/catalogo?{params}">{number}</a>')
    if request.query.get("q"):
        track_event(request, "search", query=request.query["q"])
    content = render("shop/catalog.html",
        TITLE=esc(custom_title or "Catálogo de productos"),
        FILTERS=_filters_html(filters),
        PRODUCTS=product_grid(rows),
        TOTAL=str(total),
        PAGINATION="".join(paging) if pages > 1 else "",
        SEARCH_TERM=esc(filters.get("q", "")),
    )
    return _page(custom_title or "Catálogo — OTRAVERSO SHOP", content, request, seo=seo)


def catalog(request: Request) -> Response:
    return _catalog(request)


def category(request: Request, slug: str) -> Response:
    rows = query("SELECT * FROM categories WHERE slug=? AND active=1", (slug,))
    if not rows:
        raise HTTPError(404, "Categoría no encontrada")
    return _catalog(request, forced_category=rows[0]["id"], custom_title=rows[0]["name"],
                    seo={"title": rows[0]["seo_title"], "description": rows[0]["seo_description"]})


def _selected_zone(request: Request) -> tuple[int | None, str]:
    zone_id = request.int_param("zona", 0)
    if zone_id:
        rows = query("SELECT id,name FROM delivery_zones WHERE id=? AND active=1", (zone_id,))
        if rows:
            return rows[0]["id"], rows[0]["name"]
    return None, ""


def product(request: Request, slug: str) -> Response:
    item = get_product_by_slug(slug)
    if not item:
        raise HTTPError(404, "Producto no encontrado")
    from app.db import execute
    execute("UPDATE products SET views=views+1 WHERE id=?", (item["id"],))
    track_event(request, "product_view", product_id=item["id"])

    from app.db import one
    refreshed = one(f"SELECT {PUBLIC_PRODUCT_SELECT} FROM products WHERE id=?", (item["id"],))
    images = product_images(item["id"])
    variants = product_variants(item["id"])
    related = related_products(item)
    zone_id, zone_name = _selected_zone(request)
    short_delivery, detail_delivery = product_delivery(refreshed, zone_id)
    currency = get_setting("commercial", "currency", "COP")
    commercial = settings_group("commercial")

    if images:
        main_image = f'<img src="{esc(images[0]["url"])}" alt="{esc(item["name"])}" id="main-image">'
        thumbs = "".join(
            f'<img src="{esc(img["url"])}" data-full="{esc(img["url"])}" alt="{esc(img["alt"] or item["name"])}" '
            f'class="{"active" if index == 0 else ""}">' for index, img in enumerate(images)
        )
        thumb_html = f'<div class="gallery-thumbs">{thumbs}</div>'
    else:
        main_image = '<div class="product-placeholder">O/</div>'
        thumb_html = ""

    try:
        attributes = json.loads(item["attributes"] or "{}")
    except (ValueError, TypeError):
        attributes = {}
    specs = "".join(
        f'<tr><td>{esc(key.replace("_", " ").title())}</td><td>{esc(value)}</td></tr>'
        for key, value in attributes.items() if key and str(value).strip()
    )
    variant_html = "".join(
        f'<span class="variant-option">{esc(v["name"])}'
        f'{" · " + money(v["price_delta_cents"], currency) if v["price_delta_cents"] else ""} '
        f'{"· " + str(v["stock"]) + " uds." if v["stock"] else ""}</span>' for v in variants
    )
    tags = "".join(f'<span class="badge">{esc(tag.strip())}</span>' for tag in (item["tags"] or "").split(",") if tag.strip())

    modality_badge = ('<span class="badge stock">Disponible en inventario</span>' if item["modality"] == "stock"
                      else '<span class="badge order">Bajo pedido</span>')
    if item["modality"] == "stock" and item["stock"] <= 0:
        availability = '<div class="notice">Agotado temporalmente. Puedes ver otros productos disponibles.</div>'
        order_form = ""
    elif not _wa_enabled():
        availability = f'<div class="notice stock">{esc(detail_delivery)}</div>'
        order_form = '<div class="notice">Las consultas por WhatsApp están deshabilitadas temporalmente.</div>'
    else:
        availability = f'<div class="notice stock">{esc(detail_delivery)}</div>'
        zone_select = "".join(
            f'<option value="{z["id"]}"{" selected" if z["id"] == zone_id else ""}>{esc(z["municipality_name"] + " — " + z["name"])}</option>'
            for z in zones()
        )
        order_form = render("shop/whatsapp_form.html",
            CSRF=esc(public_csrf_token()), PRODUCT_ID=str(item["id"]), SOURCE="product",
            ZONE_OPTIONS=f'<option value="">Zona general (plazos configurados)</option>{zone_select}',
            QUANTITY_MAX=str(min(item["stock"], 99)) if item["modality"] == "stock" else "99",
            BUTTON_TEXT="Solicitar por WhatsApp" if item["modality"] == "order" else "Consultar compra por WhatsApp",
        )

    content = render("shop/product.html",
        NAME=esc(item["name"]), SHORT=esc(item["short_description"]),
        DESCRIPTION=esc(item["description"]).replace("\n", "<br>"),
        IMAGE=main_image, THUMBS=thumb_html,
        PRICE=money(item["price_cents"], currency),
        OLD_PRICE=(f'<span class="product-old">{money(item["compare_price_cents"], currency)}</span>'
                   if item["compare_price_cents"] > item["price_cents"] else ""),
        BADGES=f'{modality_badge}{"<span class=badge hot>Oferta</span>" if item["compare_price_cents"] > item["price_cents"] else ""}',
        TAGS=tags, SHORT_DELIVERY=esc(short_delivery), DETAIL_DELIVERY=esc(detail_delivery),
        CATEGORY=esc(item["category_name"] if "category_name" in item.keys() else ""),
        SPECS=specs or "<tr><td>Información</td><td>Consultar con el vendedor</td></tr>",
        VARIANTS=variant_html or '<span class="hint">Sin variantes registradas</span>',
        AVAILABILITY=availability, FORM=order_form,
        TERMS_NOTE=esc(commercial.get("sale_disclaimer", "La apertura del chat no confirma una compra.")),
        RELATED=product_grid(related),
    )
    return _page(item["name"], content, request,
                 seo={"title": item["seo_title"], "description": item["seo_description"]})


def whatsapp_request(request: Request) -> Response:
    from app.db import one
    if not _wa_enabled():
        raise HTTPError(403, "Las consultas por WhatsApp están deshabilitadas", "whatsapp_disabled")
    product = one("SELECT * FROM products WHERE id=? AND status='active'", (request.int_param("product_id"),))
    if not product:
        raise HTTPError(404, "Producto no disponible")
    zone_id = request.int_param("zona", 0) or None
    code, url = register_request(
        request, product,
        name=request.param("name"), phone=request.param("phone"),
        quantity=request.int_param("quantity", 1), source=request.param("source", "product"),
        message_note=request.param("note"), zone_id=zone_id, consent=request.param("consent"),
    )
    return redirect(url)


def whatsapp_click(request: Request) -> Response:
    if not _wa_enabled():
        raise HTTPError(403, "Las consultas por WhatsApp están deshabilitadas", "whatsapp_disabled")
    try:
        product_id = int(request.param("product_id", "0") or 0) or None
    except ValueError:
        product_id = None
    public_id = log_click(
        request,
        request.param("source", "link").strip() or "link",
        product_id=product_id,
        message=request.param("message", ""),
        url=request.param("url", ""),
        path=request.param("path", ""),
    )
    return json_response({"ok": True, "public_id": public_id})


def coverage(request: Request) -> Response:
    municipality_id = request.int_param("municipio", 0)
    all_zones = zones()
    rows = zones(municipality_id) if municipality_id else all_zones
    options = '<option value="">Todos los municipios</option>' + "".join(
        f'<option value="{m["id"]}"{" selected" if m["id"] == municipality_id else ""}>{esc(m["name"])}</option>'
        for m in municipalities()
    )
    rate_rows = []
    for zone in rows:
        for rate in rates_for_zone(zone["id"]):
            rate_rows.append(f"""
            <div class="coverage-row">
              <div><strong>{esc(zone['municipality_name'])}</strong><br><small>{esc(zone['name'])}</small></div>
              <div>{'En inventario' if rate['modality']=='stock' else 'Bajo pedido'}</div>
              <div><strong>{human_duration(rate['estimated_hours'])}</strong><br>
                <small>{money(rate['price_cents'])} · {esc(rate['conditions'] or 'Sin condiciones especiales')}</small></div>
            </div>""")
    commercial = settings_group("commercial")
    whatsapp_url = _wa_link()
    content = render("shop/coverage.html",
        OPTIONS=options,
        ROWS="".join(rate_rows) or '<p class="empty-state">No hay zonas activas configuradas.</p>',
        NOTE=esc(commercial.get("delivery_note", "")),
        IMPORT=esc(commercial.get("import_conditions", "")),
        WHATSAPP_BUTTON=_wa_button(request, whatsapp_url, "Consultar cobertura por WhatsApp", "coverage"),
    )
    return _page("Cobertura y entregas — OTRAVERSO SHOP", content, request)


PAGE_KEYS = {
    "condiciones": ("Condiciones de compra", "terms"),
    "pagos": ("Métodos de pago", "payment_methods"),
    "privacidad": ("Tratamiento de datos personales", "privacy"),
    "devoluciones": ("Cambios y devoluciones", "returns"),
    "contacto": ("Contacto", "hours"),
}


def page(request: Request, slug: str) -> Response:
    if slug not in PAGE_KEYS:
        raise HTTPError(404, "Página no encontrada")
    title, key = PAGE_KEYS[slug]
    commercial = settings_group("commercial")
    body = commercial.get(key, "")
    if slug == "contacto":
        body = (f"Escríbenos por WhatsApp: {commercial.get('whatsapp','')}<br>"
                f"Correo: {commercial.get('email','')}<br>"
                f"Horarios: {commercial.get('hours','')}<br>"
                f"Ubicación: {commercial.get('address','')}")
    content = render("shop/page.html", TITLE=esc(title), BODY=esc(body).replace("\n", "<br>"),
                     WHATSAPP_BUTTON=_wa_button(request, _wa_link(), "Contactar por WhatsApp", "page"))
    return _page(title, content, request)


def search_alias(request: Request) -> Response:
    return redirect("/shop/catalogo?" + urllib.parse.urlencode({"q": request.query.get("q", "")}))


def sitemap(request: Request) -> Response:
    urls = ["/", "/shop", "/shop/catalogo", "/shop/cobertura"]
    urls += [f"/shop/producto/{row['slug']}" for row in query("SELECT slug FROM products WHERE status='active'")]
    urls += [f"/shop/categoria/{row['slug']}" for row in query("SELECT slug FROM categories WHERE active=1")]
    base = get_setting("seo", "canonical", Config.BASE_URL)
    entries = "".join(f"<url><loc>{xml_escape(base + path)}</loc></url>" for path in urls)
    body = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{entries}</urlset>'
    return Response(body, content_type="application/xml; charset=utf-8")


def robots(request: Request) -> Response:
    allowed = get_setting("seo", "robots_index", "1") == "1"
    base = get_setting("seo", "canonical", Config.BASE_URL)
    body = f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n" if allowed else "User-agent: *\nDisallow: /\n"
    return Response(body, content_type="text/plain; charset=utf-8")
