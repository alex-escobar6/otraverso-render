"""Capa de datos SQLite/PostgreSQL con migraciones versionadas y semilla segura."""
from __future__ import annotations

import json
import re
import secrets
import sqlite3
import stat
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable

from app import db_backend
from app.config import DATA_DIR, Config
from app.security import hash_password
from app.services.play.catalog import GAMES

SCHEMA_VERSION = 8

SITE_PAGES_SCHEMA = """CREATE TABLE IF NOT EXISTS site_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  universe TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  element_type TEXT NOT NULL DEFAULT 'page',
  parent_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','page_only','coming_soon','hidden')),
  icon TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  notice_title TEXT NOT NULL DEFAULT '',
  notice_description TEXT NOT NULL DEFAULT '',
  notice_button TEXT NOT NULL DEFAULT '',
  notice_image TEXT NOT NULL DEFAULT '',
  coming_soon_message TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  nav_visible INTEGER NOT NULL DEFAULT 1 CHECK (nav_visible IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);"""

DRACONIA_SCHEMA = """
CREATE TABLE IF NOT EXISTS draconia_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dragon_name TEXT NOT NULL DEFAULT 'Luma',
  sound INTEGER NOT NULL DEFAULT 1 CHECK (sound IN (0,1)),
  reduced_motion INTEGER NOT NULL DEFAULT 0 CHECK (reduced_motion IN (0,1)),
  last_state TEXT NOT NULL DEFAULT 'idle',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

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
""" + SITE_PAGES_SCHEMA + """
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
  target_margin_percent INTEGER NOT NULL DEFAULT 0 CHECK (target_margin_percent BETWEEN 0 AND 100),
  whatsapp_message TEXT NOT NULL DEFAULT '',
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
  zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
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
  public_id TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  trace_id TEXT NOT NULL DEFAULT '',
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
  source TEXT NOT NULL DEFAULT 'manual',
  payment_method TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  paid_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
  cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
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
CREATE TABLE IF NOT EXISTS play_profiles (
  player_id TEXT PRIMARY KEY,
  xp REAL NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS play_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES play_profiles(player_id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  success INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0,1)),
  stats TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS play_achievements (
  player_id TEXT NOT NULL REFERENCES play_profiles(player_id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, code)
);
CREATE TABLE IF NOT EXISTS play_collectibles (
  player_id TEXT NOT NULL REFERENCES play_profiles(player_id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, code)
);
CREATE TABLE IF NOT EXISTS whatif_realities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('guest','user')),
  owner_key TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  premise TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT 'personalizado',
  style TEXT NOT NULL DEFAULT 'cinematografico',
  depth TEXT NOT NULL DEFAULT 'historia',
  format TEXT NOT NULL DEFAULT 'automatico',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','trash')),
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0,1)),
  cover_asset_id INTEGER,
  current_timeline_id INTEGER,
  narrative_config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_memory_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'event',
  subject TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'established' CHECK (kind IN ('established','hypothesis','proposal','discarded')),
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_timelines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES whatif_timelines(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  divergence_event TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER NOT NULL REFERENCES whatif_timelines(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  narrative_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','superseded')),
  provider TEXT NOT NULL DEFAULT 'local',
  model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (timeline_id, number)
);
CREATE TABLE IF NOT EXISTS whatif_chapter_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL REFERENCES whatif_chapters(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER,
  name TEXT NOT NULL,
  identity TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  motivations TEXT NOT NULL DEFAULT '',
  history TEXT NOT NULL DEFAULT '',
  knowledge TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'activo',
  appearance TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_character_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER,
  character_a INTEGER NOT NULL REFERENCES whatif_characters(id) ON DELETE CASCADE,
  character_b INTEGER NOT NULL REFERENCES whatif_characters(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'activa',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER,
  parent_id INTEGER REFERENCES whatif_locations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'lugar',
  description TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'activo',
  image_asset_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER NOT NULL REFERENCES whatif_timelines(id) ON DELETE CASCADE,
  chapter_id INTEGER REFERENCES whatif_chapters(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  narrative_date TEXT NOT NULL DEFAULT '',
  consequences TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','believed','unknown','proposed','discarded')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('global','historical','character','geographic','chapter','current')),
  subject_id INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system',
  confidence TEXT NOT NULL DEFAULT 'confirmed' CHECK (confidence IN ('confirmed','belief','proposed','unknown')),
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_interventions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER NOT NULL REFERENCES whatif_timelines(id) ON DELETE CASCADE,
  user_text TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT 'modificar',
  proposal TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','applied','rejected','failed')),
  result TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT
);
CREATE TABLE IF NOT EXISTS whatif_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL,
  snapshot TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER NOT NULL REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER,
  entity_type TEXT NOT NULL DEFAULT 'reality',
  entity_id INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'cover',
  prompt TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'schematic',
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','pending','error','disabled')),
  mime TEXT NOT NULL DEFAULT 'image/svg+xml',
  data BLOB,
  url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_generation_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reality_id INTEGER REFERENCES whatif_realities(id) ON DELETE CASCADE,
  timeline_id INTEGER,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error','canceled')),
  stage TEXT NOT NULL DEFAULT 'Preparando',
  idempotency_key TEXT NOT NULL UNIQUE,
  request TEXT NOT NULL DEFAULT '{}',
  result TEXT NOT NULL DEFAULT '{}',
  error TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS whatif_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL,
  owner_key TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'local',
  kind TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_modality ON products(modality);
CREATE INDEX IF NOT EXISTS idx_analytics_type_date ON analytics_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_date ON purchase_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_play_results_player ON play_results(player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_play_results_game ON play_results(game, created_at);
CREATE INDEX IF NOT EXISTS idx_whatif_owner ON whatif_realities(owner_type, owner_key, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_whatif_timeline_reality ON whatif_timelines(reality_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_whatif_chapter_timeline ON whatif_chapters(timeline_id, number);
CREATE INDEX IF NOT EXISTS idx_whatif_memory_context ON whatif_memories(reality_id, timeline_id, kind, importance);
CREATE INDEX IF NOT EXISTS idx_whatif_memory_cards ON whatif_memory_cards(reality_id, timeline_id, kind, importance);
CREATE INDEX IF NOT EXISTS idx_whatif_event_timeline ON whatif_events(reality_id, timeline_id, narrative_date);
CREATE INDEX IF NOT EXISTS idx_whatif_job_status ON whatif_generation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_whatif_usage_owner ON whatif_usage(owner_type, owner_key, created_at);
""" + DRACONIA_SCHEMA

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
    "whatif.view": "Ver operación de OTRAVERSO WHAT IF",
    "whatif.edit": "Configurar motores y contenido de WHAT IF",
    "pages.manage": "Gestionar disponibilidad de páginas",
    "draconia.view": "Entrar al espacio 3D privado de DRACONIA",
    "draconia.manage": "Administrar el acceso al compañero 3D de DRACONIA",
}

