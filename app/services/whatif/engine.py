from __future__ import annotations

import hashlib
import hmac
import html
import json
import re
import secrets
import threading
import time
from typing import Any

from app.config import Config
from app.core.http import HTTPError
from app.db import get_setting, one, query, transaction
from . import narrative, options, provider

GUEST_TTL_SECONDS = 60 * 60 * 24 * 30

NARRATIVE_FIELDS = (
    "narrative_config", "apocalypse", "apocalypse_level", "crazy", "crazy_level", "unlimited",
    "chapter_length", "randomness", "surprise_frequency", "point_of_view",
    "initial_characters", "ending", "modes",
)

TOPICS = (
    (
        ("dinosaurio", "dinosaur", "extincion", "extinción"),
        {
            "title": "El mundo que no se apagó",
            "rules": (
                "El impacto de Chicxulub nunca ocurrió y la evolución continuó sin esa ruptura.",
                "Las especies existentes respetan una biología y una cadena alimenticia coherentes con su origen.",
                "La inteligencia, cuando aparece, surge por presión ambiental y deja huellas verificables.",
            ),
            "characters": (("Ili", "Bióloga de campo", "Observadora y tenaz", "Entender el nuevo equilibrio"),),
            "locations": (("Valle de los Fósiles Vivos", "región", "Un valle donde las especies antiguas nunca desaparecieron."),),
            "scene": "Una huella reciente aparece junto a un fósil milenario y obliga a revisar todo lo que se creía sabido.",
        },
    ),
    (
        ("roma", "imperio romano", "bizancio"),
        {
            "title": "Roma nunca cayó",
            "rules": (
                "La administración imperial sobrevive al siglo V y conserva sus instituciones centrales.",
                "Las legiones siguen siendo la última palabra en la frontera, pero la política interna pesa más que la espada.",
                "El comercio y el derecho permanecen unidos al destino de la ciudad.",
            ),
            "characters": (("Marco Vero", "Senador", "Prudente y ambicioso", "Mantener unida la administración"),),
            "locations": (("Foro de las Decisiones", "ciudad", "El centro donde se discute el futuro del imperio."),),
            "scene": "Un decreto llega tarde al foro y revela que la verdadera batalla ya no está en la frontera.",
        },
    ),
    (
        ("marte", "alien", "extraterrestre", "vida inteligente"),
        {
            "title": "La señal desde Marte",
            "rules": (
                "La vida inteligente marciana existe y ha desarrollado una cultura propia.",
                "Toda comunicación con ella pasa por interpretaciones imperfectas y consecuencias políticas.",
                "Ninguna civilización posee una ventaja tecnológica definitiva sobre la otra.",
            ),
            "characters": (("Ada Salazar", "Lingüista", "Curiosa y metódica", "Traducir antes de que alguien dispare"),),
            "locations": (("Estación Umbral", "estación", "Un puente frágil entre dos formas de entender el cielo."),),
            "scene": "La primera respuesta marciana no es un saludo: es una pregunta sobre quién tiene derecho a nombrar el planeta.",
        },
    ),
    (
        ("sueño", "sueños", "soñar"),
        {
            "title": "El archivo de los sueños",
            "rules": (
                "Los sueños pueden compartirse y dejar huellas verificables.",
                "Lo soñado no cambia el pasado, pero sí altera recuerdos y decisiones futuras.",
                "Nadie controla por completo el contenido de una mente ajena.",
            ),
            "characters": (("Nera", "Cartógrafa de sueños", "Intuitiva y cautelosa", "Evitar que un sueño se vuelva una profecía"),),
            "locations": (("Sala de los Relatos Dormidos", "archivo", "Un dépósito de imágenes que nadie recuerda haber creado."),),
            "scene": "Dos desconocidos describen el mismo sueño con palabras distintas y descubren una fecha imposible.",
        },
    ),
    (
        ("océano", "oceanos", "submarino", "atlantis"),
        {
            "title": "La civilización bajo el océano",
            "rules": (
                "Existe una civilización oceanica con tecnología propia y sin contacto superficial sostenido.",
                "La presión, la luz y la sal determinan su arquitectura y su lenguaje.",
                "El secreto no se mantiene por magia, sino por decisión política y geografía.",
            ),
            "characters": (("Sira", "Exploradora", "Paciente y observadora", "Encontrar respuestas sin provocar una invasión"),),
            "locations": (("Fosa de las Campanas", "océano", "Una ciudad sumergida que responde con sonido a cada visita."),),
            "scene": "Una campana vuelve a sonar después de siglos y alguien en la superficie reconoce la respuesta.",
        },
    ),
    (
        ("pasado", "viajar en el tiempo", "tiempo"),
        {
            "title": "El viaje que no se deshizo",
            "rules": (
                "Viajar al pasado es posible, pero cada intervención deja una huella permanente.",
                "Los viajeros no pueden traer materia del futuro sin alterar el equilibrio local.",
                "La memoria de quienes viajan es la única línea de continuidad intacta.",
            ),
            "characters": (("Eliseo", "Viajero", "Metódico y arrepentido", "Corregir un error sin crear otro"),),
            "locations": (("Estación de Regreso", "instalación", "Un lugar que solo existe mientras alguien decide volver."),),
            "scene": "El viajero vuelve una mañana tarde y descubre que su propia casa ya no lo reconoce.",
        },
    ),
    (
        ("judea", "jesús", "jesus", "año 30", "imperio romano"),
        {
            "title": "Judea, año 30 d. C.",
            "rules": (
                "La escena ocurre en Judea bajo el dominio del Imperio romano y respeta sus costumbres.",
                "Quien llega del futuro conoce los acontecimientos, pero no puede demostrarlos con objetos de su época.",
                "Cada intento de advertir a alguien deja una consecuencia irreversible.",
            ),
            "characters": (
                ("María", "Comerciante de la caravana", "Prudente y curiosa", "Entender de dónde viene el viajero"),
                ("Simón", "Guardia del templo", "Desconfiado y leal", "Impedir que se altere el orden del lugar"),
            ),
            "locations": (
                ("Camino de Jerusalén", "ruta", "Un sendero polvoriento al amanecer, entre tiendas y mercancías."),
                ("Puesto de la caravana", "asentamiento", "Tiendas bajas donde se intercambian noticias y provisiones."),
            ),
            "scene": "Una caravana se detiene al amanecer y una mujer mira a quien acaba de llegar como si supiera que no pertenece a ese año.",
        },
    ),
    (
        ("futurista", "civilización futura", "ciudad futura"),
        {
            "title": "La ciudad que aprendió a recordar",
            "rules": (
                "La civilización futurista ha convertido la memoria en una infraestructura visible.",
                "Toda identidad puede verificarse, pero nadie puede borrar por completo un recuerdo compartido.",
                "La tecnología resuelve necesidades concretas y crea nuevas desigualdades.",
            ),
            "characters": (("Ine", "Técnica de pasarelas", "Precavida y observadora", "Encontrar un nombre ausente en la red"),),
            "locations": (("Avenida de las Memorias", "ciudad", "Una pasarela luminosa donde los recuerdos se muestran en las paredes."),),
            "scene": "Una ciudad perfecta reconoce el cuerpo de quien acaba de llegar, pero no recuerda su nombre.",
        },
    ),
)

MOVES = (
    {
        "title": "La primera grieta",
        "opening": "Todo comenzó con un detalle que nadie quiso reconocer",
        "turn": "Cuando {character} volvió a {place}, la certeza se volvió pregunta",
        "end": "Antes de que terminara el día, {event} ya era imposible de ignorar",
    },
    {
        "title": "Lo que la memoria guardó",
        "opening": "Dos versiones coincidían en una sola palabra: inconsistencia",
        "turn": "{character} comprendió que {place} no era un escenario, sino una prueba",
        "end": "La conversación terminó con una decisión que nadie había escrito todavía",
    },
    {
        "title": "La decisión",
        "opening": "La mañana llegó con dos versiones del mismo hecho",
        "turn": "En {place}, {character} eligió proteger una parte de la verdad y sacrificar otra",
        "end": "Las consecuencias aparecieron antes de que alguien las nombrara",
    },
    {
        "title": "El precio de la certeza",
        "opening": "Confirmar una sospecha resultó más peligroso que ignorarla",
        "turn": "{character} siguió el rastro hasta {place} y encontró una explicación incompleta",
        "end": "Lo ocurrido dejó una puerta abierta y una deuda pendiente",
    },
    {
        "title": "La otra orilla",
        "opening": "El silencio duró menos de lo que parece en la memoria",
        "turn": "Desde {place}, {character} miró el cambio como quien descubre una costa nueva",
        "end": "Una segunda versión de los hechos empezó a ganar defensores",
    },
    {
        "title": "Lo que viene después",
        "opening": "La calma nunca fue parte del acuerdo",
        "turn": "{character} volvió a {place} con una pregunta más precisa que la anterior",
        "end": "La historia continuó, pero ya nadie podía fingir que era la misma",
    },
)


def _stamp() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def _json(value: Any, limit: int = 200_000) -> str:
    return json.dumps(value or {}, ensure_ascii=False)[:limit]


def _loads(value: str | None) -> dict:
    try:
        data = json.loads(value or "{}")
        return data if isinstance(data, dict) else {}
    except (ValueError, TypeError):
        return {}


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _as_text(value: Any, limit: int = 500) -> str:
    return options.clean_text(value, limit)


def _narrative_from_input(data: Any) -> dict:
    raw = data if isinstance(data, dict) else {}
    source = _loads(raw.get("narrative_config"))
    for field in NARRATIVE_FIELDS:
        if field == "narrative_config" or field not in raw:
            continue
        value = raw.get(field)
        if field == "modes":
            value = [item.strip() for item in re.split(r"[,\s]+", str(value)) if item.strip()] if isinstance(value, str) else value
        source[field] = value
    return narrative.normalize_narrative_config(source)


def _card_dict(row: Any) -> dict:
    data = dict(row)
    data["metadata"] = _loads(data.get("metadata"))
    return data


def _insert_memory_card(conn, reality_id: int, timeline_id: int | None, kind: str, subject: str,
                        content: str, importance: int = 6, metadata: dict | None = None) -> int:
    return int(conn.execute(
        "INSERT INTO whatif_memory_cards(reality_id,timeline_id,kind,subject,content,metadata,importance) "
        "VALUES (?,?,?,?,?,?,?)",
        (reality_id, timeline_id, _as_text(kind, 40) or "event", _as_text(subject, 160),
         _as_text(content, 2000), _json(metadata or {}),
         max(1, min(10, _int_safely(importance, 6)))),
    ).lastrowid)


