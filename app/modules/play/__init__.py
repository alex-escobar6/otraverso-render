from __future__ import annotations

import json

from app.core.auth import public_csrf_token, verify_public_csrf
from app.core.http import HTTPError, Request, Response, json_response
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


def _game_index() -> str:
    parts = ['<span class="universe-game-index__label">JUEGOS</span>']
    for item in list_games():
        code = esc(item["code"])
        name = esc(item["name"])
        status = "DISPONIBLE" if item["status"] == "published" else "PLANEADO"
        if item["status"] == "published":
            parts.append(
                f'<button class="universe-game-index__item" type="button" data-play-game="{code}" '
                f'data-href="{esc(item["route"])}"><span class="universe-game-index__dot"></span>'
                f'<span>{name}</span><small>{status}</small></button>'
            )
        else:
            parts.append(
                f'<span class="universe-game-index__item is-planned">'
                f'<span class="universe-game-index__dot"></span><span>{name}</span><small>{status}</small></span>'
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
    registry = [get_manifest(item["code"]) for item in list_games("published")]
    game_ui = _game_ui(code) if scene == "game" else ""
    hub_ui = render("play/hub.html") if scene == "play" else ""
    csrf = public_csrf_token()
    profile_ui = render("play/profile.html", PLAY_CSRF=esc(csrf)) if scene == "play" else ""
    content = render(
        "play/index.html",
        SCENE=esc(scene),
        CIRCUIT=esc(circuit),
        GAME_CODE=esc(code),
        GAME_REGISTRY=esc(json.dumps(registry, ensure_ascii=False, separators=(",", ":"))),
        GAME_INDEX=_game_index(),
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


def games_api(request: Request) -> Response:
    return json_response({"games": list_games()})


def manifest_api(request: Request, code: str) -> Response:
    manifest = get_manifest(code)
    if not manifest:
        raise HTTPError(404, "Juego no encontrado")
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