PAGE_REGISTRY: tuple[dict, ...] = (
    {
        "code": "portal", "name": "Inicio", "route": "/",
        "description": "Portada general de OTRAVERSO y navegación del multiverso.",
        "universe": "OTRAVERSO", "category": "Portada", "status": "available",
        "element_type": "universe", "parent_code": "",
        "icon": "", "image": "", "coming_soon_message": "", "sort_order": 0,
        "nav_visible": 1, "prefixes": ("/universos",),
    },
    {
        "code": "shop", "name": "Tienda", "route": "/shop",
        "description": "Catálogo, cobertura, productos y solicitudes de OTRAVERSO SHOP.",
        "universe": "OTRAVERSO SHOP", "category": "Universo", "status": "available",
        "element_type": "universe", "parent_code": "",
        "icon": "", "image": "", "coming_soon_message": "La tienda estará disponible muy pronto.",
        "sort_order": 1, "nav_visible": 1,
        "prefixes": ("/shop", "/pages", "/buscar", "/sitemap.xml", "/robots.txt"),
    },
    {
        "code": "whatif", "name": "WHAT IF", "route": "/what-if",
        "description": "Realidades narrativas persistentes de OTRAVERSO WHAT IF.",
        "universe": "OTRAVERSO WHAT IF", "category": "Universo", "status": "available",
        "element_type": "universe", "parent_code": "",
        "icon": "", "image": "", "coming_soon_message": "WHAT IF estará disponible próximamente. Puedes explorar la página, pero aún no se pueden crear realidades.",
        "sort_order": 2, "nav_visible": 1,
        "prefixes": ("/what-if", "/api/what-if/v1"),
    },
    {
        "code": "play", "name": "PLAY", "route": "/play",
        "description": "Juegos, exploración y progreso de OTRAVERSO PLAY.",
        "universe": "OTRAVERSO PLAY", "category": "Universo", "status": "available",
        "element_type": "universe", "parent_code": "",
        "icon": "", "image": "", "coming_soon_message": "PLAY está en preparación. Consulta las experiencias habilitadas.",
        "sort_order": 3, "nav_visible": 1,
        "prefixes": ("/play",),
    },
)