def _int_safely(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _blueprint_section_cards(blueprint: dict) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {code: [] for code in narrative.BLUEPRINT_SECTIONS}

    def add(code: Any, card: Any) -> None:
        key = str(code or "")
        if key not in result or not isinstance(card, dict) or len(result[key]) >= 3:
            return
        item = dict(card)
        if item not in result[key]:
            result[key].append(item)

    for stage in narrative.BLUEPRINT_STAGES:
        for card in blueprint.get(stage, []):
            add(card.get("metadata", {}).get("section"), card)
    for card in blueprint.get("premise", []):
        add("history", card)
        add("timelines", card)
    for card in blueprint.get("evolution", []):
        for code in ("chronology", "events", "history", "timelines"):
            add(code, card)
    for card in blueprint.get("narrative", []):
        role = card.get("metadata", {}).get("role")
        add({"protagonist": "characters", "trigger": "events", "scene": "places"}.get(role, "events"), card)
    for card in blueprint.get("situation", []):
        role = card.get("metadata", {}).get("role")
        add({"conflict": "conflicts", "mystery": "mysteries", "threat": "conflicts"}.get(role, "mysteries"), card)
    for code in narrative.BLUEPRINT_SECTIONS:
        if result[code]:
            continue
        for stage in narrative.BLUEPRINT_STAGES:
            for card in blueprint.get(stage, []):
                add(code, card)
                if result[code]:
                    break
            if result[code]:
                break
    return result


def make_guest_token() -> dict:
    guest_id = secrets.token_hex(12)
    expires = int(time.time()) + GUEST_TTL_SECONDS
    payload = f"{guest_id}.{expires}"
    signature = hmac.new(Config.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return {"guest_id": guest_id, "token": f"{payload}.{signature}", "expires_at": expires}


def parse_guest_token(token: str) -> str:
    try:
        guest_id, expires_s, signature = (token or "").split(".")
        expires = int(expires_s)
        if expires < int(time.time()) or len(guest_id) != 24:
            return ""
        payload = f"{guest_id}.{expires_s}"
        expected = hmac.new(Config.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
        return guest_id if hmac.compare_digest(signature, expected) else ""
    except (ValueError, AttributeError):
        return ""


def owner_from(request, token: str = "") -> dict:
    if getattr(request, "user", None):
        return {"type": "user", "key": str(request.user["id"])}
    guest_id = parse_guest_token(token or request.param("guest", "") or request.headers.get("x-whatif-guest", ""))
    if not guest_id:
        raise HTTPError(401, "No se pudo identificar la sesión de invitado. Vuelve a entrar a WHAT IF.")
    return {"type": "guest", "key": guest_id}


def _owner_clause(owner: dict) -> tuple[str, tuple]:
    return "owner_type=? AND owner_key=?", (owner["type"], owner["key"])


def require_reality(owner: dict, reality_id: int) -> dict:
    clause, params = _owner_clause(owner)
    row = one(f"SELECT * FROM whatif_realities WHERE id=? AND {clause}", (reality_id, *params))
    if not row:
        raise HTTPError(404, "La realidad no existe o no pertenece a esta sesión.")
    return dict(row)


def _timeline_ids(conn, timeline_id: int) -> list[int]:
    result = []
    current = timeline_id
    seen = set()
    while current and current not in seen:
        seen.add(current)
        row = conn.execute("SELECT parent_id FROM whatif_timelines WHERE id=?", (current,)).fetchone()
        result.append(current)
        current = row["parent_id"] if row else None
    return result


def _root_timeline(conn, reality_id: int) -> int:
    row = conn.execute(
        "SELECT id FROM whatif_timelines WHERE reality_id=? ORDER BY parent_id IS NOT NULL, id LIMIT 1",
        (reality_id,),
    ).fetchone()
    return row["id"] if row else 0


def _topic_for(idea: str) -> dict:
    text = idea.lower()
    for words, topic in TOPICS:
        if any(word in text for word in words):
            return topic
    return {
        "title": "La realidad que nadie eligió",
        "rules": (
            "La premisa planteada es cierta dentro de este mundo y sus consecuencias son reales.",
            "Los hechos confirmados conservan su lugar hasta que una intervención explícita los modifique.",
            "Las reglas nuevas deben poder explicarse con la lógica interna de la realidad.",
        ),
        "characters": (("Narrador", "Testigo de la realidad", "Atento y dubitativo", "Comprender qué cambió"),),
        "locations": (("El lugar de origen", "escenario", "El punto donde la premisa se vuelve visible por primera vez."),),
        "scene": "Una pregunta aparentemente inocente obliga a mirar el mundo con otros ojos.",
    }


def _derive_title(idea: str, topic: dict) -> str:
    text = options.clean_text(idea, 160).strip("¿?.")
    text = re.sub(r"^(y si|que pasaria si|qué pasaría si|que pasase si)\s+", "", text, flags=re.IGNORECASE)
    if len(text) > 28:
        return topic["title"]
    return (text[:70] or topic["title"]).rstrip(".,") or topic["title"]


def local_proposal(payload: dict) -> dict:
    idea = options.clean_text(payload.get("idea"), 1200)
    if len(idea) < 8:
        raise provider.ProviderError("Escribe una idea más concreta para construir la realidad.", 400)
    topic = _topic_for(idea)
    genre = options.normalize_choice(_as_text(payload.get("genre")), options.GENRES, "personalizado")
    style = options.normalize_choice(_as_text(payload.get("style")), options.STYLES, "cinematografico")
    depth = options.normalize_choice(_as_text(payload.get("depth")), options.DEPTHS, "historia")
    genre_label = options.label_for(options.GENRES, genre)
    style_label = options.label_for(options.STYLES, style)
    fmt = options.normalize_choice(_as_text(payload.get("format")), options.FORMATS, "automatico")
    if fmt == "automatico":
        fmt = options.recommend_format(idea, genre, style, depth)
    premise = idea if "?" in idea else f"¿Qué pasaría si {idea.rstrip('.')}?"
    description = (
        f"Imagina que entras en una {genre_label.lower()} de tono {style_label.lower()}. "
        f"{topic['scene']} Lo que hagas a continuación quedará guardado y cambiará lo que viene."
    )
    return {
        "title": _derive_title(idea, topic),
        "premise": premise[:900],
        "description": description,
        "genre": genre,
        "style": style,
        "depth": depth,
        "format": fmt,
        "rules": [{"text": rule, "kind": "established"} for rule in topic["rules"]],
        "characters": [
            {"name": name, "identity": identity, "personality": personality, "motivations": motivation}
            for name, identity, personality, motivation in topic["characters"]
        ],
        "locations": [
            {"name": name, "kind": kind, "description": description}
            for name, kind, description in topic["locations"]
        ],
        "first_scene": topic["scene"],
        "recommendation": "Formato " + options.label_for(options.FORMATS, fmt).lower() + ": mantiene la continuidad y permite intervenir cuando quieras.",
    }


def _find_named(items: list, text: str) -> str:
    lower = text.lower()
    for item in items:
        name = str(item.get("name") or item.get("title") or "")
        if name and name.lower() in lower:
            return name
    return ""


def local_intervention(payload: dict) -> dict:
    text = _as_text(payload.get("text"), 1200)
    characters = [item for item in _as_list(payload.get("characters")) if isinstance(item, dict)]
    locations = [item for item in _as_list(payload.get("locations")) if isinstance(item, dict)]
    events = [item for item in _as_list(payload.get("events")) if isinstance(item, dict)]
    lower = text.lower()
    character_name = _find_named(characters, text) or (str(characters[0].get("name")) if characters else "")
    location_name = _find_named(locations, text) or (str(locations[0].get("name")) if locations else "")
    event_name = _find_named(events, text) or (str(events[0].get("title")) if events else "")
    changes: list[dict] = []
    branch_required = False
    if any(word in lower for word in ("personalidad", "carácter", "caracter", "actitud")):
        value = re.split(r"(?:personalidad|carácter|caracter|actitud)[^:]{0,30}[:es]\s*", text, maxsplit=1, flags=re.IGNORECASE)
        new_value = _as_text(value[1] if len(value) > 1 else text, 220) or "más cauteloso y decidido"
        changes.append({"action": "update_character", "name": character_name, "field": "personality", "value": new_value})
        intent = "personaje"
    elif any(word in lower for word in ("relación", "relacion", "enemigo", "aliado", "hermano", "amor")):
        changes.append({"action": "add_relationship", "name": character_name, "other": location_name or character_name,
                        "relation": _as_text(text, 180), "status": "activa"})
        intent = "relacion"
    elif any(word in lower for word in ("regla", "nunca", "siempre", "ley del mundo")):
        changes.append({"action": "add_rule", "text": _as_text(text, 300), "kind": "proposal"})
        intent = "regla"
        branch_required = "nunca" in lower or "antes de" in lower
    elif any(word in lower for word in ("ciudad", "lugar", "planeta", "región", "region", "océano", "oceanos")):
        changes.append({"action": "add_location", "name": _as_text(text, 90) or "Nuevo lugar", "description": _as_text(text, 300), "kind": "lugar"})
        intent = "lugar"
    elif any(word in lower for word in ("punto de vista", "antagonista", "narrador", "desde el punto")):
        changes.append({"action": "set_point_of_view", "value": _as_text(text, 300)})
        intent = "punto-vista"
    elif any(word in lower for word in ("pasado", "antes de la guerra", "que nunca hubiera", "reescrib", "cambia el hecho", "modifica el acontecimiento")):
        changes.append({"action": "add_event", "title": "Divergencia: " + (event_name or _as_text(text, 70)), "description": _as_text(text, 400), "narrative_date": "Punto de divergencia", "consequences": "La línea original se conserva; esta versión continúa desde el cambio."})
        intent = "pasado"
        branch_required = True
    elif any(word in lower for word in ("elimina", "desaparece", "nunca existió", "nunca existio", "quita")):
        changes.append({"action": "retire_element", "entity_type": "character" if character_name else "location", "name": character_name or location_name, "reason": _as_text(text, 250)})
        intent = "elemento"
        branch_required = True
    elif any(word in lower for word in ("introduce", "aparece", "nuevo personaje", "nueva civilización", "nueva civilizacion")):
        changes.append({"action": "add_character", "name": _as_text(text, 80) or "Nuevo personaje", "identity": "Elemento introducido por intervención", "description": _as_text(text, 300)})
        intent = "nuevo"
    else:
        changes.append({"action": "add_event", "title": "Intervención: " + _as_text(text, 70), "description": _as_text(text, 400), "narrative_date": "Continuación", "consequences": "La historia continúa con este hecho confirmado en la línea actual."})
        intent = "acontecimiento"
    return {
        "intent": intent,
        "summary": _as_text(text, 300),
        "consequences": [
            "La escena anterior queda guardada y puede recuperarse desde el historial.",
            "El cambio se aplica a la estructura de la realidad, no solo a una frase del texto.",
            "Los personajes y lugares reaccionarán a este hecho en la siguiente escena.",
        ],
        "branch_required": branch_required,
        "changes": changes,
        "confidence": "local",
    }


def check_rate(owner: dict) -> None:
    limit = provider.setting_int("max_requests_hour", 40, 1, 1000)
    used = one(
        "SELECT COUNT(*) AS total FROM whatif_usage WHERE owner_type=? AND owner_key=? AND created_at >= datetime('now','-1 hour')",
        (owner["type"], owner["key"]),
    )
    if used and used["total"] >= limit:
        raise HTTPError(429, "Alcanzaste el límite de generaciones por hora. Intenta de nuevo más tarde.")


def _record_usage(owner: dict, provider_name: str, kind: str, result: provider.GenerationResult | None = None,
                  success: bool = True) -> None:
    from app.db import execute
    execute(
        "INSERT INTO whatif_usage(owner_type,owner_key,provider,kind,tokens_in,tokens_out,success) VALUES (?,?,?,?,?,?,?)",
        (owner["type"], owner["key"], provider_name, kind,
         result.tokens_in if result else 0, result.tokens_out if result else 0, 1 if success else 0),
    )


def _job_key(value: str) -> str:
    return options.clean_text(value, 120) or secrets.token_hex(12)


def _job_start(reality_id: int | None, timeline_id: int | None, kind: str, key: str,
               owner: dict | None = None, request_data: dict | None = None,
               queued: bool = False) -> tuple[int, bool]:
    from app.db import execute
    identity = _job_key(key)
    existing = one("SELECT * FROM whatif_generation_jobs WHERE idempotency_key=?", (identity,))
    if existing:
        stored_owner = _loads(existing["request"]).get("owner")
        if owner and stored_owner and stored_owner != owner:
            raise HTTPError(404, "La tarea no existe.")
        if owner and existing["reality_id"]:
            require_reality(owner, int(existing["reality_id"]))
        if existing["status"] == "done":
            return int(existing["id"]), False
        if kind == "chapter" and existing["status"] == "error":
            checkpoint = _loads(existing["result"])
            total = _int_safely(checkpoint.get("total_blocks"), 0)
            nxt = _int_safely(checkpoint.get("next"), 0)
            if isinstance(checkpoint.get("blocks"), list) and checkpoint["blocks"] and total and nxt <= total:
                execute(
                    "UPDATE whatif_generation_jobs SET status='running', stage='Reanudando capítulo', error='', "
                    "attempts=attempts+1, updated_at=CURRENT_TIMESTAMP WHERE id=?", (existing["id"],),
                )
                return int(existing["id"]), True
        raise HTTPError(400, "Ya hay una operación igual en curso. Espera un momento o vuelve a intentarlo.")
    request = {"kind": kind, "owner": owner or {}}
    request.update(request_data or {})
    status = "queued" if queued else "running"
    stage = "En cola" if queued else "Preparando contexto"
    cursor = execute(
        "INSERT INTO whatif_generation_jobs(reality_id,timeline_id,kind,status,stage,idempotency_key,request,attempts) "
        "VALUES (?,?,?,?,?,?,?,1)",
        (reality_id, timeline_id, kind, status, stage, identity, _json(request)),
    )
    return int(cursor.lastrowid), True


def _job_activate(job_id: int, stage: str) -> bool:
    from app.db import execute
    cursor = execute(
        "UPDATE whatif_generation_jobs SET status='running', stage=?, updated_at=CURRENT_TIMESTAMP "
        "WHERE id=? AND status IN ('queued','running')", (stage, job_id),
    )
    return bool(cursor.rowcount)


def _job_stage(job_id: int, stage: str) -> None:
    from app.db import execute
    execute("UPDATE whatif_generation_jobs SET stage=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (stage, job_id))


def _job_checkpoint(job_id: int, checkpoint: dict) -> None:
    from app.db import execute
    execute(
        "UPDATE whatif_generation_jobs SET result=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (_json(checkpoint), job_id),
    )


def _job_finish(job_id: int, result: dict) -> None:
    from app.db import execute
    execute(
        "UPDATE whatif_generation_jobs SET status='done', stage='Finalizado', result=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (_json(result), job_id),
    )


def _job_fail(job_id: int, error: str) -> None:
    from app.db import execute
    execute(
        "UPDATE whatif_generation_jobs SET status='error', stage='Error recuperable', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (options.clean_text(error, 500), job_id),
    )


def _job_result(job_id: int) -> dict:
    row = one("SELECT result FROM whatif_generation_jobs WHERE id=?", (job_id,))
    return _loads(row["result"] if row else "{}")


def _validate_chapter(data: dict, number: int, config: dict | None = None) -> dict:
    plan = narrative.chapter_plan(config or {})
    configured = provider.setting_int("max_chapter_chars", 36000, 600, 200000)
    max_chars = max(configured, plan["total_words"] * 8)
    content = options.clean_narrative(data.get("content"), max_chars, paragraphs=True)
    if len(content) < 80:
        raise provider.ProviderError("La respuesta narrativa era demasiado corta. Puedes reintentar sin perder el estado.", 502)
    events = []
    for item in _as_list(data.get("events"))[:4]:
        if not isinstance(item, dict):
            continue
        title = _as_text(item.get("title"), 140)
        if not title:
            continue
        events.append({
            "title": title,
            "description": _as_text(item.get("description"), 900),
            "narrative_date": _as_text(item.get("narrative_date", data.get("narrative_date")), 80),
            "consequences": _as_text(item.get("consequences"), 600),
        })
    memories = []
    for item in _as_list(data.get("memories"))[:8]:
        if not isinstance(item, dict):
            continue
        content_memory = _as_text(item.get("content"), 900)
        if not content_memory:
            continue
        kind = _as_text(item.get("kind"), 30)
        if kind not in {"global", "historical", "character", "geographic", "chapter", "current"}:
            kind = "chapter"
        confidence = _as_text(item.get("confidence"), 30)
        if confidence not in {"confirmed", "belief", "proposed", "unknown"}:
            confidence = "confirmed"
        try:
            importance = max(1, min(10, int(item.get("importance") or 5)))
        except (TypeError, ValueError):
            importance = 5
        memories.append({"kind": kind, "content": content_memory, "confidence": confidence, "importance": importance})
    return {
        "title": options.clean_narrative(data.get("title"), 140) or f"Capítulo {number}",
        "content": content,
        "summary": options.clean_narrative(data.get("summary"), 500) or content[:240],
        "narrative_date": options.clean_narrative(data.get("narrative_date"), 80),
        "events": events,
        "memories": memories,
        "state_updates": data.get("state_updates") if isinstance(data.get("state_updates"), dict) else {},
        "proposed_rules": _as_list(data.get("proposed_rules"))[:4],
    }


def _validate_memory_cards(items: Any) -> list[dict]:
    cards = []
    for item in _as_list(items)[:24]:
        if not isinstance(item, dict):
            continue
        content = _as_text(item.get("content"), 2000)
        if not content:
            continue
        card = {
            "kind": _as_text(item.get("kind"), 40) or "event",
            "subject": _as_text(item.get("subject"), 160),
            "content": content,
            "importance": max(1, min(10, _int_safely(item.get("importance"), 6) or 6)),
            "metadata": item.get("metadata") if isinstance(item.get("metadata"), dict) else {},
        }
        cards.append(card)
    return cards


def _validate_proposal(data: dict, fallback: dict) -> dict:
    result = dict(fallback)
    for key in ("title", "premise", "description", "genre", "style", "depth", "format", "recommendation", "first_scene"):
        if data.get(key):
            result[key] = _as_text(data[key], 2000 if key in {"premise", "description"} else 500)
    result["genre"] = options.normalize_choice(result.get("genre", ""), options.GENRES, "personalizado")
    result["style"] = options.normalize_choice(result.get("style", ""), options.STYLES, "cinematografico")
    result["depth"] = options.normalize_choice(result.get("depth", ""), options.DEPTHS, "historia")
    result["format"] = options.normalize_choice(result.get("format", ""), options.FORMATS, "automatico")
    for key in ("rules", "characters", "locations"):
        if isinstance(data.get(key), list) and data[key]:
            result[key] = data[key]
    return result


def build_context(reality_id: int, timeline_id: int) -> dict:
    reality = one("SELECT * FROM whatif_realities WHERE id=?", (reality_id,))
    if not reality:
        raise HTTPError(404, "La realidad no existe.")
    timeline = one("SELECT * FROM whatif_timelines WHERE id=? AND reality_id=?", (timeline_id, reality_id))
    if not timeline:
        raise HTTPError(404, "La línea temporal no existe.")
    with connect_transaction() as conn:
        lineage = _timeline_ids(conn, timeline_id)
        marks = ",".join("?" for _ in lineage)
        rules = [dict(row) for row in conn.execute(
            f"SELECT kind,text FROM whatif_rules WHERE reality_id=? AND active=1 AND (timeline_id IS NULL OR timeline_id IN ({marks})) "
            "ORDER BY kind='established' DESC, id DESC LIMIT 20", (reality_id, *lineage)
        )]
        chapters = [dict(row) for row in conn.execute(
            "SELECT number,title,summary,narrative_date,content FROM whatif_chapters WHERE timeline_id=? ORDER BY number DESC LIMIT ?",
            (timeline_id, provider.setting_int("context_chapters", 6, 1, 20)),
        )]
        characters = [dict(row) for row in conn.execute(
            f"SELECT id,name,identity,personality,motivations,knowledge,status FROM whatif_characters "
            f"WHERE reality_id=? AND (timeline_id IS NULL OR timeline_id IN ({marks})) ORDER BY id LIMIT 12", (reality_id, *lineage)
        )]
        locations = [dict(row) for row in conn.execute(
            f"SELECT id,name,kind,description,status FROM whatif_locations "
            f"WHERE reality_id=? AND (timeline_id IS NULL OR timeline_id IN ({marks})) ORDER BY id LIMIT 12", (reality_id, *lineage)
        )]
        events = [dict(row) for row in conn.execute(
            f"SELECT title,description,narrative_date,consequences FROM whatif_events "
            f"WHERE reality_id=? AND timeline_id IN ({marks}) ORDER BY id DESC LIMIT 12", (reality_id, *lineage)
        )]
        memories = [dict(row) for row in conn.execute(
            f"SELECT kind,subject_id,content,confidence,importance FROM whatif_memories "
            f"WHERE reality_id=? AND (timeline_id IS NULL OR timeline_id IN ({marks})) "
            "ORDER BY importance DESC, updated_at DESC LIMIT 24", (reality_id, *lineage)
        )]
        memory_cards = [_card_dict(row) for row in conn.execute(
            f"SELECT kind,subject,content,importance,metadata FROM whatif_memory_cards "
            f"WHERE reality_id=? AND (timeline_id IS NULL OR timeline_id IN ({marks})) "
            "ORDER BY importance DESC, id DESC LIMIT ?",
            (reality_id, *lineage, provider.setting_int("memory_cards_limit", 40, 1, 200)),
        )]
    config = _narrative_from_input({"narrative_config": reality["narrative_config"]})
    return {
        "reality": dict(reality),
        "timeline": dict(timeline),
        "narrative_config": config,
        "modes": config["modes"],
        "premise": reality["premise"],
        "first_scene": next(
            (_as_text(row.get("content"), 600) for row in memories if str(row.get("kind")) == "current"), ""
        ),
        "rules": [f"[{row['kind']}] {row['text']}" for row in rules],
        "rule_rows": rules,
        "previous_summary": chapters[0]["summary"] if chapters else "",
        "previous_paragraphs": [
            paragraph.strip()
            for chapter in chapters
            for paragraph in re.split(r"\n\s*\n", str(chapter.get("content") or ""))
            if paragraph.strip()
        ][:200],
        "last_event": events[0]["description"] if events else "",
        "chapter_number": (chapters[0]["number"] + 1) if chapters else 1,
        "characters": characters,
        "locations": locations,
        "events": events,
        "memories": memories,
        "memory_cards": memory_cards,
        "chapters": list(reversed(chapters)),
    }


def connect_transaction():
    from app.db import transaction
    return transaction()


def create_proposal(owner: dict, idea: str, options_input: dict | None = None,
                    idempotency_key: str = "") -> dict:
    options_input = options_input or {}
    idea = options.clean_text(idea, 1200)
    moderation = provider.setting("moderation", "1") == "1"
    if moderation:
        problem = options.moderation_error(idea)
        if problem:
            raise HTTPError(400, problem)
    if len(idea) < 8:
        raise HTTPError(400, "Escribe una idea de al menos 8 caracteres.")
    proposal_key = idempotency_key or "proposal:" + hashlib.sha256(idea.encode()).hexdigest()[:24]
    job_id, fresh = _job_start(None, None, "proposal", proposal_key, owner=owner, request_data={"idea": idea})
    if not fresh:
        job = one("SELECT result FROM whatif_generation_jobs WHERE idempotency_key=?", (_job_key(proposal_key),))
        return _loads(job["result"] if job else "{}")
    config = _narrative_from_input(options_input)
    payload = {
        "idea": idea,
        "genre": options_input.get("genre", "personalizado"),
        "style": options_input.get("style", "cinematografico"),
        "depth": options_input.get("depth", "historia"),
        "format": options_input.get("format", "automatico"),
        "narrative_config": config,
    }
    check_rate(owner)
    result = None
    try:
        _job_stage(job_id, "Analizando la idea")
        engine = provider.TextProvider("proposal")
        fallback = local_proposal(payload)
        result = engine.generate(payload, local_proposal)
        proposal = _validate_proposal(result.data, fallback)
        proposal["narrative_config"] = config
        output = {"proposal": proposal, "narrative_config": config, "provider": result.provider, "model": result.model}
        _job_finish(job_id, {"proposal": proposal, "narrative_config": config})
        _record_usage(owner, result.provider, "proposal", result)
        return output
    except provider.ProviderError as exc:
        _job_fail(job_id, exc.message)
        _record_usage(owner, getattr(result, "provider", provider.text_provider_name()), "proposal", result, False)
        raise HTTPError(exc.status, exc.message)
    except Exception:
        _job_fail(job_id, "No fue posible preparar la propuesta.")
        raise


def create_reality(owner: dict, proposal_input: dict, idempotency_key: str = "") -> dict:
    if not isinstance(proposal_input, dict):
        raise HTTPError(400, "La propuesta no es válida.")
    idea = _as_text(proposal_input.get("premise") or proposal_input.get("idea"), 1200)
    if len(idea) < 8:
        raise HTTPError(400, "La premisa es obligatoria.")
    if provider.setting("moderation", "1") == "1":
        problem = options.moderation_error(idea)
        if problem:
            raise HTTPError(400, problem)
    title = _as_text(proposal_input.get("title"), 140) or _derive_title(idea, _topic_for(idea))
    proposal = _validate_proposal(proposal_input, local_proposal({"idea": idea, **proposal_input}))
    proposal["title"] = title
    config = _narrative_from_input(proposal_input)
    proposal["narrative_config"] = config
    code = options.slugify(title) + "-" + secrets.token_hex(3)
    genre = proposal["genre"]
    style = proposal["style"]
    depth = proposal["depth"]
    fmt = proposal["format"]
    with transaction() as conn:
        cursor = conn.execute(
            "INSERT INTO whatif_realities(owner_type,owner_key,code,title,premise,description,genre,style,depth,format,narrative_config) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (owner["type"], owner["key"], code, title, proposal["premise"], proposal.get("description", ""),
             genre, style, depth, fmt, _json(config)),
        )
        reality_id = int(cursor.lastrowid)
        timeline = conn.execute(
            "INSERT INTO whatif_timelines(reality_id,parent_id,name,divergence_event) VALUES (?,NULL,'Línea principal','')",
            (reality_id,),
        )
        timeline_id = int(timeline.lastrowid)
        conn.execute("UPDATE whatif_realities SET current_timeline_id=? WHERE id=?", (timeline_id, reality_id))
        for rule in _as_list(proposal.get("rules"))[:8]:
            if not isinstance(rule, dict):
                continue
            text = _as_text(rule.get("text"), 500)
            if text:
                kind = _as_text(rule.get("kind"), 30)
                if kind not in {"established", "hypothesis", "proposal", "discarded"}:
                    kind = "established"
                conn.execute(
                    "INSERT INTO whatif_rules(reality_id,timeline_id,kind,text,source) VALUES (?,NULL,?,?,'initial')",
                    (reality_id, kind, text),
                )
        for character in _as_list(proposal.get("characters"))[:8]:
            if not isinstance(character, dict) or not _as_text(character.get("name")):
                continue
            conn.execute(
                "INSERT INTO whatif_characters(reality_id,timeline_id,name,identity,description,personality,motivations) "
                "VALUES (?,NULL,?,?,?,?,?)",
                (reality_id, _as_text(character.get("name"), 120), _as_text(character.get("identity"), 200),
                 _as_text(character.get("description"), 500), _as_text(character.get("personality"), 300),
                 _as_text(character.get("motivations"), 300)),
            )
        for location in _as_list(proposal.get("locations"))[:8]:
            if not isinstance(location, dict) or not _as_text(location.get("name")):
                continue
            conn.execute(
                "INSERT INTO whatif_locations(reality_id,timeline_id,name,kind,description) VALUES (?,NULL,?,?,?)",
                (reality_id, _as_text(location.get("name"), 120), _as_text(location.get("kind"), 60) or "lugar",
                 _as_text(location.get("description"), 600)),
            )
        real_characters = [dict(row) for row in conn.execute(
            "SELECT id,name,identity,personality,motivations FROM whatif_characters WHERE reality_id=? ORDER BY id",
            (reality_id,),
        )]
        real_locations = [dict(row) for row in conn.execute(
            "SELECT id,name,kind,description FROM whatif_locations WHERE reality_id=? ORDER BY id",
            (reality_id,),
        )]
        real_events = [item for item in _as_list(proposal.get("events")) if isinstance(item, dict)]
        blueprint = narrative.build_blueprint({
            **proposal, "title": title, "premise": proposal["premise"],
            "characters": real_characters or proposal.get("characters"),
            "locations": real_locations or proposal.get("locations"),
            "events": real_events, "narrative_config": config,
        })
        for stage in narrative.BLUEPRINT_STAGES:
            for card in blueprint.get(stage, []):
                _insert_memory_card(
                    conn, reality_id, timeline_id, card["kind"], card["subject"], card["content"],
                    8 if stage in {"premise", "situation", "narrative"} else 7,
                    {"source": "blueprint", "stage": stage},
                )
        for section, cards in _blueprint_section_cards(blueprint).items():
            for card in cards:
                _insert_memory_card(
                    conn, reality_id, timeline_id, card["kind"], card["subject"], card["content"],
                    6, {"source": "blueprint", "section": section},
                )
        conn.execute(
            "INSERT INTO whatif_memories(reality_id,timeline_id,kind,subject_id,content,source,confidence,importance) "
            "VALUES (?,?,?,?,?,'initial','confirmed',9)",
            (reality_id, None, "global", 0, _as_text(proposal.get("premise"), 800)),
        )
        conn.execute(
            "INSERT INTO whatif_memories(reality_id,timeline_id,kind,subject_id,content,source,confidence,importance) "
            "VALUES (?,?,?,?,?,'initial','confirmed',8)",
            (reality_id, None, "current", 0, _as_text(proposal.get("first_scene"), 800) or "La premisa acaba de formularse."),
        )
        _insert_memory_card(
            conn, reality_id, timeline_id, "premise", title,
            proposal["premise"], 9, {"source": "initial", "genre": genre},
        )
        for mode in config["modes"]:
            _insert_memory_card(
                conn, reality_id, timeline_id, "mode", mode,
                f"Modo narrativo activo: {mode}. Nivel apocalipsis: {config['apocalypse_level']}; nivel loco: {config['crazy_level']}.",
                8, {"source": "initial", "config": config},
            )
        conn.execute(
            "INSERT INTO whatif_versions(reality_id,timeline_id,entity_type,entity_id,action,snapshot,note) "
            "VALUES (?,?,'reality',?,'create',?,'Creación de la realidad')",
            (reality_id, timeline_id, reality_id, _json({"title": title, "premise": proposal["premise"], "narrative_config": config})),
        )
    chapter_error = ""
    try:
        generate_turn(owner, reality_id, timeline_id,
                      action=_as_text(proposal.get("first_scene"), 400),
                      idempotency_key=idempotency_key or f"first:{code}",
                      length_override=_as_text(config.get("chapter_length"), 40))
    except HTTPError as exc:
        chapter_error = exc.message
    state = get_state(owner, reality_id)
    state["chapter_error"] = chapter_error
    return state


def _snapshot(conn, reality_id: int, timeline_id: int) -> str:
    data = {
        "rules": [dict(row) for row in conn.execute("SELECT * FROM whatif_rules WHERE reality_id=?", (reality_id,))],
        "characters": [dict(row) for row in conn.execute("SELECT * FROM whatif_characters WHERE reality_id=?", (reality_id,))],
        "locations": [dict(row) for row in conn.execute("SELECT * FROM whatif_locations WHERE reality_id=?", (reality_id,))],
        "events": [dict(row) for row in conn.execute("SELECT * FROM whatif_events WHERE reality_id=?", (reality_id,))],
        "memories": [dict(row) for row in conn.execute("SELECT * FROM whatif_memories WHERE reality_id=?", (reality_id,))],
        "memory_cards": [dict(row) for row in conn.execute("SELECT * FROM whatif_memory_cards WHERE reality_id=?", (reality_id,))],
    }
    return _json(data)


def _copy_shared_row(conn, table: str, row_id: int, timeline_id: int, root_id: int, fields: tuple[str, ...]) -> int:
    row = conn.execute(f"SELECT * FROM {table} WHERE id=?", (row_id,)).fetchone()
    if not row:
        return 0
    values = {field: row[field] for field in fields}
    values["timeline_id"] = timeline_id
    columns = ",".join(values)
    marks = ",".join("?" for _ in values)
    return int(conn.execute(f"INSERT INTO {table}({columns}) VALUES ({marks})", tuple(values.values())).lastrowid)


def _find_entity(conn, table: str, reality_id: int, timeline_id: int, change: dict) -> int:
    lineage = _timeline_ids(conn, timeline_id)
    marks = ",".join("?" for _ in lineage)
    entity_id = int(change.get("id") or 0)
    name = _as_text(change.get("name"), 120)
    if entity_id:
        row = conn.execute(
            f"SELECT id,timeline_id FROM {table} WHERE id=? AND reality_id=? AND (timeline_id IS NULL OR timeline_id IN ({marks}))",
            (entity_id, reality_id, *lineage),
        ).fetchone()
        return int(row["id"]) if row else 0
    if name:
        column = "title" if table == "whatif_events" else "name"
        row = conn.execute(
            f"SELECT id,timeline_id FROM {table} WHERE reality_id=? AND {column}=? AND (timeline_id IS NULL OR timeline_id IN ({marks})) ORDER BY timeline_id IS NULL DESC LIMIT 1",
            (reality_id, name, *lineage),
        ).fetchone()
        return int(row["id"]) if row else 0
    return 0


def apply_changes(conn, reality_id: int, timeline_id: int, changes: list) -> list[str]:
    applied = []
    allowed_actions = provider.allowed_actions()
    root_id = _root_timeline(conn, reality_id)
    for raw in changes[:20]:
        if not isinstance(raw, dict):
            continue
        action = _as_text(raw.get("action"), 40)
        if action not in allowed_actions:
            continue
        if action in {"update_character", "update_location"}:
            table = "whatif_characters" if action.endswith("character") else "whatif_locations"
            fields = ("reality_id", "timeline_id", "name", "identity", "description", "personality", "motivations",
                      "history", "knowledge", "status", "appearance", "kind", "features", "parent_id")
            entity_id = _find_entity(conn, table, reality_id, timeline_id, raw)
            row = conn.execute(f"SELECT * FROM {table} WHERE id=?", (entity_id,)).fetchone() if entity_id else None
            if not row:
                continue
            target_id = entity_id
            if timeline_id != root_id and row["timeline_id"] is None:
                target_id = _copy_shared_row(conn, table, entity_id, timeline_id, root_id, fields)
            editable = {"name", "identity", "description", "personality", "motivations", "history",
                        "knowledge", "status", "appearance", "kind", "features"}
            updates: dict[str, str] = {}
            if "field" in raw and "value" in raw:
                field = _as_text(raw.get("field"), 40)
                if field in editable:
                    updates = {field: _as_text(raw.get("value"), 900)}
            if not updates:
                updates = {"description": _as_text(raw.get("description") or raw.get("value"), 900)}
            sets = ",".join(f"{key}=?" for key in updates)
            conn.execute(f"UPDATE {table} SET {sets}, updated_at=CURRENT_TIMESTAMP WHERE id=?", (*updates.values(), target_id))
            applied.append(f"{action}:{target_id}")
        elif action == "add_character":
            name = _as_text(raw.get("name"), 120)
            if not name:
                continue
            conn.execute(
                "INSERT INTO whatif_characters(reality_id,timeline_id,name,identity,description,personality,motivations,status) "
                "VALUES (?,?,?,?,?,?,?,'activo')",
                (reality_id, timeline_id, name, _as_text(raw.get("identity"), 200),
                 _as_text(raw.get("description"), 700), _as_text(raw.get("personality"), 400),
                 _as_text(raw.get("motivations"), 400)),
            )
            applied.append("add_character")
        elif action == "add_location":
            name = _as_text(raw.get("name"), 120)
            if not name:
                continue
            conn.execute(
                "INSERT INTO whatif_locations(reality_id,timeline_id,name,kind,description,features) VALUES (?,?,?,?,?,?)",
                (reality_id, timeline_id, name, _as_text(raw.get("kind"), 60) or "lugar",
                 _as_text(raw.get("description"), 700), _as_text(raw.get("features"), 500)),
            )
            applied.append("add_location")
        elif action == "add_rule":
            text = _as_text(raw.get("text"), 600)
            if not text:
                continue
            kind = _as_text(raw.get("kind"), 30)
            if kind not in {"established", "hypothesis", "proposal", "discarded"}:
                kind = "proposal"
            conn.execute(
                "INSERT INTO whatif_rules(reality_id,timeline_id,kind,text,source) VALUES (?,?,?,?,'intervention')",
                (reality_id, timeline_id, kind, text),
            )
            applied.append("add_rule")
        elif action == "retire_rule":
            rule_id = int(raw.get("id") or 0)
            if rule_id:
                conn.execute("UPDATE whatif_rules SET active=0, kind='discarded' WHERE id=? AND reality_id=?", (rule_id, reality_id))
                applied.append("retire_rule")
        elif action in {"add_event", "update_event"}:
            title = _as_text(raw.get("title"), 160)
            if not title:
                continue
            if action == "update_event":
                event_id = _find_entity(conn, "whatif_events", reality_id, timeline_id, raw)
                if event_id:
                    conn.execute(
                        "UPDATE whatif_events SET title=?, description=?, consequences=?, narrative_date=? WHERE id=?",
                        (title, _as_text(raw.get("description"), 900), _as_text(raw.get("consequences"), 700),
                         _as_text(raw.get("narrative_date"), 80), event_id),
                    )
                    applied.append("update_event")
                    continue
            conn.execute(
                "INSERT INTO whatif_events(reality_id,timeline_id,title,description,narrative_date,consequences,status) "
                "VALUES (?,?,?,?,?,?,'confirmed')",
                (reality_id, timeline_id, title, _as_text(raw.get("description"), 900),
                 _as_text(raw.get("narrative_date"), 80), _as_text(raw.get("consequences"), 700)),
            )
            applied.append("add_event")
        elif action == "retire_element":
            entity_type = _as_text(raw.get("entity_type"), 30)
            table = {"character": "whatif_characters", "location": "whatif_locations", "event": "whatif_events"}.get(entity_type)
            if not table:
                continue
            entity_id = _find_entity(conn, table, reality_id, timeline_id, raw)
            if entity_id:
                conn.execute(f"UPDATE {table} SET status='descartado' WHERE id=?", (entity_id,))
                applied.append("retire_element")
        elif action == "set_point_of_view":
            value = _as_text(raw.get("value"), 700)
            if value:
                conn.execute(
                    "INSERT INTO whatif_memories(reality_id,timeline_id,kind,subject_id,content,source,confidence,importance) "
                    "VALUES (?,?,'current',0,?,'intervention','confirmed',10)",
                    (reality_id, timeline_id, value),
                )
                applied.append("set_point_of_view")
        elif action == "add_relationship":
            first = _find_entity(conn, "whatif_characters", reality_id, timeline_id, {"name": raw.get("name")})
            second = _find_entity(conn, "whatif_characters", reality_id, timeline_id, {"name": raw.get("other")})
            if first and second and first != second:
                conn.execute(
                    "INSERT INTO whatif_character_relationships(reality_id,timeline_id,character_a,character_b,relation,status) "
                    "VALUES (?,?,?,?,?,?)",
                    (reality_id, timeline_id, first, second, _as_text(raw.get("relation"), 300),
                     _as_text(raw.get("status"), 40) or "activa"),
                )
                applied.append("add_relationship")
    return applied


def _block_payload(context: dict, number: int, index: int, target_words: int,
                   direction: str, seed: str) -> dict:
    used_paragraphs = [
        str(item).strip()
        for item in _as_list(context.get("previous_paragraphs"))
        if str(item).strip()
    ]
    return {
        "operation": "chapter_block",
        "number": number,
        "index": index,
        "target_words": target_words,
        "context": context,
        "narrative_config": context.get("narrative_config", {}),
        "direction": direction,
        "seed": seed,
        "used_paragraphs": used_paragraphs[:200],
    }


def _generate_blocks(context: dict, plan: dict, direction: str, seed: str,
                     job_id: int = 0, checkpoint: dict | None = None,
                     fallback_on_error: bool = False) -> tuple[list, list]:
    blocks = [item for item in _as_list((checkpoint or {}).get("payloads")) if isinstance(item, dict)]
    generations = []
    number = int(context.get("chapter_number") or 1)
    for index in range(len(blocks) + 1, plan["blocks"] + 1):
        payload = _block_payload(context, number, index, plan["block_words"][index - 1], direction, seed)
        payload["used_paragraphs"] = list(payload.get("used_paragraphs") or []) + [
            paragraph.strip()
            for item in blocks
            for paragraph in re.split(r"\n\s*\n", str(item.get("text") or ""))
            if paragraph.strip()
        ]
        if job_id:
            _job_stage(job_id, f"Generando bloque {index} de {plan['blocks']}")
        try:
            generation = provider.TextProvider("chapter_block").generate(payload, narrative.local_chapter_block)
        except provider.ProviderError:
            if not fallback_on_error:
                raise
            generation = None
        if generation is not None:
            generations.append(generation)
        data = generation.data if generation is not None and isinstance(generation.data, dict) else {}
        text = options.clean_text(data.get("block") or data.get("content"), 120000, paragraphs=True)
        if len(text) < 80:
            data = narrative.local_chapter_block(payload)
            text = options.clean_text(data.get("block"), 120000, paragraphs=True)
        summary = options.clean_text(data.get("summary") or text[:240], 500)
        blocks.append({"index": index, "text": text, "summary": summary, "data": data})
        if job_id:
            _job_checkpoint(job_id, {
                "blocks": [{"index": item["index"], "text": item["text"], "summary": item["summary"]} for item in blocks],
                "next": index + 1,
                "total_blocks": plan["blocks"],
                "stage": f"Generando bloque {index} de {plan['blocks']}",
                "payloads": blocks,
            })
    return blocks, generations


def _chapter_from_blocks(blocks: list, number: int, config: dict) -> dict:
    events, memories, cards, rules = [], [], [], []
    for item in blocks:
        data = item.get("data") if isinstance(item.get("data"), dict) else {}
        events.extend(_as_list(data.get("events"))[:2])
        memories.extend(_as_list(data.get("memories"))[:2])
        cards.extend(_validate_memory_cards(data.get("memory_cards")))
        rules.extend(_as_list(data.get("proposed_rules"))[:2])
    composed = narrative.compose_chapter([str(item.get("text") or "") for item in blocks])
    move = MOVES[(number - 1) % len(MOVES)]
    block_dates = [
        str(item.get("data", {}).get("narrative_date") or "")
        for item in blocks if isinstance(item.get("data"), dict)
    ]
    date = next((item for item in block_dates if item.strip()), "")
    block_titles = [
        str(item.get("data", {}).get("title") or "")
        for item in blocks if isinstance(item.get("data"), dict)
    ]
    title = next((item for item in block_titles if item.strip()), move["title"])
    chapter = _validate_chapter({
        "title": title,
        "content": composed,
        "summary": " ".join(str(item.get("summary") or "") for item in blocks),
        "narrative_date": date or ("El instante de llegada" if number == 1 else "Poco después"),
        "events": events,
        "memories": memories,
        "state_updates": blocks[-1].get("data", {}).get("state_updates", {}) if blocks else {},
        "proposed_rules": rules,
    }, number, config)
    chapter["memory_cards"] = cards
    return chapter


def generate_chapter(owner: dict, reality_id: int, timeline_id: int, *, direction: str = "",
                      idempotency_key: str = "", length_override: str = "") -> dict:
    reality = require_reality(owner, reality_id)
    timeline = one("SELECT * FROM whatif_timelines WHERE id=? AND reality_id=?", (timeline_id, reality_id))
    if not timeline:
        raise HTTPError(404, "La línea temporal no existe.")
    identity = idempotency_key or secrets.token_hex(12)
    job_id, fresh = _job_start(
        reality_id, timeline_id, "chapter", identity, owner=owner,
        request_data={"direction": direction, "timeline_id": timeline_id},
    )
    if not fresh:
        return _job_result(job_id)
    check_rate(owner)
    generations: list = []
    try:
        _job_stage(job_id, "Construyendo contexto")
        context = build_context(reality_id, timeline_id)
        config = context["narrative_config"]
        if length_override:
            config = dict(config)
            config["chapter_length"] = length_override
            context["narrative_config"] = config
        plan = narrative.chapter_plan(config)
        checkpoint = _job_result(job_id)
        blocks, generations = _generate_blocks(context, plan, direction, identity, job_id, checkpoint)
        chapter = _chapter_from_blocks(blocks, context["chapter_number"], config)
        _job_stage(job_id, "Actualizando memoria")
        with transaction() as conn:
            number = conn.execute("SELECT COALESCE(MAX(number),0)+1 AS value FROM whatif_chapters WHERE timeline_id=?", (timeline_id,)).fetchone()["value"]
            cursor = conn.execute(
                "INSERT INTO whatif_chapters(reality_id,timeline_id,number,title,content,summary,narrative_date,provider,model) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (reality_id, timeline_id, number, chapter["title"], chapter["content"], chapter["summary"],
                 chapter["narrative_date"], getattr(generations[-1], "provider", "local") if generations else "local",
                 getattr(generations[-1], "model", "") if generations else ""),
            )
            chapter_id = int(cursor.lastrowid)
            conn.execute(
                "INSERT INTO whatif_chapter_versions(chapter_id,content,summary,note,provider) VALUES (?,?,?,'Versión original',?)",
                (chapter_id, chapter["content"], chapter["summary"],
                 getattr(generations[-1], "provider", "local") if generations else "local"),
            )
            for event in chapter["events"]:
                conn.execute(
                    "INSERT INTO whatif_events(reality_id,timeline_id,chapter_id,title,description,narrative_date,consequences,status) "
                    "VALUES (?,?,?,?,?,?,?,'confirmed')",
                    (reality_id, timeline_id, chapter_id, event["title"], event["description"],
                     event["narrative_date"], event["consequences"]),
                )
            for memory in chapter["memories"]:
                conn.execute(
                    "INSERT INTO whatif_memories(reality_id,timeline_id,kind,subject_id,content,source,confidence,importance) "
                    "VALUES (?,?,?,?,?,'chapter',?,?)",
                    (reality_id, timeline_id, memory["kind"], chapter_id, memory["content"],
                     memory["confidence"], memory["importance"]),
                )
            for card in chapter["memory_cards"]:
                _insert_memory_card(
                    conn, reality_id, timeline_id, card["kind"], card["subject"], card["content"],
                    card["importance"], {**card["metadata"], "chapter_id": chapter_id},
                )
            state_updates = chapter["state_updates"]
            if isinstance(state_updates, dict):
                situation = _as_text(state_updates.get("current_situation"), 800)
                if situation:
                    conn.execute(
                        "INSERT INTO whatif_memories(reality_id,timeline_id,kind,subject_id,content,source,confidence,importance) "
                        "VALUES (?,?,'current',?,?,'chapter','confirmed',10)",
                        (reality_id, timeline_id, chapter_id, situation),
                    )
                apply_changes(conn, reality_id, timeline_id, _as_list(state_updates.get("characters")) + _as_list(state_updates.get("locations")))
            for rule in chapter["proposed_rules"]:
                if isinstance(rule, dict) and _as_text(rule.get("text")):
                    conn.execute(
                        "INSERT INTO whatif_rules(reality_id,timeline_id,kind,text,source) VALUES (?,?,'hypothesis',?,'chapter')",
                        (reality_id, timeline_id, _as_text(rule.get("text"), 500)),
                    )
            conn.execute("UPDATE whatif_realities SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (reality_id,))
        output = {"chapter": {"id": chapter_id, "number": number, "title": chapter["title"],
                              "content": chapter["content"], "summary": chapter["summary"]},
                  "provider": getattr(generations[-1], "provider", "local") if generations else "local",
                  "model": getattr(generations[-1], "model", "") if generations else "",
                  "timeline_id": timeline_id, "blocks": len(blocks),
                  "word_count": len(chapter["content"].split())}
        _job_finish(job_id, output)
        result = generations[-1] if generations else None
        if result is not None:
            result.tokens_in = sum(getattr(item, "tokens_in", 0) for item in generations)
            result.tokens_out = sum(getattr(item, "tokens_out", 0) for item in generations)
        _record_usage(owner, output["provider"], "chapter", result)
        return output
    except provider.ProviderError as exc:
        _job_fail(job_id, exc.message)
        _record_usage(owner, getattr(generations[-1], "provider", provider.text_provider_name()) if generations else provider.text_provider_name(),
                      "chapter", generations[-1] if generations else None, False)
        raise HTTPError(exc.status, exc.message)
    except Exception:
        _job_fail(job_id, "No fue posible generar el capítulo. El estado anterior permanece intacto.")
        _record_usage(owner, provider.text_provider_name(), "chapter", None, False)
        raise


def _simulation_actions(context: dict, chapter: dict, action: str) -> list[str]:
    actions: list[str] = []
    characters = [row for row in _as_list(context.get("characters")) if isinstance(row, dict) and _as_text(row.get("name"))]
    locations = [row for row in _as_list(context.get("locations")) if isinstance(row, dict) and _as_text(row.get("name"))]
    events = [row for row in _as_list(context.get("events")) if isinstance(row, dict) and _as_text(row.get("title"))]
    modes = [str(item).lower() for item in _as_list(context.get("modes"))]
    lower_action = action.lower()
    if characters:
        first = _as_text(characters[0].get("name"), 120)
        if any(word in lower_action for word in ("habl", "pregunt", "decir", "interrog")):
            actions.append(f"Preguntar a {first} qué oculta sobre lo que acaba de pasar")
        else:
            actions.append(f"Acercarte a {first} y escuchar su versión")
        actions.append(f"Seguir a {first} sin revelar lo que sabes")
        if len(characters) > 1:
            second = _as_text(characters[1].get("name"), 120)
            actions.append(f"Contrastar lo que dicen {first} y {second}")
    if locations:
        place = _as_text(locations[0].get("name"), 120)
        actions.append(f"Explorar {place} y registrar lo que encuentres")
        actions.append(f"Buscar una salida o un objeto clave en {place}")
    if events:
        actions.append(f"Investigar {_as_text(events[0].get('title'), 120)}")
    if any("apocalip" in mode for mode in modes):
        actions.append("Buscar refugio y comprobar cuánto tiempo queda")
    if any("crazy" in mode or "loco" in mode or "surreal" in mode for mode in modes):
        actions.append("Seguir la anomalía aunque la lógica se rompa")
    if any("ilimit" in mode or "unlimit" in mode for mode in modes):
        actions.append("Probar una acción que antes era imposible")
    chapter_title = _as_text(chapter.get("title"), 120)
    if chapter_title:
        actions.append(f"Actuar sobre {chapter_title}")
    actions.extend((
        "Observar el entorno antes de moverte",
        "Consultar lo que ya sabes y decidir con cautela",
        "Cambiar el rumbo de la escena con una acción libre",
    ))
    result: list[str] = []
    for item in actions:
        text = _as_text(item, 140)
        if text and text not in result:
            result.append(text)
        if len(result) >= 5:
            break
    return result[:5]


def _simulation_payload(context: dict, chapter: dict, action: str, timeline_id: int) -> dict:
    scene = chapter.get("chapter") if isinstance(chapter.get("chapter"), dict) else {}
    characters = [row for row in _as_list(context.get("characters")) if isinstance(row, dict) and _as_text(row.get("name"))]
    locations = [row for row in _as_list(context.get("locations")) if isinstance(row, dict) and _as_text(row.get("name"))]
    events = [row for row in _as_list(context.get("events")) if isinstance(row, dict) and _as_text(row.get("title"))]
    memories = [row for row in _as_list(context.get("memories")) if isinstance(row, dict)]
    current = next((row for row in memories if str(row.get("kind")) == "current"), None)
    situation = _as_text(scene.get("summary"), 500)
    if not situation and current:
        situation = _as_text(current.get("content"), 500)
    content = _as_text(scene.get("content"), 2000)
    if not situation:
        situation = content[:240]
    names = [_as_text(row.get("name"), 120) for row in characters[:4]]
    places = [_as_text(row.get("name"), 120) for row in locations[:4]]
    titles = [_as_text(row.get("title"), 120) for row in events[:3]]
    chapter_number = _int_safely(scene.get("number"), _int_safely(context.get("chapter_number"), 1))
    premise = _as_text(context.get("premise"), 600)
    year = re.search(r"\b(año\s+\d+\s*d\.\s*C\.?[^.]{0,40})", premise, flags=re.IGNORECASE)
    date = _as_text(scene.get("narrative_date"), 80)
    if not date:
        date = options.clean_text(year.group(1), 80).strip(" ,") if year else (
            "El instante de llegada" if chapter_number == 1 else "Poco después"
        )
    if not situation:
        situation = _as_text(context.get("first_scene"), 500) or content[:240] or "El primer gesto todavía está por ocurrir."
    return {
        "scene_number": chapter_number,
        "chapter_id": _int_safely(scene.get("id"), 0),
        "timeline_id": timeline_id,
        "location": places[0] if places else "el lugar donde comienza la escena",
        "narrative_date": date,
        "situation": situation,
        "characters_present": names,
        "interactive_elements": (places + titles)[:4],
        "suggested_actions": _simulation_actions(context, scene, action),
        "last_action": _as_text(action, 500) or "La escena se abre por primera vez",
        "world_state": {
            "characters": names,
            "locations": places,
            "events": titles,
            "modes": [_as_text(item, 40) for item in _as_list(context.get("modes"))],
        },
        "content": content,
    }


def generate_turn(owner: dict, reality_id: int, timeline_id: int = 0, action: str = "", *,
                  branch: bool = False, idempotency_key: str = "",
                  length_override: str = "") -> dict:
    reality = require_reality(owner, reality_id)
    tid = _int_safely(timeline_id) or _int_safely(reality.get("current_timeline_id"))
    if not tid:
        raise HTTPError(404, "La línea temporal no existe.")
    text = options.clean_text(action, 1200)
    if text and len(text) < 3:
        raise HTTPError(400, "Escribe una acción un poco más larga.")
    if text and provider.setting("moderation", "1") == "1":
        problem = options.moderation_error(text)
        if problem:
            raise HTTPError(400, problem)
    key = idempotency_key or secrets.token_hex(12)
    job_id, fresh = _job_start(
        reality_id, tid, "turn", "turn:" + key, owner=owner,
        request_data={"action": text, "branch": bool(branch), "timeline_id": tid},
    )
    if not fresh:
        cached = _job_result(job_id)
        turn = cached.get("turn") if isinstance(cached.get("turn"), dict) else {}
        state = get_state(owner, reality_id, _int_safely(cached.get("chapter_id"), 0))
        if turn:
            state["simulation"] = turn
            state["turn"] = turn
        return state
    try:
        _job_stage(job_id, "Preparando escena")
        check_rate(owner)
        if branch and text:
            branched = create_branch(
                owner, reality_id, name=_as_text(text, 100) or "Línea alternativa",
                divergence=text, from_timeline_id=tid,
            )
            tid = _int_safely(branched.get("timeline_id"), tid)
            _job_stage(job_id, "Línea alternativa creada")
        context = build_context(reality_id, tid)
        chapter_result = generate_chapter(owner, reality_id, tid, direction=text,
                                          idempotency_key="chapter:" + key,
                                          length_override=length_override)
        turn = _simulation_payload(context, chapter_result, text, tid)
        with transaction() as conn:
            _insert_memory_card(
                conn, reality_id, tid, "simulation", f"Escena {turn['scene_number']}",
                _as_text(turn.get("content") or turn.get("situation"), 2000), 10,
                {"source": "simulation", "turn": turn},
            )
        output = {
            "turn": turn,
            "chapter": chapter_result.get("chapter", {}),
            "chapter_id": _int_safely((chapter_result.get("chapter") or {}).get("id"), 0),
            "timeline_id": tid,
        }
        _job_finish(job_id, output)
        state = get_state(owner, reality_id, _int_safely(output["chapter_id"], 0))
        state["simulation"] = turn
        state["turn"] = turn
        return state
    except HTTPError as exc:
        _job_fail(job_id, exc.message)
        raise
    except provider.ProviderError as exc:
        _job_fail(job_id, exc.message)
        raise HTTPError(exc.status, exc.message)
    except Exception:
        _job_fail(job_id, "No fue posible avanzar la escena. El estado anterior permanece intacto.")
        raise


def regenerate_chapter(owner: dict, reality_id: int, chapter_id: int, direction: str = "") -> dict:
    reality = require_reality(owner, reality_id)
    chapter = one("SELECT * FROM whatif_chapters WHERE id=? AND reality_id=?", (chapter_id, reality_id))
    if not chapter:
        raise HTTPError(404, "El capítulo no existe.")
    check_rate(owner)
    try:
        context = build_context(reality_id, int(chapter["timeline_id"]))
        number = int(chapter["number"])
        context["chapter_number"] = number
        config = context["narrative_config"]
        plan = narrative.chapter_plan(config)
        blocks, generations = _generate_blocks(
            context, plan, direction, f"regenerate:{chapter_id}", fallback_on_error=True,
        )
        validated = _chapter_from_blocks(blocks, number, config)
        if len(validated["content"].split()) < plan["total_words"]:
            blocks, generations = _generate_blocks(
                context, plan, direction, f"regenerate-local:{chapter_id}", fallback_on_error=True,
            )
            validated = _chapter_from_blocks(blocks, number, config)
        result = generations[-1] if generations else None
        provider_name = getattr(result, "provider", "local") if result else "local"
        model = getattr(result, "model", "") if result else ""
        with transaction() as conn:
            conn.execute(
                "INSERT INTO whatif_chapter_versions(chapter_id,content,summary,note,provider) VALUES (?,?,?,'Regeneración',?)",
                (chapter_id, validated["content"], validated["summary"], provider_name),
            )
            conn.execute(
                "UPDATE whatif_chapters SET content=?, summary=?, narrative_date=?, provider=?, model=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (validated["content"], validated["summary"], validated["narrative_date"] or chapter["narrative_date"],
                 provider_name, model, chapter_id),
            )
            for card in validated["memory_cards"]:
                _insert_memory_card(
                    conn, reality_id, int(chapter["timeline_id"]), card["kind"], card["subject"],
                    card["content"], card["importance"], {**card["metadata"], "chapter_id": chapter_id, "source": "regenerate"},
                )
            conn.execute(
                "INSERT INTO whatif_versions(reality_id,timeline_id,entity_type,entity_id,action,snapshot,note) "
                "VALUES (?,?,'chapter',?,'regenerate',?,'Capítulo regenerado con versión anterior conservada')",
                (reality_id, chapter["timeline_id"], chapter_id, _json({"previous": chapter["content"]})),
            )
        _record_usage(owner, provider_name, "chapter", result)
        return {"id": chapter_id, "content": validated["content"], "provider": provider_name,
                "blocks": len(blocks), "word_count": len(validated["content"].split())}
    except provider.ProviderError as exc:
        _record_usage(owner, provider.text_provider_name(), "chapter", None, False)
        raise HTTPError(exc.status, exc.message)


def edit_chapter(owner: dict, reality_id: int, chapter_id: int, content: str, note: str = "") -> dict:
    require_reality(owner, reality_id)
    chapter = one("SELECT * FROM whatif_chapters WHERE id=? AND reality_id=?", (chapter_id, reality_id))
    if not chapter:
        raise HTTPError(404, "El capítulo no existe.")
    text = options.clean_text(content, provider.setting_int("max_chapter_chars", 36000, 600, 200000), paragraphs=True)
    if len(text) < 20:
        raise HTTPError(400, "El capítulo debe tener al menos 20 caracteres.")
    with transaction() as conn:
        conn.execute(
            "INSERT INTO whatif_chapter_versions(chapter_id,content,summary,note,provider) VALUES (?,?,?,?,'user')",
            (chapter_id, text, chapter["summary"], _as_text(note, 200) or "Edición del usuario"),
        )
        conn.execute("UPDATE whatif_chapters SET content=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (text, chapter_id))
        conn.execute(
            "INSERT INTO whatif_versions(reality_id,timeline_id,entity_type,entity_id,action,snapshot,note) "
            "VALUES (?,?,'chapter',?,'edit',?,'Capítulo editado')",
            (reality_id, chapter["timeline_id"], chapter_id, _json({"chapter_id": chapter_id, "content": chapter["content"]})),
        )
    return {"id": chapter_id, "content": text}


def restore_chapter_version(owner: dict, reality_id: int, chapter_id: int, version_id: int) -> dict:
    require_reality(owner, reality_id)
    chapter = one("SELECT * FROM whatif_chapters WHERE id=? AND reality_id=?", (chapter_id, reality_id))
    version = one("SELECT * FROM whatif_chapter_versions WHERE id=? AND chapter_id=?", (version_id, chapter_id))
    if not chapter or not version:
        raise HTTPError(404, "La versión no existe.")
    with transaction() as conn:
        conn.execute(
            "INSERT INTO whatif_chapter_versions(chapter_id,content,summary,note,provider) VALUES (?,?,?,'user')",
            (chapter_id, version["content"], version["summary"], f"Recuperación de versión {version_id}"),
        )
        conn.execute("UPDATE whatif_chapters SET content=?, summary=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                     (version["content"], version["summary"], chapter_id))
        conn.execute(
            "INSERT INTO whatif_versions(reality_id,timeline_id,entity_type,entity_id,action,snapshot,note) "
            "VALUES (?,?,'chapter',?,'restore',?,'Versión recuperada')",
            (reality_id, chapter["timeline_id"], chapter_id, _json({"version_id": version_id})),
        )
    return {"id": chapter_id, "content": version["content"]}


def chapter_versions(owner: dict, reality_id: int, chapter_id: int) -> dict:
    require_reality(owner, reality_id)
    rows = query("SELECT id,summary,note,provider,created_at,length(content) AS chars FROM whatif_chapter_versions WHERE chapter_id=? ORDER BY id DESC", (chapter_id,))
    return {"versions": [dict(row) for row in rows]}


def propose_intervention(owner: dict, reality_id: int, text: str, timeline_id: int,
                         idempotency_key: str = "") -> dict:
    require_reality(owner, reality_id)
    timeline = one("SELECT * FROM whatif_timelines WHERE id=? AND reality_id=?", (timeline_id, reality_id))
    if not timeline:
        raise HTTPError(404, "La línea temporal no existe.")
    text = options.clean_text(text, 1200)
    if len(text) < 5:
        raise HTTPError(400, "Describe la intervención con al menos 5 caracteres.")
    if provider.setting("moderation", "1") == "1":
        problem = options.moderation_error(text)
        if problem:
            raise HTTPError(400, problem)
    identity = idempotency_key or "intervention:" + hashlib.sha256(f"{reality_id}:{text}".encode()).hexdigest()[:24]
    job_id, fresh = _job_start(reality_id, timeline_id, "intervention", identity)
    if not fresh:
        row = one("SELECT result FROM whatif_generation_jobs WHERE idempotency_key=?", (_job_key(identity),))
        return _loads(row["result"] if row else "{}")
    check_rate(owner)
    result = None
    try:
        _job_stage(job_id, "Recuperando contexto relevante")
        context = build_context(reality_id, timeline_id)
        payload = {
            "operation": "intervention",
            "text": text,
            "rules": context["rule_rows"],
            "characters": context["characters"],
            "locations": context["locations"],
            "events": context["events"],
            "memories": context["memories"],
        }
        _job_stage(job_id, "Analizando consecuencias")
        engine = provider.TextProvider("intervention")
        fallback = local_intervention(payload)
        result = engine.generate(payload, local_intervention)
        proposal = {
            "intent": _as_text(result.data.get("intent"), 40) or fallback["intent"],
            "summary": _as_text(result.data.get("summary"), 400) or text,
            "consequences": [_as_text(item, 300) for item in _as_list(result.data.get("consequences")) if _as_text(item)][:6]
                            or fallback["consequences"],
            "branch_required": bool(result.data.get("branch_required", fallback["branch_required"])),
            "changes": [change for change in _as_list(result.data.get("changes")) if isinstance(change, dict)][:20]
                       or fallback["changes"],
            "confidence": _as_text(result.data.get("confidence"), 30) or result.provider,
        }
        for change in proposal["changes"]:
            if _as_text(change.get("action"), 40) not in provider.allowed_actions():
                raise provider.ProviderError("El proveedor propuso una acción no permitida.", 502)
        cursor = None
        from app.db import execute
        cursor = execute(
            "INSERT INTO whatif_interventions(reality_id,timeline_id,user_text,intent,proposal,status) "
            "VALUES (?,?,?,?,?,'proposed')",
            (reality_id, timeline_id, text, proposal["intent"], _json(proposal)),
        )
        intervention_id = int(cursor.lastrowid)
        with transaction() as conn:
            _insert_memory_card(
                conn, reality_id, timeline_id, "intervention", proposal["intent"],
                proposal["summary"], 8,
                {"intervention_id": intervention_id, "provider": result.provider, "status": "proposed"},
            )
        output = {"intervention_id": intervention_id, "proposal": proposal, "provider": result.provider}
        _job_finish(job_id, output)
        _record_usage(owner, result.provider, "intervention", result)
        return output
    except provider.ProviderError as exc:
        _job_fail(job_id, exc.message)
        _record_usage(owner, getattr(result, "provider", provider.text_provider_name()), "intervention", result, False)
        raise HTTPError(exc.status, exc.message)
    except Exception:
        _job_fail(job_id, "No fue posible analizar la intervención.")
        raise


def _create_timeline(conn, reality_id: int, parent_id: int, name: str, divergence: str) -> int:
    timeline_id = int(conn.execute(
        "INSERT INTO whatif_timelines(reality_id,parent_id,name,divergence_event) VALUES (?,?,?,?)",
        (reality_id, parent_id, _as_text(name, 120) or "Línea alternativa", _as_text(divergence, 400)),
    ).lastrowid)
    conn.execute(
        "INSERT INTO whatif_memories(reality_id,timeline_id,kind,subject_id,content,source,confidence,importance) "
        "VALUES (?,?,'global',0,?,'branch','confirmed',9)",
        (reality_id, timeline_id, "Nueva línea temporal. " + _as_text(divergence, 500)),
    )
    _insert_memory_card(
        conn, reality_id, timeline_id, "branch", name,
        "Nueva línea temporal. " + (_as_text(divergence, 600) or _as_text(name, 600)), 9,
        {"parent_id": parent_id, "source": "branch"},
    )
    return timeline_id


def create_branch(owner: dict, reality_id: int, *, name: str, divergence: str, from_timeline_id: int) -> dict:
    reality = require_reality(owner, reality_id)
    parent = one("SELECT * FROM whatif_timelines WHERE id=? AND reality_id=?", (from_timeline_id, reality_id))
    if not parent:
        raise HTTPError(404, "La línea temporal de origen no existe.")
    with transaction() as conn:
        timeline_id = _create_timeline(conn, reality_id, from_timeline_id, name, divergence)
        conn.execute(
            "INSERT INTO whatif_versions(reality_id,timeline_id,entity_type,entity_id,action,snapshot,note) "
            "VALUES (?,?,'timeline',?,'branch',?,'Creación de ramificación')",
            (reality_id, timeline_id, timeline_id, _json({"parent_id": from_timeline_id, "divergence": divergence})),
        )
        conn.execute("UPDATE whatif_realities SET current_timeline_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (timeline_id, reality_id))
    return {"timeline_id": timeline_id, "reality_id": reality_id}


def apply_intervention(owner: dict, reality_id: int, intervention_id: int, *, branch: bool = False,
                       generate: bool = True, idempotency_key: str = "") -> dict:
    require_reality(owner, reality_id)
    row = one("SELECT * FROM whatif_interventions WHERE id=? AND reality_id=?", (intervention_id, reality_id))
    if not row:
        raise HTTPError(404, "La intervención no existe.")
    if row["status"] != "proposed":
        raise HTTPError(400, "Esa intervención ya fue aplicada o rechazada.")
    proposal = _loads(row["proposal"])
    make_branch = branch or bool(proposal.get("branch_required"))
    result = {"intervention_id": intervention_id, "branched": False, "timeline_id": int(row["timeline_id"])}
    with transaction() as conn:
        conn.execute(
            "INSERT INTO whatif_versions(reality_id,timeline_id,entity_type,entity_id,action,snapshot,note) "
            "VALUES (?,?,'reality',?,'intervention',?,'Estado antes de la intervención')",
            (reality_id, row["timeline_id"], reality_id, _snapshot(conn, reality_id, int(row["timeline_id"]))),
        )
        timeline_id = int(row["timeline_id"])
        if make_branch:
            timeline_id = _create_timeline(
                conn, reality_id, timeline_id,
                "Alternativa: " + _as_text(proposal.get("intent"), 40),
                _as_text(proposal.get("summary"), 400),
            )
            result["branched"] = True
        applied = apply_changes(conn, reality_id, timeline_id, _as_list(proposal.get("changes")))
        conn.execute(
            "INSERT INTO whatif_memories(reality_id,timeline_id,kind,subject_id,content,source,confidence,importance) "
            "VALUES (?,?,'current',?,?,'intervention','confirmed',10)",
            (reality_id, timeline_id, intervention_id, _as_text(proposal.get("summary"), 800)),
        )
        consequences = _as_list(proposal.get("consequences"))
        _insert_memory_card(
            conn, reality_id, timeline_id, "consequence", _as_text(proposal.get("intent"), 120),
            _as_text(proposal.get("summary"), 800) + (" " + " ".join(_as_text(item, 300) for item in consequences[:3]) if consequences else ""),
            9, {"intervention_id": intervention_id, "applied": applied, "branched": make_branch},
        )
        conn.execute(
            "UPDATE whatif_interventions SET status='applied', applied_at=CURRENT_TIMESTAMP, result=?, timeline_id=? WHERE id=?",
            (_json({"applied": applied, "branched": make_branch, "timeline_id": timeline_id}), timeline_id, intervention_id),
        )
        conn.execute("UPDATE whatif_realities SET current_timeline_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (timeline_id, reality_id))
        result["applied"] = applied
        result["timeline_id"] = timeline_id
    if generate:
        try:
            continuation = generate_chapter(
                owner, reality_id, timeline_id,
                direction=_as_text(proposal.get("summary"), 400),
                idempotency_key=idempotency_key or f"intervention-continue:{intervention_id}",
            )
            result["chapter"] = continuation.get("chapter")
        except HTTPError as exc:
            result["chapter_error"] = exc.message
    return result


def reject_intervention(owner: dict, reality_id: int, intervention_id: int) -> dict:
    require_reality(owner, reality_id)
    row = one("SELECT * FROM whatif_interventions WHERE id=? AND reality_id=?", (intervention_id, reality_id))
    if not row:
        raise HTTPError(404, "La intervención no existe.")
    from app.db import execute
    execute("UPDATE whatif_interventions SET status='rejected' WHERE id=?", (intervention_id,))
    return {"intervention_id": intervention_id, "status": "rejected"}


def compare_timelines(owner: dict, reality_id: int, left_id: int, right_id: int) -> dict:
    require_reality(owner, reality_id)
    for timeline_id in (left_id, right_id):
        if not one("SELECT 1 FROM whatif_timelines WHERE id=? AND reality_id=?", (timeline_id, reality_id)):
            raise HTTPError(404, "Una de las líneas temporales no existe.")
    timelines = {row["id"]: dict(row) for row in query("SELECT * FROM whatif_timelines WHERE reality_id=?", (reality_id,))}

    def summary(timeline_id: int) -> dict:
        return {
            "timeline": timelines.get(timeline_id, {}),
            "chapters": [dict(row) for row in query(
                "SELECT number,title,summary FROM whatif_chapters WHERE timeline_id=? ORDER BY number", (timeline_id,))],
            "events": [dict(row) for row in query(
                "SELECT title,description,narrative_date FROM whatif_events WHERE timeline_id=? ORDER BY id", (timeline_id,))],
            "rules": [dict(row) for row in query(
                "SELECT kind,text FROM whatif_rules WHERE timeline_id=? AND active=1 ORDER BY id", (timeline_id,))],
            "memory_cards": [_card_dict(row) for row in query(
                "SELECT kind,subject,content,importance,metadata FROM whatif_memory_cards "
                "WHERE timeline_id=? ORDER BY importance DESC, id DESC LIMIT 40", (timeline_id,))],
        }

    left, right = summary(left_id), summary(right_id)
    left_titles = {item["title"] for item in left["events"]}
    right_titles = {item["title"] for item in right["events"]}
    return {
        "left": left,
        "right": right,
        "differences": {
            "only_left_events": sorted(left_titles - right_titles),
            "only_right_events": sorted(right_titles - left_titles),
            "chapter_count_left": len(left["chapters"]),
            "chapter_count_right": len(right["chapters"]),
            "divergence_left": timelines.get(left_id, {}).get("divergence_event", ""),
            "divergence_right": timelines.get(right_id, {}).get("divergence_event", ""),
        },
    }


def list_realities(owner: dict) -> dict:
    clause, params = _owner_clause(owner)
    rows = query(
        f"SELECT r.*, (SELECT COUNT(*) FROM whatif_chapters c WHERE c.reality_id=r.id) AS chapter_count, "
        f"(SELECT COUNT(*) FROM whatif_timelines t WHERE t.reality_id=r.id) AS timeline_count, "
        f"(SELECT title FROM whatif_chapters c WHERE c.reality_id=r.id ORDER BY c.id DESC LIMIT 1) AS last_chapter "
        f"FROM whatif_realities r WHERE {clause} AND r.status != 'trash' ORDER BY r.updated_at DESC, r.id DESC LIMIT 60",
        params,
    )
    return {"realities": [dict(row) for row in rows]}


def get_state(owner: dict, reality_id: int, chapter_id: int = 0) -> dict:
    reality = require_reality(owner, reality_id)
    timelines = [dict(row) for row in query(
        "SELECT * FROM whatif_timelines WHERE reality_id=? ORDER BY id", (reality_id,))]
    timeline_id = int(reality.get("current_timeline_id") or (timelines[0]["id"] if timelines else 0))
    chapters = [dict(row) for row in query(
        "SELECT id,number,title,summary,narrative_date,status FROM whatif_chapters WHERE timeline_id=? ORDER BY number",
        (timeline_id,))]
    active = None
    if chapter_id:
        active = one("SELECT * FROM whatif_chapters WHERE id=? AND timeline_id=?", (chapter_id, timeline_id))
    if not active and chapters:
        active = one("SELECT * FROM whatif_chapters WHERE id=?", (chapters[-1]["id"],))
    lineage = _timeline_ids_from_db(timeline_id)
    marks = ",".join("?" for _ in lineage)
    rules = [dict(row) for row in query(
        f"SELECT id,kind,text,active,source FROM whatif_rules WHERE reality_id=? AND (timeline_id IS NULL OR timeline_id IN ({marks})) "
        "ORDER BY active DESC, id DESC LIMIT 60", (reality_id, *lineage))]
    characters = [dict(row) for row in query(
        f"SELECT id,name,identity,description,personality,motivations,history,knowledge,status,appearance FROM whatif_characters "
        f"WHERE reality_id=? AND (timeline_id IS NULL OR timeline_id IN ({marks})) ORDER BY id LIMIT 60", (reality_id, *lineage))]
    locations = [dict(row) for row in query(
        f"SELECT id,name,kind,description,features,status,image_asset_id FROM whatif_locations "
        f"WHERE reality_id=? AND (timeline_id IS NULL OR timeline_id IN ({marks})) ORDER BY id LIMIT 60", (reality_id, *lineage))]
    events = [dict(row) for row in query(
        f"SELECT id,title,description,narrative_date,consequences,status FROM whatif_events "
        f"WHERE reality_id=? AND timeline_id IN ({marks}) ORDER BY id DESC LIMIT 60", (reality_id, *lineage))]
    memories = [dict(row) for row in query(
        f"SELECT id,kind,subject_id,content,source,confidence,importance,created_at FROM whatif_memories "
        f"WHERE reality_id=? AND (timeline_id IS NULL OR timeline_id IN ({marks})) "
        "ORDER BY importance DESC, id DESC LIMIT 80", (reality_id, *lineage))]
    grouped: dict[str, list] = {}
    for memory in memories:
        grouped.setdefault(memory["kind"], []).append(memory)
    cards = [_card_dict(row) for row in query(
        f"SELECT id,kind,subject,content,importance,metadata,created_at FROM whatif_memory_cards "
        f"WHERE reality_id=? AND (timeline_id IS NULL OR timeline_id IN ({marks})) "
        "ORDER BY importance DESC, id DESC LIMIT ?", (reality_id, *lineage, provider.setting_int("memory_cards_limit", 40, 1, 200)),
    )]
    grouped_cards: dict[str, list] = {}
    for card in cards:
        grouped_cards.setdefault(card["kind"], []).append(card)
    simulation = None
    for card in cards:
        metadata = card.get("metadata")
        if not isinstance(metadata, dict) or metadata.get("source") != "simulation":
            continue
        turn = metadata.get("turn")
        if isinstance(turn, dict):
            simulation = dict(turn)
            simulation.setdefault("content", card["content"])
            simulation["created_at"] = card["created_at"]
            break
    blueprint_cards = [_card_dict(row) for row in query(
        f"SELECT id,kind,subject,content,importance,metadata,created_at FROM whatif_memory_cards "
        f"WHERE reality_id=? AND (timeline_id IS NULL OR timeline_id IN ({marks})) "
        "ORDER BY id ASC LIMIT 500", (reality_id, *lineage),
    )]
    blueprint = {stage: [] for stage in narrative.BLUEPRINT_STAGES}
    sections = {code: [] for code in narrative.BLUEPRINT_SECTIONS}
    for card in blueprint_cards:
        metadata = card.get("metadata")
        if not isinstance(metadata, dict) or metadata.get("source") != "blueprint":
            continue
        stage = metadata.get("stage")
        if stage in blueprint:
            blueprint[stage].append(card)
        section = metadata.get("section")
        if section in sections:
            sections[section].append(card)
    relationships = [dict(row) for row in query(
        f"SELECT r.id,r.timeline_id,r.character_a,r.character_b,a.name AS character_a_name,"
        f"b.name AS character_b_name,r.relation,r.status,r.created_at "
        f"FROM whatif_character_relationships r "
        f"JOIN whatif_characters a ON a.id=r.character_a "
        f"JOIN whatif_characters b ON b.id=r.character_b "
        f"WHERE r.reality_id=? AND (r.timeline_id IS NULL OR r.timeline_id IN ({marks})) "
        "ORDER BY r.id LIMIT 60", (reality_id, *lineage),
    )]
    config = _narrative_from_input({"narrative_config": reality.get("narrative_config")})
    assets = [dict(row) for row in query(
        "SELECT id,kind,entity_type,entity_id,provider,model,status,mime,url,created_at FROM whatif_assets WHERE reality_id=? ORDER BY id DESC LIMIT 30",
        (reality_id,))]
    interventions = [dict(row) for row in query(
        "SELECT id,intent,status,user_text,created_at FROM whatif_interventions WHERE reality_id=? ORDER BY id DESC LIMIT 20",
        (reality_id,))]
    versions = [dict(row) for row in query(
        "SELECT id,entity_type,entity_id,action,note,created_at FROM whatif_versions WHERE reality_id=? ORDER BY id DESC LIMIT 30",
        (reality_id,))]
    return {
        "reality": reality,
        "timelines": timelines,
        "timeline_id": timeline_id,
        "chapters": chapters,
        "chapter": dict(active) if active else None,
        "rules": rules,
        "characters": characters,
        "locations": locations,
        "events": events,
        "memories": grouped,
        "narrative_config": config,
        "modes": config["modes"],
        "memory_cards": grouped_cards,
        "simulation": simulation,
        "suggested_actions": simulation.get("suggested_actions", []) if simulation else [],
        "blueprint": blueprint,
        "sections": sections,
        "character_relationships": relationships,
        "assets": assets,
        "interventions": interventions,
        "versions": versions,
        "config": provider.config_status(),
    }


def _timeline_ids_from_db(timeline_id: int) -> list[int]:
    result = []
    current = timeline_id
    seen = set()
    while current and current not in seen:
        seen.add(current)
        row = one("SELECT parent_id FROM whatif_timelines WHERE id=?", (current,))
        result.append(current)
        current = row["parent_id"] if row else None
    return result


def update_reality(owner: dict, reality_id: int, *, title: str = "", description: str = "",
                   status: str = "", favorite: int | None = None,
                   narrative_config: str = "", config: dict | None = None) -> dict:
    reality = require_reality(owner, reality_id)
    updates: dict[str, Any] = {}
    if title:
        updates["title"] = _as_text(title, 140)
    if description:
        updates["description"] = _as_text(description, 2000)
    if status:
        if status not in {"active", "archived", "trash"}:
            raise HTTPError(400, "Estado no válido.")
        updates["status"] = status
    if favorite is not None:
        updates["favorite"] = 1 if favorite else 0
    normalized = None
    if config is not None or narrative_config:
        normalized = _narrative_from_input({"narrative_config": narrative_config, **(config or {})})
        updates["narrative_config"] = _json(normalized)
    if not updates:
        return {"ok": True}
    updates["updated_at"] = _stamp()
    sets = ",".join(f"{key}=?" for key in updates)
    from app.db import execute
    execute(f"UPDATE whatif_realities SET {sets} WHERE id=?", (*updates.values(), reality_id))
    if normalized is not None:
        with transaction() as conn:
            _insert_memory_card(
                conn, reality_id, reality.get("current_timeline_id"), "mode", "configuración narrativa",
                "Configuración narrativa actualizada: " + ", ".join(normalized["modes"] or ["sin modos"]),
                7, {"source": "update", "config": normalized},
            )
        return {"ok": True, "changes": list(updates), "narrative_config": normalized, "modes": normalized["modes"]}
    return {"ok": True, "changes": list(updates)}


def update_modes(owner: dict, reality_id: int, config: Any = None) -> dict:
    reality = require_reality(owner, reality_id)
    normalized = _narrative_from_input(config)
    timeline_id = reality.get("current_timeline_id")
    with transaction() as conn:
        conn.execute(
            "UPDATE whatif_realities SET narrative_config=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (_json(normalized), reality_id),
        )
        _insert_memory_card(
            conn, reality_id, timeline_id, "mode", "configuración narrativa",
            "Modos activos: " + (", ".join(normalized["modes"]) or "ninguno") +
            f". Apocalipsis: {normalized['apocalypse_level']}; locura: {normalized['crazy_level']}; final: {normalized['ending']}.",
            8, {"source": "modes", "config": normalized},
        )
    return {"ok": True, "narrative_config": normalized, "modes": normalized["modes"]}


def _validate_ideas(items: Any, payload: dict) -> list[dict]:
    ideas = []
    excluded = {text.casefold() for text in narrative._clean_list(payload.get("exclude"))}
    for item in _as_list(items)[:12]:
        if not isinstance(item, dict):
            continue
        title = _as_text(item.get("title"), 160)
        premise = _as_text(item.get("premise"), 800)
        if not title or not premise or title.casefold() in excluded:
            continue
        tags = item.get("tags") if isinstance(item.get("tags"), (list, tuple)) else narrative._clean_list(item.get("tags"))
        ideas.append({
            "title": title,
            "premise": premise,
            "genre": _as_text(item.get("genre"), 80) or options.label_for(options.GENRES, str(payload.get("genre") or "personalizado")),
            "context": _as_text(item.get("context"), 500),
            "conflict": _as_text(item.get("conflict"), 500),
            "unexpected_element": _as_text(item.get("unexpected_element"), 500),
            "direction": _as_text(item.get("direction"), 500),
            "tags": [_as_text(tag, 60) for tag in tags if _as_text(tag, 60)][:8],
            "image_suggestion": _as_text(item.get("image_suggestion"), 500),
        })
        excluded.add(title.casefold())
    return ideas[:max(1, min(12, _int_safely(payload.get("count"), 5) or 5))]


def generate_ideas(owner: dict, params: Any = None) -> dict:
    data = params if isinstance(params, dict) else {}
    if provider.setting("ideas_enabled", "1") != "1":
        raise HTTPError(403, "La generación de ideas está desactivada por el administrador.")
    topic = options.clean_text(data.get("seed") or data.get("idea") or data.get("topic"), 1200)
    if provider.setting("moderation", "1") == "1":
        problem = options.moderation_error(topic)
        if problem:
            raise HTTPError(400, problem)
    config = _narrative_from_input(data)
    seed = options.clean_text(data.get("seed") or data.get("idempotency_key"), 120) or topic
    identity = data.get("idempotency_key") or "ideas:" + hashlib.sha256(
        f"{owner['type']}:{owner['key']}:{seed}:{config['chapter_length']}".encode("utf-8")
    ).hexdigest()[:24]
    job_id, fresh = _job_start(None, None, "ideas", identity, owner=owner,
                               request_data={"seed": seed, "count": data.get("count", "")})
    if not fresh:
        return _job_result(job_id)
    check_rate(owner)
    payload = {
        "idea": topic,
        "seed": seed,
        "exclude": data.get("exclude", ""),
        "genre": data.get("genre") or provider.setting("default_genre", "personalizado"),
        "style": data.get("style", "cinematografico"),
        "modes": config["modes"],
        "variation": data.get("variation", "genre"),
        "count": _int_safely(data.get("count"), 5) or 5,
        "narrative_config": config,
    }
    try:
        generation = provider.TextProvider("idea").generate(payload, narrative.local_ideas)
        ideas = _validate_ideas(generation.data.get("ideas"), payload)
        if not ideas:
            ideas = _validate_ideas(narrative.local_ideas(payload)["ideas"], payload)
        output = {"ideas": ideas, "provider": generation.provider, "model": generation.model, "count": len(ideas)}
        _job_finish(job_id, output)
        _record_usage(owner, generation.provider, "idea", generation)
        return output
    except provider.ProviderError as exc:
        local = narrative.local_ideas(payload)
        ideas = _validate_ideas(local["ideas"], payload)
        output = {"ideas": ideas, "provider": "local", "model": "whatif-local-1", "count": len(ideas)}
        _job_finish(job_id, output)
        _record_usage(owner, "local", "idea", None, False)
        return output


def job_status(owner: dict, job_id: int) -> dict:
    row = one("SELECT * FROM whatif_generation_jobs WHERE id=?", (job_id,))
    if not row:
        raise HTTPError(404, "La tarea no existe.")
    if row["reality_id"]:
        require_reality(owner, int(row["reality_id"]))
    else:
        request = _loads(row["request"])
        if request.get("owner") != owner:
            raise HTTPError(404, "La tarea no existe.")
    result = _loads(row["result"])
    status = row["status"]
    if status == "done":
        progress = 100
    elif status in {"queued", "canceled"}:
        progress = 0
    else:
        total = _int_safely(result.get("total_blocks"), 0)
        completed = len(_as_list(result.get("blocks")))
        progress = 100 if status == "error" and completed and total and completed >= total else (
            min(95, completed * 100 // total) if total else (10 if status == "running" else 0)
        )
    return {
        "job_id": int(row["id"]), "id": int(row["id"]), "kind": row["kind"],
        "status": status, "stage": row["stage"], "progress": progress,
        "result": result, "error": row["error"] or "",
    }


def asset_bytes(owner: dict, asset_id: int) -> tuple[bytes, str]:
    row = one(
        "SELECT a.data,a.mime,a.status FROM whatif_assets a "
        "JOIN whatif_realities r ON r.id=a.reality_id "
        "WHERE a.id=? AND r.owner_type=? AND r.owner_key=?",
        (asset_id, owner["type"], owner["key"]),
    )
    if not row or row["status"] != "ready" or not row["data"]:
        raise HTTPError(404, "El recurso visual no existe.")
    return bytes(row["data"]), row["mime"]


def _schematic_svg(reality: dict, payload: dict) -> bytes:
    kind = _as_text(payload.get("kind"), 30) or "cover"
    title = _as_text(payload.get("title") or reality["title"], 90)
    genre = options.label_for(options.GENRES, reality["genre"])
    items = [item for item in _as_list(payload.get("items")) if isinstance(item, dict)][:6]
    labels = ""
    for index, item in enumerate(items):
        name = html.escape(_as_text(item.get("name"), 50))
        x = 90 + (index % 3) * 210
        y = 230 + (index // 3) * 110
        labels += (
            f'<circle cx="{x}" cy="{y}" r="7" fill="#ffd89b"/>'
            f'<text x="{x + 16}" y="{y + 5}" fill="#dcd8ff" font-size="15" font-family="sans-serif">{name}</text>'
        )
    subtitle = "MAPA ESQUEMÁTICO" if kind == "map" else ("RETRATO" if kind == "portrait" else f"REALIDAD · {html.escape(genre.upper())}")
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 420" role="img">'
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#080b2a"/><stop offset="0.55" stop-color="#29145c"/>'
        '<stop offset="1" stop-color="#0b3550"/></linearGradient></defs>'
        '<rect width="720" height="420" fill="url(#g)"/>'
        '<circle cx="575" cy="95" r="150" fill="none" stroke="#c084fc" stroke-opacity="0.35" stroke-width="2"/>'
        '<circle cx="575" cy="95" r="96" fill="none" stroke="#54e8ff" stroke-opacity="0.45"/>'
        '<path d="M0 330 Q180 250 360 330 T720 310" fill="none" stroke="#54e8ff" stroke-opacity="0.3"/>'
        f'<text x="48" y="80" fill="#c084fc" font-size="16" letter-spacing="4" font-family="sans-serif">{subtitle}</text>'
        f'<text x="48" y="135" fill="#ffffff" font-size="34" font-weight="700" font-family="sans-serif">{html.escape(title)}</text>'
        f'{labels}'
        '<text x="48" y="386" fill="#9aa0c8" font-size="13" font-family="sans-serif">OTRAVERSO WHAT IF · representación esquemática generada localmente</text>'
        '</svg>'
    )
    return svg.encode("utf-8")


def _asset_kind(value: str) -> str:
    candidate = _as_text(value, 30).lower()
    return candidate if candidate in {"map", "portrait"} else "cover"


def _asset_prompt(reality: dict, prompt: str) -> str:
    return f"{reality['title']}. {reality['premise']}. {_as_text(prompt, 500)}"


def _asset_identity(reality: dict, kind: str, entity_id: int, prompt: str) -> str:
    content_hash = hashlib.sha256(
        f"{_as_text(prompt, 2000)}|{reality['title']}|{reality['premise']}".encode("utf-8")
    ).hexdigest()[:24]
    return "asset:" + hashlib.sha256(
        f"{reality['id']}|{kind}|{entity_id}|{content_hash}".encode("utf-8")
    ).hexdigest()[:24]


def _reusable_asset(reality_id: int, kind: str, entity_id: int, prompt: str, fallback_prompt: str):
    for candidate in (prompt, fallback_prompt):
        value = _as_text(candidate, 2000)
        if not value:
            continue
        row = one(
            "SELECT id,provider,model,status FROM whatif_assets "
            "WHERE reality_id=? AND kind=? AND entity_id=? AND status='ready' AND prompt=? "
            "ORDER BY id DESC LIMIT 1",
            (reality_id, kind, entity_id, value),
        )
        if row:
            return row
    return None


def _asset_output(row, job_id: int) -> dict:
    return {
        "asset_id": int(row["id"]),
        "url": f"/api/what-if/v1/assets/{int(row['id'])}",
        "provider": str(row["provider"] or "schematic"),
        "model": str(row["model"] or ""),
        "job_id": job_id,
    }


def _build_asset(owner: dict, reality: dict, job_id: int, *, kind: str, entity_id: int,
                 prompt: str, fallback_prompt: str) -> dict:
    _job_stage(job_id, "Preparando referencias visuales")
    reality_id = int(reality["id"])
    if kind == "map":
        items = [dict(row) for row in query("SELECT name,description FROM whatif_locations WHERE reality_id=? ORDER BY id LIMIT 8", (reality_id,))]
        title = reality["title"] + " · Mapa"
    elif kind == "portrait":
        row = one("SELECT name,personality FROM whatif_characters WHERE id=? AND reality_id=?", (entity_id, reality_id))
        items = [dict(row)] if row else []
        title = (row["name"] + " · Retrato") if row else reality["title"]
    else:
        kind = "cover"
        items = [dict(row) for row in query("SELECT name FROM whatif_locations WHERE reality_id=? ORDER BY id LIMIT 6", (reality_id,))]
        title = reality["title"]
    use_ai = provider.setting("generate_images", "0") == "1" and provider.config_status()["image_configured"]
    mime = "image/svg+xml"
    provider_name = "schematic"
    model = "whatif-svg-1"
    image = None
    if use_ai:
        _job_stage(job_id, "Generando imagen")
        image = provider.ImageProvider().generate(prompt or fallback_prompt)
        data, mime, provider_name, model = image.data, image.mime, image.provider, image.model
    else:
        data = _schematic_svg(reality, {"kind": kind, "title": title, "items": items})
    _job_stage(job_id, "Guardando recurso")
    with transaction() as conn:
        cursor = conn.execute(
            "INSERT INTO whatif_assets(reality_id,timeline_id,entity_type,entity_id,kind,prompt,provider,model,status,mime,data) "
            "VALUES (?,?,?,?,?,?,?,?,'ready',?,?)",
            (reality_id, reality.get("current_timeline_id"), kind, entity_id, kind,
             _as_text(prompt or fallback_prompt, 2000), provider_name, model, mime, data),
        )
        asset_id = int(cursor.lastrowid)
        if kind == "cover":
            conn.execute("UPDATE whatif_realities SET cover_asset_id=? WHERE id=?", (asset_id, reality_id))
        if kind == "map":
            conn.execute("UPDATE whatif_locations SET image_asset_id=? WHERE reality_id=? AND image_asset_id IS NULL", (asset_id, reality_id))
    output = _asset_output({"id": asset_id, "provider": provider_name, "model": model}, job_id)
    _job_finish(job_id, output)
    _record_usage(owner, provider_name, "asset", image)
    return output


def _run_asset_job(owner: dict, reality: dict, job_id: int, *, kind: str, entity_id: int,
                   prompt: str, fallback_prompt: str) -> None:
    if not _job_activate(job_id, "Preparando referencias visuales"):
        return
    try:
        _build_asset(owner, reality, job_id, kind=kind, entity_id=entity_id,
                     prompt=prompt, fallback_prompt=fallback_prompt)
    except provider.ProviderError as exc:
        _job_fail(job_id, exc.message)
        _record_usage(owner, provider.image_provider_name(), "asset", None, False)
    except Exception:
        _job_fail(job_id, "No fue posible crear el recurso visual.")


def generate_asset(owner: dict, reality_id: int, *, kind: str, entity_id: int = 0,
                   prompt: str = "", idempotency_key: str = "", background: bool = False) -> dict:
    reality = require_reality(owner, reality_id)
    normalized_kind = _asset_kind(kind)
    clean_prompt = _as_text(prompt, 2000)
    fallback_prompt = _asset_prompt(reality, clean_prompt)
    identity = idempotency_key or _asset_identity(reality, normalized_kind, entity_id, clean_prompt)
    reusable = _reusable_asset(reality_id, normalized_kind, entity_id, clean_prompt, fallback_prompt)
    if not reusable:
        check_rate(owner)
    job_id, fresh = _job_start(
        reality_id, reality.get("current_timeline_id"), "asset", identity,
        request_data={"kind": normalized_kind, "entity_id": entity_id}, queued=background and not reusable,
    )
    if not fresh:
        job = one("SELECT status,result FROM whatif_generation_jobs WHERE idempotency_key=?", (_job_key(identity),))
        result = _loads(job["result"] if job else "{}")
        if result.get("asset_id") and job and job["status"] == "done":
            return {**result, "job_id": job_id, "status": "done"}
        if background:
            return {"job_id": job_id, "status": job["status"] if job else "queued"}
        return {**result, "job_id": job_id}
    if reusable:
        output = _asset_output(reusable, job_id)
        _job_finish(job_id, output)
        return {**output, "status": "done"} if background else output
    if background:
        threading.Thread(
            target=_run_asset_job,
            args=(owner, reality, job_id),
            kwargs={"kind": normalized_kind, "entity_id": entity_id,
                    "prompt": clean_prompt, "fallback_prompt": fallback_prompt},
            name=f"whatif-asset-{job_id}", daemon=True,
        ).start()
        return {"job_id": job_id, "status": "queued"}
    try:
        return _build_asset(
            owner, reality, job_id, kind=normalized_kind, entity_id=entity_id,
            prompt=clean_prompt, fallback_prompt=fallback_prompt,
        )
    except provider.ProviderError as exc:
        _job_fail(job_id, exc.message)
        _record_usage(owner, provider.image_provider_name(), "asset", None, False)
        raise HTTPError(exc.status, exc.message)
    except Exception:
        _job_fail(job_id, "No fue posible crear el recurso visual.")
        raise


def cancel_job(owner: dict, job_id: int) -> dict:
    row = one(
        "SELECT j.* FROM whatif_generation_jobs j JOIN whatif_realities r ON r.id=j.reality_id "
        "WHERE j.id=? AND r.owner_type=? AND r.owner_key=?",
        (job_id, owner["type"], owner["key"]),
    )
    if not row:
        raise HTTPError(404, "La tarea no existe.")
    if row["status"] in {"done", "error", "canceled"}:
        return {"job_id": job_id, "status": row["status"]}
    from app.db import execute
    execute("UPDATE whatif_generation_jobs SET status='canceled', stage='Cancelada', updated_at=CURRENT_TIMESTAMP WHERE id=?", (job_id,))
    return {"job_id": job_id, "status": "canceled"}


def admin_stats() -> dict:
    counts = {}
    for table in ("whatif_realities", "whatif_timelines", "whatif_chapters", "whatif_interventions",
                  "whatif_generation_jobs", "whatif_usage", "whatif_assets", "whatif_memory_cards"):
        row = one(f"SELECT COUNT(*) AS total FROM {table}")
        counts[table] = row["total"] if row else 0
    failures = one("SELECT COUNT(*) AS total FROM whatif_generation_jobs WHERE status='error'")
    recent_jobs = [dict(row) for row in query(
        "SELECT id,kind,status,stage,error,created_at FROM whatif_generation_jobs ORDER BY id DESC LIMIT 12")]
    usage = [dict(row) for row in query(
        "SELECT provider,kind,SUM(success) AS ok,COUNT(*) AS total FROM whatif_usage "
        "WHERE created_at >= datetime('now','-1 day') GROUP BY provider,kind ORDER BY total DESC")]
    return {"counts": counts, "failures": failures["total"] if failures else 0,
            "recent_jobs": recent_jobs, "usage": usage, "config": provider.config_status()}
