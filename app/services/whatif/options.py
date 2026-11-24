from __future__ import annotations

import html
import re
import unicodedata

GENRES = (
    {"code": "ciencia-ficcion", "label": "Ciencia ficción"},
    {"code": "historia-alternativa", "label": "Historia alternativa"},
    {"code": "fantasia", "label": "Fantasía"},
    {"code": "misterio", "label": "Misterio"},
    {"code": "terror", "label": "Terror"},
    {"code": "aventura", "label": "Aventura"},
    {"code": "ciencia", "label": "Ciencia"},
    {"code": "distopia", "label": "Distopía"},
    {"code": "utopia", "label": "Utopía"},
    {"code": "comedia", "label": "Comedia"},
    {"code": "supervivencia", "label": "Supervivencia"},
    {"code": "horror-cosmico", "label": "Horror cósmico"},
    {"code": "realidades-alternativas", "label": "Realidades alternativas"},
    {"code": "surrealista", "label": "Surrealista"},
    {"code": "personalizado", "label": "Personalizado"},
)

STYLES = (
    {"code": "cinematografico", "label": "Cinematográfico"},
    {"code": "realista", "label": "Realista"},
    {"code": "epico", "label": "Épico"},
    {"code": "misterioso", "label": "Misterioso"},
    {"code": "oscuro", "label": "Oscuro"},
    {"code": "aventurero", "label": "Aventurero"},
    {"code": "documental", "label": "Documental"},
    {"code": "absurdo", "label": "Absurdo"},
    {"code": "surrealista", "label": "Surrealista"},
    {"code": "personalizado", "label": "Personalizado"},
)

MODES_LIST = (
    {"code": "apocalypse", "label": "Apocalipsis"},
    {"code": "crazy", "label": "Loco / surreal"},
    {"code": "unlimited", "label": "Sin límites"},
)

IDEA_VARIATIONS = (
    {"code": "darker", "label": "Más oscura"},
    {"code": "absurd", "label": "Absurda"},
    {"code": "twist", "label": "Con giro inesperado"},
    {"code": "mix", "label": "Mezcla de géneros"},
    {"code": "genre", "label": "Dentro del género"},
)

CHAPTER_LENGTHS = (
    {"code": "normal", "label": "Normal", "setting": "chapter_normal_words", "words": 1800},
    {"code": "extenso", "label": "Extenso", "setting": "chapter_extended_words", "words": 3200},
    {"code": "cinematografico", "label": "Cinematográfico", "setting": "chapter_cinematic_words", "words": 5000},
)

APOCALYPSE_LEVELS = (
    {"code": "gradual", "label": "Gradual"},
    {"code": "acelerado", "label": "Acelerado"},
    {"code": "inevitable", "label": "Inevitable"},
    {"code": "caos-absoluto", "label": "Caos absoluto"},
)

CRAZY_LEVELS = (
    {"code": "1", "label": "Toque extraño"},
    {"code": "2", "label": "Inquietante"},
    {"code": "3", "label": "Absurdo"},
    {"code": "4", "label": "Surrealismo total"},
)

PERSPECTIVES = (
    {"code": "primera persona", "label": "Primera persona"},
    {"code": "tercera persona", "label": "Tercera persona"},
    {"code": "omnisciente", "label": "Narrador omnisciente"},
    {"code": "testigo", "label": "Testigo de los hechos"},
    {"code": "segunda persona", "label": "Segunda persona"},
)

ENDINGS = (
    {"code": "abierto", "label": "Abierto"},
    {"code": "tragedia", "label": "Tragedia"},
    {"code": "supervivencia", "label": "Supervivencia"},
    {"code": "destruccion", "label": "Destrucción"},
    {"code": "reconstruccion", "label": "Reconstrucción"},
)

DEPTHS = (
    {"code": "rapida", "label": "Exploración rápida", "chapters": 1},
    {"code": "historia", "label": "Historia desarrollada", "chapters": 3},
    {"code": "profunda", "label": "Realidad profunda", "chapters": 6},
)

FORMATS = (
    {"code": "narrativo", "label": "Narrativo"},
    {"code": "interactivo", "label": "Interactivo"},
    {"code": "hibrido", "label": "Híbrido"},
    {"code": "automatico", "label": "Automático / recomendado"},
)

INTERVENTIONS = (
    {"code": "acontecimiento", "label": "Modificar un acontecimiento"},
    {"code": "personaje", "label": "Cambiar un personaje"},
    {"code": "relacion", "label": "Cambiar una relación"},
    {"code": "regla", "label": "Alterar una regla"},
    {"code": "lugar", "label": "Añadir o modificar un lugar"},
    {"code": "elemento", "label": "Eliminar o modificar un elemento"},
    {"code": "pasado", "label": "Cambiar el pasado"},
    {"code": "nuevo", "label": "Introducir algo nuevo"},
    {"code": "punto-vista", "label": "Cambiar el punto de vista"},
    {"code": "alternativa", "label": "Crear una alternativa"},
)

INSPIRATION = (
    "¿Y si los dinosaurios nunca se hubieran extinguido?",
    "¿Y si Roma nunca hubiera caído?",
    "¿Y si la humanidad descubriera vida inteligente en Marte?",
    "¿Y si pudiéramos viajar al pasado?",
    "¿Y si los sueños fueran compartidos?",
    "¿Y si existiera una civilización bajo los océanos?",
)

