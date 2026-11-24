"""Migración no destructiva de SQLite a PostgreSQL mediante DATABASE_URL."""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Config  # noqa: E402
from app.db import init_db  # noqa: E402


def _tables(source: sqlite3.Connection) -> list[str]:
    return [
        row[0] for row in source.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid"
        )
    ]


def _columns(conn, table: str) -> list[str]:
    if hasattr(conn, "_connection"):
        rows = conn.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema=current_schema() AND table_name=%s ORDER BY ordinal_position",
            (table,),
        ).fetchall()
        return [row[0] for row in rows]
    return [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa datos SQLite a PostgreSQL sin borrar el destino")
    parser.add_argument("--source", default=str(Config.DB_PATH), help="Ruta de la base SQLite de origen")
    parser.add_argument("--confirm", action="store_true", help="Confirmar la escritura en PostgreSQL")
    args = parser.parse_args()

    if not args.confirm:
        raise SystemExit("Se requiere --confirm; la migración no sobrescribe filas existentes.")
    if Config.DB_BACKEND != "postgres":
        raise SystemExit("Defina DATABASE_URL con una URL PostgreSQL antes de migrar.")
    source_path = Path(args.source).resolve()
    if not source_path.is_file():
        raise SystemExit(f"No existe la base de datos de origen: {source_path}")

    init_db()
    from app.db import connect as target_connect

    source = sqlite3.connect(source_path)
    source.row_factory = sqlite3.Row
    target = None
    try:
        target = target_connect()
        for table in _tables(source):
            source_columns = _columns(source, table)
            target_columns = set(_columns(target, table))
            columns = [name for name in source_columns if name in target_columns]
            if not columns:
                continue
            marks = ",".join("?" for _ in columns)
            insert = f"INSERT INTO {table}({','.join(columns)}) VALUES ({marks}) ON CONFLICT DO NOTHING"
            names = ",".join(columns)
            rows = [tuple(row[name] for name in columns) for row in source.execute(f"SELECT {names} FROM {table}")]
            if rows:
                target.executemany(insert, rows)
            if "id" in columns and rows:
                last = max(int(row[columns.index("id")]) for row in rows if row[columns.index("id")] is not None)
                target.execute(
                    "SELECT setval(pg_get_serial_sequence(%s,'id'), GREATEST(%s,1), %s)",
                    (table, last, True),
                )
            target.commit()
            print(f"{table}: {len(rows)} filas revisadas")
    finally:
        source.close()
        if target is not None:
            target.close()
    print("Migración completada sin eliminar datos del destino.")


if __name__ == "__main__":
    main()
