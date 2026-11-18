"""Pruebas de integración HTTP sobre una base de datos temporal."""
from __future__ import annotations

import io
import os
import shutil
import sys
import tempfile
import unittest
import urllib.parse
import uuid
from pathlib import Path

TEST_DIR = Path(tempfile.mkdtemp(prefix="otraverso_tests_"))
os.environ["DATABASE_PATH"] = str(TEST_DIR / "test.db")
os.environ["SECRET_KEY"] = "clave-de-prueba-no-produccion"
os.environ["ADMIN_EMAIL"] = "admin@test.local"
os.environ["ADMIN_PASSWORD"] = "clave-segura-123"
os.environ["BASE_URL"] = "http://test.local"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from wsgiref.util import setup_testing_defaults  # noqa: E402

from app.core.auth import public_csrf_token  # noqa: E402
from app.db import init_db, one, query, transaction  # noqa: E402
from app.main import application  # noqa: E402
from app.security import hash_password, hash_token  # noqa: E402


class Client:
    def __init__(self) -> None:
        self.cookie = ""

    def call(self, path: str, method: str = "GET", form: dict | None = None,
             files: dict | None = None) -> tuple[str, dict, str]:
        environ: dict = {}
        setup_testing_defaults(environ)
        parsed = urllib.parse.urlsplit(path)
        environ["PATH_INFO"] = parsed.path
        environ["QUERY_STRING"] = parsed.query
        environ["REQUEST_METHOD"] = method
        if self.cookie:
            environ["HTTP_COOKIE"] = self.cookie
        if files:
            boundary = "----otraverso" + uuid.uuid4().hex
            chunks = []
            for key, value in (form or {}).items():
                chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
            for field, (filename, data) in files.items():
                chunks.append(
                    f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
                    'Content-Type: image/png\r\n\r\n'.encode()
                )
                chunks += [data, b"\r\n"]
            chunks.append(f"--{boundary}--\r\n".encode())
            body = b"".join(chunks)
            environ["CONTENT_TYPE"] = f"multipart/form-data; boundary={boundary}"
        elif form is not None:
            body = urllib.parse.urlencode(form).encode()
            environ["CONTENT_TYPE"] = "application/x-www-form-urlencoded"
        else:
            body = b""
        environ["CONTENT_LENGTH"] = str(len(body))
        environ["wsgi.input"] = io.BytesIO(body)
        captured: dict = {}
        chunks = application(environ, lambda status, headers: captured.update(
            status=status, headers=dict(headers)))
        return captured.get("status", ""), captured.get("headers", {}), b"".join(chunks).decode("utf-8", "replace")

    def login(self, email: str = "admin@test.local", password: str = "clave-segura-123") -> bool:
        status, headers, _ = self.call("/admin/login", "POST",
                                       {"csrf": public_csrf_token(), "email": email, "password": password})
        if status.startswith("303"):
            self.cookie = headers.get("Set-Cookie", "").split(";")[0]
            return True
        return False

    @property
    def csrf(self) -> str:
        token = self.cookie.split("=", 1)[1]
        return one("SELECT csrf_token FROM sessions WHERE token_hash=?", (hash_token(token),))["csrf_token"]


class OtraversoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        init_db()
        cls.admin = Client()
        assert cls.admin.login(), "No se pudo iniciar sesión en las pruebas"

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(TEST_DIR, ignore_errors=True)

    def test_01_schema_and_seed(self) -> None:
        tables = {row[0] for row in query("SELECT name FROM sqlite_master WHERE type='table'")}
        for expected in ("products", "inventory_movements", "orders", "purchase_requests",
                         "zone_rates", "whatsapp_templates", "analytics_events", "audit_log", "backups"):
            self.assertIn(expected, tables)
        self.assertEqual(one("PRAGMA user_version")[0], 2)
        enabled = {row["code"] for row in query("SELECT code FROM modules WHERE enabled=1")}
        self.assertEqual(enabled, {"portal", "shop"})
        self.assertNotIn("contraseña", str(query("SELECT password_hash FROM users")[0]["password_hash"]).lower())

    def test_02_portal_and_planned_universes(self) -> None:
        status, _, body = Client().call("/")
        self.assertTrue(status.startswith("200"))
        self.assertIn("Hay más de un mundo", body)
        self.assertIn("Planeado", body)
        status, _, body = Client().call("/universos/whatif")
        self.assertTrue(status.startswith("200"))
        self.assertIn("No hay funcionalidades activas", body)

    def test_03_shop_pages(self) -> None:
        client = Client()
        for path in ("/shop", "/shop/catalogo", "/shop/cobertura", "/pages/condiciones", "/sitemap.xml", "/robots.txt"):
            status, _, _ = client.call(path)
            self.assertTrue(status.startswith("200"), path)
        status, _, body = client.call("/shop/catalogo?q=inexistente")
        self.assertIn("Aún no hay productos publicados", body)

    def test_04_csrf_required(self) -> None:
        status, _, _ = Client().call("/admin/login", "POST", {"email": "x", "password": "y"})
        self.assertTrue(status.startswith("400"))

    def test_05_rbac(self) -> None:
        role_id = one("SELECT id FROM roles WHERE code='product_manager'")["id"]
        with transaction() as conn:
            conn.execute("INSERT INTO users(name,email,password_hash,role_id) VALUES (?,?,?,?)",
                         ("Gestor", "gestor@test.local", hash_password("clave-segura-123"), role_id))
        manager = Client()
        self.assertTrue(manager.login("gestor@test.local", "clave-segura-123"))
        status, _, _ = manager.call("/admin/products")
        self.assertTrue(status.startswith("200"))
        status, _, _ = manager.call("/admin/users")
        self.assertTrue(status.startswith("403"))

    def test_06_admin_product_inventory_order(self) -> None:
        form = {
            "csrf": self.admin.csrf, "name": "Lámpara solar", "modality": "stock", "status": "active",
            "price": "189000", "cost": "105000", "stock": "4", "low_stock_threshold": "1",
            "delivery_hours": "24", "attributes": "Color: Negra\nUso: Exterior",
            "seo_title": "Lámpara solar — OTRAVERSO", "tags": "solar, exterior",
        }
        status, headers, _ = self.admin.call("/admin/products/create", "POST", form)
        self.assertTrue(status.startswith("303"), status)
        product = one("SELECT * FROM products WHERE name='Lámpara solar'")
        self.assertIsNotNone(product)
        self.assertEqual(product["stock"], 4, "El stock inicial solo se registra una vez")
        self.assertEqual(product["seo_title"], "Lámpara solar — OTRAVERSO")

        from PIL import Image
        buffer = io.BytesIO()
        Image.new("RGB", (30, 30), (40, 80, 160)).save(buffer, "PNG")
        status, _, _ = self.admin.call(f"/admin/products/{product['id']}/images", "POST",
                                       {"csrf": self.admin.csrf},
                                       files={"images": ("foto.png", buffer.getvalue())})
        self.assertTrue(status.startswith("303"))
        self.assertEqual(len(query("SELECT * FROM product_images WHERE product_id=?", (product["id"],))), 1)

        status, _, _ = self.admin.call("/admin/inventory/movement", "POST", {
            "csrf": self.admin.csrf, "product_id": product["id"], "movement_type": "entry",
            "quantity": "2", "cost_cents": "105000", "note": "Reposición"})
        self.assertTrue(status.startswith("303"))
        self.assertEqual(one("SELECT stock FROM products WHERE id=?", (product["id"],))["stock"], 6)

        status, headers, _ = self.admin.call("/admin/orders/create", "POST", {
            "csrf": self.admin.csrf, "name": "Cliente QA", "phone": "3001112233",
            "product_id": product["id"], "quantity": "2", "shipping": "5000"})
        self.assertTrue(status.startswith("303"))
        order = one("SELECT * FROM orders ORDER BY id DESC LIMIT 1")
        self.assertEqual(order["total_cents"], 38300000)
        self.assertEqual(one("SELECT stock FROM products WHERE id=?", (product["id"],))["stock"], 4)

        status, _, _ = self.admin.call(f"/admin/orders/{order['id']}/status", "POST",
                                       {"csrf": self.admin.csrf, "status": "confirmed", "note": "Confirmado por teléfono"})
        self.assertTrue(status.startswith("303"))
        self.assertEqual(order["status"], "pending")
        self.assertEqual(one("SELECT status FROM orders WHERE id=?", (order["id"],))["status"], "confirmed")

    def test_07_product_detail_and_seo(self) -> None:
        status, _, body = Client().call("/shop/producto/lampara-solar")
        self.assertTrue(status.startswith("200"))
        self.assertIn("Lámpara solar — OTRAVERSO", body)
        self.assertIn("Disponible en inventario", body)
        self.assertIn('name="consent"', body)

    def test_08_whatsapp_request_persisted(self) -> None:
        product = one("SELECT id FROM products WHERE slug='lampara-solar'")
        client = Client()
        status, headers, _ = client.call("/shop/whatsapp", "POST", {
            "csrf": public_csrf_token(), "product_id": product["id"], "name": "Ana Prueba",
            "phone": "3004445566", "quantity": "1", "source": "product",
            "note": "¿Color disponible?", "consent": "1", "zona": ""})
        self.assertTrue(status.startswith("303"))
        self.assertTrue(headers.get("Location", "").startswith("https://wa.me/"))
        request = one("SELECT * FROM purchase_requests ORDER BY id DESC LIMIT 1")
        self.assertEqual(request["name"], "Ana Prueba")
        self.assertIn("Lámpara solar", request["message"])
        self.assertIn("¿Color disponible?", request["message"])
        self.assertEqual(len(query("SELECT * FROM whatsapp_clicks WHERE request_id=?", (request["id"],))), 1)
        self.assertEqual(len(query("SELECT * FROM customers WHERE phone='573004445566'")), 1)

    def test_09_whatsapp_consent_required(self) -> None:
        product = one("SELECT id FROM products WHERE slug='lampara-solar'")
        status, _, _ = Client().call("/shop/whatsapp", "POST", {
            "csrf": public_csrf_token(), "product_id": product["id"], "name": "Sin consentimiento",
            "phone": "3001110000", "quantity": "1", "source": "product", "consent": ""})
        self.assertTrue(status.startswith("400"))

    def test_10_convert_request_and_backup(self) -> None:
        request = one("SELECT id FROM purchase_requests ORDER BY id DESC LIMIT 1")
        status, headers, _ = self.admin.call(f"/admin/requests/{request['id']}/convert", "POST",
                                             {"csrf": self.admin.csrf})
        self.assertTrue(status.startswith("303"), status)
        self.assertEqual(one("SELECT status FROM purchase_requests WHERE id=?", (request["id"],))["status"], "converted")
        status, _, _ = self.admin.call("/admin/backups/create", "POST", {"csrf": self.admin.csrf})
        self.assertTrue(status.startswith("303"))
        self.assertEqual(len(query("SELECT * FROM backups")), 1)

    def test_11_all_admin_pages_render(self) -> None:
        paths = ["/admin", "/admin/products", "/admin/products/new", "/admin/inventory", "/admin/orders",
                 "/admin/orders/new", "/admin/requests", "/admin/customers", "/admin/marketing",
                 "/admin/coverage", "/admin/settings/commercial", "/admin/settings/visual",
                 "/admin/settings/whatsapp", "/admin/settings/seo", "/admin/settings/modules",
                 "/admin/analytics", "/admin/users", "/admin/users/new", "/admin/roles",
                 "/admin/audit", "/admin/backups"]
        for path in paths:
            status, _, body = self.admin.call(path)
            self.assertTrue(status.startswith("200"), f"{path}: {status}")
            self.assertNotIn("Ocurrió un error inesperado", body)

    def test_12_play_universe_and_nexus_rush(self) -> None:
        client = Client()
        status, _, body = client.call("/")
        self.assertTrue(status.startswith("200"))
        self.assertIn('data-portal="play"', body)
        self.assertIn("/static/js/nexus-rush.js", body)
        for path, marker in (("/play", "NEXUS RUSH"), ("/play/nexus-rush", "data-game-result")):
            status, _, body = client.call(path)
            self.assertTrue(status.startswith("200"), path)
            self.assertIn(marker, body)
            self.assertIn("/static/js/universe-core.js", body)
        enabled = {row["code"] for row in query("SELECT code FROM modules WHERE enabled=1")}
        self.assertEqual(enabled, {"portal", "shop"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
