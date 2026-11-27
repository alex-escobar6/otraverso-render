"""Generación de mensajes, registro previo de solicitudes y enlaces de WhatsApp."""
from __future__ import annotations

import json
import re
import secrets
from datetime import datetime
from string import Formatter

from app.config import Config
from app.core.http import HTTPError, Request
from app.core.render import money
from app.db import get_setting, query, settings_group, transaction
from app.services.delivery import product_delivery


class _Map(dict):
    def __missing__(self, key: str) -> str:
        return ""


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 10 and digits.startswith("3"):
        digits = "57" + digits
    if not 7 <= len(digits) <= 15:
        raise HTTPError(400, "Ingrese un número de teléfono válido")
    return digits


def enabled(values: dict[str, str] | None = None) -> bool:
    values = values if values is not None else settings_group("whatsapp")
    return values.get("enabled", "1") == "1"


def business_phone(raw: str | None = None) -> str:
    digits = re.sub(r"\D", "", raw if raw is not None else get_setting("commercial", "whatsapp", Config.WHATSAPP_DEFAULT))
    if not digits:
        return ""
    try:
        return normalize_phone(digits)
    except HTTPError:
        return digits


def build_url(message: str, phone: str | None = None) -> str:
    number = phone or business_phone()
    if not number:
        raise HTTPError(400, "El número de WhatsApp de la tienda no está configurado")
    from urllib.parse import quote
    return f"https://wa.me/{number}?text={quote(message[:1200])}"


def _field(row, key: str, default: str = "") -> str:
    keys = row.keys() if hasattr(row, "keys") else row
    return row[key] if key in keys else default


def _product_template(product, modality: str, wa: dict[str, str]) -> str:
    custom = _field(product, "whatsapp_message", "").strip()
    if custom:
        return custom
    rows = query(
        "SELECT body FROM whatsapp_templates WHERE active=1 AND modality IN (?, 'any') "
        "AND code NOT IN ('enabled','default_message','product_message','order_message','contact_message') "
        "ORDER BY CASE modality WHEN ? THEN 0 ELSE 1 END, id LIMIT 1",
        (modality, modality),
    )
    if rows:
        return rows[0]["body"]
    key = "order_message" if modality == "order" else "product_message"
    return wa.get(key) or wa.get("product_message", "Hola OTRAVERSO, quiero información sobre {product}.")


def build_product_message(product, quantity: int, zone_id: int | None = None, name: str = "") -> str:
    wa = settings_group("whatsapp")
    commercial = settings_group("commercial")
    short, detail = product_delivery(product, zone_id)
    values = _Map({
        "product": product["name"],
        "price": money(product["price_cents"], commercial.get("currency", Config.CURRENCY)),
        "modality": "Disponible en inventario" if product["modality"] == "stock" else "Bajo pedido",
        "delivery": detail,
        "short_delivery": short,
        "quantity": quantity,
        "name": name,
    })
    template = _product_template(product, product["modality"], wa)
    try:
        return template.format_map(values).strip()
    except (ValueError, KeyError, IndexError):
        return f"Hola OTRAVERSO, quiero información sobre {product['name']}."


def contact_url() -> str:
    wa = settings_group("whatsapp")
    return build_url(wa.get("contact_message", "Hola OTRAVERSO, quiero hablar con ustedes."))


def _insert_click(conn, request: Request, source: str, *, product_id: int | None = None,
                  request_db_id: int | None = None, phone: str = "", message: str = "",
                  url: str = "", path: str = "") -> str:
    public_id = secrets.token_hex(12)
    trace = getattr(request, "request_id", "")
    conn.execute(
        "INSERT INTO whatsapp_clicks(product_id,request_id,source,phone,public_id,message,url,path,user_agent,trace_id) "
        "VALUES (?,?,?,?,?,?,?,?,?,?)",
        (product_id, request_db_id, source[:40], phone, public_id, message[:2000], url[:2000],
         (path or getattr(request, "path", ""))[:255], getattr(request, "user_agent", "")[:255], trace[:64]),
    )
    conn.execute(
        "INSERT INTO analytics_events(event_type,path,product_id,extra) VALUES ('whatsapp_click',?,?,?)",
        ((path or getattr(request, "path", ""))[:255], product_id,
         json.dumps({"source": source[:40], "public_id": public_id}, ensure_ascii=False)),
    )
    return public_id


def log_click(request: Request, source: str, *, product_id: int | None = None, message: str = "",
              url: str = "", path: str = "") -> str:
    if not url.startswith("https://wa.me/"):
        raise HTTPError(400, "Enlace de WhatsApp no válido")
    with transaction() as conn:
        return _insert_click(conn, request, source, product_id=product_id, message=message,
                             url=url, path=path)


def register_request(
    request: Request,
    product,
    *,
    name: str,
    phone: str,
    quantity: int,
    source: str,
    message_note: str,
    zone_id: int | None,
    consent: str,
) -> tuple[str, str]:
    if consent != "1":
        raise HTTPError(400, "Debe aceptar el uso de sus datos para gestionar la solicitud")
    name = name.strip()
    if len(name) < 2 or len(name) > 100:
        raise HTTPError(400, "Ingrese un nombre válido")
    if not 1 <= quantity <= 99:
        raise HTTPError(400, "La cantidad debe estar entre 1 y 99")
    phone = normalize_phone(phone)
    message = build_product_message(product, quantity, zone_id, name=name)
    if message_note.strip():
        message += f"\n\nMensaje del cliente: {message_note.strip()[:500]}"
    url = build_url(message)
    code = "OTR-" + datetime.now().strftime("%Y%m%d") + "-" + secrets.token_hex(3).upper()

    with transaction() as conn:
        customer = conn.execute("SELECT id FROM customers WHERE phone=?", (phone,)).fetchone()
        if customer:
            customer_id = customer["id"]
            conn.execute(
                "UPDATE customers SET name=?, whatsapp=?, data_consent=1, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (name, phone, customer_id),
            )
        else:
            customer_id = conn.execute(
                "INSERT INTO customers(name,phone,whatsapp,data_consent) VALUES (?,?,?,1)",
                (name, phone, phone),
            ).lastrowid
        request_id = conn.execute(
            "INSERT INTO purchase_requests(code,product_id,customer_id,name,phone,quantity,source,zone_id,message,whatsapp_url) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (code, product["id"], customer_id, name, phone, quantity, source[:40],
             zone_id, message[:2000], url[:2000]),
        ).lastrowid
        _insert_click(conn, request, source + "_request", product_id=product["id"],
                      request_db_id=request_id, phone=phone, message=message, url=url)
    return code, url
