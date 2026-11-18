# Fases de OTRAVERSO

  Estado actual: **Fases 1 a 7 completadas**. SHOP funcional y PLAY con NEXUS RUSH disponible.

| Fase | Objetivo | Resultado |
| --- | --- | --- |
| 1 | Descubrimiento y base de datos | Estructura `/home/sistemas/otraverso`, esquema SQLite con 35 tablas, semilla de roles/permisos/módulos/settings/cobertura y esquema versionado. |
| 2 | Núcleo y portal | WSGI propio, sesiones, CSRF, render, portada OTRAVERSO y universos planeados. |
| 3 | SHOP y servicios | Catálogo, ficha, categorías, búsqueda, cobertura, SEO global e individual, WhatsApp persistente, inventario, pedidos y analítica. |
| 4 | Panel administrativo | 90 rutas con RBAC para productos, inventario, pedidos, solicitudes, clientes, marketing, cobertura, configuración, analítica, usuarios, auditoría y backups. |
| 5 | Pruebas | 11 pruebas de integración sobre BD temporal: esquema, portal, tienda, CSRF, RBAC, CRUD, stock, pedidos, WhatsApp, conversión y render de todas las páginas admin. |
| 6 | Entrega | README, documentación, `.env.example`, `.gitignore`, scripts de backup/restore/create_admin y verificación final. |
| 7 | Universo 3D y PLAY | Hub dimensional con portales, transiciones 3D, SHOP conectado, PLAY y NEXUS RUSH con tres circuitos, audio procedural, récord local, calidad adaptativa y fallback. |

## Criterios cumplidos

- Identidad OTRAVERSO propia, sin reutilizar CENTINELA.
- SHOP diferenciado de universos futuros, sin datos simulados en la BD real.
- Inventario real para `stock` y flujo explícito para `order`.
- Solicitudes WhatsApp auditables antes de abrir el chat; ninguna venta se marca automáticamente.
- Panel con permisos por acción y bitácora.
- Sin dependencias de Node, npm, PostgreSQL o Docker.
- Documentación y comandos reproducibles.

## Fuera de alcance de esta entrega

- Pasarelas de pago o checkout automático.
- Funcionalidades reales de WHAT IF y LABS (PLAY ya tiene NEXUS RUSH).
- Autenticación pública de clientes o áreas de usuario.
- Notificaciones automáticas hacia WhatsApp; el envío lo ejecuta el vendedor desde el chat generado.
- Despliegue con gunicorn/nginx incluido como servicio del sistema; se documenta la integración, pero no se instalaron esos paquetes porque no están disponibles en el entorno.

## Seguimiento sugerido

1. Configurar `.env` de producción con `SECRET_KEY`, `BASE_URL` y `WHATSAPP_DEFAULT` reales.
2. Cambiar la contraseña temporal generada en `data/bootstrap_admin.txt`.
3. Cargar productos reales y verificar tarifas/plazos de entrega.
4. Programar copias periódicas con `scripts/backup.py`.
5. Habilitar HTTPS en el proxy inverso.
