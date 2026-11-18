"""Registro de visitas y eventos comerciales reales (sin datos simulados)."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from app.config import Config
from app.core.http import Request
from app.db import execute


def track_event(request: Request, event_type: str, **extra: Any) -> None:
    execute(
        "INSERT INTO analytics_events(event_type,path,product_id,category_id,query,referrer,extra) "
        "VALUES (?,?,?,?,?,?,?)",
        (
            event_type,
            request.path[:255],
            extra.get("product_id"),
            extra.get("category_id"),
            str(extra.get("query", ""))[:255],
            request.referrer[:500],
            json.dumps({k: v for k, v in extra.items() if k not in {"product_id", "category_id", "query"}},
                       ensure_ascii=False, default=str),
        ),
    )


def track_visit(request: Request) -> None:
    ip_hash = hashlib.sha256(f"{Config.SECRET_KEY}:{request.ip}".encode()).hexdigest()[:24]
    execute(
        "INSERT INTO visits(path,ip_hash,user_agent) VALUES (?,?,?)",
        (request.path[:255], ip_hash, request.user_agent[:500]),
    )
