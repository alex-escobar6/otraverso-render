"""Portada principal de OTRAVERSO y navegación conceptual de universos."""
from __future__ import annotations

from app.core.http import Request, Response
from app.core.render import esc, render, render_page
from app.db import query, settings_group

UNIVERSE_COPY = {
    "portal": ("Universo central", "El acceso a una plataforma diseñada para crecer por módulos.", "#6d5cff"),
    "shop": ("Descubrimiento comercial", "Descubre cosas que no sabías que necesitabas. Productos reales, inventario y pedidos especiales.", "#8b5cf6"),
    "whatif": ("Imaginación y posibilidades", "¿Y si todo pudiera ser diferente? Portales y realidades alternativas en diseño.", "#8b7cff"),
    "play": ("Entretenimiento", "El siguiente nivel comienza aquí: NEXUS RUSH, tres circuitos de carrera 3D.", "#f472b6"),
    "labs": ("Innovación", "Experimenta. Crea. Evoluciona. Prototipos y herramientas en desarrollo.", "#2dd4bf"),
}

UNIVERSE_META = {
    "shop": {
        "order": "01",
        "short": "SHOP",
        "tagline": "Descubre cosas que no sabías que necesitabas",
        "cta": "EXPLORAR SHOP",
        "status": "DISPONIBLE",
        "index_status": "Activo",
        "color": "#8b5cf6",
        "accent": "#54e8ff",
        "x": "76%",
        "y": "42%",
        "detail": "Productos reales en inventario y bajo pedido, con entregas en Nariño y compras confirmadas por WhatsApp.",
    },
    "whatif": {
        "order": "02",
        "short": "WHAT IF",
        "tagline": "¿Y si todo pudiera ser diferente?",
        "cta": "VER PRESENTACIÓN",
        "status": "PRÓXIMAMENTE",
        "index_status": "Planeado",
        "color": "#8b7cff",
        "accent": "#c4b5fd",
        "x": "36%",
        "y": "27%",
        "detail": "Un universo de portales, posibilidades y realidades alternativas actualmente en diseño.",
    },
    "play": {
        "order": "03",
        "short": "PLAY",
        "tagline": "El siguiente nivel comienza aquí",
        "cta": "ENTRAR A PLAY",
        "status": "DISPONIBLE",
        "index_status": "Disponible",
        "color": "#f472b6",
        "accent": "#67e8f9",
        "x": "78%",
        "y": "68%",
        "detail": "OTRAVERSO PLAY: NEXUS RUSH. Tres circuitos, nave antigravedad, turbo, obstáculos y récord personal.",
    },
    "labs": {
        "order": "04",
        "short": "LABS",
        "tagline": "Experimenta. Crea. Evoluciona",
        "cta": "VER PRESENTACIÓN",
        "status": "PRÓXIMAMENTE",
        "index_status": "Planeado",
        "color": "#2dd4bf",
        "accent": "#60a5fa",
        "x": "34%",
        "y": "65%",
        "detail": "Una dimensión de prototipos, circuitos y herramientas tecnológicas en desarrollo.",
    },
}


def register(router) -> None:
    router.get("/", home, name="portal.home")
    router.get("/universos/{code}", universe, name="portal.universe")


def _portal_common(module, meta: dict) -> tuple:
    code = module["code"]
    name = esc(module["name"])
    tagline = esc(meta["tagline"])
    order = esc(meta["order"])
    color = esc(meta["color"])
    accent = esc(meta["accent"])
    available = bool(module["enabled"]) or code == "play"
    href = "/shop" if code == "shop" else ("/play" if code == "play" else f"/universos/{code}")
    status = "DISPONIBLE" if available else "Planeado"
    return code, name, tagline, order, color, available, href, status, accent, meta["detail"]


def _portal_node(module, meta: dict) -> str:
    code, name, tagline, order, color, available, href, status, accent, detail = _portal_common(module, meta)
    return f"""
    <button class="universe-index__item" type="button" data-portal="{esc(code)}"
      data-name="{name}" data-order="{order}" data-tagline="{tagline}" data-status="{status}"
      data-description="{esc(detail)}" data-href="{esc(href)}"
      data-available="{'1' if available else '0'}" data-color="{color}" data-accent="{accent}"
      style="--dot:{color}" aria-label="Abrir {name}: {tagline}">
      <span class="universe-index__dot"></span><span>{esc(meta['short'])}</span><small>{status}</small>
    </button>"""


