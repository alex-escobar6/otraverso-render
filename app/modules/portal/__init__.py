"""Portada principal de OTRAVERSO y navegación conceptual del multiverso."""
from __future__ import annotations

import json

from app.core.http import Request, Response
from app.core.pages import visibility_for_path
from app.core.render import esc, render, render_page
from app.db import query, settings_group
from app.services.multiverse import (
    UNIVERSE_COPY,
    UNIVERSE_META,
    public_cards,
    scene_config,
)

UNIVERSE_COPY["portal"] = (
    "Universo central",
    "El acceso a una plataforma diseñada para crecer por módulos.",
    "#54e8ff",
)


def register(router) -> None:
    router.get("/", home, name="portal.home")
    router.get("/universos/{code}", universe, name="portal.universe")


def _route_visible(route: str | None) -> bool:
    if not route:
        return True
    state = visibility_for_path(route)
    return state is None or state["visible"]


def _visible_planets(meta: dict) -> list[dict]:
    return [dict(planet) for planet in meta.get("planets", [])
            if not planet.get("route") or _route_visible(planet["route"])]


def _world_node(module, meta: dict) -> str:
    code = module["code"]
    name = esc(module["name"])
    tagline = esc(meta["tagline"])
    order = esc(meta["order"])
    color = esc(meta["color"])
    accent = esc(meta["accent"])
    route = esc(meta.get("route") or f"/universos/{code}")
    return f"""
    <button class="world-node world-node--{esc(code)}" type="button" data-world="{esc(code)}"
      data-universe-focus="{esc(code)}" data-universe-route="{route}"
      style="--node-color:{color};--node-accent:{accent};--fallback-x:{meta['x']};--fallback-y:{meta['y']}"
      aria-label="Explorar universo {name}: {tagline}">
      <span class="world-node__field" aria-hidden="true"></span>
      <span class="world-node__orbit" aria-hidden="true"></span>
      <span class="world-node__core" aria-hidden="true"></span>
      <span class="world-node__info">
        <span class="world-node__state">UNIVERSO {order} · <em>{esc(meta['status'])}</em></span>
        <strong>{name}</strong>
        <span class="world-node__tagline">{tagline}</span>
        <span class="world-node__cta">{esc(meta['cta'])} <i aria-hidden="true">→</i></span>
      </span>
    </button>"""


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
    enabled = bool(module["enabled"]) and _route_visible(meta.get("route"))
    if enabled:
        href = meta.get("route") or ("/shop" if code == "shop" else f"/{code}")
        action = f'href="{esc(href)}" data-warp data-world="{esc(code)}" data-index="{esc(code)}"'
        tag = "a"
    else:
        action = f'type="button" data-dialog="{esc(code)}" data-index="{esc(code)}"'
        tag = "button"
    return f'<{tag} class="galaxy-index__item" {action} style="--dot:{esc(meta["color"])}">' \
           f'<span class="galaxy-index__dot"></span><span>{short}</span><small>{esc(meta["index_status"])}</small></{tag}>'


def _planet_link(planet: dict, enabled: bool) -> str:
    code = esc(planet["code"])
    name = esc(planet["name"])
    note = esc(planet["note"])
    status = esc(planet["status"])
    kind = esc(planet["type"])
    if enabled and planet.get("route") and _route_visible(planet["route"]):
        return (
            f'<a class="universe-planet" href="{esc(planet["route"])}" data-warp '
            f'data-world-planet="{code}" data-world-route="{esc(planet["route"])}" title="{note}">'
            f'<span class="universe-planet__dot" aria-hidden="true"></span>'
            f'<span class="universe-planet__body"><strong>{name}</strong>'
            f'<small>{kind} · {status}</small><span>{note}</span></span>'
            f'<i aria-hidden="true">↗</i></a>'
        )
    return (
        f'<span class="universe-planet is-pending" data-world-planet="{code}" title="{note}">'
        f'<span class="universe-planet__dot" aria-hidden="true"></span>'
        f'<span class="universe-planet__body"><strong>{name}</strong>'
        f'<small>{kind} · {status}</small><span>{note}</span></span></span>'
    )


def _focus_panel(module, meta: dict) -> str:
    code = module["code"]
    planets = "".join(_planet_link(planet, bool(module["enabled"])) for planet in _visible_planets(meta))
    dossier = f"/universos/{code}"
    return f"""
    <div class="galaxy-focus" data-universe-panel="{esc(code)}" hidden role="region"
         aria-label="Interior del universo {esc(meta['name'])}">
      <div class="galaxy-focus__head">
        <span class="galaxy-focus__eyebrow">UNIVERSO {esc(meta['order'])} · {esc(meta['status'])}</span>
        <h2>{esc(meta['name'])}</h2>
        <p>{esc(meta['ambient'])}</p>
      </div>
      <div class="galaxy-focus__planets">
        <span class="galaxy-focus__label">MUNDOS Y EXPERIENCIAS</span>
        {planets}
      </div>
      <button class="galaxy-focus__explore" type="button" data-explore-universe="{esc(code)}">EXPLORAR UNIVERSO <i aria-hidden="true">✦</i></button>
      <div class="galaxy-focus__foot">
        <a class="galaxy-focus__dossier" href="{dossier}">DOSSIER <i aria-hidden="true">↗</i></a>
        <button class="galaxy-focus__back" type="button" data-universe-back>VOLVER AL MULTIVERSO <i aria-hidden="true">←</i></button>
      </div>
    </div>"""


