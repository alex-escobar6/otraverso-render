# OTRAVERSO

Plataforma digital modular con identidad propia. La primera versión funcional es **OTRAVERSO SHOP**: tienda de productos novedosos con inventario real, productos bajo pedido, cobertura en Nariño y solicitudes de compra por WhatsApp persistentes.

**OTRAVERSO PLAY** está disponible con hub vivo, PLAY ID, siete minijuegos, `NEXUS RUSH` y `GRAVITY` con runtime WebGL y fallback Canvas 2D. **OTRAVERSO WHAT IF** está disponible con realidades narrativas persistentes, memoria, capítulos, intervenciones, líneas temporales, biblioteca y studio. **LABS** sigue declarado como planeado, sin funcionalidades activas ni datos simulados.

## Estado

- Multiverso Canvas 2D sin dependencias 3D: `OTRAVERSO → MULTIVERSO → UNIVERSOS → PLANETAS → EXPERIENCIAS`, con universos distribuidos, LOD, planetas satélite, viaje cinematográfico y scroll de página preservado.
- PLAY: `/play` con hub monumental y PLAY ID; `/play/gravity` con modos `full`/`optimized`/`fallback`; `/play/nexus-rush` con tres circuitos, turbo, obstáculos, energía, récord local y audio procedural; siete minijuegos adicionales.
- WHAT IF: `/what-if` con creación guiada, biblioteca privada, sala narrativa, studio, versiones, ramas, intervenciones y recursos visuales esquemáticos por defecto.
- SHOP: inicio, catálogo con filtros y búsqueda, categorías, ficha de producto, cobertura y páginas informativas.
- Modalidades: `stock` (inventario real) y `order` (bajo pedido/importación), claramente diferenciadas.
- WhatsApp: antes de abrir el chat se persisten cliente, solicitud, mensaje y clic; abrir el chat **no** confirma una venta.
- Panel administrativo con RBAC, auditoría y copias de seguridad.
- SEO global e individual por producto y categoría, sitemap y robots.
- Base de datos SQLite con WAL; sin dependencias externas obligatorias.

## Requisitos

- Python 3.11 o superior (verificado con Python 3.12.3).
- Pillow recomendado para validar y redimensionar imágenes subidas (`python3 -m pip install Pillow`).
- Para producción: servidor WSGI y proxy inverso con HTTPS.

## Inicio rápido

```bash
cd /home/sistemas/otraverso
cp .env.example .env
# Editar .env: SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, BASE_URL, WHATSAPP_DEFAULT
python3 scripts/init_db.py
python3 scripts/serve.py
```

Abrir `http://127.0.0.1:8000`.

Si no se definen credenciales, `init_db.py` genera un administrador temporal y lo guarda con permisos `0600` en `data/bootstrap_admin.txt`. Cámbielo después del primer ingreso.

## Comandos

| Acción | Comando |
| --- | --- |
| Inicializar/migrar BD | `python3 scripts/init_db.py` |
| Servidor de desarrollo | `python3 scripts/serve.py` |
| Pruebas | `python3 -m unittest discover -s tests -v` |
| Compilar | `python3 -m compileall -q app scripts tests` |
| Crear administrador | `python3 scripts/create_admin.py --email usuario@ejemplo.com` |
| Copia de seguridad | `python3 scripts/backup.py` |
| Restaurar copia | `python3 scripts/restore.py otraverso_AAAAMMDD_HHMMSS_cli.db --confirm` |

## Estructura

```text
app/
  core/       HTTP/WSGI, sesiones, CSRF, render, errores
  modules/    portal, play, shop, whatif, admin
   services/   catálogo, inventario, pedidos, WhatsApp, cobertura, analítica, multiverso, whatif
   templates/  HTML por universo y panel
   static/     galaxy.css/galaxy.js (multiverso Canvas 2D), brand/, play.css/play.js/universe-core.js/nexus-rush.js (PLAY), whatif/1.0.2/whatif.css/whatif.js

  config.py   Variables de entorno
  db.py       Esquema, migraciones y semilla
  security.py Hash, tokens y saneamiento
  main.py     Aplicación WSGI y registro de rutas
data/         BD, secret.key, imágenes, backups y credencial inicial (no versionar)
docs/         Arquitectura, fases, despliegue y seguridad
scripts/      CLI de inicialización, servidor, administradores y backups
tests/        Suite de integración con BD temporal
```

## Notas importantes

- Los importes se almacenan en centavos (`price_cents`, `total_cents`); la interfaz los muestra en COP.
- La BD real no contiene productos de ejemplo. Las pruebas usan una base temporal.
- No hay pago en línea: la solicitud se concreta y confirma por WhatsApp con el vendedor.
- Registros de visitas, eventos y auditoría se escriben en la misma BD para consultas reales del panel.
- El módulo `play` está activo en la tabla `modules` (`app/db.py` lo siembra y normaliza); sus rutas son públicas y no alteran esquema ni semilla.
- Los récords de NEXUS RUSH se guardan en `localStorage` del navegador (`otraverso.nexus.best.v1`).
- Controles de NEXUS RUSH: flechas/WASD, Espacio turbo, Shift salto, P pausa, R reiniciar, Esc salir; también hay controles táctiles.
- El audio se genera con WebAudio desde código; no hay archivos de audio ni licencias externas.
- La portada usa un único canvas 2D sin Three.js: limita partículas/DPR, respeta `prefers-reduced-motion` y pausa al ocultar la pestaña.
- La galaxia expone tres estados reales en `OTRAVERSO.GALAXY_NAV`: `multiverse` (zoom espacial opcional), `universe` (scroll normal y cámara fija al abrir sus mundos) y `explore` (vuelo libre a pantalla completa). `world` y `game` son niveles conceptuales de producto, gestionados por rutas y por el runtime de PLAY, no estados de la galaxia. `EXPLORAR UNIVERSO` abre el modo libre con teclado, ratón y joystick táctil; `VOLVER AL UNIVERSO` o `Esc` regresa al panel sin recargar.
- WHAT IF usa un motor narrativo local por defecto; los proveedores HTTP son opcionales y sus claves se leen solo de `WHATIF_API_KEY` y `WHATIF_IMAGE_API_KEY`.
- Las realidades de invitado se asocian a un token firmado guardado en `localStorage`; los usuarios registrados usan su identificador de sesión.
- `app/services/multiverse.py` declara universos, planetas y experiencias; `galaxy.js` consume `#multiverso-config` sin duplicar renderizadores ni acoplarse a los módulos.
- El logotipo se renderiza una sola vez desde `LOGO_SRC`; los archivos de marca viven en `app/static/brand/`.
- No existe loader: la galaxia dibuja desde el primer render y SHOP navega tras un acercamiento de 900 ms con estelas y flash.
- `nexus-rush.js` se carga dinámicamente solo desde PLAY al iniciar un circuito, con timeout y botón de reintento.

## Documentación

- `docs/ARQUITECTURA.md`
- `docs/FASES.md`
- `docs/DESPLIEGUE.md`
- `docs/SEGURIDAD.md`
- `docs/WHATSAPP.md`
- `docs/whatif/README.md`, `docs/whatif/API.md`, `docs/whatif/OPERACION.md`
