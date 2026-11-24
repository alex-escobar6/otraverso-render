# Arquitectura de OTRAVERSO

## Visión general

OTRAVERSO es una plataforma modular con un portal común y universos activables. El núcleo no depende de un framework: expone una aplicación WSGI construida sobre la biblioteca estándar de Python. Cada universo se registra en la tabla `modules` y el panel permite activarlo o desactivarlo.

Universos actuales:

| Código | Estado |
| --- | --- |
| `portal` | Activo |
| `shop` | Activo |
| `whatif` | Activo en `/what-if`, APIs `/api/what-if/v1/...` y panel `/admin/what-if` |
| `play` | Activo en BD; hub en `/play`, perfil en `/play/profile`, nueve juegos en `/play/...` y APIs `/api/play/v1/...` |
| `labs` | Planeado, sin funcionalidades activas |

## Capas

1. **HTTP/WSGI** (`app/core/http.py`): `Request`, `Response`, `Router`, multipart, códigos de estado y cabeceras de seguridad.
2. **Identidad** (`app/core/auth.py`, `app/security.py`): sesiones con token hasheado, contraseñas PBKDF2-SHA256, CSRF y permisos.
3. **Presentación** (`app/core/render.py`, `app/templates`, `app/static`): plantillas `string.Template`, escape HTML, navegación, footer, marca y metadatos SEO.
4. **Dominio** (`app/services`): catálogo, inventario, pedidos, cobertura, WhatsApp, analítica, configuración declarativa del multiverso y motores narrativos de WHAT IF.
5. **Persistencia** (`app/db.py`): SQLite WAL, esquema versionado (`PRAGMA user_version`), semilla idempotente y auditoría.
6. **Módulos** (`app/modules`): `portal`, `play`, `shop`, `whatif` y `admin` registran rutas en el router.
7. **Multiverso, PLAY y runtime gráfico** (`app/static`): `galaxy.js` dibuja en Canvas 2D el núcleo, universos distribuidos, campos ambientales, planetas satélite, eventos y descubrimientos; `webgl-runtime.js` detecta compatibilidad y administra el renderer WebGL; `play.css`, `play.js`, `universe-core.js`, `play-game-kit.js`, `play-progress.js`, `play-collectibles.js` y `play/hub/1.0.0/hub.js` sostienen el hub monumental, el progreso y la carga diferida de los juegos.

## Galaxia pre-Git, NEXUS RUSH y GRAVITY

La portada `/` mantiene la implementación Canvas 2D del 17 de noviembre, ahora evolucionada a un multiverso navegable. El fondo conserva nebulosa offscreen, estrellas, brazos espirales y polvo, pero los cuatro universos ya no comparten una órbita circular: ocupan posiciones distribuidas, tienen tamaños/capas distintas y derivan con paralaje suave. Al seleccionar un universo se resalta, se aproxima la cámara y se abre su panel de mundos; al elegir SHOP o una experiencia real, `galaxy.js` toma la posición activa, aplica un zoom de hasta `4.6x`, dibuja estelas radiales y, tras 900 ms con flash CSS, navega a la ruta. Los universos planeados abren su dossier y tarjeta sin enlazar funcionalidades inexistentes.

La galaxia principal no tiene loader ni dependencia de Three.js/WebGL: la escena dibuja desde el primer render. El bucle usa un solo `requestAnimationFrame`, limita partículas y DPR, respeta `prefers-reduced-motion` y pausa cuando la pestaña está oculta. La versión WebGL posterior queda conservada sin mezclarse en la etiqueta `backup/webgl-galaxy-20261118`.

`nexus-rush.js` no se solicita al entrar en PLAY: se inyecta al iniciar un circuito, con timeout de 8 s y barra de error/reintento. El juego usa un único canvas 2D con carretera proyectada, curvas, obstáculos, pickups, turbo, salto, temporizador, puntos y récord por circuito en `localStorage`. El audio es síntesis WebAudio por eventos. PLAY usa `play.css` y `play.js` para no mezclar sus estilos y controles con la galaxia pre-Git.