def play_element_code(game_code: str) -> str:
    return "play_game_" + re.sub(r"[^a-z0-9]+", "_", game_code.lower()).strip("_")


PLAY_ELEMENTS: tuple[dict, ...] = (
    {"code": "play_home", "name": "Página principal de PLAY", "route": "/play",
     "description": "Presentación general de OTRAVERSO PLAY.", "element_type": "page",
     "parent_code": "play", "universe": "OTRAVERSO PLAY", "category": "Página", "status": "available",
     "notice_title": "Página principal de PLAY", "notice_description": "Conoce el universo PLAY.",
     "sort_order": 0, "nav_visible": 0, "prefixes": ()},
    {"code": "play_hub", "name": "HUB de PLAY", "route": "/play/hub",
     "description": "Nexo de navegación y acceso a experiencias PLAY.", "element_type": "hub",
     "parent_code": "play", "universe": "OTRAVERSO PLAY", "category": "Navegación", "status": "available",
     "notice_title": "HUB de PLAY", "notice_description": "El nexo de PLAY no está habilitado.",
     "sort_order": 1, "nav_visible": 0, "prefixes": ()},
    {"code": "play_profile", "name": "Perfil PLAY", "route": "/play/profile",
     "description": "Perfil y progreso del jugador PLAY ID.", "element_type": "profile",
     "parent_code": "play", "universe": "OTRAVERSO PLAY", "category": "Servicio", "status": "available",
     "notice_title": "Perfil PLAY", "notice_description": "El perfil PLAY no está habilitado.",
     "sort_order": 2, "nav_visible": 0, "prefixes": ()},
    {"code": "play_catalog", "name": "Catálogo de juegos", "route": "/play#catalogo",
     "description": "Listado de juegos y experiencias de PLAY.", "element_type": "catalog",
     "parent_code": "play", "universe": "OTRAVERSO PLAY", "category": "Catálogo", "status": "available",
     "notice_title": "Catálogo de juegos", "notice_description": "El catálogo de juegos no está disponible.",
     "sort_order": 3, "nav_visible": 0, "prefixes": ()},
    {"code": "play_api", "name": "Servicios PLAY", "route": "/api/play/v1",
     "description": "Endpoints de juegos, manifiestos y progreso PLAY.", "element_type": "service",
     "parent_code": "play", "universe": "OTRAVERSO PLAY", "category": "Servicio", "status": "available",
     "notice_title": "Servicios PLAY", "notice_description": "Los servicios de PLAY no están disponibles.",
     "sort_order": 4, "nav_visible": 0, "prefixes": ("/api/play/v1",)},
)


