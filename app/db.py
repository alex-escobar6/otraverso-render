"""Capa de datos SQLite (WAL, FK activadas, migraciones versionadas y semilla segura)."""
from __future__ import annotations

import json
import secrets
import sqlite3
import stat
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable

from app.config import DATA_DIR, Config
from app.security import hash_password

SCHEMA_VERSION = 2

SCHEMA = """
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT DEFAULT '',
  details TEXT DEFAULT '{}',
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (category, key)
);
CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  coming_soon INTEGER NOT NULL DEFAULT 0 CHECK (coming_soon IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT DEFAULT '',
  url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  image TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT DEFAULT '',
  seo_description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sku TEXT DEFAULT '',
  short_description TEXT DEFAULT '',
  description TEXT DEFAULT '',
  modality TEXT NOT NULL DEFAULT 'stock' CHECK (modality IN ('stock','order')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  compare_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (compare_price_cents >= 0),
  cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0),
  import_days INTEGER NOT NULL DEFAULT 30 CHECK (import_days >= 0),
  delivery_hours INTEGER NOT NULL DEFAULT 24 CHECK (delivery_hours >= 0),
  supplier_url TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  attributes TEXT DEFAULT '{}',
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  best_seller INTEGER NOT NULL DEFAULT 0 CHECK (best_seller IN (0,1)),
  is_new INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0,1)),
  views INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT DEFAULT '',
  seo_description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT DEFAULT '',
  price_delta_cents INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE TABLE IF NOT EXISTS product_related (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  related_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, related_id)
);
CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entry','exit','adjustment')),
  quantity INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE TABLE IF NOT EXISTS municipalities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE TABLE IF NOT EXISTS delivery_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'municipality' CHECK (kind IN ('city','municipality','neighborhood')),
  description TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE TABLE IF NOT EXISTS zone_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,
  modality TEXT NOT NULL CHECK (modality IN ('stock','order')),
  label TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  estimated_hours INTEGER NOT NULL DEFAULT 24 CHECK (estimated_hours >= 0),
  conditions TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (zone_id, modality)
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '',
  municipality TEXT DEFAULT '',
  address TEXT DEFAULT '',
  id_type TEXT DEFAULT '',
  id_number TEXT DEFAULT '',
  data_consent INTEGER NOT NULL DEFAULT 0 CHECK (data_consent IN (0,1)),
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS purchase_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  source TEXT NOT NULL DEFAULT 'product',
  message TEXT DEFAULT '',
  whatsapp_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'contacted' CHECK (status IN ('contacted','converted','closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatsapp_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  request_id INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'product',
  phone TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' REFERENCES order_statuses(code),
  modality TEXT NOT NULL CHECK (modality IN ('stock','order')),
  zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
  shipping_address TEXT DEFAULT '',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_cents INTEGER NOT NULL DEFAULT 0,
  modality TEXT NOT NULL DEFAULT 'stock',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT DEFAULT '',
  to_status TEXT NOT NULL,
  note TEXT DEFAULT '',
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  image TEXT DEFAULT '',
  link TEXT DEFAULT '/shop',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  value_cents INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE TABLE IF NOT EXISTS home_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  modality TEXT NOT NULL DEFAULT 'any' CHECK (modality IN ('any','stock','order')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  ip_hash TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  path TEXT DEFAULT '',
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  query TEXT DEFAULT '',
  referrer TEXT DEFAULT '',
  extra TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_modality ON products(modality);
CREATE INDEX IF NOT EXISTS idx_analytics_type_date ON analytics_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_date ON purchase_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id, created_at);
"""

PERMISSIONS: dict[str, str] = {
    "dashboard.view": "Ver dashboard e indicadores",
    "products.view": "Ver productos",
    "products.edit": "Crear, editar y publicar productos",
    "products.delete": "Eliminar productos",
    "inventory.view": "Ver inventario y movimientos",
    "inventory.move": "Registrar entradas, salidas y ajustes",
    "orders.view": "Ver pedidos y solicitudes",
    "orders.edit": "Gestionar estados y pedidos",
    "customers.view": "Ver clientes",
    "customers.edit": "Editar clientes",
    "marketing.edit": "Gestionar banners, promociones y cupones",
    "coverage.manage": "Gestionar cobertura y tarifas",
    "whatsapp.manage": "Gestionar número y plantillas de WhatsApp",
    "settings.edit": "Editar configuración comercial y visual",
    "seo.manage": "Editar SEO y metadatos",
    "analytics.view": "Ver analítica",
    "users.manage": "Gestionar usuarios, roles y permisos",
    "audit.view": "Ver bitácora de auditoría",
    "backup.manage": "Crear y descargar copias de seguridad",
}

