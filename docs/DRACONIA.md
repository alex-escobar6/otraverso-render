# DRACONIA — compañero 3D privado

DRACONIA es ahora un espacio privado y pequeño dentro de OTRAVERSO. No es un reino explorable ni un juego de aventuras: es un jardín mágico donde Paula puede estar con un dragón 3D, acariciarlo, llamarlo, jugar, sentarse, dormir o verlo volar.

## Concepto actual

- Escena única: `/draconia`.
- Acceso privado con la sesión, el CSRF y el RBAC de OTRAVERSO.
- Permisos: `draconia.view` para entrar y `draconia.manage` para administrar.
- Rol: `draconia_explorer`.
- Persistencia mínima: nombre del dragón, sonido, movimiento reducido y último estado.
- Sin niveles, experiencia, monedas, inventario, misiones, calendarios, cartas, recuerdos ni sistemas de progreso.

Lo que se eliminó del concepto anterior:

- Territorios, mapa, castillos explorables, exploración, descubrimientos y lugares.
- Cartas, recuerdos, fechas, sorpresas, mensajes del Guardián y álbum.
- Diario, vínculo, etapas del dragón, recompensas y desbloqueos.
- Panel administrativo de contenido narrativo y carga privada de imágenes.
- Portal, reino y vistas secundarias.

Lo que se conservó:

- La marca DRACONIA y la ruta privada `/draconia`.
- El acceso con contraseña propia mediante `scripts/create_draconia_user.py`.
- El panel administrativo `/admin/draconia`, reducido a preferencias iniciales y resumen de compañeros.
- Los recursos compartidos de OTRAVERSO: sesión, CSRF, RBAC, render, base de datos, `three.min.js` y `webgl-runtime.js`.
- La base de datos real intacta. Las tablas `draconia_*` y columnas antiguas que ya existían quedan como datos heredados inactivos; no se eliminan ni se migran de forma destructiva.

## Modelo y procedencia

- Modelo: `app/static/draconia/1.0.0/assets/dragon_organic/dragon.glb`, un GLB 3D estático generado desde cero con Blender 4.0.2.
- Fuente editable: `app/static/draconia/1.0.0/assets/dragon_organic/dragon.blend`.
- Vistas previas: `preview_front.png`, `preview_side.png` y `preview_back.png` en la misma carpeta.
- Mapas PBR: `scales_base.png`, `scales_normal.png` y `scales_roughness.png` en la misma carpeta.
- Origen: trabajo original para DRACONIA; no se reutilizó ningún modelo, textura, rig ni animación de terceros.
- Construcción: superficies orgánicas loftadas y parches de membrana ensamblados en una malla continua; no se usaron esferas, conos, cilindros, cápsulas ni otros operadores de primitivas para el cuerpo.
- Anatomía incluida: cráneo, hocico alargado, mandíbula, fosas nasales, ojos violetas, cuernos, torso con volumen, cuello, cuatro patas articuladas, dedos, garras, cola larga, espinas dorsales y dos alas con membranas plegadas.
- Contenido del GLB: geometría, normales, UV, 7 materiales PBR y 3 texturas incrustadas; `0` animaciones, `0` skins y `0` morph targets.
- Motor: Three.js r149 vendored en `/static/js/vendor/three.min.js`; loader UMD de Three r137.5 vendored en `/static/js/vendor/GLTFLoader.js`.
- No hay recursos remotos en tiempo de ejecución: GLB, texturas, loader y motor se sirven desde el propio proyecto; no se usa API de IA.
- Materiales del dragón convertidos a `MeshPhysicalMaterial` con `clearcoat` sutil; luces hemisféricas, direccionales y de relleno.
- Escenario: cielo pastel con shader, isla flotante, estanque animado, cristales, fuente, árboles, flores, piedras, musgo, luciérnagas, chispas y esfera mágica, sin cambios de diseño.
- Cámara orbital propia con inercia suave, arrastre, rueda, pellizco, doble clic y flechas; sin `OrbitControls` externo.
- Limitación: las capturas se generaron, pero este modelo no puede inspeccionarlas visualmente; la validación es programática y la aprobación estética requiere revisión humana.

