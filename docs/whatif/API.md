# API de WHAT IF

Base: `/api/what-if/v1`. Todas las respuestas son JSON excepto `GET /assets/{id}`, que devuelve la imagen.

Las peticiones de invitado deben incluir `guest=<token>` o la cabecera `X-WHATIF-GUEST`. Las peticiones `POST` requieren `csrf`; el valor se obtiene en `GET /config` o desde el campo oculto del formulario renderizado. El cuerpo debe enviarse como `application/x-www-form-urlencoded;charset=UTF-8`; `text/plain` no se interpreta como formulario y hace que falte el CSRF.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/guest` | Crea o devuelve un identificador de invitado firmado. |
| GET | `/config` | Opciones narrativas (incluye `Sin límites` cuando está habilitado), defaults del motor, estado de proveedores, `unlimited_enabled`, `narrative_templates_configured` y CSRF público. |
| POST | `/proposals` | Analiza `idea` y devuelve una propuesta editable. Usa `idempotency_key`. |
| POST | `/ideas` | Genera variantes narrativas con `count`, `genre`, `mode`, `variation` y `exclude`. |
| GET | `/jobs/{jid}` | Estado, etapa, progreso y resultado parcial de una tarea propia. |
| POST | `/realities` | Confirma la propuesta, crea la realidad y genera el primer capítulo. |
| GET | `/realities` | Lista las realidades del propietario. |
| GET | `/realities/{id}` | Estado completo: timelines, capítulos, memoria, fichas de memoria, modos, reglas, personajes, lugares, eventos, relaciones de personajes, blueprint, secciones explorables, recursos y versiones. Acepta `chapter`. |
| POST | `/realities/{id}/modes` | Actualiza `narrative_config`, modos y parámetros narrativos. |
| POST | `/realities/{id}/chapter` | Genera un capítulo continuo por bloques en `timeline`. |
| POST | `/realities/{id}/chapter/{cid}/edit` | Guarda una edición manual como nueva versión. |
| POST | `/realities/{id}/chapter/{cid}/regenerate` | Regenera un capítulo conservando el historial. |
| GET | `/realities/{id}/chapter/{cid}/versions` | Lista versiones de un capítulo. |
| POST | `/realities/{id}/versions/{vid}/restore` | Restaura una versión como contenido nuevo, sin borrar historial. |
| POST | `/realities/{id}/interventions` | Analiza `text` y propone cambios estructurados. |
| POST | `/realities/{id}/interventions/{iid}/apply` | Aplica cambios, con `branch=1` o `branch=0`, y regenera continuación. |
| POST | `/realities/{id}/interventions/{iid}/reject` | Descarta una propuesta sin modificar la realidad. |
| POST | `/realities/{id}/timelines` | Crea una rama desde `timeline`. |
| GET | `/realities/{id}/timelines/{tid}/compare` | Compara con `other`. |
| POST | `/realities/{id}/assets` | Genera `cover`, `map` o `portrait`; en portrait usa `entity`. Devuelve `asset_id`, `url`, `provider`, `model` y `job_id`; con `async=1` devuelve de inmediato `job_id` y `status=queued`, y el resultado final se consulta en `GET /jobs/{jid}`. |
| POST | `/realities/{id}/update` | Actualiza título, descripción, estado, favorita o `narrative_config`. |
| POST | `/jobs/{jid}/cancel` | Cancela una tarea propia pendiente o en ejecución. |
| GET | `/assets/{aid}` | Devuelve bytes del recurso al propietario. |

## Convenciones

- Errores: `{"ok": false, "error": "mensaje", "code": "codigo_interno"}` con código HTTP acorde.
- Éxito: `{"ok": true, ...}`.
- Correlación: enviar `X-Request-ID`; la respuesta devuelve el mismo valor en `X-Request-ID`.
- Diagnóstico: `WHATIF_DEBUG=1` habilita logs sin tokens ni contenido privado en `data/whatif-api.log` y en la consola del navegador.
- Idempotencia: los generadores usan `idempotency_key`; repetir la misma clave devuelve el resultado anterior o cancela la operación duplicada. Los assets sin clave derivan la identidad de `id_reality|kind|entity|hash(prompt/título/premisa)` y reutilizan un recurso `ready` con el mismo prompt.
- Capítulos: se generan en bloques deduplicados; cada bloque se registra como checkpoint y una interrupción permite reanudar sin duplicar ni perder texto ya escrito.
- Modos: `apocalypse`, `crazy` y `unlimited` se reflejan en `modes`, en `narrative_config` y en fichas de memoria `destruction`, `death`, `rule_change` o `surprise`. `unlimited` requiere `unlimited_enabled=1` y se puede combinar con los otros dos.
- Blueprint: al confirmar una propuesta se persisten fichas con `metadata.source='blueprint'`. Las etapas son `premise`, `evolution`, `world`, `situation` y `narrative`, con `metadata.stage`; las secciones explorables son `world`, `history`, `chronology`, `characters`, `places`, `civilizations`, `mysteries`, `events`, `timelines`, `culture`, `technology`, `economy`, `religions`, `species`, `flora`, `fauna`, `customs` y `conflicts`, con `metadata.section`. El estado devuelve `blueprint`, `sections` y `character_relationships`.
- Assets visuales: `async=1` encola una tarea en segundo plano; `GET /jobs/{jid}` devuelve en `result` el mismo objeto `asset_id`, `url`, `provider`, `model` y `job_id` que la generación síncrona. `GET /assets/{aid}` solo devuelve bytes de recursos `ready` al propietario.
- Límites: moderación, longitud de ideas/capítulos, bloques por capítulo, sorpresa, aleatoriedad, géneros/estilos disponibles, fichas de memoria, colores/tema, plantillas narrativas y cuota por hora se configuran en `/admin/what-if`. Las plantillas se sanean antes de enviarse al proveedor; nunca aceptan credenciales.
- Ningún endpoint expone realidades ni tareas de otro propietario.
