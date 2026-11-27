"""Pruebas de integración HTTP sobre una base de datos temporal."""
from __future__ import annotations

import hashlib
import hmac
import io
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
import urllib.parse
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

TEST_DIR = Path(tempfile.mkdtemp(prefix="otraverso_tests_"))
os.environ["DATABASE_PATH"] = str(TEST_DIR / "test.db")
os.environ["SECRET_KEY"] = "clave-de-prueba-no-produccion"
os.environ["ADMIN_EMAIL"] = "admin@test.local"
os.environ["ADMIN_PASSWORD"] = "clave-segura-123"
os.environ["BASE_URL"] = "http://test.local"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from wsgiref.util import setup_testing_defaults  # noqa: E402

from app import db_backend  # noqa: E402
from app.config import Config  # noqa: E402
from app.core.auth import public_csrf_token  # noqa: E402
from app.core.http import HTTPError  # noqa: E402
from app.db import execute, get_setting, init_db, one, query, set_setting, settings_group, transaction  # noqa: E402
from app.main import application  # noqa: E402
from app.security import hash_password, hash_token  # noqa: E402
from app.services import storage  # noqa: E402
from app.services.whatif import engine, provider  # noqa: E402


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

    def call_raw(self, path: str, method: str, body: bytes, content_type: str,
                 extra_headers: dict | None = None) -> tuple[str, dict, str]:
        environ: dict = {}
        setup_testing_defaults(environ)
        parsed = urllib.parse.urlsplit(path)
        environ["PATH_INFO"] = parsed.path
        environ["QUERY_STRING"] = parsed.query
        environ["REQUEST_METHOD"] = method
        if self.cookie:
            environ["HTTP_COOKIE"] = self.cookie
        for key, value in (extra_headers or {}).items():
            environ["HTTP_" + key.upper().replace("-", "_")] = value
        environ["CONTENT_TYPE"] = content_type
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
                         "zone_rates", "whatsapp_templates", "analytics_events", "audit_log", "backups",
                         "play_profiles", "play_results", "play_achievements", "play_collectibles",
                          "whatif_realities", "whatif_chapters", "whatif_timelines", "whatif_memories",
                          "whatif_memory_cards", "whatif_interventions", "whatif_versions", "whatif_assets", "site_pages"):
            self.assertIn(expected, tables)
        self.assertEqual(one("PRAGMA user_version")[0], 8)
        page_columns = {row[1] for row in query("PRAGMA table_info(site_pages)")}
        self.assertTrue({"parent_code", "element_type", "notice_title", "notice_description",
                         "notice_button", "notice_image"} <= page_columns)
        product_columns = {row[1] for row in query("PRAGMA table_info(products)")}
        self.assertIn("target_margin_percent", product_columns)
        self.assertIn("whatsapp_message", product_columns)
        order_columns = {row[1] for row in query("PRAGMA table_info(orders)")}
        self.assertTrue({"source", "payment_method", "payment_status", "paid_at", "created_by"} <= order_columns)
        item_columns = {row[1] for row in query("PRAGMA table_info(order_items)")}
        self.assertIn("cost_cents", item_columns)
        click_columns = {row[1] for row in query("PRAGMA table_info(whatsapp_clicks)")}
        self.assertTrue({"public_id", "message", "url", "path", "user_agent", "trace_id"} <= click_columns)
        enabled = {row["code"] for row in query("SELECT code FROM modules WHERE enabled=1")}
        self.assertEqual(enabled, {"portal", "shop", "play", "whatif"})
        self.assertNotIn("contraseña", str(query("SELECT password_hash FROM users")[0]["password_hash"]).lower())

    def test_02_portal_and_planned_universes(self) -> None:
        status, _, body = Client().call("/")
        self.assertTrue(status.startswith("200"))
        self.assertIn("Hay más de un mundo", body)
        self.assertIn("Planeado", body)
        self.assertIn('href="/what-if" data-warp data-world="whatif"', body)
        self.assertNotIn('href="/whatif"', body)
        status, headers, _ = Client().call("/universos/whatif")
        self.assertTrue(status.startswith("303"))
        self.assertEqual(headers.get("Location"), "/what-if")
        status, _, body = Client().call("/what-if")
        self.assertTrue(status.startswith("200"))
        self.assertIn("OTRAVERSO WHAT IF", body)

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
                  "/admin/coverage", "/admin/what-if", "/admin/settings/commercial", "/admin/settings/visual",
                 "/admin/settings/whatsapp", "/admin/settings/seo", "/admin/settings/modules",
                 "/admin/analytics", "/admin/users", "/admin/users/new", "/admin/roles",
                 "/admin/audit", "/admin/backups"]
        for path in paths:
            status, _, body = self.admin.call(path)
            self.assertTrue(status.startswith("200"), f"{path}: {status}")
            self.assertNotIn("Ocurrió un error inesperado", body)

    def test_12_pregit_canvas_galaxy_and_play_preserved(self) -> None:
        client = Client()
        status, _, body = client.call("/")
        self.assertTrue(status.startswith("200"))
        self.assertIn('class="galaxy-stage"', body)
        self.assertNotIn('data-loader', body)
        for world in ("shop", "whatif", "play", "labs"):
            self.assertIn(f'data-world="{world}"', body)
        self.assertIn('href="/shop" data-warp', body)
        self.assertIn("/static/js/galaxy.js", body)
        self.assertNotIn("/static/js/vendor/three.min.js", body)
        self.assertNotIn("Calibrando telescopio", body)
        self.assertNotIn('data-scene="hub"', body)
        root = Path(__file__).resolve().parents[1]
        css = (root / "app/static/css/galaxy.css").read_text(encoding="utf-8")
        js = (root / "app/static/js/galaxy.js").read_text(encoding="utf-8")
        self.assertIn("warp-flash .95s", css)
        self.assertIn("getContext('2d'", js)
        self.assertIn("warpProgress", js)
        self.assertIn("window.location.assign(href)", js)
        for path, marker in (("/play", "NEXUS RUSH"), ("/play/nexus-rush", "data-game-result")):
            status, _, body = client.call(path)
            self.assertTrue(status.startswith("200"), path)
            self.assertIn(marker, body)
            self.assertIn("/static/css/play.css", body)
            self.assertIn("/static/js/universe-core.js", body)
            self.assertIn("/static/js/play.js", body)

    def test_13_living_galaxy_enhancements(self) -> None:
        status, _, body = Client().call("/")
        self.assertTrue(status.startswith("200"))
        for marker in ('class="galaxy-stage"', 'data-world="shop"', 'data-warp'):
            self.assertIn(marker, body)
        for absent in ('data-camera=', 'explore-object', 'class="skip-link"'):
            self.assertNotIn(absent, body)
        root = Path(__file__).resolve().parents[1]
        css = (root / "app/static/css/galaxy.css").read_text(encoding="utf-8")
        js = (root / "app/static/js/galaxy.js").read_text(encoding="utf-8")
        self.assertIn("cursor:grab", css)
        self.assertIn(".galaxy-stage.is-dragging", css)
        for marker in (
            "spin: 0.00011", "spin: 0.00017", "function makeEvent", "function updateEvents",
            "function drawEvents", "function applyView", "function updateView", "function resetView",
            "function drawPointerAura", "lowPower ? 2 : 5", "addEventListener('pointerdown'",
            "addEventListener('wheel'", "dblclick", "state.spin",
        ):
            self.assertIn(marker, js)
            self.assertNotIn("/static/js/vendor/three.min.js", body)
        enabled = {row["code"] for row in query("SELECT code FROM modules WHERE enabled=1")}
        self.assertEqual(enabled, {"portal", "shop", "play", "whatif"})

    def test_14_deep_camera_stage(self) -> None:
        status, _, body = Client().call("/")
        self.assertTrue(status.startswith("200"))
        self.assertIn("Arrastra y haz zoom para explorar", body)
        root = Path(__file__).resolve().parents[1]
        css = (root / "app/static/css/galaxy.css").read_text(encoding="utf-8")
        js = (root / "app/static/js/galaxy.js").read_text(encoding="utf-8")
        self.assertIn("touch-action:none", css)
        for marker in (
            "var MIN_ZOOM = 0.35;", "var MAX_ZOOM = 7.2;", "function clampCamera",
            "function layerState", "function applyLayer", "function zoomAt",
            "function panBy", "function applyKeys", "function forEachTile",
        ):
            self.assertIn(marker, js)
        self.assertNotIn("/static/js/vendor/three.min.js", body)

    def test_15_alien_ship_secret_stage(self) -> None:
        status, _, body = Client().call("/")
        self.assertTrue(status.startswith("200"))
        self.assertIn('data-secret-note role="status" aria-live="polite" hidden', body)
        self.assertIn("SEÑAL NO CATALOGADA", body)
        root = Path(__file__).resolve().parents[1]
        css = (root / "app/static/css/galaxy.css").read_text(encoding="utf-8")
        js = (root / "app/static/js/galaxy.js").read_text(encoding="utf-8")
        self.assertIn(".galaxy-secret.is-visible", css)
        for marker in (
            "id: 'alien-ship'", "function syncSecretPosition", "function secretScreen",
            "function secretTargetOpacity", "function updateSecrets", "function drawShipSecret",
            "function findSecretHit", "function revealSecret", "revealSecret(findSecretHit(point))",
        ):
            self.assertIn(marker, js)
        self.assertNotIn("/static/js/vendor/three.min.js", body)

    def test_16_universe_marble_and_discoveries_stage(self) -> None:
        status, _, body = Client().call("/")
        self.assertTrue(status.startswith("200"))
        self.assertIn('data-discovery-progress aria-live="polite" hidden', body)
        root = Path(__file__).resolve().parents[1]
        css = (root / "app/static/css/galaxy.css").read_text(encoding="utf-8")
        js = (root / "app/static/js/galaxy.js").read_text(encoding="utf-8")
        self.assertIn("ESFERA PRISMA", js)
        self.assertIn(".galaxy-discoveries", css)
        for marker in (
            "id: 'universe-marble'", "kind: 'marble'", "function drawMarbleSecret",
            "function drawSecrets", "function loadDiscoveries", "function saveDiscoveries",
            "function registerSecret", "function updateDiscoveryProgress", "otraverso.discoveries.v1",
        ):
            self.assertIn(marker, js)
        self.assertNotIn("/static/js/vendor/three.min.js", body)

    def test_17_visual_core_and_star_hunter_stage(self) -> None:
        status, _, body = Client().call("/")
        self.assertTrue(status.startswith("200"))
        root = Path(__file__).resolve().parents[1]
        css = (root / "app/static/css/galaxy.css").read_text(encoding="utf-8")
        js = (root / "app/static/js/galaxy.js").read_text(encoding="utf-8")
        for marker in (
            "/static/brand/otraverso-logo.svg",
            "data-recenter", "VOLVER AL NÚCLEO", "data-hunter-start",
            "data-hunter-panel", "CAZADOR DE ESTRELLAS",
        ):
            self.assertIn(marker, body)
        self.assertEqual(body.count('class="brand-logo'), 1)
        for marker in (".brand-wordmark", ".galaxy-recenter", ".galaxy-game"):
            self.assertIn(marker, css)
        for marker in (
            "function drawCoreRings", "function drawCoreParticles", "function drawCoreWaves",
            "function recenterCamera", "var HUNTER_DURATION = 32000;", "function startHunter",
            "function collectFragment", "function drawHunter", "function hitHunterBeacon",
        ):
            self.assertIn(marker, js)
        self.assertTrue((root / "app/static/brand/otraverso-logo.svg").is_file())
        self.assertTrue((root / "app/static/brand/otraverso-symbol.svg").is_file())

    def test_18_play_foundation_routes(self) -> None:
        client = Client()
        for path in (
            "/play", "/play/hub", "/play/nexus-rush", "/play/games/nexus-rush",
            "/play/gravity", "/play/games/gravity",
        ):
            status, _, body = client.call(path)
            self.assertTrue(status.startswith("200"), path)
            for marker in ("data-game-registry", "data-game-code", "universe-game-index"):
                self.assertIn(marker, body)
            self.assertIn("GRAVITY", body)
        status, _, body = client.call("/play/nexus-rush")
        self.assertIn("NEXUS RUSH", body)
        status, _, body = client.call("/play/gravity")
        self.assertIn("data-gravity-viewport", body)
        self.assertIn("data-gravity-stick", body)

    def test_19_play_catalog_api(self) -> None:
        client = Client()
        status, _, body = client.call("/api/play/v1/games")
        self.assertTrue(status.startswith("200"))
        payload = json.loads(body)
        games = {item["code"]: item for item in payload["games"]}
        self.assertEqual(games["nexus-rush"]["status"], "published")
        self.assertEqual(games["gravity"]["status"], "published")
        self.assertEqual(games["gravity"]["route"], "/play/gravity")

        for code in ("nexus-rush", "gravity"):
            status, _, body = client.call(f"/api/play/v1/games/{code}/manifest")
            self.assertTrue(status.startswith("200"), code)
            manifest = json.loads(body)["manifest"]
            self.assertEqual(manifest["code"], code)
            self.assertEqual(manifest["status"], "published")
            self.assertTrue(manifest["entry"])
            self.assertTrue(manifest["route"])
        manifest = json.loads(client.call("/api/play/v1/games/gravity/manifest")[2])["manifest"]
        self.assertEqual(manifest["entry"], "/static/play/games/gravity/1.0.0/gravity.js")
        self.assertEqual(manifest["css"], ["/static/play/games/gravity/1.0.0/gravity.css"])
        self.assertEqual(manifest["dependencies"], ["/static/js/vendor/three.min.js"])

        for code in (
            "star-hunter", "last-flash", "echo-universe", "pulse-cosmic",
            "labyrinth-dimensional", "orbit-impossible", "fracture-temporal",
        ):
            self.assertEqual(games[code]["status"], "published")
            self.assertEqual(games[code]["route"], f"/play/games/{code}")
            manifest = json.loads(client.call(f"/api/play/v1/games/{code}/manifest")[2])["manifest"]
            self.assertEqual(manifest["entry"], f"/static/play/games/{code}/1.0.0/{code}.js")
            self.assertEqual(manifest["css"], [f"/static/play/games/{code}/1.0.0/{code}.css"])

        status, _, _ = client.call("/api/play/v1/games/unknown/manifest")
        self.assertTrue(status.startswith("404"))

    def test_20_play_game_contract(self) -> None:
        root = Path(__file__).resolve().parents[1]
        core = (root / "app/static/js/universe-core.js").read_text(encoding="utf-8")
        shell = (root / "app/static/js/play.js").read_text(encoding="utf-8")
        game = (root / "app/static/js/nexus-rush.js").read_text(encoding="utf-8")
        for marker in (
            "PLAY: play", "register: registerGame", "function registerGame",
            "activate: activateGame", "unload: unloadGame", "submitResult",
            "cleanupRuntime", "function loadDependencies", "gameCodeFromRoute"
        ):
            self.assertIn(marker, core)
        for marker in ("data-play-game", "data-start-circuit", "otraverso:scene"):
            self.assertIn(marker, shell)
        for marker in (
            "PLAY.register('nexus-rush'", "function pause", "function resume",
            "function restart", "function dispose", "removeEventListener"
        ):
            self.assertIn(marker, game)

    def test_22_gravity_stage(self) -> None:
        client = Client()
        root = Path(__file__).resolve().parents[1]
        status, _, body = client.call("/play/gravity")
        self.assertTrue(status.startswith("200"))
        for marker in (
            "data-gravity-viewport", "data-gravity-level", "data-gravity-score",
            "data-gravity-orbs", "data-gravity-progress", "data-gravity-stick",
            "data-game-result", "/static/play/games/gravity/1.0.0/gravity.js",
            "/static/play/games/gravity/1.0.0/gravity.css",
        ):
            self.assertIn(marker, body)
        js = (root / "app/static/play/games/gravity/1.0.0/gravity.js").read_text(encoding="utf-8")
        css = (root / "app/static/play/games/gravity/1.0.0/gravity.css").read_text(encoding="utf-8")
        for marker in (
            "PLAY.register('gravity'", "new THREE.WebGLRenderer", "function currentGravity",
            "function resolveBox", "function physicsStep", "function finishGame",
            "renderer.dispose", "function dispose"
        ):
            self.assertIn(marker, js)
        for marker in (
            '.universe-stage[data-game-code="gravity"] .gravity-viewport',
            ".gravity-touch-controls", ".gravity-stick__knob"
        ):
            self.assertIn(marker, css)
        for path in (
            "/static/play/games/gravity/1.0.0/gravity.js",
            "/static/play/games/gravity/1.0.0/gravity.css",
            "/static/js/vendor/three.min.js",
        ):
            status, _, _ = client.call(path)
            self.assertTrue(status.startswith("200"), path)

    def test_23_play_hub_progress_and_minigames(self) -> None:
        client = Client()
        status, _, body = client.call("/play")
        self.assertTrue(status.startswith("200"))
        for marker in (
            "data-play-csrf", "data-explore-button", "EXPLORAR UNIVERSO",
            "data-hub-zones", "data-play-profile-toggle", "data-profile-id",
            "data-play-game=\"gravity\"", "/static/play/hub/1.0.0/hub.js",
        ):
            self.assertIn(marker, body)
        status, _, body = client.call("/play/profile")
        self.assertTrue(status.startswith("200"))
        self.assertIn('data-panel="profile"', body)
        self.assertIn("data-play-profile-close", body)
        for code in (
            "star-hunter", "last-flash", "echo-universe", "pulse-cosmic",
            "labyrinth-dimensional", "orbit-impossible", "fracture-temporal",
        ):
            status, _, body = client.call(f"/play/games/{code}")
            self.assertTrue(status.startswith("200"), code)
            for marker in ("data-game-start", "data-game-result", f"/static/play/games/{code}/1.0.0/{code}.js"):
                self.assertIn(marker, body)
        for path in (
            "/static/play/hub/1.0.0/hub.js", "/static/play/hub/1.0.0/hub.css",
            "/static/js/webgl-runtime.js", "/static/js/play-game-kit.js",
            "/static/js/play-progress.js", "/static/js/play-collectibles.js",
            "/static/css/play-progress.css", "/static/brand/play-blackhole.svg",
        ):
            status, _, _ = client.call(path)
            self.assertTrue(status.startswith("200"), path)
        root = Path(__file__).resolve().parents[1]
        core = (root / "app/static/js/universe-core.js").read_text(encoding="utf-8")
        hub = (root / "app/static/play/hub/1.0.0/hub.js").read_text(encoding="utf-8")
        hub_css = (root / "app/static/play/hub/1.0.0/hub.css").read_text(encoding="utf-8")
        self.assertIn("if (doc.readyState === 'complete') boot();", core)
        self.assertIn("else doc.addEventListener('DOMContentLoaded', boot);", core)
        self.assertIn("hub.mount(root, hubContext());", core)
        self.assertIn("O.HUB = {", hub)
        self.assertIn("MODE_EXPLORE", hub)
        runtime = (root / "app/static/js/webgl-runtime.js").read_text(encoding="utf-8")
        gravity = (root / "app/static/play/games/gravity/1.0.0/gravity.js").read_text(encoding="utf-8")
        self.assertIn("OTRAVERSO.GFX", runtime)
        self.assertIn("if (gl) api = 'webgl2';", runtime)
        self.assertIn("probe.limitedInfo = limitedInfo;", runtime)
        self.assertIn("webglcontextlost", runtime)
        self.assertIn("webglcontextrestored", runtime)
        self.assertIn("root.setAttribute('data-gfx-mode', global.OTRAVERSO.GFX.mode())", core)
        self.assertIn("var namespace = global.OTRAVERSO || {};", core)
        self.assertIn("GFX OPTIMIZADO", hub_css)
        self.assertIn("GFX.createRenderer", gravity)
        self.assertIn("gravity-canvas--fallback", gravity)
        status, _, body = client.call("/play/gravity")
        self.assertTrue(status.startswith("200"))
        self.assertIn("/static/js/webgl-runtime.js", body)

        csrf = public_csrf_token()
        player = "PLAY-TEST1234"
        status, _, body = client.call("/api/play/v1/progress/results", "POST", {
            "csrf": csrf, "player_id": player, "game": "star-hunter",
            "score": "1500", "duration_ms": "30000", "stats": "{\"orbs\":3}",
        })
        self.assertTrue(status.startswith("200"), body)
        payload = json.loads(body)
        self.assertEqual(payload["profile"]["player_id"], player)
        self.assertEqual(payload["profile"]["total_score"], 1500)
        self.assertIn("first_game", payload["achievements"])
        self.assertIn("score_1000", payload["achievements"])
        self.assertEqual(payload["results"][0]["game"], "star-hunter")

        status, _, body = client.call("/api/play/v1/progress/collectibles", "POST", {
            "csrf": csrf, "player_id": player, "code": "hub-secret-1", "note": "Primer secreto",
        })
        self.assertTrue(status.startswith("200"), body)
        payload = json.loads(body)
        self.assertTrue(payload["created"])
        self.assertIn("hub-secret-1", payload["collectibles"])

        status, _, body = client.call(f"/api/play/v1/progress?player_id={player}")
        self.assertTrue(status.startswith("200"))
        self.assertEqual(json.loads(body)["profile"]["wins"], 0)

        status, _, _ = client.call("/api/play/v1/progress/results", "POST", {
            "csrf": csrf, "player_id": "invalido", "game": "star-hunter", "score": "1",
        })
        self.assertTrue(status.startswith("400"))
        status, _, _ = client.call("/api/play/v1/progress/results", "POST", {
            "csrf": "invalido", "player_id": player, "game": "star-hunter", "score": "1",
        })
        self.assertTrue(status.startswith("400"))

    def test_21_play_isolation(self) -> None:
        client = Client()
        for path in ("/", "/shop"):
            status, _, body = client.call(path)
            self.assertTrue(status.startswith("200"), path)
            self.assertNotIn("data-game-registry", body)
            self.assertNotIn("universe-game-index", body)
        root = Path(__file__).resolve().parents[1]
        source = (root / "app/modules/play/__init__.py").read_text(encoding="utf-8")
        for forbidden in ("from app.db", "from app.services.catalog", "from app.services.orders"):
            self.assertNotIn(forbidden, source)


    def test_24_multiverso_service_and_navigation(self) -> None:
        from app.services.multiverse import (
            UNIVERSES, UNIVERSE_META, ordered, public_cards, scene_config,
        )

        self.assertEqual([code for code, _ in ordered()], ["shop", "play", "whatif", "labs"])
        self.assertEqual([card["code"] for card in public_cards()], [code for code, _ in ordered()])
        config = {item["id"]: item for item in scene_config()}
        self.assertEqual(set(config), set(UNIVERSES))
        self.assertEqual(config["play"]["planets"][1]["code"], "gravity")
        self.assertIn("planets", UNIVERSE_META["labs"])

        client = Client()
        status, _, body = client.call("/")
        self.assertTrue(status.startswith("200"))
        for marker in (
            "data-multiverse", "data-universe-map", "data-explore-toggle",
            'id="multiverso-config"', 'data-universe-focus="shop"',
            'data-universe-panel="play"', "data-universe-back",
            "data-explore-hud", "data-explore-exit", "data-explore-stick",
            'data-explore-universe="play"', "data-world-route",
            "OTRAVERSO no es una galaxia", "/universos/whatif", "/universos/labs",
        ):
            self.assertIn(marker, body)
        self.assertEqual(body.count("data-universe-focus="), 4)

        status, _, body = client.call("/universos/labs")
        self.assertTrue(status.startswith("200"))
        self.assertIn("PROTOTIPOS", body)
        self.assertIn("en diseño", body)

        root = Path(__file__).resolve().parents[1]
        css = (root / "app/static/css/galaxy.css").read_text(encoding="utf-8")
        js = (root / "app/static/js/galaxy.js").read_text(encoding="utf-8")
        for marker in (
            "touch-action:pan-y", ".galaxy-stage.is-exploring", ".galaxy-focus",
            ".universe-planet", ".multiverse-guide", ".galaxy-stage.is-free-exploring",
            ".galaxy-explore-hud", ".galaxy-focus__explore", "body.is-exploring-universe",
            ".universe-planet.is-selected",
        ):
            self.assertIn(marker, css)
        for marker in (
            "function focusUniverse(id)", "function backToMultiverse()",
            "function setExploreMode(enabled)", "function setNavMode(mode)",
            "function startFreeExploration(id)", "function exitFreeExploration()",
            "function selectWorld(link, worldId)", "function drawBlackHoles()",
            "function applyBlackHoleGravity(delta)",
            "function drawUniverseField(world, state, highlighted)",
            "function drawPlayCivilization(x, y, r, state, highlighted)", "function updateLod()",
            "stage.setAttribute('data-lod', lod)", "OTRAVERSO.GALAXY_NAV",
            "if (navMode !== 'explore' && !exploreMode && !event.ctrlKey && !event.metaKey) return;",
            "if (event.pointerType === 'touch' && !exploreMode && navMode !== 'explore') return;",
        ):
            self.assertIn(marker, js)
        self.assertNotIn("setExploreMode(true);", js)


    def test_25_multiverso_navigation_modes_and_world_routes(self) -> None:
        root = Path(__file__).resolve().parents[1]
        js = (root / "app/static/js/galaxy.js").read_text(encoding="utf-8")
        for event_type in (
            "black-hole", "meteor-storm", "nebula-bloom", "alien-fleet",
            "distress-signal", "supernova", "wormhole", "mega-structure",
        ):
            self.assertIn("type: '" + event_type + "'", js)
        self.assertIn("blackHoles = [", js)
        self.assertIn("data-nav-mode", js)
        self.assertIn("keys.forward", js)
        self.assertIn("freeStick.active", js)
        self.assertIn("view.vrot", js)

        client = Client()
        for path in ("/play/gravity", "/play/nexus-rush", "/play/games/star-hunter"):
            status, _, body = client.call(path)
            self.assertTrue(status.startswith("200"), path)
            self.assertIn("REGRESAR A PLAY", body)
        status, _, body = client.call("/play")
        self.assertTrue(status.startswith("200"))
        self.assertIn('data-explore-button', body)

        for name in ("game-shell.html", "game-gravity.html", "game-nexus.html"):
            source = (root / "app/templates/play" / name).read_text(encoding="utf-8")
            self.assertIn("REGRESAR A PLAY", source)
            self.assertIn('href="/play"', source)
            self.assertIn("data-warp", source)


    def test_26_navigation_contract(self) -> None:
        root = Path(__file__).resolve().parents[1]
        galaxy = (root / "app/static/js/galaxy.js").read_text(encoding="utf-8")
        core = (root / "app/static/js/universe-core.js").read_text(encoding="utf-8")
        for marker in (
            "var NAV_CONTRACT = 'navigation-1';",
            "var NAV_STATES = ['multiverse', 'universe', 'explore'];",
            "var NAV_EVENT = 'otraverso:navigation';",
            "window.dispatchEvent(new window.CustomEvent(NAV_EVENT",
            "stage.setAttribute('data-nav-state', navMode);",
            "contract: 'navigation-1',",
            "runtime: 'galaxy',",
            "states: NAV_STATES.slice(),",
            "event: NAV_EVENT,",
            "window.OTRAVERSO.NAVIGATION = {",
        ):
            self.assertIn(marker, galaxy)
        for marker in (
            "var NAV_CONTRACT = 'navigation-1';",
            "var NAV_STATES = ['hub', 'play', 'game'];",
            "var NAV_EVENT = 'otraverso:navigation';",
            "root.setAttribute('data-nav-state', name);",
            "global.dispatchEvent(new global.CustomEvent(NAV_EVENT",
            "NAVIGATION: navigation,",
            "getState: navigationState",
        ):
            self.assertIn(marker, core)
        self.assertIn("detail: { scene: name, options: options }", core)

        adr = (root / "docs/adr/0001-navegacion.md").read_text(encoding="utf-8")
        architecture = (root / "docs/ARQUITECTURA.md").read_text(encoding="utf-8")
        for marker in ("OTRAVERSO.NAVIGATION", "otraverso:navigation", "history.pushState"):
            self.assertIn(marker, adr)
        self.assertIn("Evento público `otraverso:navigation`", architecture)


    def test_27_play_load_recovery(self) -> None:
        root = Path(__file__).resolve().parents[1]
        core = (root / "app/static/js/universe-core.js").read_text(encoding="utf-8")
        for marker in (
            "var NETWORK_TIMEOUT = 8000;",
            "function validateManifest(manifest, code)",
            "function withTimeout(promise, message)",
            "function removeRuntimeNode(node, code, src)",
            "removeRuntimeNode(script, code, src);",
            "delete loadPromises[code];",
            "retry || function () { return loadGame(code); }",
            "function () { return activateGame(code, options); }",
            "function () { return ensureGame(); }",
        ):
            self.assertIn(marker, core)


