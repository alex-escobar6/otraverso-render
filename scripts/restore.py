"""Restaurar una copia verificada, creando antes una copia de seguridad de la BD actual."""
from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import BACKUP_DIR, Config  # noqa: E402


def main() -> None:
    if Config.DB_BACKEND == "postgres":
        raise SystemExit("La restauración SQLite no aplica a PostgreSQL; use la migración con DATABASE_URL "
                         "o una exportación del proveedor.")
    parser = argparse.ArgumentParser(description="Restaurar copia de OTRAVERSO")
    parser.add_argument("filename", help="Nombre del archivo dentro de data/backups")
    parser.add_argument("--confirm", action="store_true", help="Confirmar la restauración")
    args = parser.parse_args()

    if not args.confirm:
        raise SystemExit("Se requiere --confirm. La base actual se respaldará antes de restaurar.")
    candidate = (BACKUP_DIR / args.filename).resolve()
    if candidate.parent != BACKUP_DIR.resolve() or not candidate.is_file() or candidate.suffix != ".db":
        raise SystemExit("Copia no válida. Debe estar dentro de data/backups y terminar en .db")

    connection = sqlite3.connect(candidate)
    try:
        result = connection.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        connection.close()
    if result != "ok":
        raise SystemExit(f"La copia no pasó integrity_check: {result}")

    safety = BACKUP_DIR / f"pre_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    if Config.DB_PATH.exists():
        source = sqlite3.connect(Config.DB_PATH)
        destination = sqlite3.connect(safety)
        try:
            source.backup(destination)
        finally:
            destination.close()
            source.close()
        print(f"Respaldo de seguridad: {safety}")

    shutil.copy2(candidate, Config.DB_PATH)
    for sidecar in (Path(str(Config.DB_PATH) + "-wal"), Path(str(Config.DB_PATH) + "-shm")):
        sidecar.unlink(missing_ok=True)
    print(f"Base restaurada desde: {candidate}")


if __name__ == "__main__":
    main()
