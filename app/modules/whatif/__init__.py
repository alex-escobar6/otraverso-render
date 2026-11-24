from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Callable

from app.config import Config, DATA_DIR
from app.core.auth import public_csrf_expires_at, public_csrf_token
from app.core.http import HTTPError, Request, Response, json_response
from app.core.render import esc, render, render_page
from app.db import get_setting, module_row
from app.services.whatif import engine, options, provider

PREFIX = "/what-if"
API = "/api/what-if/v1"
ASSETS = (
    '<link rel="stylesheet" href="/static/whatif/1.0.2/whatif.css?v=20261125f">',
    '        <script src="/static/whatif/1.0.2/whatif.js?v=20261125f" defer></script>',
)


def register(router) -> None:
    router.get(PREFIX, home, name="whatif.home")
    router.get(PREFIX + "/crear", create, name="whatif.create")
    router.get(PREFIX + "/explorar", explore, name="whatif.explore")
    router.get(PREFIX + "/ideas", ideas, name="whatif.ideas")
    router.get(PREFIX + "/biblioteca", library, name="whatif.library")
    router.get(PREFIX + "/espacio/{rid}", space, name="whatif.space")
    router.get(PREFIX + "/studio/{rid}", studio, name="whatif.studio")

    router.get(API + "/guest", guest_api, name="whatif.api.guest")
    router.get(API + "/config", config_api, name="whatif.api.config")
    router.post(API + "/proposals", proposal_api, name="whatif.api.proposals")
    router.post(API + "/ideas", ideas_api, name="whatif.api.ideas")
    router.get(API + "/jobs/{jid}", job_api, name="whatif.api.job")
    router.post(API + "/realities", realities_api, name="whatif.api.realities")
    router.get(API + "/realities", list_api, name="whatif.api.list")
    router.get(API + "/realities/{rid}", state_api, name="whatif.api.state")
    router.post(API + "/realities/{rid}/modes", modes_api, name="whatif.api.modes")
    router.post(API + "/realities/{rid}/chapter", chapter_api, name="whatif.api.chapter")
    router.post(API + "/realities/{rid}/chapter/{cid}/edit", edit_api, name="whatif.api.edit")
    router.post(API + "/realities/{rid}/chapter/{cid}/regenerate", regenerate_api, name="whatif.api.regenerate")
    router.get(API + "/realities/{rid}/chapter/{cid}/versions", versions_api, name="whatif.api.versions")
    router.post(API + "/realities/{rid}/versions/{vid}/restore", restore_api, name="whatif.api.restore")
    router.post(API + "/realities/{rid}/interventions", intervention_api, name="whatif.api.interventions")
    router.post(API + "/realities/{rid}/interventions/{iid}/apply", apply_api, name="whatif.api.apply")
    router.post(API + "/realities/{rid}/interventions/{iid}/reject", reject_api, name="whatif.api.reject")
    router.post(API + "/realities/{rid}/timelines", timeline_api, name="whatif.api.timelines")
    router.get(API + "/realities/{rid}/timelines/{tid}/compare", compare_api, name="whatif.api.compare")
    router.post(API + "/realities/{rid}/assets", asset_api, name="whatif.api.assets")
    router.post(API + "/realities/{rid}/update", update_api, name="whatif.api.update")
    router.post(API + "/jobs/{jid}/cancel", cancel_api, name="whatif.api.cancel")
    router.get(API + "/assets/{aid}", asset_bytes_api, name="whatif.api.asset.bytes")


def log_api_event(request_id: str, stage: str, status: int, code: str,
                  reason: str, request: Request | None = None) -> None:
    if not Config.WHATIF_DEBUG:
        return
    entry = {
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "request_id": request_id,
        "stage": stage,
        "http": status,
        "code": code,
        "reason": str(reason)[:120],
        "path": getattr(request, "path", ""),
        "method": getattr(request, "method", ""),
    }
    try:
        with (DATA_DIR / "whatif-api.log").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        return


def _error_code(exc: Exception) -> str:
    code = getattr(exc, "code", "")
    if code:
        return code
    status = getattr(exc, "status", 500)
    return {
        400: "validation_error", 401: "identity_required", 403: "permission_denied",
        404: "not_found", 409: "conflict", 429: "rate_limited",
    }.get(status, "request_failed")


