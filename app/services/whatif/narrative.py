from __future__ import annotations

import hashlib
import json
import random
import re
from typing import Any

from . import options

DEFAULT_CONFIG = {
    "apocalypse": 0,
    "apocalypse_level": "gradual",
    "crazy": 0,
    "crazy_level": 1,
    "unlimited": 0,
    "chapter_length": "normal",
    "randomness": 2,
    "surprise_frequency": 25,
    "point_of_view": "tercera persona",
    "initial_characters": 3,
    "ending": "abierto",
    "modes": [],
}

CONCEPTS = {
    "ciencia-ficcion": (
        ("La estación que recordaba", "Una estación orbital conserva los recuerdos de una tripulación que nunca existió.", "El archivo de la estación", "Una grabación contradice la historia oficial de la misión.", "El recuerdo pertenece al futuro"),
        ("El protocolo silencioso", "Una inteligencia artificial decide obedecer una orden que nadie dio.", "El centro de control", "Desactivar el sistema implicaría perder la única señal de vida.", "La orden fue escrita por los propios habitantes"),
        ("Órbita de regreso", "Un planeta devuelve a sus visitantes con recuerdos de otras vidas.", "La base de desembarque", "Regresar significa aceptar una identidad ajena.", "El viajero ya había regresado antes"),
    ),
    "historia-alternativa": (
        ("El decreto sin firmar", "Una decisión pendiente cambia el destino de un imperio entero.", "La cancillería", "Firmar el decreto condena a una ciudad y salva a otra.", "El documento estaba fechado en el futuro"),
        ("La batalla que no se libró", "Un ejército se retira antes del primer disparo y la ciudad debe inventar su propia defensa.", "Las murallas", "La retirada era una estrategia para provocar una rebelión.", "El general desaparecido dejó un mapa"),
        ("El tratado de los tres días", "Tres firmas bastan para retractarse de una guerra ya comenzada.", "La sala de tratados", "Uno de los firmantes busca sabotear la paz.", "La guerra era necesaria para derrocar al rey"),
    ),
    "fantasia": (
        ("La biblioteca de los nombres", "Cada nombre escrito en un libro convoca a su dueño.", "La biblioteca sellada", "Un nombre fue borrado para evitar un desastre.", "El nombre borrado era el de la biblioteca"),
        ("El bosque que concede deseos", "El bosque concede un deseo a quien encontrar la salida.", "El sendero principal", "La salida solo aparece después de aceptar una pérdida.", "El deseo ya se había concedido antes de pedirlo"),
        ("La corona de ceniza", "Una corona rota reparte el poder entre quienes la tocan.", "La cámara del trono", "Reunir los fragmentos devolvería el poder a un tirano.", "La ceniza conserva la memoria de los reyes"),
    ),
    "misterio": (
        ("La casa de las nueve llaves", "Nueve cerraduras guardian una habitación que nadie reconoce.", "El vestíbulo", "Cada llave abre una versión distinta del mismo cuarto.", "La habitación cambia de dueño cada noche"),
        ("El testigo mudo", "Un testigo no habla, pero dejó un registro de todo lo que vio.", "La comisaría", "El registro apunta al investigador.", "El testigo escribió el final antes del crimen"),
        ("La última llamada", "Una llamada telefónica anuncia un crimen que aún no ocurre.", "La central telefónica", "Impedir el crimen borraría la prueba de who lo planeó.", "La voz pertenece a la víctima futura"),
    ),
    "terror": (
        ("La puerta que respira", "Una puerta respira cuando alguien se acerca.", "El pasillo", "Abrirla deja entrar algo que ya conoce la casa.", "La puerta era la única salida"),
        ("El huésped invisible", "Una casa tiene un huésped que nadie ha visto pero todos nombran.", "La sala común", "El huésped exige que se respete una regla antigua.", "El huésped es uno de los habitantes"),
        ("La grabación número trece", "Una cinta de vídeo muestra la muerte de quien la reproduce.", "La sala de proyección", "Destruir la cinta no evita la muerte.", "La cinta se proyecta sola cada trece noches"),
    ),
    "aventura": (
        ("El mapa sin destino", "Un mapa muestra rutas hacia lugares que aún no existen.", "El puerto", "La ruta elegida cambia el mapa mientras se recorre.", "El mapa fue dibujado por el viajero"),
        ("La caravana de los relojes", "Una caravana transporta relojes que adelantan el tiempo de quien los lleva.", "El desierto", "Llegar antes significa envejecer antes.", "Uno de los relojes va hacia atrás"),
        ("El tesoro de la marea", "Un tesoro aparece solo cuando el mar se retira por completo.", "La playa", "Extraerlo hundirá el puerto.", "El tesoro pertenecía al puerto"),
    ),
    "distopia": (
        ("El turno de silencio", "Una ciudad impone una hora de silencio obligatorio.", "La plaza central", "Romper el silencio delata a quienes todavía piensan.", "El silencio protege un secreto mayor"),
        ("El ciudadano inexistente", "Una persona desaparece de todos los registros sin dejar rastro.", "La oficina de censo", "Restaurar su identidad pondría en riesgo a toda la familia.", "El sistema lo creó para borrar un error"),
        ("La ración de luz", "La luz se reparte por turnos y alguien vende horas robadas.", "El mercado nocturno", "Comprar luz expone a la red de contrabandistas.", "La luz robada se usa para leer un expediente"),
    ),
    "comedia": (
        ("El concejal accidental", "Un concejal decide votar en contra de una ley que no ha leído.", "El despacho municipal", "Su error es celebrado por todos menos por él.", "La ley figuraba en el acta del año pasado"),
        ("La boda imprevista", "Una boda se celebra por un error de calendario.", "El salón de fiestas", "Los novios descubren que nunca se han visto.", "El error fue causado por un perro"),
        ("El profesor sustituto", "Un profesor sustituto enseña una asignatura que no existe.", "El aula", "Los alumnos deciden inventar el programa.", "El cargo fue creado para ocultar otro"),
    ),
    "supervivencia": (
        ("La última reserva", "Un grupo sobrevive con una reserva de agua que dura tres días.", "El refugio", "Compartir el agua reduce las probabilidades de todos.", "La reserva se repone sola cada noche"),
        ("El invierno adelantado", "El invierno llega antes de la cosecha.", "La cabaña", "Mantener el fuego encendido revela la posición del refugio.", "El frío procede de una grieta bajo la casa"),
        ("La señal de auxilio", "Una señal de auxilio atrae a rescatistas y a algo más.", "La torre de comunicaciones", "Apagar la señal condena a los heridos.", "La señal lleva años emitiendo sola"),
    ),
    "horror-cosmico": (
        ("La estrella que observa", "Una estrella cambia de posición cada vez que alguien la mira.", "El observatorio", "Mirarla demasiado tiempo altera los recuerdos.", "La estrella es un ojo cerrado"),
        ("El mensaje de fondo", "Un mensaje se repite en el ruido de fondo del universo.", "La antena", "Traducirlo permitiría escuchar lo que viene.", "El mensaje describe al lector"),
        ("El horizonte invertido", "El horizonte se curva hacia dentro y muestra un cielo desconocido.", "La costa", "Cruzarlo no tiene regreso.", "El otro lado ya conocía el nombre del mundo"),
    ),
    "realidades-alternativas": (
        ("La versión correcta", "Existe una versión de la ciudad donde todo salió bien.", "La frontera entre calles", "Cruzar a la otra versión deja una copia de sí mismo atrás.", "La copia tiene mejores recuerdos"),
        ("El cajón de los errores", "Cada decisión no tomada guarda una realidad en un cajón.", "El sótano", "Abrir un cajón cierra la realidad actual.", "El cajón elegido estaba vacío"),
        ("La línea paralela", "Dos trenes circulan por la misma vía en direcciones distintas.", "La estación", "Detener uno salva al otro.", "Ambos trenes llevan el mismo pasajero"),
    ),
    "surrealista": (
        ("El reloj de agua", "Un reloj mide el tiempo en cubos de agua.", "La plaza", "Vaciar el reloj detiene una mañana entera.", "El agua contiene los días que faltan"),
        ("La entrevista consigo mismo", "Una persona entrevista a su propio reflejo antes de aceptar un empleo.", "El espejo", "La respuesta depende de quién firma el contrato.", "El reflejo ya había firmado"),
        ("La ciudad de arriba", "Una ciudad camina sobre el techo de otra ciudad.", "La azotea", "Bajar significa olvidar el idioma de arriba.", "La ciudad de abajo sueña con la de arriba"),
    ),
}

