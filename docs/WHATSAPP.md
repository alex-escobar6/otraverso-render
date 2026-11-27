# WhatsApp en OTRAVERSO

## Estado implementado

OTRAVERSO no envía mensajes automáticamente. El flujo real es:

1. La configurable `whatsapp.enabled = 1` habilita los botones públicos.
2. El número se toma de `commercial.whatsapp` (o `WHATSAPP_DEFAULT`) y se normaliza antes de construir el enlace.
3. Los enlaces usan `https://wa.me/<número>?text=<mensaje>`.
4. Antes de abrir el chat se registra un clic en `whatsapp_clicks` con `public_id`, origen, producto, mensaje, URL, ruta, `user_agent` y `trace_id`.
5. En la ficha de producto se crea además `purchase_requests` con cliente, cantidad, zona, mensaje y URL.
6. Abrir el chat **no** crea ni confirma una venta. La solicitud se convierte a pedido solo desde `/admin/requests`.

## Plantillas

El orden de resolución del mensaje de producto es:

1. `products.whatsapp_message` si el producto tiene mensaje propio.
2. Plantilla activa de `whatsapp_templates` para la modalidad (`stock`, `order` o `any`).
3. `whatsapp.product_message` o `whatsapp.order_message` de `settings`.

Variables disponibles: `{product}`, `{price}`, `{modality}`, `{delivery}`, `{short_delivery}`, `{quantity}` y `{name}`.

En `/admin/settings/whatsapp` se puede desactivar WhatsApp, editar los mensajes generales, normalizar el número y activar o desactivar plantillas adicionales.

## Configuración comercial

En `/admin/settings/commercial` se configuran:

- `whatsapp`: número en formato internacional sin `+`, por ejemplo `573001234567`.
- `payment_methods`: métodos de pago informativos; no procesa pagos.
- `sale_disclaimer`: aviso mostrado en la ficha de producto.

## Cloud API (guía operativa, no integrada)

Para migrar algún día de enlaces `wa.me` a WhatsApp Cloud API se requiere, como mínimo:

- Meta Business Manager verificado y un número de teléfono business.
- `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` y un token con permisos de mensajería, almacenados como secretos del servidor.
- Webhook con verificación y firma `X-Hub-Signature-256` antes de aceptar eventos.
- Consentimiento explícito del cliente y política de opt-out.
- Control de plantillas aprobadas por Meta y ventanas de mensajería.
- Reintentos, idempotencia por `wa_message_id`, límites de tasa y auditoría de entregas.

Esta sección documenta requisitos; el código actual **no** envía mensajes, no consulta el estado de entrega y no expone tokens.