`app/services/play/catalog.py` publica manifiestos por código con `entry`, `css`, `dependencies`, capacidades y presupuestos. `universe-core.js` expone `OTRAVERSO.PLAY` con `register`, `load`, `activate` y `unload`: todos los juegos cumplen el mismo contrato (`init`, `mount`, `start`, `pause`, `resume`, `restart`, `getState`, `stop`, `dispose`) y reciben un `hostContext` para resultados y estado local. `activateGame` detiene y libera el juego anterior antes de cargar el nuevo.

GRAVITY se sirve desde `/play/gravity` y se aísla en `app/static/play/games/gravity/1.0.0/`. El manifiesto inyecta `webgl-runtime.js`, luego `three.min.js` y después el juego, por lo que la portada, la galaxia y los minijuegos 2D nunca cargan Three.js. `OTRAVERSO.GFX` detecta `webgl2`/`webgl`, llvmpipe/SwiftShader, memoria, núcleos y `prefers-reduced-motion`; crea un único renderer, escucha `webglcontextlost`/`webglcontextrestored` y lo libera con `dispose`, `forceContextLoss` y eliminación del canvas. Si la creación falla o el contexto se pierde de forma repetida, GRAVITY activa un fallback Canvas 2D jugable con las mismas reglas de sectores, orbes, portales y puntuación. El modo vigente se refleja en `data-gfx-mode` y en el badge del hub; el fallback nunca desactiva los otros juegos.

`app/templates/play/hub.html` y `app/static/play/hub/1.0.0/hub.js` dibujan el hub con Canvas 2D, sin WebGL: núcleo OTRAVERSO, ciudad monumental, torres, arcos, pasarelas, criaturas, zonas de juegos, cámara orbital y modo `EXPLORAR UNIVERSO` con descubrimientos. `OTRAVERSO.HUB` expone `mount`, `unmount`, `setMode`, `getMode`, `resetView` y `getState`; `universe-core.js` monta o desmonta el hub según la escena activa y espera `DOMContentLoaded` para que todos los scripts diferidos hayan registrado sus APIs. Las zonas usan `data-zone-select` y el panel contextual inicia el juego con doble clic, `Enter` o `Espacio`, evitando doble enlace con `play.js`. El calendario de eventos tiene prioridad, frecuencia, tope de dos eventos activos y limpieza al salir; el feed `[data-hub-feed]` aparece solo cuando el mundo reacciona. El footer del hub incluye `NEXO`, `PERFIL` y `AYUDA`, y el perfil se abre como capa SPA sin recargar la página.

La portada `/` mantiene un único canvas 2D con versión evolucionada del núcleo galáctico: halo, nebulosa, disco, lente, nucleus, ondas y destellos, además del universo PLAY como civilización digital con plataformas orbitales, torres, portales y naves. `OTRAVERSO.GALAXY_EVENTS` expone `getState`, `pause`, `resume` y `clear`; el calendario central gestiona eventos ambientales (nave, criatura, encuentro, lluvia de meteoros, onda de energía, erupción estelar, anomalía, señal secreta, portal, planeta desconocido, agujero negro, tormenta de meteoritos, nebulosa, flota, señal de auxilio, supernova, agujero de gusano y megaestructura), con prioridad, frecuencia y concurrencia reducida en modo libre. Los eventos respetan `prefers-reduced-motion`, pausan al ocultar la pestaña y se detienen durante el warp. El panel `EXPLORACIÓN` permanece cerrado por defecto y solo revela el contador de descubrimientos al abrirlo. La identidad usa `otraverso-symbol.svg`, `otraverso-logo.svg` y `favicon.svg` con órbita abierta y núcleo minimalista; el logotipo se renderiza una sola vez desde `LOGO_SRC`.

