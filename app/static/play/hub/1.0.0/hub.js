(function (global) {
  'use strict';

  var O = global.OTRAVERSO || (global.OTRAVERSO = {});
  var doc = global.document;
  var TAU = Math.PI * 2;
  var GOLDEN = 2.39996323;
  var DPR_MAX = 1.5;
  var MODE_HUB = 'hub';
  var MODE_EXPLORE = 'explore';
  var CENTER = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, zoom: 1 };
  var SPAWN = { x: 0, y: 0, z: -40, yaw: 0, pitch: 0, zoom: 1 };
  var SECTORS = ['ORIGEN', 'VÉRTICE', 'MAREAS', 'CENIZA', 'AURORA', 'ESPEJO', 'ABISMO', 'ECHO', 'BRÚJULA', 'SIMIENTE', 'FARO', 'ÓRBITA'];
  var KINDS = ['tower', 'arch', 'platform', 'spire', 'gateway', 'observatory'];
  var EVENTS = [
    { id: 'drone-parade', label: 'DESFILE DE DRONES', detail: 'Un enjambre cruza el anillo', min: 11000, max: 18000, duration: 4600, probability: 0.85, priority: 2, tier: 'low' },
    { id: 'tower-flare', label: 'DESTELLO EN TORRE', detail: 'Una estación libera energía', min: 8000, max: 15000, duration: 2800, probability: 0.8, priority: 1, tier: 'high' },
    { id: 'creature-crossing', label: 'CRIATURA LUMÍNICA', detail: 'Algo grande atraviesa la atmósfera', min: 14000, max: 24000, duration: 6200, probability: 0.7, priority: 3, tier: 'low' },
    { id: 'industrial-signal', label: 'SEÑAL INDUSTRIAL', detail: 'Código heredado desde la plataforma', min: 10000, max: 19000, duration: 3600, probability: 0.75, priority: 1, tier: 'high' },
    { id: 'power-fault', label: 'FALLO DE LUZ', detail: 'Un sector parpadea y se restablece', min: 16000, max: 28000, duration: 2400, probability: 0.55, priority: 2, tier: 'low' },
    { id: 'gate-open', label: 'PUERTA ABIERTA', detail: 'La compuerta del núcleo se despliega', min: 15000, max: 26000, duration: 5200, probability: 0.65, priority: 3, tier: 'high' },
    { id: 'crowd-surge', label: 'MULTITUD EN TRÁNSITO', detail: 'Las pasarelas se llenan de señales', min: 13000, max: 22000, duration: 5000, probability: 0.7, priority: 1, tier: 'low' }
  ];

  var S = {
    mounted: false,
    mode: MODE_HUB,
    ctx: null,
    host: null,
    hub: null,
    universeRoot: null,
    refs: {},
    canvas: null,
    ctx2d: null,
    dpr: 1,
    width: 0,
    height: 0,
    raf: 0,
    last: 0,
    time: 0,
    hidden: false,
    reduced: false,
    lowPower: false,
    tier: 'high',
    motionQuery: null,
    motionMode: '',
    resizeObserver: null,
    listeners: [],
    timers: [],
    games: [],
    zones: [],
    zoneAngle: 0,
    selected: null,
    stars: [],
    nebulae: [],
    dust: [],
    creatures: [],
    objects: [],
    screenObjects: [],
    landMarks: [],
    events: [],
    eventNext: {},
    eventTimers: [],
    scheduleTimer: 0,
    cam: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, zoom: 1 },
    tween: null,
    keys: {},
    touch: { joyX: 0, joyY: 0 },
    joyDrag: null,
    lookDrag: null,
    pointer: { inside: false, x: 0, y: 0 },
    discoveries: {},
    helpOpen: false
  };

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, amount) { return a + (b - a) * amount; }
  function ease(value) { return 1 - Math.pow(1 - clamp(value, 0, 1), 3); }
  function isFn(value) { return typeof value === 'function'; }
  function isArr(value) { return Object.prototype.toString.call(value) === '[object Array]'; }
  function round3(value) { return Math.round(value * 1000) / 1000; }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function safe(fn, args) {
    if (!isFn(fn)) return undefined;
    try { return fn.apply(null, args || []); } catch (error) { return undefined; }
  }
  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
  function hashString(text) {
    var value = 2166136261;
    var i;
    for (i = 0; i < text.length; i++) {
      value ^= text.charCodeAt(i);
      value = (value * 16777619) >>> 0;
    }
    return value >>> 0;
  }
  function hexColor(value, fallback) {
    var text = String(value || '').replace(/^\s+|\s+$/g, '');
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text) ? text : fallback;
  }
  function rgba(hex, alpha) {
    var text = hexColor(hex, '#67e8f9').slice(1);
    var value;
    if (text.length === 3) text = text.charAt(0) + text.charAt(0) + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2);
    if (text.length === 8) text = text.slice(0, 6);
    value = parseInt(text, 16);
    if (isNaN(value)) value = 6771193;
    return 'rgba(' + ((value >> 16) & 255) + ',' + ((value >> 8) & 255) + ',' + (value & 255) + ',' + clamp(alpha, 0, 1).toFixed(3) + ')';
  }
  function radial(c, x, y, r, stops) {
    var gradient;
    var i;
    if (!c || !(r > 0) || !isArr(stops)) return null;
    try {
      gradient = c.createRadialGradient(x, y, 0, x, y, r);
      for (i = 0; i < stops.length; i++) gradient.addColorStop(stops[i][0], stops[i][1]);
      return gradient;
    } catch (error) { return null; }
  }
  function linear(c, x0, y0, x1, y1, stops) {
    var gradient;
    var i;
    if (!c || !isArr(stops)) return null;
    try {
      gradient = c.createLinearGradient(x0, y0, x1, y1);
      for (i = 0; i < stops.length; i++) gradient.addColorStop(stops[i][0], stops[i][1]);
      return gradient;
    } catch (error) { return null; }
  }
  function circle(c, x, y, r) {
    if (!c || !(r > 0)) return;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
  }
  function ellipsePath(c, x, y, rx, ry) {
    if (!c || !(rx > 0) || !(ry > 0)) return;
    c.save();
    c.translate(x, y);
    c.scale(1, ry / rx);
    c.beginPath();
    c.arc(0, 0, rx, 0, TAU);
    c.restore();
  }
  function polygon(c, x, y, r, sides, rotation) {
    var i;
    var angle;
    if (!c || !(r > 0)) return;
    c.beginPath();
    for (i = 0; i < sides; i++) {
      angle = rotation + i * TAU / sides;
      if (i === 0) c.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
      else c.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    }
    c.closePath();
  }
  function stopEvent(event) {
    if (!event) return;
    if (isFn(event.preventDefault)) event.preventDefault();
    if (isFn(event.stopPropagation)) event.stopPropagation();
  }

  function q(selector, base) {
    return (base || S.hub || doc).querySelector(selector);
  }

  function on(target, type, fn, options) {
    if (!target || !isFn(fn) || !isFn(target.addEventListener)) return;
    target.addEventListener(type, fn, options);
    S.listeners.push({ target: target, type: type, fn: fn, options: options });
  }

  function offAll() {
    S.listeners.forEach(function (item) {
      if (item.target && isFn(item.target.removeEventListener)) {
        item.target.removeEventListener(item.type, item.fn, item.options);
      }
    });
    S.listeners = [];
  }

  function later(fn, delay) {
    if (!isFn(global.setTimeout)) return 0;
    var id = global.setTimeout(fn, Math.max(0, delay || 0));
    S.timers.push(id);
    return id;
  }

  function laterEvent(fn, delay) {
    var id = later(fn, delay);
    if (id) S.eventTimers.push(id);
    return id;
  }

  function clearTimers(list) {
    if (!isArr(list) || !isFn(global.clearTimeout)) return;
    list.forEach(function (id) { global.clearTimeout(id); });
  }

  function seedWorld() {
    var random = rng(19740419);
    var i;
    S.stars = [];
    for (i = 0; i < 210; i++) {
      S.stars.push({ x: random(), y: random(), r: 0.3 + random() * 1.4, a: 0.16 + random() * 0.7, p: random() * TAU, z: 0.3 + random() * 0.7 });
    }
    S.nebulae = [];
    for (i = 0; i < 8; i++) {
      S.nebulae.push({
        x: random(), y: random(), r: 0.14 + random() * 0.22,
        hue: ['244,114,182', '139,92,246', '103,232,249', '251,191,36'][i % 4],
        p: random() * TAU
      });
    }
    S.dust = [];
    for (i = 0; i < 54; i++) {
      S.dust.push({ a: random() * TAU, r: random(), s: (0.07 + random() * 0.3) * (random() > 0.5 ? 1 : -1), z: 0.5 + random() * 0.5 });
    }
    S.creatures = [];
    for (i = 0; i < 4; i++) {
      S.creatures.push({ a: random() * TAU, r: 0.22 + random() * 0.26, s: (0.05 + random() * 0.09) * (i % 2 ? 1 : -1), y: (random() - 0.5) * 0.3, p: random() * TAU, hue: ['103,232,249', '244,114,182', '251,191,36'][i % 3] });
    }
    var defs = [
      { id: 'nucleo-otraverso', name: 'NÚCLEO OTRAVERSO', type: 'core', note: 'El reactor que sostiene cada plataforma, cada pasarela y cada mundo pendiente de jugar.' },
      { id: 'nod-aurora', name: 'NODO AURORA', type: 'planet', note: 'Una esfera de océanos colgantes iluminada por auroras que se leen como mapas.' },
      { id: 'nod-ceniza', name: 'NODO CENIZA', type: 'planet', note: 'Sus continentes son restos de una civilización que aprendió a dormir bajo la ceniza.' },
      { id: 'nod-espejo', name: 'NODO ESPEJO', type: 'planet', note: 'Cada fachada refleja una versión distinta del mismo cielo.' },
      { id: 'nod-marea', name: 'NODO MAREA', type: 'planet', note: 'Dos lunas sostienen un océano que nunca toca el suelo.' },
      { id: 'nube-violeta', name: 'CÚMULO VIOLETA', type: 'nebula', note: 'Una nube de polvo donde nacen estrellas que brillan en silencio.' },
      { id: 'nube-coral', name: 'CÚMULO CORAL', type: 'nebula', note: 'Filamentos rosados que se expanden como un latido muy lento.' },
      { id: 'nube-cian', name: 'CÚMULO CIAN', type: 'nebula', note: 'El gas más frío del universo conocido guarda señales muy antiguas.' },
      { id: 'nube-dorada', name: 'CÚMULO DORADO', type: 'nebula', note: 'Una guardería de estrellas enormes, brillantes y fugaces.' },
      { id: 'eco-fase', name: 'ECO DE FASE', type: 'anomaly', note: 'Aquí el espacio cambia de fase antes de que el ojo lo note.' },
      { id: 'eco-nodo', name: 'ECO NODO', type: 'anomaly', note: 'Un nudo de caminos que conecta lugares que nunca debieron tocarse.' },
      { id: 'eco-silencio', name: 'ECO SILENCIO', type: 'anomaly', note: 'El ruido desaparece por completo. Hasta el pensamiento se vuelve lejano.' },
      { id: 'arco-memoria', name: 'ARCO DE MEMORIA', type: 'ruin', note: 'Un arco inmenso construido para mirar el núcleo sin quedar atrapado en él.' },
      { id: 'obsolescente', name: 'OBSERVATORIO VIEJO', type: 'ruin', note: 'Sus lentes siguen apuntando a una estrella que ya no existe.' },
      { id: 'pasarela-rota', name: 'PASARELA ROTA', type: 'ruin', note: 'Une dos órbitas separadas por trescientos años de diferencia.' },
      { id: 'jardin-petrificado', name: 'JARDÍN PETRIFICADO', type: 'ruin', note: 'Plantas petrificadas que todavía giran hacia una luz ausente.' },
      { id: 'portal-nexo', name: 'COMPUERTA NEXO', type: 'portal', note: 'La puerta más estable de la red. Conduce al centro de OTRAVERSO.' },
      { id: 'portal-play', name: 'COMPUERTA PLAY', type: 'portal', note: 'Un umbral vibrante que huele a juego y a desafío pendiente.' },
      { id: 'portal-inverso', name: 'COMPUERTA INVERSA', type: 'portal', note: 'Muestra el mismo lugar, pero con todas las decisiones cambiadas.' },
      { id: 'portal-dormido', name: 'COMPUERTA DORMIDA', type: 'portal', note: 'Descansa desde hace eones. Cerca de ella, el tiempo parece contener la respiración.' },
      { id: 'brujula-perdida', name: 'BRÚJULA PERDIDA', type: 'collectible', note: 'No señala el norte: señala aquello que todavía no has descubierto.' },
      { id: 'semilla-cosmica', name: 'SEMILLA CÓSMICA', type: 'collectible', note: 'Siembra un universo diminuto en el bolsillo de quien la encuentra.' },
      { id: 'reloj-sin-hora', name: 'RELOJ SIN HORA', type: 'collectible', note: 'Sus agujas giran hacia el momento en que decidas explorar.' },
      { id: 'llave-orbita', name: 'LLAVE DE ÓRBITA', type: 'collectible', note: 'Abre un camino corto entre sectores que parecían lejanos.' },
      { id: 'memoria-flotante', name: 'MEMORIA FLOTANTE', type: 'collectible', note: 'Contiene el recuerdo de alguien que miró este mismo núcleo.' }
    ];
    S.objects = defs.map(function (def, index) {
      var angle = (index / defs.length) * TAU + (random() - 0.5) * 0.4;
      var radius = index === 0 ? 260 : 100 + random() * 410;
      var size = def.type === 'nebula' ? 40 + random() * 34
        : def.type === 'collectible' ? 9 + random() * 5
          : def.type === 'core' ? 46 : 16 + random() * 20;
      return {
        id: def.id,
        name: def.name,
        type: def.type,
        note: def.note,
        x: index === 0 ? 0 : Math.cos(angle) * radius,
        y: index === 0 ? 0 : (random() - 0.5) * 170,
        z: index === 0 ? 260 : Math.sin(angle) * radius + 120,
        size: size,
        phase: random() * TAU
      };
    });
  }

  function normalizeGame(item, index) {
    if (typeof item === 'string') item = { code: item };
    item = item || {};
    var code = String(item.code || item.id || item.slug || ('juego-' + (index + 1)));
    var hub = item.hub || {};
    var rawStatus = String(item.status || item.estado || 'published').toLowerCase();
    var available = rawStatus === 'published' || rawStatus === 'available' || rawStatus === 'activo';
    if (item.available === false || rawStatus === 'planned' || rawStatus === 'planeado') available = false;
    if (item.available === true) available = true;
    return {
      id: String(item.id || code),
      code: code,
      name: String(item.name || item.title || code).toUpperCase(),
      description: String(item.description || item.tagline || item.desc || 'Una órbita por descubrir dentro de OTRAVERSO PLAY.'),
      status: available ? 'published' : 'planned',
      available: available,
      zone: String(hub.zone || item.zone || ''),
      accent: hexColor(item.accent || hub.accent, '#67e8f9'),
      tagline: String(item.tagline || ''),
      category: String(item.category || ''),
      route: String(item.route || ''),
      order: typeof hub.order === 'number' ? hub.order : index,
      index: index
    };
  }

  function assignZones(games) {
    var used = {};
    return games.map(function (game, index) {
      var base = game.zone || SECTORS[index % SECTORS.length];
      var id = base;
      var suffix = 2;
      while (used[id]) {
        id = base + ' ' + suffix;
        suffix++;
      }
      used[id] = true;
      var hash = hashString(id);
      var angle = index * GOLDEN + ((hash % 617) / 617) * 0.32 - Math.PI / 2;
      var radius = 0.8 + (((hash >>> 5) % 100) / 100) * 0.28;
      return {
        id: id,
        name: id,
        game: game,
        kind: KINDS[index % KINDS.length],
        angle: angle,
        radius: radius,
        phase: ((hash >>> 11) % 628) / 100,
        world: {
          x: Math.cos(angle) * radius * 260,
          y: ((hash >>> 9) % 90) - 45,
          z: 190 + Math.sin(angle) * radius * 240
        },
        el: null,
        x: 0,
        y: 0
      };
    });
  }

  function findGame(code) {
    for (var i = 0; i < S.games.length; i++) {
      if (S.games[i].code === code) return S.games[i];
    }
    return null;
  }

  function findZone(code) {
    for (var i = 0; i < S.zones.length; i++) {
      if (S.zones[i].game.code === code) return S.zones[i];
    }
    return null;
  }

  function setContext(eyebrow, title, text, meta, canEnter) {
    var r = S.refs;
    if (r.ctxEyebrow) r.ctxEyebrow.textContent = eyebrow;
    if (r.ctxTitle) r.ctxTitle.textContent = title;
    if (r.ctxText) r.ctxText.textContent = text;
    if (r.ctxMeta) r.ctxMeta.textContent = meta;
    if (r.ctxAction) {
      r.ctxAction.hidden = !canEnter;
      r.ctxAction.disabled = !canEnter;
      r.ctxAction.setAttribute('aria-disabled', canEnter ? 'false' : 'true');
    }
    if (r.context) r.context.classList.add('is-visible');
  }

  function markSelected() {
    S.zones.forEach(function (zone) {
      var active = zone.game.code === S.selected;
      zone.el.classList.toggle('is-selected', active);
      if (active) zone.el.setAttribute('aria-current', 'true');
      else zone.el.removeAttribute('aria-current');
    });
  }

  function showGameInfo(code) {
    var game = findGame(code);
    var zone = findZone(code);
    if (!game) return;
    S.selected = game.code;
    markSelected();
    setContext(
      zone ? 'SECTOR ' + zone.name : 'SECTOR DESCONOCIDO',
      game.name,
      game.tagline ? game.tagline + ' ' + game.description : game.description,
      game.available ? (game.category ? game.category + ' · DISPONIBLE' : 'DISPONIBLE') : 'PLANEADO',
      game.available
    );
  }

  function enterGame(code) {
    var game = findGame(code);
    if (!game) return;
    if (!game.available) {
      safe(S.ctx.notify, [game.name + ' está planeado. Todavía no está disponible.']);
      return;
    }
    S.selected = game.code;
    safe(S.ctx.startGame, [game.code, {}]);
  }

  function showDiscovery(object) {
    if (!object) return;
    var typeLabels = {
      core: 'NÚCLEO', planet: 'NODO', nebula: 'CÚMULO', anomaly: 'ANOMALÍA',
      ruin: 'RUINA', portal: 'COMPUERTA', collectible: 'ARTEFACTO'
    };
    setContext('DESCUBRIMIENTO', object.name, object.note, typeLabels[object.type] || 'OBJETO', false);
  }

  function discover(object) {
    if (!object) return;
    var firstTime = !S.discoveries[object.id];
    if (firstTime) {
      S.discoveries[object.id] = object.note;
      safe(S.ctx.discover, [object.id, object.note]);
    }
    showDiscovery(object);
    safe(S.ctx.notify, [firstTime ? 'Descubrimiento registrado: ' + object.name : object.name + ' ya estaba registrado.']);
  }

  function zonePoint(zone) {
    var cx = S.width * 0.5;
    var cy = S.height * 0.52;
    var base = Math.min(S.width, S.height);
    var angle = zone.angle + S.zoneAngle;
    return {
      cx: cx,
      cy: cy,
      x: cx + Math.cos(angle) * base * 0.37 * zone.radius,
      y: cy + Math.sin(angle) * base * 0.255 * zone.radius
    };
  }

  function positionZones(dt) {
    if (!S.zones.length || !S.width || !S.height) return;
    if (!S.reduced && S.mode === MODE_HUB && dt > 0) S.zoneAngle += dt * 0.055;
    S.zones.forEach(function (zone) {
      var point = zonePoint(zone);
      zone.x = point.x;
      zone.y = point.y;
      zone.el.style.transform = 'translate3d(' + (point.x - point.cx).toFixed(1) + 'px,' + (point.y - point.cy).toFixed(1) + 'px,0) translate(-50%,-50%)';
    });
  }

  function renderZones(list) {
    if (!S.refs.zones || !S.mounted) return;
    var source = list || [];
    if (!isArr(source) && source.games) source = source.games;
    if (!isArr(source)) source = [];
    var games = source.map(normalizeGame).sort(function (a, b) {
      var pa = /gravity/i.test(a.code) ? 0 : 1;
      var pb = /gravity/i.test(b.code) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (pa === 0 && a.available !== b.available) return a.available ? -1 : 1;
      if (a.order !== b.order) return a.order - b.order;
      return a.index - b.index;
    });
    S.games = games;
    S.zones = [];
    S.zoneAngle = 0;
    S.refs.zones.textContent = '';
    S.landMarks = [{ id: 'nucleo-otraverso', name: 'NÚCLEO OTRAVERSO', type: 'core', x: 0, y: 0, z: 260 }];
    if (!games.length) {
      var empty = doc.createElement('p');
      empty.className = 'play-hub__zones-empty';
      empty.textContent = 'No hay zonas disponibles en este momento.';
      S.refs.zones.appendChild(empty);
      setContext('OTRAVERSO PLAY', 'OTRAVERSO PLAY', 'Explora el universo mientras las zonas de juego se conectan.', 'SIN ZONAS', false);
      return;
    }
    assignZones(games).forEach(function (zone, index) {
      var game = zone.game;
      var button = doc.createElement('button');
      var signal = doc.createElement('span');
      var stem = doc.createElement('span');
      var label = doc.createElement('span');
      var name = doc.createElement('b');
      var status = doc.createElement('small');
      button.type = 'button';
      button.tabIndex = S.mode === MODE_EXPLORE ? -1 : 0;
      button.className = 'play-hub__zone play-hub__zone--' + zone.kind
        + (index === 0 && game.available ? ' is-primary' : '')
        + (game.available ? '' : ' is-planned');
      button.setAttribute('data-zone-select', game.code);
      button.setAttribute('data-status', game.status);
      button.setAttribute('aria-label', game.name + ', sector ' + zone.name + (game.available ? ', disponible' : ', planeado'));
      if (!game.available) button.setAttribute('aria-disabled', 'true');
      if (isFn(button.style.setProperty)) button.style.setProperty('--zone-accent', game.accent);
      signal.className = 'play-hub__zone-signal';
      signal.setAttribute('aria-hidden', 'true');
      stem.className = 'play-hub__zone-stem';
      stem.setAttribute('aria-hidden', 'true');
      label.className = 'play-hub__zone-label';
      name.textContent = game.name;
      status.textContent = game.available ? zone.name : 'PLANEADO · ' + zone.name;
      label.appendChild(name);
      label.appendChild(status);
      button.appendChild(stem);
      button.appendChild(signal);
      button.appendChild(label);
      on(button, 'click', function (event) {
        if (event && isFn(event.stopPropagation)) event.stopPropagation();
        showGameInfo(game.code);
      });
      on(button, 'dblclick', function (event) {
        stopEvent(event);
        enterGame(game.code);
      });
      on(button, 'focus', function () { showGameInfo(game.code); });
      on(button, 'keydown', function (event) {
        var key = (event.key || '').toLowerCase();
        if (key === 'enter' || key === ' ' || key === 'spacebar' || event.keyCode === 13 || event.keyCode === 32) {
          stopEvent(event);
          showGameInfo(game.code);
          enterGame(game.code);
        }
      });
      S.refs.zones.appendChild(button);
      zone.el = button;
      S.zones.push(zone);
      S.landMarks.push({
        id: 'sector-' + (index + 1) + '-' + game.code,
        name: zone.name + ' · ' + game.name,
        type: zone.kind,
        x: round3(zone.world.x),
        y: round3(zone.world.y),
        z: round3(zone.world.z)
      });
    });
    positionZones(0);
    showGameInfo(games[0].code);
  }

  function loadGames() {
    var source = safe(S.ctx.getGames, []);
    if (source && isFn(source.then)) {
      source.then(function (value) { if (S.mounted) renderZones(value); }, function () { if (S.mounted) renderZones([]); });
    } else {
      renderZones(source);
    }
  }

  function eventCapacity() {
    if (S.tier === 'minimal') return 1;
    if (S.tier === 'low') return 1;
    return 2;
  }

  function computeTier() {
    var nav = global.navigator || {};
    S.lowPower = (nav.deviceMemory && nav.deviceMemory <= 2) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2);
    var small = !!S.width && !!S.height && (S.width < 720 || S.height < 520);
    var next = S.reduced ? 'minimal' : ((S.lowPower || small) ? 'low' : 'high');
    if (next === S.tier) return;
    S.tier = next;
    if (S.hub) S.hub.setAttribute('data-hub-tier', S.tier);
    if (S.events.length > eventCapacity()) {
      S.events.slice(eventCapacity()).forEach(function (event) { endEvent(event.id); });
    }
  }

  function eventById(id) {
    for (var i = 0; i < S.events.length; i++) {
      if (S.events[i].id === id) return S.events[i];
    }
    return null;
  }

  function eventProgress(event) {
    if (!event) return 0;
    var now = isFn(Date.now) ? Date.now() : new Date().getTime();
    return clamp((now - event.startMs) / event.duration, 0, 1);
  }

  function levelOf(id) {
    var event = eventById(id);
    if (!event) return 0;
    var progress = eventProgress(event);
    return Math.sin(progress * Math.PI);
  }

  function updateFeed() {
    var r = S.refs.feed;
    if (!r) return;
    r.textContent = '';
    if (!S.events.length) {
      r.setAttribute('hidden', '');
      return;
    }
    r.removeAttribute('hidden');
    S.events.slice(0, 2).forEach(function (event) {
      var item = doc.createElement('p');
      var pulse = doc.createElement('span');
      var label = doc.createElement('b');
      var detail = doc.createElement('small');
      item.className = 'play-hub__feed-item';
      pulse.className = 'play-hub__feed-pulse';
      pulse.setAttribute('aria-hidden', 'true');
      label.textContent = event.label;
      detail.textContent = event.detail;
      item.appendChild(pulse);
      item.appendChild(label);
      item.appendChild(detail);
      r.appendChild(item);
    });
  }

  function startEvent(def) {
    if (!def || eventById(def.id)) return;
    var now = isFn(Date.now) ? Date.now() : new Date().getTime();
    var duration = S.reduced ? def.duration * 0.6 : def.duration;
    var record = {
      id: def.id,
      label: def.label,
      detail: def.detail,
      priority: def.priority,
      tier: def.tier,
      startMs: now,
      duration: duration
    };
    S.events.push(record);
    S.events.sort(function (a, b) { return b.priority - a.priority; });
    updateFeed();
    record.timer = laterEvent(function () { endEvent(def.id); }, duration);
  }

  function endEvent(id) {
    var event = eventById(id);
    if (!event) return;
    if (event.timer) {
      if (isFn(global.clearTimeout)) global.clearTimeout(event.timer);
      S.eventTimers = S.eventTimers.filter(function (timer) { return timer !== event.timer; });
    }
    S.events = S.events.filter(function (item) { return item.id !== id; });
    updateFeed();
  }

  function scheduleEvents(delay) {
    if (!S.mounted) return;
    if (S.scheduleTimer && isFn(global.clearTimeout)) global.clearTimeout(S.scheduleTimer);
    S.scheduleTimer = later(function () {
      S.scheduleTimer = 0;
      if (!S.mounted) return;
      tickEvents();
    }, typeof delay === 'number' ? delay : rand(1800, 3200));
  }

  function tickEvents() {
    if (!S.mounted) return;
    if (S.tween || S.mode !== MODE_HUB) {
      scheduleEvents(900);
      return;
    }
    if (S.events.length >= eventCapacity()) {
      scheduleEvents(1500);
      return;
    }
    var now = isFn(Date.now) ? Date.now() : new Date().getTime();
    var factor = S.tier === 'high' ? 1 : (S.tier === 'low' ? 0.7 : 0.45);
    var choices = EVENTS.filter(function (def) {
      if (def.tier === 'high' && S.tier !== 'high') return false;
      return now >= (S.eventNext[def.id] || 0);
    });
    if (!choices.length) {
      scheduleEvents(1600);
      return;
    }
    var def = choices[(Math.random() * choices.length) | 0];
    S.eventNext[def.id] = now + rand(def.min, def.max);
    if (Math.random() > def.probability * factor) {
      scheduleEvents(800);
      return;
    }
    startEvent(def);
    scheduleEvents(rand(2200, 4200));
  }

  function clearEvents() {
    if (S.scheduleTimer && isFn(global.clearTimeout)) global.clearTimeout(S.scheduleTimer);
    S.scheduleTimer = 0;
    clearTimers(S.eventTimers);
    S.eventTimers = [];
    S.events = [];
    S.eventNext = {};
    updateFeed();
  }

  function applyCamera(value) {
    S.cam.x = value.x;
    S.cam.y = value.y;
    S.cam.z = value.z;
    S.cam.yaw = value.yaw;
    S.cam.pitch = value.pitch;
    S.cam.zoom = value.zoom;
  }

  function startTween(target, duration) {
    if (S.reduced) {
      applyCamera(target);
      S.tween = null;
      return;
    }
    S.tween = {
      from: { x: S.cam.x, y: S.cam.y, z: S.cam.z, yaw: S.cam.yaw, pitch: S.cam.pitch, zoom: S.cam.zoom },
      to: target,
      t: 0,
      d: Math.max(1, duration || 700)
    };
  }

  function resetView() {
    if (!S.mounted) return;
    S.keys = {};
    S.touch.joyX = 0;
    S.touch.joyY = 0;
    S.joyDrag = null;
    S.lookDrag = null;
    startTween(S.mode === MODE_EXPLORE ? SPAWN : CENTER, 650);
  }

  function setMode(mode) {
    if (!S.mounted) return;
    var next = mode === MODE_EXPLORE ? MODE_EXPLORE : MODE_HUB;
    if (S.mode === next) {
      resetView();
      return;
    }
    S.mode = next;
    var exploring = next === MODE_EXPLORE;
    if (S.hub) {
      S.hub.setAttribute('data-hub-mode', next);
      S.hub.classList.toggle('is-exploring', exploring);
    }
    if (S.universeRoot) S.universeRoot.setAttribute('data-mode', next);
    if (S.refs.controls) {
      if (exploring) S.refs.controls.removeAttribute('hidden');
      else S.refs.controls.setAttribute('hidden', '');
    }
    if (S.refs.returnButton) {
      if (exploring) S.refs.returnButton.removeAttribute('hidden');
      else S.refs.returnButton.setAttribute('hidden', '');
    }
    if (S.refs.exploreButton) {
      if (exploring) S.refs.exploreButton.setAttribute('hidden', '');
      else S.refs.exploreButton.removeAttribute('hidden');
    }
    S.zones.forEach(function (zone) { zone.el.tabIndex = exploring ? -1 : 0; });
    scheduleEvents(2400);
    if (exploring) {
      setContext('MODO EXPLORAR', 'UNIVERSO ABIERTO', 'WASD para moverte, Espacio y Ctrl para subir o bajar, Shift para acelerar. El ratón orienta y el clic interactúa.', 'EXPLORANDO', false);
      startTween(SPAWN, 800);
    } else {
      startTween(CENTER, 800);
      if (S.selected) showGameInfo(S.selected);
      else if (S.games.length) showGameInfo(S.games[0].code);
    }
  }

  function getMode() {
    return S.mode;
  }

  function toggleHelp() {
    S.helpOpen = !S.helpOpen;
    if (S.refs.help) {
      if (S.helpOpen) S.refs.help.removeAttribute('hidden');
      else S.refs.help.setAttribute('hidden', '');
    }
    if (S.hub) S.hub.classList.toggle('is-help-open', S.helpOpen);
    if (S.refs.helpToggle) S.refs.helpToggle.setAttribute('aria-expanded', S.helpOpen ? 'true' : 'false');
  }

  function resize() {
    if (!S.refs.viewport || !S.canvas) return;
    var rect = S.refs.viewport.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width || S.refs.viewport.clientWidth || 1));
    var height = Math.max(1, Math.round(rect.height || S.refs.viewport.clientHeight || 1));
    S.dpr = Math.min(global.devicePixelRatio || 1, DPR_MAX);
    S.width = width;
    S.height = height;
    S.canvas.width = Math.round(width * S.dpr);
    S.canvas.height = Math.round(height * S.dpr);
    if (S.ctx2d && isFn(S.ctx2d.setTransform)) S.ctx2d.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    computeTier();
    positionZones(0);
  }

  function project(point) {
    var dx = point.x - S.cam.x;
    var dy = point.y - S.cam.y;
    var dz = point.z - S.cam.z;
    var cy = Math.cos(S.cam.yaw);
    var sy = Math.sin(S.cam.yaw);
    var x1 = dx * cy - dz * sy;
    var z1 = dx * sy + dz * cy;
    var cp = Math.cos(S.cam.pitch);
    var sp = Math.sin(S.cam.pitch);
    var y2 = dy * cp - z1 * sp;
    var z2 = dy * sp + z1 * cp;
    if (z2 <= 6) return null;
    var scale = S.height * 0.86 * S.cam.zoom / z2;
    return { x: S.width / 2 + x1 * scale, y: S.height / 2 - y2 * scale, scale: scale, depth: z2 };
  }

  function drawBackground(t) {
    var c = S.ctx2d;
    var w = S.width;
    var h = S.height;
    var cx = w * 0.5;
    var cy = h * 0.52;
    var gradient = radial(c, cx, cy, Math.max(w, h) * 0.82, [
      [0, '#10102c'], [0.38, '#080818'], [0.74, '#05040f'], [1, '#020207']
    ]);
    if (gradient) {
      c.fillStyle = gradient;
      c.fillRect(0, 0, w, h);
    } else {
      c.fillStyle = '#05040f';
      c.fillRect(0, 0, w, h);
    }

    S.nebulae.forEach(function (cloud) {
      var drift = S.reduced ? 0 : Math.sin(t * 0.06 + cloud.p) * 16;
      var x = cloud.x * w + drift;
      var y = cloud.y * h + drift * 0.45;
      var r = cloud.r * Math.max(w, h);
      var glow = radial(c, x, y, r, [
        [0, 'rgba(' + cloud.hue + ',0.13)'],
        [0.5, 'rgba(' + cloud.hue + ',0.05)'],
        [1, 'rgba(' + cloud.hue + ',0)']
      ]);
      if (glow) {
        c.fillStyle = glow;
        circle(c, x, y, r);
        c.fill();
      }
    });

    var px = S.pointer.inside ? (S.pointer.x / w - 0.5) : 0;
    var py = S.pointer.inside ? (S.pointer.y / h - 0.5) : 0;
    S.stars.forEach(function (star) {
      var x = star.x * w + px * 24 * star.z;
      var y = star.y * h + py * 18 * star.z;
      var alpha = star.a;
      if (S.mode === MODE_HUB) {
        var dx = x - cx;
        var dy = y - cy;
        var distance = Math.sqrt(dx * dx + dy * dy) || 1;
        var lens = Math.min(w, h) * 0.3;
        if (distance < lens) {
          var strength = 1 - distance / lens;
          x += (dx / distance) * strength * strength * 26;
          y += (dy / distance) * strength * strength * 26;
          alpha = Math.min(1, alpha + strength * 0.3);
        }
      }
      if (!S.reduced) alpha *= 0.7 + 0.3 * Math.sin(t * 1.1 + star.p);
      c.fillStyle = 'rgba(214,231,255,' + alpha.toFixed(3) + ')';
      circle(c, x, y, star.r);
      c.fill();
    });

    var horizon = h * 0.7;
    var haze = linear(c, 0, h * 0.42, 0, h, [
      [0, 'rgba(103,232,249,0)'],
      [0.5, 'rgba(103,232,249,0.035)'],
      [1, 'rgba(139,92,246,0.1)']
    ]);
    if (haze) {
      c.fillStyle = haze;
      c.fillRect(0, h * 0.42, w, h * 0.58);
    }
    c.strokeStyle = 'rgba(103,232,249,0.075)';
    c.lineWidth = 1;
    var i;
    if (S.tier !== 'minimal') {
      for (i = -6; i <= 6; i++) {
        c.beginPath();
        c.moveTo(cx + i * w * 0.035, horizon);
        c.lineTo(cx + i * w * 0.28, h + 10);
        c.stroke();
      }
      for (i = 1; i < 9; i++) {
        var ratio = i / 9;
        var y = horizon + Math.pow(ratio, 1.7) * (h - horizon);
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(w, y);
        c.stroke();
      }
    }
    if (S.tier === 'high') {
      c.fillStyle = 'rgba(255,255,255,0.012)';
      for (i = 0; i < h; i += 4) c.fillRect(0, i, w, 1);
    }
  }

  function drawGround(c, cx, cy, size, t) {
    c.save();
    var glow = radial(c, cx, cy + size * 1.05, size * 3.2, [
      [0, 'rgba(103,232,249,0.16)'],
      [0.45, 'rgba(139,92,246,0.07)'],
      [1, 'rgba(139,92,246,0)']
    ]);
    if (glow) {
      c.fillStyle = glow;
      ellipsePath(c, cx, cy + size * 1.05, size * 3.2, size * 1.05);
      c.fill();
    }
    for (var ring = 0; ring < 4; ring++) {
      var r = size * (1.25 + ring * 0.52);
      c.strokeStyle = 'rgba(103,232,249,' + (0.2 - ring * 0.035).toFixed(3) + ')';
      c.lineWidth = Math.max(1, size * 0.012);
      ellipsePath(c, cx, cy + size * 0.95, r, r * 0.32);
      c.stroke();
    }
    for (var i = 0; i < 28; i++) {
      var angle = i * TAU / 28 + (S.reduced ? 0 : t * 0.03);
      var x = cx + Math.cos(angle) * size * 2.7;
      var y = cy + size * 0.95 + Math.sin(angle) * size * 0.86;
      c.fillStyle = i % 7 === 0 ? 'rgba(251,191,36,0.7)' : 'rgba(103,232,249,0.34)';
      c.fillRect(x, y, 2, 4);
    }
    c.restore();
  }

  function drawCore(cx, cy, size, t, scale) {
    var c = S.ctx2d;
    var pulse = S.reduced ? 1 : 0.92 + 0.08 * Math.sin(t * 1.3);
    var i;
    var angle;
    c.save();
    c.translate(cx, cy);

    var glow = radial(c, 0, 0, size * 3.1, [
      [0, 'rgba(103,232,249,' + (0.26 * pulse).toFixed(3) + ')'],
      [0.32, 'rgba(139,92,246,0.14)'],
      [0.68, 'rgba(244,114,182,0.05)'],
      [1, 'rgba(139,92,246,0)']
    ]);
    if (glow) {
      c.fillStyle = glow;
      circle(c, 0, 0, size * 3.1);
      c.fill();
    }

    var beam = linear(c, 0, -size * 3.4, 0, size * 1.6, [
      [0, 'rgba(103,232,249,0)'],
      [0.36, 'rgba(103,232,249,' + (0.22 * pulse).toFixed(3) + ')'],
      [1, 'rgba(244,114,182,0)']
    ]);
    if (beam) {
      c.fillStyle = beam;
      c.fillRect(-size * 0.07, -size * 3.4, size * 0.14, size * 5);
    }

    for (i = 0; i < 3; i++) {
      c.save();
      c.rotate(i * Math.PI / 3 + (S.reduced ? 0 : t * (i % 2 ? -0.09 : 0.07)));
      c.strokeStyle = i === 1 ? 'rgba(244,114,182,0.4)' : 'rgba(103,232,249,0.36)';
      c.lineWidth = Math.max(1, size * 0.014);
      if (isFn(c.setLineDash)) c.setLineDash([size * 0.13, size * 0.09]);
      ellipsePath(c, 0, 0, size * (1.3 + i * 0.28), size * (0.34 + i * 0.09));
      c.stroke();
      if (isFn(c.setLineDash)) c.setLineDash([]);
      c.restore();
    }

    c.strokeStyle = 'rgba(251,191,36,0.34)';
    c.lineWidth = Math.max(1, size * 0.016);
    circle(c, 0, 0, size * 1.55);
    c.stroke();
    for (i = 0; i < 32; i++) {
      angle = i * TAU / 32;
      var inner = size * (i % 4 === 0 ? 1.55 : 1.62);
      var outer = size * 1.72;
      c.beginPath();
      c.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      c.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      c.stroke();
    }

    c.save();
    c.rotate(S.reduced ? 0 : t * 0.14);
    var shell = radial(c, -size * 0.2, -size * 0.24, size * 1.05, [
      [0, '#d9fbff'], [0.24, '#67e8f9'], [0.58, '#4c1d95'], [1, '#080516']
    ]);
    if (shell) {
      c.fillStyle = shell;
      polygon(c, 0, 0, size * 0.86, 8, Math.PI / 8);
      c.fill();
    }
    c.strokeStyle = 'rgba(226,247,255,0.72)';
    c.lineWidth = Math.max(1, size * 0.022);
    polygon(c, 0, 0, size * 0.86, 8, Math.PI / 8);
    c.stroke();
    c.strokeStyle = 'rgba(103,232,249,0.44)';
    c.lineWidth = Math.max(1, size * 0.012);
    for (i = 0; i < 8; i++) {
      angle = Math.PI / 8 + i * TAU / 8;
      c.beginPath();
      c.moveTo(Math.cos(angle) * size * 0.86, Math.sin(angle) * size * 0.86);
      c.lineTo(Math.cos(angle) * size * 0.52, Math.sin(angle) * size * 0.52);
      c.lineTo(Math.cos(angle + TAU / 8) * size * 0.52, Math.sin(angle + TAU / 8) * size * 0.52);
      c.stroke();
    }
    c.restore();

    c.save();
    c.rotate(S.reduced ? 0 : -t * 0.34);
    c.strokeStyle = 'rgba(251,191,36,' + (0.6 * pulse).toFixed(3) + ')';
    c.lineWidth = Math.max(1, size * 0.03);
    polygon(c, 0, 0, size * 0.42, 3, -Math.PI / 2);
    c.stroke();
    c.restore();

    var heart = radial(c, 0, 0, size * 0.32, [
      [0, 'rgba(255,255,255,0.98)'], [0.4, 'rgba(103,232,249,0.85)'], [1, 'rgba(103,232,249,0)']
    ]);
    if (heart) {
      c.fillStyle = heart;
      circle(c, 0, 0, size * 0.32);
      c.fill();
    }
    c.restore();
  }

  function drawSkyways(t) {
    if (S.tier === 'minimal') return;
    var c = S.ctx2d;
    var cx = S.width * 0.5;
    var cy = S.height * 0.52 + Math.min(S.width, S.height) * 0.12;
    S.zones.forEach(function (zone, index) {
      var accent = zone.game.accent;
      var mx = (cx + zone.x) * 0.5 + Math.sin(zone.phase) * 18;
      var my = (cy + zone.y) * 0.5 - 34;
      c.strokeStyle = rgba(accent, 0.14);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx, cy);
      c.quadraticCurveTo(mx, my, zone.x, zone.y + 40);
      c.stroke();
      if (!S.reduced) {
        var progress = ((t * 0.16 + index * 0.19) % 1 + 1) % 1;
        var inv = 1 - progress;
        var x = inv * inv * cx + 2 * inv * progress * mx + progress * progress * zone.x;
        var y = inv * inv * cy + 2 * inv * progress * my + progress * progress * (zone.y + 40);
        var glow = radial(c, x, y, 9, [[0, rgba(accent, 0.9)], [1, rgba(accent, 0)]]);
        if (glow) {
          c.fillStyle = glow;
          circle(c, x, y, 9);
          c.fill();
        }
      }
    });
  }

  function drawStructure(zone, t) {
    var c = S.ctx2d;
    var x = zone.x;
    var y = zone.y;
    var baseY = y + 40;
    var accent = zone.game.accent;
    var height = 40;
    var selected = zone.game.code === S.selected;
    var level = levelOf('tower-flare') && selected ? levelOf('tower-flare') : 0;
    c.save();
    var glow = radial(c, x, y, 30 + level * 34, [
      [0, rgba(accent, 0.28 + level * 0.4)],
      [1, rgba(accent, 0)]
    ]);
    if (glow) {
      c.fillStyle = glow;
      circle(c, x, y, 30 + level * 34);
      c.fill();
    }
    c.strokeStyle = rgba(accent, 0.3);
    c.lineWidth = 1;
    ellipsePath(c, x, baseY, 26, 8);
    c.stroke();
    ellipsePath(c, x, baseY, 17, 5);
    c.stroke();
    c.fillStyle = rgba(accent, 0.1);
    ellipsePath(c, x, baseY, 24, 7);
    c.fill();

    c.strokeStyle = rgba(accent, selected ? 0.8 : 0.45);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - 10, baseY);
    c.lineTo(x - 6, y);
    c.moveTo(x + 10, baseY);
    c.lineTo(x + 6, y);
    c.stroke();
    c.strokeStyle = rgba(accent, 0.18);
    c.lineWidth = 1;
    for (var step = 1; step < 4; step++) {
      var ly = baseY - step * (height / 4);
      c.beginPath();
      c.moveTo(x - 10 + step, ly);
      c.lineTo(x + 10 - step, ly);
      c.stroke();
    }

    c.save();
    c.translate(x, y);
    c.strokeStyle = rgba(accent, selected ? 0.95 : 0.68);
    c.lineWidth = 2;
    if (zone.kind === 'arch' || zone.kind === 'gateway') {
      c.beginPath();
      c.arc(0, 0, 11, Math.PI, TAU);
      c.stroke();
      c.strokeStyle = rgba(accent, 0.35);
      c.beginPath();
      c.arc(0, 0, 16, Math.PI, TAU);
      c.stroke();
      if (zone.kind === 'gateway') {
        c.save();
        c.rotate(S.reduced ? 0 : t * 0.4 + zone.phase);
        if (isFn(c.setLineDash)) c.setLineDash([4, 5]);
        circle(c, 0, 0, 13);
        c.stroke();
        if (isFn(c.setLineDash)) c.setLineDash([]);
        c.restore();
      }
    } else if (zone.kind === 'platform') {
      c.fillStyle = rgba(accent, 0.42);
      c.fillRect(-15, -2, 30, 3);
      c.fillRect(-11, -8, 22, 3);
      c.strokeRect(-15, -2, 30, 3);
    } else if (zone.kind === 'spire') {
      c.beginPath();
      c.moveTo(0, -18);
      c.lineTo(9, 2);
      c.lineTo(-9, 2);
      c.closePath();
      c.stroke();
      c.strokeStyle = rgba(accent, 0.3);
      ellipsePath(c, 0, -4, 13, 4);
      c.stroke();
    } else if (zone.kind === 'observatory') {
      c.beginPath();
      c.arc(0, 1, 10, Math.PI, TAU);
      c.stroke();
      c.beginPath();
      c.moveTo(-12, 2);
      c.lineTo(12, 2);
      c.stroke();
      c.save();
      c.rotate(-0.5 + (S.reduced ? 0 : Math.sin(t * 0.3 + zone.phase) * 0.2));
      c.strokeStyle = rgba(accent, 0.55);
      c.beginPath();
      if (isFn(c.ellipse)) c.ellipse(0, -8, 9, 2, 0, 0, TAU);
      else c.rect(-9, -10, 18, 4);
      c.stroke();
      c.restore();
    } else {
      c.strokeRect(-7, -16, 14, 18);
      c.strokeStyle = rgba(accent, 0.4);
      for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 2; col++) {
          var lit = (Math.floor(t * 1.4 + row * 2 + col + zone.phase) % 5) !== 0;
          if (lit && !S.reduced) {
            c.fillStyle = rgba(accent, 0.55);
            c.fillRect(-4 + col * 6, -13 + row * 5, 3, 2);
          }
        }
      }
    }
    c.restore();
    c.restore();
  }

  function drawCreatures(t) {
    if (S.tier === 'minimal') return;
    var c = S.ctx2d;
    var cx = S.width * 0.5;
    var cy = S.height * 0.52;
    var base = Math.min(S.width, S.height);
    var px = S.pointer.inside ? S.pointer.x : cx;
    var py = S.pointer.inside ? S.pointer.y : cy;
    S.creatures.forEach(function (creature, index) {
      var angle = creature.a + (S.reduced ? 0 : t * creature.s);
      var x = cx + Math.cos(angle) * base * creature.r * 1.15;
      var y = cy + creature.y * base + Math.sin(angle * 2 + creature.p) * base * 0.045;
      var dx = px - x;
      var dy = py - y;
      var distance = Math.sqrt(dx * dx + dy * dy) || 1;
      if (distance < 150) {
        var pull = (1 - distance / 150) * 14;
        x += (dx / distance) * pull;
        y += (dy / distance) * pull;
      }
      var size = 8 + (index % 2) * 4;
      var flap = S.reduced ? 0.6 : 0.55 + 0.45 * Math.sin(t * 3 + creature.p);
      c.save();
      c.translate(x, y);
      c.rotate(angle + Math.PI / 2);
      c.strokeStyle = 'rgba(' + creature.hue + ',' + (0.34 + flap * 0.3).toFixed(3) + ')';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-size * flap, -size * 0.3);
      c.quadraticCurveTo(0, -size * 1.2, size * flap, -size * 0.3);
      c.moveTo(-size * flap, size * 0.3);
      c.quadraticCurveTo(0, size * 1.2, size * flap, size * 0.3);
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.75)';
      circle(c, 0, 0, 2);
      c.fill();
      c.restore();
    });
  }

  function drawDrones(level, t) {
    var c = S.ctx2d;
    var w = S.width;
    var y = S.height * 0.32;
    var i;
    for (i = 0; i < 16; i++) {
      var progress = (level + i * 0.045) % 1;
      var x = -30 + progress * (w + 60);
      var py = y + Math.sin(i * 1.7 + t * 1.4) * 14;
      c.fillStyle = i % 4 === 0 ? 'rgba(251,191,36,0.85)' : 'rgba(103,232,249,0.7)';
      circle(c, x, py, i % 4 === 0 ? 2.4 : 1.6);
      c.fill();
      c.strokeStyle = 'rgba(103,232,249,0.2)';
      c.beginPath();
      c.moveTo(x - 7, py);
      c.lineTo(x + 7, py);
      c.stroke();
    }
  }

  function drawCreatureEvent(level, t) {
    var c = S.ctx2d;
    var w = S.width;
    var h = S.height;
    var x = -80 + level * (w + 160);
    var y = h * 0.42 - Math.sin(level * Math.PI) * h * 0.16;
    c.save();
    c.strokeStyle = 'rgba(244,114,182,0.32)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - 90, y + 14 + Math.sin(t) * 8);
    c.quadraticCurveTo(x, y - 26, x + 90, y + 10 + Math.cos(t) * 8);
    c.stroke();
    c.strokeStyle = 'rgba(103,232,249,0.5)';
    c.lineWidth = 1;
    for (var i = -3; i <= 3; i++) {
      c.beginPath();
      c.moveTo(x + i * 16, y);
      c.lineTo(x + i * 16 - 9, y - 14 - Math.sin(t * 2 + i) * 4);
      c.stroke();
    }
    var glow = radial(c, x, y, 60, [[0, 'rgba(244,114,182,0.3)'], [1, 'rgba(244,114,182,0)']]);
    if (glow) {
      c.fillStyle = glow;
      circle(c, x, y, 60);
      c.fill();
    }
    c.restore();
  }

  function drawSignalEvent(level, t) {
    var c = S.ctx2d;
    var cx = S.width * 0.5;
    var cy = S.height * 0.52;
    var size = Math.min(S.width, S.height) * 0.19;
    c.save();
    for (var i = 0; i < 3; i++) {
      var progress = (level * 1.4 + i * 0.33) % 1;
      c.strokeStyle = 'rgba(251,191,36,' + (0.4 * (1 - progress)).toFixed(3) + ')';
      c.lineWidth = 2;
      circle(c, cx, cy, size * (1.7 + progress * 2.2));
      c.stroke();
    }
    c.fillStyle = 'rgba(251,191,36,' + (0.5 + Math.sin(t * 8) * 0.2).toFixed(3) + ')';
    circle(c, cx + size * 1.8, cy - size * 0.8, 4);
    c.fill();
    c.restore();
  }

  function drawFaultEvent(level) {
    if (S.reduced) return;
    var c = S.ctx2d;
    var w = S.width;
    var h = S.height;
    var flicker = Math.sin(level * 38) > 0 ? 0.16 : 0.05;
    c.fillStyle = 'rgba(2,2,10,' + flicker.toFixed(3) + ')';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(103,232,249,0.08)';
    c.fillRect(0, h * 0.3 + Math.sin(level * 24) * 20, w, 3);
  }

  function drawGateEvent(level, t) {
    var c = S.ctx2d;
    var cx = S.width * 0.5;
    var cy = S.height * 0.52;
    var size = Math.min(S.width, S.height) * (0.2 + level * 0.22);
    c.save();
    c.translate(cx, cy);
    c.rotate(t * 0.12);
    c.strokeStyle = 'rgba(244,114,182,0.5)';
    c.lineWidth = 3;
    polygon(c, 0, 0, size, 6, Math.PI / 6);
    c.stroke();
    c.strokeStyle = 'rgba(103,232,249,0.3)';
    c.lineWidth = 1;
    polygon(c, 0, 0, size * 0.82, 6, Math.PI / 6);
    c.stroke();
    c.restore();
  }

  function drawCrowdEvent(level, t) {
    var c = S.ctx2d;
    var cx = S.width * 0.5;
    var cy = S.height * 0.52 + Math.min(S.width, S.height) * 0.15;
    var span = Math.min(S.width, S.height) * 0.9;
    for (var i = 0; i < 30; i++) {
      var progress = ((i / 30) + level * 0.6 + (S.reduced ? 0 : t * 0.02)) % 1;
      var x = cx + (progress - 0.5) * span;
      var y = cy + Math.sin(progress * Math.PI * 4 + i) * 8;
      c.fillStyle = i % 5 === 0 ? 'rgba(251,191,36,0.75)' : 'rgba(226,247,255,0.55)';
      c.fillRect(x, y, 2, 4);
    }
  }

  function drawEvents(t) {
    if (!S.events.length) return;
    var levels = {};
    S.events.forEach(function (event) { levels[event.id] = eventProgress(event); });
    if (levels['drone-parade'] != null) drawDrones(levels['drone-parade'], t);
    if (levels['creature-crossing'] != null) drawCreatureEvent(levels['creature-crossing'], t);
    if (levels['industrial-signal'] != null) drawSignalEvent(levels['industrial-signal'], t);
    if (levels['gate-open'] != null) drawGateEvent(levels['gate-open'], t);
    if (levels['crowd-surge'] != null) drawCrowdEvent(levels['crowd-surge'], t);
    if (levels['power-fault'] != null) drawFaultEvent(levels['power-fault']);
    if (levels['tower-flare'] != null) {
      var glow = radial(S.ctx2d, S.pointer.inside ? S.pointer.x : S.width * 0.5, S.pointer.inside ? S.pointer.y : S.height * 0.5, 70, [
        [0, 'rgba(251,191,36,0.12)'], [1, 'rgba(251,191,36,0)']
      ]);
      if (glow) {
        S.ctx2d.fillStyle = glow;
        circle(S.ctx2d, S.pointer.inside ? S.pointer.x : S.width * 0.5, S.pointer.inside ? S.pointer.y : S.height * 0.5, 70);
        S.ctx2d.fill();
      }
    }
  }

  function drawObject(object, p, t) {
    var c = S.ctx2d;
    var radius = clamp(object.size * p.scale, 2, 190);
    var x = p.x;
    var y = p.y;
    var pulse = S.reduced ? 1 : 0.86 + 0.14 * Math.sin(t * 1.5 + object.phase);
    var discovered = !!S.discoveries[object.id];
    var i;
    var glow;

    if (object.type === 'nebula') {
      glow = radial(c, x, y, radius * 1.8, [
        [0, 'rgba(244,114,182,0.3)'],
        [0.45, 'rgba(139,92,246,0.15)'],
        [1, 'rgba(139,92,246,0)']
      ]);
      if (glow) {
        c.fillStyle = glow;
        circle(c, x, y, radius * 1.8);
        c.fill();
      }
      return;
    }

    if (object.type === 'planet') {
      var sphere = radial(c, x - radius * 0.35, y - radius * 0.4, radius, [
        [0, '#e2fbff'], [0.3, '#67e8f9'], [0.68, '#5b21b6'], [1, '#07031a']
      ]);
      if (sphere) {
        c.fillStyle = sphere;
        circle(c, x, y, radius);
        c.fill();
      }
      c.strokeStyle = discovered ? 'rgba(103,232,249,0.9)' : 'rgba(255,255,255,0.24)';
      c.lineWidth = Math.max(1, radius * 0.04);
      circle(c, x, y, radius);
      c.stroke();
      c.save();
      c.translate(x, y);
      c.rotate(-0.35);
      c.scale(1, 0.28);
      c.strokeStyle = 'rgba(251,191,36,0.5)';
      circle(c, 0, 0, radius * 1.42);
      c.stroke();
      c.restore();
      return;
    }

    if (object.type === 'portal') {
      c.save();
      c.translate(x, y);
      for (i = 0; i < 3; i++) {
        c.strokeStyle = i === 1 ? 'rgba(244,114,182,0.72)' : 'rgba(103,232,249,0.72)';
        c.lineWidth = Math.max(1, radius * 0.08);
        polygon(c, 0, 0, radius * (0.5 + i * 0.28) * pulse, 6, S.reduced ? 0 : t * 0.14);
        c.stroke();
      }
      c.restore();
      return;
    }

    if (object.type === 'anomaly') {
      c.save();
      c.translate(x, y);
      c.rotate(S.reduced ? 0 : t * 0.3 + object.phase);
      for (i = 0; i < 3; i++) {
        c.strokeStyle = 'rgba(251,191,36,' + (0.55 - i * 0.12).toFixed(3) + ')';
        c.lineWidth = Math.max(1, radius * 0.06);
        c.beginPath();
        c.arc(0, 0, radius * (0.35 + i * 0.34) * pulse, i * 0.6, i * 0.6 + Math.PI * 1.5);
        c.stroke();
      }
      c.restore();
      return;
    }

    if (object.type === 'ruin') {
      c.save();
      c.translate(x, y);
      c.strokeStyle = discovered ? 'rgba(103,232,249,0.9)' : 'rgba(139,92,246,0.75)';
      c.lineWidth = Math.max(1, radius * 0.06);
      for (i = 0; i < 3; i++) {
        var base = radius * (0.5 + i * 0.26);
        c.beginPath();
        c.moveTo(-base, base * 0.6);
        c.lineTo(-base * 0.72, -base * 0.7);
        c.lineTo(0, -base);
        c.lineTo(base * 0.72, -base * 0.7);
        c.lineTo(base, base * 0.6);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(-radius * 1.02, radius * 0.6);
      c.lineTo(radius * 1.02, radius * 0.6);
      c.stroke();
      c.restore();
      return;
    }

    c.save();
    c.translate(x, y);
    c.rotate(Math.PI / 4 + (S.reduced ? 0 : t * 0.4) + object.phase);
    c.fillStyle = 'rgba(255,236,246,0.92)';
    c.fillRect(-radius * 0.5, -radius * 0.5, radius, radius);
    c.restore();
  }

  function drawReticle() {
    var c = S.ctx2d;
    var x = S.pointer.inside ? S.pointer.x : S.width / 2;
    var y = S.pointer.inside ? S.pointer.y : S.height / 2;
    c.save();
    c.strokeStyle = 'rgba(103,232,249,0.55)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(x, y, 13, 0, TAU);
    c.moveTo(x - 22, y);
    c.lineTo(x - 8, y);
    c.moveTo(x + 8, y);
    c.lineTo(x + 22, y);
    c.moveTo(x, y - 22);
    c.lineTo(x, y - 8);
    c.moveTo(x, y + 8);
    c.lineTo(x, y + 22);
    c.stroke();
    c.restore();
  }

  function drawPointerField(cx, cy, size) {
    if (S.tier === 'minimal' || !S.pointer.inside) return;
    var c = S.ctx2d;
    var x = S.pointer.x;
    var y = S.pointer.y;
    var dx = x - cx;
    var dy = y - cy;
    var distance = Math.sqrt(dx * dx + dy * dy) || 1;
    var beam = linear(c, cx, cy, x, y, [
      [0, 'rgba(103,232,249,0.18)'],
      [1, 'rgba(103,232,249,0)']
    ]);
    if (beam) {
      c.strokeStyle = beam;
      c.lineWidth = Math.max(1, size * 0.02);
      c.beginPath();
      c.moveTo(cx + (dx / distance) * size * 0.8, cy + (dy / distance) * size * 0.8);
      c.lineTo(x, y);
      c.stroke();
    }
    c.strokeStyle = 'rgba(244,114,182,0.24)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(x, y, 24, 0, TAU);
    c.stroke();
  }

  function update(dt) {
    if (S.tween) {
      S.tween.t += dt;
      var amount = ease(S.tween.t / S.tween.d);
      S.cam.x = lerp(S.tween.from.x, S.tween.to.x, amount);
      S.cam.y = lerp(S.tween.from.y, S.tween.to.y, amount);
      S.cam.z = lerp(S.tween.from.z, S.tween.to.z, amount);
      S.cam.yaw = lerp(S.tween.from.yaw, S.tween.to.yaw, amount);
      S.cam.pitch = lerp(S.tween.from.pitch, S.tween.to.pitch, amount);
      S.cam.zoom = lerp(S.tween.from.zoom, S.tween.to.zoom, amount);
      if (S.tween.t >= S.tween.d) S.tween = null;
      return;
    }
    if (S.mode !== MODE_EXPLORE || !dt) {
      if (S.mode === MODE_HUB) positionZones(dt);
      return;
    }
    var forward = (S.keys.w ? 1 : 0) - (S.keys.s ? 1 : 0) - S.touch.joyY;
    var strafe = (S.keys.d ? 1 : 0) - (S.keys.a ? 1 : 0) + S.touch.joyX;
    var vertical = (S.keys.up ? 1 : 0) - (S.keys.down ? 1 : 0);
    var speed = (S.keys.shift ? 320 : 120) * dt;
    var cy = Math.cos(S.cam.yaw);
    var sy = Math.sin(S.cam.yaw);
    S.cam.x += (sy * forward + cy * strafe) * speed;
    S.cam.z += (cy * forward - sy * strafe) * speed;
    S.cam.y += vertical * speed;
    if (S.pointer.inside) {
      var nx = clamp((S.pointer.x / S.width - 0.5) * 2, -1, 1);
      var ny = clamp((S.pointer.y / S.height - 0.5) * 2, -1, 1);
      S.cam.yaw += nx * dt * 1.15;
      S.cam.pitch = clamp(S.cam.pitch + ny * dt * 0.85, -1.15, 1.15);
    }
    positionZones(dt);
  }

  function render() {
    if (!S.ctx2d || !S.width || !S.height) return;
    var c = S.ctx2d;
    var t = S.time;
    if (!isFn(c.setTransform)) return;
    c.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    drawBackground(t);
    S.screenObjects = [];
    if (S.mode === MODE_HUB) {
      var cx = S.width * 0.5;
      var cy = S.height * 0.52;
      var size = Math.min(S.width, S.height) * 0.17;
      drawGround(c, cx, cy, size, t);
      drawSkyways(t);
      S.zones.forEach(function (zone) { drawStructure(zone, t); });
      drawCore(cx, cy, size, t, 1);
      drawCreatures(t);
      drawPointerField(cx, cy, size);
      drawEvents(t);
      return;
    }
    var projected = [];
    S.objects.forEach(function (object) {
      var p = project(object);
      if (!p || p.x < -260 || p.x > S.width + 260 || p.y < -260 || p.y > S.height + 260) return;
      var radius = clamp(object.size * p.scale, 2, 190);
      S.screenObjects.push({ obj: object, x: p.x, y: p.y, radius: radius });
      projected.push({ obj: object, p: p, depth: p.depth });
    });
    projected.sort(function (a, b) { return b.depth - a.depth; });
    projected.forEach(function (item) { drawObject(item.obj, item.p, t); });
    var corePoint = project({ x: 0, y: 0, z: 260 });
    if (corePoint && corePoint.scale > 0.02) {
      drawCore(corePoint.x, corePoint.y, clamp(58 * corePoint.scale, 8, 130), t, clamp(corePoint.scale, 0, 1));
    }
    drawEvents(t);
    drawReticle();
  }

  function frame(now) {
    S.raf = global.requestAnimationFrame(frame);
    if (!S.mounted || S.hidden) return;
    var dt = S.last ? Math.min((now - S.last) / 1000, 0.05) : 0;
    S.last = now;
    if (!S.reduced) S.time += dt;
    update(dt);
    render();
  }

  function startLoop() {
    if (S.raf || !S.mounted || !isFn(global.requestAnimationFrame)) return;
    S.last = 0;
    S.raf = global.requestAnimationFrame(frame);
  }

  function onVisibility() {
    S.hidden = !!doc.hidden;
    if (S.hidden) {
      if (S.raf && isFn(global.cancelAnimationFrame)) {
        global.cancelAnimationFrame(S.raf);
        S.raf = 0;
      }
    } else {
      startLoop();
    }
  }

  function onMotion(event) {
    S.reduced = !!(event && event.matches);
    if (S.hub) S.hub.classList.toggle('is-reduced', S.reduced);
    computeTier();
  }

  function pointerPosition(event) {
    if (!S.refs.viewport || !isFn(S.refs.viewport.getBoundingClientRect)) return { x: S.width / 2, y: S.height / 2 };
    var rect = S.refs.viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function interactAt(x, y) {
    if (S.mode !== MODE_EXPLORE) return;
    var tx = typeof x === 'number' ? x : (S.pointer.inside ? S.pointer.x : S.width / 2);
    var ty = typeof y === 'number' ? y : (S.pointer.inside ? S.pointer.y : S.height / 2);
    var best = null;
    var bestDistance = Infinity;
    S.screenObjects.forEach(function (item) {
      var dx = item.x - tx;
      var dy = item.y - ty;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var threshold = Math.max(36, clamp(item.radius * 1.25, 0, 130));
      if (distance <= threshold && distance < bestDistance) {
        best = item.obj;
        bestDistance = distance;
      }
    });
    if (!best) {
      safe(S.ctx.notify, ['No hay señal cerca. Acércate a un objeto para interactuar.']);
      return;
    }
    discover(best);
  }

  function onKeyDown(event) {
    if (!S.mounted) return;
    var key = (event.key || '').toLowerCase();
    if (key === 'escape') {
      event.preventDefault();
      setMode(MODE_HUB);
      return;
    }
    if (S.mode !== MODE_EXPLORE) return;
    if (key === ' ' || key === 'space' || key === 'spacebar') {
      S.keys.up = 1;
      event.preventDefault();
    } else if (key === 'control') {
      S.keys.down = 1;
    } else if (key === 'shift') {
      S.keys.shift = 1;
    } else if (key === 'w' || key === 'arrowup') {
      S.keys.w = 1;
    } else if (key === 's' || key === 'arrowdown') {
      S.keys.s = 1;
    } else if (key === 'a' || key === 'arrowleft') {
      S.keys.a = 1;
    } else if (key === 'd' || key === 'arrowright') {
      S.keys.d = 1;
    } else if (key === 'e' || key === 'enter') {
      event.preventDefault();
      interactAt();
    }
  }

  function onKeyUp(event) {
    var key = (event.key || '').toLowerCase();
    if (key === ' ' || key === 'space' || key === 'spacebar') S.keys.up = 0;
    else if (key === 'control') S.keys.down = 0;
    else if (key === 'shift') S.keys.shift = 0;
    else if (key === 'w' || key === 'arrowup') S.keys.w = 0;
    else if (key === 's' || key === 'arrowdown') S.keys.s = 0;
    else if (key === 'a' || key === 'arrowleft') S.keys.a = 0;
    else if (key === 'd' || key === 'arrowright') S.keys.d = 0;
  }

  function onWheel(event) {
    if (S.mode !== MODE_EXPLORE) return;
    event.preventDefault();
    S.tween = null;
    S.cam.zoom = clamp(S.cam.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.45, 3.2);
  }

  function onViewportMove(event) {
    if (!S.refs.viewport) return;
    var point = pointerPosition(event);
    S.pointer.x = point.x;
    S.pointer.y = point.y;
    S.pointer.inside = true;
  }

  function bindTouch() {
    var r = S.refs;
    if (r.touchJoy) {
      on(r.touchJoy, 'pointerdown', function (event) {
        event.preventDefault();
        S.joyDrag = { id: event.pointerId, el: r.touchJoy };
        onViewportMove(event);
        moveJoy(event);
      });
      on(r.touchJoy, 'pointermove', moveJoy);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
        on(r.touchJoy, type, function () {
          S.joyDrag = null;
          S.touch.joyX = 0;
          S.touch.joyY = 0;
          if (r.touchNub) r.touchNub.style.transform = '';
        });
      });
    }
    if (r.touchLook) {
      on(r.touchLook, 'pointerdown', function (event) {
        S.lookDrag = { x: event.clientX, y: event.clientY };
      });
      on(r.touchLook, 'pointermove', function (event) {
        if (!S.lookDrag || S.mode !== MODE_EXPLORE) return;
        var dx = event.clientX - S.lookDrag.x;
        var dy = event.clientY - S.lookDrag.y;
        S.lookDrag.x = event.clientX;
        S.lookDrag.y = event.clientY;
        S.tween = null;
        S.cam.yaw += dx * 0.006;
        S.cam.pitch = clamp(S.cam.pitch + dy * 0.005, -1.15, 1.15);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
        on(r.touchLook, type, function () { S.lookDrag = null; });
      });
    }
    if (r.touchUp) bindHold(r.touchUp, 'up');
    if (r.touchDown) bindHold(r.touchDown, 'down');
    if (r.touchInteract) on(r.touchInteract, 'click', function () { interactAt(S.width / 2, S.height / 2); });
    if (r.touchBack) on(r.touchBack, 'click', function () { setMode(MODE_HUB); });
  }

  function moveJoy(event) {
    if (!S.joyDrag || !S.joyDrag.el || !isFn(S.joyDrag.el.getBoundingClientRect)) return;
    var rect = S.joyDrag.el.getBoundingClientRect();
    var dx = event.clientX - (rect.left + rect.width / 2);
    var dy = event.clientY - (rect.top + rect.height / 2);
    var length = Math.sqrt(dx * dx + dy * dy) || 1;
    var amount = Math.min(1, length / (rect.width * 0.38 || 1));
    S.touch.joyX = (dx / length) * amount;
    S.touch.joyY = (dy / length) * amount;
    if (S.refs.touchNub) {
      S.refs.touchNub.style.transform = 'translate(' + (S.touch.joyX * 22).toFixed(1) + 'px,' + (S.touch.joyY * 22).toFixed(1) + 'px)';
    }
  }

  function bindHold(element, key) {
    on(element, 'pointerdown', function (event) {
      event.preventDefault();
      S.keys[key] = 1;
      S.tween = null;
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
      on(element, type, function () { S.keys[key] = 0; });
    });
  }

  function mount(host, context) {
    if (!host || S.mounted) return;
    S.mounted = true;
    S.host = host;
    S.ctx = context || {};
    S.hub = q('.play-hub', host) || host;
    var rootSource = S.ctx.root;
    S.universeRoot = isFn(rootSource) ? rootSource() : (rootSource || q('[data-universe-root]', host) || host);
    S.mode = MODE_HUB;
    applyCamera(CENTER);
    S.keys = {};
    S.touch = { joyX: 0, joyY: 0 };
    S.pointer = { inside: false, x: 0, y: 0 };
    S.helpOpen = false;
    S.events = [];
    S.eventNext = {};
    S.eventTimers = [];
    S.scheduleTimer = 0;
    S.landMarks = [];
    S.tier = 'high';

    var refs = S.refs;
    refs.viewport = q('[data-hub-viewport]', S.hub);
    refs.zones = q('[data-hub-zones]', S.hub);
    refs.feed = q('[data-hub-feed]', S.hub);
    refs.context = q('[data-hub-context]', S.hub);
    refs.exploreButton = q('[data-explore-button]', S.hub);
    refs.returnButton = q('[data-hub-return]', S.hub);
    refs.helpToggle = q('[data-hub-help-toggle]', S.hub);
    refs.help = q('[data-hub-help]', S.hub);
    refs.controls = q('[data-explore-controls]', S.hub);
    refs.ctxEyebrow = q('[data-hub-context-eyebrow]', S.hub);
    refs.ctxTitle = q('[data-hub-context-title]', S.hub);
    refs.ctxText = q('[data-hub-context-text]', S.hub);
    refs.ctxMeta = q('[data-hub-context-meta]', S.hub);
    refs.ctxAction = q('[data-hub-context-action]', S.hub);
    refs.touchJoy = q('[data-touch-joy]', S.hub);
    refs.touchNub = q('[data-touch-joy-nub]', S.hub);
    refs.touchLook = q('[data-touch-look]', S.hub);
    refs.touchUp = q('[data-touch-up]', S.hub);
    refs.touchDown = q('[data-touch-down]', S.hub);
    refs.touchInteract = q('[data-touch-interact]', S.hub);
    refs.touchBack = q('[data-touch-back]', S.hub);

    S.canvas = q('[data-hub-canvas]', S.hub);
    if (!S.canvas && refs.viewport) {
      S.canvas = doc.createElement('canvas');
      S.canvas.setAttribute('data-hub-canvas', '');
      S.canvas.setAttribute('aria-hidden', 'true');
      refs.viewport.appendChild(S.canvas);
    }
    try {
      S.ctx2d = S.canvas && isFn(S.canvas.getContext) ? S.canvas.getContext('2d') : null;
    } catch (error) {
      S.ctx2d = null;
    }
    if (!S.ctx2d) {
      safe(S.ctx.showError, ['Tu navegador no puede mostrar el hub de OTRAVERSO PLAY.']);
      S.mounted = false;
      return;
    }

    seedWorld();
    if (S.hub) S.hub.setAttribute('data-hub-mode', MODE_HUB);
    if (S.universeRoot) S.universeRoot.setAttribute('data-mode', MODE_HUB);
    if (refs.feed) refs.feed.setAttribute('hidden', '');
    if (refs.help) refs.help.setAttribute('hidden', '');
    if (refs.helpToggle) refs.helpToggle.setAttribute('aria-expanded', 'false');
    if (refs.controls) refs.controls.setAttribute('hidden', '');
    if (refs.returnButton) refs.returnButton.setAttribute('hidden', '');
    if (refs.exploreButton) refs.exploreButton.removeAttribute('hidden');
    if (S.hub) S.hub.classList.remove('is-help-open');

    if (global.matchMedia) {
      S.motionQuery = global.matchMedia('(prefers-reduced-motion: reduce)');
      S.reduced = !!S.motionQuery.matches;
      if (isFn(S.motionQuery.addEventListener)) {
        S.motionQuery.addEventListener('change', onMotion);
        S.motionMode = 'addEventListener';
      } else if (isFn(S.motionQuery.addListener)) {
        S.motionQuery.addListener(onMotion);
        S.motionMode = 'addListener';
      }
    }
    if (S.hub) S.hub.classList.toggle('is-reduced', S.reduced);

    on(refs.exploreButton, 'click', function () { setMode(MODE_EXPLORE); });
    on(refs.returnButton, 'click', function () { setMode(MODE_HUB); });
    on(refs.helpToggle, 'click', toggleHelp);
    if (refs.ctxAction) on(refs.ctxAction, 'click', function () { if (S.selected) enterGame(S.selected); });
    on(doc, 'keydown', onKeyDown);
    on(doc, 'keyup', onKeyUp);
    on(doc, 'visibilitychange', onVisibility);
    on(global, 'resize', resize);
    if (refs.viewport) {
      on(refs.viewport, 'pointermove', onViewportMove, { passive: true });
      on(refs.viewport, 'pointerleave', function () { S.pointer.inside = false; });
      on(refs.viewport, 'click', function (event) {
        if (S.mode !== MODE_EXPLORE) return;
        var point = pointerPosition(event);
        interactAt(point.x, point.y);
      });
      on(refs.viewport, 'wheel', onWheel, { passive: false });
    }
    bindTouch();

    if (global.ResizeObserver && refs.viewport) {
      S.resizeObserver = new global.ResizeObserver(function () { resize(); });
      S.resizeObserver.observe(refs.viewport);
    }

    resize();
    loadGames();
    S.hidden = !!doc.hidden;
    startLoop();
    scheduleEvents(rand(2600, 4200));
  }

  function unmount() {
    if (!S.mounted) return;
    if (S.raf && isFn(global.cancelAnimationFrame)) {
      global.cancelAnimationFrame(S.raf);
      S.raf = 0;
    }
    offAll();
    clearEvents();
    clearTimers(S.timers);
    S.timers = [];
    if (S.resizeObserver && isFn(S.resizeObserver.disconnect)) S.resizeObserver.disconnect();
    S.resizeObserver = null;
    if (S.motionQuery) {
      if (S.motionMode === 'addEventListener' && isFn(S.motionQuery.removeEventListener)) {
        S.motionQuery.removeEventListener('change', onMotion);
      } else if (S.motionMode === 'addListener' && isFn(S.motionQuery.removeListener)) {
        S.motionQuery.removeListener(onMotion);
      }
    }
    S.motionQuery = null;
    S.motionMode = '';
    if (S.canvas && S.canvas.parentNode) S.canvas.parentNode.removeChild(S.canvas);
    if (S.hub) {
      S.hub.removeAttribute('data-hub-mode');
      S.hub.removeAttribute('data-hub-tier');
      S.hub.classList.remove('is-exploring');
      S.hub.classList.remove('is-help-open');
    }
    if (S.universeRoot) S.universeRoot.removeAttribute('data-mode');
    if (S.refs.feed) S.refs.feed.textContent = '';
    S.zones = [];
    S.games = [];
    S.screenObjects = [];
    S.landMarks = [];
    S.selected = null;
    S.tween = null;
    S.ctx = null;
    S.host = null;
    S.hub = null;
    S.universeRoot = null;
    S.refs = {};
    S.canvas = null;
    S.ctx2d = null;
    S.mounted = false;
  }

  function getState() {
    var discovered = [];
    Object.keys(S.discoveries).forEach(function (id) { discovered.push(id); });
    discovered.sort();
    var available = [];
    var games = [];
    S.games.forEach(function (game) {
      games.push({
        code: game.code, name: game.name, status: game.status,
        zone: game.zone, accent: game.accent, category: game.category
      });
      if (game.available) available.push(game.code);
    });
    return {
      mounted: S.mounted,
      mode: S.mode,
      reducedMotion: S.reduced,
      hidden: S.hidden,
      viewport: { width: Math.round(S.width), height: Math.round(S.height), dpr: round3(S.dpr) },
      camera: {
        x: round3(S.cam.x), y: round3(S.cam.y), z: round3(S.cam.z),
        yaw: round3(S.cam.yaw), pitch: round3(S.cam.pitch), zoom: round3(S.cam.zoom)
      },
      selectedGame: S.selected,
      games: games,
      availableGames: available,
      discovered: discovered,
      discoveryCount: discovered.length,
      objectCount: S.objects.length,
      zoneCount: S.zones.length,
      transitioning: !!S.tween,
      tier: S.tier,
      events: S.events.map(function (event) {
        return {
          id: event.id, label: event.label, priority: event.priority,
          progress: round3(eventProgress(event))
        };
      }),
      landMarks: S.landMarks.map(function (mark) {
        return { id: mark.id, name: mark.name, type: mark.type, x: round3(mark.x), y: round3(mark.y), z: round3(mark.z) };
      })
    };
  }

  O.HUB = {
    mount: mount,
    unmount: unmount,
    setMode: setMode,
    getMode: getMode,
    resetView: resetView,
    getState: getState
  };
})(window);
