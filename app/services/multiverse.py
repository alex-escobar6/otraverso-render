"""Configuración declarativa del multiverso OTRAVERSO.

Universos → planetas → experiencias. La portada consume estos datos para
sincronizar la escena Canvas, el panel interior y la guía inferior sin crear
dependencias entre módulos ni duplicar renderizadores.
"""
from __future__ import annotations

UNIVERSES: dict[str, dict] = {
    "shop": {
        "order": "01",
        "short": "SHOP",
        "name": "OTRAVERSO SHOP",
        "tagline": "Descubre cosas que no sabías que necesitabas",
        "cta": "EXPLORAR SHOP",
        "status": "ACTIVO",
        "index_status": "Activo",
        "color": "#54e8ff",
        "accent": "#ffb55c",
        "route": "/shop",
        "kind": "market-nebula",
        "ambient": "Nebulosa comercial con núcleo de intercambio y órbitas de mercancías.",
        "detail": "Productos reales en inventario y bajo pedido, con entregas en Nariño y compras confirmadas por WhatsApp.",
        "x": "72%",
        "y": "26%",
        "planets": [
            {"code": "central", "name": "TIENDA CENTRAL", "type": "COMERCIO", "route": "/shop", "status": "activo", "note": "Inventario real y novedades."},
            {"code": "catalogo", "name": "CATÁLOGO VIVO", "type": "EXPERIENCIA", "route": "/shop/catalogo", "status": "activo", "note": "Búsqueda, filtros y categorías."},
            {"code": "beneficios", "name": "BENEFICIOS", "type": "SERVICIO", "route": "/shop/beneficios", "status": "activo", "note": "Ventajas de comprar en OTRAVERSO."},
            {"code": "cobertura", "name": "ZONAS DE ENTREGA", "type": "SERVICIO", "route": "/shop/cobertura", "status": "activo", "note": "Cobertura real en Nariño."},
        ],
    },
    "play": {
        "order": "02",
        "short": "PLAY",
        "name": "OTRAVERSO PLAY",
        "tagline": "Cruza el agujero negro y entra al universo de juegos",
        "cta": "ENTRAR A PLAY",
        "status": "ACTIVO",
        "index_status": "Activo",
        "color": "#f472b6",
        "accent": "#7dd3fc",
        "route": "/play",
        "kind": "digital-civilization",
        "ambient": "Civilización digital suspendida sobre un núcleo de entretenimiento.",
        "detail": "Un universo de juegos y entretenimiento que se abre a través de un agujero negro. Ya disponible para explorar.",
        "x": "82%",
        "y": "64%",
        "planets": [
            {"code": "hub", "name": "HUB CENTRAL", "type": "MUNDO", "route": "/play", "status": "activo", "note": "Ciudad monumental y accesos a los juegos."},
            {"code": "gravity", "name": "GRAVITY", "type": "JUEGO WEBGL", "route": "/play/gravity", "status": "activo", "note": "Física orbital con fallback 2D."},
            {"code": "nexus-rush", "name": "NEXUS RUSH", "type": "JUEGO", "route": "/play/nexus-rush", "status": "activo", "note": "Tres circuitos, turbo y récord local."},
            {"code": "star-hunter", "name": "CAZADOR DE ESTRELLAS", "type": "JUEGO", "route": "/play/games/star-hunter", "status": "activo", "note": "Caza fragmentos en el cinturón lumínico."},
            {"code": "secreto", "name": "MUNDO SECRETO", "type": "ANOMALÍA", "route": "", "status": "oculto", "note": "Aparece cuando la exploración lo permite."},
        ],
    },
    "whatif": {
        "order": "03",
        "short": "WHAT IF",
        "name": "OTRAVERSO WHAT IF",
        "tagline": "Imagina lo imposible. Descubre qué pasaría si...",
        "cta": "ENTRAR A WHAT IF",
        "status": "ACTIVO",
        "index_status": "Activo",
        "color": "#c084fc",
        "accent": "#ffd89b",
        "route": "/what-if",
        "kind": "narrative-nebula",
        "ambient": "Nebulosa narrativa de hilos de realidad y escenarios no escritos.",
        "detail": "Crea realidades alternativas, continúa historias con memoria, interviene el destino de sus personajes y conserva cada línea temporal.",
        "x": "58%",
        "y": "80%",
        "planets": [
            {"code": "relatos", "name": "RELATOS POSIBLES", "type": "NARRATIVA", "route": "/what-if/crear", "status": "activo", "note": "Crea una premisa y continua su historia."},
            {"code": "paradojas", "name": "PARADOJAS", "type": "EXPERIMENTO", "route": "/what-if/biblioteca", "status": "activo", "note": "Intervenciones y líneas temporales divergentes."},
            {"code": "archivo", "name": "ARCHIVO DE FUTUROS", "type": "ARCHIVO", "route": "/what-if/biblioteca", "status": "activo", "note": "Capítulos, versiones y realidades guardadas."},
        ],
    },
    "labs": {
        "order": "04",
        "short": "LABS",
        "name": "OTRAVERSO LABS",
        "tagline": "Experimenta. Crea. Evoluciona",
        "cta": "VER PRESENTACIÓN",
        "status": "PRÓXIMAMENTE",
        "index_status": "Planeado",
        "color": "#38e8d0",
        "accent": "#60a5fa",
        "route": "",
        "kind": "quantum-reactor",
        "ambient": "Reactor de geometría experimental con pulsos de señal.",
        "detail": "Una dimensión de prototipos, herramientas y estructuras tecnológicas en desarrollo.",
        "x": "38%",
        "y": "18%",
        "planets": [
            {"code": "prototipos", "name": "PROTOTIPOS", "type": "HERRAMIENTA", "route": "", "status": "en diseño", "note": "Pruebas aisladas sin datos simulados."},
            {"code": "senales", "name": "LABORATORIO DE SEÑALES", "type": "EXPERIMENTO", "route": "", "status": "en diseño", "note": "Detección y lectura de anomalías."},
            {"code": "archivo", "name": "ARCHIVO TÉCNICO", "type": "ARCHIVO", "route": "", "status": "en diseño", "note": "Documentación de cada experimento."},
        ],
    },
}

UNIVERSE_COPY = {
    code: (meta["ambient"], meta["detail"], meta["color"])
    for code, meta in UNIVERSES.items()
}

UNIVERSE_META = {
    code: dict(meta)
    for code, meta in UNIVERSES.items()
}


def ordered() -> list[tuple[str, dict]]:
    return [(code, UNIVERSES[code]) for code in ("shop", "play", "whatif", "labs") if code in UNIVERSES]


def scene_config() -> list[dict]:
    """Configuración mínima que consume `galaxy.js` sin acoplamiento a Python."""
    return [
        {
            "id": code,
            "code": code,
            "kind": meta["kind"],
            "color": meta["color"],
            "accent": meta["accent"],
            "status": meta["status"],
            "route": meta["route"],
            "planets": [dict(planet) for planet in meta["planets"]],
        }
        for code, meta in ordered()
    ]


def public_cards() -> list[dict]:
    return [
        {
            "code": code,
            "order": meta["order"],
            "short": meta["short"],
            "name": meta["name"],
            "tagline": meta["tagline"],
            "detail": meta["detail"],
            "status": meta["status"],
            "color": meta["color"],
            "accent": meta["accent"],
            "route": meta["route"],
            "kind": meta["kind"],
            "ambient": meta["ambient"],
            "planets": [dict(planet) for planet in meta["planets"]],
        }
        for code, meta in ordered()
    ]
