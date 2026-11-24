# ADR 0002 — Aislamiento de renderizadores

- Estado: Aceptado
- Fecha: 2026-11-20
- Ámbito: portal, PLAY, GRAVITY y assets estáticos

## Contexto

OTRAVERSO necesita conservar la apariencia Canvas 2D de la galaxia y del hub, incorporar GRAVITY en WebGL y funcionar en equipos con GPU limitada o contexto inestable. Duplicar motores o compartir un renderer global entre universos aumentaría el riesgo de fugas, conflictos de estilo y pérdida de contexto.

## Decisión

Mantener un único renderer WebGL activo, gestionado por `OTRAVERSO.GFX`, y usarlo solo en GRAVITY:

- La galaxia, el hub y los siete minijuegos usan Canvas 2D.
- Three.js r149 se inyecta únicamente como dependencia del manifiesto de GRAVITY.
- `webgl-runtime.js` detecta `full`, `optimized` o `fallback` y registra pérdida/restauración de contexto.
- `releaseRenderer()` libera renderer, canvas y contadores antes de crear otro.
- GRAVITY conserva un fallback Canvas 2D jugable.
- No se introducen Babylon.js, npm ni motores adicionales.

## Consecuencias

- La portada carga rápido y no descarga Three.js.
- Los modos optimizado/fallback protegen equipos con llvmpipe, SwiftShader, poca memoria o `prefers-reduced-motion`.
- El estado gráfico se expone en `data-gfx-mode` y puede verificarse desde automatización.
- Cualquier nuevo juego 3D debe reutilizar `OTRAVERSO.GFX`; no puede crear su propio renderer paralelo.
