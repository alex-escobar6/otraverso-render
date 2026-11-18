"""Usuarios, roles, permisos individuales y bitácora de auditoría."""
from __future__ import annotations

from app.core.http import HTTPError, Request, Response
from app.core.render import esc, render
from app.db import execute, one, query, transaction
from app.security import hash_password
from . import admin_page, audit, csrf_input, go


def register(router) -> None:
    router.get("/admin/users", users_list, permission="users.manage", name="admin.users")
    router.get("/admin/users/new", user_form, permission="users.manage", name="admin.user.new")
    router.post("/admin/users/create", user_create, permission="users.manage", name="admin.user.create")
    router.get("/admin/users/{uid}/edit", user_form, permission="users.manage", name="admin.user.edit")
    router.post("/admin/users/{uid}/update", user_update, permission="users.manage", name="admin.user.update")
    router.post("/admin/users/{uid}/toggle", user_toggle, permission="users.manage", name="admin.user.toggle")
    router.post("/admin/users/{uid}/delete", user_delete, permission="users.manage", name="admin.user.delete")
    router.get("/admin/roles", roles_page, permission="users.manage", name="admin.roles")
    router.post("/admin/roles/{rid}/permissions", role_permissions, permission="users.manage", name="admin.role.permissions")
    router.get("/admin/audit", audit_page, permission="audit.view", name="admin.audit")


def users_list(request: Request) -> Response:
    rows = query("SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.id")
    body = "".join(
        f'<tr><td>{esc(r["name"])}</td><td>{esc(r["email"])}</td><td>{esc(r["role_name"])}</td>'
        f'<td><span class="status-tag {"ok" if r["active"] else "bad"}">{"Activo" if r["active"] else "Inactivo"}</span></td>'
        f'<td>{esc(r["last_login_at"] or "—")}</td><td><div class="row-actions">'
        f'<a class="btn btn-sm" href="/admin/users/{r["id"]}/edit">Editar</a>'
        f'<form method="post" action="/admin/users/{r["id"]}/toggle">{csrf_input(request)}<button class="btn btn-sm" type="submit">Alternar</button></form>'
        f'<form method="post" action="/admin/users/{r["id"]}/delete">{csrf_input(request)}<button class="btn btn-sm btn-danger" type="submit">Eliminar</button></form>'
        '</div></td></tr>' for r in rows
    )
    content = render("admin/users.html", ROWS=body)
    return admin_page(request, "Usuarios y permisos", content, "users")


def user_form(request: Request, uid: int = 0) -> Response:
    user = one("SELECT * FROM users WHERE id=?", (uid,)) if uid else None
    roles = query("SELECT * FROM roles ORDER BY name")
    role_options = "".join(
        f'<option value="{r["id"]}"{" selected" if user and user["role_id"]==r["id"] else ""}>{esc(r["name"])}</option>'
        for r in roles
    )
    content = render("admin/user_form.html", CSRF=csrf_input(request), ACTION=f"/admin/users/{uid}/update" if uid else "/admin/users/create",
        NAME=esc(user["name"] if user else ""), EMAIL=esc(user["email"] if user else ""), ROLE_OPTIONS=role_options)
    return admin_page(request, "Editar usuario" if uid else "Nuevo usuario", content, "users")


def user_create(request: Request) -> Response:
    from app.core.http import HTTPError as HE
    email = request.param("email", "").strip().lower()
    password = request.param("password", "")
    if not email or not password:
        return go("/admin/users/new", error="Correo y contraseña son obligatorios")
    try:
        hashed = hash_password(password)
    except ValueError as exc:
        return go("/admin/users/new", error=str(exc))
    try:
        execute("INSERT INTO users(name,email,password_hash,role_id,active) VALUES (?,?,?,?,1)",
                (request.param("name", "").strip(), email, hashed, request.int_param("role_id")))
    except Exception:
        return go("/admin/users/new", error="Ya existe un usuario con ese correo")
    audit(request, "create", "user", email)
    return go("/admin/users", ok="Usuario creado")


