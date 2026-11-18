# Despliegue

## Entorno verificado

- Sistema con Python 3.12.3.
- Sin Node/npm, PostgreSQL, Docker ni gunicorn instalados.
- Dependencia opcional: Pillow para imágenes; el resto funciona con biblioteca estándar.

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
gunicorn --workers 2 --bind 127.0.0.1:8000 'app.main:application'
```

El proxy debe reenviar `Host`, `X-Forwarded-Proto` y servir `/static/` directamente si se desea. `BASE_URL` debe coincidir con el dominio público.

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

También hay copias y descarga autenticada en `/admin/backups` para usuarios con `backup.manage`.

## Actualizaciones

```bash
python3 scripts/init_db.py
python3 -m unittest discover -s tests -v
```

No editar `PRAGMA user_version` manualmente. Las columnas nuevas se agregan desde `app/db.py::_migrate()`.

## Verificación rápida

```bash
curl -I http://127.0.0.1:8000/
curl -I http://127.0.0.1:8000/shop
curl -I http://127.0.0.1:8000/admin/login
```

Respuesta esperada: `200 OK`. El panel requiere inicio de sesión y las rutas sin permiso devuelven `403`.
