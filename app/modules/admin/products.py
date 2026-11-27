"""Gestión administrativa de productos, categorías, proveedores, variantes e imágenes."""
from __future__ import annotations

from typing import Any

from app.core.http import HTTPError, Request, Response
from app.core.render import esc, money, render
from app.db import execute, one, query, transaction
from app.services.catalog import (
    discount_percent, margin_cents, margin_percent, parse_cents,
    slugify, suggested_price,
)
from app.services.inventory import add_movement
from . import (admin_page, audit, csrf_input, go, int_or_none, parse_ids, parse_specs,
               remove_upload, specs_text, upload_images)


def register(router) -> None:
    router.get("/admin/products", products_list, permission="products.view", name="admin.products")
    router.get("/admin/products/new", product_form, permission="products.edit", name="admin.product.new")
    router.post("/admin/products/create", product_create, permission="products.edit", name="admin.product.create")
    router.get("/admin/products/{pid}/edit", product_form, permission="products.edit", name="admin.product.edit")
    router.post("/admin/products/{pid}/update", product_update, permission="products.edit", name="admin.product.update")
    router.post("/admin/products/{pid}/delete", product_delete, permission="products.delete", name="admin.product.delete")
    router.post("/admin/products/{pid}/duplicate", product_duplicate, permission="products.edit", name="admin.product.duplicate")
    router.post("/admin/products/{pid}/toggle", product_toggle, permission="products.edit", name="admin.product.toggle")
    router.post("/admin/products/{pid}/images", images_upload, permission="products.edit", name="admin.product.images")
    router.post("/admin/products/{pid}/images/{image_id}/delete", image_delete, permission="products.edit", name="admin.product.image.delete")
    router.post("/admin/products/{pid}/variants", variant_create, permission="products.edit", name="admin.product.variant")
    router.post("/admin/products/{pid}/variants/{variant_id}/update", variant_update, permission="products.edit", name="admin.product.variant.update")
    router.post("/admin/products/{pid}/variants/{variant_id}/delete", variant_delete, permission="products.edit", name="admin.product.variant.delete")
    router.post("/admin/categories", category_create, permission="products.edit", name="admin.category.create")
    router.post("/admin/categories/{cid}/toggle", category_toggle, permission="products.edit", name="admin.category.toggle")
    router.post("/admin/categories/{cid}/delete", category_delete, permission="products.edit", name="admin.category.delete")
    router.post("/admin/suppliers", supplier_create, permission="products.edit", name="admin.supplier.create")


def _cents(value: Any) -> int:
    return parse_cents(value)


def _unique_slug(base: str, exclude_id: int | None = None) -> str:
    slug = slugify(base)
    candidate, counter = slug, 2
    while True:
        rows = query("SELECT id FROM products WHERE slug=?", (candidate,))
        if not any(row["id"] != exclude_id for row in rows):
            return candidate
        candidate = f"{slug}-{counter}"
        counter += 1


def _options(rows, selected: Any, label: str = "name") -> str:
    result = ['<option value="">— Ninguno —</option>']
    for row in rows:
        is_selected = " selected" if str(row["id"]) == str(selected or "") else ""
        result.append(f'<option value="{row["id"]}"{is_selected}>{esc(row[label])}</option>')
    return "".join(result)