def _play_game_elements() -> tuple[dict, ...]:
    elements = []
    for game in GAMES.values():
        published = game["status"] == "published"
        elements.append({
            "code": play_element_code(game["code"]),
            "name": game["name"],
            "route": game["route"],
            "description": game.get("description", ""),
            "element_type": "game" if published else "experience",
            "parent_code": "play",
            "universe": "OTRAVERSO PLAY",
            "category": "Juego" if published else "Experiencia planeada",
            "status": "available" if published else "coming_soon",
            "notice_title": game["name"],
            "notice_description": game.get("tagline") or game.get("description", ""),
            "notice_button": "" if published else "Próximamente",
            "sort_order": 10 + int(game.get("hub", {}).get("order", 99)),
            "nav_visible": 0,
            "prefixes": (),
        })
    return tuple(elements)


PAGE_ELEMENT_REGISTRY: tuple[dict, ...] = PAGE_REGISTRY + PLAY_ELEMENTS + _play_game_elements()

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
    "draconia_explorer": {"draconia.view"},
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
        "sale_disclaimer": "La apertura del chat no confirma una compra. La disponibilidad y condiciones se confirman con OTRAVERSO.",
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
    "whatif": {
        "enabled": "1",
        "text_provider": "local",
        "text_model": "",
        "text_api_url": "",
        "image_provider": "schematic",
        "image_model": "",
        "image_api_url": "",
        "timeout_seconds": "20",
        "max_retries": "1",
        "max_requests_hour": "40",
        "max_chapter_chars": "36000",
        "max_idea_chars": "1200",
        "context_chapters": "6",
        "moderation": "1",
        "generate_images": "0",
        "default_genre": "personalizado",
        "narrative_instructions": "",
        "ideas_enabled": "1",
        "apocalypse_enabled": "1",
        "crazy_enabled": "1",
        "unlimited_enabled": "1",
        "visual_primary_color": "#8f7dff",
        "visual_secondary_color": "#35e7d2",
        "visual_accent_color": "#ffd27a",
        "visual_background_color": "#f7f5ff",
        "visual_elements": "[]",
        "narrative_templates": "{}",
        "chapter_scene_words": "240",
        "chapter_normal_words": "1800",
        "chapter_extended_words": "3200",
        "chapter_cinematic_words": "5000",
        "max_chapter_words": "6000",
        "generation_blocks": "3",
        "surprise_frequency": "25",
        "randomness_level": "2",
        "available_genres": "ciencia-ficcion,historia-alternativa,fantasia,misterio,terror,aventura,distopia,comedia,supervivencia,horror-cosmico,realidades-alternativas,surrealista,personalizado",
        "available_styles": "cinematografico,realista,epico,misterioso,oscuro,aventurero,documental,absurdo,surrealista,personalizado",
        "memory_cards_limit": "40",
        "default_point_of_view": "tercera persona",
        "default_ending": "abierto",
        "initial_characters": "3",
    },
}


def connect():
    if Config.DB_BACKEND == "postgres":
        return db_backend.connect()
    conn = sqlite3.connect(Config.DB_PATH, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


@contextmanager
def transaction():
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE" if Config.DB_BACKEND == "sqlite" else "BEGIN")
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
    if Config.DB_BACKEND == "postgres":
        with connect() as conn:
            db_backend.init_schema(conn, SCHEMA, SCHEMA_VERSION)
            _migrate(conn)
    else:
        Config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)
            _migrate(conn)
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
    _seed()


def _exec_ddl(conn, sql: str) -> None:
    conn.execute(db_backend.adapt_sql(sql, ddl=True)
                 if Config.DB_BACKEND == "postgres" else sql)


