# Operación de WHAT IF

## Configuración

El panel `/admin/what-if` permite ajustar el grupo `settings.whatif`:

| Clave | Uso |
| --- | --- |
| `enabled` | Habilita las páginas y APIs del universo. |
| `text_provider`, `text_model`, `text_api_url` | Proveedor de texto opcional; `local` no usa red. |
| `image_provider`, `image_model`, `image_api_url` | Proveedor de imágenes opcional; `schematic` genera SVG. |
| `timeout_seconds`, `max_retries` | Control de llamadas externas. |
| `max_requests_hour` | Cuota por propietario y hora. |
| `max_chapter_chars`, `max_idea_chars` | Límites de contenido. |
| `context_chapters` | Capítulos anteriores incluidos en el contexto. |
| `moderation` | Rechaza entradas con patrones bloqueados. |
| `generate_images` | Habilita el proveedor de imágenes cuando está configurado. |
| `default_genre`, `narrative_instructions` | Género sugerido e instrucciones globales (sin secretos; las claves y tokens se redactan antes del proveedor). |
| `ideas_enabled`, `apocalypse_enabled`, `crazy_enabled`, `unlimited_enabled` | Activa o desactiva el generador de ideas y los modos narrativos; `unlimited` se puede combinar con apocalipsis y loco. |
| `visual_primary_color`, `visual_secondary_color`, `visual_accent_color`, `visual_background_color` | Paleta WHAT IF inyectada como variables CSS; usa `#RRGGBB`. |
| `visual_elements` | JSON con etiquetas/motivos visuales permitidos; se sanea antes de inyectarse en CSS. |
| `narrative_templates` | JSON de instrucciones adicionales por propósito (`proposal`, `chapter`, etc.) o globales; se sanea y nunca debe contener credenciales. |
| `chapter_normal_words`, `chapter_extended_words`, `chapter_cinematic_words`, `max_chapter_words` | Longitud objetivo y tope de capítulos. |
| `generation_blocks` | Bloques por capítulo; cada uno se guarda como checkpoint. |
| `surprise_frequency`, `randomness_level` | Probabilidad de anomalías y variación del motor local. |
| `available_genres`, `available_styles` | Listas permitidas en formularios y generación. |
| `memory_cards_limit`, `default_point_of_view`, `default_ending`, `initial_characters` | Contexto de memoria y valores narrativos iniciales. |

Variables de entorno:

```text
WHATIF_API_KEY=
WHATIF_IMAGE_API_KEY=
```

Si no se configuran proveedores externos, el universo funciona igual con el motor local y los mapas esquemáticos.

## Supervisión

El panel muestra conteos de realidades, líneas, capítulos, intervenciones, fichas de memoria, tareas y errores; el detalle de las últimas tareas permite cancelar operaciones pendientes y limpiar las finalizadas con más de siete días. La tabla `whatif_usage` registra proveedor, operación, éxito y modelo sin almacenar secretos. Las tareas de capítulo conservan bloques ya escritos como checkpoint para reanudar tras un fallo del proveedor. Las generaciones de assets con `async=1` aparecen como tareas `queued`/`running`; su resultado final queda en `result` con `asset_id`, `url`, `provider`, `model` y `job_id`.

## Seguridad

- Las claves API solo viven en el entorno del proceso WSGI.
- El propietario se valida en realidades, tareas y recursos; el CSRF se exige en cada `POST` y se conserva en el formulario del generador de ideas.
- Las intervenciones solo aceptan acciones definidas en `provider.allowed_actions()`.
- El contenido generado se sanea antes de persistirse y se escapa al renderizarse.
- Los assets consultan la propiedad de la realidad antes de devolver bytes.
- El proveedor externo recibe texto de la historia; no credenciales, correos ni datos de sesión.
- Las plantillas narrativas configuradas se validan como JSON, se filtran por moderación y se redactan antes de enviarse; las claves, tokens, contraseñas y secretos nunca se guardan en `settings.whatif`.
- Los colores y etiquetas visuales se validan/sanean antes de inyectarse en el CSS del universo; las URLs versionadas de `whatif.css` y `whatif.js` no cambian.

## Coherencia narrativa

Cada capítulo se apoya en reglas, personajes, lugares, eventos y memorias de la línea temporal vigente. Se escribe en bloques deduplicados con checkpoint: una regeneración conserva el historial, una interrupción reanuda desde el último bloque y una edición manual se guarda como versión nueva. Al confirmar la propuesta se construye un blueprint con etapas (`premise`, `evolution`, `world`, `situation`, `narrative`) y secciones explorables (`world`, `history`, `chronology`, `characters`, `places`, `civilizations`, `mysteries`, `events`, `timelines`, `culture`, `technology`, `economy`, `religions`, `species`, `flora`, `fauna`, `customs`, `conflicts`); sus fichas quedan marcadas con `metadata.source='blueprint'`, `metadata.stage` o `metadata.section`. El modo apocalipsis guarda destrucción y muertes como fichas irreversibles; el modo loco puede proponer cambios de regla que no se aplican como hecho sin intervención confirmada; el modo Sin límites amplía la exploración creativa sin relajar la causalidad, los hechos confirmados ni la moderación. Las intervenciones proponen cambios antes de aplicarlos; si el cambio altera hechos previos se crea una rama y la línea original continúa intacta. Restaurar una versión inserta el contenido recuperado como una versión nueva, nunca sobrescribe el historial.