def products_list(request: Request) -> Response:
    clauses, params = ["1=1"], []
    if request.query.get("q"):
        clauses.append("LOWER(p.name) LIKE ?")
        params.append(f"%{request.query['q'].lower()}%")
    if request.query.get("status"):
        clauses.append("p.status=?"); params.append(request.query["status"])
    if request.query.get("modality"):
        clauses.append("p.modality=?"); params.append(request.query["modality"])
    rows = query(
        "SELECT p.*, c.name AS category_name, "
        "(SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) AS images "
        "FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE " +
        " AND ".join(clauses) + " ORDER BY p.created_at DESC,p.id DESC LIMIT 200", params
    )
    body = []
    for row in rows:
        status_class = {"active": "ok", "draft": "warn", "archived": "bad"}.get(row["status"], "")
        body.append(f"""
        <tr>
          <td><strong>{esc(row['name'])}</strong><br><small class="hint">{esc(row['slug'])}</small></td>
          <td>{esc(row['category_name'] or '—')}</td>
          <td>{'<span class="badge stock">Inventario</span>' if row['modality']=='stock' else '<span class="badge order">Bajo pedido</span>'}</td>
          <td>{money(row['price_cents'])}</td>
          <td class="hint">{money(row['cost_cents'])}<br><small>{margin_percent(row['cost_cents'], row['price_cents']):.1f} %</small></td>
          <td>{row['stock'] if row['modality']=='stock' else 'N/A'}</td>
          <td>{row['images']}</td>
          <td><span class="status-tag {status_class}">{esc(row['status'])}</span></td>
          <td><div class="row-actions">
            <a class="btn btn-sm" href="/admin/products/{row['id']}/edit">Editar</a>
            <form method="post" action="/admin/products/{row['id']}/toggle">{csrf_input(request)}<button class="btn btn-sm" type="submit">Activar/desactivar</button></form>
            <form method="post" action="/admin/products/{row['id']}/duplicate">{csrf_input(request)}<button class="btn btn-sm" type="submit">Duplicar</button></form>
            <form method="post" action="/admin/products/{row['id']}/delete" data-confirm="¿Eliminar este producto?">{csrf_input(request)}<button class="btn btn-sm btn-danger" type="submit">Eliminar</button></form>
          </div></td>
        </tr>""")
    category_rows = "".join(
        f'<tr><td>{esc(c["name"])}</td><td>{esc(c["slug"])}</td><td><div class="row-actions">'
        f'<form method="post" action="/admin/categories/{c["id"]}/toggle">{csrf_input(request)}'
        f'<button class="btn btn-sm" type="submit">{"Desactivar" if c["active"] else "Activar"}</button></form>'
        f'<form method="post" action="/admin/categories/{c["id"]}/delete" data-confirm="¿Eliminar categoría?">{csrf_input(request)}'
        '<button class="btn btn-sm btn-danger" type="submit">Eliminar</button></form></div></td></tr>'
        for c in query("SELECT * FROM categories ORDER BY sort_order,name")
    )
    supplier_rows = "".join(
        f'<tr><td>{esc(s["name"])}</td><td>{esc(s["contact"])}</td><td>{esc(s["url"])}</td></tr>'
        for s in query("SELECT * FROM suppliers ORDER BY name")
    )
    content = render("admin/products.html",
        CSRF=csrf_input(request),
        SEARCH=esc(request.query.get("q", "")),
        ROWS="".join(body) or '<tr><td colspan="10">No hay productos registrados.</td></tr>',
        CATEGORY_ROWS=category_rows,
        SUPPLIER_ROWS=supplier_rows,
    )
    return admin_page(request, "Productos", content, "products")