`app/services/play/progress.py` persiste PLAY ID, resultados, logros y coleccionables en `play_profiles`, `play_results`, `play_achievements` y `play_collectibles`. El frontend `play-progress.js` guarda una copia local, calcula XP/nivel y sincroniza con `POST /api/play/v1/progress/results` y `POST /api/play/v1/progress/collectibles` usando CSRF público. Los siete minijuegos usan `play-game-kit.js` con `create/reset/update/draw/hud/result` sobre un canvas 2D común; GRAVITY y NEXUS RUSH conservan sus motores propios.

### OTRAVERSO WHAT IF

`app/modules/whatif/__init__.py` publica las páginas `/what-if` y las APIs `/api/what-if/v1/...`. `app/services/whatif/options.py` concentra opciones y moderación; `provider.py` aísla el motor local determinista y un adaptador HTTP opcional compatible con chat; `engine.py` contiene propiedad, propuestas, creación, contexto, capítulos, versiones, intervenciones, ramas, comparación, recursos y cuotas.

La identidad del propietario se decide en `engine.owner_from`: sesión para usuarios registrados y token HMAC con `SECRET_KEY` para invitados, guardado en `localStorage`. El navegador envía el token como parámetro `guest` o cabecera `X-WHATIF-GUEST`, y cada consulta filtra por `owner_type` y `owner_key`. El CSRF público habilita formularios y APIs sin exigir cuenta.

La memoria narrativa se deriva de `whatif_memories` y se combina con reglas, personajes, lugares y eventos activos de la línea temporal. `apply_intervention` guarda un snapshot antes de cambiar el estado; cuando la propuesta altera hechos previos crea una rama nueva y deja la original intacta. `restore_chapter_version` inserta el contenido recuperado como una versión nueva.

Los assets por defecto se generan como SVG esquemáticos en `engine._schematic_svg` y se etiquetan como representación local. `asset_bytes_api` verifica la propiedad antes de servir bytes. Las claves de proveedores externos solo se leen desde `WHATIF_API_KEY` y `WHATIF_IMAGE_API_KEY`; la configuración de `/admin/what-if` no las persiste.

### Multiverso y navegación

`app/services/multiverse.py` es la fuente declarativa de universos y planetas. `UNIVERSES` concentra identidad visual, estado, ambientación, posición tipológica, ruta y experiencias; `UNIVERSE_COPY`, `UNIVERSE_META`, `ordered()`, `scene_config()` y `public_cards()` se derivan de esa única tabla. El portal inyecta `scene_config()` como `#multiverso-config` y `galaxy.js` decide el nivel de detalle (`overview`, `intermediate`, `close`, `exploration`) según el zoom, sin duplicar renderizadores ni depender de módulos de negocio.

El foco de un universo actualiza el mapa `OTRAVERSO → MULTIVERSO/UNIVERSO → MUNDOS` y abre su panel de planetas sin activar el zoom: el estado `universe` mantiene cámara fija, scroll normal y `touch-action: pan-y`, de modo que los enlaces reales a GRAVITY, NEXUS RUSH, CAZADOR DE ESTRELLAS y HUB quedan alcanzables también en viewport cortos. `EXPLORAR UNIVERSO` cambia al estado `explore`, fija la escena a pantalla completa, habilita cámara con rotación, inercia y joystick táctil, y aumenta la frecuencia de eventos; `VOLVER AL UNIVERSO` o `Esc` restaura el panel.

La galaxia expone tres estados reales mediante `OTRAVERSO.GALAXY_NAV`: `multiverse`, `universe` y `explore`. La API ofrece `getState`, `focus`, `explore`, `exit` y `back`. `world` y `game` son niveles conceptuales del producto: las experiencias se materializan como rutas HTTP y, dentro de PLAY, como escenas `hub`, `play` y `game` gestionadas por `OTRAVERSO.setScene`. No hay un estado `world` ni `game` dentro de `GALAXY_NAV`.