## Configuración centralizada del asset

Toda la integración del modelo se controla desde `app/static/draconia/1.0.0/assets/dragon.config.json`:

- `path`: GLB servido localmente, relativo a `/static/draconia/1.0.0/`.
- `static`: cuando es `true`, el cargador no crea `AnimationMixer`, no registra clips y no aplica poses por huesos.
- `transform.scale`, `transform.position` y `transform.rotation`: escala, posición y rotación en radianes; el motor los normaliza antes de aplicarlos.
- `initialClip`, `fallbackClip`, `clips`, `clipSpeeds` y `eyeMaterial`: vacíos en esta etapa porque el modelo es estático.
- `shadow`: sombras, recepción de sombras y `frustumCulled`.
- `materials`: parámetros por nombre de material (`Scales_Pearl`, `Horn_Crystal`, `Membrane_Violet`, `Claw_Pearl`, `Eye_Violet`, `Pupil_Dark`, `Nostril_Dark`).

`app/modules/draconia/pages.py` lee ese único archivo y lo incluye en `assets.model` del payload; `app/static/draconia/1.0.0/draconia.js` lo normaliza y `app/static/draconia/1.0.0/world.js` usa la ruta y la transformación desde la configuración, sin rutas ni paleta del dragón hardcoded. Los GLB anteriores quedan como archivos inactivos no referenciados; no se borraron datos compartidos ni recursos del entorno.

## Animaciones

- Esta etapa no incluye animaciones, rigging, esqueleto, comportamientos ni interacciones del dragón.
- El GLB no contiene clips, skins ni morph targets; el cargador estático no crea un `AnimationMixer`.
- La UI existente sigue cargando, pero no mueve al dragón: los botones no cambian su pose ni su posición.

Máquina de estados heredada: `idle`, `curious`, `happy`, `playing`, `walking`, `running`, `resting`, `sleeping`, `flying`, `interacting`. Las transiciones siguen validándose en `app/services/draconia/profile.py`, pero no producen movimiento del modelo estático.

## Interacciones

- Tocar u hacer clic en el dragón: caricia; el hover cambia el cursor.
- Arrastrar: girar la cámara con límites de ángulo.
- Rueda o pellizco: zoom controlado entre 4.2 y 11 unidades.
- Botones reales: Acariciar, Llamar, Jugar, Sentarse, Dormir, Volar, Centrar, Movimiento y Sonido.
- El último estado se restaura al recargar la página, respetando las transiciones válidas.
- Nombre editable desde la escena; se guarda en el perfil privado.
- Sonido generado con WebAudio, sin archivos de audio externos; solo comienza después de una interacción del usuario.
- Movimiento reducido: suaviza animaciones y desactiva el comportamiento autónomo.

## Archivos principales

- `app/modules/draconia/__init__.py`: rutas privadas.
- `app/modules/draconia/pages.py`: login, logout y escena.
- `app/modules/draconia/api.py`: estado, nombre y preferencias.
- `app/services/draconia/profile.py`: perfil, estados, animaciones y transiciones.
- `app/modules/admin/draconia.py`: panel administrativo mínimo.
- `app/templates/draconia/base.html`: carga privada de CSS, Three.js, GLTFLoader, runtime WebGL y scripts.
- `app/templates/draconia/shell.html`: escena, controles y configuración.
- `app/static/draconia/1.0.0/world.js`: carga del GLB, mixer, poses por huesos, escenario, cámara y fallback.
- `app/static/draconia/1.0.0/assets/dragon.glb`: dragón 3D riggado y animado, modificado para DRACONIA.
- `app/static/draconia/1.0.0/assets/dragon.config.json`: única fuente de ruta, transformación, clips, materiales y sombras del modelo.
- `app/static/draconia/1.0.0/assets/LICENSE-DRAGON.txt`: procedencia, licencia y cambios.
- `app/static/js/vendor/GLTFLoader.js`: loader GLB servido localmente.
- `app/static/draconia/1.0.0/draconia.js`: UI, API, sonido y preferencias.
- `app/static/draconia/1.0.0/draconia.css`: interfaz responsive y táctil.
- `tests/test_zz_draconia.py`: pruebas del nuevo alcance.