def product_form(request: Request, pid: int = 0) -> Response:
    product = one("SELECT * FROM products WHERE id=?", (pid,)) if pid else None
    categories = query("SELECT * FROM categories WHERE active=1 ORDER BY sort_order,name")
    suppliers = query("SELECT * FROM suppliers WHERE active=1 ORDER BY name")
    images = query("SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order,id", (pid,)) if pid else []
    variants = query("SELECT * FROM product_variants WHERE product_id=? ORDER BY id", (pid,)) if pid else []
    related_ids = [r["related_id"] for r in query("SELECT related_id FROM product_related WHERE product_id=?", (pid,))] if pid else []
    all_products = query("SELECT id,name FROM products WHERE status='active' AND id<>? ORDER BY name", (pid or 0,))
    related_options = "".join(
        f'<option value="{p["id"]}"{" selected" if p["id"] in related_ids else ""}>{esc(p["name"])}</option>'
        for p in all_products
    )
    image_html = "".join(
        f'<div class="row-actions" style="margin:.4rem 0"><img src="{esc(i["url"])}" width="70" height="55" style="object-fit:cover;border-radius:8px" alt="">'
        f'<input value="{esc(i["url"])}" readonly style="max-width:300px">'
        f'<form method="post" action="/admin/products/{pid}/images/{i["id"]}/delete">{csrf_input(request)}'
        '<button class="btn btn-sm btn-danger" type="submit">Quitar</button></form></div>' for i in images
    )
    variant_html = "".join(
        f'<tr><td><input form="variant-update-{v["id"]}" name="name" value="{esc(v["name"] or "")}" required></td>'
        f'<td><input form="variant-update-{v["id"]}" name="sku" value="{esc(v["sku"] or "")}"></td>'
        f'<td><input form="variant-update-{v["id"]}" name="price_delta" type="number" value="{(v["price_delta_cents"] or 0)/100:.0f}"></td>'
        f'<td><input form="variant-update-{v["id"]}" name="stock" type="number" min="0" value="{v["stock"] or 0}"></td>'
        f'<td><input form="variant-update-{v["id"]}" name="active" type="checkbox" value="1"'
        f'{" checked" if v["active"] else ""}></td>'
        f'<td><div class="row-actions"><form id="variant-update-{v["id"]}" method="post" '
        f'action="/admin/products/{pid}/variants/{v["id"]}/update">{csrf_input(request)}'
        '<button class="btn btn-sm" type="submit">Guardar</button></form>'
        f'<form method="post" action="/admin/products/{pid}/variants/{v["id"]}/delete">{csrf_input(request)}'
        '<button class="btn btn-sm btn-danger" type="submit">Eliminar</button></form></div></td></tr>' for v in variants
    )
    image_panel = render("admin/product_images.html", CSRF=csrf_input(request), IMAGES=image_html, PRODUCT_ID=pid) if pid else ""
    variant_panel = render("admin/product_variants.html", CSRF=csrf_input(request), VARIANTS=variant_html, PRODUCT_ID=pid) if pid else ""
    values = dict(product) if product is not None else {}

    def stored(key: str, default: Any = "") -> Any:
        value = values.get(key)
        return default if value is None else value

    status = stored("status", "draft") or "draft"
    checked = lambda key: " checked" if stored(key) else ""
    price_cents = int(stored("price_cents", 0) or 0)
    cost_cents = int(stored("cost_cents", 0) or 0)
    target_margin = int(stored("target_margin_percent", 0) or 0)
    compare_cents = int(stored("compare_price_cents", 0) or 0)
    stock = stored("stock", 0)
    content = render("admin/product_form.html",
        CSRF=csrf_input(request),
        ACTION=f'/admin/products/{pid}/update' if pid else '/admin/products/create',
        NAME=esc(stored("name")), SLUG=esc(stored("slug")),
        SKU=esc(stored("sku")), SHORT=esc(stored("short_description")),
        DESCRIPTION=esc(stored("description")),
        CATEGORY_OPTIONS=_options(categories, stored("category_id")),
        SUPPLIER_OPTIONS=_options(suppliers, stored("supplier_id")),
        MODALITY_STOCK=" selected" if stored("modality", "stock") == "stock" else "",
        MODALITY_ORDER=" selected" if stored("modality") == "order" else "",
        STATUS=esc(status),
        STATUS_OPTIONS="".join(
            f'<option value="{code}"{" selected" if status==code else ""}>{label}</option>'
            for code, label in (("draft", "Borrador"), ("active", "Activo"), ("archived", "Archivado"))
        ),
        PRICE=f'{price_cents/100:.0f}',
        COMPARE=f'{compare_cents/100:.0f}',
        COST=f'{cost_cents/100:.0f}',
        TARGET_MARGIN=str(target_margin),
        MARGIN_COP=money(margin_cents(cost_cents, price_cents)),
        MARGIN_PERCENT=f'{margin_percent(cost_cents, price_cents):.1f} %',
        DISCOUNT_PERCENT=f'{discount_percent(price_cents, compare_cents):.1f} %',
        SUGGESTED_PRICE=money(suggested_price(cost_cents, target_margin)),
        WHATSAPP_MESSAGE=esc(stored("whatsapp_message")),
        STOCK=stock, THRESHOLD=stored("low_stock_threshold", 3),
        DELIVERY_HOURS=stored("delivery_hours", 24), IMPORT_DAYS=stored("import_days", 30),
        SUPPLIER_URL=esc(stored("supplier_url")), TAGS=esc(stored("tags")),
        SPECS=esc(specs_text(stored("attributes", "{}") or "{}")),
        SEO_TITLE=esc(stored("seo_title")), SEO_DESCRIPTION=esc(stored("seo_description")),
        RELATED_OPTIONS=related_options,
        RELATED_IDS=",".join(str(item) for item in related_ids),
        FEATURED=checked("featured"), BEST=checked("best_seller"), NEW=checked("is_new"),
        IMAGE_PANEL=image_panel, FORM_PANEL=variant_panel,
        EDITING="1" if pid else "",
        EDITING_DISABLED="readonly" if pid else "",
        STOCK_HINT=(f'Existencia actual: {stock}. Use Inventario para registrar movimientos.'
                    if pid else "La existencia inicial se registra como entrada de inventario."),
    )
    return admin_page(request, "Editar producto" if pid else "Nuevo producto", content, "products")


