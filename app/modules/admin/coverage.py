"""Administración de departamentos, municipios, zonas y tarifas de entrega."""
from __future__ import annotations

from app.core.http import Request, Response
from app.core.render import esc, render
from app.db import execute, query
from . import admin_page, audit, csrf_input, go


def register(router) -> None:
    router.get("/admin/coverage", coverage_home, permission="coverage.manage", name="admin.coverage")
    router.post("/admin/coverage/departments", department_create, permission="coverage.manage", name="admin.department.create")
    router.post("/admin/coverage/municipalities", municipality_create, permission="coverage.manage", name="admin.municipality.create")
    router.post("/admin/coverage/municipalities/{mid}/toggle", municipality_toggle, permission="coverage.manage", name="admin.municipality.toggle")
    router.post("/admin/coverage/zones", zone_create, permission="coverage.manage", name="admin.zone.create")
    router.post("/admin/coverage/zones/{zid}/toggle", zone_toggle, permission="coverage.manage", name="admin.zone.toggle")
    router.post("/admin/coverage/rates", rate_create, permission="coverage.manage", name="admin.rate.create")
    router.post("/admin/coverage/rates/{rid}/update", rate_update, permission="coverage.manage", name="admin.rate.update")


def coverage_home(request: Request) -> Response:
    departments = query("SELECT * FROM departments ORDER BY name")
    municipalities = query(
        "SELECT m.*, d.name AS department_name FROM municipalities m JOIN departments d ON d.id=m.department_id "
        "ORDER BY m.name"
    )
    zones = query(
        "SELECT z.*, m.name AS municipality_name FROM delivery_zones z JOIN municipalities m ON m.id=z.municipality_id "
        "ORDER BY m.name,z.name"
    )
    rates = query(
        "SELECT r.*, z.name AS zone_name, m.name AS municipality_name FROM zone_rates r "
        "JOIN delivery_zones z ON z.id=r.zone_id JOIN municipalities m ON m.id=z.municipality_id "
        "ORDER BY m.name,z.name,r.modality"
    )
    dept_options = "".join(f'<option value="{d["id"]}">{esc(d["name"])}</option>' for d in departments)
    muni_options = "".join(f'<option value="{m["id"]}">{esc(m["name"])}</option>' for m in municipalities)
    zone_options = "".join(
        f'<option value="{z["id"]}">{esc(z["municipality_name"] + " — " + z["name"])}</option>' for z in zones
    )
    municipality_rows = "".join(
        f'<tr><td>{esc(m["name"])}</td><td>{esc(m["department_name"])}</td>'
        f'<td><span class="status-tag {"ok" if m["active"] else "bad"}">{"Habilitado" if m["active"] else "Deshabilitado"}</span></td>'
        f'<td><form method="post" action="/admin/coverage/municipalities/{m["id"]}/toggle">{csrf_input(request)}'
        f'<button class="btn btn-sm" type="submit">Alternar</button></form></td></tr>' for m in municipalities
    )
    zone_rows = "".join(
        f'<tr><td>{esc(z["municipality_name"])}</td><td>{esc(z["name"])}</td><td>{esc(z["kind"])}</td>'
        f'<td><form method="post" action="/admin/coverage/zones/{z["id"]}/toggle">{csrf_input(request)}'
        f'<button class="btn btn-sm" type="submit">{"Desactivar" if z["active"] else "Activar"}</button></form></td></tr>'
        for z in zones
    )
    rate_rows = "".join(
        f'<tr><td>{esc(r["municipality_name"])} — {esc(r["zone_name"])}</td>'
        f'<td>{"Inventario" if r["modality"]=="stock" else "Bajo pedido"}</td>'
        f'<td><form method="post" action="/admin/coverage/rates/{r["id"]}/update">{csrf_input(request)}'
        f'<input name="price" type="number" value="{r["price_cents"]/100:.0f}" style="width:90px"></td>'
        f'<td><input name="hours" type="number" value="{r["estimated_hours"]}" style="width:80px"></td>'
        f'<td><input name="label" value="{esc(r["label"])}"></td>'
        f'<td><button class="btn btn-sm btn-primary" type="submit">Guardar</button></form></td>'
        f'<td>{esc(r["conditions"])}</td></tr>' for r in rates
    )
    content = render("admin/coverage.html", CSRF=csrf_input(request), DEPT_OPTIONS=dept_options,
        MUNI_OPTIONS=muni_options, ZONE_OPTIONS=zone_options, MUNICIPALITIES=municipality_rows,
        ZONES=zone_rows, RATES=rate_rows)
    return admin_page(request, "Cobertura y entregas", content, "coverage")