GENERIC_CONCEPTS = (
    ("La pregunta correcta", "Una pregunta cambia el significado de todo lo que se creía sabido.", "El lugar de origen", "Responderla obliga a contradecir una certeza.", "La respuesta estaba en la pregunta"),
    ("El detalle invisible", "Un detalle insignificante sostiene toda la realidad.", "La escena inicial", "Quien lo descubre debe decidir si lo conserva.", "El detalle desapareció antes de ser visto"),
    ("La decisión pendiente", "Una decisión aplazada reaparece con consecuencias nuevas.", "El punto de encuentro", "Elegir ahora puede destruir lo que se quiso proteger.", "La decisión ya fue tomada por alguien más"),
)

VARIATION_TWISTS = {
    "darker": "La resolución exige un sacrificio que nadie está dispuesto a aceptar.",
    "absurd": "La explicación es literalmente imposible, pero funciona dentro de este mundo.",
    "twist": "La causa del conflicto era la persona que intentaba evitarlo.",
    "mix": "Dos géneros distintos explican la misma escena al mismo tiempo.",
    "genre": "La escena mantiene las reglas del género elegido hasta el final.",
}

APOCALYPSE_STAGES = (
    ("alerta", "Las primeras señales se ignoran porque todavía parecen exageradas"),
    ("evacuacion", "La evacuación comienza cuando las rutas ya se han vuelto inciertas"),
    ("colapso", "Las instituciones caen una tras otra y las reglas antiguas dejan de servir"),
    ("ruinas", "Lo que quedó en pie se convierte en refugio y en prueba de lo perdido"),
    ("secuelas", "La supervivencia depende de aceptar un mundo que no volverá a ser el mismo"),
)

NARRATIVE_PROFILES = {
    "historico": {
        "objects": ("un rollo de pergamino", "una moneda desgastada", "un sello de barro", "una lámpara de aceite", "un pergamino con el borde quemado", "una red de pesca enrollada"),
        "textures": ("el polvo del camino se levanta", "el aire caliente del mercado apenas se mueve", "la sombra de los pórticos se acorta", "el rumor de una lengua antigua cruza el mercado", "el aire espeso del mercado al mediodía se vuelve más denso", "el polvo se adhiere a tus sandalias"),
        "voices": ("No deberías saber eso", "La fecha no coincide", "Si lo dices en voz alta, ya no podremos negarlo", "No mires esa fecha", "Aquí nadie escribe dos veces el mismo nombre"),
        "discoveries": ("una fecha escrita al dorso", "un nombre repetido en dos listas distintas", "una huella bajo el polvo", "un sello que pertenecía a otro hombre", "un nombre bajo una capa de cera", "una marca que coincide con el sello del guardia"),
    },
    "dinosaurios": {
        "objects": ("un hueso todavía tibio", "una huella de tres garras", "una hoja fósil arrancada", "un diente incrustado en la corteza", "una pluma fósil", "un trozo de cáscara con vetas"),
        "textures": ("el vapor entre los helechos sube", "el suelo húmedo del valle cede bajo tus pasos", "el eco de un paso gigante se apaga", "la luz filtrada por copas enormes cambia de lugar", "el aire caliente sobre el barro se mueve", "el rumor de ramas rotas se acerca"),
        "voices": ("Esa huella es reciente", "No hay animal así en los libros", "Si viene hacia aquí, no corras", "No hagas ruido", "Ese sendero no estaba ayer"),
        "discoveries": ("un fósil rodeado de marcas nuevas", "un nido con cáscaras recientes", "un sendero que termina en una ciudad oculta", "un colmillo más largo que tu mano", "un huevo abierto con la cáscara todavía húmeda", "una huella que se cruza con la tuya"),
    },
    "suenos": {
        "objects": ("un cuaderno de tapas azules", "una cinta de papel", "un reloj detenido", "una carta sin remitente", "un diario con la última página en blanco", "una aguja clavada en un mapa"),
        "textures": ("la luz azul de la madrugada se filtra", "el silencio de una habitación ajena se rompe", "el zumbido de una lámpara se vuelve más nítido", "la niebla pegada a los cristales empieza a moverse", "el frío de la madrugada sube por tus dedos", "la luz parpadea sin motivo"),
        "voices": ("Soñé lo mismo hace una hora", "Esa fecha todavía no llega", "No lo escribas: puede que ya esté escrito", "Yo también lo vi", "No digas la fecha en voz alta"),
        "discoveries": ("la misma frase en dos cuadernos distintos", "una dirección que ninguno conocía", "una fecha imposible repetida dos veces", "un nombre borrado apenas", "la misma mancha de tinta en dos páginas", "una frase que termina antes de que la leas"),
    },
    "senal": {
        "objects": ("una antena inclinada", "una pantalla con líneas erraticas", "una cápsula sellada", "un cuaderno de traducciones", "una bobina de cable pelado", "una lámina con caracteres desconocidos"),
        "textures": ("el zumbido de la estación llena el aire", "la luz roja de los instrumentos parpadea", "el frío metálico de la sala sube por tus manos", "un cielo sin ruido queda fuera", "el aire estático precede a cada transmisión", "la luz de la consola cambia de ritmo"),
        "voices": ("No es un saludo", "La respuesta viene de dentro", "Todo lo que traducimos cambia el mensaje", "Repite la frase exacta", "No traduzcas eso todavía"),
        "discoveries": ("una frase repetida bajo el ruido", "un mapa con dos nombres para el mismo lugar", "una coordenada que ya estaba en el archivo", "una grabación anterior al primer contacto", "un patrón que se repite cada nueve segundos", "una firma que ya estaba en el primer archivo"),
    },
    "futuro": {
        "objects": ("una pasarela luminosa", "un vehículo silencioso", "una torre de cristal", "una pulsera con datos antiguos", "una tarjeta sin nombre", "un trozo de cristal con una fecha grabada"),
        "textures": ("el zumbido de la ciudad se filtra", "la luz artificial de una avenida limpia se refleja", "el aire filtrado de la estación se renueva", "las sombras perfectas de los edificios se alinean", "el silencio de los corredores climatizados se rompe", "la luz de las paredes cambia al mirarte"),
        "voices": ("Aquí nadie camina sin permiso", "Ese nombre no existe en el sistema", "La ciudad recuerda por ti", "Tu acceso está en revisión", "La ciudad no confirma ese nombre"),
        "discoveries": ("una puerta sin permiso visible", "un nombre borrado de la red", "una calle que no aparece en el mapa", "un mensaje escrito con letras antiguas", "una puerta que responde a tu voz", "una lista con dos versiones de tu llegada"),
    },
    "apocalipsis": {
        "objects": ("una cantina medio llena", "un mapa roto", "una radio con pilas prestadas", "una llave oxidada", "un bidón abierto", "una foto con el borde chamuscado"),
        "textures": ("el humo bajo el cielo se espesa", "el frío de una casa vacía se instala", "el crujido de una vía abandonada se repite", "el olor a tierra mojada y ceniza se queda", "el viento entra por las ventanas rotas", "la ceniza se posa sobre todo"),
        "voices": ("Nos queda menos de un día", "No abras esa puerta", "Si vuelves, vuelve con agua", "No compartas la ruta", "Hay suficiente para dos, no para tres"),
        "discoveries": ("una ruta que aún no está cortada", "huellas recientes junto a la vía", "una reserva escondida bajo el suelo", "una señal que alguien dejó encendida", "una marca nueva en la puerta", "una botella escondida bajo una tabla"),
    },
    "fantasia": {
        "objects": ("una llave de hueso", "un librito encuadernado en cuero", "una piedra que cambia de color", "una copa sin fondo", "un hilo rojo atado a la muñeca", "un frasco con polvo dorado"),
        "textures": ("la luz imposible de una galería parpadea", "el aire cargado de incienso se vuelve denso", "el bosque murmura cerca", "la alfombra parece respirar", "la bruma se abre sin ruido", "el aire huele a lluvia antigua"),
        "voices": ("Ese nombre no debe pronunciarse", "La puerta solo abre para quien duda", "Lo que buscas ya te encontró", "No pronuncies mi nombre aquí", "La puerta recuerda tu voz"),
        "discoveries": ("un nombre borrado de un libro", "una runa repetida en la madera", "una sombra que se mueve sola", "una moneda acuñada mañana", "una inicial que cambia al parpadear", "un camino que no estaba antes"),
    },
    "aventura": {
        "objects": ("un mapa doblado", "una brújula rara", "una carta con manchas", "un objeto que no debería estar allí", "una navaja con la empuñadura gastada", "un sobre sellado con cera roja"),
        "textures": ("el viento entra por la abertura", "la luz oblicua de la tarde se desplaza", "el suelo cruje bajo tus pasos", "un ruido detrás de la pared vuelve a empezar", "el polvo se asienta en el silencio", "la tarde se inclina sobre el umbral"),
        "voices": ("No era eso lo que esperaba", "Mira la fecha", "Si avanzamos, ya no habrá vuelta atrás", "No sigas derecho", "Esa fecha no debería estar ahí"),
        "discoveries": ("una marca que coincide con el mapa", "un objeto imposible en ese lugar", "un nombre escrito en el margen", "una salida que nadie había visto", "una marca bajo la alfombra", "una dirección escrita a lápiz"),
    },
}