def _form_values(request: Request) -> dict[str, Any]:
    return {
        "name": request.param("name", "").strip(),
        "slug_source": request.param("slug") or request.param("name"),
        "sku": request.param("sku", "").strip(),
        "category_id": int_or_none(request.param("category_id")),
        "supplier_id": int_or_none(request.param("supplier_id")),
        "short_description": request.param("short_description", "").strip(),
        "description": request.param("description", "").strip(),
        "modality": "order" if request.param("modality") == "order" else "stock",
        "status": request.param("status", "draft") if request.param("status") in {"draft", "active", "archived"} else "draft",
        "price_cents": _cents(request.param("price")),
        "compare_price_cents": _cents(request.param("compare_price")),
        "cost_cents": _cents(request.param("cost")),
        "low_stock_threshold": max(0, request.int_param("low_stock_threshold", 3)),
        "delivery_hours": max(0, request.int_param("delivery_hours", 24)),
        "import_days": max(0, request.int_param("import_days", 30)),
        "supplier_url": request.param("supplier_url", "").strip(),
        "tags": request.param("tags", "").strip(),
        "attributes": parse_specs(request.param("attributes")),
        "target_margin_percent": min(100, max(0, request.int_param("target_margin_percent", 0))),
        "whatsapp_message": request.param("whatsapp_message", "").strip()[:2000],
        "featured": 1 if request.param("featured") == "1" else 0,
        "best_seller": 1 if request.param("best_seller") == "1" else 0,
        "is_new": 1 if request.param("is_new") == "1" else 0,
        "related_ids": parse_ids(request.param("related_ids")),
        "seo_title": request.param("seo_title", "").strip(),
        "seo_description": request.param("seo_description", "").strip(),
    }


def product_create(request: Request) -> Response:
    values = _form_values(request)
    if len(values["name"]) < 2 or values["price_cents"] <= 0:
        return go("/admin/products/new", error="Nombre y precio son obligatorios")
    slug = _unique_slug(values["slug_source"])
    stock = max(0, request.int_param("stock", 0)) if values["modality"] == "stock" else 0
    columns = ["name", "slug", "sku", "category_id", "supplier_id", "short_description", "description",
               "modality", "status", "price_cents", "compare_price_cents", "cost_cents", "stock",
               "low_stock_threshold", "delivery_hours", "import_days", "supplier_url", "tags",
                "attributes", "target_margin_percent", "whatsapp_message", "featured", "best_seller",
                "is_new", "seo_title", "seo_description", "published_at"]
    data = [values["name"], slug, values["sku"], values["category_id"], values["supplier_id"],
            values["short_description"], values["description"], values["modality"], values["status"],
            values["price_cents"], values["compare_price_cents"], values["cost_cents"], 0,
            values["low_stock_threshold"], values["delivery_hours"], values["import_days"],
             values["supplier_url"], values["tags"], values["attributes"], values["target_margin_percent"],
             values["whatsapp_message"], values["featured"], values["best_seller"],
             values["is_new"], values["seo_title"], values["seo_description"],
            "CURRENT_TIMESTAMP" if values["status"] == "active" else None]
    placeholders = []
    for item in data:
        placeholders.append("CURRENT_TIMESTAMP" if item == "CURRENT_TIMESTAMP" else "?")
    clean_data = [item for item in data if item != "CURRENT_TIMESTAMP"]
    with transaction() as conn:
        product_id = conn.execute(
            f"INSERT INTO products({','.join(columns)}) VALUES ({','.join(placeholders)})", clean_data
        ).lastrowid
        for related_id in values["related_ids"]:
            if related_id != product_id:
                conn.execute("INSERT OR IGNORE INTO product_related(product_id,related_id) VALUES (?,?)",
                             (product_id, related_id))
    if stock > 0:
        add_movement(product_id, "entry", stock, cost_cents=values["cost_cents"],
                     note="Existencia inicial", user_id=request.user["id"])
    audit(request, "create", "product", product_id, {"name": values["name"]})
    return go("/admin/products", ok="Producto creado correctamente")