def _upgrade_site_pages(conn) -> None:
    columns = db_backend.table_columns(conn, "site_pages")
    required = {"element_type", "parent_code", "notice_title", "notice_description",
                "notice_button", "notice_image"}
    if required <= columns:
        return
    if Config.DB_BACKEND == "postgres":
        for column, definition in (
            ("element_type", "TEXT NOT NULL DEFAULT 'page'"),
            ("parent_code", "TEXT NOT NULL DEFAULT ''"),
            ("notice_title", "TEXT NOT NULL DEFAULT ''"),
            ("notice_description", "TEXT NOT NULL DEFAULT ''"),
            ("notice_button", "TEXT NOT NULL DEFAULT ''"),
            ("notice_image", "TEXT NOT NULL DEFAULT ''"),
        ):
            if column not in columns:
                conn.execute(f"ALTER TABLE site_pages ADD COLUMN {column} {definition}")
        conn.execute(
            "UPDATE site_pages SET element_type='universe', notice_title=name, "
            "notice_description=coming_soon_message"
        )
        constraints = conn.execute(
            "SELECT conname FROM pg_constraint WHERE conrelid='site_pages'::regclass "
            "AND contype IN ('u','c') AND (strpos(pg_get_constraintdef(oid), '(route)') > 0 "
            "OR strpos(pg_get_constraintdef(oid), 'status') > 0)"
        ).fetchall()
        for row in constraints:
            conn.execute(f"ALTER TABLE site_pages DROP CONSTRAINT {row[0]}")
        conn.execute(
            "ALTER TABLE site_pages ADD CONSTRAINT site_pages_status_check "
            "CHECK (status IN ('available','page_only','coming_soon','hidden'))"
        )
        return
    _exec_ddl(conn, "ALTER TABLE site_pages RENAME TO site_pages_old")
    _exec_ddl(conn, SITE_PAGES_SCHEMA.replace("IF NOT EXISTS ", ""))
    conn.execute(
        "INSERT INTO site_pages(id,code,name,description,route,universe,category,element_type,parent_code,"
        "status,icon,image,notice_title,notice_description,notice_button,notice_image,coming_soon_message,"
        "sort_order,nav_visible,created_at,updated_at) "
        "SELECT id,code,name,description,route,universe,category,'universe','',"
        "CASE WHEN status IN ('available','page_only','coming_soon','hidden') THEN status ELSE 'available' END,"
        "icon,image,name,coming_soon_message,'','',coming_soon_message,sort_order,nav_visible,created_at,updated_at "
        "FROM site_pages_old"
    )
    _exec_ddl(conn, "DROP TABLE site_pages_old")


def _migrate(conn) -> None:
    def add_column(table: str, column: str, definition: str) -> None:
        if column not in db_backend.table_columns(conn, table):
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    _upgrade_site_pages(conn)
    add_column("products", "seo_title", "TEXT DEFAULT ''")
    add_column("products", "seo_description", "TEXT DEFAULT ''")
    add_column("products", "target_margin_percent",
               "INTEGER NOT NULL DEFAULT 0 CHECK (target_margin_percent BETWEEN 0 AND 100)")
    add_column("products", "whatsapp_message", "TEXT NOT NULL DEFAULT ''")
    add_column("orders", "source", "TEXT NOT NULL DEFAULT 'manual'")
    add_column("orders", "payment_method", "TEXT NOT NULL DEFAULT ''")
    add_column("orders", "payment_status",
               "TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid'))")
    add_column("orders", "paid_at", "TEXT")
    add_column("orders", "created_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL")
    add_column("order_items", "cost_cents", "INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0)")
    add_column("purchase_requests", "zone_id", "INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL")
    for column, definition in (
        ("public_id", "TEXT NOT NULL DEFAULT ''"),
        ("message", "TEXT NOT NULL DEFAULT ''"),
        ("url", "TEXT NOT NULL DEFAULT ''"),
        ("path", "TEXT NOT NULL DEFAULT ''"),
        ("user_agent", "TEXT NOT NULL DEFAULT ''"),
        ("trace_id", "TEXT NOT NULL DEFAULT ''"),
    ):
        add_column("whatsapp_clicks", column, definition)
    add_column("whatif_realities", "narrative_config", "TEXT NOT NULL DEFAULT '{}'")
    add_column("draconia_profiles", "sound", "INTEGER NOT NULL DEFAULT 1 CHECK (sound IN (0,1))")
    add_column("draconia_profiles", "last_state", "TEXT NOT NULL DEFAULT 'idle'")