PROFILE_KEYWORDS = (
    ("historico", ("judea", "jesus", "jesús", "romano", "imperio", "año 30", "siglo", "d. c.", "dc")),
    ("dinosaurios", ("dinosaurio", "dinosaur", "extincion", "extinción", "fosil", "fósil")),
    ("suenos", ("sueño", "sueños", "soñar", "dormido")),
    ("senal", ("señal", "extraterrestre", "alien", "marte", "inteligente", "contacto")),
    ("futuro", ("futur", "civilizacion futurista", "civilización futurista", "ciudad futurista", "tecnologia", "tecnología")),
    ("apocalipsis", ("apocalip", "supervivencia", "ultimo amanecer", "último amanecer")),
    ("fantasia", ("fantasia", "fantasía", "magia", "hechizo", "dragon", "dragón", "reino")),
)

OPENING_IMAGES = (
    "Imagina que despiertas en {place}. {scene}",
    "Todo comenzó cuando entraste en {place}. {scene}",
    "En {place}, lo inesperado ocurrió sin anuncio. {scene}",
    "Al principio creíste que era una ilusión. {scene}",
)

ARRIVAL_TEMPLATES = (
    "Llegas a {place} mientras {texture}. {other} ya está allí, con {obj} entre las manos.",
    "En {place}, oyes primero un paso y después una voz. Mientras {texture}, {other} sostiene {obj}.",
    "No elegiste {place}. El camino termina allí; mientras {texture}, {other} espera junto a {obj}.",
)

DETAIL_TEMPLATES = (
    "Acercas {obj} a la luz. Hay {discovery}, y ese detalle cambia el sentido de lo que acaba de ocurrir.",
    "{other} señala {obj} sin decir nada. Mientras {texture}, ves {discovery} y entiendes que alguien llegó antes.",
    "No es {obj} lo que te inquieta, sino {discovery}. Incluso mientras {texture}, el silencio parece deliberado.",
)

DIALOGUE_TEMPLATES = (
    "«{voice}», dice {other}. Respondes con otra pregunta, porque la primera respuesta habría revelado demasiado.",
    "«{voice}», murmura {other}. Mira {obj} y tarda en contestar; mientras {texture}, cada pausa pesa.",
    "{other} pregunta: «{voice}». No quieres mentir, pero tampoco das la explicación completa.",
)

DISCOVERY_TEMPLATES = (
    "Entonces ves {discovery}. Está junto a {obj}, donde nadie habría pensado buscar.",
    "La pista está en {discovery}. {other} la sigue con la mirada y comprende antes que tú lo que significa.",
    "Apartas {obj} y descubres {discovery}. No es casualidad: alguien dejó esa marca para ser vista.",
)

REACTION_TEMPLATES = (
    "{other} retrocede un paso. Ha reconocido {discovery}, pero no quiere admitirlo delante de ti.",
    "Sientes que la escena cambia de dirección. Todo sigue igual a tu alrededor, aunque nada volverá a ser igual.",
    "Durante un instante nadie habla. Después {other} aprieta {obj} y te mira como quien decide confiar.",
)

CHOICE_TEMPLATES = (
    "Podías marcharte o quedarte. Te quedas, porque {discovery} todavía no tiene explicación y alguien debe comprobarlo.",
    "Hay una salida, pero deja la pregunta pendiente. Eliges el camino más difícil: quedarte junto a {other}.",
    "{other} espera una orden. No la das; tomas {obj} y señalas {discovery} como única respuesta posible.",
)

AFTERMATH_TEMPLATES = (
    "Cuando el ruido se apaga, {place} parece el mismo, pero ya sabes dónde mirar.",
    "La decisión deja una huella pequeña y visible: {discovery}. {other} la ve y no dice nada.",
    "Guardas {obj} antes de continuar. Es una prueba, una advertencia y una razón para no volver atrás.",
)

BRIDGE_TEMPLATES = (
    "Todavía piensas en lo ocurrido al volver a {place}: {bridge} No es un recuerdo cómodo, porque explica por qué {other} mira {obj} con tanta cautela.",
    "Antes de dar un paso, vuelves a {place} con aquello en la mente: {bridge} La escena ya no se parece a la que encontraste al llegar.",
    "El regreso a {place} no borra lo que acaba de pasar: {bridge} {other} también lo ha notado y observa {obj} como si esperara una señal.",
)

DIRECTION_TEMPLATES = (
    "Haces algo que nadie había previsto: {direction} {other} se detiene a medio gesto; incluso mientras {texture}, el aire cambia.",
    "Decides actuar antes de que alguien te lo pida: {direction} {other} baja la mirada hacia {obj} y vuelve a mirarte.",
    "Tu respuesta rompe el silencio: {direction} {other} no sabe si debe seguirte o advertirte.",
)

CHAPTER_TITLES = {
    "historico": ("La fecha en el camino", "Lo que dijo {other}", "El sello y la fecha", "Una marca bajo el polvo"),
    "dinosaurios": ("La huella reciente", "El valle que no calla", "Lo que dejó el fósil", "La sombra entre los helechos"),
    "suenos": ("La fecha compartida", "Dos versiones del mismo sueño", "La frase repetida", "El cuaderno ajeno"),
    "senal": ("La pregunta marciana", "Bajo la luz roja", "Lo que oculta la antena", "Una frase bajo el ruido"),
    "futuro": ("El nombre que falta", "La ciudad que recuerda", "La puerta sin permiso", "Dos versiones de tu llegada"),
    "apocalipsis": ("La ruta que queda", "Cuando el humo baja", "Lo que guarda la radio", "El refugio improbable"),
    "fantasia": ("La puerta que duda", "El nombre borrado", "La moneda del mañana", "Lo que susurra la galería"),
    "aventura": ("La marca del mapa", "El sobre sellado", "La salida oculta", "Lo que no debería estar allí"),
}