PURPOSE_PAYLOADS = {
    "proposal": {"code": "proposal", "label": "Propuesta de realidad", "fields": ("idea", "genre", "style", "depth", "format")},
    "chapter": {"code": "chapter", "label": "Capítulo completo", "fields": ("number", "context", "direction")},
    "idea": {"code": "idea", "label": "Ideas narrativas", "fields": ("seed", "exclude", "genre", "mode", "variation", "count")},
    "chapter_block": {"code": "chapter_block", "label": "Bloque de capítulo", "fields": ("index", "target_words", "context", "narrative_config")},
    "intervention": {"code": "intervention", "label": "Intervención", "fields": ("text", "characters", "locations", "events")},
    "summary": {"code": "summary", "label": "Resumen de estado", "fields": ("context",)},
}

BLOCKED_PATTERNS = (
    r"ignore (all |previous |the )?instructions",
    r"ignora (todas |las |las anteriores )?instrucciones",
    r"system prompt",
    r"prompt del sistema",
    r"drop\s+table",
    r"delete\s+from\s+\w+",
    r"update\s+\w+\s+set\s+",
    r"<script",
    r"javascript:",
    r"api[_ -]?key\s*[:=]",
    r"contraseña\s*[:=]",
    r"password\s*[:=]",
)


def codes(items: tuple[dict, ...] | list[dict]) -> tuple[str, ...]:
    return tuple(str(item["code"]) for item in items)


def parse_available_codes(value: object, items: tuple[dict, ...], setting_key: str = "") -> tuple[str, ...]:
    raw = str(value if value is not None else "")
    if not raw.strip() and setting_key:
        from app.db import get_setting
        raw = get_setting("whatif", setting_key, "")
    allowed = codes(items)
    if not raw.strip():
        return allowed
    found: list[str] = []
    for chunk in raw.split(","):
        candidate = clean_text(chunk, 60).lower().replace(" ", "-").strip("-")
        if candidate in allowed and candidate not in found:
            found.append(candidate)
    return tuple(found) or allowed


def available_genres(value: object = None) -> tuple[str, ...]:
    return parse_available_codes(value if value is not None else "", GENRES, "available_genres")


def available_styles(value: object = None) -> tuple[str, ...]:
    return parse_available_codes(value if value is not None else "", STYLES, "available_styles")


parse_available_genres = available_genres
parse_available_styles = available_styles


def label_for(items: tuple[dict, ...], code: str) -> str:
    for item in items:
        if item["code"] == code:
            return item["label"]
    return code.replace("-", " ").title()


def normalize_choice(value: str, items: tuple[dict, ...], default: str) -> str:
    candidate = (value or "").strip().lower().replace(" ", "-")
    return candidate if any(item["code"] == candidate for item in items) else default


def clean_text(value: object, limit: int = 1200, *, paragraphs: bool = False) -> str:
    text = html.unescape(str(value if value is not None else ""))
    text = re.sub(r"<[^>]+>", " ", text)
    text = "".join(char for char in text if char in "\n\t" or ord(char) >= 32)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if paragraphs:
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{4,}", "\n\n\n", text)
    else:
        text = re.sub(r"\s+", " ", text)
    return text.strip()[:limit]


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", clean_text(value, 160))
    text = "".join(char for char in text if not unicodedata.combining(char)).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return (text or "realidad")[:60]


def moderation_error(value: object) -> str:
    text = clean_text(value, 4000).lower()
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, text):
            return "La solicitud contiene instrucciones técnicas o de control no permitidas. Escribe solo la idea narrativa."
    if len(clean_text(value, 20000)) > 12000:
        return "La solicitud es demasiado extensa."
    return ""


def recommend_format(idea: str, genre: str, style: str, depth: str) -> str:
    text = f"{idea} {genre} {style}".lower()
    if any(word in text for word in ("¿qué pasaría", "que pasaria", "y si", "decisión", "decision", "elegir")):
        return "hibrido"
    if any(word in text for word in ("misterio", "terror", "paradoja", "detective", "investig")):
        return "interactivo"
    if depth in {"rapida", "historia"}:
        return "narrativo"
    return "hibrido"


def options_payload() -> dict:
    genre_codes = available_genres()
    style_codes = available_styles()
    return {
        "genres": [item for item in GENRES if item["code"] in genre_codes],
        "styles": [item for item in STYLES if item["code"] in style_codes],
        "depths": DEPTHS,
        "formats": FORMATS,
        "interventions": INTERVENTIONS,
        "inspiration": INSPIRATION,
        "modes": MODES_LIST,
        "idea_variations": IDEA_VARIATIONS,
        "chapter_lengths": CHAPTER_LENGTHS,
        "apocalypse_levels": APOCALYPSE_LEVELS,
        "crazy_levels": CRAZY_LEVELS,
        "randomness_levels": (
            {"code": "1", "label": "Baja"},
            {"code": "2", "label": "Media"},
            {"code": "3", "label": "Alta"},
            {"code": "4", "label": "Extrema"},
        ),
        "surprise_frequency_levels": (
            {"code": "0", "label": "Sin sorpresas"},
            {"code": "25", "label": "Ocasional"},
            {"code": "50", "label": "Frecuente"},
            {"code": "75", "label": "Alta"},
            {"code": "100", "label": "Constante"},
        ),
        "perspectives": PERSPECTIVES,
        "endings": ENDINGS,
        "purposes": list(PURPOSE_PAYLOADS),
        "purpose_payloads": PURPOSE_PAYLOADS,
    }