El interior de PLAY, SHOP, GRAVITY, los minijuegos y los descubrimientos conservan sus rutas y contratos. Las pantallas de juego incluyen `REGRESAR A PLAY` y vuelven al hub mediante `history.pushState` sin recargar la aplicación. La salida desde PLAY hacia la portada usa navegación completa porque cada universo mantiene su propio runtime; es una decisión de aislamiento, no una SPA global.

¿Cómo agregar otro universo? Añadir una entrada en `UNIVERSES` dentro de `app/services/multiverse.py`; el nodo, el panel, el índice, la guía y el dossier se generan desde `UNIVERSE_META`. Crear una ruta real solo si estará disponible. Los universos planeados usan `/universos/{code}`.

### Matriz pública de rutas, estados y eventos

| Superficie | Contrato real |
| --- | --- |
| Portal | `GET /`, `GET /universos/{code}` |
| SHOP | `GET /shop`, `/shop/catalogo`, `/shop/categoria/{slug}`, `/shop/producto/{slug}`, `/shop/cobertura`, `/pages/{slug}`, `/sitemap.xml`, `/robots.txt`, `/buscar`; `POST /shop/whatsapp` |
| PLAY páginas | `GET /play`, `/play/hub`, `/play/profile`, `/play/nexus-rush`, `/play/gravity`, `/play/games/{code}` |
| PLAY APIs | `GET /api/play/v1/games`, `GET /api/play/v1/games/{code}/manifest`, `GET /api/play/v1/progress`; `POST /api/play/v1/progress/results`, `POST /api/play/v1/progress/collectibles` |
| WHAT IF páginas | `GET /what-if`, `/what-if/crear`, `/what-if/explorar`, `/what-if/biblioteca`, `/what-if/espacio/{id}`, `/what-if/studio/{id}` |
| WHAT IF APIs | `GET /api/what-if/v1/guest`, `/config`, `/realities`, `/realities/{id}`, versiones y comparación; `POST` de propuestas, realidades, capítulos, intervenciones, ramas, recursos y actualización |
| Admin | Rutas protegidas por permisos granulares, incluido `/admin/what-if` con `whatif.view` y `whatif.edit` |
| Galaxia | `OTRAVERSO.GALAXY_NAV.getState/focus/explore/exit/back`; `OTRAVERSO.NAVIGATION` con `contract`, `event`, `states`, `getState`; `OTRAVERSO.GALAXY_EVENTS.getState/pause/resume/clear` |
| PLAY runtime | `OTRAVERSO.PLAY` con `version='game-contract-1'`, `register`, `load`, `activate`, `unload`, `manifest`, `submitResult`; `OTRAVERSO.NAVIGATION` con `contract`, `event`, `states`, `getState`; API general con `setScene`, `warpTo`, `startGame`, `goPlay`, `goHub` |
| Navegación | Evento público `otraverso:navigation` con `detail.runtime`, `contract`, `state`, `previous` y contexto; `otraverso:scene` permanece como evento interno de PLAY |
| Carga de juegos | Manifiestos validados contra catálogo, diagnóstico con timeout de red y reintento real desde `Reintentar`; las promesas fallidas se invalidan antes de volver a cargar |
| Gráficos | `OTRAVERSO.GFX.detect/mode/describe/createRenderer/releaseRenderer/onContextLost/onContextRestored` |
| Hub | `OTRAVERSO.HUB.mount/unmount/setMode/getMode/resetView/getState` |

Eventos ambientales de la galaxia declarados en `app/static/js/galaxy.js`: `drift`, `flare`, `wave`, `anomaly`, `creature`, `meteor`, `alien-ship`, `secret-signal`, `unknown-planet`, `portal`, `encounter`, `meteor-storm`, `nebula-bloom`, `alien-fleet`, `distress-signal`, `supernova`, `wormhole`, `black-hole` y `mega-structure`. No forman parte del contrato de navegación; son animación y descubrimiento.

## Flujo de una solicitud

```text
WSGI -> main.application -> Request -> Router -> middleware de sesión/permisos
     -> handler del módulo -> servicios -> SQLite -> Response -> cabeceras de seguridad
```