def _enabled() -> None:
    module = module_row("whatif")
    if not module or not module["enabled"]:
        raise HTTPError(404, "OTRAVERSO WHAT IF no está disponible en este momento.")


def _csrf(request: Request) -> str:
    return request.csrf_token if request.user else public_csrf_token()


def _visual_color(key: str, default: str) -> str:
    value = get_setting("whatif", key, default).strip().lower()
    return value if re.fullmatch(r"#[0-9a-f]{6}", value) else default


def _visual_elements() -> str:
    try:
        parsed = json.loads(get_setting("whatif", "visual_elements", "[]") or "[]")
    except (TypeError, ValueError):
        parsed = []
    if isinstance(parsed, dict):
        values = list(parsed.values())
    elif isinstance(parsed, (list, tuple)):
        values = list(parsed)
    else:
        values = [parsed]
    labels = [str(item) for item in values[:12] if isinstance(item, (str, int, float))]
    cleaned = re.sub(r"[^A-Za-z0-9À-ÿ _,-]", "", " ".join(labels)).strip()[:200]
    return cleaned or "none"


def _visual_css() -> str:
    return (
        "<style>:root{"
        f"--wi-primary:{_visual_color('visual_primary_color', '#8f7dff')};"
        f"--wi-secondary:{_visual_color('visual_secondary_color', '#35e7d2')};"
        f"--wi-accent:{_visual_color('visual_accent_color', '#ffd27a')};"
        f"--wi-background:{_visual_color('visual_background_color', '#f7f5ff')};"
        f"--wi-elements:{_visual_elements()};"
        "}body.mode-whatif{"
        "--whatif-primary:var(--wi-primary);--whatif-secondary:var(--wi-secondary);"
        "--whatif-accent:var(--wi-accent);--whatif-background:var(--wi-background);"
        "--whatif-elements:var(--wi-elements)}</style>"
    )


def _page(request: Request, template: str, title: str, **context: Any) -> Response:
    _enabled()
    body = render(template, CSRF=_csrf(request), **context)
    return Response(render_page(
        title, body, body_class="mode-whatif", active="whatif", request=request,
        head_extra=_visual_css() + ASSETS[0], scripts=ASSETS[1],
        seo_override={"title": title, "description": "Crea realidades alternativas, escribe historias con continuidad y cambia el destino de sus personajes."},
    ))


def _ideas() -> str:
    return "".join(
        f'<button type="button" class="wi-idea" data-idea="{esc(text)}">{esc(text)}</button>'
        for text in options.INSPIRATION
    )


def _choices(items: tuple[dict, ...], name: str, selected: str) -> str:
    output = [f'<option value="{esc(item["code"])}"{" selected" if item["code"] == selected else ""}>{esc(item["label"])}</option>' for item in items]
    return "".join(output)


def home(request: Request) -> Response:
    return _page(request, "whatif/home.html", "OTRAVERSO WHAT IF — Realidades que puedes imaginar", IDEAS=_ideas())


def create(request: Request) -> Response:
    return _page(
        request, "whatif/create.html", "Crear realidad — OTRAVERSO WHAT IF", IDEAS=_ideas(),
        GENRES=_choices(options.GENRES, "genre", "personalizado"),
        STYLES=_choices(options.STYLES, "style", "cinematografico"),
        DEPTHS=_choices(options.DEPTHS, "depth", "historia"),
        FORMATS=_choices(options.FORMATS, "format", "automatico"),
    )


def explore(request: Request) -> Response:
    return _page(request, "whatif/explore.html", "Explorar realidades — OTRAVERSO WHAT IF", IDEAS=_ideas())


def ideas(request: Request) -> Response:
    csrf = _csrf(request)
    config = provider.config_status()
    return _page(
        request, "whatif/ideas.html", "Generador de ideas — OTRAVERSO WHAT IF",
        IDEAS=_ideas(), CONFIG=esc(json.dumps(config, ensure_ascii=False)),
        CSRF_TOKEN=csrf, IDEAS_ENABLED="1" if config["ideas_enabled"] else "0",
    )


def library(request: Request) -> Response:
    return _page(request, "whatif/library.html", "Mi biblioteca — OTRAVERSO WHAT IF")


def space(request: Request, rid: str) -> Response:
    return _page(request, "whatif/space.html", "Sala narrativa — OTRAVERSO WHAT IF", REALITY_ID=esc(rid))