Se retiraron `portal-gate.svg`, `dragon-companion.svg`, `app/services/draconia/state.py` y `app/services/draconia/assets.py`.

## Datos y administración

- `draconia_profiles`: `user_id`, `dragon_name`, `sound`, `reduced_motion`, `last_state` y timestamps.
- Ajustes iniciales en `settings(category='draconia')`: `protagonist_name`, `companion_default_name`, `sound_default` y `reduced_motion_default`.
- `/admin/draconia` permite cambiar el nombre inicial, el sonido y el movimiento reducido para nuevos perfiles, y muestra los compañeros existentes.
- No se modifica SHOP, PLAY, WHAT IF ni ningún otro universo.

## Fallback y Compatibilidad

- Si WebGL no está disponible o el contexto se pierde de forma permanente, se muestra una vista Canvas 2D animada heredada con interacciones básicas. Es una degradación controlada, no la experiencia principal ni sustituto del modelo GLB.
- Si el contexto WebGL se recupera, la escena 3D se reconstruye automáticamente.
- La escena usa `ResizeObserver`, `pointer events`, `wheel`, `AudioContext` y `fetch`, todos sin dependencias externas.
- Los errores de la API DRACONIA se devuelven como JSON, incluidos CSRF y validación; nunca como página HTML.
- La interfaz se adapta a móvil: escena arriba, controles abajo, botones de al menos 46 px y gestos táctiles.
- Los estilos de movimiento reducido y del sistema `prefers-reduced-motion` se respetan.

## Pruebas y verificación

Comandos usados:

```bash
python3 -m compileall -q app scripts tests
python3 -m unittest discover -s tests -v
```

La suite debe pasar completa. Las pruebas DRACONIA verifican:

- Esquema mínimo y permisos.
- Acceso anónimo, sin permiso y autorizado.
- Ruta única y ausencia de las rutas del reino anterior.
- Login privado.
- API de perfil, nombre, preferencias y estado.
- Panel administrativo.
- Presencia del GLB riggado, loader, mixer, animaciones, cámara y controles en el cliente.
- Configuración centralizada `dragon.config.json` y payload `assets.model` con ruta, transformación, clips y materiales.
- Ausencia de las primitivas del dragón anterior y de la paleta/ruta hardcoded en `world.js`.
- Payload versión 4 con transiciones, último estado, capacidades y ruta del GLB.
- Transiciones inválidas en la API vuelven a `idle`; errores API en JSON.
- Ausencia de recursos 2D y servicios antiguos.

También se verificó en Chrome headless con WebGL2 por SwiftShader: canvas activo, GLB cargado (`DRACONIA_DEBUG.model=assets/dragon.glb`, `Ice Dragon`, 8 mallas), `assets.model` presente en el payload con ruta/transformación/clips/materiales, mixer activo (`Idle`, `Walk`, `Fly` según el botón), `DRACONIA_DEBUG.ready`, carga oculta, sin errores de consola/red, interacciones reales, avance de frames y sin desbordamiento horizontal a 390 px. Las capturas de escritorio y móvil se guardaron en `/tmp/opencode/draconia-desktop.png` y `/tmp/opencode/draconia-mobile.png`; la validación es programática y no constituye revisión visual humana ni comparación con un adjunto no disponible.

## Acceso local

```bash
python3 scripts/create_draconia_user.py --email TU@CORREO.com --name Paula
```

La contraseña se guarda en `data/draconia_credentials_XXXXXXXX.txt` con permisos `0600`. Después:

```text
http://127.0.0.1:8000/draconia/entrar
```

No se desplegó ni se modificó Render, producción ni ningún entorno remoto.
