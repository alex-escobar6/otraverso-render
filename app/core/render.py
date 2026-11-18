"""Renderizado de plantillas con escapamiento explícito y sin motores externos."""
from __future__ import annotations

import html
from datetime import datetime
from pathlib import Path
from string import Template

from app.config import TEMPLATE_DIR
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
    commercial = settings_group("commercial")
    visual = settings_group("visual")
    seo = settings_group("seo")
    if seo_override:
        seo = {**seo, **{k: v for k, v in seo_override.items() if v}}
    enabled = modules_enabled()
    whatsapp = commercial.get("whatsapp", "")
    whatsapp_link = f"https://wa.me/{whatsapp}" if whatsapp else "#"
    nav = _public_nav(enabled, active, request)
    footer = _public_footer(commercial, visual, enabled)
    logo_url = visual.get("logo", "").strip()
    logo_html = f'<img class="brand-image" src="{esc(logo_url)}" alt="OTRAVERSO">' if logo_url else ""
    favicon_url = visual.get("favicon", "").strip()
    return render("base.html",
        TITLE=esc(seo.get("title") or title or "OTRAVERSO"),
        DESCRIPTION=esc(seo.get("description", "")),
        KEYWORDS=esc(seo.get("keywords", "")),
        ROBOTS="index, follow" if seo.get("robots_index", "1") == "1" else "noindex, nofollow",
        CANONICAL=esc(seo.get("canonical", "")),
        OG_IMAGE=esc(seo.get("og_image", "")),
        FAVICON=esc(favicon_url),
        SITE_NAME=esc(commercial.get("business_name", "OTRAVERSO")),
        LOGO=logo_html,
        BODY_CLASS=esc(body_class),
        NAV_HTML=nav,
        FOOTER_HTML=footer,
        CONTENT=content,
        PRIMARY_COLOR=esc(visual.get("primary_color", "#6d5cff")),
        SECONDARY_COLOR=esc(visual.get("secondary_color", "#19d3c5")),
        ACCENT_COLOR=esc(visual.get("accent_color", "#ffb347")),
        BACKGROUND_COLOR=esc(visual.get("background_color", "#070713")),
        FONT_FAMILY=esc(visual.get("font_family", "system-ui, sans-serif")),
        WHATSAPP_LINK=esc(whatsapp_link),
        WHATSAPP_VISIBLE="" if visual.get("whatsapp_button_visible", "1") == "1" else "hidden",
        FOOTER_VISIBLE="" if visual.get("footer_visible", "1") == "1" else "hidden",
        HEAD_EXTRA=head_extra,
        SCRIPTS=scripts,
    )


def _public_nav(enabled: set[str], active: str, request: object) -> str:
    links = [("portal", "/", "Inicio"), ("shop", "/shop", "Tienda")]
    parts = []
    for code, href, label in links:
        if code not in enabled:
            continue
        css = "nav-link active" if active == code else "nav-link"
        parts.append(f'<a class="{css}" href="{href}">{label}</a>')
    parts.append('<a class="nav-link" href="/play">PLAY</a>')
    for label in ("WHAT IF", "LABS"):
        parts.append(f'<span class="nav-link nav-soon" title="Universo planeado">{label}</span>')
    if request is not None and getattr(request, "user", None):
        parts.append('<a class="nav-link nav-admin" href="/admin">Panel</a>')
    else:
        parts.append('<a class="nav-link nav-admin" href="/admin/login">Admin</a>')
    return "".join(parts)


def _public_footer(commercial: dict[str, str], visual: dict[str, str], enabled: set[str]) -> str:
    social = []
    for key, label in (("social_instagram", "Instagram"), ("social_facebook", "Facebook"), ("social_tiktok", "TikTok")):
        url = commercial.get(key, "").strip()
        if url:
            social.append(f'<a href="{esc(url)}" rel="noopener noreferrer" target="_blank">{label}</a>')
    pages = [
        ('/shop/cobertura', 'Cobertura y entregas'),
        ('/pages/condiciones', 'Condiciones de compra'),
        ('/pages/privacidad', 'Privacidad'),
        ('/pages/devoluciones', 'Cambios y devoluciones'),
    ]
    links = "".join(f'<a href="{href}">{label}</a>' for href, label in pages)
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
