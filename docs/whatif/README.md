# OTRAVERSO WHAT IF

WHAT IF es el universo de realidades narrativas persistentes. La primera versión funcional crea una propuesta a partir de una idea, permite confirmarla como realidad, genera capítulos con continuidad, registra memorias y acontecimientos, acepta intervenciones estructuradas, conserva versiones y abre líneas temporales alternativas.

No hay catálogo público inventado: `/what-if/explorar` muestra únicamente las realidades creadas por la sesión actual. Las imágenes por defecto son SVG esquemáticos etiquetados como generados localmente.

## Entradas

| Ruta | Función |
| --- | --- |
| `/what-if` | Presentación y acceso a creación, biblioteca y exploración. |
| `/what-if/crear` | Analiza una idea y muestra una propuesta editable antes de crear. |
| `/what-if/ideas` | Generador de variantes narrativas con favoritos locales y traspaso al creador. |
| `/what-if/biblioteca` | Realidades propias, filtro por estado y acciones de favorita/archivo. |
| `/what-if/explorar` | Listado de realidades propias; no simula contenido de otros usuarios. |
| `/what-if/espacio/{id}` | Sala narrativa: capítulos, intervenciones, ramas, memoria y recursos visuales. |
| `/what-if/studio/{id}` | Edición de premisa, reglas, personajes, lugares, eventos, versiones y comparación. |
| `/admin/what-if` | Estado operativo, configuración de motores, tareas y uso reciente. |

## Identidad y propiedad

- Usuarios registrados: `owner_type='user'`, `owner_key=<user_id>`.
- Invitados: `owner_type='guest'`, `owner_key=<guest_id>`.
- El identificador de invitado se firma con `SECRET_KEY` y se guarda en `localStorage` (`otraverso.whatif.guest.v1`).
- El propietario se envía al servidor como parámetro `guest` o cabecera `X-WHATIF-GUEST`; las consultas filtran por propietario.
- Los recursos visuales solo se sirven al propietario de la realidad.

## Persistencia

El esquema `user_version=6` añade `narrative_config` a `whatif_realities` y la tabla `whatif_memory_cards`, además de `whatif_realities`, `whatif_rules`, `whatif_timelines`, `whatif_chapters`, `whatif_chapter_versions`, `whatif_characters`, `whatif_character_relationships`, `whatif_locations`, `whatif_events`, `whatif_memories`, `whatif_interventions`, `whatif_versions`, `whatif_assets`, `whatif_generation_jobs` y `whatif_usage`.

La memoria narrativa se organiza por `kind` (`global`, `current`, `chapter`, `character`, `location`, `event`), con confianza e importancia para priorizar el contexto de cada capítulo. Las fichas `whatif_memory_cards` agrupan continuidad, destrucción, muerte, cambios de regla, intervenciones, consecuencias y sorpresas. Antes de aplicar una intervención o restaurar una versión se guarda un snapshot en `whatif_versions`.

## Motores

- `whatif-local-1`: motor por defecto, determinista, sin credenciales ni llamadas externas; genera ideas, bloques de capítulo, escaladas apocalípticas y anomalías.

Los capítulos largos se producen en bloques con deduplicación de párrafos y checkpoints recuperables. El modo apocalipsis es irreversible y el modo loco puede proponer reglas nuevas, que no se convierten en reglas establecidas sin confirmación.
- Proveedor HTTP opcional compatible con el formato de chat de OpenAI, configurado desde `/admin/what-if`.
- Proveedor de imágenes opcional; si no está configurado se generan SVG esquemáticos.
- Las claves se leen de `WHATIF_API_KEY` y `WHATIF_IMAGE_API_KEY`; nunca se guardan en `settings` ni se envían al navegador.

## Verificación

```bash
python3 -m compileall -q app scripts tests
python3 -m unittest discover -s tests -v
```

La suite incluye `WhatIfTests` y `WhatIfEvolutionTests`, que recorren creación, capítulos largos por bloques con reanudación, ideas variadas, modos apocalipsis/loco/combinado, fichas de memoria, versiones, intervenciones, ramas, comparación, recursos visuales, aislamiento entre invitados y panel administrativo.
