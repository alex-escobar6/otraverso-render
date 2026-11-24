# Fases de OTRAVERSO

  Estado actual: **Fases 1 a 14 completadas**. SHOP funcional, PLAY con hub vivo, PLAY ID, siete minijuegos, NEXUS RUSH y GRAVITY con runtime WebGL/fallback, galaxia Canvas 2D evolucionada, WHAT IF funcional e identidad visual minimalista.

| Fase | Objetivo | Resultado |
| --- | --- | --- |
| 1 | Descubrimiento y base de datos | Estructura `/home/sistemas/otraverso`, esquema SQLite con 38 tablas y 9 índices, semilla de roles/permisos/módulos/settings/cobertura y esquema versionado. |
| 2 | Núcleo y portal | WSGI propio, sesiones, CSRF, render, portada OTRAVERSO y universos planeados. |
| 3 | SHOP y servicios | Catálogo, ficha, categorías, búsqueda, cobertura, SEO global e individual, WhatsApp persistente, inventario, pedidos y analítica. |
| 4 | Panel administrativo | 70 rutas administrativas con RBAC para productos, inventario, pedidos, solicitudes, clientes, marketing, cobertura, configuración, analítica, usuarios, auditoría y backups. |
| 5 | Pruebas | 27 pruebas de integración sobre BD temporal: esquema, portal, tienda, CSRF, RBAC, CRUD, stock, pedidos, WhatsApp, conversión, render admin, galaxia, PLAY, catálogo, progreso y navegación. |
| 6 | Entrega | README, documentación, `.env.example`, `.gitignore`, scripts de backup/restore/create_admin y verificación final. |
| 7 | Universo 3D y PLAY | Hub dimensional con portales, transiciones 3D, SHOP conectado, PLAY y NEXUS RUSH con tres circuitos, audio procedural, récord local, calidad adaptativa y fallback. |
| 8 | Optimización profunda | Diagnóstico del bloqueo por servidor obsoleto, hub rediseñado con SVG/CSS 3D sin WebGL, juego migrado a Canvas 2D con carga diferida, loader no bloqueante, timeout/reintento y verificación de rendimiento. |
| 9 | Restauración de la galaxia WebGL | Recuperación selectiva desde `f97502a`, viaje cinematográfico a SHOP, fallback CSS, apagado seguro del loader y PLAY aislado. Estado conservado en `backup/webgl-galaxy-20261118`. |
| 10 | Restauración de la galaxia pre-Git | Recuperación selectiva desde el historial local de OpenCode del 17-nov: Canvas 2D, planetas en órbita, nebulosas, tarjetas de universos y viaje a SHOP de 900 ms sin loader. |
| 11 | Plataforma PLAY y GRAVITY | Contrato común de juegos, catálogo/manifiestos, carga diferida con dependencias, GRAVITY 3D con física primitiva, tres sectores, HUD, pausa, récord local y limpieza de runtime. |
| 12 | Hub, PLAY ID y minijuegos | Entrada cinematográfica al agujero negro, hub Canvas 2D con `EXPLORAR UNIVERSO`, PLAY ID con progreso/logros/coleccionables, siete minijuegos publicados, perfil y navegación SPA sin recargas. |
| 13 | WebGL seguro y mundo vivo | Runtime `OTRAVERSO.GFX` con detección de renderizador, modos `full`/`optimized`/`fallback`, renderer WebGL único con liberación y recuperación de contexto; GRAVITY con fallback Canvas 2D jugable; galaxia y hub rediseñados como mundo monumental con eventos ambientales, exploración y logotipo minimalista. |
| 14 | OTRAVERSO WHAT IF | Esquema `user_version=4`, motor narrativo local y proveedor HTTP opcional, creación guiada, biblioteca privada, sala narrativa con capítulos y memoria, intervenciones con propuesta previa, ramas, comparación, versiones, recursos visuales, studio, integración en galaxia/nav/portal, panel `/admin/what-if`, 33 pruebas y documentación específica. |

## Criterios cumplidos

- Identidad OTRAVERSO propia, sin reutilizar CENTINELA.
- SHOP diferenciado de universos futuros, sin datos simulados en la BD real.
- Inventario real para `stock` y flujo explícito para `order`.
- Solicitudes WhatsApp auditables antes de abrir el chat; ninguna venta se marca automáticamente.
- Panel con permisos por acción y bitácora.
- Sin dependencias de Node, npm, PostgreSQL o Docker.
- PLAY mantiene SHOP y la galaxia aislados; la navegación externa usa warp sin mezclar runtimes.
- Esquema `user_version=4`: conserva progreso de PLAY y añade realidades, capítulos, memoria, intervenciones, versiones y recursos de WHAT IF.
- WebGL se inicializa una sola vez y se libera al salir; los modos optimizado y 2D son compatibles con GPU/llvmpipe sin reemplazar todos los juegos.
- La identidad visual usa un símbolo de órbita abierta y núcleo, sin copiar otras marcas; SHOP y las APIs PLAY no cambiaron.
- WHAT IF no publica catálogo ficticio: explora solo realidades propias y usa SVG esquemáticos locales cuando no hay proveedor de imágenes.
- Documentación y comandos reproducibles.

## Fuera de alcance de esta entrega

- Pasarelas de pago o checkout automático.
- Funcionalidades reales de LABS (WHAT IF ya tiene universo funcional; PLAY tiene hub, nueve juegos y PLAY ID).
- Autenticación pública de clientes o áreas de usuario.
- Notificaciones automáticas hacia WhatsApp; el envío lo ejecuta el vendedor desde el chat generado.
- Despliegue con gunicorn/nginx incluido como servicio del sistema; se documenta la integración, pero no se instalaron esos paquetes porque no están disponibles en el entorno.

## Seguimiento sugerido

1. Configurar `.env` de producción con `SECRET_KEY`, `BASE_URL` y `WHATSAPP_DEFAULT` reales.
2. Cambiar la contraseña temporal generada en `data/bootstrap_admin.txt`.
3. Cargar productos reales y verificar tarifas/plazos de entrega.
4. Programar copias periódicas con `scripts/backup.py`.
5. Habilitar HTTPS en el proxy inverso.