ROLES: dict[str, set[str]] = {
    "superadmin": set(PERMISSIONS),
    "admin": set(PERMISSIONS) - {"users.manage", "backup.manage"},
    "product_manager": {
        "dashboard.view", "products.view", "products.edit", "inventory.view",
        "inventory.move", "marketing.edit", "analytics.view",
    },
    "order_manager": {
        "dashboard.view", "products.view", "orders.view", "orders.edit",
        "customers.view", "customers.edit", "analytics.view",
    },
}

DEFAULT_SETTINGS: dict[str, dict[str, str]] = {
    "commercial": {
        "business_name": "OTRAVERSO SHOP",
        "legal_name": "OTRAVERSO",
        "description": "Productos novedosos con entrega local rápida en Pasto y municipios aledaños.",
        "country": "Colombia",
        "department": "Nariño",
        "city": "Pasto",
        "address": "Pasto, Nariño, Colombia",
        "currency": "COP",
        "phone": "",
        "email": "contacto@otraverso.local",
        "whatsapp": Config.WHATSAPP_DEFAULT,
        "hours": "Lunes a sábado, 9:00 a 18:00",
        "delivery_note": "Los plazos dependen de la modalidad del producto y de la zona de destino.",
        "import_conditions": "Los productos bajo pedido se solicitan a proveedores internacionales; el tiempo estimado de importación es independiente del tiempo de entrega local.",
        "terms": "La apertura del chat de WhatsApp no confirma una venta. La disponibilidad y condiciones se confirman con el vendedor.",
        "privacy": "Los datos se usan únicamente para gestionar solicitudes y pedidos, conforme a la Ley 1581 de 2012 de Colombia.",
        "returns": "Las devoluciones se evalúan según la modalidad del producto y las condiciones informadas antes de la compra.",
        "payment_methods": "Pago informativo acordado por WhatsApp. Esta tienda no procesa pagos en línea.",
        "footer_text": "OTRAVERSO — Hay más de un mundo por descubrir.",
        "social_instagram": "",
        "social_facebook": "",
        "social_tiktok": "",
    },
    "seo": {
        "title": "OTRAVERSO — Hay más de un mundo por descubrir",
        "description": "Plataforma digital modular con tienda de productos novedosos y entrega local en Pasto, Nariño.",
        "keywords": "OTRAVERSO, tienda Pasto, Nariño, productos novedosos, entrega rápida",
        "og_image": "",
        "robots_index": "1",
        "canonical": Config.BASE_URL,
    },
    "visual": {
        "logo": "",
        "favicon": "",
        "primary_color": "#6d5cff",
        "secondary_color": "#19d3c5",
        "accent_color": "#ffb347",
        "background_color": "#070713",
        "font_family": "system-ui, -apple-system, Segoe UI, sans-serif",
        "hero_title": "Hay más de un mundo por descubrir",
        "hero_subtitle": "OTRAVERSO es una plataforma modular: entra por la tienda, descubre productos locales y bajo pedido.",
        "shop_hero_title": "Novedoso, cercano y confiable",
        "shop_hero_subtitle": "Productos con disponibilidad real, entregas rápidas en Pasto y opciones bajo pedido.",
        "footer_visible": "1",
        "whatsapp_button_visible": "1",
    },
    "whatsapp": {
        "enabled": "1",
        "default_message": "Hola OTRAVERSO, quiero información sobre sus productos.",
        "product_message": "Hola, estoy interesado en comprar este producto de OTRAVERSO:\n\nProducto: {product}\nPrecio: {price}\nModalidad: {modality}\nTiempo estimado: {delivery}\n\n¿Me pueden brindar información para realizar la compra?",
        "order_message": "Hola OTRAVERSO, quiero solicitar este producto bajo pedido:\n\nProducto: {product}\nPrecio: {price}\nModalidad: Bajo pedido\nTiempo estimado de importación: {delivery}\n\nEntiendo que no está en inventario y que la importación puede tardar. ¿Me brindan información para solicitarlo?",
        "contact_message": "Hola OTRAVERSO, quiero hablar con ustedes.",
    },
}


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(Config.DB_PATH, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


@contextmanager
def transaction():
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def query(sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(sql, tuple(params)).fetchall()


def one(sql: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute(sql, tuple(params)).fetchone()


def scalar(sql: str, params: Iterable[Any] = (), default: Any = 0) -> Any:
    row = one(sql, params)
    if row is None:
        return default
    return row[0]


def execute(sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
    with transaction() as conn:
        return conn.execute(sql, tuple(params))


def init_db() -> None:
    Config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        _migrate(conn)
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
    _seed()


def _migrate(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(products)")}
    if "seo_title" not in columns:
        conn.execute("ALTER TABLE products ADD COLUMN seo_title TEXT DEFAULT ''")
    if "seo_description" not in columns:
        conn.execute("ALTER TABLE products ADD COLUMN seo_description TEXT DEFAULT ''")


def _seed() -> None:
    with transaction() as conn:
        for code, description in PERMISSIONS.items():
            conn.execute("INSERT OR IGNORE INTO permissions(code, description) VALUES (?, ?)", (code, description))
        for code, perms in ROLES.items():
            conn.execute("INSERT OR IGNORE INTO roles(code, name, description) VALUES (?, ?, ?)", (
                code,
                {"superadmin": "Superadministrador", "admin": "Administrador",
                 "product_manager": "Gestor de productos", "order_manager": "Gestor de pedidos"}[code],
                "Rol del sistema OTRAVERSO",
            ))
            role_id = conn.execute("SELECT id FROM roles WHERE code = ?", (code,)).fetchone()[0]
            for perm in perms:
                conn.execute(
                    "INSERT OR IGNORE INTO role_permissions(role_id, permission_id) "
                    "SELECT ?, id FROM permissions WHERE code = ?", (role_id, perm)
                )

        modules = [
            ("portal", "OTRAVERSO", 1, 0, 0, "Portada principal y navegación de universos."),
            ("shop", "OTRAVERSO SHOP", 1, 0, 1, "Tienda de productos con inventario y bajo pedido."),
            ("whatif", "OTRAVERSO WHAT IF", 0, 1, 2, "Universo de inteligencia narrativa (planeado)."),
            ("play", "OTRAVERSO PLAY", 0, 1, 3, "Universo de juegos (planeado)."),
            ("labs", "OTRAVERSO LABS", 0, 1, 4, "Experimentos y herramientas (planeado)."),
        ]
        conn.executemany(
            "INSERT OR IGNORE INTO modules(code,name,enabled,coming_soon,sort_order,description) VALUES (?,?,?,?,?,?)",
            modules,
        )

        for category, values in DEFAULT_SETTINGS.items():
            for key, value in values.items():
                conn.execute(
                    "INSERT OR IGNORE INTO settings(category,key,value) VALUES (?,?,?)",
                    (category, key, value),
                )

        conn.executemany(
            "INSERT OR IGNORE INTO order_statuses(code,name,sort_order) VALUES (?,?,?)",
            [
                ("pending", "Pendiente", 1), ("confirmed", "Confirmado", 2),
                ("preparing", "En preparación", 3), ("shipped", "Enviado", 4),
                ("delivered", "Entregado", 5), ("importing", "Bajo importación", 6),
                ("cancelled", "Cancelado", 7),
            ],
        )
        conn.executemany(
            "INSERT OR IGNORE INTO whatsapp_templates(code,name,body,modality) VALUES (?,?,?,?)",
            [(k, k.replace("_", " ").title(), v, "any") for k, v in DEFAULT_SETTINGS["whatsapp"].items()],
        )
        conn.executemany(
            "INSERT OR IGNORE INTO home_sections(code,name,enabled,sort_order) VALUES (?,?,?,?)",
            [
                ("hero", "Banner principal", 1, 1), ("benefits", "Ventajas", 1, 2),
                ("categories", "Categorías", 1, 3), ("featured", "Destacados", 1, 4),
                ("fast", "Entrega rápida", 1, 5), ("new", "Novedades", 1, 6),
                ("bestsellers", "Más vendidos", 1, 7), ("order", "Bajo pedido", 1, 8),
                ("coverage", "Cobertura", 1, 9), ("promotions", "Promociones", 1, 10),
            ],
        )
        conn.execute(
            "INSERT OR IGNORE INTO departments(name, code) VALUES ('Nariño','NAR')"
        )
        dept_id = conn.execute("SELECT id FROM departments WHERE code='NAR'").fetchone()[0]
        municipalities = [
            "Pasto", "Ipiales", "Túquerres", "Obando", "Tumaco", "Barbacoas",
            "Samaniego", "La Unión", "Linares", "Politama", "Apontera", "Funes",
            "Guaitarilla", "Ospina", "Yacuanquer", "Consacá", "Gualmatán",
        ]
        for name in municipalities:
            slug = name.lower().replace("ú", "u").replace("á", "a").replace("í", "i").replace("ó", "o").replace("é", "e").replace(" ", "-")
            conn.execute(
                "INSERT OR IGNORE INTO municipalities(department_id,name,slug) VALUES (?,?,?)",
                (dept_id, name, slug),
            )
        pasto_id = conn.execute("SELECT id FROM municipalities WHERE slug='pasto'").fetchone()[0]
        conn.execute(
            "INSERT OR IGNORE INTO delivery_zones(municipality_id,name,kind,description) VALUES (?,?,?,?)",
            (pasto_id, "Pasto urbano", "city", "Zona urbana del municipio de Pasto"),
        )
        pasto_zone = conn.execute("SELECT id FROM delivery_zones WHERE municipality_id=? AND kind='city'", (pasto_id,)).fetchone()[0]
        conn.execute(
            "INSERT OR IGNORE INTO zone_rates(zone_id,modality,label,price_cents,estimated_hours,conditions) VALUES (?,?,?,?,?,?)",
            (pasto_zone, "stock", "Entrega en Pasto", 0, 24, "Sujeto a disponibilidad y confirmación del pedido."),
        )
        conn.execute(
            "INSERT OR IGNORE INTO zone_rates(zone_id,modality,label,price_cents,estimated_hours,conditions) VALUES (?,?,?,?,?,?)",
            (pasto_zone, "order", "Producto bajo pedido + entrega local", 0, 720, "El plazo de importación se confirma antes de solicitar."),
        )
        for name in municipalities[1:]:
            slug = name.lower().replace("ú", "u").replace("á", "a").replace("í", "i").replace("ó", "o").replace("é", "e").replace(" ", "-")
            muni_id = conn.execute("SELECT id FROM municipalities WHERE slug=?", (slug,)).fetchone()[0]
            conn.execute(
                "INSERT OR IGNORE INTO delivery_zones(municipality_id,name,kind,description) VALUES (?,?,?,?)",
                (muni_id, f"Zona {name}", "municipality", f"Cobertura general de {name}"),
            )
            zone_id = conn.execute("SELECT id FROM delivery_zones WHERE municipality_id=?", (muni_id,)).fetchone()[0]
            conn.execute(
                "INSERT OR IGNORE INTO zone_rates(zone_id,modality,label,price_cents,estimated_hours,conditions) VALUES (?,?,?,?,?,?)",
                (zone_id, "stock", f"Entrega en {name}", 0, 168, "Municipios aledaños habilitados individualmente."),
            )
            conn.execute(
                "INSERT OR IGNORE INTO zone_rates(zone_id,modality,label,price_cents,estimated_hours,conditions) VALUES (?,?,?,?,?,?)",
                (zone_id, "order", f"Bajo pedido + entrega en {name}", 0, 792, "Incluye importación estimada más entrega local."),
            )

        superadmin_id = conn.execute("SELECT id FROM users WHERE email=?", (Config.ADMIN_EMAIL.lower(),)).fetchone() if Config.ADMIN_EMAIL else None
        if superadmin_id:
            if Config.ADMIN_PASSWORD:
                conn.execute(
                    "UPDATE users SET password_hash=?, active=1, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                    (hash_password(Config.ADMIN_PASSWORD), superadmin_id[0]),
                )
        elif not conn.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            role_id = conn.execute("SELECT id FROM roles WHERE code='superadmin'").fetchone()[0]
            if Config.ADMIN_EMAIL and Config.ADMIN_PASSWORD:
                email, password, generated = Config.ADMIN_EMAIL.lower(), Config.ADMIN_PASSWORD, False
            else:
                email = "admin@otraverso.local"
                password = secrets.token_urlsafe(14)
                generated = True
            conn.execute(
                "INSERT INTO users(name,email,password_hash,role_id,active) VALUES (?,?,?,?,1)",
                ("Administrador OTRAVERSO", email, hash_password(password), role_id),
            )
            if generated:
                cred = DATA_DIR / "bootstrap_admin.txt"
                cred.write_text(f"Usuario: {email}\nContraseña temporal: {password}\n", encoding="utf-8")
                cred.chmod(stat.S_IRUSR | stat.S_IWUSR)
            # La contraseña nunca se guarda en texto plano en la base de datos.


def get_setting(category: str, key: str, default: str = "") -> str:
    row = one("SELECT value FROM settings WHERE category=? AND key=?", (category, key))
    return row[0] if row else default


def set_setting(category: str, key: str, value: str) -> None:
    execute(
        "INSERT INTO settings(category,key,value) VALUES (?,?,?) "
        "ON CONFLICT(category,key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
        (category, key, str(value)),
    )


def settings_group(category: str) -> dict[str, str]:
    return {row["key"]: row["value"] for row in query("SELECT key,value FROM settings WHERE category=?", (category,))}


def modules_enabled() -> set[str]:
    return {row["code"] for row in query("SELECT code FROM modules WHERE enabled=1")}


def module_row(code: str) -> sqlite3.Row | None:
    return one("SELECT * FROM modules WHERE code=?", (code,))


def audit(user_id: int | None, action: str, entity: str, entity_id: Any = "", details: dict | None = None, ip: str = "") -> None:
    execute(
        "INSERT INTO audit_log(user_id,action,entity,entity_id,details,ip) VALUES (?,?,?,?,?,?)",
        (user_id, action, entity, str(entity_id), json.dumps(details or {}, ensure_ascii=False), ip),
    )
