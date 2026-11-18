"""Inicializa o migra la base de datos de OTRAVERSO."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import DATA_DIR, Config
from app.db import init_db


def main() -> None:
    init_db()
    print(f"Base de datos lista: {Config.DB_PATH}")
    bootstrap = DATA_DIR / "bootstrap_admin.txt"
    if bootstrap.exists():
        print(f"Credenciales iniciales generadas de forma segura en: {bootstrap}")
        print("Cámbialas después del primer ingreso.")


if __name__ == "__main__":
    main()