def _setting(key: str, default: str = "") -> str:
    try:
        from app.db import get_setting
        return get_setting("whatif", key, default)
    except Exception:
        return default


def _int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        return max(minimum, min(maximum, int(value)))
    except (TypeError, ValueError):
        return default


def _flag(value: Any, default: int = 0) -> int:
    if value is None or value == "":
        return default
    if isinstance(value, str):
        return 1 if value.strip().lower() in {"1", "true", "on", "si", "sí", "yes"} else 0
    return 1 if bool(value) else 0


def _loads(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            data = json.loads(value)
            if isinstance(data, dict):
                return data
        except (ValueError, TypeError):
            return {}
    return {}


def _normalize_code(value: Any, items: tuple[dict, ...], default: str) -> str:
    text = options.clean_text(value, 80).lower().strip()
    text = text.replace("_", "-")
    for item in items:
        code = str(item["code"])
        if text == code.lower() or text == code.lower().replace("-", " "):
            return code
        if text.replace("-", " ") == code.lower().replace("-", " "):
            return code
    return default


def normalize_narrative_config(data: Any = None) -> dict:
    source = _loads(data)
    modes_source = source.get("modes")
    if isinstance(modes_source, str):
        modes_source = [part for part in re.split(r"[,\s]+", modes_source) if part]
    allowed_modes = list(options.codes(options.MODES_LIST))
    explicit_modes = [
        _normalize_code(item, options.MODES_LIST, "") for item in (modes_source or [])
        if _normalize_code(item, options.MODES_LIST, "")
    ]
    ideas_enabled = _setting("ideas_enabled", "1") == "1"
    apocalypse_enabled = _setting("apocalypse_enabled", "1") == "1"
    crazy_enabled = _setting("crazy_enabled", "1") == "1"
    unlimited_enabled = _setting("unlimited_enabled", "1") == "1"
    apocalypse = _flag(source.get("apocalypse"), 1 if "apocalypse" in explicit_modes else 0)
    crazy = _flag(source.get("crazy"), 1 if "crazy" in explicit_modes else 0)
    unlimited = _flag(source.get("unlimited"), 1 if "unlimited" in explicit_modes else 0)
    if not apocalypse_enabled:
        apocalypse = 0
    if not crazy_enabled:
        crazy = 0
    if not unlimited_enabled:
        unlimited = 0
    if apocalypse and "apocalypse" not in explicit_modes:
        explicit_modes.append("apocalypse")
    if crazy and "crazy" not in explicit_modes:
        explicit_modes.append("crazy")
    if unlimited and "unlimited" not in explicit_modes:
        explicit_modes.append("unlimited")
    if not ideas_enabled:
        explicit_modes = [mode for mode in explicit_modes if mode != "idea"]
    modes = [mode for mode in allowed_modes if mode in explicit_modes]
    default_pov = _setting("default_point_of_view", "tercera persona")
    default_ending = _setting("default_ending", "abierto")
    apocalypse_level = source.get("apocalypse_level")
    if str(apocalypse_level).isdigit():
        level_codes = list(options.codes(options.APOCALYPSE_LEVELS))
        index = int(apocalypse_level)
        if 0 <= index < len(level_codes):
            apocalypse_level = level_codes[index]
    return {
        "apocalypse": apocalypse,
        "apocalypse_level": _normalize_code(
            apocalypse_level, options.APOCALYPSE_LEVELS,
            _setting("apocalypse_level", "gradual") or "gradual",
        ),
        "crazy": crazy,
        "crazy_level": _int(source.get("crazy_level"), _int(_setting("crazy_level", "1"), 1, 1, 4), 1, 4),
        "unlimited": unlimited,
        "chapter_length": _normalize_code(source.get("chapter_length"), options.CHAPTER_LENGTHS, "normal"),
        "randomness": _int(source.get("randomness"), _int(_setting("randomness_level", "2"), 2, 1, 4), 1, 4),
        "surprise_frequency": _int(
            source.get("surprise_frequency"), _int(_setting("surprise_frequency", "25"), 25, 0, 100), 0, 100,
        ),
        "point_of_view": _normalize_code(source.get("point_of_view"), options.PERSPECTIVES, default_pov),
        "initial_characters": _int(
            source.get("initial_characters"), _int(_setting("initial_characters", "3"), 3, 1, 8), 1, 8,
        ),
        "ending": _normalize_code(source.get("ending"), options.ENDINGS, default_ending or "abierto"),
        "modes": modes,
    }


BLUEPRINT_STAGES = ("premise", "evolution", "world", "situation", "narrative")
BLUEPRINT_SECTIONS = (
    "world", "history", "chronology", "characters", "places", "civilizations",
    "mysteries", "events", "timelines", "culture", "technology", "economy",
    "religions", "species", "flora", "fauna", "customs", "conflicts",
)


def _blueprint_card(kind: str, subject: str, content: str, metadata: dict | None = None) -> dict:
    return {
        "kind": options.clean_text(kind, 40) or "event",
        "subject": options.clean_text(subject, 160),
        "content": options.clean_text(content, 2000),
        "metadata": dict(metadata or {}),
    }


def _blueprint_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _blueprint_named(items: list, *fields: str, fallback: str) -> str:
    for item in items:
        if not isinstance(item, dict):
            continue
        for field in fields:
            name = options.clean_text(item.get(field), 120)
            if name:
                return name
    return fallback


def build_blueprint(payload: Any = None) -> dict:
    data = payload if isinstance(payload, dict) else {}
    premise = options.clean_text(data.get("premise") or data.get("idea"), 900) or "la premisa planteada"
    title = options.clean_text(data.get("title"), 140) or "La realidad sin nombre"
    genre = options.normalize_choice(options.clean_text(data.get("genre"), 80), options.GENRES, "personalizado")
    style = options.normalize_choice(options.clean_text(data.get("style"), 80), options.STYLES, "cinematografico")
    config = normalize_narrative_config(data.get("narrative_config") or data)
    seed_source = json.dumps({
        "title": title, "premise": premise, "genre": genre, "style": style,
        "config": config, "characters": _clean_list(data.get("characters")),
        "locations": _clean_list(data.get("locations")),
    }, ensure_ascii=False, sort_keys=True)
    rng = random.Random(hashlib.sha256(seed_source.encode("utf-8")).hexdigest())
    characters = [item for item in _blueprint_list(data.get("characters")) if isinstance(item, dict)]
    locations = [item for item in _blueprint_list(data.get("locations")) if isinstance(item, dict)]
    events = [item for item in _blueprint_list(data.get("events")) if isinstance(item, dict)]
    rules = _clean_list(data.get("rules"))
    character = _blueprint_named(characters, "name", "title", fallback="quien observa")
    other = _blueprint_named(characters[1:], "name", "title", fallback=character)
    place = _blueprint_named(locations, "name", "title", fallback="el lugar donde la premisa se volvió visible")
    second_place = _blueprint_named(locations[1:], "name", "title", fallback=place)
    event_titles = [options.clean_text(item.get("title"), 120) for item in events]
    event_titles = [item for item in event_titles if item]
    rule = rules[0] if rules else "la premisa elegida sigue siendo cierta dentro de este mundo"
    scene = options.clean_text(data.get("first_scene"), 500) or (
        f"{character} comprueba en {place} que {premise} ya no puede tratarse como una hipótesis."
    )
    genre_label = options.label_for(options.GENRES, genre).lower()
    style_label = options.label_for(options.STYLES, style).lower()
    apocalypse_stage = APOCALYPSE_STAGES[min(
        len(APOCALYPSE_STAGES) - 1,
        {"gradual": 3, "acelerado": 2, "inevitable": 2, "caos-absoluto": 1}[config["apocalypse_level"]],
    )]

    premise_cards = [
        _blueprint_card("hypothesis", title,
                        f"Hipótesis: {premise}. Si se cumple, {place} deja de operar como antes y "
                        f"{character} debe decidir desde una regla nueva, no desde la costumbre.",
                        {"role": "hypothesis"}),
        _blueprint_card("change", "cambio fundamental",
                        f"Causa: {premise}. Consecuencia: la vida en {place} se reorganiza alrededor de "
                        f"{rule}; lo que antes era opcional ahora determina qué decisiones son posibles.",
                        {"role": "change"}),
        _blueprint_card("change", "cambio derivado",
                        f"Causa: el primer cambio altera {second_place}. Consecuencia: {other} interpreta "
                        "esa alteración como una ventaja y la comunidad empieza a medir el valor de cada acto "
                        "por sus efectos posteriores.", {"role": "change"}),
        _blueprint_card("condition", "condición de partida",
                        f"Condición: {rule}. Mientras siga vigente, ninguna escena puede resolverse sin "
                        "aceptar que la premisa tiene consecuencias materiales en el presente.",
                        {"role": "condition"}),
        _blueprint_card("condition", "condición de continuidad",
                        f"Condición: los hechos confirmados se conservan. Por eso {character} no puede "
                        f"negar lo ocurrido en {place} aunque la explicación haya cambiado.",
                        {"role": "condition"}),
        _blueprint_card("consequence", "consecuencia inmediata",
                        f"Consecuencia: {premise} obliga a elegir entre proteger {place} y conservar "
                        f"{rule}; cada opción deja una huella verificable en la historia.",
                        {"role": "consequence"}),
        _blueprint_card("consequence", "consecuencia acumulada",
                        f"Consecuencia: lo que empezó como una anomalía en {second_place} se convierte en "
                        "una costumbre reflectante de la premisa y condiciona las siguientes decisiones.",
                        {"role": "consequence"}),
    ]
    if config["apocalypse"]:
        premise_cards.append(_blueprint_card(
            "destruction", "irreversibilidad",
            f"Consecuencia irreversible: la escalada {apocalypse_stage[0]} —{apocalypse_stage[1]}— "
            "elimina la posibilidad de volver al estado anterior; las fichas de pérdida permanecen.",
            {"role": "apocalypse"},
        ))
    if config["crazy"]:
        premise_cards.append(_blueprint_card(
            "rule_change", "lógica alterada",
            f"Causa: el nivel loco {config['crazy_level']} hace aceptable una explicación imposible. "
            "Consecuencia: las reglas se negocian en voz alta, pero solo se vuelven hechos tras una intervención.",
            {"role": "crazy"},
        ))
    if config["unlimited"]:
        premise_cards.append(_blueprint_card(
            "rule_change", "sin límites",
            "Causa: el modo Sin límites elimina la censura creativa preventiva. Consecuencia: la hipótesis "
            "puede cruzar géneros y escalas sin perder causalidad ni contradecir los hechos confirmados.",
            {"role": "unlimited"},
        ))

    evolution_causes = (
        f"{premise} dejó de ser una idea abstracta en {place}",
        f"{rule} entró en conflicto con lo que {character} había visto en {second_place}",
        f"{other} actuó sobre la primera consecuencia antes de entender su alcance",
        "una decisión aparentemente menor reveló que la versión aceptada estaba incompleta",
    )
    evolution_effects = (
        f"{character} conservó una prueba que obligaba a revisar la escena inicial",
        f"{place} cambió de función y pasó a ser un punto de decisión",
        f"{other} asumió un riesgo que ninguna regla anterior contemplaba",
        f"la comunidad aceptó que {premise} formaba parte de su memoria cotidiana",
    )
    evolution_cards = []
    for index in range(4):
        subject = event_titles[index] if index < len(event_titles) else (
            f"Etapa {index + 1}: {rng.choice(('la grieta', 'la prueba', 'la decisión', 'la secuela'))}"
        )
        content = f"Causa: {evolution_causes[index]}. Consecuencia: {evolution_effects[index]}."
        if config["apocalypse"]:
            content += f" La escalada {apocalypse_stage[0]} hace que esa consecuencia sea irreversible."
        if config["crazy"] and index in (1, 3):
            content += " Una regla imposible funciona como explicación provisional sin borrar el daño causado."
        if config["unlimited"]:
            content += " El modo Sin límites permite ampliar la escala del evento sin romper la cadena causa-efecto."
        evolution_cards.append(_blueprint_card("event", subject, content, {"role": "evolution", "order": index + 1}))

    world_rows = (
        ("geografia", "world", "Geografía de " + place,
         "Causa: {premise} redefine los límites de {place}. Consecuencia: las rutas y los refugios se organizan "
         "según esa nueva geografía y no según el mapa anterior."),
        ("civilizaciones", "civilizations", "Civilizaciones de " + place,
         "Causa: la presión creada por {premise} obliga a agruparse. Consecuencia: {place} y {second_place} "
         "desarrollan formas de gobierno distintas para gestionar la misma escasez."),
        ("cultura", "culture", "Cultura de " + place,
         "Causa: {character} necesita explicar lo ocurrido. Consecuencia: los relatos cotidianos convierten "
         "{premise} en un marco compartido de interpretación."),
        ("tecnologia", "technology", "Tecnología disponible",
         "Causa: {rule} limita qué herramientas pueden usarse. Consecuencia: la tecnología de {place} avanza "
         "en las fallas de esa limitación y no de manera decorativa."),
        ("economia", "economy", "Economía de la premisa",
         "Causa: {premise} cambia el valor de lo escaso. Consecuencia: el intercambio entre {place} y "
         "{second_place} se reorganiza alrededor de quien puede garantizar la continuidad."),
        ("religiones", "religions", "Creencias y religiones",
         "Causa: el mundo necesita una respuesta para {premise}. Consecuencia: las creencias de {place} "
         "se dividen entre quienes la consideran castigo y quienes la ven como oportunidad."),
        ("especies", "species", "Especies presentes",
         "Causa: {premise} altera el equilibrio de {second_place}. Consecuencia: las especies que logran "
         "adaptarse ocupan espacios antes imposibles y modifican la cadena de dependencias."),
        ("flora", "flora", "Flora de " + place,
         "Causa: el suelo y el clima responden a {premise}. Consecuencia: la flora de {place} marca qué "
         "zonas pueden habitarse y cuáles quedan reservadas a la recuperación."),
        ("fauna", "fauna", "Fauna de " + second_place,
         "Causa: la flora cambiada transforma el hábitat. Consecuencia: la fauna se desplaza y obliga a "
         "{character} a revisar los caminos que antes parecían seguros."),
        ("costumbres", "customs", "Costumbres cotidianas",
         "Causa: {rule} se repite en cada decisión. Consecuencia: una conducta nacida como emergencia en "
         "{place} se vuelve costumbre y define cómo se recibe a quien llega de fuera."),
        ("conflictos", "conflicts", "Conflictos abiertos",
         "Causa: {other} y {character} interpretan {premise} de forma distinta. Consecuencia: el conflicto "
         "no se resuelve por fuerza, sino por quién controla la explicación aceptada en {place}."),
        ("relaciones", "characters", "Relaciones entre personajes",
         "Causa: {premise} reparte riesgos distintos entre {character} y {other}. Consecuencia: la alianza "
         "entre ellos depende de qué consecuencia decide proteger cada uno."),
    )
    values = {
        "premise": premise, "place": place, "second_place": second_place,
        "character": character, "other": other, "rule": rule,
    }
    world_cards = [
        _blueprint_card(kind, subject, template.format(**values), {"section": section})
        for kind, section, subject, template in world_rows
    ]

    situation_cards = [
        _blueprint_card("conflict", "conflicto principal",
                        f"Causa: {premise} reparte beneficios y costos de forma desigual. Consecuencia: "
                        f"{character} debe elegir entre conservar {rule} y proteger a {other}.",
                        {"role": "conflict"}),
        _blueprint_card("mystery", "misterio central",
                        f"Causa: alguien en {place} conocía las consecuencias antes de que ocurrieran. "
                        "Consecuencia: resolver el misterio puede cambiar la explicación aceptada de la premisa.",
                        {"role": "mystery"}),
        _blueprint_card("threat", "amenaza latente",
                        f"Causa: {premise} abre una brecha que todavía nadie controla. Consecuencia: si "
                        f"{other} la usa antes de que {character} lo descubra, {second_place} quedará aislado.",
                        {"role": "threat"}),
    ]
    narrative_cards = [
        _blueprint_card("protagonist", character,
                        f"Protagonista: {character} puede comprobar en {place} que {premise} es cierta y "
                        "posee motivos para sostener la decisión cuando aparezca el costo.",
                        {"role": "protagonist"}),
        _blueprint_card("trigger", "gatillo narrativo",
                        f"Gatillo: {scene}. Ese instante convierte la hipótesis en un hecho que "
                        f"{character} ya no puede ignorar.", {"role": "trigger"}),
        _blueprint_card("scene", "escena de apertura",
                        f"Escena: {scene} La escena se abre en {place}, con un tono {style_label} "
                        f"y una lógica de {genre_label} que se mantiene hasta el final.", {"role": "scene"}),
    ]
    return {
        "premise": premise_cards,
        "evolution": evolution_cards,
        "world": world_cards,
        "situation": situation_cards,
        "narrative": narrative_cards,
    }


def chapter_plan(config: Any = None) -> dict:
    normalized = normalize_narrative_config(config)
    words_by_length = {
        item["code"]: _int(
            _setting(item["setting"], str(item["words"])), int(item["words"]),
            80 if item["code"] == "escena" else 300, 20000,
        )
        for item in options.CHAPTER_LENGTHS
    }
    max_words = _int(_setting("max_chapter_words", "6000"), 6000, 80, 20000)
    total_words = min(max_words, words_by_length.get(normalized["chapter_length"], words_by_length["escena"]))
    blocks = 1 if normalized["chapter_length"] == "escena" else _int(_setting("generation_blocks", "3"), 3, 1, 8)
    target_words = max(80 if blocks == 1 else 120, total_words // blocks)
    return {
        "chapter_length": normalized["chapter_length"],
        "blocks": blocks,
        "target_words": target_words,
        "words_per_block": target_words,
        "total_words": total_words,
        "block_words": [total_words - target_words * (blocks - 1) if index == blocks - 1 else target_words
                        for index in range(blocks)],
        "max_words": max_words,
        "modes": normalized["modes"],
    }


def _paragraph_key(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def dedupe_blocks(blocks: Any) -> list:
    result = []
    seen = set()
    for item in blocks or []:
        if isinstance(item, dict):
            value = str(item.get("block") or item.get("text") or "")
        else:
            value = str(item or "")
        key = _paragraph_key(value)
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def compose_chapter(blocks: Any) -> str:
    parts = []
    seen = set()
    for item in dedupe_blocks(blocks):
        text = str(item.get("block") or item.get("text") or "").strip() if isinstance(item, dict) else str(item).strip()
        for paragraph in re.split(r"\n\s*\n", text):
            cleaned = paragraph.strip()
            key = _paragraph_key(cleaned)
            if not cleaned or key in seen:
                continue
            seen.add(key)
            parts.append(cleaned)
    return "\n\n".join(parts)


def forced_event(config: Any, chapter_number: int) -> dict:
    normalized = normalize_narrative_config(config)
    number = max(1, _int(chapter_number, 1, 1, 10000))
    if normalized["apocalypse"]:
        speed = {"gradual": 3, "acelerado": 2, "inevitable": 2, "caos-absoluto": 1}[normalized["apocalypse_level"]]
        stage_index = min(len(APOCALYPSE_STAGES) - 1, (number - 1) // speed)
        stage, description = APOCALYPSE_STAGES[stage_index]
        card_kind = "death" if stage_index >= 3 and number % 2 == 0 else "destruction"
        subject = "el mundo conocido" if stage_index < 3 else "lo que aún quedaba en pie"
        return {
            "mode": "apocalypse",
            "stage": stage,
            "title": f"Escalada {stage}",
            "description": description,
            "memory_card": {
                "kind": card_kind,
                "subject": subject,
                "content": f"Etapa {stage}: {description}. El daño ya no puede considerarse provisional.",
                "importance": 9 if card_kind == "death" else 8,
                "metadata": {"stage": stage, "chapter": number, "level": normalized["apocalypse_level"]},
            },
        }
    if normalized["crazy"] and number % 2 == 0:
        level = normalized["crazy_level"]
        return {
            "mode": "crazy",
            "stage": f"nivel-{level}",
            "title": "Ruptura lógica",
            "description": "Una regla cotidiana se invierte y la comunidad la acepta como explicación suficiente.",
            "memory_card": {
                "kind": "rule_change",
                "subject": "la regla invertida",
                "content": "Se aceptó una explicación imposible porque resolvía el problema inmediato.",
                "importance": 7,
                "metadata": {"crazy_level": level, "chapter": number},
            },
        }
    return {}


def _rng(payload: dict, suffix: str = "") -> Any:
    seed = options.clean_text(payload.get("seed") or payload.get("idempotency_key") or "", 160)
    if seed:
        return random.Random(hashlib.sha256(f"{seed}:{suffix}".encode("utf-8")).hexdigest())
    return random.SystemRandom()


def _clean_list(value: Any) -> list[str]:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith(("[", "{")):
            try:
                parsed = json.loads(stripped)
            except (ValueError, TypeError):
                parsed = None
            if isinstance(parsed, (list, tuple, dict)):
                return _clean_list(parsed)
        return [part.strip() for part in re.split(r"[,\n;]+", value) if part.strip()]
    if isinstance(value, dict):
        return _clean_list(list(value.values()))
    if isinstance(value, (list, tuple)):
        return [options.clean_text(item, 160) for item in value if options.clean_text(item, 160)]
    return []


def _idea_pool(genre: str, variation: str, modes: list[str], rng: Any) -> dict:
    pool = list(CONCEPTS.get(genre, GENERIC_CONCEPTS))
    if variation == "mix":
        other = rng.choice(list(CONCEPTS.values()))
        pool = pool + list(other)
    if "apocalypse" in modes:
        pool = pool + [
            ("El último amanecer", "La humanidad descubre que el amanecer siguiente será el último.", "La terraza", "Prepararse para el final exige abandonar a alguien.", "El sol seguía allí, pero ya no iluminaba"),
        ]
    if "crazy" in modes:
        pool = pool + [
            ("El día de las palabras al revés", "Todas las palabras significan lo contrario durante veinticuatro horas.", "La cocina", "Una advertencia se convierte en una invitación.", "La frase era correcta antes de invertirse"),
        ]
    return rng.choice(pool)


def local_ideas(payload: Any = None) -> dict:
    data = payload if isinstance(payload, dict) else {}
    count = _int(data.get("count"), 5, 1, 12)
    seed = options.clean_text(data.get("seed") or data.get("idempotency_key") or "", 160)
    rng = _rng(data, "ideas")
    variation = _normalize_code(data.get("variation"), options.IDEA_VARIATIONS, "genre")
    available = options.available_genres(data.get("available_genres"))
    requested = _normalize_code(data.get("genre"), options.GENRES, "")
    selectable = [code for code in available if code != "personalizado"] or [
        code for code in options.codes(options.GENRES) if code != "personalizado"
    ]
    genre_index = rng.randrange(len(selectable)) if selectable else 0
    fixed_genre = requested if requested in selectable else ""
    config = normalize_narrative_config(data.get("narrative_config") or data.get("config"))
    modes = list(config["modes"])
    for mode in _clean_list(data.get("modes")):
        normalized = _normalize_code(mode, options.MODES_LIST, "")
        if normalized and normalized not in modes:
            modes.append(normalized)
    if variation == "absurd" and "crazy" not in modes and _setting("crazy_enabled", "1") == "1":
        modes.append("crazy")
    exclude = {text.casefold() for text in _clean_list(data.get("exclude"))}
    ideas = []
    attempts = 0
    while len(ideas) < count and attempts < count * 12:
        attempts += 1
        genre = fixed_genre or (selectable[(genre_index + len(ideas)) % len(selectable)] if selectable else "personalizado")
        title, premise, context, conflict, unexpected = _idea_pool(genre, variation, modes, rng)
        if title.casefold() in exclude:
            continue
        suffix = "" if variation == "genre" else f" · {options.label_for(options.IDEA_VARIATIONS, variation)}"
        idea = {
            "title": title + suffix,
            "premise": premise,
            "genre": options.label_for(options.GENRES, genre),
            "context": context,
            "conflict": conflict,
            "unexpected_element": unexpected + " " + VARIATION_TWISTS[variation],
            "direction": f"Explora las consecuencias desde {context.lower()} sin resolver el conflicto demasiado pronto.",
            "tags": [genre, variation] + modes,
            "image_suggestion": f"Ilustración narrativa de {title.lower()}, estilo {options.label_for(options.STYLES, options.normalize_choice(str(data.get('style') or ''), options.STYLES, 'cinematografico')).lower()}",
        }
        ideas.append(idea)
        exclude.add(idea["title"].casefold())
    return {"ideas": ideas, "count": len(ideas), "variation": variation}


def _context_text(context: dict, key: str, limit: int, fallback: str) -> str:
    value = options.clean_text(context.get(key), limit)
    return value or fallback


def _lower_first(text: str) -> str:
    text = str(text or "").strip()
    return text[:1].lower() + text[1:] if text else text


def _ended(text: str) -> str:
    text = str(text or "").strip()
    if text and text[-1] not in ".!?…":
        return text + "."
    return text


def _public(value: Any, limit: int = 900) -> str:
    return options.clean_narrative(value, limit).strip()


def _unique_choice(rng: Any, pool: tuple[str, ...], used: set[str]) -> str:
    available = [item for item in pool if item not in used]
    choice = rng.choice(available or list(pool))
    used.add(choice)
    return choice


def _profile_key(context: dict) -> str:
    premise = _public(context.get("premise"), 600).lower()
    reality = context.get("reality") if isinstance(context.get("reality"), dict) else {}
    genre = str(reality.get("genre") or "").lower()
    modes = " ".join(str(item).lower() for item in _as_list_safe(context.get("modes")))
    haystack = " ".join((premise, genre, modes))
    for key, keywords in PROFILE_KEYWORDS:
        if any(word in haystack for word in keywords):
            return key
    if "ciencia" in haystack or "espacio" in haystack or "orbita" in haystack:
        return "senal"
    if "fant" in haystack or "magia" in haystack:
        return "fantasia"
    return "aventura"


def _as_list_safe(value: Any) -> list:
    return list(value) if isinstance(value, (list, tuple)) else []


def _named(context: dict, key: str, fallback: str, limit: int = 3) -> list[str]:
    rows = [row for row in _as_list_safe(context.get(key)) if isinstance(row, dict)]
    names = []
    for row in rows:
        name = _public(row.get("name") or row.get("title"), 100)
        if name and name not in names:
            names.append(name)
        if len(names) >= limit:
            break
    return names or [fallback]


def _profile_facts(context: dict, profile: dict, actor: str, other: str, place: str) -> list[str]:
    facts: list[str] = []
    for row in _as_list_safe(context.get("characters"))[:4]:
        if not isinstance(row, dict):
            continue
        name = _public(row.get("name"), 80)
        if not name:
            continue
        detail = _public(row.get("identity") or row.get("personality") or row.get("motivations"), 140)
        if detail and name not in " ".join(facts):
            facts.append(f"{name} es {_lower_first(detail)}.")
        if len(facts) >= 2:
            break
    for row in _as_list_safe(context.get("locations"))[:3]:
        if not isinstance(row, dict):
            continue
        name = _public(row.get("name"), 80)
        detail = _public(row.get("description") or row.get("kind"), 140)
        if name and detail:
            facts.append(f"{name}: {_lower_first(detail)}")
        if len(facts) >= 3:
            break
    for rule in _as_list_safe(context.get("rules"))[:2]:
        clean = _public(rule, 160)
        if clean and clean not in facts:
            facts.append(clean[0].upper() + clean[1:])
        if len(facts) >= 4:
            break
    for row in _as_list_safe(context.get("events"))[:2]:
        if not isinstance(row, dict):
            continue
        detail = _public(row.get("description") or row.get("title"), 150)
        if detail:
            facts.append(detail[0].upper() + detail[1:])
        if len(facts) >= 5:
            break
    if len(facts) < 2:
        facts.append(f"{actor} y {other} están en {place}, frente a {profile['objects'][0]}.")
        facts.append(f"Lo que ocurra aquí dejará una huella en {profile['discoveries'][0]}.")
    return facts[:5]


def _date_label(context: dict, premise: str, number: int) -> str:
    match = re.search(r"\b(año\s+\d+\s*d\.\s*C\.?[^.]{0,40})", premise, flags=re.IGNORECASE)
    if match:
        return options.clean_text(match.group(1), 80).strip(" ,")
    lower = premise.lower()
    if "futur" in lower:
        return "La ciudad, antes del amanecer"
    if "dinosaurio" in lower or "dinosaur" in lower:
        return "La era que no terminó"
    if "sueño" in lower or "soñar" in lower:
        return "La madrugada compartida"
    if "señal" in lower or "extraterrestre" in lower:
        return "El primer contacto"
    if number == 1:
        return "El instante de llegada"
    return "Poco después"


def _possibilities(context: dict, actor: str, other: str, place: str, profile: dict) -> list[tuple[str, str]]:
    obj = profile["objects"][0]
    discovery = profile["discoveries"][0]
    rows = [
        ("Hablar con " + other, f"Preguntar qué sabe sobre {discovery} y por qué no lo dijo antes."),
        ("Examinar " + obj, f"Buscar una marca concreta que explique lo ocurrido en {place}."),
        ("Seguir el rastro", f"Volver al lugar donde apareció {discovery} antes de que desaparezca."),
        ("Cambiar el rumbo", "Hacer una acción libre y comprobar qué cambia después."),
    ]
    modes = " ".join(str(item).lower() for item in _as_list_safe(context.get("modes")))
    if "apocalip" in modes:
        rows.insert(1, ("Buscar refugio", "Comprobar qué queda de agua, luz y tiempo antes de continuar."))
    return rows[:5]


def _paragraph(templates: tuple[str, ...], used: set[str], rng: Any, values: dict) -> str:
    template = _unique_choice(rng, templates, used)
    return _public(template.format(**values), 3000)


def local_chapter_block(payload: Any = None) -> dict:
    data = payload if isinstance(payload, dict) else {}
    context = data.get("context") if isinstance(data.get("context"), dict) else {}
    config = normalize_narrative_config(
        data.get("narrative_config") or context.get("narrative_config") or data.get("config")
    )
    plan = chapter_plan(config)
    number = max(1, _int(data.get("number") or context.get("chapter_number"), 1, 1, 10000))
    index = max(1, _int(data.get("index"), 1, 1, 100))
    target_words = _int(data.get("target_words"), plan["target_words"], 120, 3000)
    budget = min(target_words, 520)
    minimum_paragraphs = 2 if config["chapter_length"] == "escena" else 4
    rng = _rng(data, f"chapter:{number}:{index}")
    profile_key = _profile_key(context)
    profile = NARRATIVE_PROFILES[profile_key]
    names = _named(context, "characters", "quien observa", 4)
    places = _named(context, "locations", "el lugar donde todo empieza", 4)
    subject = names[0]
    actor = "tú"
    other = names[1] if len(names) > 1 else (names[0] if names else "un desconocido")
    place = places[0]
    premise = _public(context.get("premise"), 600) or "la premisa que dio origen a esta realidad"
    first_scene = _public(context.get("first_scene"), 500)
    previous = _public(context.get("previous_summary"), 500)
    last_event = _public(context.get("last_event"), 500)
    direction = _public(data.get("direction"), 500)
    date = _date_label(context, premise, number)
    forced = forced_event(config, number)
    used_raw = data.get("used_paragraphs")
    seen_paragraphs = (
        {_paragraph_key(item) for item in used_raw if isinstance(item, str)}
        if isinstance(used_raw, (list, tuple)) else set()
    )
    used_phrases: set[str] = set()
    obj = _unique_choice(rng, profile["objects"], used_phrases)
    texture = _unique_choice(rng, profile["textures"], used_phrases)
    voice = _unique_choice(rng, profile["voices"], used_phrases)
    discovery = _unique_choice(rng, profile["discoveries"], used_phrases)
    scene_line = _ended(first_scene) or f"Algo en {place} acaba de dejar de encajar con lo que sabías."
    values = {
        "actor": actor, "subject": subject, "other": other, "place": place,
        "obj": obj, "texture": texture, "voice": voice, "discovery": discovery,
        "scene": scene_line,
    }
    title_pool = CHAPTER_TITLES[profile_key]
    chapter_title = _public(title_pool[(number - 1) % len(title_pool)].format(**values), 120)
    sections: list[str] = []
    if number == 1 and index == 1:
        opening = rng.choice(OPENING_IMAGES).format(place=place, scene=scene_line)
        arrival = _paragraph(ARRIVAL_TEMPLATES, used_phrases, rng, values)
        sections.extend((opening, "", "# Tu llegada", arrival))
        sections.extend(("", "# Lo que debes saber"))
        sections.extend("- " + fact for fact in _profile_facts(context, profile, subject, other, place))
        sections.extend(("", "# Posibilidades de esta realidad"))
        for title, detail in _possibilities(context, actor, other, place, profile):
            sections.append(f"- **{title}** — {_lower_first(detail)}")
        sections.extend((
            "", "# Comienza la simulación",
            "Elige una posibilidad o escribe tu propia acción. Si quieres definir tu papel, basta con tres detalles: "
            "de dónde vienes, qué sabes y qué no quieres perder.",
        ))
    paragraphs: list[str] = []
    if number > 1 and (previous or last_event):
        bridge = _ended(_public(previous, 500)) if previous else "Lo que acabas de vivir todavía no tiene una explicación clara."
        paragraph = _paragraph(
            BRIDGE_TEMPLATES, used_phrases, rng,
            {"place": place, "other": other, "obj": obj, "bridge": bridge},
        )
        if _paragraph_key(paragraph) not in seen_paragraphs:
            seen_paragraphs.add(_paragraph_key(paragraph))
            paragraphs.append(paragraph)
    if direction and not (number == 1 and index == 1 and first_scene):
        paragraph_values = dict(values)
        paragraph_values.update({
            "obj": _unique_choice(rng, profile["objects"], used_phrases),
            "texture": _unique_choice(rng, profile["textures"], used_phrases),
            "direction": _lower_first(_ended(direction)),
        })
        paragraph = _paragraph(DIRECTION_TEMPLATES, used_phrases, rng, paragraph_values)
        if _paragraph_key(paragraph) not in seen_paragraphs:
            seen_paragraphs.add(_paragraph_key(paragraph))
            paragraphs.append(paragraph)
    phases = (
        DETAIL_TEMPLATES, DIALOGUE_TEMPLATES, DISCOVERY_TEMPLATES,
        REACTION_TEMPLATES, CHOICE_TEMPLATES, AFTERMATH_TEMPLATES,
    )
    words = sum(len(item.split()) for item in sections)
    for _ in range(28):
        if words >= budget and len(paragraphs) >= minimum_paragraphs:
            break
        for templates in phases:
            if words >= budget and len(paragraphs) >= minimum_paragraphs:
                break
            paragraph_values = dict(values)
            paragraph_values.update({
                "obj": _unique_choice(rng, profile["objects"], used_phrases),
                "texture": _unique_choice(rng, profile["textures"], used_phrases),
                "voice": _unique_choice(rng, profile["voices"], used_phrases),
                "discovery": _unique_choice(rng, profile["discoveries"], used_phrases),
            })
            paragraph = _paragraph(templates, used_phrases, rng, paragraph_values)
            if forced and "La escalada" not in paragraph and rng.random() < 0.25:
                paragraph += f" {_ended(_lower_first(_public(forced.get('description'), 300)))}"
            if config["crazy"] and rng.random() < 0.2:
                paragraph += f" Lo imposible se volvió parte de la escena cuando viste {paragraph_values['discovery']}."
            if config["unlimited"] and rng.random() < 0.2:
                paragraph += f" La escena cruzó un límite conocido, pero no borró lo descubierto junto a {paragraph_values['obj']}."
            key = _paragraph_key(paragraph)
            if not paragraph or key in seen_paragraphs:
                continue
            seen_paragraphs.add(key)
            paragraphs.append(paragraph)
            words += len(paragraph.split())
    block_text = "\n\n".join(part for part in sections + paragraphs if part.strip())
    if not paragraphs:
        paragraphs = [_public(f"Encontraste {discovery} en {place} y decidiste seguir adelante.", 900)]
    summary = _public(
        f"Encontraste {discovery} junto a {obj} en {place} y elegiste continuar con {other}.", 500,
    )
    events = [{
        "title": _public(forced.get("title") or f"Descubrimiento en {place}", 140),
        "description": _public(paragraphs[-1], 900),
        "narrative_date": date,
        "consequences": _public(paragraphs[-2] if len(paragraphs) > 1 else paragraphs[-1], 600),
    }]
    memories = [
        {"kind": "chapter", "content": summary, "confidence": "confirmed", "importance": 7},
        {"kind": "current", "content": _public(paragraphs[-1], 900), "confidence": "confirmed", "importance": 9},
    ]
    cards = []
    if forced and forced.get("memory_card"):
        cards.append(forced["memory_card"])
    if config["crazy"] and config["crazy_level"] >= 3 and number % 2 == 1:
        cards.append({
            "kind": "rule_change",
            "subject": place,
            "content": f"En {place} se aceptó una explicación imposible porque resolvía el conflicto inmediato.",
            "importance": 7,
            "metadata": {"crazy_level": config["crazy_level"], "chapter": number, "explicit": True},
        })
    if config["unlimited"] and number % 2 == 0:
        cards.append({
            "kind": "unlimited",
            "subject": premise,
            "content": f"La hipótesis {_lower_first(premise)} se amplió sin borrar lo ocurrido en {place}.",
            "importance": 6,
            "metadata": {"unlimited": 1, "chapter": number},
        })
    if rng.random() * 100 < config["surprise_frequency"]:
        cards.append({
            "kind": "surprise",
            "subject": actor,
            "content": f"Un gesto pequeño de {actor} cambió el significado de {discovery}.",
            "importance": 6,
            "metadata": {"chapter": number, "randomness": config["randomness"]},
        })
    proposed_rules = []
    if config["crazy"] and config["crazy_level"] >= 2 and number % 3 == 0:
        proposed_rules.append({
            "text": f"En {place}, lo imposible puede volverse costumbre si resuelve un conflicto.",
            "kind": "hypothesis",
        })
    if config["apocalypse"] and number % 3 == 0:
        proposed_rules.append({
            "text": f"Tras {forced.get('stage', 'la escalada')}, ninguna decisión puede considerarse reversible.",
            "kind": "hypothesis",
        })
    return {
        "title": chapter_title,
        "block": block_text,
        "summary": summary,
        "events": events,
        "memories": memories,
        "memory_cards": [dict(item) for index, item in enumerate(cards)
                         if item not in cards[:index]],
        "state_updates": {
            "current_situation": _public(paragraphs[-1], 800),
            "characters": [],
            "locations": [],
        },
        "proposed_rules": proposed_rules[:2],
    }
