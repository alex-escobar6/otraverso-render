from __future__ import annotations

import json

from app.core.auth import public_csrf_token, verify_public_csrf
from app.core.http import HTTPError, Request, Response, json_response
from app.core.pages import (
    element_state, is_admin_preview, is_available, notice_message, play_game_code,
)
from app.core.render import esc, render, render_page
from app.services.play import progress as play_progress
from app.services.play.catalog import get_game, get_manifest, list_games


def register(router) -> None:
    router.get("/play", play, name="play.home")
    router.get("/play/hub", play, name="play.hub")
    router.get("/play/profile", profile, name="play.profile")
    router.get("/play/nexus-rush", game, name="play.nexus_rush")
    router.get("/play/gravity", gravity, name="play.gravity")
    router.get("/play/games/{code}", game_by_code, name="play.game")
    router.get("/api/play/v1/games", games_api, name="play.api.games")
    router.get("/api/play/v1/games/{code}/manifest", manifest_api, name="play.api.manifest")
    router.get("/api/play/v1/progress", progress_api, name="play.api.progress")
    router.post("/api/play/v1/progress/results", result_api, name="play.api.results")
    router.post("/api/play/v1/progress/collectibles", collectible_api, name="play.api.collectibles")


def _availability_notice(code: str) -> str:
    state = element_state(code)
    if state["status"] in {"available", "hidden"} or not state["row"]:
        return ""
    source = state["blocker"] or state["row"]
    label = "PRÓXIMAMENTE" if state["status"] == "coming_soon" else "SOLO PRESENTACIÓN"
    title = source.get("notice_title") or source.get("name") or "Contenido no disponible"
    description = source.get("notice_description") or source.get("coming_soon_message") or ""
    return (
        '<div class="play-availability-notice"><strong>'
        + esc(label) + " · " + esc(title) + '</strong><span>'
        + esc(description) + '</span></div>'
    )


def _game_index(request: Request | None = None) -> str:
    catalog = element_state("play_catalog")
    preview = is_admin_preview(request) if request is not None else False
    if not preview:
        if catalog["status"] == "hidden":
            return ""
        if catalog["status"] != "available":
            return _availability_notice("play_catalog")
    parts = ['<span class="universe-game-index__label">JUEGOS</span>']
    for item in list_games():
        code = play_game_code(item["code"])
        state = element_state(code)
        if not preview and state["status"] == "hidden":
            continue
        available = preview and item["status"] == "published" or state["status"] == "available"
        name = esc(item["name"])
        if available:
            parts.append(
                f'<button class="universe-game-index__item" type="button" data-play-game="{esc(item["code"])}" '
                f'data-href="{esc(item["route"])}"><span class="universe-game-index__dot"></span>'
                f'<span>{name}</span><small>DISPONIBLE</small></button>'
            )
            continue
        label = "PRÓXIMAMENTE" if state["status"] == "coming_soon" else "SOLO PRESENTACIÓN"
        parts.append(
            '<span class="universe-game-index__item is-planned">'
            '<span class="universe-game-index__dot"></span><span>' + name + '</span><small>'
            + esc(label) + '</small></span>'
        )
    return "".join(parts)


def _game_ui(code: str) -> str:
    if code == "gravity":
        return render("play/game-gravity.html")
    if code == "nexus-rush":
        return render("play/game-nexus.html")
    return render("play/game-shell.html", GAME_CODE=esc(code))