El router admite parámetros `{slug}`, `{id}` y `{bid}` y verifica permisos antes de ejecutar handlers administrativos. Las excepciones `HTTPError` se convierten en páginas 400/403/404/405.

## Modelo de datos

Dominios principales:

- **Identidad y acceso**: `users`, `roles`, `permissions`, `role_permissions`, `sessions`, `audit_log`.
- **Catálogo**: `products`, `product_images`, `product_variants`, `categories`, `suppliers`, `product_related`.
- **Operación**: `inventory_movements`, `orders`, `order_items`, `order_history`, `purchase_requests`, `whatsapp_clicks`, `customers`.
- **Comercial y marketing**: `promotions`, `coupons`, `banners`, `home_sections`.
- **Cobertura**: `departments`, `municipalities`, `delivery_zones`, `zone_rates`.
- **Configuración**: `settings`, `whatsapp_templates`, `modules`, `order_statuses`.
- **Medición y respaldo**: `visits`, `analytics_events`, `backups`.
- **PLAY**: `play_profiles`, `play_results`, `play_achievements`, `play_collectibles`.
- **WHAT IF**: `whatif_realities`, `whatif_rules`, `whatif_timelines`, `whatif_chapters`, `whatif_chapter_versions`, `whatif_characters`, `whatif_character_relationships`, `whatif_locations`, `whatif_events`, `whatif_memories`, `whatif_interventions`, `whatif_versions`, `whatif_assets`, `whatif_generation_jobs`, `whatif_usage`.

### Modalidades de producto

- `stock`: stock real; cada entrada, salida o ajuste genera un `inventory_movements`.
- `order`: bajo pedido/importación; no representa inventario disponible y usa plazos distintos.

### Dinero y plazos

Los precios, costos, envíos y totales se guardan en centavos. Las tarifas por zona incluyen `estimated_hours` y `conditions`, para no prometer plazos fijos sin confirmación.

## WhatsApp

La ficha de producto y el carácter informativo del catálogo generan `purchase_requests`. El handler `/shop/whatsapp`:

1. Valida CSRF público, consentimiento, persona, teléfono, cantidad y disponibilidad.
2. Normaliza el número a formato internacional.
3. Compone el mensaje con plantilla configurable, producto, modalidad, cantidad, zona y nota.
4. Inserta `customers`, `purchase_requests`, `whatsapp_clicks` y `analytics_events`.
5. Redirige `303` a `https://wa.me/<número>?text=...`.

La persistencia ocurre **antes** de la redirección; el sistema no interpreta la apertura del chat como venta confirmada.

## Panel administrativo

Áreas registradas: dashboard, productos, categorías, proveedores, variantes, imágenes, inventario, pedidos, solicitudes, clientes, marketing, WHAT IF, cobertura, configuración comercial/visual/WhatsApp/SEO/módulos, analítica, usuarios, roles, permisos, auditoría y backups.

Cada handler exige un permiso; un rol sin permiso recibe `403`. Las acciones sensibles registran `audit_log`.

## SEO

- Configuración global por `settings` (`seo`): título, descripción, palabras clave y robots.
- Productos y categorías pueden override con `seo_title` y `seo_description`.
- Ficha y categoría inyectan esos valores en `<title>`, `meta description` y Open Graph.
- `/sitemap.xml` y `/robots.txt` se generan desde datos reales y `BASE_URL`.

## Migraciones

`init_db.py` aplica `SCHEMA` con `CREATE TABLE IF NOT EXISTS`, ejecuta `_migrate()` para columnas añadidas y fija `PRAGMA user_version`. La semilla usa `INSERT OR IGNORE`, por lo que es idempotente y no sobrescribe datos del negocio.

Versión actual: `4` (conserva progreso de PLAY y añade realidades narrativas, memoria, capítulos, intervenciones, versiones, recursos y uso de WHAT IF).
