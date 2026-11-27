"""Renderizado de plantillas con escapamiento explícito y sin motores externos."""
from __future__ import annotations

import html
from datetime import datetime
from pathlib import Path
from string import Template
from urllib.parse import quote

from app.config import TEMPLATE_DIR
from app.core.pages import is_visible, page_banner, public_pages, visibility_for_path
from app.db import get_setting, modules_enabled, settings_group


class _Context(dict):
    def __missing__(self, key: str) -> str:
        return ""


def esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def attr(value: object) -> str:
    return esc(value)


def money(cents: int, currency: str = "COP") -> str:
    amount = f"{(cents or 0):,}".replace(",", ".")
    return f"$ {amount} {currency}"


def date_label(value: str) -> str:
    if not value:
        return "—"
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y")
    except ValueError:
        return value[:10]


def render(template_name: str, **context: object) -> str:
    path = TEMPLATE_DIR / template_name
    if not path.exists():
        raise FileNotFoundError(f"Plantilla no encontrada: {template_name}")
    return Template(path.read_text(encoding="utf-8")).substitute(_Context(context))


def render_page(
    title: str,
    content: str,
    *,
    body_class: str = "mode-portal",
    active: str = "",
    head_extra: str = "",
    scripts: str = "",
    request: object = None,
    seo_override: dict[str, str] | None = None,
) -> str:
    from app.core.auth import public_csrf_token
    from app.services.whatsapp import business_phone, enabled as whatsapp_enabled

    commercial = settings_group("commercial")
    visual = settings_group("visual")
    seo = settings_group("seo")
    wa_settings = settings_group("whatsapp")
    if seo_override:
        seo = {**seo, **{k: v for k, v in seo_override.items() if v}}
    enabled = modules_enabled()
    wa_visible = (whatsapp_enabled(wa_settings)
                  and visual.get("whatsapp_button_visible", "1") == "1")
    number = business_phone(commercial.get("whatsapp", "")) if wa_visible else ""
    message = wa_settings.get("default_message", "Hola OTRAVERSO, quiero información sobre sus productos.")
    whatsapp_link = (f"https://wa.me/{number}?text={quote(message[:1200])}" if number else "#")
    nav = _public_nav(enabled, active, request)
    footer = _public_footer(commercial, visual, enabled, request)
    banner = page_banner(getattr(request, "path", ""), request) if request is not None else ""
    logo_url = visual.get("logo", "").strip() or "/static/brand/otraverso-logo.svg"
    favicon_url = visual.get("favicon", "").strip() or "/static/favicon.svg"
    return render("base.html",
        TITLE=esc(seo.get("title") or title or "OTRAVERSO"),
        DESCRIPTION=esc(seo.get("description", "")),
        KEYWORDS=esc(seo.get("keywords", "")),
        ROBOTS="index, follow" if seo.get("robots_index", "1") == "1" else "noindex, nofollow",
        CANONICAL=esc(seo.get("canonical", "")),
        OG_IMAGE=esc(seo.get("og_image", "")),
        FAVICON=esc(favicon_url),
        SITE_NAME=esc(commercial.get("business_name", "OTRAVERSO")),
        LOGO_SRC=esc(logo_url),
        BODY_CLASS=esc(body_class),
        NAV_HTML=nav,
        FOOTER_HTML=footer,
        CONTENT=banner + content,
        PRIMARY_COLOR=esc(visual.get("primary_color", "#6d5cff")),
        SECONDARY_COLOR=esc(visual.get("secondary_color", "#19d3c5")),
        ACCENT_COLOR=esc(visual.get("accent_color", "#ffb347")),
        BACKGROUND_COLOR=esc(visual.get("background_color", "#070713")),
        FONT_FAMILY=esc(visual.get("font_family", "system-ui, sans-serif")),
        WHATSAPP_LINK=esc(whatsapp_link),
        WHATSAPP_VISIBLE="" if wa_visible and number else "hidden",
        PUBLIC_CSRF=esc(public_csrf_token() if not getattr(request, "user", None) else ""),
        FOOTER_VISIBLE="" if visual.get("footer_visible", "1") == "1" else "hidden",
        HEAD_EXTRA=head_extra,
        SCRIPTS=scripts,
    )