def _portal_gate(module, meta: dict) -> str:
    code, name, tagline, order, color, available, href, status, accent, detail = _portal_common(module, meta)
    return f"""
    <button class="universe-gate" type="button" data-portal="{esc(code)}" data-gate
      data-name="{name}" data-order="{order}" data-tagline="{tagline}" data-status="{status}"
      data-description="{esc(detail)}" data-href="{esc(href)}"
      data-available="{'1' if available else '0'}" data-color="{color}" data-accent="{accent}"
      style="--gate-x:{meta['x']};--gate-y:{meta['y']};--gate-color:{color};--gate-accent:{accent}"
      aria-label="Portal {name}: {tagline}. {status}">
      <span class="universe-gate__aura"></span>
      <span class="universe-gate__ring universe-gate__ring--outer"></span>
      <span class="universe-gate__ring universe-gate__ring--inner"></span>
      <span class="universe-gate__membrane"></span>
      <span class="universe-gate__label"><b>{esc(meta['short'])}</b><small>{status}</small></span>
    </button>"""


def _world_dialog(module, meta: dict) -> str:
    code = module["code"]
    name = esc(module["name"])
    return f"""
    <div class="universe-dialog" data-dialog-panel="{esc(code)}" hidden role="dialog" aria-modal="true"
         aria-labelledby="detail-title-{esc(code)}">
      <div class="universe-dialog__backdrop" data-close></div>
      <div class="universe-dialog__card" style="--detail-color:{esc(meta['color'])}">
        <button class="universe-dialog__close" type="button" data-close aria-label="Cerrar presentación">×</button>
        <span class="universe-dialog__eyebrow">UNIVERSO {esc(meta['order'])} · PRÓXIMAMENTE</span>
        <h2 id="detail-title-{esc(code)}">{name}</h2>
        <p class="universe-dialog__tagline">{esc(meta['tagline'])}</p>
        <p class="universe-dialog__body">{esc(meta['detail'])}</p>
        <p class="universe-dialog__note">Estado: Planeado. Sin funcionalidades activas ni módulos accesibles.</p>
        <a class="universe-dialog__link" href="/universos/{esc(code)}">Ver dossier del universo <i aria-hidden="true">→</i></a>
      </div>
    </div>"""


def home(request: Request) -> Response:
    visual = settings_group("visual")
    modules = [row for row in query("SELECT * FROM modules ORDER BY sort_order") if row["code"] != "portal"]
    nodes = []
    gates = []
    dialogs = []
    for module in modules:
        meta = UNIVERSE_META.get(module["code"])
        if not meta:
            continue
        nodes.append(_portal_node(module, meta))
        gates.append(_portal_gate(module, meta))
        if not (module["enabled"] or module["code"] == "play"):
            dialogs.append(_world_dialog(module, meta))

    content = render("portal/home.html",
        HERO_TITLE=esc(visual.get("hero_title", "Hay más de un mundo por descubrir")),
        HERO_SUBTITLE=esc(visual.get("hero_subtitle", "")),
        PORTAL_NODES="".join(nodes),
        PORTAL_GATES="".join(gates),
        PORTAL_DIALOGS="".join(dialogs),
    )
    return Response(render_page(
        "OTRAVERSO — No existe un solo universo",
        content,
        body_class="mode-portal",
        active="portal",
        request=request,
        head_extra='<link rel="stylesheet" href="/static/css/galaxy.css">',
        scripts=('<script src="/static/js/universe-core.js" defer></script>'
                 '<script src="/static/js/galaxy.js" defer></script>'),
    ))


def universe(request: Request, code: str) -> Response:
    module = query("SELECT * FROM modules WHERE code=?", (code,))
    if not module:
        from app.core.http import HTTPError
        raise HTTPError(404, "Universo no encontrado")
    row = module[0]
    if row["enabled"] and code == "shop":
        from app.core.http import redirect
        return redirect("/shop")
    label, description, _ = UNIVERSE_COPY.get(code, (row["name"], row["description"], ""))
    state = "activo" if row["enabled"] else "planeado y todavía no disponible"
    content = render("portal/universe.html",
        NAME=esc(row["name"]), LABEL=esc(label), DESCRIPTION=esc(description), STATE=esc(state))
    return Response(render_page(row["name"], content, body_class="mode-portal", active="portal", request=request))