def department_create(request: Request) -> Response:
    name = request.param("name", "").strip()
    if not name:
        return go("/admin/coverage", error="Nombre de departamento obligatorio")
    try:
        execute("INSERT INTO departments(name,code) VALUES (?,?)", (name, request.param("code", "").strip().upper() or name[:3].upper()))
    except Exception:
        return go("/admin/coverage", error="Ya existe ese departamento")
    audit(request, "create", "department", name)
    return go("/admin/coverage", ok="Departamento creado")


def municipality_create(request: Request) -> Response:
    name = request.param("name", "").strip()
    if not name:
        return go("/admin/coverage", error="Nombre de municipio obligatorio")
    from app.services.catalog import slugify
    try:
        execute("INSERT INTO municipalities(department_id,name,slug) VALUES (?,?,?)",
                (request.int_param("department_id"), name, slugify(name)))
    except Exception:
        return go("/admin/coverage", error="Ya existe ese municipio")
    audit(request, "create", "municipality", name)
    return go("/admin/coverage", ok="Municipio creado")


def municipality_toggle(request: Request, mid: int) -> Response:
    execute("UPDATE municipalities SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?", (mid,))
    audit(request, "toggle", "municipality", mid)
    return go("/admin/coverage", ok="Municipio actualizado")


def zone_create(request: Request) -> Response:
    name = request.param("name", "").strip()
    if not name:
        return go("/admin/coverage", error="Nombre de zona obligatorio")
    execute("INSERT INTO delivery_zones(municipality_id,name,kind,description) VALUES (?,?,?,?)",
            (request.int_param("municipality_id"), name,
             request.param("kind", "municipality"), request.param("description", "").strip()))
    audit(request, "create", "delivery_zone", name)
    return go("/admin/coverage", ok="Zona creada")


def zone_toggle(request: Request, zid: int) -> Response:
    execute("UPDATE delivery_zones SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?", (zid,))
    audit(request, "toggle", "delivery_zone", zid)
    return go("/admin/coverage", ok="Zona actualizada")


def rate_create(request: Request) -> Response:
    try:
        execute(
            "INSERT INTO zone_rates(zone_id,modality,label,price_cents,estimated_hours,conditions) VALUES (?,?,?,?,?,?)",
            (request.int_param("zone_id"), request.param("modality", "stock"),
             request.param("label", "").strip(), request.int_param("price", 0) * 100,
             request.int_param("hours", 24), request.param("conditions", "").strip()),
        )
    except Exception:
        return go("/admin/coverage", error="Ya existe una tarifa para esa zona y modalidad")
    audit(request, "create", "zone_rate")
    return go("/admin/coverage", ok="Tarifa creada")


def rate_update(request: Request, rid: int) -> Response:
    execute("UPDATE zone_rates SET price_cents=?,estimated_hours=?,label=?,active=? WHERE id=?",
            (request.int_param("price", 0) * 100, request.int_param("hours", 24),
             request.param("label", "").strip(), 1 if request.param("active", "1") == "1" else 0, rid))
    audit(request, "update", "zone_rate", rid)
    return go("/admin/coverage", ok="Tarifa actualizada")