def _guide_card(module, meta: dict) -> str:
    code = module["code"]
    enabled = bool(module["enabled"]) and _route_visible(meta.get("route"))
    route = meta.get("route") or f"/universos/{code}"
    action = "data-warp" if enabled else f'data-dialog="{esc(code)}"'
    return f"""
    <article class="guide-card {'is-live' if enabled else 'is-planned'}" style="--guide-color:{esc(meta['color'])};--guide-accent:{esc(meta['accent'])}">
      <span class="guide-card__index">UNIVERSO {esc(meta['order'])}</span>
      <span class="guide-card__orb" aria-hidden="true"><i></i></span>
      <h3>{esc(meta['name'])}</h3>
      <p>{esc(meta['ambient'])}</p>
      <div class="guide-card__worlds">
        <span>{len(meta['planets'])} MUNDOS</span><span>{esc(meta['status'])}</span>
      </div>
      <a class="guide-card__link" {action} href="{route}">{'ENTRAR' if enabled else 'DESCUBRIR'} <i aria-hidden="true">↗</i></a>
    </article>"""


def _featured_link(code: str, meta: dict, planet: dict) -> str:
    return (
        f'<a class="featured-link" href="{esc(planet["route"])}" data-warp style="--dot:{esc(meta["color"])}">'
        f'<span class="featured-link__dot" aria-hidden="true"></span>'
        f'<span><small>{esc(meta["short"])}</small><strong>{esc(planet["name"])}</strong></span>'
        f'<i aria-hidden="true">↗</i></a>'
    )


def home(request: Request) -> Response:
    visual = settings_group("visual")
    modules = [row for row in query("SELECT * FROM modules ORDER BY sort_order") if row["code"] != "portal"]
    nodes = []
    dialogs = []
    index = []
    panels = []
    guides = []
    for module in modules:
        code = module["code"]
        source_meta = UNIVERSE_META.get(code)
        if not source_meta:
            continue
        meta = dict(source_meta)
        meta["planets"] = _visible_planets(source_meta)
        if meta.get("route") and not _route_visible(meta["route"]):
            meta["route"] = ""
        nodes.append(_world_node(module, meta))
        index.append(_index_item(module, meta))
        panels.append(_focus_panel(module, meta))
        guides.append(_guide_card(module, meta))
        if not module["enabled"] or (source_meta.get("route") and not _route_visible(source_meta["route"])):
            dialogs.append(_world_dialog(module, meta))

    cards = {card["code"]: card for card in public_cards()}
    featured = []
    for code, planet_code in (("shop", "central"), ("play", "gravity"),
                              ("play", "nexus-rush"), ("play", "star-hunter"),
                              ("whatif", "relatos"), ("whatif", "archivo")):
        meta = cards.get(code)
        if not meta:
            continue
        for planet in meta["planets"]:
            if planet["code"] == planet_code and planet.get("route") and _route_visible(planet["route"]):
                featured.append(_featured_link(code, meta, planet))
                break

    config = json.dumps(scene_config(), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    content = render("portal/home.html",
        HERO_TITLE=esc(visual.get("hero_title", "Hay más de un mundo por descubrir")),
        HERO_SUBTITLE=esc(visual.get("hero_subtitle", "")),
        WORLD_NODES="".join(nodes),
        WORLD_DIALOGS="".join(dialogs),
        WORLD_PANELS="".join(panels),
        GUIDE_CARDS="".join(guides),
        FEATURED_LINKS="".join(featured),
        MULTIVERSE_DATA=config,
        GALAXY_INDEX="".join(index),
    )
    return Response(render_page(
        "OTRAVERSO — No existe un solo universo",
        content,
        body_class="mode-portal",
        active="portal",
        request=request,
        head_extra='<link rel="stylesheet" href="/static/css/galaxy.css">',
        scripts='<script src="/static/js/galaxy.js" defer></script>',
    ))


def universe(request: Request, code: str) -> Response:
    module = query("SELECT * FROM modules WHERE code=?", (code,))
    if not module:
        from app.core.http import HTTPError
        raise HTTPError(404, "Universo no encontrado")
    row = module[0]
    if row["enabled"] and code in {"shop", "whatif"}:
        from app.core.http import redirect
        return redirect("/what-if" if code == "whatif" else "/shop")
    label, description, _ = UNIVERSE_COPY.get(code, (row["name"], row["description"], ""))
    state = "activo" if row["enabled"] else "planeado y todavía no disponible"
    meta = UNIVERSE_META.get(code, {})
    planets = "".join(_planet_link(planet, bool(row["enabled"])) for planet in _visible_planets(meta))
    content = render("portal/universe.html",
        NAME=esc(row["name"]), LABEL=esc(label), DESCRIPTION=esc(description), STATE=esc(state),
        PLANETS=planets or "<p class=\"hint\">Este universo todavía no tiene mundos declarados.</p>")
    return Response(render_page(row["name"], content, body_class="mode-portal", active="portal", request=request))
