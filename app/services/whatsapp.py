"""Generación de mensajes, registro previo de solicitudes y enlaces de WhatsApp."""
from __future__ import annotations

import re
import secrets
from datetime import datetime
from string import Formatter

from app.config import Config
from app.core.http import HTTPError, Request
from app.core.render import money
from app.db import get_setting, settings_group, transaction
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


def business_phone() -> str:
    return re.sub(r"\D", "", get_setting("commercial", "whatsapp", Config.WHATSAPP_DEFAULT))


def build_url(message: str, phone: str | None = None) -> str:
    number = phone or business_phone()
    if not number:
        raise HTTPError(400, "El número de WhatsApp de la tienda no está configurado")
    from urllib.parse import quote
    return f"https://wa.me/{number}?text={quote(message[:1200])}"


def build_product_message(product, quantity: int, zone_id: int | None = None) -> str:
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
        "name": "",
    })
    key = "order_message" if product["modality"] == "order" else "product_message"
    template = wa.get(key) or wa.get("product_message", "Hola OTRAVERSO, quiero información sobre {product}.")
    try:
        return template.format_map(values).strip()
    except (ValueError, KeyError, IndexError):
        return f"Hola OTRAVERSO, quiero información sobre {product['name']}."


def contact_url() -> str:
    wa = settings_group("whatsapp")
    return build_url(wa.get("contact_message", "Hola OTRAVERSO, quiero hablar con ustedes."))


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
    message = build_product_message(product, quantity, zone_id)
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
            "INSERT INTO purchase_requests(code,product_id,customer_id,name,phone,quantity,source,message,whatsapp_url) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (code, product["id"], customer_id, name, phone, quantity, source[:40],
             message[:2000], url[:2000]),
        ).lastrowid
        conn.execute(
            "INSERT INTO whatsapp_clicks(product_id,request_id,source,phone) VALUES (?,?,?,?)",
            (product["id"], request_id, source[:40], phone),
        )
        conn.execute(
            "INSERT INTO analytics_events(event_type,path,product_id,extra) VALUES ('whatsapp_click',?,?,?)",
            (request.path[:255], product["id"], '{"source":"' + source[:40] + '"}'),
        )
    return code, url