def studio(request: Request, rid: str) -> Response:
    return _page(request, "whatif/studio.html", "WHAT IF Studio — OTRAVERSO WHAT IF", REALITY_ID=esc(rid))


def _owner(request: Request) -> dict:
    _enabled()
    return engine.owner_from(request)


def _result(action: Callable[[], dict]) -> Response:
    try:
        return json_response({"ok": True, **action()})
    except (HTTPError, provider.ProviderError) as exc:
        return json_response(
            {"ok": False, "error": exc.message, "code": _error_code(exc)}, exc.status
        )


def guest_api(request: Request) -> Response:
    return _result(lambda: engine.make_guest_token())


def config_api(request: Request) -> Response:
    def payload() -> dict:
        csrf = _csrf(request)
        return {**options.options_payload(), "ai": provider.config_status(),
                "csrf": csrf, "csrf_expires_at": public_csrf_expires_at(csrf),
                "debug": Config.WHATIF_DEBUG}
    return _result(payload)


def proposal_api(request: Request) -> Response:
    request_id = request.request_id
    log_api_event(request_id, "recepcion", 200, "", "request_received", request)
    try:
        owner = _owner(request)
    except HTTPError as exc:
        log_api_event(request_id, "validacion_sesion", exc.status,
                      _error_code(exc), "owner_from", request)
        raise
    log_api_event(request_id, "validacion_sesion", 200, "", "owner_ok", request)
    log_api_event(request_id, "validacion_csrf", 200, "", "csrf_ok", request)

    idea = request.param("idea")
    if not idea:
        exc = HTTPError(400, "Escribe una idea de al menos 8 caracteres.", "validation_error")
        log_api_event(request_id, "validacion_estructura", 400,
                      _error_code(exc), "idea_vacio", request)
        raise exc
    log_api_event(request_id, "validacion_estructura", 200, "", "fields_present", request)
    log_api_event(request_id, "validacion_identificadores", 200, "", "no_ids_required", request)

    try:
        options_input = {
            "genre": request.param("genre"), "style": request.param("style"),
            "depth": request.param("depth"), "format": request.param("format"),
        }
        options_input.update(_narrative_params(request))
        result = engine.create_proposal(
            owner, idea, options_input, request.param("idempotency_key"),
        )
    except (HTTPError, provider.ProviderError) as exc:
        code = _error_code(exc)
        if not getattr(exc, "code", ""):
            exc.code = code
        log_api_event(request_id, "procesamiento_propuesta", exc.status,
                      code, type(exc).__name__, request)
        raise
    log_api_event(request_id, "respuesta_final", 200, "", "proposal_ready", request)
    return json_response({"ok": True, **result})


def ideas_api(request: Request) -> Response:
    owner = _owner(request)
    params = {
        "seed": request.param("seed") or request.param("idea"),
        "topic": request.param("topic"),
        "idea": request.param("idea"),
        "exclude": request.param("exclude"),
        "genre": request.param("genre_override") or request.param("genre"),
        "style": request.param("style"),
        "variation": request.param("variation"),
        "count": request.param("count"),
        "idempotency_key": request.param("idempotency_key"),
    }
    mode = request.param("mode").strip().lower()
    if mode:
        params["apocalypse"] = "1" if mode in {"apocalipsis", "apocalypse", "combinado", "combined"} else "0"
        params["crazy"] = "1" if mode in {"loco", "crazy", "combinado", "combined"} else "0"
    params.update(_narrative_params(request))
    return _result(lambda: engine.generate_ideas(owner, params))


def job_api(request: Request, jid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.job_status(owner, _int(jid)))


def realities_api(request: Request) -> Response:
    owner = _owner(request)
    proposal = {}
    for key in ("title", "premise", "description", "genre", "style", "depth", "format", "recommendation", "first_scene"):
        if request.param(key):
            proposal[key] = request.param(key)
    for key in ("rules", "characters", "locations"):
        raw = request.param(key)
        if raw:
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    proposal[key] = parsed
            except (ValueError, TypeError):
                pass
    proposal.update(_narrative_params(request))
    return _result(lambda: engine.create_reality(owner, proposal, request.param("idempotency_key")))


def list_api(request: Request) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.list_realities(owner))