def _page(request: Request, scene: str, code: str = "nexus-rush", circuit: int = 0,
          title: str = "OTRAVERSO PLAY — NEXUS RUSH", panel: str = "") -> Response:
    preview = is_admin_preview(request)
    registry = []
    for item in list_games("published"):
        if preview or is_available(play_game_code(item["code"])):
            registry.append(get_manifest(item["code"]))
    game_ui = _game_ui(code) if scene == "game" else ""
    hub_ui = ""
    profile_ui = ""
    if scene == "play":
        hub_state = element_state("play_hub")
        if preview or hub_state["status"] == "available":
            hub_ui = render("play/hub.html")
        elif hub_state["status"] != "hidden":
            hub_ui = _availability_notice("play_hub")
        profile_state = element_state("play_profile")
        if preview or profile_state["status"] == "available":
            csrf = public_csrf_token()
            profile_ui = render("play/profile.html", PLAY_CSRF=esc(csrf))
        elif profile_state["status"] != "hidden":
            profile_ui = _availability_notice("play_profile")
    csrf = public_csrf_token()
    content = render(
        "play/index.html",
        SCENE=esc(scene),
        CIRCUIT=esc(circuit),
        GAME_CODE=esc(code),
        GAME_REGISTRY=esc(json.dumps(registry, ensure_ascii=False, separators=(",", ":"))),
        GAME_INDEX=_game_index(request),
        HUB_UI=hub_ui,
        PROFILE_UI=profile_ui,
        GAME_UI=game_ui,
        PLAY_CSRF=esc(csrf),
        PANEL=esc(panel),
    )
    return Response(render_page(
        title,
        content,
        body_class="mode-play",
        active="play",
        request=request,
        head_extra=(
            '<link rel="stylesheet" href="/static/css/play.css">'
            '<link rel="stylesheet" href="/static/css/play-progress.css">'
            '<link rel="stylesheet" href="/static/css/play-game-kit.css">'
            '<link rel="stylesheet" href="/static/play/hub/1.0.0/hub.css">'
        ),
        scripts=('<script src="/static/js/webgl-runtime.js" defer></script>'
                 '<script src="/static/js/universe-core.js" defer></script>'
                 '<script src="/static/js/play-game-kit.js" defer></script>'
                 '<script src="/static/js/play-progress.js" defer></script>'
                 '<script src="/static/js/play-collectibles.js" defer></script>'
                 '<script src="/static/play/hub/1.0.0/hub.js" defer></script>'
                 '<script src="/static/js/play.js" defer></script>'),
    ))


def play(request: Request) -> Response:
    return _page(request, "play")


def profile(request: Request) -> Response:
    return _page(request, "play", panel="profile", title="PERFIL PLAY — OTRAVERSO PLAY")


def game(request: Request) -> Response:
    return _page(request, "game", "nexus-rush", 0, "NEXUS RUSH — OTRAVERSO PLAY")


def gravity(request: Request) -> Response:
    return game_by_code(request, "gravity")


def game_by_code(request: Request, code: str) -> Response:
    item = get_game(code)
    if not item or item["status"] != "published":
        raise HTTPError(404, "Juego no disponible")
    return _page(request, "game", code, 0, f'{item["name"]} — OTRAVERSO PLAY')


def _check_game(request: Request, code: str) -> None:
    if is_admin_preview(request) or not code:
        return
    state = element_state(play_game_code(code))
    if state["status"] == "hidden":
        raise HTTPError(404, "Juego no disponible", "page_hidden")
    if state["status"] != "available":
        raise HTTPError(403, notice_message({"name": code}, state), "game_unavailable")


def games_api(request: Request) -> Response:
    games = []
    for item in list_games():
        state = element_state(play_game_code(item["code"]))
        if not is_admin_preview(request) and state["status"] == "hidden":
            continue
        row = dict(item)
        row["availability"] = state["status"]
        games.append(row)
    return json_response({"games": games})


def manifest_api(request: Request, code: str) -> Response:
    manifest = get_manifest(code)
    if not manifest:
        raise HTTPError(404, "Juego no encontrado")
    _check_game(request, code)
    return json_response({"manifest": manifest})


def _require_csrf(request: Request) -> None:
    if not verify_public_csrf(request.param("csrf")):
        raise HTTPError(400, "Token de seguridad inválido o expirado")


def progress_api(request: Request) -> Response:
    player_id = request.param("player_id")
    if not play_progress.normalize_player_id(player_id):
        raise HTTPError(400, "PLAY ID inválido")
    payload = play_progress.ensure_profile(player_id)
    if not payload:
        raise HTTPError(400, "PLAY ID inválido")
    return json_response(payload)


def result_api(request: Request) -> Response:
    _require_csrf(request)
    _check_game(request, request.param("game", ""))
    stats = {}
    raw_stats = request.param("stats", "")
    if raw_stats:
        try:
            parsed = json.loads(raw_stats)
            stats = parsed if isinstance(parsed, dict) else {}
        except (TypeError, ValueError):
            stats = {}
    success = request.param("success", "").lower() in {"1", "true", "yes", "on"}
    payload = play_progress.submit_result(
        request.param("player_id"),
        request.param("game"),
        request.param("score", "0"),
        request.param("duration_ms", "0"),
        success,
        stats,
    )
    if not payload:
        raise HTTPError(400, "Resultado inválido")
    return json_response(payload)


def collectible_api(request: Request) -> Response:
    _require_csrf(request)
    payload = play_progress.unlock_collectible(
        request.param("player_id"),
        request.param("code"),
        request.param("note", ""),
    )
    if not payload:
        raise HTTPError(400, "Descubrimiento inválido")
    return json_response(payload)
