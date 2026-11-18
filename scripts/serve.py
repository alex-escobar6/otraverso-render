"""Servidor de desarrollo WSGI (para producción usar gunicorn u otro servidor WSGI)."""
from __future__ import annotations

import sys
from pathlib import Path
from wsgiref.simple_server import make_server

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Config
from app.main import application


def main() -> None:
    init_db_note = "OTRAVERSO SHOP"
    print(f"{init_db_note} escuchando en http://{Config.HOST}:{Config.PORT}")
    with make_server(Config.HOST, Config.PORT, application) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
