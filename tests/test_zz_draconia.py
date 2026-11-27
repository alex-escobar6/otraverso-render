"""Pruebas del espacio 3D privado de DRACONIA."""
from __future__ import annotations

import json
import re
import shutil
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_otraverso import Client  # noqa: E402

from app.config import Config  # noqa: E402
from app.db import init_db, one, query, transaction  # noqa: E402
from app.security import hash_password  # noqa: E402

COMPANION_EMAIL = "paula@draconia.test"
COMPANION_PASSWORD = "clave-segura-123"
OUTSIDER_EMAIL = "outsider@draconia.test"
ASSET_BASE = Path("/home/sistemas/otraverso/app/static/draconia/1.0.0")


class DraconiaCompanionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        init_db()
        with transaction() as conn:
            companion_role = conn.execute("SELECT id FROM roles WHERE code='draconia_explorer'").fetchone()[0]
            outsider_role = conn.execute("SELECT id FROM roles WHERE code='product_manager'").fetchone()[0]
            for email, name, role_id in (
                (COMPANION_EMAIL, "Paula", companion_role),
                (OUTSIDER_EMAIL, "Sin acceso", outsider_role),
            ):
                conn.execute(
                    "INSERT INTO users(name,email,password_hash,role_id) VALUES (?,?,?,?) "
                    "ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,"
                    "role_id=excluded.role_id,active=1",
                    (name, email, hash_password(COMPANION_PASSWORD), role_id),
                )
            companion_id = conn.execute("SELECT id FROM users WHERE email=?", (COMPANION_EMAIL,)).fetchone()[0]
            conn.execute("INSERT OR IGNORE INTO draconia_profiles(user_id) VALUES (?)", (companion_id,))
        cls.admin = Client()
        cls.companion = Client()
        cls.outsider = Client()
        assert cls.admin.login(), "No se pudo iniciar sesión como administrador"
        assert cls.companion.login(COMPANION_EMAIL, COMPANION_PASSWORD), "No se pudo iniciar sesión como compañero"
        assert cls.outsider.login(OUTSIDER_EMAIL, COMPANION_PASSWORD), "No se pudo iniciar sesión sin permiso"

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(Path(Config.DB_PATH).parent, ignore_errors=True)

    def test_01_minimal_schema_and_private_permissions(self) -> None:
        tables = {row[0] for row in query("SELECT name FROM sqlite_master WHERE type='table'")}
        draconia_tables = {name for name in tables if name.startswith("draconia_")}
        self.assertEqual(draconia_tables, {"draconia_profiles"})
        columns = {row[1] for row in query("PRAGMA table_info(draconia_profiles)")}
        self.assertTrue({"user_id", "dragon_name", "sound", "reduced_motion", "last_state"} <= columns)
        self.assertLessEqual(len(columns), 7)
        self.assertEqual(one("PRAGMA user_version")[0], 8)
        self.assertEqual(query("SELECT code FROM modules WHERE code='draconia'"), [])
        self.assertEqual(query("SELECT code FROM site_pages WHERE route LIKE '/draconia%'"), [])
        self.assertTrue(one("SELECT 1 FROM permissions WHERE code='draconia.view'"))
        self.assertTrue(one("SELECT 1 FROM permissions WHERE code='draconia.manage'"))
        self.assertTrue(one("SELECT 1 FROM roles WHERE code='draconia_explorer'"))
        settings = {row["key"] for row in query("SELECT key FROM settings WHERE category='draconia'")}
        self.assertEqual(settings, {"protagonist_name", "companion_default_name", "sound_default", "reduced_motion_default"})

    def test_02_access_control_and_single_scene(self) -> None:
        status, _, body = Client().call("/draconia")
        self.assertTrue(status.startswith("401"))
        self.assertIn("Debe iniciar sesión", body)
        status, _, _ = self.outsider.call("/draconia")
        self.assertTrue(status.startswith("403"))
        status, _, _ = self.outsider.call("/draconia/api/v1/state")
        self.assertTrue(status.startswith("403"))
        status, headers, body = self.companion.call("/draconia")
        self.assertTrue(status.startswith("200"))
        self.assertEqual(headers.get("X-Robots-Tag"), "noindex, nofollow")
        self.assertIn('id="draconia-stage"', body)
        self.assertIn("GLTFLoader.js", body)
        self.assertIn("world.js", body)
        self.assertIn("draconia.js", body)
        self.assertIn("Acariciar", body)
        self.assertIn("Llamar", body)
        self.assertIn("Jugar", body)
        self.assertIn("Descansar", body)
        self.assertIn("Dormir", body)
        self.assertIn("Volar", body)
        self.assertIn("Centrar", body)
        self.assertIn("Sonido", body)
        self.assertIn("draconia-loading", body)
        match = re.search(r'<script id="draconia-config" type="application/json">(.*?)</script>', body, re.S)
        self.assertIsNotNone(match)
        config = json.loads(match.group(1))
        self.assertEqual(config["version"], 4)
        self.assertEqual(config["api"], "/draconia/api/v1")
        self.assertEqual(config["assets"]["base"], "/static/draconia/1.0.0/")
        self.assertEqual(config["assets"]["dragon"], "/static/draconia/1.0.0/assets/dragon_organic/dragon.glb")
        model_config = config["assets"]["model"]
        self.assertEqual(model_config["path"], "assets/dragon_organic/dragon.glb")
        self.assertTrue(model_config["static"])
        self.assertEqual(model_config["transform"]["scale"], 0.38)
        self.assertEqual(model_config["transform"]["position"], [0, 0.04, 0])
        self.assertEqual(model_config["clips"], {})
        self.assertEqual(model_config["initialClip"], "")
        self.assertIn("Scales_Pearl", model_config["materials"])
        self.assertIn("dragon_name", config["profile"])
        self.assertIn("sound", config["profile"])
        self.assertIn("reduced_motion", config["profile"])
        self.assertIn("last_state", config["profile"])
        self.assertIn("animations", config["capabilities"])
        self.assertIn("states", config["capabilities"])
        self.assertIn("transitions", config["capabilities"])
        self.assertIn("flying", config["capabilities"]["transitions"]["idle"])
        self.assertNotIn("OTRAVERSO SHOP", body)
        for old_path in ("/draconia/reino", "/draconia/mapa", "/draconia/cartas",
                         "/draconia/recuerdos", "/draconia/calendario", "/draconia/habitacion"):
            status, _, _ = self.companion.call(old_path)
            self.assertTrue(status.startswith("404"), old_path)
        status, _, _ = self.companion.call("/draconia/entrar")
        self.assertTrue(status.startswith("303"))

    def test_03_login_flow(self) -> None:
        client = Client()
        status, _, body = client.call("/draconia/entrar")
        self.assertTrue(status.startswith("200"))
        self.assertIn('action="/draconia/entrar"', body)
        from app.core.auth import public_csrf_token
        status, headers, _ = client.call("/draconia/entrar", "POST", {
            "csrf": public_csrf_token(),
            "email": COMPANION_EMAIL,
            "password": COMPANION_PASSWORD,
        })
        self.assertTrue(status.startswith("303"))
        self.assertIn("otraverso_session=", headers.get("Set-Cookie", ""))

    def test_04_profile_api(self) -> None:
        csrf = self.companion.csrf
        status, _, body = self.companion.call("/draconia/api/v1/state")
        self.assertTrue(status.startswith("200"))
        payload = json.loads(body)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["version"], 4)
        self.assertEqual(payload["profile"]["dragon_name"], "Luma")
        self.assertTrue(payload["profile"]["sound"])
        self.assertFalse(payload["profile"]["reduced_motion"])
        self.assertEqual(len(payload["capabilities"]["states"]), 10)
        self.assertEqual(len(payload["capabilities"]["animations"]), 15)

        status, _, body = self.companion.call("/draconia/api/v1/name", "POST", {"csrf": csrf, "name": "Luna"})
        self.assertTrue(status.startswith("200"))
        self.assertEqual(json.loads(body)["name"], "Luna")
        status, _, body = self.companion.call("/draconia/api/v1/name", "POST", {"csrf": csrf, "name": ""})
        self.assertTrue(status.startswith("400"))
        error = json.loads(body)
        self.assertFalse(error["ok"])
        self.assertIn("caracteres", error["error"])

        status, _, body = self.companion.call("/draconia/api/v1/preferences", "POST", {
            "csrf": csrf, "sound": "0", "reduced_motion": "1",
        })
        self.assertTrue(status.startswith("200"))
        status, _, body = self.companion.call("/draconia/api/v1/state")
        profile = json.loads(body)["profile"]
        self.assertEqual(profile["dragon_name"], "Luna")
        self.assertFalse(profile["sound"])
        self.assertTrue(profile["reduced_motion"])

        status, _, body = self.companion.call("/draconia/api/v1/state", "POST", {
            "csrf": csrf, "state": "flying",
        })
        self.assertTrue(status.startswith("200"))
        self.assertEqual(json.loads(body)["state"], "flying")
        status, _, body = self.companion.call("/draconia/api/v1/state")
        self.assertEqual(json.loads(body)["profile"]["last_state"], "flying")
        status, _, body = self.companion.call("/draconia/api/v1/state", "POST", {
            "csrf": csrf, "state": "walking",
        })
        self.assertTrue(status.startswith("200"))
        self.assertEqual(json.loads(body)["state"], "idle")
        status, _, _ = self.companion.call("/draconia/api/v1/state", "POST", {
            "csrf": "wrong", "state": "idle",
        })
        self.assertTrue(status.startswith("400"))

    def test_05_admin_summary(self) -> None:
        status, _, body = self.admin.call("/admin/draconia")
        self.assertTrue(status.startswith("200"))
        self.assertIn("Preferencias iniciales", body)
        self.assertIn("Compañeros", body)
        self.assertIn("idle, curious, happy", body)
        status, _, _ = self.admin.call("/admin/draconia/save", "POST", {
            "csrf": self.admin.csrf,
            "name": "Perla",
            "sound": "0",
            "reduced_motion": "1",
        })
        self.assertTrue(status.startswith("303"))
        self.assertEqual(one("SELECT value FROM settings WHERE category='draconia' AND key='companion_default_name'")["value"], "Perla")
        self.assertEqual(one("SELECT value FROM settings WHERE category='draconia' AND key='sound_default'")["value"], "0")
        status, _, _ = self.outsider.call("/admin/draconia")
        self.assertTrue(status.startswith("403"))

    def test_06_three_dimensional_client(self) -> None:
        status, _, body = self.companion.call("/static/draconia/1.0.0/world.js")
        self.assertTrue(status.startswith("200"))
        for marker in ("DRACONIA_WORLD", "createRenderer", "MeshPhysicalMaterial", "GLTFLoader",
                       "AnimationMixer", "clipAction", "syncStateClip", "applyRig",
                       "ShaderMaterial", "requestAnimationFrame", "pointerdown", "wheel",
                       "onContextLost", "onContextRestored", "visibilitychange", "flying",
                       "playing", "sleeping", "interacting", "modelConfig", "modelConfig.path",
                        "clipFor", "materialTweak", "asVector", "shadowConfig", "staticModel"):
            self.assertIn(marker, body)
        for old in ("LatheGeometry", "ShapeGeometry", "CapsuleGeometry", "sculptSphere", "wingGeometry",
                    "var palette = {", "setScalar(0.38)", "assets/dragon.glb"):
            self.assertNotIn(old, body)
        self.assertNotIn("https://", body)
        self.assertNotIn("http://", body)
        for old in ("territorio", "castillo", "cartas", "descubrimiento", "protecto"):
            self.assertNotIn(old, body.lower())

        status, _, body = self.companion.call("/static/js/vendor/GLTFLoader.js")
        self.assertTrue(status.startswith("200"))
        self.assertIn("THREE.GLTFLoader", body)

        model = ASSET_BASE / "assets" / "dragon_organic" / "dragon.glb"
        blend = ASSET_BASE / "assets" / "dragon_organic" / "dragon.blend"
        self.assertTrue(model.exists())
        self.assertTrue(blend.exists())
        data = model.read_bytes()
        self.assertEqual(data[:4], b"glTF")
        for name in (b"Khronos glTF Blender I/O", b"OrganicDragonMesh", b"Scales_Pearl",
                     b"Horn_Crystal", b"Membrane_Violet", b"Claw_Pearl", b"Eye_Violet"):
            self.assertIn(name, data)
        for name in (b"Fire Dragon", b"Ice Dragon", b'"animations"', b'"skins"'):
            self.assertNotIn(name, data)
        model_config = json.loads((ASSET_BASE / "assets" / "dragon.config.json").read_text(encoding="utf-8"))
        self.assertEqual(model_config["path"], "assets/dragon_organic/dragon.glb")
        self.assertEqual(model_config["name"], "Organic Dragon")
        self.assertTrue(model_config["static"])
        self.assertEqual(model_config["clips"], {})
        self.assertEqual(model_config["initialClip"], "")
        self.assertEqual(model_config["eyeMaterial"], "")
        self.assertEqual(model_config["materials"]["Membrane_Violet"]["side"], "DoubleSide")
        self.assertIn("Horn_Crystal", model_config["materials"])
        license_text = (ASSET_BASE / "assets" / "LICENSE-DRAGON.txt").read_text(encoding="utf-8")
        self.assertIn("Original work created for DRACONIA", license_text)
        self.assertIn("Blender 4.0.2", license_text)
        self.assertIn("No third-party model", license_text)

        status, _, body = self.companion.call("/static/draconia/1.0.0/draconia.js")
        self.assertTrue(status.startswith("200"))
        for marker in ("data-action", "pet", "play", "fly", "camera", "/name", "/preferences", "/state",
                       "AudioContext", "normalizeConfig", "loadRemotePreferences", "firstDefined",
                       "hideLoading", "draconia:ready", "pagehide"):
            self.assertIn(marker, body)
        self.assertNotIn("localStorage", body)

        css = ASSET_BASE / "draconia.css"
        source = css.read_text(encoding="utf-8")
        self.assertIn("touch-action:none", source)
        self.assertIn(".draconia-dock", source)
        self.assertIn(".draconia-loading", source)
        self.assertIn("@media(max-width:860px)", source)
        self.assertIn("@media(prefers-reduced-motion:reduce)", source)
        self.assertFalse((ASSET_BASE / "dragon-companion.svg").exists())
        self.assertFalse((ASSET_BASE / "portal-gate.svg").exists())
        self.assertFalse(Path("/home/sistemas/otraverso/app/services/draconia/state.py").exists())
        self.assertFalse(Path("/home/sistemas/otraverso/app/services/draconia/assets.py").exists())


if __name__ == "__main__":
    unittest.main()