def user_update(request: Request, uid: int) -> Response:
    user = one("SELECT * FROM users WHERE id=?", (uid,))
    if not user:
        raise HTTPError(404, "Usuario no encontrado")
    password = request.param("password", "").strip()
    updates = ["name=?", "email=?", "role_id=?", "updated_at=CURRENT_TIMESTAMP"]
    params: list[object] = [request.param("name", "").strip(), request.param("email", "").strip().lower(),
                            request.int_param("role_id"), uid]
    if password:
        try:
            hashed = hash_password(password)
        except ValueError as exc:
            return go(f"/admin/users/{uid}/edit", error=str(exc))
        updates.insert(3, "password_hash=?")
        params.insert(3, hashed)
    execute(f"UPDATE users SET {','.join(updates)} WHERE id=?", params)
    audit(request, "update", "user", uid)
    return go(f"/admin/users/{uid}/edit", ok="Usuario actualizado")


def user_toggle(request: Request, uid: int) -> Response:
    if request.user and request.user["id"] == uid:
        return go("/admin/users", error="No puede desactivar su propio usuario")
    execute("UPDATE users SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?", (uid,))
    audit(request, "toggle", "user", uid)
    return go("/admin/users", ok="Usuario actualizado")


def user_delete(request: Request, uid: int) -> Response:
    if request.user and request.user["id"] == uid:
        return go("/admin/users", error="No puede eliminar su propio usuario")
    execute("DELETE FROM users WHERE id=?", (uid,))
    audit(request, "delete", "user", uid)
    return go("/admin/users", ok="Usuario eliminado")


def roles_page(request: Request) -> Response:
    roles = query("SELECT * FROM roles ORDER BY name")
    permissions = query("SELECT * FROM permissions ORDER BY code")
    blocks = []
    for role in roles:
        granted = {r[0] for r in query("SELECT permission_id FROM role_permissions WHERE role_id=?", (role["id"],))}
        checks = "".join(
            f'<label class="checkline"><input type="checkbox" name="perm_{p["id"]}" value="1"{" checked" if p["id"] in granted else ""}> {esc(p["code"])} — {esc(p["description"])}</label>'
            for p in permissions
        )
        blocks.append(f'<div class="panel"><form method="post" action="/admin/roles/{role["id"]}/permissions">'
                      f'{csrf_input(request)}<h2>{esc(role["name"])}</h2><div class="form-grid">{checks}</div>'
                      '<button class="btn btn-primary btn-sm" type="submit" style="margin-top:1rem">Guardar permisos</button></form></div>')
    content = "".join(blocks)
    return admin_page(request, "Roles y permisos", content, "users")


def role_permissions(request: Request, rid: int) -> Response:
    permissions = query("SELECT id FROM permissions")
    with transaction() as conn:
        conn.execute("DELETE FROM role_permissions WHERE role_id=?", (rid,))
        for perm in permissions:
            if request.param(f"perm_{perm['id']}") == "1":
                conn.execute("INSERT INTO role_permissions(role_id,permission_id) VALUES (?,?)", (rid, perm["id"]))
    audit(request, "update", "role_permissions", rid)
    return go("/admin/roles", ok="Permisos actualizados")


def audit_page(request: Request) -> Response:
    action = request.query.get("action", "").strip()
    rows = query(
        "SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id "
        "WHERE LOWER(a.action) LIKE ? ORDER BY a.created_at DESC,a.id DESC LIMIT 200", (f"%{action.lower()}%",)
    )
    body = "".join(
        f'<tr><td>{esc(r["created_at"])}</td><td>{esc(r["user_name"] or "Sistema")}</td><td>{esc(r["action"])}</td>'
        f'<td>{esc(r["entity"])}</td><td>{esc(r["entity_id"])}</td><td>{esc(r["ip"])}</td></tr>' for r in rows
    )
    content = render("admin/audit.html", ACTION=esc(action), ROWS=body or '<tr><td colspan="6">Sin registros</td></tr>')
    return admin_page(request, "Bitácora de auditoría", content, "audit")