def product_update(request: Request, pid: int) -> Response:
    product = one("SELECT * FROM products WHERE id=?", (pid,))
    if not product:
        raise HTTPError(404, "Producto no encontrado")
    values = _form_values(request)
    if len(values["name"]) < 2 or values["price_cents"] <= 0:
        return go(f"/admin/products/{pid}/edit", error="Nombre y precio son obligatorios")
    slug = _unique_slug(values["slug_source"], pid)
    if values["category_id"] and not one("SELECT 1 FROM categories WHERE id=?", (values["category_id"],)):
        return go(f"/admin/products/{pid}/edit", error="La categoría seleccionada no existe")
    if values["supplier_id"] and not one("SELECT 1 FROM suppliers WHERE id=?", (values["supplier_id"],)):
        return go(f"/admin/products/{pid}/edit", error="El proveedor seleccionado no existe")
    fields = ["name=?", "slug=?", "sku=?", "category_id=?", "supplier_id=?", "short_description=?",
              "description=?", "modality=?", "status=?", "price_cents=?", "compare_price_cents=?",
              "cost_cents=?", "low_stock_threshold=?", "delivery_hours=?", "import_days=?",
               "supplier_url=?", "tags=?", "attributes=?", "target_margin_percent=?",
               "whatsapp_message=?", "featured=?", "best_seller=?",
              "is_new=?", "seo_title=?", "seo_description=?", "updated_at=CURRENT_TIMESTAMP"]
    params: list[Any] = [values["name"], slug, values["sku"], values["category_id"], values["supplier_id"],
                         values["short_description"], values["description"], values["modality"],
                         values["status"], values["price_cents"], values["compare_price_cents"],
                         values["cost_cents"], values["low_stock_threshold"], values["delivery_hours"],
                          values["import_days"], values["supplier_url"], values["tags"], values["attributes"],
                          values["target_margin_percent"], values["whatsapp_message"],
                          values["featured"], values["best_seller"], values["is_new"],
                         values["seo_title"], values["seo_description"], pid]
    status_changed = product["status"] != values["status"]
    if status_changed and values["status"] == "active" and not product["published_at"]:
        fields.append("published_at=CURRENT_TIMESTAMP")
    with transaction() as conn:
        conn.execute(f"UPDATE products SET {','.join(fields)} WHERE id=?", params)
        conn.execute("DELETE FROM product_related WHERE product_id=?", (pid,))
        for related_id in values["related_ids"]:
            if related_id != pid:
                conn.execute("INSERT OR IGNORE INTO product_related(product_id,related_id) VALUES (?,?)",
                             (pid, related_id))
    audit(request, "update", "product", pid, {
        "name": values["name"], "status_from": product["status"], "status_to": values["status"],
    })
    return go(f"/admin/products/{pid}/edit", ok="Producto actualizado")


