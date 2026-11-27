"""Configuración comercial, visual, WhatsApp, SEO y habilitación de universos."""
from __future__ import annotations

from app.config import Config
from app.core.http import Request, Response, redirect
from app.core.render import esc, render
from app.db import execute, query, settings_group, transaction
from app.services.whatsapp import business_phone
from . import admin_page, audit, csrf_input, go, upload_image

COMMERCIAL_FIELDS = [
    ("business_name", "Nombre comercial", "text"), ("legal_name", "Razón / nombre legal", "text"),
    ("description", "Descripción de la tienda", "textarea"), ("currency", "Moneda", "text"),
    ("country", "País", "text"), ("department", "Departamento", "text"), ("city", "Ciudad", "text"),
    ("address", "Dirección", "text"), ("phone", "Teléfono", "text"), ("email", "Correo", "email"),
    ("whatsapp", "Número de WhatsApp (ej. 573001234567)", "text"), ("hours", "Horarios de atención", "text"),
    ("social_instagram", "Instagram (URL)", "url"), ("social_facebook", "Facebook (URL)", "url"),
    ("social_tiktok", "TikTok (URL)", "url"),
    ("delivery_note", "Nota de entregas", "textarea"), ("import_conditions", "Condiciones de importación", "textarea"),
    ("terms", "Condiciones de compra", "textarea"), ("privacy", "Política de privacidad", "textarea"),
    ("returns", "Cambios y devoluciones", "textarea"), ("payment_methods", "Métodos de pago informativos", "textarea"),
    ("sale_disclaimer", "Aviso de venta y confirmación", "textarea"),
    ("footer_text", "Texto del pie de página", "textarea"),
]

VISUAL_FIELDS = [
    ("logo", "Logotipo (URL o archivo)", "file"), ("favicon", "Favicon (URL o archivo)", "file"),
    ("primary_color", "Color primario", "color"), ("secondary_color", "Color secundario", "color"),
    ("accent_color", "Color de acento", "color"), ("background_color", "Color de fondo del portal", "color"),
    ("font_family", "Familia tipográfica", "text"), ("hero_title", "Título del hero del portal", "text"),
    ("hero_subtitle", "Subtítulo del hero del portal", "textarea"),
    ("shop_hero_title", "Título del hero de la tienda", "text"),
    ("shop_hero_subtitle", "Subtítulo del hero de la tienda", "textarea"),
    ("footer_visible", "Mostrar pie de página (1/0)", "text"),
    ("whatsapp_button_visible", "Mostrar botón flotante de WhatsApp (1/0)", "text"),
]

WHATSAPP_FIELDS = [
    ("enabled", "Botones de WhatsApp habilitados (1/0)", "text"),
    ("default_message", "Mensaje de contacto general", "textarea"),
    ("product_message", "Plantilla producto en inventario", "textarea"),
    ("order_message", "Plantilla producto bajo pedido", "textarea"),
    ("contact_message", "Mensaje de contacto desde la tienda", "textarea"),
]

SEO_FIELDS = [
    ("title", "Título del sitio", "text"), ("description", "Meta descripción", "textarea"),
    ("keywords", "Palabras clave", "textarea"), ("og_image", "Imagen Open Graph (URL)", "text"),
    ("robots_index", "Indexar (1) o no indexar (0)", "text"), ("canonical", "URL canónica", "text"),
]


def register(router) -> None:
    router.get("/admin/settings", lambda request: redirect("/admin/settings/commercial"), name="admin.settings")
    for path in ("commercial", "visual", "whatsapp", "seo", "modules"):
        permission = "whatsapp.manage" if path == "whatsapp" else "settings.edit"
        router.get(f"/admin/settings/{path}", settings_page, permission=permission, name=f"admin.settings.{path}")
        router.post(f"/admin/settings/{path}", settings_save, permission=permission, name=f"admin.settings.{path}.save")
    router.post("/admin/settings/whatsapp/templates", template_create, permission="whatsapp.manage", name="admin.wa.template.create")
    router.post("/admin/settings/whatsapp/templates/{tid}/update", template_update, permission="whatsapp.manage", name="admin.wa.template.update")
    router.post("/admin/settings/whatsapp/templates/{tid}/delete", template_delete, permission="whatsapp.manage", name="admin.wa.template.delete")


def _fields(category: str, definitions: list[tuple[str, str, str]], values: dict[str, str], csrf: str) -> str:
    parts = []
    for key, label, kind in definitions:
        value = values.get(key, "")
        if kind == "textarea":
            control = f'<textarea name="{key}" rows="3">{esc(value)}</textarea>'
        elif kind == "color":
            control = f'<input type="color" name="{key}" value="{esc(value or "#6d5cff")}">'
        elif kind == "file":
            control = (f'<input type="file" name="file_{key}" accept="image/*">'
                       f'<input type="hidden" name="{key}" value="{esc(value)}">'
                       + (f'<img src="{esc(value)}" width="90" style="margin-top:.4rem;border-radius:8px" alt="">' if value else ""))
        else:
            control = f'<input type="{kind}" name="{key}" value="{esc(value)}">'
        parts.append(f'<div class="field{" full" if kind in {"textarea","file"} else ""}">'
                     f'<label>{esc(label)}</label>{control}</div>')
    return "".join(parts)


