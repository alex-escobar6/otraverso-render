"""Universo PLAY: acceso real a NEXUS RUSH sin modificar el estado de módulos de la BD."""
from __future__ import annotations

from app.core.http import Request, Response
from app.core.render import esc, render, render_page


def register(router) -> None:
    router.get("/play", play, name="play.home")
    router.get("/play/nexus-rush", game, name="play.nexus_rush")


def _page(request: Request, scene: str, circuit: int = 0, title: str = "OTRAVERSO PLAY — NEXUS RUSH") -> Response:
    content = render("play/index.html", SCENE=esc(scene), CIRCUIT=esc(circuit))
    return Response(render_page(
        title,
        content,
        body_class="mode-play",
        active="play",
        request=request,
        head_extra='<link rel="stylesheet" href="/static/css/galaxy.css">',
        scripts=('<script src="/static/js/universe-core.js" defer></script>'
                 '<script src="/static/js/galaxy.js" defer></script>'),
    ))


def play(request: Request) -> Response:
    return _page(request, "play")


def game(request: Request) -> Response:
    return _page(request, "game", 0, "NEXUS RUSH — OTRAVERSO PLAY")