def product_delete(request: Request, pid: int) -> Response:
    product = one("SELECT * FROM products WHERE id=?", (pid,))
    if not product:
        raise HTTPError(404, "Producto no encontrado")
    for image in query("SELECT url FROM product_images WHERE product_id=?", (pid,)):
        remove_upload(image["url"])
    execute("DELETE FROM products WHERE id=?", (pid,))
    audit(request, "delete", "product", pid, {"name": product["name"]})
    return go("/admin/products", ok="Producto eliminado")


def product_duplicate(request: Request, pid: int) -> Response:
    product = one("SELECT * FROM products WHERE id=?", (pid,))
    if not product:
        raise HTTPError(404, "Producto no encontrado")
    slug = _unique_slug(product["name"] + " copia")
    with transaction() as conn:
        new_id = conn.execute(
            "INSERT INTO products(category_id,supplier_id,name,slug,sku,short_description,description,modality,"
            "status,price_cents,compare_price_cents,cost_cents,stock,low_stock_threshold,delivery_hours,"
            "import_days,supplier_url,tags,attributes,target_margin_percent,whatsapp_message,"
            "featured,best_seller,is_new) "
            "VALUES (?,?,?,?,?,?,?,?,'draft',?,?,?,0,?,?,?,?,?,?,?,?,?,?,?)",
            (product["category_id"], product["supplier_id"], product["name"] + " (copia)", slug,
             product["sku"], product["short_description"], product["description"], product["modality"],
             product["price_cents"], product["compare_price_cents"], product["cost_cents"],
             product["low_stock_threshold"], product["delivery_hours"], product["import_days"],
              product["supplier_url"], product["tags"], product["attributes"],
              product["target_margin_percent"], product["whatsapp_message"], product["featured"],
              product["best_seller"], product["is_new"]),
        ).lastrowid
        conn.execute(
            "INSERT INTO product_images(product_id,url,alt,sort_order) "
            "SELECT ?,url,alt,sort_order FROM product_images WHERE product_id=?", (new_id, pid)
        )
        conn.execute(
            "INSERT INTO product_variants(product_id,name,sku,price_delta_cents,stock,active) "
            "SELECT ?,name,sku,price_delta_cents,0,active FROM product_variants WHERE product_id=?", (new_id, pid)
        )
    audit(request, "duplicate", "product", new_id, {"source": pid})
    return go(f"/admin/products/{new_id}/edit", ok="Producto duplicado como borrador")


def product_toggle(request: Request, pid: int) -> Response:
    product = one("SELECT * FROM products WHERE id=?", (pid,))
    if not product:
        raise HTTPError(404, "Producto no encontrado")
    new_status = "active" if product["status"] != "active" else "draft"
    first_publish = ",published_at=CURRENT_TIMESTAMP" if new_status == "active" and not product["published_at"] else ""
    execute(f"UPDATE products SET status=?, updated_at=CURRENT_TIMESTAMP{first_publish} WHERE id=?",
            (new_status, pid))
    audit(request, "toggle", "product", pid, {"status": new_status})
    return go("/admin/products", ok=f"Estado cambiado a {new_status}")


def images_upload(request: Request, pid: int) -> Response:
    if not one("SELECT 1 FROM products WHERE id=?", (pid,)):
        raise HTTPError(404, "Producto no encontrado")
    urls = upload_images(request, "images")
    with transaction() as conn:
        start = conn.execute("SELECT COALESCE(MAX(sort_order),0) FROM product_images WHERE product_id=?", (pid,)).fetchone()[0]
        for index, url in enumerate(urls):
            conn.execute("INSERT INTO product_images(product_id,url,alt,sort_order) VALUES (?,?,?,?)",
                         (pid, url, "", start + index + 1))
    audit(request, "upload", "product_image", pid, {"count": len(urls)})
    return go(f"/admin/products/{pid}/edit", ok=f"{len(urls)} imagen(es) agregada(s)")


def image_delete(request: Request, pid: int, image_id: int) -> Response:
    image = one("SELECT * FROM product_images WHERE id=? AND product_id=?", (image_id, pid))
    if not image:
        raise HTTPError(404, "Imagen no encontrada")
    remove_upload(image["url"])
    execute("DELETE FROM product_images WHERE id=?", (image_id,))
    audit(request, "delete", "product_image", image_id)
    return go(f"/admin/products/{pid}/edit", ok="Imagen eliminada")


