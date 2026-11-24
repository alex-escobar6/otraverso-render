"""Copias de seguridad SQLite bajo demanda, con registro en bitácora."""
from __future__ import annotations

import base64
import json
import sqlite3
from datetime import date, datetime

from app.config import BACKUP_DIR, Config
from app.core.http import HTTPError, Request, Response
from app.core.render import esc, render
from app.db import execute, query
from . import admin_page, audit, csrf_input, go


def register(router) -> None:
    router.get("/admin/backups", backups_home, permission="backup.manage", name="admin.backups")
    router.post("/admin/backups/create", backup_create, permission="backup.manage", name="admin.backup.create")
    router.get("/admin/backups/{bid}/download", backup_download, permission="backup.manage", name="admin.backup.download")


def backups_home(request: Request) -> Response:
    rows = query(
        "SELECT b.*, u.name AS user_name FROM backups b LEFT JOIN users u ON u.id=b.created_by "
        "ORDER BY b.created_at DESC LIMIT 50"
    )
    body = "".join(
        f'<tr><td>{esc(r["filename"])}</td><td>{r["size_bytes"]/1024:.1f} KB</td><td>{esc(r["user_name"] or "Sistema")}</td>'
        f'<td>{esc(r["created_at"])}</td><td><a class="btn btn-sm" href="/admin/backups/{r["id"]}/download">Descargar</a></td></tr>'
        for r in rows
    )
    content = render("admin/backups.html", CSRF=csrf_input(request),
                     ROWS=body or '<tr><td colspan="5">No hay copias de seguridad registradas.</td></tr>')
    return admin_page(request, "Copias de seguridad", content, "backups")


def _postgres_dump(request: Request) -> Response:
    tables = [row[0] for row in query(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name"
    )]
    dump = {"format": "otraverso-postgres-json", "version": 1, "tables": {}}
    for table in tables:
        rows = query(f"SELECT * FROM {table}")
        encoded = []
        for row in rows:
            item = {}
            for key in row.keys():
                value = row[key]
                if isinstance(value, (bytes, bytearray, memoryview)):
                    value = {"__base64__": base64.b64encode(bytes(value)).decode("ascii")}
                elif isinstance(value, (datetime, date)):
                    value = value.isoformat(sep=" ")
                item[key] = value
            encoded.append(item)
        dump["tables"][table] = encoded
    filename = f"otraverso_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    body = json.dumps(dump, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    audit(request, "create", "backup", filename)
    return Response(body, content_type="application/json; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def backup_create(request: Request) -> Response:
    if Config.DB_BACKEND == "postgres":
        return _postgres_dump(request)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"otraverso_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    target = BACKUP_DIR / filename
    source = sqlite3.connect(Config.DB_PATH)
    destination = sqlite3.connect(target)
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()
    execute("INSERT INTO backups(filename,size_bytes,created_by) VALUES (?,?,?)",
            (filename, target.stat().st_size, request.user["id"]))
    audit(request, "create", "backup", filename)
    return go("/admin/backups", ok="Copia de seguridad creada")


def backup_download(request: Request, bid: int) -> Response:
    row = query("SELECT * FROM backups WHERE id=?", (bid,))
    if not row:
        raise HTTPError(404, "Copia no encontrada")
    path = BACKUP_DIR / row[0]["filename"]
    if not path.exists():
        raise HTTPError(404, "El archivo de la copia ya no existe")
    audit(request, "download", "backup", bid)
    return Response(path.read_bytes(), content_type="application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="{row[0]["filename"]}"'})