class WhatIfTests(unittest.TestCase):
    API = "/api/what-if/v1"

    @classmethod
    def setUpClass(cls) -> None:
        init_db()
        cls.client = Client()
        status, _, body = cls.client.call(cls.API + "/guest")
        cls.guest = json.loads(body)["token"]
        cls.reality_id = 0
        cls.chapter_id = 0
        cls.intervention_id = 0
        cls.timeline_id = 0
        cls.other_timeline_id = 0
        cls.asset_id = 0

    def api(self, path: str, form: dict | None = None, method: str = "GET") -> tuple[str, dict]:
        params = dict(form or {})
        if method == "POST":
            params["csrf"] = public_csrf_token()
            params["guest"] = self.guest
            status, _, body = self.client.call(self.API + path, method, params)
        else:
            params.update(form or {})
            params["guest"] = self.guest
            separator = "&" if "?" in path else "?"
            status, _, body = self.client.call(self.API + path + separator + urllib.parse.urlencode(params))
        return status, json.loads(body)

    def test_01_public_pages_and_guest(self) -> None:
        for path in ("/what-if", "/what-if/crear", "/what-if/explorar", "/what-if/biblioteca"):
            status, _, body = Client().call(path)
            self.assertTrue(status.startswith("200"), path)
            self.assertIn("/static/whatif/1.0.2/whatif.js", body)
        script = (Path(__file__).resolve().parents[1] / "app/static/whatif/1.0.2/whatif.js").read_text(encoding="utf-8")
        self.assertIn("if (verb === 'POST' && csrfToken) params.set('csrf', csrfToken);", script)
        self.assertIn("data-wi-status", (Path(__file__).resolve().parents[1] / "app/templates/whatif/create.html").read_text(encoding="utf-8"))
        status, data = self.api("/config")
        self.assertTrue(status.startswith("200"))
        self.assertTrue(data["ok"])
        self.assertTrue(data["csrf"])
        self.assertEqual(data["ai"]["text_provider"], "local")

    def test_01b_api_errors_are_json(self) -> None:
        status, _, body = Client().call(
            self.API + "/proposals", "POST",
            {"csrf": "token-invalido", "guest": self.guest,
             "idea": "¿Qué pasaría si la ciudad se quedara sin electricidad durante un año?"},
        )
        self.assertTrue(status.startswith("400"))
        data = json.loads(body)
        self.assertFalse(data["ok"])
        self.assertIn("Token de seguridad", data["error"])

    def test_02_create_reality_from_proposal(self) -> None:
        status, data = self.api("/proposals", {
            "idea": "¿Qué pasaría si la ciudad se quedara sin electricidad durante un año?",
            "genre": "distopia", "style": "cinematografico", "depth": "historia",
            "format": "automatico", "idempotency_key": "qa-proposal",
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        proposal = data["proposal"]
        self.assertTrue(proposal["title"])
        self.assertTrue(proposal["rules"])
        status, data = self.api("/realities", {
            "title": proposal["title"], "premise": proposal["premise"],
            "description": proposal["description"], "genre": proposal["genre"],
            "style": proposal["style"], "depth": proposal["depth"], "format": proposal["format"],
            "first_scene": proposal["first_scene"], "rules": json.dumps(proposal["rules"]),
            "characters": json.dumps(proposal["characters"]),
            "locations": json.dumps(proposal["locations"]),
            "idempotency_key": "qa-reality",
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        self.reality_id = data["reality"]["id"]
        self.__class__.reality_id = self.reality_id
        self.assertTrue(data["chapters"])
        self.assertTrue(data["characters"])
        self.assertTrue(data["rules"])

    def test_03_chapter_versions_and_continuity(self) -> None:
        self.assertTrue(self.reality_id)
        state = self.api(f"/realities/{self.reality_id}")[1]
        self.chapter_id = state["chapter"]["id"]
        self.__class__.chapter_id = self.chapter_id
        self.assertTrue(state["memories"]["current"])
        status, data = self.api(f"/realities/{self.reality_id}/chapter", {
            "timeline": state["timeline_id"], "idempotency_key": "qa-chapter",
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        self.assertEqual(data["chapter"]["number"], 2)
        status, data = self.api(f"/realities/{self.reality_id}/chapter/{self.chapter_id}/versions")
        self.assertTrue(status.startswith("200"))
        self.assertTrue(data["versions"])

    def test_04_interventions_branches_and_comparison(self) -> None:
        self.assertTrue(self.reality_id)
        root_id = self.api(f"/realities/{self.reality_id}")[1]["timeline_id"]
        self.__class__.timeline_id = root_id
        status, data = self.api(f"/realities/{self.reality_id}/interventions", {
            "text": "Que la protagonista descubra una emisora clandestina.",
            "timeline": root_id, "idempotency_key": "qa-intervention",
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        self.intervention_id = data["intervention_id"]
        self.__class__.intervention_id = self.intervention_id
        self.assertTrue(data["proposal"])
        status, data = self.api(f"/realities/{self.reality_id}/interventions/{self.intervention_id}/apply", {
            "idempotency_key": "qa-apply",
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        self.assertTrue(data["applied"])
        status, data = self.api(f"/realities/{self.reality_id}/timelines", {
            "name": "Línea de la emisora", "divergence": "La emisora clandestina transmite",
            "timeline": root_id, "idempotency_key": "qa-branch",
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        self.other_timeline_id = data["timeline_id"]
        self.__class__.other_timeline_id = self.other_timeline_id
        status, data = self.api(f"/realities/{self.reality_id}/timelines/{self.other_timeline_id}/compare", {"other": root_id}, "GET")
        self.assertTrue(status.startswith("200"), data)
        self.assertIn("differences", data)

    def test_05_assets_pages_and_ownership(self) -> None:
        self.assertTrue(self.reality_id)
        status, data = self.api(f"/realities/{self.reality_id}/assets", {"kind": "map"}, "POST")
        self.assertTrue(status.startswith("200"), data)
        self.asset_id = data["asset_id"]
        status, _, body = Client().call(f"{self.API}/assets/{self.asset_id}?guest={self.guest}")
        self.assertTrue(status.startswith("200"))
        self.assertIn("<svg", body)
        other = Client()
        _, _, body = other.call(self.API + "/guest")
        other_guest = json.loads(body)["token"]
        status, _ = self.api(f"/realities/{self.reality_id}")
        self.assertTrue(status.startswith("200"))
        status, _, body = other.call(f"{self.API}/realities/{self.reality_id}?guest={other_guest}")
        self.assertTrue(status.startswith("404"))
        status, _, body = Client().call(f"/what-if/espacio/{self.reality_id}")
        self.assertTrue(status.startswith("200"))
        self.assertIn("data-wi-room", body)
        status, _, body = Client().call(f"/what-if/studio/{self.reality_id}")
        self.assertTrue(status.startswith("200"))
        self.assertIn("data-wi-studio", body)

    def test_06_admin_controls(self) -> None:
        admin = Client()
        self.assertTrue(admin.login())
        status, _, body = admin.call("/admin/what-if")
        self.assertTrue(status.startswith("200"))
        self.assertIn("Configuración de motores", body)
        status, _, _ = admin.call("/admin/what-if/settings", "POST", {
            "csrf": admin.csrf, "enabled": "1", "text_provider": "local",
            "text_model": "", "text_api_url": "", "image_provider": "schematic",
            "image_model": "", "image_api_url": "", "timeout_seconds": "20",
            "max_retries": "1", "max_requests_hour": "40", "max_chapter_chars": "9000",
            "max_idea_chars": "1200", "context_chapters": "6", "moderation": "1",
            "generate_images": "0", "default_genre": "personalizado",
            "narrative_instructions": "",
        })
        self.assertTrue(status.startswith("303"))


class WhatIfEvolutionTests(unittest.TestCase):
    API = "/api/what-if/v1"

    @classmethod
    def setUpClass(cls) -> None:
        init_db()
        cls.client = Client()

    def setUp(self) -> None:
        status, _, body = self.client.call(self.API + "/guest")
        self.assertTrue(status.startswith("200"))
        self.guest = json.loads(body)["token"]

    def api(self, path: str, form: dict | None = None, method: str = "GET") -> tuple[str, dict]:
        params = dict(form or {})
        if method == "POST":
            params["csrf"] = public_csrf_token()
            params["guest"] = self.guest
            status, _, body = self.client.call(self.API + path, method, params)
        else:
            params.update(form or {})
            params["guest"] = self.guest
            separator = "&" if "?" in path else "?"
            status, _, body = self.client.call(self.API + path + separator + urllib.parse.urlencode(params))
        return status, json.loads(body)

    def _key(self, label: str) -> str:
        return f"evo-{self._testMethodName}-{label}-{uuid.uuid4().hex[:8]}"

    def _create_reality(self, idea: str, **config: object) -> int:
        form = {
            "idea": idea,
            "genre": "distopia",
            "style": "cinematografico",
            "depth": "historia",
            "format": "automatico",
            "idempotency_key": self._key("proposal"),
        }
        form.update({key: str(value) for key, value in config.items()})
        status, data = self.api("/proposals", form, "POST")
        self.assertTrue(status.startswith("200"), data)
        proposal = data["proposal"]
        payload = {
            "title": proposal.get("title") or idea[:60],
            "premise": proposal.get("premise") or idea,
            "description": proposal.get("description") or "",
            "genre": proposal.get("genre") or "distopia",
            "style": proposal.get("style") or "cinematografico",
            "depth": proposal.get("depth") or "historia",
            "format": proposal.get("format") or "automatico",
            "first_scene": proposal.get("first_scene") or "",
            "rules": json.dumps(proposal.get("rules") or []),
            "characters": json.dumps(proposal.get("characters") or []),
            "locations": json.dumps(proposal.get("locations") or []),
            "idempotency_key": self._key("reality"),
        }
        payload.update({key: str(value) for key, value in config.items()})
        status, data = self.api("/realities", payload, "POST")
        self.assertTrue(status.startswith("200"), data)
        return int(data["reality"]["id"])

    def _state(self, reality_id: int) -> dict:
        status, data = self.api(f"/realities/{reality_id}")
        self.assertTrue(status.startswith("200"), data)
        return data

    def _normalize(self, value: object) -> str:
        text = re.sub(r"<[^>]+>", " ", str(value if value is not None else ""))
        return re.sub(r"\s+", " ", text).strip().lower()

    def _paragraphs(self, content: str) -> list[str]:
        result = []
        for part in re.split(r"\n\s*\n", content or ""):
            text = self._normalize(part)
            if text:
                result.append(text)
        return result

    def _assert_long_chapter(self, chapter: dict) -> None:
        content = chapter.get("content") or ""
        self.assertGreaterEqual(len(content.split()), 800)
        paragraphs = self._paragraphs(content)
        self.assertGreaterEqual(len(paragraphs), 3)
        self.assertEqual(len(paragraphs), len(set(paragraphs)))

    def _memory_cards(self, state: dict) -> dict:
        cards = state.get("memory_cards") or {}
        if isinstance(cards, list):
            grouped: dict[str, list] = {}
            for card in cards:
                if isinstance(card, dict):
                    grouped.setdefault(str(card.get("kind") or ""), []).append(card)
            return grouped
        return cards if isinstance(cards, dict) else {}

    def _card_entries(self, state: dict) -> list[dict]:
        return [card for group in self._memory_cards(state).values() if isinstance(group, list)
                for card in group if isinstance(card, dict)]

    def _cards_text(self, state: dict) -> str:
        return " ".join(self._normalize(card.get("content")) for card in self._card_entries(state))

    def _events_text(self, state: dict) -> str:
        events = state.get("events") or []
        return " ".join(
            self._normalize(" ".join(str(event.get(key) or "") for key in ("title", "description", "consequences")))
            for event in events if isinstance(event, dict)
        )

    def _mode_codes(self, state: dict) -> set[str]:
        modes = state.get("modes") or []
        codes: set[str] = set()
        if isinstance(modes, dict):
            sources = modes.values()
            codes.update(str(key).lower() for key in modes)
        elif isinstance(modes, list):
            sources = modes
        else:
            sources = []
        for item in sources:
            if isinstance(item, dict):
                for key in ("code", "mode", "type", "name", "kind"):
                    value = item.get(key)
                    if value:
                        codes.add(str(value).lower())
            elif item:
                codes.add(str(item).lower())
        return codes

    def _assert_mode(self, state: dict, name: str) -> None:
        codes = self._mode_codes(state)
        aliases = {"apocalypse": {"apocalypse", "apocalipsis"},
                   "crazy": {"crazy", "locura"}}.get(name, {name})
        self.assertTrue(codes & aliases, f"modes={sorted(codes)}")

    def _config(self, state: dict) -> dict:
        value = state.get("narrative_config")
        if isinstance(value, dict):
            return value
        reality = state.get("reality")
        if isinstance(reality, dict) and isinstance(reality.get("narrative_config"), dict):
            return reality["narrative_config"]
        return {}

    def _as_int(self, value: object, default: int = 0) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    def _job_blocks(self, job) -> list:
        if isinstance(job, dict):
            payload = job.get("result")
        else:
            try:
                payload = json.loads((job["result"] if job else "") or "{}")
            except (ValueError, TypeError, KeyError):
                return []
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except (ValueError, TypeError):
                return []
        if isinstance(payload, list):
            return payload
        if not isinstance(payload, dict):
            return []
        for key in ("blocks", "partial_blocks", "partial", "chunks", "segments",
                    "content_blocks", "paragraphs", "block"):
            value = payload.get(key)
            if isinstance(value, list) and value:
                return value
            if isinstance(value, str) and value.strip():
                return [value]
        content = payload.get("content")
        if isinstance(content, str) and content.strip():
            return [content]
        return []

    def test_01_normal_long_chapter_and_continuity(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si la memoria colectiva de una ciudad se reescribiera cada noche?",
            chapter_length="cinematografico",
        )
        state = self._state(reality_id)
        first = state.get("chapter") or {}
        self.assertTrue(first)
        self._assert_long_chapter(first)
        status, data = self.api(f"/realities/{reality_id}/chapter", {
            "timeline": state["timeline_id"], "idempotency_key": self._key("chapter-2"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        second = data["chapter"]
        self._assert_long_chapter(second)
        haystack = self._normalize(second.get("content"))
        candidates = [first.get("summary")]
        for event in (state.get("events") or [])[:3]:
            if isinstance(event, dict):
                candidates.extend((event.get("description"), event.get("consequences")))
        needles = []
        for candidate in candidates:
            text = self._normalize(candidate)
            if len(text) >= 25:
                needles.append(text[:80])
        self.assertTrue(any(needle in haystack for needle in needles), haystack[:500])

    def test_02_random_ideas_variety(self) -> None:
        status, data = self.api("/ideas", {
            "count": "6", "genre": "", "mode": "", "variation": "2",
            "idempotency_key": self._key("ideas-1"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        self.assertTrue(data.get("ok"))
        self.assertTrue(data.get("provider"))
        self.assertTrue(data.get("model"))
        ideas = data.get("ideas") or []
        self.assertGreaterEqual(len(ideas), 4)
        self.assertGreaterEqual(self._as_int(data.get("count")), 4)
        required = ("title", "premise", "genre", "context", "conflict",
                    "unexpected_element", "direction", "tags", "image_suggestion")
        for idea in ideas:
            for field in required:
                self.assertIn(field, idea)
        titles = [self._normalize(idea.get("title")) for idea in ideas]
        premises = [self._normalize(idea.get("premise")) for idea in ideas]
        self.assertEqual(len(set(titles)), len(titles))
        self.assertEqual(len(set(premises)), len(premises))
        self.assertGreaterEqual(len({idea.get("genre") for idea in ideas}), 2)

        excluded = [idea.get("title") for idea in ideas if idea.get("title")]
        status, data = self.api("/ideas", {
            "count": "6", "exclude": json.dumps(excluded),
            "idempotency_key": self._key("ideas-2"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        more_ideas = data.get("ideas") or []
        self.assertGreaterEqual(len(more_ideas), 4)
        more_titles = [self._normalize(idea.get("title")) for idea in more_ideas]
        more_premises = [self._normalize(idea.get("premise")) for idea in more_ideas]
        self.assertFalse(set(more_titles) & {self._normalize(title) for title in excluded})
        self.assertEqual(len(set(more_titles)), len(more_titles))
        all_titles = titles + more_titles
        all_premises = premises + more_premises
        self.assertEqual(len(set(all_titles)), len(all_titles))
        self.assertEqual(len(set(all_premises)), len(all_premises))
        self.assertGreaterEqual(len({idea.get("genre") for idea in ideas + more_ideas}), 2)

    def test_03_apocalypse_irreversible(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si el colapso climático hiciera irreversible la caída de las ciudades costeras?",
            apocalypse="1", apocalypse_level="acelerado", surprise_frequency="80",
        )
        state = self._state(reality_id)
        timeline_id = state["timeline_id"]
        for index in range(2):
            status, data = self.api(f"/realities/{reality_id}/chapter", {
                "timeline": timeline_id, "idempotency_key": self._key(f"chapter-{index}"),
            }, "POST")
            self.assertTrue(status.startswith("200"), data)
        state = self._state(reality_id)
        self._assert_mode(state, "apocalypse")
        config = self._config(state)
        self.assertEqual(self._as_int(config.get("apocalypse")), 1)
        self.assertEqual(config.get("apocalypse_level"), "acelerado")
        kinds = {str(card.get("kind") or "") for card in self._card_entries(state)}
        evidence = self._cards_text(state) + " " + self._events_text(state)
        self.assertTrue(kinds & {"destruction", "destruccion", "death", "muerte",
                                 "consequence", "consecuencia"}
                        or any(word in evidence for word in ("destrucc", "muerte", "death",
                                                             "colapso", "apocalipsis", "consecuencia")))
        chapters = state.get("chapters") or []
        self.assertGreaterEqual(len(chapters), 3)
        forbidden = ("resucitó", "resucito", "revivió", "revivio", "volvió a la vida",
                     "volvio a la vida", "se deshizo el apocalipsis", "revirtió la destrucción",
                     "revirtio la destruccion")
        for chapter in chapters[1:]:
            content = self._normalize(chapter.get("content"))
            for marker in forbidden:
                self.assertNotIn(marker, content)

    def test_04_crazy_level_4(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si las leyes de la física se volvieran negociables en una pequeña ciudad?",
            crazy="1", crazy_level="4", surprise_frequency="100",
        )
        state = self._state(reality_id)
        status, data = self.api(f"/realities/{reality_id}/chapter", {
            "timeline": state["timeline_id"], "idempotency_key": self._key("chapter"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        state = self._state(reality_id)
        config = self._config(state)
        self.assertEqual(self._as_int(config.get("crazy")), 1)
        self.assertEqual(self._as_int(config.get("crazy_level")), 4)
        self._assert_mode(state, "crazy")
        kinds = {str(card.get("kind") or "") for card in self._card_entries(state)}
        self.assertIn("rule_change", kinds)
        text = self._cards_text(state) + " " + self._events_text(state)
        markers = ("imposible", "impossible", "extraordinario", "extraordinary", "anómalo",
                   "anomalo", "paradoja", "irreal", "inexplicable", "absurdo", "absurda",
                   "muta", "flot", "telepat", "lógica distinta", "logica distinta")
        self.assertTrue(any(marker in text for marker in markers), text[:500])

    def test_05_combined_modes(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si un apocalipsis absurdo reescribiera las reglas del mundo cada amanecer?",
            apocalypse="1", apocalypse_level="caos-absoluto", crazy="1", crazy_level="4",
        )
        status, data = self.api(f"/realities/{reality_id}/modes", {
            "apocalypse": "1", "apocalypse_level": "caos-absoluto",
            "crazy": "1", "crazy_level": "4", "idempotency_key": self._key("modes"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        state = self._state(reality_id)
        timeline_id = state["timeline_id"]
        for index in range(2):
            status, data = self.api(f"/realities/{reality_id}/chapter", {
                "timeline": timeline_id, "idempotency_key": self._key(f"chapter-{index}"),
            }, "POST")
            self.assertTrue(status.startswith("200"), data)
        state = self._state(reality_id)
        self._assert_mode(state, "apocalypse")
        self._assert_mode(state, "crazy")
        config = self._config(state)
        self.assertEqual(self._as_int(config.get("apocalypse")), 1)
        self.assertEqual(self._as_int(config.get("crazy_level")), 4)
        kinds = {str(card.get("kind") or "") for card in self._card_entries(state)}
        text = self._cards_text(state) + " " + self._events_text(state)
        apocalypse_markers = ("apocalipsis", "apocalypse", "destrucc", "colapso", "muerte",
                              "death", "fin del mundo", "irreversible")
        crazy_markers = ("rule_change", "imposible", "impossible", "paradoja", "anómalo",
                         "anomalo", "extraordinario", "irreal", "inexplicable", "absurdo",
                         "absurda", "lógica distinta", "logica distinta")
        self.assertTrue(any(marker in text for marker in apocalypse_markers), text[:500])
        self.assertTrue(any(marker in text for marker in crazy_markers), text[:500])
        self.assertTrue(kinds & {"destruction", "destruccion", "death", "muerte",
                                 "consequence", "consecuencia", "apocalypse"}
                        or any(marker in text for marker in apocalypse_markers))
        self.assertTrue("rule_change" in kinds
                        or any(marker in text for marker in crazy_markers))

    def test_06_intervention_memory(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si una emisora clandestina pudiera cambiar el rumbo de una ciudad?",
        )
        state = self._state(reality_id)
        chapter = state.get("chapter") or {}
        self.assertTrue(chapter)
        original = one("SELECT content FROM whatif_chapters WHERE id=?", (chapter["id"],))["content"]
        status, data = self.api(f"/realities/{reality_id}/interventions", {
            "text": "Que la protagonista descubra una emisora clandestina y cambie las reglas del mundo.",
            "timeline": state["timeline_id"], "idempotency_key": self._key("propose"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        intervention_id = data["intervention_id"]
        status, data = self.api(f"/realities/{reality_id}/interventions/{intervention_id}/apply", {
            "idempotency_key": self._key("apply"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        state = self._state(reality_id)
        kinds = {str(card.get("kind") or "") for card in self._card_entries(state)}
        self.assertIn("intervention", kinds)
        self.assertIn("consequence", kinds)
        self.assertEqual(one("SELECT content FROM whatif_chapters WHERE id=?", (chapter["id"],))["content"], original)

    def test_07_branch_preserves_original(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si una decisión imposible abriera una línea temporal separada?",
        )
        state = self._state(reality_id)
        root_timeline_id = state["timeline_id"]
        before = one("SELECT COUNT(*) AS total FROM whatif_chapters WHERE timeline_id=?",
                     (root_timeline_id,))["total"]
        status, data = self.api(f"/realities/{reality_id}/interventions", {
            "text": "Que la protagonista nunca hubiera encontrado la emisora clandestina.",
            "timeline": root_timeline_id, "idempotency_key": self._key("propose"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        intervention_id = data["intervention_id"]
        status, data = self.api(f"/realities/{reality_id}/interventions/{intervention_id}/apply", {
            "branch": "1", "idempotency_key": self._key("apply"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        new_timeline_id = int(data.get("timeline_id") or 0)
        self.assertNotEqual(new_timeline_id, root_timeline_id)
        after = one("SELECT COUNT(*) AS total FROM whatif_chapters WHERE timeline_id=?",
                    (root_timeline_id,))["total"]
        self.assertEqual(after, before)
        branch_cards = query(
            "SELECT id FROM whatif_memory_cards WHERE timeline_id=? AND kind='branch'",
            (new_timeline_id,),
        )
        self.assertTrue(branch_cards)
        state = self._state(reality_id)
        self.assertIn("branch", self._memory_cards(state))

    def test_08_block_generation_no_duplicates(self) -> None:
        previous = one("SELECT value FROM settings WHERE category='whatif' AND key='generation_blocks'")
        set_setting("whatif", "generation_blocks", "3")
        if previous:
            self.addCleanup(set_setting, "whatif", "generation_blocks", previous["value"])
        else:
            self.addCleanup(execute, "DELETE FROM settings WHERE category='whatif' AND key='generation_blocks'")
        reality_id = self._create_reality(
            "¿Qué pasaría si tres bloques de memoria narrativa coincidieran en un mismo instante?",
        )
        state = self._state(reality_id)
        status, data = self.api(f"/realities/{reality_id}/chapter", {
            "timeline": state["timeline_id"], "idempotency_key": self._key("chapter"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        paragraphs = self._paragraphs(data["chapter"]["content"])
        self.assertGreaterEqual(len(paragraphs), 3)
        self.assertEqual(len(paragraphs), len(set(paragraphs)))

    def test_09_recovery_keeps_partial_blocks(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si una generación interrumpida conservara sus bloques ya escritos?",
            chapter_length="cinematografico",
        )
        state = self._state(reality_id)
        timeline_id = state["timeline_id"]
        owner = {"type": "guest", "key": engine.parse_guest_token(self.guest)}
        self.assertTrue(owner["key"])
        before = one("SELECT COUNT(*) AS total FROM whatif_chapters WHERE timeline_id=?",
                     (timeline_id,))["total"]
        key = self._key("recovery")
        original = provider.TextProvider
        calls = {"count": 0}

        class FailingTextProvider(original):
            def generate(self, payload: dict, local_builder):
                calls["count"] += 1
                if calls["count"] == 2:
                    raise provider.ProviderError("Fallo controlado en el segundo bloque.")
                return super().generate(payload, local_builder)

        with patch.object(provider, "TextProvider", FailingTextProvider):
            with self.assertRaises((HTTPError, provider.ProviderError)):
                engine.generate_chapter(owner, reality_id, timeline_id, idempotency_key=key)
        self.assertGreaterEqual(calls["count"], 2)
        job = one("SELECT * FROM whatif_generation_jobs WHERE idempotency_key=?", (key,))
        self.assertIsNotNone(job)
        self.assertEqual(job["status"], "error")
        self.assertGreaterEqual(len(self._job_blocks(job)), 1)
        status, payload = self.api(f"/jobs/{job['id']}")
        self.assertTrue(status.startswith("200"), payload)
        job_payload = payload.get("job") if isinstance(payload.get("job"), dict) else payload
        self.assertEqual(job_payload.get("status"), "error")
        self.assertIn("progress", job_payload)
        self.assertGreaterEqual(len(self._job_blocks(job_payload)), 1)
        self.assertEqual(one("SELECT COUNT(*) AS total FROM whatif_chapters WHERE timeline_id=?",
                             (timeline_id,))["total"], before)
        result = engine.generate_chapter(owner, reality_id, timeline_id, idempotency_key=key)
        self.assertTrue(result.get("chapter"))
        job = one("SELECT * FROM whatif_generation_jobs WHERE idempotency_key=?", (key,))
        self.assertEqual(job["status"], "done")
        self.assertEqual(one("SELECT COUNT(*) AS total FROM whatif_chapters WHERE timeline_id=?",
                             (timeline_id,))["total"], before + 1)

    def test_10_admin_settings_persist(self) -> None:
        admin = Client()
        self.assertTrue(admin.login())
        original = settings_group("whatif")
        for key, value in original.items():
            self.addCleanup(set_setting, "whatif", key, value)
        new_values = {
            "ideas_enabled": "1",
            "apocalypse_enabled": "1",
            "crazy_enabled": "1",
            "chapter_normal_words": "900",
            "chapter_extended_words": "1200",
            "chapter_cinematic_words": "1600",
            "max_chapter_words": "2000",
            "generation_blocks": "4",
            "surprise_frequency": "75",
            "randomness_level": "3",
            "available_genres": "ciencia-ficcion, distopia, fantasia",
            "available_styles": "cinematografico, realista",
            "memory_cards_limit": "40",
            "default_point_of_view": "tercera-persona",
            "default_ending": "reconstruccion",
            "initial_characters": "4",
        }
        for key in new_values:
            if key not in original:
                self.addCleanup(execute, "DELETE FROM settings WHERE category='whatif' AND key=?", (key,))
        form = {
            "csrf": admin.csrf, "enabled": "1", "text_provider": "local", "text_model": "",
            "text_api_url": "", "image_provider": "schematic", "image_model": "",
            "image_api_url": "", "timeout_seconds": "20", "max_retries": "1",
            "max_requests_hour": "40", "max_chapter_chars": "9000", "max_idea_chars": "1200",
            "context_chapters": "6", "moderation": "1", "generate_images": "0",
            "default_genre": "personalizado", "narrative_instructions": "",
        }
        form.update(new_values)
        status, _, _ = admin.call("/admin/what-if/settings", "POST", form)
        self.assertTrue(status.startswith("303"))
        init_db()
        saved = settings_group("whatif")
        for key, value in new_values.items():
            self.assertEqual(saved.get(key), value)
        self.assertEqual(get_setting("whatif", "ideas_enabled"), "1")
        self.assertEqual(get_setting("whatif", "generation_blocks"), "4")
        status, data = self.api("/config")
        self.assertTrue(status.startswith("200"), data)
        ai = data.get("ai") or {}
        for flag in ("ideas_enabled", "apocalypse_enabled", "crazy_enabled"):
            self.assertTrue(ai.get(flag), ai)


class PageManagementTests(unittest.TestCase):
    API = "/api/what-if/v1"

    @classmethod
    def setUpClass(cls) -> None:
        init_db()

    def setUp(self) -> None:
        self.admin = Client()
        self.assertTrue(self.admin.login())
        self.row = one("SELECT * FROM site_pages WHERE code='whatif'")

    def tearDown(self) -> None:
        execute(
            "UPDATE site_pages SET name='WHAT IF', description=?, route='/what-if', "
            "universe='OTRAVERSO WHAT IF', category='Universo', status='available', icon='', image='', "
            "coming_soon_message=?, sort_order=2, nav_visible=1 WHERE code='whatif'",
            ("Realidades narrativas persistentes de OTRAVERSO WHAT IF.",
             "WHAT IF estará disponible próximamente. Puedes explorar la página, pero aún no se pueden crear realidades."),
        )

    def form(self, **changes) -> dict:
        values = {
            "csrf": self.admin.csrf, "name": "WHAT IF", "route": "/what-if",
            "universe": "OTRAVERSO WHAT IF", "category": "Universo", "status": "available",
            "icon": "", "image": "", "description": "Realidades narrativas persistentes.",
            "coming_soon_message": "Mensaje controlado de próximamente.",
            "sort_order": "2", "nav_visible": "1",
        }
        values.update(changes)
        return values

    def test_01_seed_and_admin_ui(self) -> None:
        rows = {(row["code"], row["route"], row["status"]) for row in query(
            "SELECT code, route, status FROM site_pages")}
        self.assertTrue({("portal", "/", "available"), ("shop", "/shop", "available"),
                         ("whatif", "/what-if", "available"), ("play", "/play", "available")} <= rows)
        self.assertTrue({("play_home", "/play", "available"), ("play_hub", "/play/hub", "available"),
                         ("play_catalog", "/play#catalogo", "available"),
                         ("play_game_gravity", "/play/gravity", "available"),
                         ("play_game_star_hunter", "/play/games/star-hunter", "available"),
                         ("play_game_lost_worlds", "", "coming_soon"),
                         ("play_game_neural", "", "coming_soon")} <= rows)
        self.assertEqual(one("PRAGMA user_version")[0], 8)
        status, _, body = self.admin.call("/admin/pages")
        self.assertTrue(status.startswith("200"))
        self.assertIn("Disponibilidad de páginas", body)
        self.assertIn("/what-if", body)
        self.assertIn("HUB de PLAY", body)
        self.assertIn("LOST WORLDS", body)
        status, _, body = self.admin.call(f"/admin/pages/{self.row['id']}/edit")
        self.assertTrue(status.startswith("200"))
        self.assertIn("Mensaje heredado de próximamente", body)
        status, _, _ = Client().call(f"/admin/pages/{self.row['id']}/status", "POST",
                                     {"csrf": public_csrf_token(), "status": "hidden"})
        self.assertIn(status[:3], ("401", "403"))

    def test_02_edit_persists_and_states_enforced(self) -> None:
        status, _, _ = self.admin.call(f"/admin/pages/{self.row['id']}", "POST", self.form(
            name="WHAT IF editado", status="coming_soon", description="Descripción auditada"))
        self.assertTrue(status.startswith("303"))
        saved = one("SELECT * FROM site_pages WHERE id=?", (self.row["id"],))
        self.assertEqual(saved["name"], "WHAT IF editado")
        self.assertEqual(saved["status"], "coming_soon")
        self.assertEqual(saved["description"], "Descripción auditada")
        self.assertTrue(one("SELECT 1 FROM audit_log WHERE entity='site_page' AND entity_id=?",
                            (str(self.row["id"]),)))
        init_db()
        self.assertEqual(one("SELECT status FROM site_pages WHERE id=?", (self.row["id"],))["status"], "coming_soon")

        anonymous = Client()
        status, _, body = anonymous.call("/what-if")
        self.assertTrue(status.startswith("200"))
        self.assertIn("Mensaje controlado de próximamente.", body)
        self.assertIn("PRONTO", body)
        for path in ("/guest", "/config"):
            status, _, body = anonymous.call(self.API + path)
            self.assertTrue(status.startswith("403"), path)
            self.assertIn("page_coming_soon", body)
        status, _, body = anonymous.call(self.API + "/proposals", "POST",
                                         {"guest": "x", "csrf": "x", "idea": "Prueba de bloqueo"})
        self.assertTrue(status.startswith("403"))
        self.assertIn("page_coming_soon", body)

        status, _, _ = self.admin.call(f"/admin/pages/{self.row['id']}/status", "POST",
                                       {"csrf": self.admin.csrf, "status": "hidden"})
        self.assertTrue(status.startswith("303"))
        status, _, body = anonymous.call("/what-if")
        self.assertTrue(status.startswith("404"))
        status, _, _ = anonymous.call(self.API + "/config")
        self.assertTrue(status.startswith("404"))
        status, _, _ = self.admin.call("/what-if")
        self.assertTrue(status.startswith("200"))
        status, _, body = anonymous.call("/")
        self.assertNotIn('data-page-code="whatif"', body)

    def test_03_nav_visibility_does_not_break_other_universes(self) -> None:
        status, _, _ = self.admin.call(f"/admin/pages/{self.row['id']}", "POST", self.form(nav_visible="0"))
        self.assertTrue(status.startswith("303"))
        anonymous = Client()
        status, _, body = anonymous.call("/")
        self.assertTrue(status.startswith("200"))
        self.assertNotIn('data-page-code="whatif"', body)
        status, _, _ = anonymous.call("/what-if")
        self.assertTrue(status.startswith("200"))
        for path in ("/shop", "/play", "/pages/condiciones", "/sitemap.xml"):
            status, _, _ = anonymous.call(path)
            self.assertTrue(status.startswith("200"), path)


class WhatIfSecurityTests(unittest.TestCase):
    API = "/api/what-if/v1"

    @classmethod
    def setUpClass(cls) -> None:
        init_db()

    def _guest(self):
        client = Client()
        guest = json.loads(client.call(self.API + "/guest")[2])["token"]
        config = json.loads(client.call(self.API + f"/config?guest={guest}")[2])
        return client, guest, config["csrf"]

    def test_01_valid_invalid_and_expired_tokens(self) -> None:
        client, guest, csrf = self._guest()
        status, _, body = client.call(self.API + "/proposals", "POST",
                                      {"guest": guest, "csrf": csrf, "idea": "Token válido"})
        self.assertTrue(status.startswith("200"))
        self.assertTrue(json.loads(body)["ok"])
        for label, sent in (("sin token", ""), ("token incorrecto", "token-invalido")):
            form = {"guest": guest, "idea": "Prueba", "csrf": sent}
            status, _, body = client.call(self.API + "/proposals", "POST", form)
            self.assertTrue(status.startswith("400"), label)
            self.assertEqual(json.loads(body)["code"], "csrf_invalid")
        parts = csrf.split(".")
        payload = f"{int(parts[0]) - 7200}.{parts[1]}"
        signature = hmac.new(Config.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
        expired = f"{payload}.{signature}"
        status, _, body = client.call(self.API + "/proposals", "POST",
                                      {"guest": guest, "csrf": expired, "idea": "Token expirado"})
        self.assertTrue(status.startswith("400"))
        self.assertEqual(json.loads(body)["code"], "csrf_expired")

    def test_02_consecutive_and_concurrent_requests(self) -> None:
        statuses = []
        for index in range(3):
            client, guest, csrf = self._guest()
            status, _, _ = client.call(self.API + "/proposals", "POST",
                                       {"guest": guest, "csrf": csrf,
                                        "idea": f"Secuencial {index}", "idempotency_key": f"seq-{index}"})
            statuses.append(status)
        self.assertTrue(all(status.startswith("200") for status in statuses), statuses)

        def submit(index: int) -> str:
            client, guest, csrf = self._guest()
            status, _, _ = client.call(self.API + "/proposals", "POST",
                                       {"guest": guest, "csrf": csrf,
                                        "idea": f"Concurrente {index}", "idempotency_key": f"par-{index}"})
            return status

        with ThreadPoolExecutor(max_workers=4) as pool:
            parallel = list(pool.map(submit, range(4)))
        self.assertTrue(all(status.startswith("200") for status in parallel), parallel)

    def test_03_session_expiry_is_controlled_and_recoverable(self) -> None:
        admin = Client()
        self.assertTrue(admin.login())
        csrf = admin.csrf
        status, _, body = admin.call(self.API + "/proposals", "POST", {"csrf": csrf, "idea": "Sesión activa"})
        self.assertTrue(status.startswith("200"))
        token = admin.cookie.split("=", 1)[1]
        execute("UPDATE sessions SET expires_at='2000-01-01 00:00:00' WHERE token_hash=?", (hash_token(token),))
        status, _, body = admin.call(self.API + "/proposals", "POST", {"csrf": csrf, "idea": "Sesión expirada"})
        self.assertTrue(status.startswith("401"))
        payload = json.loads(body)
        self.assertEqual(payload["code"], "session_expired")
        self.assertIn("Guardamos", payload["error"])
        guest = json.loads(admin.call(self.API + "/guest")[2])["token"]
        fresh = json.loads(admin.call(self.API + f"/config?guest={guest}")[2])["csrf"]
        status, _, body = admin.call(self.API + "/proposals", "POST",
                                     {"guest": guest, "csrf": fresh, "idea": "Recuperación controlada"})
        self.assertTrue(status.startswith("200"))
        self.assertTrue(json.loads(body)["ok"])

    def test_04_active_session_is_renewed(self) -> None:
        admin = Client()
        self.assertTrue(admin.login())
        token = admin.cookie.split("=", 1)[1]
        soon = (datetime.now(timezone.utc) + timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S")
        execute("UPDATE sessions SET expires_at=? WHERE token_hash=?", (soon, hash_token(token)))
        status, headers, _ = admin.call("/admin")
        self.assertTrue(status.startswith("200"))
        self.assertIn("Set-Cookie", headers)
        renewed = one("SELECT expires_at FROM sessions WHERE token_hash=?", (hash_token(token),))["expires_at"]
        self.assertGreater(renewed, soon)

    def test_05_browser_form_content_type_is_required(self) -> None:
        client, guest, csrf = self._guest()
        form = {"guest": guest, "csrf": csrf, "idea": "¿Qué pasaría si el océano brillara de noche?",
                "idempotency_key": "browser-content-type"}
        body = urllib.parse.urlencode(form).encode()
        status, headers, text = client.call_raw(
            self.API + "/proposals", "POST", body, "text/plain;charset=UTF-8",
            {"X-Request-ID": "test-plain-1"})
        self.assertTrue(status.startswith("400"))
        self.assertEqual(json.loads(text)["code"], "csrf_invalid")
        self.assertEqual(headers.get("X-Request-ID"), "test-plain-1")

        status, headers, text = client.call_raw(
            self.API + "/proposals", "POST", body,
            "application/x-www-form-urlencoded;charset=UTF-8",
            {"X-Request-ID": "test-form-1"})
        self.assertTrue(status.startswith("200"))
        self.assertTrue(json.loads(text)["ok"])
        self.assertEqual(headers.get("X-Request-ID"), "test-form-1")

    def test_06_validation_errors_are_distinguished_from_csrf(self) -> None:
        client, guest, csrf = self._guest()
        status, _, body = client.call(self.API + "/proposals", "POST",
                                      {"guest": guest, "csrf": csrf, "idea": "corto"})
        self.assertTrue(status.startswith("400"))
        payload = json.loads(body)
        self.assertEqual(payload["code"], "validation_error")
        self.assertNotIn("Token de seguridad", payload["error"])

    def test_07_studio_initializer_requires_reality_id(self) -> None:
        source = (Path(__file__).resolve().parents[1]
                  / "app/static/whatif/1.0.2/whatif.js").read_text(encoding="utf-8")
        self.assertIn("qs('[data-wi-studio][data-reality-id]')", source)
        self.assertNotIn("var root = qs('[data-wi-studio]');", source)


class WhatIfFantasyMachineTests(unittest.TestCase):
    API = "/api/what-if/v1"
    BLUEPRINT_KEYS = ("premise", "evolution", "world", "situation", "narrative")
    SECTION_CODES = (
        "world", "history", "chronology", "characters", "places", "civilizations", "mysteries",
        "events", "timelines", "culture", "technology", "economy", "religions", "species",
        "flora", "fauna", "customs", "conflicts", "character_relationships",
    )
    CARD_FIELDS = ("kind", "subject", "content", "metadata")

    @classmethod
    def setUpClass(cls) -> None:
        init_db()
        cls.client = Client()

    def setUp(self) -> None:
        status, _, body = self.client.call(self.API + "/guest")
        self.assertTrue(status.startswith("200"), body[:200])
        self.guest = json.loads(body)["token"]
        self._force_local_settings()

    def _set_setting(self, key: str, value: object) -> None:
        previous = one("SELECT value FROM settings WHERE category='whatif' AND key=?", (key,))
        if previous:
            self.addCleanup(set_setting, "whatif", key, previous["value"])
        else:
            self.addCleanup(execute, "DELETE FROM settings WHERE category='whatif' AND key=?", (key,))
        set_setting("whatif", key, str(value))

    def _force_local_settings(self) -> None:
        for key, value in (
            ("enabled", "1"),
            ("text_provider", "local"),
            ("image_provider", "schematic"),
            ("generate_images", "0"),
            ("text_model", ""),
            ("image_model", ""),
            ("text_api_url", ""),
            ("image_api_url", ""),
            ("ideas_enabled", "1"),
            ("unlimited_enabled", "1"),
        ):
            self._set_setting(key, value)

    def api(self, path: str, form: dict | None = None, method: str = "GET") -> tuple[str, dict]:
        params = dict(form or {})
        if method == "POST":
            params["csrf"] = public_csrf_token()
            params["guest"] = self.guest
            status, _, body = self.client.call(self.API + path, method, params)
        else:
            params["guest"] = self.guest
            separator = "&" if "?" in path else "?"
            status, _, body = self.client.call(self.API + path + separator + urllib.parse.urlencode(params))
        return status, json.loads(body)

    def _key(self, label: str) -> str:
        return f"fm-{self._testMethodName}-{label}-{uuid.uuid4().hex[:8]}"

    def _create_reality(self, idea: str, **config: object) -> int:
        form = {
            "idea": idea,
            "genre": "fantasia",
            "style": "epico",
            "depth": "historia",
            "format": "hibrido",
            "fantasy_machine": "1",
            "idempotency_key": self._key("proposal"),
        }
        form.update({key: str(value) for key, value in config.items()})
        status, data = self.api("/proposals", form, "POST")
        self.assertTrue(status.startswith("200"), data)
        proposal = data["proposal"]
        payload = {
            "title": proposal.get("title") or idea[:60],
            "premise": proposal.get("premise") or idea,
            "description": proposal.get("description") or "",
            "genre": proposal.get("genre") or "fantasia",
            "style": proposal.get("style") or "epico",
            "depth": proposal.get("depth") or "historia",
            "format": proposal.get("format") or "hibrido",
            "first_scene": proposal.get("first_scene") or "",
            "rules": json.dumps(proposal.get("rules") or []),
            "characters": json.dumps(proposal.get("characters") or []),
            "locations": json.dumps(proposal.get("locations") or []),
            "fantasy_machine": "1",
            "idempotency_key": self._key("reality"),
        }
        payload.update({key: str(value) for key, value in config.items()})
        status, data = self.api("/realities", payload, "POST")
        self.assertTrue(status.startswith("200"), data)
        return int(data["reality"]["id"])

    def _state(self, reality_id: int) -> dict:
        status, data = self.api(f"/realities/{reality_id}")
        self.assertTrue(status.startswith("200"), data)
        return data

    def _chapter(self, reality_id: int, timeline_id: int = 0, **form: object) -> dict:
        payload: dict[str, object] = {
            "timeline": timeline_id,
            "idempotency_key": self._key("chapter"),
        }
        payload.update(form)
        status, data = self.api(f"/realities/{reality_id}/chapter", payload, "POST")
        self.assertTrue(status.startswith("200"), data)
        return data["chapter"]

    def _set_modes(self, reality_id: int, **config: object) -> dict:
        payload = {key: str(value) for key, value in config.items()}
        payload["idempotency_key"] = self._key("modes")
        status, data = self.api(f"/realities/{reality_id}/modes", payload, "POST")
        self.assertTrue(status.startswith("200"), data)
        return data

    def _normalize(self, value: object) -> str:
        text = re.sub(r"<[^>]+>", " ", str(value if value is not None else ""))
        return re.sub(r"\s+", " ", text).strip().lower()

    def _paragraphs(self, content: str) -> list[str]:
        result = []
        for part in re.split(r"\n\s*\n", content or ""):
            text = self._normalize(part)
            if text:
                result.append(text)
        return result

    def _assert_long_chapter(self, chapter: dict) -> None:
        content = chapter.get("content") or ""
        self.assertGreaterEqual(len(content.split()), 800)
        paragraphs = self._paragraphs(content)
        self.assertGreaterEqual(len(paragraphs), 3)
        self.assertEqual(len(paragraphs), len(set(paragraphs)))

    def _entries(self, items: object) -> list[dict]:
        if not isinstance(items, (list, tuple)):
            return []
        return [item for item in items if isinstance(item, dict)]

    def _assert_cards(self, cards: list) -> None:
        for card in cards:
            self.assertIsInstance(card, dict)
            for field in self.CARD_FIELDS:
                self.assertIn(field, card)
            self.assertTrue(str(card.get("kind") or "").strip())
            self.assertTrue(str(card.get("content") or "").strip())
            self.assertIsInstance(card.get("metadata"), (dict, str, type(None)))

    def _blueprint(self, state: dict) -> dict:
        blueprint = state.get("blueprint")
        self.assertIsInstance(blueprint, dict)
        for key in self.BLUEPRINT_KEYS:
            self.assertIn(key, blueprint)
            self.assertIsInstance(blueprint[key], list)
            self._assert_cards(blueprint[key])
        return blueprint

    def _sections(self, state: dict) -> dict:
        sections = state.get("sections")
        self.assertIsInstance(sections, dict)
        sections = dict(sections)
        for code in self.SECTION_CODES:
            if code not in sections and isinstance(state.get(code), list):
                sections[code] = [
                    {"kind": "relationship", "subject": str(row.get("relation") or ""),
                     "content": str(row.get("relation") or ""), "metadata": row}
                    for row in state[code] if isinstance(row, dict)
                ]
                continue
            self.assertIn(code, sections)
            self.assertIsInstance(sections[code], list)
            self._assert_cards(sections[code])
        return sections

    def _blueprint_text(self, blueprint: dict, *keys: str) -> str:
        selected = keys or self.BLUEPRINT_KEYS
        return " ".join(
            self._normalize(card.get("content"))
            for key in selected
            for card in self._entries(blueprint.get(key, []))
        )

    def _section_text(self, sections: dict, *codes: str) -> str:
        return " ".join(
            self._normalize(card.get("content"))
            for code in codes
            for card in self._entries(sections.get(code, []))
        )

    def _memory_cards(self, state: dict) -> dict:
        cards = state.get("memory_cards") or {}
        if isinstance(cards, list):
            grouped: dict[str, list] = {}
            for card in cards:
                if isinstance(card, dict):
                    grouped.setdefault(str(card.get("kind") or ""), []).append(card)
            return grouped
        return cards if isinstance(cards, dict) else {}

    def _card_entries(self, state: dict) -> list[dict]:
        return [card for group in self._memory_cards(state).values() if isinstance(group, list)
                for card in group if isinstance(card, dict)]

    def _cards_text(self, state: dict) -> str:
        return " ".join(self._normalize(card.get("content")) for card in self._card_entries(state))

    def _events_text(self, state: dict) -> str:
        events = state.get("events") or []
        return " ".join(
            self._normalize(" ".join(str(event.get(key) or "") for key in ("title", "description", "consequences")))
            for event in events if isinstance(event, dict)
        )

    def _mode_codes(self, state: dict) -> set[str]:
        modes = state.get("modes") or []
        codes: set[str] = set()
        if isinstance(modes, dict):
            sources = modes.values()
            codes.update(str(key).lower() for key in modes)
        elif isinstance(modes, list):
            sources = modes
        else:
            sources = []
        for item in sources:
            if isinstance(item, dict):
                for key in ("code", "mode", "type", "name", "kind"):
                    value = item.get(key)
                    if value:
                        codes.add(str(value).lower())
            elif item:
                codes.add(str(item).lower())
        return codes

    def _assert_mode(self, state: dict, name: str) -> None:
        codes = self._mode_codes(state)
        aliases = {
            "apocalypse": {"apocalypse", "apocalipsis"},
            "crazy": {"crazy", "locura", "loco"},
            "unlimited": {"unlimited", "sin-limites", "sin límites", "ilimitado"},
        }.get(name, {name})
        self.assertTrue(codes & aliases, f"modes={sorted(codes)}")

    def _config(self, state: dict) -> dict:
        value = state.get("narrative_config")
        if isinstance(value, dict):
            return value
        reality = state.get("reality")
        if isinstance(reality, dict) and isinstance(reality.get("narrative_config"), dict):
            return reality["narrative_config"]
        return {}

    def _as_int(self, value: object, default: int = 0) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    def _shares_text(self, text: str, name: str) -> bool:
        words = [word for word in self._normalize(name).split() if len(word) > 3]
        return any(word in text for word in words)

    def _wait_job(self, job_id: int) -> dict:
        from time import sleep
        for _ in range(60):
            status, data = self.api(f"/jobs/{job_id}")
            self.assertTrue(status.startswith("200"), data)
            job = data.get("job") if isinstance(data.get("job"), dict) else data
            if job.get("status") in {"done", "error", "canceled"}:
                self.assertEqual(job.get("status"), "done", job.get("error"))
                return job
            sleep(0.05)
        self.fail(f"La tarea {job_id} no terminó")

    def test_01_crear_reality_desde_hipotesis(self) -> None:
        idea = "¿Qué pasaría si una ciudad suspendida entre nubes olvidara por completo el suelo?"
        status, data = self.api("/proposals", {
            "idea": idea, "genre": "fantasia", "style": "epico", "depth": "historia",
            "fantasy_machine": "1", "idempotency_key": self._key("proposal"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        proposal = data["proposal"]
        self.assertTrue(proposal.get("title"))
        self.assertTrue(proposal.get("premise"))
        status, data = self.api("/realities", {
            "title": proposal["title"], "premise": proposal["premise"],
            "description": proposal.get("description") or "", "genre": "fantasia",
            "style": "epico", "depth": "historia", "format": proposal.get("format") or "hibrido",
            "first_scene": proposal.get("first_scene") or "",
            "rules": json.dumps(proposal.get("rules") or []),
            "characters": json.dumps(proposal.get("characters") or []),
            "locations": json.dumps(proposal.get("locations") or []),
            "fantasy_machine": "1", "idempotency_key": self._key("reality"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        reality_id = int(data["reality"]["id"])
        state = self._state(reality_id)
        self.assertEqual(state["reality"]["premise"], proposal["premise"])
        self.assertTrue(state["chapters"])
        blueprint = self._blueprint(state)
        for key in self.BLUEPRINT_KEYS:
            self.assertTrue(blueprint[key], key)
        self.assertIn("suspendida", self._blueprint_text(blueprint))
        saved = one("SELECT title,premise FROM whatif_realities WHERE id=?", (reality_id,))
        self.assertEqual(saved["title"], state["reality"]["title"])
        self.assertEqual(saved["premise"], state["reality"]["premise"])
        cards = query("SELECT content FROM whatif_memory_cards WHERE reality_id=? AND kind='premise'", (reality_id,))
        self.assertTrue(cards)
        self.assertIn("suspendida", " ".join(row["content"] for row in cards).lower())

    def test_02_construir_cronologia(self) -> None:
        reality_id = self._create_reality("¿Qué pasaría si el archivo de los siglos se abriera cada cien años?")
        state = self._state(reality_id)
        sections = self._sections(state)
        chronology = self._entries(sections["chronology"])
        self.assertTrue(chronology)
        self.assertTrue(self._entries(sections["history"]))
        self.assertTrue(self._entries(sections["timelines"]))
        self.assertTrue(one("SELECT id FROM whatif_timelines WHERE reality_id=?", (reality_id,)))
        self._chapter(reality_id, state["timeline_id"], direction="Narra la primera fecha decisiva del archivo.")
        state = self._state(reality_id)
        self.assertGreaterEqual(len(self._entries(self._sections(state)["chronology"])), len(chronology))
        status, data = self.api(f"/realities/{reality_id}/timelines", {
            "name": "Cronología alterna", "divergence": "El archivo se abre un siglo antes",
            "timeline": state["timeline_id"], "idempotency_key": self._key("branch"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        branch_id = int(data["timeline_id"])
        saved = one("SELECT name,divergence_event FROM whatif_timelines WHERE id=?", (branch_id,))
        self.assertEqual(saved["name"], "Cronología alterna")
        self.assertEqual(saved["divergence_event"], "El archivo se abre un siglo antes")
        state = self._state(reality_id)
        self.assertIn(branch_id, {int(row["id"]) for row in state["timelines"]})

    def test_03_generar_mundo(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si un mundo de islas flotantes descubriera que todas comparten una sola raíz?"
        )
        state = self._state(reality_id)
        sections = self._sections(state)
        world_codes = (
            "world", "places", "civilizations", "culture", "technology", "economy", "religions",
            "species", "flora", "fauna", "customs", "conflicts",
        )
        populated = [code for code in world_codes if self._entries(sections[code])]
        self.assertGreaterEqual(len(populated), 8, populated)
        for code in ("world", "places", "civilizations"):
            self.assertTrue(self._entries(sections[code]), code)
        world_text = self._section_text(sections, *world_codes)
        self.assertTrue(any(word in world_text for word in ("isla", "islas", "raiz", "raices", "flot")))
        locations = query("SELECT name FROM whatif_locations WHERE reality_id=?", (reality_id,))
        rules = query("SELECT text FROM whatif_rules WHERE reality_id=?", (reality_id,))
        self.assertTrue(locations)
        self.assertTrue(rules)

    def test_04_crear_personajes(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si dos cartógrafos rivales compartieran un mismo recuerdo imposible?"
        )
        state = self._state(reality_id)
        self.assertTrue(state["characters"])
        sections = self._sections(state)
        self.assertTrue(self._entries(sections["characters"]))
        character_text = self._section_text(sections, "characters", "character_relationships")
        self.assertTrue(character_text)
        characters = query(
            "SELECT name,identity,motivations,history,knowledge FROM whatif_characters WHERE reality_id=?",
            (reality_id,),
        )
        self.assertTrue(characters)
        self.assertTrue(any(self._shares_text(character_text, row["name"]) for row in characters))
        relations = query("SELECT relation FROM whatif_character_relationships WHERE reality_id=?", (reality_id,))
        relation_cards = query(
            "SELECT content FROM whatif_memory_cards WHERE reality_id=? "
            "AND (kind LIKE '%relation%' OR kind LIKE '%relacion%')",
            (reality_id,),
        )
        self.assertTrue(relations or relation_cards)

    def test_05_capitulos_extensos(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si la biblioteca de una ciudad creciera una habitación nueva cada noche?",
            chapter_length="extenso",
        )
        state = self._state(reality_id)
        first = state["chapter"]
        self.assertTrue(first)
        self._assert_long_chapter(first)
        status, data = self.api(f"/realities/{reality_id}/chapter", {
            "timeline": state["timeline_id"], "direction": "La habitación nueva contiene un mapa imposible.",
            "idempotency_key": self._key("chapter-2"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        second = data["chapter"]
        self._assert_long_chapter(second)
        self.assertEqual(second["number"], first["number"] + 1)
        self.assertNotEqual(self._normalize(second["content"]), self._normalize(first["content"]))
        saved = one("SELECT content,number FROM whatif_chapters WHERE id=?", (second["id"],))
        self.assertEqual(saved["content"], second["content"])
        self.assertEqual(saved["number"], second["number"])
        blueprint = self._blueprint(self._state(reality_id))
        self.assertGreaterEqual(len(blueprint["narrative"]), 2)

    def test_06_continuar_historia(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si una estación de tren apareciera solo durante una hora cada día?"
        )
        state = self._state(reality_id)
        first = state["chapter"]
        needles = [first.get("summary"), state["reality"]["premise"][:80]]
        for event in (state.get("events") or [])[:3]:
            if isinstance(event, dict):
                needles.extend((event.get("description"), event.get("consequences")))
        chapters = [first]
        for index in range(2):
            chapters.append(self._chapter(
                reality_id, state["timeline_id"], direction=f"Continúa la escena sin contradecir lo anterior {index + 1}."
            ))
        state = self._state(reality_id)
        self.assertEqual([row["number"] for row in state["chapters"]], [1, 2, 3])
        self.assertEqual(
            one("SELECT COUNT(*) AS total FROM whatif_chapters WHERE reality_id=?", (reality_id,))["total"], 3
        )
        contents = [one("SELECT content FROM whatif_chapters WHERE id=?", (row["id"],))["content"]
                    for row in state["chapters"][1:]]
        haystack = self._normalize(" ".join(contents))
        candidates = [self._normalize(value)[:80] for value in needles if len(self._normalize(value)) >= 25]
        self.assertTrue(any(candidate in haystack for candidate in candidates), haystack[:300])
        blueprint = self._blueprint(state)
        self.assertGreaterEqual(len(blueprint["narrative"]), 3)
        self.assertTrue(self._entries(self._sections(state)["events"]))

    def test_07_intervenir(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si una emisora oculta pudiera reescribir los recuerdos de la ciudad?"
        )
        state = self._state(reality_id)
        chapter_id = state["chapter"]["id"]
        original = one("SELECT content FROM whatif_chapters WHERE id=?", (chapter_id,))["content"]
        status, data = self.api(f"/realities/{reality_id}/interventions", {
            "text": "Que la emisora obligue a todos a recordar el mismo día.",
            "timeline": state["timeline_id"], "idempotency_key": self._key("propose"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        intervention_id = int(data["intervention_id"])
        status, data = self.api(f"/realities/{reality_id}/interventions/{intervention_id}/apply", {
            "idempotency_key": self._key("apply"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        self.assertTrue(data.get("applied"))
        saved = one("SELECT status,user_text FROM whatif_interventions WHERE id=?", (intervention_id,))
        self.assertEqual(saved["status"], "applied")
        self.assertIn("emisora", saved["user_text"])
        self.assertEqual(one("SELECT content FROM whatif_chapters WHERE id=?", (chapter_id,))["content"], original)
        state = self._state(reality_id)
        kinds = set(self._memory_cards(state))
        self.assertIn("intervention", kinds)
        self.assertIn("consequence", kinds)
        blueprint = self._blueprint(state)
        evidence = self._blueprint_text(blueprint, "situation", "evolution") + " " + self._cards_text(state)
        self.assertIn("emisora", evidence)

    def test_08_ramificar(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si una decisión imposible creara una línea temporal separada?"
        )
        state = self._state(reality_id)
        root_id = state["timeline_id"]
        before = one("SELECT COUNT(*) AS total FROM whatif_chapters WHERE timeline_id=?", (root_id,))["total"]
        status, data = self.api(f"/realities/{reality_id}/interventions", {
            "text": "Que la decisión imposible nunca hubiera llegado a tomarse.",
            "timeline": root_id, "idempotency_key": self._key("propose"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        intervention_id = int(data["intervention_id"])
        status, data = self.api(f"/realities/{reality_id}/interventions/{intervention_id}/apply", {
            "branch": "1", "idempotency_key": self._key("apply"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        branch_id = int(data.get("timeline_id") or 0)
        self.assertNotEqual(branch_id, root_id)
        after = one("SELECT COUNT(*) AS total FROM whatif_chapters WHERE timeline_id=?", (root_id,))["total"]
        self.assertEqual(after, before)
        timeline = one("SELECT parent_id FROM whatif_timelines WHERE id=?", (branch_id,))
        self.assertEqual(timeline["parent_id"], root_id)
        branch_cards = query(
            "SELECT id FROM whatif_memory_cards WHERE timeline_id=? AND kind='branch'", (branch_id,)
        )
        self.assertTrue(branch_cards)
        state = self._state(reality_id)
        self.assertIn("branch", self._memory_cards(state))
        self.assertTrue(self._entries(self._sections(state)["timelines"]))
        status, data = self.api(f"/realities/{reality_id}/timelines/{branch_id}/compare", {"other": root_id})
        self.assertTrue(status.startswith("200"), data)
        self.assertIn("differences", data)

    def test_09_ideas_aleatorias(self) -> None:
        key = self._key("ideas")
        status, data = self.api("/ideas", {
            "idea": "¿Y si los nombres de las cosas cambiaran cada vez que se pronuncian?",
            "count": "6", "variation": "mix", "randomness": "4",
            "idempotency_key": key,
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        self.assertTrue(data.get("ok"))
        ideas = data.get("ideas") or []
        self.assertGreaterEqual(len(ideas), 4)
        required = ("title", "premise", "genre", "context", "conflict",
                    "unexpected_element", "direction", "tags", "image_suggestion")
        for idea in ideas:
            for field in required:
                self.assertIn(field, idea)
        titles = [self._normalize(idea.get("title")) for idea in ideas]
        premises = [self._normalize(idea.get("premise")) for idea in ideas]
        self.assertEqual(len(set(titles)), len(titles))
        self.assertEqual(len(set(premises)), len(premises))
        job = one("SELECT id,status,result FROM whatif_generation_jobs WHERE idempotency_key=?", (key,))
        self.assertIsNotNone(job)
        self.assertEqual(job["status"], "done")
        stored = json.loads(job["result"] or "{}")
        self.assertGreaterEqual(len(stored.get("ideas") or []), 4)
        if isinstance(data.get("narrative_config"), dict):
            self.assertIn("unlimited", data["narrative_config"])

    def test_10_apocalipsis(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si el mar subiera sin poder volver a bajar y las ciudades costeras cayeran?",
            apocalypse="1", apocalypse_level="acelerado", surprise_frequency="80",
        )
        state = self._state(reality_id)
        self._chapter(reality_id, state["timeline_id"], direction="La evacuación termina sin regreso posible.")
        state = self._state(reality_id)
        self._assert_mode(state, "apocalypse")
        config = self._config(state)
        self.assertEqual(self._as_int(config.get("apocalypse")), 1)
        self.assertEqual(config.get("apocalypse_level"), "acelerado")
        blueprint = self._blueprint(state)
        evidence = self._blueprint_text(blueprint, "evolution", "narrative", "world")
        evidence += " " + self._section_text(self._sections(state), "events", "conflicts")
        evidence += " " + self._cards_text(state) + " " + self._events_text(state)
        markers = ("apocalipsis", "destrucc", "colapso", "evacu", "irreversible", "muerte", "fin del mundo")
        self.assertTrue(any(marker in evidence for marker in markers), evidence[:300])
        forbidden = ("resucitó", "resucito", "revivió", "revivio", "volvió a la vida", "volvio a la vida")
        for chapter in state["chapters"][1:]:
            content = self._normalize(chapter.get("content"))
            for marker in forbidden:
                self.assertNotIn(marker, content)

    def test_11_modo_loco(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si las leyes de la física se volvieran negociables en un pequeño reino?",
            crazy="1", crazy_level="4", surprise_frequency="100",
        )
        state = self._state(reality_id)
        self._chapter(reality_id, state["timeline_id"], direction="Una regla imposible se aplica antes del desayuno.")
        state = self._state(reality_id)
        config = self._config(state)
        self.assertEqual(self._as_int(config.get("crazy")), 1)
        self.assertEqual(self._as_int(config.get("crazy_level")), 4)
        self._assert_mode(state, "crazy")
        kinds = set(self._memory_cards(state))
        evidence = self._blueprint_text(self._blueprint(state), "evolution", "narrative", "world")
        evidence += " " + self._cards_text(state) + " " + self._events_text(state)
        markers = ("imposible", "paradoja", "anómalo", "anomalo", "extraordinario", "irreal",
                   "inexplicable", "absurdo", "absurda", "flot", "muta", "telepat")
        self.assertTrue("rule_change" in kinds or any(marker in evidence for marker in markers), evidence[:300])

    def test_12_combinar_modos_incluyendo_sin_limites(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si un apocalipsis absurdo y sin límites reescribiera todas las reglas?",
            apocalypse="1", apocalypse_level="caos-absoluto", crazy="1", crazy_level="4",
            unlimited="1", modes="apocalypse crazy unlimited",
        )
        self._set_modes(
            reality_id, apocalypse="1", apocalypse_level="caos-absoluto", crazy="1", crazy_level="4",
            unlimited="1", modes="apocalypse crazy unlimited",
            narrative_config=json.dumps({
                "apocalypse": 1, "apocalypse_level": "caos-absoluto", "crazy": 1,
                "crazy_level": 4, "unlimited": 1, "modes": ["apocalypse", "crazy", "unlimited"],
            }),
        )
        state = self._state(reality_id)
        config = self._config(state)
        self.assertIn("unlimited", config)
        self.assertEqual(self._as_int(config.get("unlimited")), 1)
        self.assertEqual(self._as_int(config.get("apocalypse")), 1)
        self.assertEqual(self._as_int(config.get("crazy_level")), 4)
        for mode in ("apocalypse", "crazy", "unlimited"):
            self._assert_mode(state, mode)
        self.assertEqual(get_setting("whatif", "unlimited_enabled"), "1")
        if "unlimited_enabled" in (state.get("config") or {}):
            self.assertTrue(state["config"]["unlimited_enabled"])
        self._chapter(reality_id, state["timeline_id"], direction="Todas las reglas cambian a la vez.")
        state = self._state(reality_id)
        blueprint = self._blueprint(state)
        evidence = self._blueprint_text(blueprint) + " " + self._cards_text(state) + " " + self._events_text(state)
        apocalypse_markers = ("apocalipsis", "destrucc", "colapso", "muerte", "irreversible", "fin del mundo")
        crazy_markers = ("rule_change", "imposible", "paradoja", "anómalo", "anomalo", "absurdo", "irreal")
        self.assertTrue(any(marker in evidence for marker in apocalypse_markers), evidence[:300])
        self.assertTrue(any(marker in evidence for marker in crazy_markers), evidence[:300])

    def test_13_explorar_personajes_y_lugares(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si un faro y su guardián intercambiaran recuerdos cada vez que la luz giraba?"
        )
        state = self._state(reality_id)
        self.assertTrue(state["characters"])
        self.assertTrue(state["locations"])
        self._chapter(reality_id, state["timeline_id"], direction="El guardián entra en la cámara oculta del faro.")
        state = self._state(reality_id)
        sections = self._sections(state)
        character_text = self._section_text(sections, "characters", "character_relationships")
        place_text = self._section_text(sections, "places", "world")
        self.assertTrue(character_text)
        self.assertTrue(place_text)
        characters = query("SELECT name,identity,history,knowledge,appearance FROM whatif_characters WHERE reality_id=?",
                           (reality_id,))
        locations = query("SELECT name,kind,description,features,status FROM whatif_locations WHERE reality_id=?",
                          (reality_id,))
        self.assertTrue(characters)
        self.assertTrue(locations)
        self.assertTrue(any(self._shares_text(character_text, row["name"]) for row in characters))
        self.assertTrue(any(self._shares_text(place_text, row["name"]) for row in locations))
        status, data = self.api(f"/realities/{reality_id}/interventions", {
            "text": "Que el guardián descubra una cámara oculta debajo del faro.",
            "timeline": state["timeline_id"], "idempotency_key": self._key("propose"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        status, data = self.api(f"/realities/{reality_id}/interventions/{data['intervention_id']}/apply", {
            "idempotency_key": self._key("apply"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        state = self._state(reality_id)
        self.assertIn("cámara", self._cards_text(state) + " " + self._events_text(state))

    def test_14_recursos_visuales_async_y_reutilizacion(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si los colores de una ciudad cambiaran con cada decisión?"
        )
        visual_settings = {
            "visual_primary_color": "#123456",
            "visual_secondary_color": "#654321",
            "visual_accent_color": "#abcdef",
            "visual_background_color": "#010203",
            "visual_elements": json.dumps(["faro", "brújula"], ensure_ascii=False),
            "narrative_templates": json.dumps({"mapa": "Mapa {title}", "retrato": "Retrato {character}"}, ensure_ascii=False),
        }
        for key, value in visual_settings.items():
            self._set_setting(key, value)
            self.assertEqual(get_setting("whatif", key), value)
        secret = "secreto-qa-whatif-no-debe-exponerse"
        for key in ("text_api_key", "image_api_key", "api_key"):
            self._set_setting(key, secret)
        config = self.api("/config")[1]
        self.assertNotIn(secret, json.dumps(config, ensure_ascii=False))
        state = self._state(reality_id)
        self.assertNotIn(secret, json.dumps(state, ensure_ascii=False))
        key = self._key("asset")
        status, data = self.api(f"/realities/{reality_id}/assets", {
            "kind": "map", "async": "1", "prompt": "Mapa esquemático de la ciudad cambiante",
            "idempotency_key": key,
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        self.assertTrue(data.get("job_id"))
        job = self._wait_job(int(data["job_id"]))
        result = job.get("result") or {}
        self.assertTrue(result.get("asset_id"))
        self.assertTrue(result.get("url"))
        asset_id = int(result["asset_id"])
        asset = one("SELECT id,provider,status,mime FROM whatif_assets WHERE id=?", (asset_id,))
        self.assertEqual(asset["provider"], "schematic")
        self.assertEqual(asset["status"], "ready")
        parsed = urllib.parse.urlsplit(str(result["url"]))
        path = parsed.path + (("?" + parsed.query) if parsed.query else "")
        separator = "&" if "?" in path else "?"
        status, _, svg = self.client.call(path + separator + urllib.parse.urlencode({"guest": self.guest}))
        self.assertTrue(status.startswith("200"))
        self.assertIn("<svg", svg)
        status, reused = self.api(f"/realities/{reality_id}/assets", {
            "kind": "map", "async": "0", "idempotency_key": key,
        }, "POST")
        self.assertTrue(status.startswith("200"), reused)
        self.assertEqual(int(reused["asset_id"]), asset_id)
        self.assertTrue(reused.get("job_id"))
        character_id = state["characters"][0]["id"]
        status, data = self.api(f"/realities/{reality_id}/assets", {
            "kind": "portrait", "entity": character_id, "async": "1",
            "idempotency_key": self._key("portrait"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        portrait_job = self._wait_job(int(data["job_id"]))
        portrait = one("SELECT id,entity_id FROM whatif_assets WHERE id=?",
                       (int(portrait_job["result"]["asset_id"]),))
        self.assertEqual(portrait["entity_id"], character_id)
        self.assertNotEqual(portrait["id"], asset_id)

    def test_15_guardar_y_recuperar_reality(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si un archivista pudiera guardar una realidad entera dentro de un libro?"
        )
        self._chapter(reality_id, 0, direction="El archivista escribe el primer registro del libro.")
        status, data = self.api(f"/realities/{reality_id}/update", {
            "title": "La realidad del libro", "description": "Descripción persistida QA",
            "favorite": "1", "idempotency_key": self._key("update"),
        }, "POST")
        self.assertTrue(status.startswith("200"), data)
        before = self._state(reality_id)
        init_db()
        after = self._state(reality_id)
        saved = one("SELECT title,description,favorite FROM whatif_realities WHERE id=?", (reality_id,))
        self.assertEqual(saved["title"], "La realidad del libro")
        self.assertEqual(saved["description"], "Descripción persistida QA")
        self.assertEqual(int(saved["favorite"]), 1)
        self.assertEqual(after["reality"]["title"], saved["title"])
        self.assertEqual(len(after["chapters"]), len(before["chapters"]))
        self.assertEqual(
            self._blueprint_text(self._blueprint(after)), self._blueprint_text(self._blueprint(before))
        )
        self.assertEqual(
            self._section_text(self._sections(after), *self.SECTION_CODES),
            self._section_text(self._sections(before), *self.SECTION_CODES),
        )
        self.assertEqual(
            one("SELECT COUNT(*) AS total FROM whatif_chapters WHERE reality_id=?", (reality_id,))["total"],
            len(after["chapters"]),
        )
        self.assertTrue(query("SELECT id FROM whatif_memory_cards WHERE reality_id=?", (reality_id,)))
        status, data = self.api("/realities")
        self.assertTrue(status.startswith("200"))
        self.assertIn(reality_id, {int(row["id"]) for row in data["realities"]})

    def test_16_continuidad_tras_varias_generaciones(self) -> None:
        reality_id = self._create_reality(
            "¿Qué pasaría si cada generación de una ciudad heredara un error de la anterior?"
        )
        state = self._state(reality_id)
        first = state["chapter"]
        needles = [first.get("summary"), state["reality"]["premise"][:80]]
        for event in (state.get("events") or [])[:3]:
            if isinstance(event, dict):
                needles.extend((event.get("description"), event.get("consequences")))
        cards_before = len(self._card_entries(state))
        for index in range(3):
            chapter = self._chapter(
                reality_id, state["timeline_id"], direction=f"Continúa sin contradecir lo anterior, paso {index + 1}."
            )
            self._assert_long_chapter(chapter)
        state = self._state(reality_id)
        self.assertEqual([row["number"] for row in state["chapters"]], [1, 2, 3, 4])
        self.assertEqual(
            one("SELECT COUNT(*) AS total FROM whatif_chapters WHERE reality_id=?", (reality_id,))["total"], 4
        )
        texts = [self._normalize(one("SELECT content FROM whatif_chapters WHERE id=?", (row["id"],))["content"])
                 for row in state["chapters"]]
        self.assertEqual(len(texts), len(set(texts)))
        haystack = " ".join(texts[1:])
        candidates = [self._normalize(value)[:80] for value in needles if len(self._normalize(value)) >= 25]
        self.assertTrue(any(candidate in haystack for candidate in candidates), haystack[:300])
        blueprint = self._blueprint(state)
        self.assertTrue(blueprint["narrative"])
        self.assertTrue(self._entries(self._sections(state)["chronology"]))
        self.assertGreaterEqual(len(self._card_entries(state)), cards_before)
        self.assertTrue(query("SELECT id FROM whatif_versions WHERE reality_id=?", (reality_id,)))


class CommercialImprovementsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.admin = Client()
        assert cls.admin.login(), "No se pudo iniciar sesión en las pruebas comerciales"

    def _product(self, *, cost: str = "123456", price: str = "400000", stock: str = "2",
                 message: str = "") -> dict:
        name = f"Producto Comercial {uuid.uuid4().hex[:8]}"
        form = {
            "csrf": self.admin.csrf, "name": name, "modality": "stock", "status": "active",
            "price": price, "cost": cost, "stock": stock, "low_stock_threshold": "1",
            "delivery_hours": "24", "target_margin_percent": "35", "whatsapp_message": message,
        }
        status, _, _ = self.admin.call("/admin/products/create", "POST", form)
        self.assertTrue(status.startswith("303"), status)
        product = one("SELECT * FROM products WHERE name=?", (name,))
        self.assertIsNotNone(product)
        return dict(product)

    def test_01_margins_are_persisted_and_cost_is_private(self) -> None:
        product = self._product(message="MENSAJE {name} sobre {product}")
        self.assertEqual(product["target_margin_percent"], 35)
        self.assertEqual(product["whatsapp_message"], "MENSAJE {name} sobre {product}")
        status, _, body = Client().call("/shop/catalogo?q=Producto%20Comercial")
        self.assertTrue(status.startswith("200"))
        self.assertIn("Producto Comercial", body)
        self.assertNotIn("Costo de adquisición", body)
        self.assertNotIn("123456", body)

    def test_02_product_message_and_click_logging(self) -> None:
        product = self._product(message="Hola {name}, consulto {product} por {price}")
        client = Client()
        status, headers, _ = client.call("/shop/whatsapp", "POST", {
            "csrf": public_csrf_token(), "product_id": product["id"], "name": "Ana Prueba",
            "phone": "3005556677", "quantity": "1", "source": "product",
            "note": "Color disponible", "consent": "1", "zona": "",
        })
        self.assertTrue(status.startswith("303"), status)
        self.assertTrue(headers.get("Location", "").startswith("https://wa.me/"))
        request = one("SELECT * FROM purchase_requests ORDER BY id DESC LIMIT 1")
        self.assertIn("Hola Ana Prueba", request["message"])
        self.assertIn(product["name"], request["message"])
        click = one("SELECT * FROM whatsapp_clicks WHERE request_id=?", (request["id"],))
        self.assertTrue(click["public_id"])
        self.assertEqual(click["source"], "product_request")
        self.assertEqual(click["message"], request["message"])

        status, _, body = client.call("/shop/whatsapp/click", "POST", {
            "csrf": public_csrf_token(), "source": "float",
            "url": "https://wa.me/573001234567?text=Hola", "path": "/shop", "message": "Hola",
        })
        self.assertTrue(status.startswith("200"), status)
        payload = json.loads(body)
        standalone = one("SELECT * FROM whatsapp_clicks WHERE public_id=?", (payload["public_id"],))
        self.assertIsNotNone(standalone)
        self.assertIsNone(standalone["request_id"])
        self.assertEqual(standalone["source"], "float")

    def test_03_manual_payment_is_explicit(self) -> None:
        product = self._product(cost="90000", price="300000")
        phone = f"300{uuid.uuid4().int % 100000000:08d}"
        status, _, _ = self.admin.call("/admin/orders/create", "POST", {
            "csrf": self.admin.csrf, "name": "Cliente Pago", "phone": phone,
            "product_id": product["id"], "quantity": "1", "shipping": "0",
            "payment_method": "Transferencia", "payment_status": "paid",
        })
        self.assertTrue(status.startswith("303"), status)
        order = one("SELECT * FROM orders ORDER BY id DESC LIMIT 1")
        self.assertEqual(order["source"], "manual")
        self.assertEqual(order["payment_status"], "paid")
        self.assertEqual(order["payment_method"], "Transferencia")
        self.assertIsNotNone(order["paid_at"])
        item = one("SELECT * FROM order_items WHERE order_id=?", (order["id"],))
        self.assertEqual(item["cost_cents"], 9000000)
        history = query("SELECT * FROM order_history WHERE order_id=?", (order["id"],))
        self.assertTrue(any("pago registrado manualmente" in (row["note"] or "").lower() for row in history))

        status, _, _ = self.admin.call("/admin/orders/create", "POST", {
            "csrf": self.admin.csrf, "name": "Cliente Pago", "phone": phone,
            "product_id": product["id"], "quantity": "1", "shipping": "0",
        })
        self.assertTrue(status.startswith("303"), status)
        unpaid = one("SELECT * FROM orders ORDER BY id DESC LIMIT 1")
        self.assertEqual(unpaid["payment_status"], "unpaid")
        self.assertIsNone(unpaid["paid_at"])

    def test_04_conversion_keeps_zone_and_rate(self) -> None:
        product = self._product(cost="50000", price="100000", stock="5")
        zone = one("SELECT id FROM delivery_zones WHERE active=1 ORDER BY id LIMIT 1")
        self.assertIsNotNone(zone)
        shipping_cents = 25000
        rate = one("SELECT id FROM zone_rates WHERE zone_id=? AND modality='stock' ORDER BY id LIMIT 1",
                   (zone["id"],))
        if rate:
            execute("UPDATE zone_rates SET active=1,price_cents=? WHERE id=?", (shipping_cents, rate["id"]))
        else:
            execute(
                "INSERT INTO zone_rates(zone_id,modality,label,price_cents,estimated_hours,conditions,active) "
                "VALUES (?,?,?,?,?,?,1)", (zone["id"], "stock", "Zona QA", shipping_cents, 24, "Prueba"),
            )
        phone = f"300{uuid.uuid4().int % 100000000:08d}"
        customer_id = execute(
            "INSERT INTO customers(name,phone,whatsapp,data_consent) VALUES (?,?,?,1)",
            ("Solicitante QA", phone, phone),
        ).lastrowid
        code = "QA-" + uuid.uuid4().hex[:10].upper()
        request_id = execute(
            "INSERT INTO purchase_requests(code,product_id,customer_id,name,phone,quantity,source,zone_id) "
            "VALUES (?,?,?,?,?,1,'product',?)",
            (code, product["id"], customer_id, "Solicitante QA", phone, zone["id"]),
        ).lastrowid
        status, _, _ = self.admin.call(f"/admin/requests/{request_id}/convert", "POST",
                                       {"csrf": self.admin.csrf})
        self.assertTrue(status.startswith("303"), status)
        order = one("SELECT * FROM orders ORDER BY id DESC LIMIT 1")
        self.assertEqual(order["source"], "request")
        self.assertEqual(order["zone_id"], zone["id"])
        self.assertEqual(order["shipping_cents"], shipping_cents)
        self.assertEqual(order["total_cents"], product["price_cents"] + shipping_cents)

    def test_05_inactive_rate_survives_update(self) -> None:
        rate = one("SELECT id,active FROM zone_rates ORDER BY id LIMIT 1")
        self.assertIsNotNone(rate)
        original = rate["active"]
        try:
            status, _, _ = self.admin.call(f"/admin/coverage/rates/{rate['id']}/update", "POST", {
                "csrf": self.admin.csrf, "price": "123", "hours": "12", "label": "Inactiva QA", "active": "0",
            })
            self.assertTrue(status.startswith("303"), status)
            self.assertEqual(one("SELECT active FROM zone_rates WHERE id=?", (rate["id"],))["active"], 0)
        finally:
            execute("UPDATE zone_rates SET active=? WHERE id=?", (original, rate["id"]))

    def test_06_page_states_block_stateful_requests_before_csrf(self) -> None:
        row = one("SELECT status FROM site_pages WHERE code='shop'")
        original = row["status"]
        try:
            execute("UPDATE site_pages SET status='hidden' WHERE code='shop'")
            status, _, _ = Client().call("/shop/whatsapp/click", "POST", {})
            self.assertTrue(status.startswith("404"), status)
            status, _, _ = self.admin.call("/shop/whatsapp/click", "POST", {
                "csrf": self.admin.csrf, "source": "float",
                "url": "https://wa.me/573001234567?text=Hola",
            })
            self.assertTrue(status.startswith("200"), status)

            execute("UPDATE site_pages SET status='coming_soon' WHERE code='shop'")
            status, _, body = Client().call("/shop", "GET")
            self.assertTrue(status.startswith("200"))
            self.assertIn("próximamente", body.lower())
            status, _, _ = Client().call("/shop/whatsapp/click", "POST", {})
            self.assertTrue(status.startswith("403"), status)
        finally:
            execute("UPDATE site_pages SET status=? WHERE code='shop'", (original,))


class GranularPlayAvailabilityTests(unittest.TestCase):
    CODES = ("play", "play_home", "play_hub", "play_profile", "play_catalog", "play_api",
             "play_game_nexus_rush", "play_game_gravity", "play_game_star_hunter")

    @classmethod
    def setUpClass(cls) -> None:
        init_db()
        cls.admin = Client()
        assert cls.admin.login()
        cls.original = {}
        for code in cls.CODES:
            row = one("SELECT status FROM site_pages WHERE code=?", (code,))
            assert row, code
            cls.original[code] = row["status"]

    @classmethod
    def tearDownClass(cls) -> None:
        for code, status in cls.original.items():
            execute("UPDATE site_pages SET status=? WHERE code=?", (status, code))

    def setUp(self) -> None:
        for code, status in self.original.items():
            execute("UPDATE site_pages SET status=? WHERE code=?", (status, code))

    def set_status(self, code: str, status: str) -> None:
        row = one("SELECT id FROM site_pages WHERE code=?", (code,))
        state, _, _ = self.admin.call(f"/admin/pages/{row['id']}/status", "POST", {
            "csrf": self.admin.csrf, "status": status,
        })
        self.assertTrue(state.startswith("303"), state)

    def test_01_hidden_play_blocks_pages_api_and_assets(self) -> None:
        self.set_status("play", "hidden")
        for path in ("/play", "/play/hub", "/play/gravity", "/api/play/v1/games",
                     "/static/play/games/gravity/1.0.0/gravity.js"):
            state, _, _ = Client().call(path)
            self.assertTrue(state.startswith("404"), path)
        for path in ("/play", "/play/gravity", "/admin/pages"):
            state, _, _ = self.admin.call(path)
            self.assertTrue(state.startswith("200"), path)

    def test_02_page_only_play_shows_notice_without_access(self) -> None:
        self.set_status("play", "page_only")
        state, _, body = Client().call("/play")
        self.assertTrue(state.startswith("200"))
        self.assertIn("SOLO PÁGINA VISIBLE", body)
        self.assertNotIn('data-play-game="gravity"', body)
        state, _, _ = Client().call("/play/gravity")
        self.assertTrue(state.startswith("403"))
        state, _, body = Client().call("/api/play/v1/games")
        self.assertTrue(state.startswith("403"))
        self.assertIn("page_only", body)
        state, _, _ = Client().call("/static/play/games/gravity/1.0.0/gravity.js")
        self.assertTrue(state.startswith("404"))
        state, _, _ = self.admin.call("/play/gravity")
        self.assertTrue(state.startswith("200"))

    def test_03_children_are_filtered_independently(self) -> None:
        self.set_status("play_hub", "hidden")
        self.set_status("play_catalog", "coming_soon")
        self.set_status("play_game_gravity", "coming_soon")
        self.set_status("play_game_star_hunter", "hidden")
        state, _, body = Client().call("/play")
        self.assertTrue(state.startswith("200"))
        self.assertIn("PRÓXIMAMENTE", body)
        self.assertNotIn("data-play-game=", body)
        self.assertNotIn('data-hub-mode="hub"', body)
        state, _, _ = Client().call("/play/hub")
        self.assertTrue(state.startswith("404"))
        state, _, _ = Client().call("/play/games/star-hunter")
        self.assertTrue(state.startswith("404"))
        state, _, body = Client().call("/api/play/v1/games")
        self.assertTrue(state.startswith("200"))
        games = {row["code"]: row for row in json.loads(body)["games"]}
        self.assertNotIn("star-hunter", games)
        self.assertEqual(games["gravity"]["availability"], "coming_soon")
        state, _, _ = Client().call("/api/play/v1/games/gravity/manifest")
        self.assertTrue(state.startswith("403"))
        state, _, _ = Client().call("/api/play/v1/games/nexus-rush/manifest")
        self.assertTrue(state.startswith("200"))

    def test_04_available_game_exposes_page_manifest_and_assets(self) -> None:
        self.set_status("play_game_gravity", "available")
        state, _, body = Client().call("/play")
        self.assertTrue(state.startswith("200"))
        self.assertIn('data-hub-mode="hub"', body)
        self.assertIn('data-play-game="gravity"', body)
        state, _, body = Client().call("/play/gravity")
        self.assertTrue(state.startswith("200"))
        self.assertIn("data-game-result", body)
        state, _, _ = Client().call("/api/play/v1/games/gravity/manifest")
        self.assertTrue(state.startswith("200"))
        state, _, _ = Client().call("/static/play/games/gravity/1.0.0/gravity.js")
        self.assertTrue(state.startswith("200"))

    def test_05_admin_status_change_is_immediate(self) -> None:
        self.set_status("play_game_gravity", "hidden")
        state, _, _ = Client().call("/play/gravity")
        self.assertTrue(state.startswith("404"))
        self.set_status("play_game_gravity", "available")
        state, _, _ = Client().call("/play/gravity")
        self.assertTrue(state.startswith("200"))


class ProductEditRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        init_db()
        cls.admin = Client()
        assert cls.admin.login()

    def create_legacy_product(self) -> int:
        name = "Producto heredado QA " + uuid.uuid4().hex[:6]
        form = {
            "csrf": self.admin.csrf, "name": name, "modality": "order",
            "status": "draft", "price": "99000", "cost": "", "sku": "", "short_description": "",
            "description": "", "supplier_url": "", "tags": "", "attributes": "",
            "whatsapp_message": "", "seo_title": "", "seo_description": "",
        }
        state, _, _ = self.admin.call("/admin/products/create", "POST", form)
        self.assertTrue(state.startswith("303"), state)
        product = one("SELECT id FROM products WHERE name=?", (name,))
        assert product
        execute(
            "UPDATE products SET compare_price_cents=0, cost_cents=0, target_margin_percent=0, "
            "whatsapp_message='', attributes='{}', seo_title='', seo_description='', tags='', "
            "supplier_url='', sku='', short_description='', description='', category_id=NULL, "
            "supplier_id=NULL WHERE id=?", (product["id"],)
        )
        return product["id"]

    def test_01_edit_legacy_product_without_500(self) -> None:
        pid = self.create_legacy_product()
        state, _, body = self.admin.call(f"/admin/products/{pid}/edit")
        self.assertTrue(state.startswith("200"), state[:200])
        self.assertNotIn("500 -", body)
        self.assertIn("Producto heredado QA", body)

        state, _, _ = self.admin.call(f"/admin/products/{pid}/update", "POST", {
            "csrf": self.admin.csrf, "name": "Producto heredado editado", "modality": "order",
            "status": "draft", "price": "129000", "cost": "70000", "target_margin_percent": "35",
            "attributes": "Color: Azul", "whatsapp_message": "Hola, quiero este producto",
            "seo_title": "Producto editado QA", "seo_description": "Descripción SEO editada",
            "tags": "qa, heredado",
        })
        self.assertTrue(state.startswith("303"), state)
        saved = one("SELECT * FROM products WHERE id=?", (pid,))
        self.assertEqual(saved["name"], "Producto heredado editado")
        self.assertEqual(saved["price_cents"], 12900000)
        self.assertEqual(saved["cost_cents"], 7000000)
        self.assertEqual(saved["target_margin_percent"], 35)
        self.assertEqual(saved["whatsapp_message"], "Hola, quiero este producto")
        self.assertEqual(saved["seo_title"], "Producto editado QA")

        state, _, body = self.admin.call(f"/admin/products/{pid}/edit")
        self.assertTrue(state.startswith("200"))
        self.assertIn("Producto heredado editado", body)
        self.assertIn("Producto editado QA", body)
        self.assertIn("Color: Azul", body)

    def test_02_variants_can_be_edited(self) -> None:
        pid = self.create_legacy_product()
        state, _, _ = self.admin.call(f"/admin/products/{pid}/variants", "POST", {
            "csrf": self.admin.csrf, "name": "Talla S", "sku": "QA-S", "price_delta": "-1000", "stock": "3",
        })
        self.assertTrue(state.startswith("303"), state)
        variant = one("SELECT * FROM product_variants WHERE product_id=?", (pid,))
        assert variant
        state, _, body = self.admin.call(f"/admin/products/{pid}/edit")
        self.assertTrue(state.startswith("200"))
        self.assertIn("Talla S", body)
        self.assertIn("QA-S", body)
        self.assertIn("Guardar", body)

        state, _, _ = self.admin.call(
            f"/admin/products/{pid}/variants/{variant['id']}/update", "POST", {
                "csrf": self.admin.csrf, "name": "Talla M", "sku": "QA-M",
                "price_delta": "1500", "stock": "7", "active": "1",
            })
        self.assertTrue(state.startswith("303"), state)
        saved = one("SELECT * FROM product_variants WHERE id=?", (variant["id"],))
        self.assertEqual(saved["name"], "Talla M")
        self.assertEqual(saved["sku"], "QA-M")
        self.assertEqual(saved["price_delta_cents"], 150000)
        self.assertEqual(saved["stock"], 7)
        self.assertEqual(saved["active"], 1)


class ShopHeroTests(unittest.TestCase):
    def test_hero_is_light_and_actionable(self) -> None:
        state, _, body = Client().call("/shop")
        self.assertTrue(state.startswith("200"))
        self.assertIn("shop-hero", body)
        self.assertIn('action="/shop/catalogo"', body)
        self.assertIn('href="/shop/cobertura"', body)
        self.assertNotIn('style="margin-top:.5rem;color:#fff"', body)
        css = (Path(__file__).resolve().parents[1] / "app/static/css/style.css").read_text(encoding="utf-8")
        self.assertIn("linear-gradient(135deg,#fffdf8 0%,#f7f9ff 48%,#eaf4fb 100%)", css)
        self.assertNotIn("linear-gradient(120deg,#211b52,#3f2f9e 55%,#0f766e)", css)


class DeploymentReadinessTests(unittest.TestCase):
    def test_health_endpoint_is_public_json(self) -> None:
        status, headers, body = Client().call("/health")
        self.assertTrue(status.startswith("200"))
        self.assertIn("application/json", headers.get("Content-Type", ""))
        payload = json.loads(body)
        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["db"], Config.DB_BACKEND)

    def test_postgres_sql_adaptation(self) -> None:
        sql = db_backend.adapt_sql(
            "INSERT OR IGNORE INTO settings(category,key,value) VALUES (?,?,?)"
        )
        self.assertIn("VALUES (%s,%s,%s)", sql)
        self.assertTrue(sql.endswith("ON CONFLICT DO NOTHING"))
        self.assertNotIn("?", sql)
        dated = db_backend.adapt_sql("SELECT * FROM visits WHERE date(created_at)>=date(?)")
        self.assertIn("CAST(created_at AS DATE)>=CAST(%s AS DATE)", dated)
        recent = db_backend.adapt_sql("SELECT * FROM visits WHERE created_at >= datetime('now','-1 hour')")
        self.assertIn("to_char(CURRENT_TIMESTAMP - INTERVAL '1 hour'", recent)
        today = db_backend.adapt_sql("SELECT date('now')")
        self.assertIn("CURRENT_DATE", today)

    def test_storage_rejects_unsafe_names(self) -> None:
        for name in ("../secret.key", "a/b.png", "", ".."):
            with self.assertRaises(storage.StorageError):
                storage._object_name(name)

    def test_local_storage_backend_is_default(self) -> None:
        self.assertEqual(Config.DB_BACKEND, "sqlite")
        self.assertEqual(Config.STORAGE_BACKEND, "local")


class WhatIfSimulationTests(unittest.TestCase):
    API = "/api/what-if/v1"
    JUDEA_IDEA = "Viajar al año 30 d. C., en Judea, con conocimientos de la historia futura"

    @classmethod
    def setUpClass(cls) -> None:
        init_db()
        cls.client = Client()

    def setUp(self) -> None:
        status, _, body = self.client.call(self.API + "/guest")
        self.assertTrue(status.startswith("200"), body[:200])
        self.guest = json.loads(body)["token"]
        previous = one("SELECT value FROM settings WHERE category='whatif' AND key='text_provider'")
        if previous:
            self.addCleanup(set_setting, "whatif", "text_provider", previous["value"])
        set_setting("whatif", "text_provider", "local")
        set_setting("whatif", "image_provider", "schematic")

    def api(self, path: str, form: dict | None = None, method: str = "GET", guest: str = "") -> tuple[str, dict]:
        params = dict(form or {})
        params["guest"] = guest or self.guest
        if method == "POST":
            params["csrf"] = public_csrf_token()
            status, _, body = self.client.call(self.API + path, method, params)
        else:
            separator = "&" if "?" in path else "?"
            status, _, body = self.client.call(self.API + path + separator + urllib.parse.urlencode(params))
        return status, json.loads(body)

    def _key(self, label: str) -> str:
        return f"sim-{self._testMethodName}-{label}-{uuid.uuid4().hex[:8]}"

    def _create_judea(self) -> int:
        payload = {
            "title": "Judea, año 30 d. C.",
            "premise": self.JUDEA_IDEA,
            "description": "Una simulación histórica sobre decisiones imposibles en Judea.",
            "genre": "historia-alternativa",
            "style": "realista",
            "depth": "rapida",
            "format": "interactivo",
            "first_scene": "Una caravana se detiene al amanecer en el camino de Jerusalén.",
            "rules": json.dumps([
                {"text": "El viajero conoce la historia futura, pero no puede probarla", "kind": "established"},
                {"text": "La escena debe respetar el contexto de Judea en el año 30", "kind": "established"},
            ]),
            "characters": json.dumps([
                {"name": "María", "identity": "Comerciante de la caravana", "personality": "Prudente y curiosa"},
                {"name": "Simón", "identity": "Guardia del templo", "personality": "Desconfiado"},
            ]),
            "locations": json.dumps([
                {"name": "Camino de Jerusalén", "kind": "ruta", "description": "Un sendero polvoriento al amanecer"},
                {"name": "Puesto de la caravana", "kind": "asentamiento", "description": "Tiendas bajas y mercancías dispersas"},
            ]),
            "chapter_length": "escena",
            "point_of_view": "segunda persona",
            "idempotency_key": self._key("judea"),
        }
        status, data = self.api("/realities", payload, "POST")
        self.assertTrue(status.startswith("200"), data)
        return int(data["reality"]["id"])

    def test_judea_simulation_full_flow(self) -> None:
        reality_id = self._create_judea()
        status, created = self.api(f"/realities/{reality_id}")
        self.assertTrue(status.startswith("200"), created)
        self.assertIn("Judea", created["reality"]["premise"])
        simulation = created.get("simulation") or {}
        self.assertTrue(simulation)
        self.assertEqual(int(simulation.get("scene_number") or 0), 1)
        self.assertTrue(str(simulation.get("content") or "").strip())
        self.assertTrue(3 <= len(simulation.get("suggested_actions") or []) <= 5)
        self.assertTrue(simulation.get("location"))
        self.assertTrue(simulation.get("characters_present"))
        cards = query(
            "SELECT metadata FROM whatif_memory_cards WHERE reality_id=? AND kind='simulation' ORDER BY id DESC",
            (reality_id,),
        )
        self.assertTrue(cards)
        self.assertEqual(json.loads(cards[0]["metadata"]).get("source"), "simulation")

        status, advanced = self.api(f"/realities/{reality_id}/turn", {
            "action": "Preguntar a María qué ha visto en el camino",
            "timeline": created["timeline_id"],
            "idempotency_key": self._key("turn"),
        }, "POST")
        self.assertTrue(status.startswith("200"), advanced)
        self.assertEqual(int(advanced["simulation"]["scene_number"]), 2)
        self.assertEqual(advanced["simulation"]["last_action"], "Preguntar a María qué ha visto en el camino")
        self.assertTrue(3 <= len(advanced["simulation"]["suggested_actions"]) <= 5)
        self.assertTrue(advanced["memories"].get("current"))

        status, branched = self.api(f"/realities/{reality_id}/turn", {
            "action": "Cambiar el pasado antes de que la caravana llegue",
            "timeline": advanced["timeline_id"],
            "branch": 1,
            "idempotency_key": self._key("branch"),
        }, "POST")
        self.assertTrue(status.startswith("200"), branched)
        self.assertNotEqual(int(branched["timeline_id"]), int(created["timeline_id"]))
        self.assertEqual(int(branched["simulation"]["scene_number"]), 1)
        versions = query("SELECT action FROM whatif_versions WHERE reality_id=? ORDER BY id DESC", (reality_id,))
        self.assertTrue(any(row["action"] == "branch" for row in versions))

        status, _, body = self.client.call(self.API + f"/guest")
        outsider = json.loads(body)["token"]
        status, denied = self.api(f"/realities/{reality_id}", guest=outsider)
        self.assertEqual(status[:3], "404")
        self.assertFalse(denied["ok"])

    def test_simulator_templates_and_markup(self) -> None:
        root = Path(__file__).resolve().parents[1]
        home = (root / "app/templates/whatif/home.html").read_text(encoding="utf-8")
        space = (root / "app/templates/whatif/space.html").read_text(encoding="utf-8")
        script = (root / "app/static/whatif/1.0.2/whatif.js").read_text(encoding="utf-8")
        self.assertIn("NO LEAS OTRA REALIDAD. VÍVELA.", home)
        self.assertIn("PLANTILLAS DE SIMULACIÓN", home)
        self.assertIn("data-wi-actions", space)
        self.assertIn("data-wi-action-form", space)
        self.assertIn("data-wi-scene-characters", space)
        self.assertIn("/realities/' + state.reality.id + '/turn", script)
        status, config = self.api("/config")
        self.assertTrue(status.startswith("200"), config)
        templates = config.get("simulation_templates") or []
        self.assertTrue(any(item.get("idea") == self.JUDEA_IDEA for item in templates))


class WhatIfNarrativeQualityTests(unittest.TestCase):
    API = "/api/what-if/v1"
    IDEAS = (
        ("Viajar al año 30 d. C., en Judea, con conocimientos de la historia futura", ("Judea", "caravana", "Jerusalén")),
        ("¿Y si los dinosaurios nunca se hubieran extinguido?", ("fósil", "huella", "helechos")),
        ("Dos desconocidos descubren que comparten los mismos sueños", ("sueño", "cuaderno", "Nera")),
        ("La humanidad recibe una señal extraterrestre", ("marciana", "Estación Umbral", "Ada")),
        ("Despertar en una civilización futurista", ("ciudad", "Ine", "memoria")),
    )
    BANNED = (
        r"\b\d+\.\d+\.\d+\b",
        r"\[(?:established|proposed|confirmed|unknown|belief)\]",
        r"(?i)\bciclos?\b",
        r"(?i)\bbloques?\b",
        r"(?i)\bregistros?\b",
        r"(?i)\bregistrad[oa]s?\b",
        r"(?i)\bsecuencias?\b",
        r"(?i)\bfragmentos?\b",
        r"(?i)nadie había registrado",
        r"(?i)la explicación parecía suficiente",
        r"(?i)la intervención reciente obligaba",
        r"(?i)ya no es una hipótesis",
        r"(?i)acaba de dejar de ser una idea",
    )
    SECOND_PERSON = re.compile(
        r"\b(?:despiertas|llegas|oyes|elegiste|entraste|creíste|acercas|ves|viste|decides|haces|tomas|guardas|sientes|podías|sigues|compruebas)\b",
        re.IGNORECASE,
    )
    SENSORY = (
        "luz", "polvo", "vapor", "humo", "zumbido", "frío", "olor", "sombra", "niebla", "bruma",
        "aire", "barro", "helechos", "cristal", "caravana", "camino", "mercancías", "voz", "sello",
        "moneda", "pergamino", "huella", "fósil", "ramas", "hueso", "pluma", "cáscara", "diente",
        "hoja", "sueño", "cuaderno", "carta", "reloj", "tinta", "aguja", "marciana", "estación",
        "antena", "pantalla", "cápsula", "lámina", "consola", "ciudad", "pasarela", "vehículo",
        "torre", "tarjeta", "pulsera",
    )

    @classmethod
    def setUpClass(cls) -> None:
        init_db()
        cls.client = Client()

    def setUp(self) -> None:
        status, _, body = self.client.call(self.API + "/guest")
        self.assertTrue(status.startswith("200"), body[:200])
        self.guest = json.loads(body)["token"]
        for key, value in (("text_provider", "local"), ("image_provider", "schematic"), ("generate_images", "0")):
            row = one("SELECT value FROM settings WHERE category='whatif' AND key=?", (key,))
            if row:
                self.addCleanup(set_setting, "whatif", key, row["value"])
            set_setting("whatif", key, value)

    def api(self, path: str, form: dict, method: str = "POST") -> tuple[str, dict]:
        params = dict(form)
        params["guest"] = self.guest
        params["csrf"] = public_csrf_token()
        status, _, body = self.client.call(self.API + path, method, params)
        return status, json.loads(body)

    def key(self, label: str) -> str:
        return f"narrative-{self._testMethodName}-{label}-{uuid.uuid4().hex[:8]}"

    def create(self, idea: str, label: str) -> dict:
        proposal = engine.local_proposal({"idea": idea})
        payload = {
            "title": proposal["title"],
            "premise": proposal["premise"],
            "description": proposal["description"],
            "genre": proposal["genre"],
            "style": proposal["style"],
            "depth": proposal["depth"],
            "format": proposal["format"],
            "first_scene": proposal["first_scene"],
            "rules": json.dumps(proposal["rules"]),
            "characters": json.dumps(proposal["characters"]),
            "locations": json.dumps(proposal["locations"]),
            "chapter_length": "escena",
            "point_of_view": "segunda persona",
            "idempotency_key": self.key(label),
        }
        status, data = self.api("/realities", payload)
        self.assertTrue(status.startswith("200"), data)
        return data

    def section(self, content: str, name: str) -> str:
        match = re.search(rf"^# {re.escape(name)}\s*$(.*?)(?=^# |\Z)", content, flags=re.MULTILINE | re.DOTALL)
        return match.group(1).strip() if match else ""

    def bullets(self, section: str) -> list[str]:
        return [line[2:].strip() for line in section.splitlines() if line.strip().startswith("- ")]

    def assert_clean(self, content: str) -> None:
        for pattern in self.BANNED:
            self.assertNotRegex(content, pattern)

    def paragraphs(self, content: str) -> set[str]:
        return {
            item.strip().lower()
            for item in re.split(r"\n\s*\n", content)
            if item.strip()
        }

    def test_five_hypotheses_are_immersive(self) -> None:
        titles: set[str] = set()
        for index, (idea, keywords) in enumerate(self.IDEAS):
            data = self.create(idea, f"idea-{index}")
            chapter = data["chapter"]
            content = chapter["content"]
            self.assert_clean(content)
            self.assertTrue(140 <= len(content.split()) <= 500, len(content.split()))
            self.assertTrue(self.SECOND_PERSON.search(content), content[:300])
            self.assertTrue(any(word in content.lower() for word in self.SENSORY), content[:300])
            self.assertTrue(any(word.lower() in content.lower() for word in keywords), content[:300])
            self.assertTrue(self.section(content, "Tu llegada"))
            self.assertTrue(2 <= len(self.bullets(self.section(content, "Lo que debes saber"))) <= 5)
            self.assertTrue(3 <= len(self.bullets(self.section(content, "Posibilidades de esta realidad"))) <= 5)
            self.assertTrue(self.section(content, "Comienza la simulación"))
            self.assertNotIn("# Lo que debes saber", self.section(content, "Comienza la simulación"))
            titles.add(chapter["title"])
        self.assertEqual(len(titles), 5)

    def test_continuity_avoids_repetition(self) -> None:
        created = self.create(self.IDEAS[0][0], "origin")
        first = created["chapter"]["content"]
        self.assertNotIn("1.1.1", first)
        timeline_id = created["timeline_id"]
        current = created["memories"].get("current")
        previous_content = first
        previous_title = created["chapter"]["title"]
        actions = (
            "Preguntar a María qué sabe sobre la fecha",
            "Seguir a Simón sin revelar lo que sabes",
        )
        for index, action in enumerate(actions):
            status, data = self.api(f"/realities/{created['reality']['id']}/turn", {
                "action": action,
                "timeline": timeline_id,
                "idempotency_key": self.key(f"turn-{index}"),
            })
            self.assertTrue(status.startswith("200"), data)
            content = data["chapter"]["content"]
            self.assert_clean(content)
            self.assertIn(action.lower(), content.lower())
            self.assertFalse(self.paragraphs(previous_content) & self.paragraphs(content))
            self.assertNotEqual(previous_title, data["chapter"]["title"])
            self.assertNotIn("# Tu llegada", content)
            self.assertTrue(self.SECOND_PERSON.search(content), content[:300])
            self.assertTrue(data["memories"].get("current"))
            self.assertNotEqual(current, data["memories"].get("current"))
            current = data["memories"].get("current")
            previous_content = content
            previous_title = data["chapter"]["title"]


if __name__ == "__main__":
    unittest.main(verbosity=2)
