# Seguridad

## Principios

- Menos privilegio: cada ruta administrativa exige un permiso explícito.
- Persistencia antes de acción externa: la solicitud WhatsApp queda registrada antes de redirigir al chat.
- Sin secreto en código: claves y credenciales se leen de entorno o `.env`.
- Datos reales: no se siembran productos ni clientes ficticios en la base de producción.

## Autenticación y sesiones

- Contraseñas hasheadas con PBKDF2-SHA256 y sal por usuario (`app/security.py`).
- Tokens de sesión aleatorios; en BD solo se guarda `token_hash`.
- Cookie `HttpOnly`, `SameSite=Lax`; en HTTPS se marca `Secure`.
- Sesiones con expiración configurable (`SESSION_HOURS`, por defecto 12 horas).
- `scripts/create_admin.py` exige contraseñas de al menos 12 caracteres.

## CSRF

- Panel: token por sesión, validado en todo `POST`.
- Formularios públicos: token firmado con `expires` y `nonce`, validado con HMAC y comparación constante.
- Las solicitudes sin token o con token manipulado devuelven `400`.

## Autorización

Roles sembrados: `superadmin`, `admin`, `product_manager`, `order_manager`. Permisos granulares por dominio, por ejemplo `products.edit`, `inventory.move`, `orders.edit`, `whatsapp.manage`, `settings.edit`, `users.manage`, `backup.manage`.

Una cuenta sin permiso recibe `403` y el intento no ejecuta la escritura.

## Validación y manejo de errores

- Escaping HTML en todas las plantillas mediante `string.Template` y `esc()`.
- Números, selects y fechas se normalizan en handlers/servicios antes de persistir.
- Imágenes: extensión y MIME permitidos, tamaño máximo `MAX_UPLOAD_MB`, verificación con Pillow, redimensionado y nombre aleatorio.
- Slugs generados con normalización básica y sufijo único cuando hace falta.
- Errores inesperados se registran en `data/errors.log` y se muestra una página genérica, sin trazas al usuario.

## Cabeceras

Todas las respuestas incluyen:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` restrictiva con imágenes HTTPS permitidas y estilos inline necesarios para la identidad visual.

## Auditoría

`audit_log` registra acciones administrativas (crear, editar, cambiar estado, convertir solicitudes, descargar copias, etc.) con usuario, entidad, identificador, detalles JSON, IP y fecha. Las visitas y eventos de negocio se guardan en `visits` y `analytics_events`.

## Base de datos y archivos

- SQLite en modo WAL.
- `data/` no debe versionarse; `.gitignore` lo excluye.
- `secret.key` y `bootstrap_admin.txt` se crean con permisos `0600`.
- Las copias se guardan en `data/backups/` y su descarga exige sesión y permiso.
- La restauración por CLI valida la ruta, `integrity_check` y crea un respaldo previo.

## Limitaciones conocidas

- No hay límite de tasa por IP en esta versión; debe aplicarse en el proxy inverso si el sitio queda público.
- No hay verificación de correo ni recuperación de contraseña.
- No hay pago en línea; WhatsApp es el canal de confirmación.
- La política de datos y condiciones se configura en `/admin/settings/commercial` y debe revisarse jurídicamente antes de producción.

## Recomendaciones operativas

1. Usar HTTPS y dominio propio desde el primer despliegue.
2. Rotar `SECRET_KEY` solo con mantenimiento programado: invalida sesiones activas.
3. Cambiar la contraseña inicial inmediatamente.
4. Respaldar antes de cualquier migración.
5. Revisar `data/errors.log` y `/admin/audit` periódicamente.
