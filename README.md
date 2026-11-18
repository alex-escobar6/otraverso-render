# OTRAVERSO

Plataforma digital modular con identidad propia. La primera versión funcional es **OTRAVERSO SHOP**: tienda de productos novedosos con inventario real, productos bajo pedido, cobertura en Nariño y solicitudes de compra por WhatsApp persistentes.

**OTRAVERSO PLAY** está disponible con `NEXUS RUSH`, una carrera futurista ligera en Canvas 2D con perspectiva simulada y tres circuitos. **WHAT IF** y **LABS** siguen declarados como planeados, sin funcionalidades activas ni datos simulados.

## Estado

- Galaxia original restaurada: Three.js/WebGL con planetas animados, órbitas, nebulosas y viaje cinematográfico a SHOP; fallback CSS si WebGL no está disponible.
- PLAY: `/play` y `/play/nexus-rush` con NEXUS RUSH (tres circuitos, turbo, obstáculos, energía, récord local y audio procedural).
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
  modules/    portal, play, shop, admin
  services/   catálogo, inventario, pedidos, WhatsApp, cobertura, analítica
  templates/  HTML por universo y panel
   static/     galaxy.css/galaxy.js + three.min.js (galaxia original), play.css/play.js/universe-core.js/nexus-rush.js (PLAY)
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
- El módulo `play` permanece deshabilitado en la tabla `modules`; sus rutas son públicas y no alteran esquema ni semilla.
- Los récords de NEXUS RUSH se guardan en `localStorage` del navegador (`otraverso.nexus.best.v1`).
- Controles de NEXUS RUSH: flechas/WASD, Espacio turbo, Shift salto, P pausa, R reiniciar, Esc salir; también hay controles táctiles.
- El audio se genera con WebAudio desde código; no hay archivos de audio ni licencias externas.
- La portada usa la galaxia original con Three.js; se limitan partículas, segmentos, DPR y bloom, y se pausa al ocultar la pestaña.
- El loader tiene apagado automático por JS y por CSS; si falla WebGL aparece la galaxia de respaldo en CSS.
- `nexus-rush.js` se carga dinámicamente solo desde PLAY al iniciar un circuito, con timeout y botón de reintento.

## Documentación

- `docs/ARQUITECTURA.md`
- `docs/FASES.md`
- `docs/DESPLIEGUE.md`
- `docs/SEGURIDAD.md`
