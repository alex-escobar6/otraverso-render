# Despliegue

## Entorno verificado

- Sistema con Python 3.12.3.
- Sin Node/npm, PostgreSQL, Docker ni gunicorn instalados.
- Dependencia opcional: Pillow para imágenes; el resto funciona con biblioteca estándar.

## Dependencias y licencias

| Componente | Uso | Origen | Licencia |
| --- | --- | --- | --- |
| Python 3.12 y biblioteca estándar | WSGI, SQLite, hashing, plantillas, HTTP | Entorno del sistema | PSF License |
| Pillow 10.2.0 | Validación/redimensionado de imágenes; requerido por la suite de pruebas | PyPI | HPND |
| gunicorn 22.0.0 | Servidor WSGI de producción | PyPI | MIT |
| psycopg[binary] 3.2.3 | Adaptador PostgreSQL en producción | PyPI | LGPL-3.0 |
| Three.js r149 | Único motor WebGL, usado solo por GRAVITY | `app/static/js/vendor/three.min.js` | MIT, cabecera SPDX incluida |
| JavaScript vanilla | Galaxia, PLAY, hub, minijuegos y runtime WebGL | Código propio del repositorio | Propio del proyecto |
| CSS y SVG | Identidad visual y componentes | Código propio del repositorio | Propio del proyecto |

No hay gestores de paquetes JavaScript. Las dependencias Python de producción están declaradas en `requirements.txt`. La instalación local sigue funcionando con SQLite; en Render son obligatorios PostgreSQL y almacenamiento externo. Revísense los avisos legales de Three.js, Pillow, gunicorn y psycopg según la jurisdicción aplicable.

## Preparación

```bash
cd /home/sistemas/otraverso
cp .env.example .env
chmod 600 .env
```

Editar `.env`:

- `SECRET_KEY`: clave aleatoria larga y estable; si no se define se genera en `data/secret.key`.
- `DATABASE_PATH`: ruta absoluta de la BD.
- `BASE_URL`: URL pública, usada en canonical y sitemap.
- `ADMIN_EMAIL` y `ADMIN_PASSWORD`: solo para la creación/inicialización; no dejar la contraseña temporal.
- `WHATSAPP_DEFAULT`: número en formato internacional sin `+` ni espacios.
- `WHATIF_API_KEY` y `WHATIF_IMAGE_API_KEY`: opcionales; solo si se configuran proveedores externos en `/admin/what-if`.
- `HOST`/`PORT`: interfaz del servidor de desarrollo.

## Inicialización

```bash
python3 scripts/init_db.py
python3 scripts/create_admin.py --email administrador@dominio.com
python3 scripts/serve.py
```

`init_db.py` es idempotente: aplica migraciones, crea catálogos base, roles, permisos, módulos y cobertura. Si no existía usuario, genera uno temporal y lo deja en `data/bootstrap_admin.txt` con permisos `0600`.

## Producción

La aplicación expone `application` en `app.main`:

```text
app.main:application
```

Debe ejecutarse detrás de un servidor WSGI y un proxy inverso con HTTPS. Ejemplo conceptual con gunicorn (instalarlo previamente):

```bash
gunicorn --workers 2 --bind 0.0.0.0:8000 'app.main:application'
```

El proxy debe reenviar `Host`, `X-Forwarded-Proto` y servir `/static/` directamente si se desea. `BASE_URL` debe coincidir con el dominio público.

## Render (plan gratuito)

`render.yaml` define un Web Service gratuito con `gunicorn` y `healthCheckPath: /health`. El sistema de archivos de Render Free es efímero: no se usa SQLite ni `data/uploads/` como fuente de verdad.

Antes de crear el servicio:

1. Crear una base PostgreSQL externa. Supabase Free es viable: 500 MB, hasta 2 proyectos activos y pausa tras una semana de inactividad. Copiar su cadena de conexión a `DATABASE_URL`.
2. Crear en Supabase Storage un bucket privado, por defecto `otraverso`, y un rol de servicio. Copiar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` como secretos de Render.
3. Importar los datos actuales sin borrar destino:

```bash
DATABASE_URL='postgresql://...' python3 scripts/migrate_sqlite_to_postgres.py --confirm
```

4. Crear el Web Service desde `render.yaml` y completar las variables `sync:false`: `BASE_URL`, `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `WHATSAPP_DEFAULT`.
5. Tras el primer despliegue, verificar `GET /health` y cambiar la contraseña administrativa inicial.

No definir `DATABASE_PATH`, `HOST` fijo ni rutas locales en Render. No poner secretos en `render.yaml`, JavaScript ni logs. Render puede apagar servicios gratuitos por inactividad; para disponibilidad estricta 24/7 se requiere un plan de pago, que no se activa sin autorización.

## Permisos

```bash
chmod 700 data
chmod 600 data/*.db data/secret.key data/bootstrap_admin.txt 2>/dev/null || true
chmod -R u+rwX data/backups data/uploads
```

El proceso debe poder escribir en `data/`, `data/backups/` y `data/uploads/`, porque SQLite usa WAL y el panel crea copias.

## Backups

Crear copia:

```bash
python3 scripts/backup.py
```

Restaurar (crea antes un respaldo de la BD actual y valida `integrity_check`):

```bash
python3 scripts/restore.py otraverso_20261117_120000_cli.db --confirm
```

También hay copias y descarga autenticada en `/admin/backups` para usuarios con `backup.manage`. Con `DATABASE_URL`, `/admin/backups/create` genera un volcado JSON de todas las tablas; en SQLite genera un archivo `.db`.

## Actualizaciones

```bash
python3 scripts/init_db.py
python3 -m unittest discover -s tests -v
```

No editar `PRAGMA user_version` manualmente. Las columnas nuevas se agregan desde `app/db.py::_migrate()`.

## Verificación rápida

```bash
curl -i http://localhost:8000/health
curl -I http://localhost:8000/
curl -I http://localhost:8000/shop
curl -I http://localhost:8000/admin/login
```

Respuesta esperada: `200 OK`. El panel requiere inicio de sesión y las rutas sin permiso devuelven `403`.
