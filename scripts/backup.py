"""Crear una copia de seguridad SQLite por línea de comandos."""
from __future__ import annotations

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import BACKUP_DIR, Config  # noqa: E402
from app.db import connect  # noqa: E402


def main() -> None:
    if not Config.DB_PATH.exists():
        raise SystemExit(f"No existe la base de datos: {Config.DB_PATH}")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"otraverso_{datetime.now().strftime('%Y%m%d_%H%M%S')}_cli.db"
    target = BACKUP_DIR / filename
    source = sqlite3.connect(Config.DB_PATH)
    destination = sqlite3.connect(target)
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()
    with connect() as conn:
        conn.execute("INSERT INTO backups(filename,size_bytes,created_by) VALUES (?,?,NULL)",
                     (filename, target.stat().st_size))
    print(f"Copia creada: {target}")


if __name__ == "__main__":
    main()
