# Arquitectura de OTRAVERSO

## Visión general

OTRAVERSO es una plataforma modular con un portal común y universos activables. El núcleo no depende de un framework: expone una aplicación WSGI construida sobre la biblioteca estándar de Python. Cada universo se registra en la tabla `modules` y el panel permite activarlo o desactivarlo.

Universos actuales:

| Código | Estado |
| --- | --- |
| `portal` | Activo |
| `shop` | Activo |
| `whatif` | Planeado, sin funcionalidades activas |
| `play` | Activo mediante rutas públicas `/play` y `/play/nexus-rush`; el flag de BD sigue deshabilitado |
| `labs` | Planeado, sin funcionalidades activas |

## Capas

1. **HTTP/WSGI** (`app/core/http.py`): `Request`, `Response`, `Router`, multipart, códigos de estado y cabeceras de seguridad.
2. **Identidad** (`app/core/auth.py`, `app/security.py`): sesiones con token hasheado, contraseñas PBKDF2-SHA256, CSRF y permisos.
3. **Presentación** (`app/core/render.py`, `app/templates`, `app/static`): plantillas `string.Template`, escape HTML, navegación, footer y metadatos SEO.
4. **Dominio** (`app/services`): catálogo, inventario, pedidos, cobertura, WhatsApp y analítica.
5. **Persistencia** (`app/db.py`): SQLite WAL, esquema versionado (`PRAGMA user_version`), semilla idempotente y auditoría.
6. **Módulos** (`app/modules`): `portal`, `play`, `shop` y `admin` registran rutas en el router.
7. **Galaxia pre-Git** (`app/static`): `galaxy.js` dibuja en Canvas 2D planetas, órbitas, estrellas y nebulosas; `galaxy.css` aporta el escenario y el flash de viaje, `play.css`/`play.js`/`universe-core.js`/`nexus-rush.js` conservan PLAY y el juego con carga diferida.

## Galaxia pre-Git y NEXUS RUSH

La portada `/` recupera la implementación del 17 de noviembre guardada en el historial local de OpenCode, anterior a la instalación de Git. Es un único canvas 2D con fondo oscuro, nebulosa generada offscreen, estrellas, brazos espirales, polvo y cuatro planetas con colores propios que orbitan de forma continua con paralaje del cursor. Al seleccionar SHOP, `galaxy.js` toma la posición del planeta, aplica un zoom de hasta `4.6x`, dibuja estelas radiales y, tras 900 ms con flash CSS, navega a `/shop`. Los universos planeados abren su tarjeta de presentación sin enlazar rutas inexistentes.

No hay loader ni dependencia de Three.js/WebGL: la escena dibuja desde el primer render. El bucle usa un solo `requestAnimationFrame`, limita partículas y DPR, respeta `prefers-reduced-motion` y pausa cuando la pestaña está oculta. La versión WebGL posterior queda conservada sin mezclarse en la etiqueta `backup/webgl-galaxy-20261118`.

`nexus-rush.js` no se solicita al entrar en PLAY: se inyecta al iniciar un circuito, con timeout de 8 s y barra de error/reintento. El juego usa un único canvas 2D con carretera proyectada, curvas, obstáculos, pickups, turbo, salto, temporizador, puntos y récord por circuito en `localStorage`. El audio es síntesis WebAudio por eventos. PLAY usa `play.css` y `play.js` para no mezclar sus estilos y controles con la galaxia pre-Git.

¿Cómo agregar otro universo? Añadir metadatos en `UNIVERSE_META`, generar su nodo/índice/dossier en `app/modules/portal/__init__.py` y crear una ruta real solo si estará disponible. Los universos planeados usan `/universos/{code}`.

## Flujo de una solicitud

```text
WSGI -> main.application -> Request -> Router -> middleware de sesión/permisos
     -> handler del módulo -> servicios -> SQLite -> Response -> cabeceras de seguridad
```

El router admite parámetros `{slug}`, `{id}` y `{bid}` y verifica permisos antes de ejecutar handlers administrativos. Las excepciones `HTTPError` se convierten en páginas 400/403/404/405.

## Modelo de datos

Dominios principales:

- **Identidad y acceso**: `users`, `roles`, `permissions`, `role_permissions`, `sessions`, `audit_log`.
- **Catálogo**: `products`, `product_images`, `variants`, `categories`, `suppliers`, `product_related`, `tags`, `product_tags`.
- **Operación**: `inventory_movements`, `orders`, `order_items`, `order_status_history`, `purchase_requests`, `whatsapp_clicks`, `customers`.
- **Comercial y marketing**: `promotions`, `coupons`, `banners`, `home_sections`.
- **Cobertura**: `departments`, `municipalities`, `delivery_zones`, `zone_rates`.
- **Configuración**: `settings`, `whatsapp_templates`, `modules`, `order_statuses`.
- **Medición y respaldo**: `visits`, `analytics_events`, `backups`.

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

Áreas registradas: dashboard, productos, categorías, proveedores, variantes, imágenes, inventario, pedidos, solicitudes, clientes, marketing, cobertura, configuración comercial/visual/WhatsApp/SEO/módulos, analítica, usuarios, roles, permisos, auditoría y backups.

Cada handler exige un permiso; un rol sin permiso recibe `403`. Las acciones sensibles registran `audit_log`.

## SEO

- Configuración global por `settings` (`seo`): título, descripción, palabras clave y robots.
- Productos y categorías pueden override con `seo_title` y `seo_description`.
- Ficha y categoría inyectan esos valores en `<title>`, `meta description` y Open Graph.
- `/sitemap.xml` y `/robots.txt` se generan desde datos reales y `BASE_URL`.

## Migraciones

`init_db.py` aplica `SCHEMA` con `CREATE TABLE IF NOT EXISTS`, ejecuta `_migrate()` para columnas añadidas y fija `PRAGMA user_version`. La semilla usa `INSERT OR IGNORE`, por lo que es idempotente y no sobrescribe datos del negocio.

Versión actual: `2` (añade SEO individual a `products`).