def variant_create(request: Request, pid: int) -> Response:
    if not one("SELECT 1 FROM products WHERE id=?", (pid,)):
        raise HTTPError(404, "Producto no encontrado")
    name = request.param("name", "").strip()
    if not name:
        return go(f"/admin/products/{pid}/edit", error="El nombre de la variante es obligatorio")
    execute(
        "INSERT INTO product_variants(product_id,name,sku,price_delta_cents,stock,active) VALUES (?,?,?,?,?,1)",
        (pid, name, request.param("sku", "").strip(), _cents(request.param("price_delta")),
         max(0, request.int_param("stock", 0))),
    )
    audit(request, "create", "variant", pid, {"name": name})
    return go(f"/admin/products/{pid}/edit", ok="Variante agregada")


def variant_update(request: Request, pid: int, variant_id: int) -> Response:
    variant = one("SELECT * FROM product_variants WHERE id=? AND product_id=?", (variant_id, pid))
    if not variant:
        raise HTTPError(404, "Variante no encontrada")
    name = request.param("name", "").strip()
    if not name:
        return go(f"/admin/products/{pid}/edit", error="El nombre de la variante es obligatorio")
    execute(
        "UPDATE product_variants SET name=?, sku=?, price_delta_cents=?, stock=?, active=? WHERE id=? AND product_id=?",
        (name, request.param("sku", "").strip(), _cents(request.param("price_delta")),
         max(0, request.int_param("stock", 0)),
         1 if request.param("active") in {"1", "on", "true"} else 0, variant_id, pid),
    )
    audit(request, "update", "variant", variant_id, {"name": name})
    return go(f"/admin/products/{pid}/edit", ok="Variante actualizada")


def variant_delete(request: Request, pid: int, variant_id: int) -> Response:
    execute("DELETE FROM product_variants WHERE id=? AND product_id=?", (variant_id, pid))
    audit(request, "delete", "variant", variant_id)
    return go(f"/admin/products/{pid}/edit", ok="Variante eliminada")


def category_create(request: Request) -> Response:
    name = request.param("name", "").strip()
    if len(name) < 2:
        return go("/admin/products", error="El nombre de la categoría es obligatorio")
    slug = slugify(request.param("slug") or name)
    try:
        execute("INSERT INTO categories(parent_id,name,slug,description,sort_order,seo_title,seo_description) VALUES (?,?,?,?,?,?,?)",
                (int_or_none(request.param("parent_id")), name, slug,
                 request.param("description", "").strip(), request.int_param("sort_order", 0),
                 request.param("seo_title", "").strip(), request.param("seo_description", "").strip()))
    except Exception:
        return go("/admin/products", error="Ya existe una categoría con ese identificador")
    audit(request, "create", "category", slug, {"name": name})
    return go("/admin/products", ok="Categoría creada")


def category_toggle(request: Request, cid: int) -> Response:
    row = one("SELECT active FROM categories WHERE id=?", (cid,))
    if row:
        execute("UPDATE categories SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?", (cid,))
        audit(request, "toggle", "category", cid)
    return go("/admin/products", ok="Categoría actualizada")


def category_delete(request: Request, cid: int) -> Response:
    if query("SELECT 1 FROM products WHERE category_id=? LIMIT 1", (cid,)):
        return go("/admin/products", error="La categoría tiene productos asociados; desactívala en su lugar")
    execute("DELETE FROM categories WHERE id=?", (cid,))
    audit(request, "delete", "category", cid)
    return go("/admin/products", ok="Categoría eliminada")


def supplier_create(request: Request) -> Response:
    name = request.param("name", "").strip()
    if len(name) < 2:
        return go("/admin/products", error="El nombre del proveedor es obligatorio")
    execute("INSERT INTO suppliers(name,contact,url,notes) VALUES (?,?,?,?)",
            (name, request.param("contact", "").strip(), request.param("url", "").strip(),
             request.param("notes", "").strip()))
    audit(request, "create", "supplier", name)
    return go("/admin/products", ok="Proveedor registrado")