def _rid(rid: str) -> int:
    try:
        return int(rid)
    except (TypeError, ValueError):
        raise HTTPError(400, "Identificador de realidad inválido.")


def _int(value: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _narrative_params(request: Request) -> dict:
    params = {}
    for key in engine.NARRATIVE_FIELDS:
        value = request.param(key)
        if value != "":
            params[key] = value
    return params


def state_api(request: Request, rid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.get_state(owner, _rid(rid), _int(request.param("chapter"))))


def chapter_api(request: Request, rid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.generate_chapter(
        owner, _rid(rid), _int(request.param("timeline")) or engine.get_state(owner, _rid(rid))["timeline_id"],
        direction=request.param("direction"), idempotency_key=request.param("idempotency_key"),
    ))


def edit_api(request: Request, rid: str, cid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.edit_chapter(owner, _rid(rid), _int(cid), request.param("content"), request.param("note")))


def regenerate_api(request: Request, rid: str, cid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.regenerate_chapter(
        owner, _rid(rid), _int(cid), request.param("direction")
    ))


def versions_api(request: Request, rid: str, cid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.chapter_versions(owner, _rid(rid), _int(cid)))


def restore_api(request: Request, rid: str, vid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.restore_chapter_version(
        owner, _rid(rid), _int(request.param("chapter")), _int(vid)
    ))


def intervention_api(request: Request, rid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.propose_intervention(
        owner, _rid(rid), request.param("text"),
        _int(request.param("timeline")) or engine.get_state(owner, _rid(rid))["timeline_id"],
        request.param("idempotency_key"),
    ))


def apply_api(request: Request, rid: str, iid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.apply_intervention(
        owner, _rid(rid), _int(iid),
        branch=request.param("branch") in {"1", "true", "on"},
        generate=request.param("generate", "1") not in {"0", "false", "off"},
        idempotency_key=request.param("idempotency_key"),
    ))


def reject_api(request: Request, rid: str, iid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.reject_intervention(owner, _rid(rid), _int(iid)))


def timeline_api(request: Request, rid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.create_branch(
        owner, _rid(rid), name=request.param("name"),
        divergence=request.param("divergence"),
        from_timeline_id=_int(request.param("timeline")) or engine.get_state(owner, _rid(rid))["timeline_id"],
    ))


def compare_api(request: Request, rid: str, tid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.compare_timelines(owner, _rid(rid), _int(tid), _int(request.param("other"))))


def asset_api(request: Request, rid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.generate_asset(
        owner, _rid(rid), kind=request.param("kind", "cover"),
        entity_id=_int(request.param("entity")), prompt=request.param("prompt"),
        idempotency_key=request.param("idempotency_key"),
        background=request.param("async").strip().lower() in {"1", "true", "on"},
    ))


def modes_api(request: Request, rid: str) -> Response:
    owner = _owner(request)
    config = _narrative_params(request)
    if not config:
        raw = request.param("config")
        if not raw:
            raise HTTPError(400, "Indica al menos una opción de configuración narrativa.")
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            raise HTTPError(400, "La configuración narrativa no es JSON válido.")
        if not isinstance(parsed, dict):
            raise HTTPError(400, "La configuración narrativa debe ser un objeto JSON.")
        config = parsed
    return _result(lambda: engine.update_modes(owner, _rid(rid), config))


def update_api(request: Request, rid: str) -> Response:
    owner = _owner(request)
    narrative_params = _narrative_params(request)
    return _result(lambda: engine.update_reality(
        owner, _rid(rid), title=request.param("title"), description=request.param("description"),
        status=request.param("status"),
        favorite=1 if request.param("favorite") in {"1", "true", "on"} else (0 if request.param("favorite") else None),
        narrative_config=request.param("narrative_config"),
        config=narrative_params or None,
    ))


def cancel_api(request: Request, jid: str) -> Response:
    owner = _owner(request)
    return _result(lambda: engine.cancel_job(owner, _int(jid)))


def asset_bytes_api(request: Request, aid: str) -> Response:
    owner = _owner(request)
    try:
        data, mime = engine.asset_bytes(owner, _int(aid))
    except HTTPError as exc:
        return json_response({"ok": False, "error": exc.message}, exc.status)
    return Response(data, content_type=mime, headers={"Cache-Control": "private, max-age=3600"})
