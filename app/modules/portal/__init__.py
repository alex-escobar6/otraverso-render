"""Portada principal de OTRAVERSO y navegación conceptual de universos."""
from __future__ import annotations

from app.core.http import Request, Response
from app.core.render import esc, render, render_page
from app.db import query, settings_group

UNIVERSE_COPY = {
    "portal": ("Universo central", "El acceso a una plataforma diseñada para crecer por módulos.", "#6d5cff"),
    "shop": ("Descubrimiento comercial", "Descubre cosas que no sabías que necesitabas. Productos reales, inventario y pedidos especiales.", "#8b5cf6"),
    "whatif": ("Imaginación y posibilidades", "¿Y si todo pudiera ser diferente? Portales y realidades alternativas en diseño.", "#8b7cff"),
    "play": ("Entretenimiento", "El siguiente nivel comienza aquí. Un mundo lúdico en conceptualización.", "#f472b6"),
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
        "cta": "VER PRESENTACIÓN",
        "status": "PRÓXIMAMENTE",
        "index_status": "Planeado",
        "color": "#f472b6",
        "accent": "#67e8f9",
        "x": "78%",
        "y": "68%",
        "detail": "Un mundo de entretenimiento y experiencias lúdicas propias en etapa de conceptualización.",
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


def _world_node(module, meta: dict) -> str:
    code = module["code"]
    name = esc(module["name"])
    tagline = esc(meta["tagline"])
    order = esc(meta["order"])
    color = esc(meta["color"])
    accent = esc(meta["accent"])
    enabled = bool(module["enabled"])
    href = "/shop" if code == "shop" else f"/{code}"
    action = "data-warp" if enabled else f'data-dialog="{esc(code)}"'
    tag = "a" if enabled else "button"
    extra = f'href="{href}"' if enabled else 'type="button" aria-haspopup="dialog"'
    target = f' title="Abrir {name}"' if enabled else ""
    return f"""
    <{tag} class="world-node world-node--{esc(code)}" data-world="{esc(code)}" data-order="{order}"
      data-tagline="{tagline}" data-description="{esc(meta['detail'])}" data-status="{esc(meta['status'])}"
      {action} {extra}
      style="--node-color:{color};--node-accent:{accent};--fallback-x:{meta['x']};--fallback-y:{meta['y']}"
      aria-label="{name}: {tagline}"{target}>
      <span class="world-node__orbit" aria-hidden="true"></span>
      <span class="world-node__core" aria-hidden="true"></span>
      <span class="world-node__marker" aria-hidden="true"></span>
      <span class="world-node__info">
        <span class="world-node__state">UNIVERSO {order} · <em>{esc(meta['status'])}</em></span>
        <strong>{name}</strong>
        <span class="world-node__tagline">{tagline}</span>
        <span class="world-node__cta">{esc(meta['cta'])} <i aria-hidden="true">→</i></span>
      </span>
    </{tag}>"""


def _world_dialog(module, meta: dict) -> str:
    code = module["code"]
    name = esc(module["name"])
    return f"""
    <div class="world-detail" data-dialog="{esc(code)}" hidden role="dialog" aria-modal="true"
         aria-labelledby="detail-title-{esc(code)}">
      <div class="world-detail__backdrop" data-close></div>
      <div class="world-detail__card" style="--detail-color:{esc(meta['color'])};--detail-accent:{esc(meta['accent'])}">
        <button class="world-detail__close" type="button" data-close aria-label="Cerrar presentación">×</button>
        <span class="world-detail__eyebrow">UNIVERSO {esc(meta['order'])} · PRÓXIMAMENTE</span>
        <h2 id="detail-title-{esc(code)}">{name}</h2>
        <p class="world-detail__tagline">{esc(meta['tagline'])}</p>
        <p class="world-detail__body">{esc(meta['detail'])}</p>
        <p class="world-detail__note">Estado: Planeado. Sin funcionalidades activas ni módulos accesibles.</p>
        <a class="world-detail__link" href="/universos/{esc(code)}">Ver dossier del universo <i aria-hidden="true">→</i></a>
      </div>
    </div>"""


def _index_item(module, meta: dict) -> str:
    code = module["code"]
    short = esc(meta["short"])
    enabled = bool(module["enabled"])
    action = f'href="/shop" data-warp data-index="{esc(code)}"' if enabled and code == "shop" else (
        f'href="/{code}" data-index="{esc(code)}"' if enabled else
        f'type="button" data-dialog="{esc(code)}" data-index="{esc(code)}"'
    )
    tag = "a" if enabled else "button"
    return f'<{tag} class="galaxy-index__item" {action} style="--dot:{esc(meta["color"])}">' \
           f'<span class="galaxy-index__dot"></span><span>{short}</span><small>{esc(meta["index_status"])}</small></{tag}>'


def home(request: Request) -> Response:
    visual = settings_group("visual")
    modules = [row for row in query("SELECT * FROM modules ORDER BY sort_order") if row["code"] != "portal"]
    nodes = []
    dialogs = []
    index = []
    for module in modules:
        meta = UNIVERSE_META.get(module["code"])
        if not meta:
            continue
        nodes.append(_world_node(module, meta))
        index.append(_index_item(module, meta))
        if not module["enabled"]:
            dialogs.append(_world_dialog(module, meta))

    content = render("portal/home.html",
        HERO_TITLE=esc(visual.get("hero_title", "Hay más de un mundo por descubrir")),
        HERO_SUBTITLE=esc(visual.get("hero_subtitle", "")),
        WORLD_NODES="".join(nodes),
        WORLD_DIALOGS="".join(dialogs),
        GALAXY_INDEX="".join(index),
    )
    return Response(render_page(
        "OTRAVERSO — No existe un solo universo",
        content,
        body_class="mode-portal",
        active="portal",
        request=request,
        head_extra='<link rel="stylesheet" href="/static/css/galaxy.css">',
        scripts=('<script src="/static/js/vendor/three.min.js" defer></script>'
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