def _public_nav(enabled: set[str], active: str, request: object) -> str:
    rows = {row["code"]: row for row in public_pages()}
    parts = []

    def link(code: str, label: str, href: str, *, always: bool = False,
             disabled_placeholder: bool = False) -> None:
        row = rows.get(code)
        if not row or row["nav_visible"] != 1 or not is_visible(code):
            return
        if not always and code not in enabled:
            if disabled_placeholder:
                parts.append(f'<span class="nav-link nav-soon" title="Universo planeado">{label}</span>')
            return
        css = "nav-link active" if active == code else "nav-link"
        state = "PRONTO" if row["status"] == "coming_soon" else "VER" if row["status"] == "page_only" else ""
        status = f" · {state}" if state else ""
        parts.append(
            f'<a class="{css}" href="{href}" data-page-code="{esc(code)}" '
            f'data-page-status="{esc(row["status"])}">{label}{status}</a>'
        )

    link("portal", "Inicio", "/")
    link("shop", "Tienda", "/shop")
    link("play", "PLAY", "/play", always=True)
    link("whatif", "WHAT IF", "/what-if", disabled_placeholder=True)
    parts.append('<span class="nav-link nav-soon" title="Universo planeado">LABS</span>')
    permissions = set(getattr(request, "permission_codes", set())) if request is not None else set()
    if request is not None and getattr(request, "user", None) and any(
        code in permissions for code in ("dashboard.view", "products.view", "orders.view", "pages.manage",
                                         "settings.edit", "whatsapp.manage", "analytics.view")
    ):
        parts.append('<a class="nav-link nav-admin" href="/admin">Panel</a>')
    else:
        parts.append('<a class="nav-link nav-admin" href="/admin/login">Admin</a>')
    return "".join(parts)


def _public_footer(commercial: dict[str, str], visual: dict[str, str], enabled: set[str],
                   request: object = None) -> str:
    social = []
    for key, label in (("social_instagram", "Instagram"), ("social_facebook", "Facebook"), ("social_tiktok", "TikTok")):
        url = commercial.get(key, "").strip()
        if url:
            social.append(f'<a href="{esc(url)}" rel="noopener noreferrer" target="_blank">{label}</a>')
    pages = [
        ('/shop/cobertura', 'Cobertura y entregas'),
        ('/pages/condiciones', 'Condiciones de compra'),
        ('/pages/pagos', 'Métodos de pago'),
        ('/pages/privacidad', 'Privacidad'),
        ('/pages/devoluciones', 'Cambios y devoluciones'),
    ]
    visible_pages = []
    for href, label in pages:
        state = visibility_for_path(href)
        if state is None or state["visible"]:
            visible_pages.append((href, label))
    links = "".join(f'<a href="{href}">{label}</a>' for href, label in visible_pages)
    social_html = " · ".join(social)
    return f"""
    <div class="footer-grid">
      <div><strong>{esc(commercial.get('business_name', 'OTRAVERSO'))}</strong>
        <p>{esc(commercial.get('footer_text', ''))}</p>
        <small>{esc(commercial.get('address', ''))} · {esc(commercial.get('hours', ''))}</small>
      </div>
      <div><strong>Información</strong><div class="footer-links">{links}</div></div>
      <div><strong>Contacto</strong><p>{esc(commercial.get('email', ''))} {esc(commercial.get('phone', ''))}</p>
        <div class="footer-links">{social_html}</div></div>
    </div>
    <div class="footer-bottom">© {datetime.now().year} OTRAVERSO. Todos los derechos reservados.</div>
    """
