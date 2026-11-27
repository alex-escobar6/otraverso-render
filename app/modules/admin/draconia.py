"""Panel administrativo del compañero 3D de DRACONIA."""
from __future__ import annotations

from app.core.http import HTTPError, Request, Response
from app.core.render import esc, render
from app.db import get_setting, set_setting
from app.services.draconia import profile

from . import admin_page, csrf_input, go

TITLE = "DRACONIA · compañero 3D"


def register(router) -> None:
    router.get("/admin/draconia", overview, permission="draconia.manage", name="admin.draconia")
    router.post("/admin/draconia/save", save, permission="draconia.manage", name="admin.draconia.save")


def _flag(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def overview(request: Request) -> Response:
    data = profile.summary()
    settings = {
        "name": get_setting("draconia", "companion_default_name", "Luma"),
        "sound": _flag(get_setting("draconia", "sound_default", "1")),
        "reduced_motion": _flag(get_setting("draconia", "reduced_motion_default", "0")),
    }
    content = render(
        "admin/draconia.html",
        CSRF=csrf_input(request),
        NAME=esc(settings["name"]),
        SOUND_CHECKED=" checked" if settings["sound"] else "",
        REDUCED_CHECKED=" checked" if settings["reduced_motion"] else "",
        TOTAL=data["total"],
        ROWS="".join(
            "<tr><td>{}</td><td>{}</td><td>{}</td></tr>".format(
                esc(item["owner"]), esc(item["dragon"]), esc(item["state"])
            )
            for item in data["profiles"]
        ) or '<tr><td colspan="3">Todavía no hay compañeros activos.</td></tr>',
        STATES=", ".join(profile.STATES),
        ANIMATIONS=", ".join(profile.ANIMATIONS),
    )
    return admin_page(request, TITLE, content, active="draconia")


def save(request: Request) -> Response:
    name = " ".join(request.param("name", "").split())[:40]
    if not name:
        raise HTTPError(400, "El nombre inicial no puede estar vacío", "invalid_request")
    set_setting("draconia", "companion_default_name", name)
    set_setting("draconia", "sound_default", "1" if _flag(request.param("sound", "0")) else "0")
    set_setting("draconia", "reduced_motion_default",
                "1" if _flag(request.param("reduced_motion", "0")) else "0")
    return go("/admin/draconia", ok="Preferencias iniciales actualizadas")