def settings_page(request: Request, section: str = "commercial") -> Response:
    if section not in {"commercial", "visual", "whatsapp", "seo", "modules"}:
        from app.core.http import HTTPError
        raise HTTPError(404, "Sección de configuración no encontrada")
    values = settings_group(section)
    if section == "commercial":
        fields = _fields(section, COMMERCIAL_FIELDS, values, csrf_input(request))
    elif section == "visual":
        fields = _fields(section, VISUAL_FIELDS, values, csrf_input(request))
    elif section == "whatsapp":
        fields = _fields(section, WHATSAPP_FIELDS, values, csrf_input(request))
        commercial = settings_group("commercial")
        fields += f'<div class="field full"><label>Número de WhatsApp</label><input name="whatsapp_number" value="{esc(business_phone(commercial.get("whatsapp", "")))}"></div>'
        templates = query("SELECT * FROM whatsapp_templates ORDER BY id")
        template_rows = "".join(
            f'<tr><td>{esc(t["name"])}</td><td>{esc(t["code"])}</td><td>{esc(t["modality"])}</td>'
            f'<td><form method="post" action="/admin/settings/whatsapp/templates/{t["id"]}/update">{csrf_input(request)}'
            f'<label class="checkline"><input type="checkbox" name="active" value="1"{" checked" if t["active"] else ""}> Activa</label>'
            f'<textarea name="body" rows="2">{esc(t["body"])}</textarea>'
            '<button class="btn btn-sm btn-primary" type="submit">Guardar</button></form></td>'
            f'<td><form method="post" action="/admin/settings/whatsapp/templates/{t["id"]}/delete">{csrf_input(request)}'
            '<button class="btn btn-sm btn-danger" type="submit">Eliminar</button></form></td></tr>'
            for t in templates
        )
        fields += render("admin/wa_templates.html", CSRF=csrf_input(request), ROWS=template_rows)
    elif section == "seo":
        fields = _fields(section, SEO_FIELDS, values, csrf_input(request))
    else:
        modules = query("SELECT * FROM modules ORDER BY sort_order")
        fields = "".join(
            f'<tr><td>{esc(m["name"])}</td><td>{esc(m["description"])}</td>'
            f'<td><label class="checkline"><input type="checkbox" name="module_{m["id"]}" value="1"{" checked" if m["enabled"] else ""}> Habilitado</label></td>'
            f'<td><label class="checkline"><input type="checkbox" name="soon_{m["id"]}" value="1"{" checked" if m["coming_soon"] else ""}> Mostrar como planeado</label></td></tr>'
            for m in modules
        )
        fields = '<table><thead><tr><th>Universo</th><th>Descripción</th><th>Activo</th><th>Planeado</th></tr></thead><tbody>' + fields + '</tbody></table>'
    tab_active = lambda name: "active" if section == name else ""
    content = render("admin/settings_form.html", SECTION=esc(section.upper()), CSRF=csrf_input(request), FIELDS=fields,
                     EXTRA="", TAB_COMMERCIAL=tab_active("commercial"), TAB_VISUAL=tab_active("visual"),
                      TAB_WHATSAPP=tab_active("whatsapp"), TAB_SEO=tab_active("seo"),
                      TAB_MODULES=tab_active("modules"), TAB_PAGES="")

    return admin_page(request, "Configuración — " + section.title(), content,
                      "whatsapp" if section == "whatsapp" else "settings")


def settings_save(request: Request, section: str) -> Response:
    definitions = {
        "commercial": COMMERCIAL_FIELDS, "visual": VISUAL_FIELDS,
        "whatsapp": WHATSAPP_FIELDS, "seo": SEO_FIELDS,
    }.get(section, [])
    with transaction() as conn:
        for key, _label, kind in definitions:
            value = request.param(key)
            if kind == "file":
                uploaded = [f for f in request.files if f.field == f"file_{key}" and f.data]
                if uploaded:
                    from . import _save_upload
                    value = _save_upload(uploaded[0])
            conn.execute(
                "INSERT INTO settings(category,key,value) VALUES (?,?,?) "
                "ON CONFLICT(category,key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                (section, key, value),
            )
        if section == "whatsapp":
            number = business_phone(request.param("whatsapp_number", ""))
            conn.execute(
                "INSERT INTO settings(category,key,value) VALUES ('commercial','whatsapp',?) "
                "ON CONFLICT(category,key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                (number,),
            )
        if section == "modules":
            for module in query("SELECT id FROM modules"):
                conn.execute("UPDATE modules SET enabled=?,coming_soon=? WHERE id=?",
                             (1 if request.param(f"module_{module['id']}") == "1" else 0,
                              1 if request.param(f"soon_{module['id']}") == "1" else 0,
                              module["id"]))
    audit(request, "update", "settings", section)
    return go(f"/admin/settings/{section}", ok="Configuración guardada")


def template_create(request: Request) -> Response:
    code = request.param("code", "").strip().lower().replace(" ", "_")
    name = request.param("name", "").strip()
    body = request.param("body", "").strip()
    if not code or not name or not body:
        return go("/admin/settings/whatsapp", error="Código, nombre y mensaje son obligatorios")
    try:
        execute("INSERT INTO whatsapp_templates(code,name,body,modality,active) VALUES (?,?,?,?,?)",
                (code, name, body, request.param("modality", "any"),
                 1 if request.param("active") == "1" else 0))
    except Exception:
        return go("/admin/settings/whatsapp", error="Ya existe una plantilla con ese código")
    audit(request, "create", "whatsapp_template", code)
    return go("/admin/settings/whatsapp", ok="Plantilla creada")


def template_update(request: Request, tid: int) -> Response:
    execute("UPDATE whatsapp_templates SET body=?,name=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (request.param("body", "").strip(), request.param("name", "").strip(),
             1 if request.param("active") == "1" else 0, tid))
    audit(request, "update", "whatsapp_template", tid)
    return go("/admin/settings/whatsapp", ok="Plantilla actualizada")


def template_delete(request: Request, tid: int) -> Response:
    execute("DELETE FROM whatsapp_templates WHERE id=?", (tid,))
    audit(request, "delete", "whatsapp_template", tid)
    return go("/admin/settings/whatsapp", ok="Plantilla eliminada")