def _seed_draconia(conn) -> None:
    defaults = {
        "protagonist_name": "Paula",
        "companion_default_name": "Luma",
        "sound_default": "1",
        "reduced_motion_default": "0",
    }
    for key, value in defaults.items():
        conn.execute(
            "INSERT OR IGNORE INTO settings(category,key,value) VALUES ('draconia',?,?)", (key, value)
        )
    conn.execute(
        "DELETE FROM settings WHERE category='draconia' AND key NOT IN (?,?,?,?)",
        tuple(defaults)
    )


def _seed() -> None:
    with transaction() as conn:
        for code, description in PERMISSIONS.items():
            conn.execute("INSERT OR IGNORE INTO permissions(code, description) VALUES (?, ?)", (code, description))
        for code, perms in ROLES.items():
            conn.execute("INSERT OR IGNORE INTO roles(code, name, description) VALUES (?, ?, ?)", (
                code,
                 {"superadmin": "Superadministrador", "admin": "Administrador",
                  "product_manager": "Gestor de productos", "order_manager": "Gestor de pedidos",
                   "draconia_explorer": "Compañero de DRACONIA"}[code],
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
            ("whatif", "OTRAVERSO WHAT IF", 1, 0, 2, "Universo de realidades narrativas persistentes."),
            ("play", "OTRAVERSO PLAY", 1, 0, 3, "Universo de juegos, exploración y progreso PLAY ID."),
            ("labs", "OTRAVERSO LABS", 0, 1, 4, "Experimentos y herramientas (planeado)."),
        ]
        conn.executemany(
            "INSERT OR IGNORE INTO modules(code,name,enabled,coming_soon,sort_order,description) VALUES (?,?,?,?,?,?)",
            modules,
        )
        conn.execute(
            "UPDATE modules SET enabled=1, coming_soon=0, "
            "description='Universo de juegos, exploración y progreso PLAY ID.' WHERE code='play'"
        )
        conn.execute(
            "UPDATE modules SET enabled=1, coming_soon=0, "
            "description='Universo de realidades narrativas persistentes.' WHERE code='whatif'"
        )
        for page in PAGE_ELEMENT_REGISTRY:
            conn.execute(
                "INSERT OR IGNORE INTO site_pages(code,name,description,route,universe,category,element_type,"
                "parent_code,status,icon,image,notice_title,notice_description,notice_button,notice_image,"
                "coming_soon_message,sort_order,nav_visible) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (page["code"], page["name"], page.get("description", ""), page["route"],
                 page["universe"], page["category"], page.get("element_type", "page"),
                 page.get("parent_code", ""), page["status"], page.get("icon", ""), page.get("image", ""),
                 page.get("notice_title") or page["name"],
                 page.get("notice_description") or page.get("coming_soon_message", ""),
                 page.get("notice_button", ""), page.get("notice_image", ""),
                 page.get("coming_soon_message", ""), page.get("sort_order", 0),
                 page.get("nav_visible", 1)),
            )
        conn.execute(
            "UPDATE site_pages SET coming_soon_message=?, notice_description=? "
            "WHERE code='play' AND coming_soon_message LIKE 'PLAY estará disponible próximamente%'",
            ("PLAY está en preparación. Consulta las experiencias habilitadas.",
             "PLAY está en preparación. Consulta las experiencias habilitadas."),
        )
        _seed_draconia(conn)

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
                ("paid", "Pagado (registro manual)", 7), ("cancelled", "Cancelado", 8),
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
