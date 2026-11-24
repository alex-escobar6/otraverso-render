# ADR 0001 — Contrato de navegación del multiverso

- Estado: Aceptado
- Fecha: 2026-11-20
- Ámbito: portal, PLAY y automatización

## Contexto

La narrativa de producto describe el recorrido `OTRAVERSO → UNIVERSO → PLANETA/MUNDO → EXPERIENCIA`. El runtime real, sin embargo, tiene dos máquinas separadas: la galaxia expone `multiverse`, `universe` y `explore`, mientras PLAY expone `hub`, `play` y `game`. Los niveles `world` y `game` son conceptuales y se materializan como rutas HTTP y escenas internas de PLAY.

## Decisión

Mantener dos runtime aislados y documentar el contrato real:

- `OTRAVERSO.GALAXY_NAV` expone únicamente `multiverse`, `universe` y `explore`, con `getState`, `focus`, `explore`, `exit` y `back`.
- `OTRAVERSO.setScene` expone `hub`, `play` y `game` dentro de PLAY.
- `world` y `game` no se añadirán como estados falsos de la galaxia.
- El paso de la galaxia a SHOP o PLAY usa navegación completa tras el warp.
- El retorno de una pantalla de juego a `/play` usa `history.pushState` y no recarga PLAY.
- La salida de PLAY a la portada usa navegación completa para preservar el aislamiento de runtimes.
- Ambos runtimes publican `OTRAVERSO.NAVIGATION` con `contract='navigation-1'`, `event='otraverso:navigation'`, `states` y `getState()`.
- Los cambios de estado emiten `otraverso:navigation` con `detail.runtime`, `detail.contract`, `detail.state`, `detail.previous` y contexto adicional. `otraverso:scene` se conserva como evento interno de PLAY por compatibilidad.

### Matriz de transiciones

| Origen | Destino | Mecanismo | Efecto en la API |
| --- | --- | --- | --- |
| `galaxy:multiverse` | `galaxy:universe` | `GALAXY_NAV.focus(id)` | `state='universe'`, `focusId=id` |
| `galaxy:universe` | `galaxy:explore` | `GALAXY_NAV.explore(id)` | `state='explore'`, `focusId=id` |
| `galaxy:explore` | `galaxy:universe` | `GALAXY_NAV.exit()` | `state='universe'`, foco restaurado |
| `galaxy:universe` | `galaxy:multiverse` | `GALAXY_NAV.back()` | `state='multiverse'`, sin foco |
| Galaxia | SHOP/PLAY | warp + navegación completa | selección `data-world-route`, salida del runtime |
| `play:hub` | `play:play` | `goPlay()` | `state='play'` sin recarga |
| `play:play` | `play:game` | `startGame()`/`startCircuit()` + `pushState` | `state='game'`, `game` y `circuit` |
| `play:game` | `play:play` | `REGRESAR A PLAY` + `pushState` | `state='play'`, juego descargado |
| `play:*` | `hub` | `goHub()` + navegación completa | salida del runtime PLAY |

## Consecuencias

- La documentación y las pruebas deben referirse al contrato real, no a una máquina única idealizada.
- Las automatizaciones deben consultar `GALAXY_NAV.getState()` para la galaxia y `OTRAVERSO.scene()` para PLAY.
- No se mezclan Canvas 2D, WebGL y estilos entre universos.
- Si en el futuro se requiere una SPA global, debe hacerse como una decisión nueva y con una migración explícita.
