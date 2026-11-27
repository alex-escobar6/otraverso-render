"""DRACONIA: espacio 3D privado con un compañero dragón."""
from __future__ import annotations

PREFIX = "/draconia"
API_PREFIX = PREFIX + "/api/v1"


def register(router) -> None:
    from . import api, pages

    router.get(PREFIX + "/entrar", pages.login_form, name="draconia.login")
    router.post(PREFIX + "/entrar", pages.login_submit, name="draconia.login.submit")
    router.post(PREFIX + "/salir", pages.logout, name="draconia.logout")
    router.get(PREFIX, pages.shell, permission="draconia.view", name="draconia.home")
    api.register(router)


def allowed(request) -> bool:
    return bool(request.user and "draconia.view" in request.permission_codes)
