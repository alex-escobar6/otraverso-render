"""API privada mínima del compañero 3D de DRACONIA."""
from __future__ import annotations

from app.core.http import HTTPError, Request, Response, json_response
from app.services.draconia import profile

from . import API_PREFIX


def register(router) -> None:
    router.get(API_PREFIX + "/state", get_state, permission="draconia.view", name="draconia.api.state")
    router.post(API_PREFIX + "/name", post_name, permission="draconia.view", name="draconia.api.name")
    router.post(API_PREFIX + "/preferences", post_preferences,
                permission="draconia.view", name="draconia.api.preferences")
    router.post(API_PREFIX + "/state", post_state, permission="draconia.view", name="draconia.api.state.save")


def _flag(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def get_state(request: Request) -> Response:
    user = profile.build(request.user["id"])
    return json_response({
        "ok": True,
        "version": 4,
        "profile": user,
        "capabilities": {
            "renderer": "three",
            "animations": list(profile.ANIMATIONS),
            "states": list(profile.STATES),
            "transitions": {key: sorted(value) for key, value in profile.TRANSITIONS.items()},
            "last_state": user["last_state"],
            "reduced_motion": user["reduced_motion"],
        },
    })


def post_name(request: Request) -> Response:
    try:
        name = profile.set_name(request.user["id"], request.param("name", ""))
    except ValueError as exc:
        raise HTTPError(400, str(exc), "invalid_request")
    return json_response({"ok": True, "name": name})


def post_preferences(request: Request) -> Response:
    values = profile.set_preferences(
        request.user["id"],
        sound=_flag(request.param("sound", "1")),
        reduced_motion=_flag(request.param("reduced_motion", "0")),
    )
    return json_response({"ok": True, "preferences": values})


def post_state(request: Request) -> Response:
    state = profile.set_state(request.user["id"], request.param("state", "idle"))
    return json_response({"ok": True, "state": state})
