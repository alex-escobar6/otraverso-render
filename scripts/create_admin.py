"""Crear o actualizar un usuario administrador de forma segura."""
from __future__ import annotations

import argparse
import stat
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import DATA_DIR  # noqa: E402
from app.db import connect  # noqa: E402
from app.security import generate_token, hash_password  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Crear administrador de OTRAVERSO")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Administrador")
    parser.add_argument("--role", default="superadmin", choices=["superadmin", "admin"])
    parser.add_argument("--password", help="Si se omite, se genera una contraseña aleatoria")
    args = parser.parse_args()

    generated = not args.password
    if generated:
        password = generate_token()
    else:
        password = args.password
        if len(password) < 12:
            raise SystemExit("La contraseña debe tener al menos 12 caracteres")
    email = args.email.strip().lower()

    with connect() as conn:
        role = conn.execute("SELECT id FROM roles WHERE code=?", (args.role,)).fetchone()
        if not role:
            raise SystemExit(f"Rol no encontrado: {args.role}")
        conn.execute(
            "INSERT INTO users(name,email,password_hash,role_id) VALUES (?,?,?,?) "
            "ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,"
            "role_id=excluded.role_id,active=1",
            (args.name.strip(), email, hash_password(password), role["id"]),
        )

    if generated:
        path = DATA_DIR / f"admin_credentials_{generate_token()[:8]}.txt"
        path.write_text(f"Email: {email}\nContraseña: {password}\n", encoding="utf-8")
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)
        print(f"Credenciales guardadas con permisos 0600 en: {path}")
    else:
        print(f"Usuario actualizado: {email}")


if __name__ == "__main__":
    main()
