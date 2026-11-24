(function () {
  'use strict';

  var stage = document.querySelector('.galaxy-stage');
  if (!stage) return;

  var canvas = stage.querySelector('.galaxy-canvas');
  var ui = stage.querySelector('.galaxy-ui');
  var nodes = Array.prototype.slice.call(stage.querySelectorAll('.world-node'));
  var indexItems = Array.prototype.slice.call(stage.querySelectorAll('[data-index]'));
  var secretNote = stage.querySelector('[data-secret-note]');
  var discoveryProgress = stage.querySelector('[data-discovery-progress]');
  var discoveryToggle = stage.querySelector('[data-discovery-toggle]');
  var discoveryPanel = stage.querySelector('[data-discovery-panel]');
  var discoveryOpen = false;
  var recenterButton = stage.querySelector('[data-recenter]');
  var hunterStart = stage.querySelector('[data-hunter-start]');
  var hunterPanel = stage.querySelector('[data-hunter-panel]');
  var hunterScore = stage.querySelector('[data-hunter-score]');
  var hunterTime = stage.querySelector('[data-hunter-time]');
  var hunterResult = stage.querySelector('[data-hunter-result]');
  var dialogs = {};
  Array.prototype.forEach.call(document.querySelectorAll('.world-detail[data-dialog]'), function (dialog) {
    dialogs[dialog.getAttribute('data-dialog')] = dialog;
  });
  var exploreButton = stage.querySelector('[data-explore-toggle]');
  var exploreLabel = stage.querySelector('[data-explore-label]');
  var modeNote = stage.querySelector('[data-mode-note]');
  var mapUniverse = stage.querySelector('[data-map-universe]');
  var mapPlanet = stage.querySelector('[data-map-planet]');
  var exploreHud = stage.querySelector('[data-explore-hud]');
  var exploreExit = stage.querySelector('[data-explore-exit]');
  var exploreName = stage.querySelector('[data-explore-universe-name]');
  var exploreStick = stage.querySelector('[data-explore-stick]');
  var exploreStickKnob = stage.querySelector('[data-explore-stick-knob]');
  var focusPanels = {};
  Array.prototype.forEach.call(stage.querySelectorAll('[data-universe-panel]'), function (panel) {
    focusPanels[panel.getAttribute('data-universe-panel')] = panel;
  });
  var universeData = [];
  var universeById = {};
  var configScript = document.getElementById('multiverso-config');
  if (configScript) {
    try {
      universeData = JSON.parse(configScript.textContent || '[]');
    } catch (error) {
      universeData = [];
    }
  }
  universeData.forEach(function (item) {
    universeById[item.id] = item;
  });

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var lowPower = (navigator.hardwareConcurrency || 4) <= 2 || (navigator.deviceMemory || 4) <= 2;
  var ctx = null;
  try {
    ctx = canvas && canvas.getContext ? canvas.getContext('2d', { alpha: false }) : null;
  } catch (error) {
    ctx = null;
  }
  if (!ctx) stage.classList.add('no-canvas');

  var TAU = Math.PI * 2;
  var worlds = [
    { id: 'shop', kind: 'market-nebula', color: '#54e8ff', accent: '#ffb55c', px: -0.52, py: -1.16, depth: -0.35, size: 0.148, base: -0.42, speed: 0.000018, spin: 0.00011, parallax: 9, ring: true, moons: true },
    { id: 'play', kind: 'digital-civilization', color: '#f472b6', accent: '#7dd3fc', px: 1.48, py: 0.34, depth: 0.5, size: 0.162, base: 0.78, speed: 0.000026, spin: 0.00014, parallax: 12, ring: true, moons: false, tech: true, satellites: 5 },
    { id: 'whatif', kind: 'narrative-nebula', color: '#c084fc', accent: '#ffd89b', px: 0.1, py: 1.36, depth: 0.2, size: 0.128, base: 1.56, speed: 0.000015, spin: 0.00017, parallax: 8, ring: false, moons: false },
    { id: 'labs', kind: 'quantum-reactor', color: '#38e8d0', accent: '#60a5fa', px: -0.92, py: -0.96, depth: -0.62, size: 0.108, base: 2.52, speed: 0.00002, spin: 0.00012, parallax: 8, ring: false, moons: false }
  ];
  var blackHoles = [
    { fx: -1.18, fy: 0.78, size: 0.082, spin: 0.00022, seed: 0.8 },
    { fx: 0.96, fy: -1.12, size: 0.062, spin: -0.00017, seed: 2.6 },
    { fx: 1.72, fy: 1.02, size: 0.05, spin: 0.00013, seed: 4.1 }
  ];
  var shopPalette = {
    ice: [229, 252, 255],
    cyan: [84, 232, 255],
    blue: [59, 130, 246],
    violet: [139, 92, 246],
    gold: [255, 181, 92],
    deep: [4, 6, 25]
  };
  var shopLand = [
    { x: -0.42, y: -0.34, w: 0.25, h: 0.1, a: -0.5, gold: false },
    { x: -0.1, y: -0.19, w: 0.33, h: 0.12, a: 0.18, gold: true },
    { x: 0.34, y: -0.31, w: 0.22, h: 0.09, a: -0.32, gold: false },
    { x: 0.2, y: 0.15, w: 0.3, h: 0.11, a: 0.42, gold: true },
    { x: -0.31, y: 0.33, w: 0.21, h: 0.08, a: -0.22, gold: false }
  ];
  var shopParcels = [
    { x: -0.36, y: -0.16, s: 0.1, a: -0.18 },
    { x: -0.07, y: -0.35, s: 0.09, a: 0.22 },
    { x: 0.27, y: -0.13, s: 0.105, a: -0.3 },
    { x: 0.4, y: 0.18, s: 0.085, a: 0.16 },
    { x: -0.24, y: 0.23, s: 0.095, a: 0.34 },
    { x: 0.03, y: 0.38, s: 0.08, a: -0.12 }
  ];

  var byId = {};
  var indexById = {};
  worlds.forEach(function (world, i) {
    world.rgb = hexRgb(world.color);
    world.argb = hexRgb(world.accent);
    world.seed = i * 1.7 + 0.6;
    world.el = stage.querySelector('.world-node[data-world="' + world.id + '"]');
    byId[world.id] = world;
    indexById[world.id] = stage.querySelector('[data-index="' + world.id + '"]');
  });
  var W = 1;
  var H = 1;
  var M = 1;
  var DPR = 1;
  var cx = 0;
  var cy = 0;
  var rx = 0;
  var ry = 0;
  var mobile = false;
  var medium = false;
  var starLayers = [];
  var spiral = [];
  var dust = [];
  var coreParticles = [];
  var nebula = null;
  var nebulaRect = null;
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var t = 0;
  var orbitalTime = 0;
  var motionStep = 16;
  var last = 0;
  var raf = 0;
  var running = false;
  var visible = true;
  var hovered = null;
  var openId = null;
  var lastTrigger = null;
  var warp = null;
  var warpProgress = 0;
  var noteTimer = 0;
  var view = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1, vx: 0, vy: 0, rot: 0, trot: 0, vrot: 0 };
  var viewInit = false;
  var exploreMode = false;
  var NAV_CONTRACT = 'navigation-1';
  var NAV_STATES = ['multiverse', 'universe', 'explore'];
  var NAV_EVENT = 'otraverso:navigation';
  var navMode = 'multiverse';
  var focusId = null;
  var selectedWorld = null;
  var freeStick = { active: false, id: null, x: 0, y: 0 };
  var currentLod = 'overview';
  var keys = {};
  var pointers = {};
  var pinch = null;
  var MIN_ZOOM = 0.35;
  var MAX_ZOOM = 7.2;
  var BOUND_FACTOR = 3.2;
  var ZOOM_SPEED = 0.0013;
  var FINE_ZOOM_SPEED = 0.00045;
  var OVERVIEW_ZOOM = 0.64;
  var RECENTER_ZOOM = OVERVIEW_ZOOM;
  var RECENTER_HOLD = 900;
  var HUNTER_DURATION = 32000;
  var recenterHoldUntil = 0;
  var drag = null;
  var events = [];
  var eventPool = [];
  var EVENT_POOL_CAP = lowPower ? 2 : 5;
  var EVENT_MIN_INTERVAL = lowPower ? 9000 : 4200;
  var EVENT_MAX_INTERVAL = lowPower ? 16000 : 11500;
  var EVENT_MAX_ACTIVE = lowPower ? 1 : 2;
  var EVENT_SPAWN_CHANCE = lowPower ? 0.55 : 0.82;
  var eventsSeeded = false;
  var eventSystem = { enabled: true, paused: false, clock: 0, next: 1400, spawned: 0, skipped: 0, lastType: '' };
  var EVENT_TYPES = [
    { type: 'drift', weight: 16, priority: 1, min: 9000, max: 15000, size: 1.4, color: [120, 205, 255], alt: [190, 160, 255] },
    { type: 'flare', weight: 15, priority: 2, min: 1500, max: 2800, size: 3.4, color: [255, 196, 128], alt: [130, 215, 255] },
    { type: 'wave', weight: 13, priority: 2, min: 2600, max: 4600, size: 22, color: [108, 220, 255], alt: [150, 120, 255] },
    { type: 'anomaly', weight: 11, priority: 3, min: 3200, max: 5400, size: 30, color: [175, 145, 255], alt: [90, 230, 255] },
    { type: 'creature', weight: 9, priority: 3, min: 5600, max: 9400, size: 18, color: [125, 255, 205], alt: [80, 190, 255] },
    { type: 'meteor', weight: 9, priority: 4, min: 3400, max: 5800, size: 3, color: [255, 190, 130], alt: [255, 235, 205], heavy: true },
    { type: 'alien-ship', weight: 8, priority: 4, min: 7000, max: 11500, size: 14, color: [120, 235, 255], alt: [255, 205, 145] },
    { type: 'secret-signal', weight: 6, priority: 5, min: 4200, max: 7400, size: 16, color: [150, 255, 225], alt: [110, 190, 255] },
    { type: 'unknown-planet', weight: 4, priority: 5, min: 8000, max: 13000, size: 17, color: [200, 170, 255], alt: [120, 225, 255], heavy: true, rare: true },
    { type: 'portal', weight: 4, priority: 6, min: 1800, max: 3200, size: 30, color: [180, 130, 255], alt: [120, 240, 255], rare: true },
    { type: 'encounter', weight: 4, priority: 7, min: 4600, max: 7400, size: 12, color: [255, 140, 180], alt: [125, 220, 255], heavy: true, rare: true },
    { type: 'meteor-storm', weight: 7, priority: 4, min: 4200, max: 7600, size: 4, color: [255, 200, 140], alt: [255, 240, 210], heavy: true },
    { type: 'nebula-bloom', weight: 8, priority: 2, min: 6000, max: 10000, size: 78, color: [150, 110, 255], alt: [90, 235, 255] },
    { type: 'alien-fleet', weight: 7, priority: 5, min: 8000, max: 13000, size: 14, color: [120, 255, 200], alt: [255, 140, 180], heavy: true },
    { type: 'distress-signal', weight: 6, priority: 5, min: 5000, max: 9000, size: 18, color: [255, 220, 120], alt: [255, 120, 160] },
    { type: 'supernova', weight: 5, priority: 6, min: 2600, max: 4200, size: 46, color: [255, 240, 200], alt: [130, 200, 255], heavy: true, rare: true },
    { type: 'wormhole', weight: 4, priority: 7, min: 4000, max: 7000, size: 34, color: [180, 120, 255], alt: [110, 255, 230], rare: true },
    { type: 'black-hole', weight: 3, priority: 8, min: 11000, max: 18000, size: 44, color: [18, 8, 40], alt: [255, 170, 90], heavy: true, rare: true },
    { type: 'mega-structure', weight: 4, priority: 6, min: 9000, max: 15000, size: 38, color: [180, 220, 255], alt: [255, 180, 120], rare: true }
  ];
  var discoveryKey = 'otraverso.discoveries.v1';
  var discoveries = {};
  var secrets = [];
  var hunter = {
    active: false,
    startedAt: 0,
    endsAt: 0,
    score: 0,
    waves: 0,
    timer: 0,
    fragments: [],
    sparks: [],
    zone: { x: 0, y: 0, r: 0 },
    beacon: { x: 0, y: 0, opacity: 0 }
  };
  loadDiscoveries();
  registerSecret({
    id: 'alien-ship', kind: 'ship', note: 'SEÑAL NO CATALOGADA · NAVE EXTRATERRESTRE DETECTADA',
    factorX: 4.6, factorY: -3.2, driftX: 0.1, driftY: 0.08,
    size: 22, minSize: 13, maxSize: 42, hitRadius: 24
  });
  registerSecret({
    id: 'universe-marble', kind: 'marble', note: 'ESFERA PRISMA · UNIVERSO INTERNO DETECTADO',
    factorX: 3.8, factorY: 3.4, driftX: 0.08, driftY: 0.07,
    size: 26, minSize: 16, maxSize: 52, hitRadius: 26
  });
  updateDiscoveryProgress();

  function hexRgb(value) {
    var hex = String(value || '#ffffff').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var number = parseInt(hex, 16);
    if (isNaN(number)) return [255, 255, 255];
    return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function eventLocation() {
    var spanX = W / view.z;
    var spanY = H / view.z;
    var left = view.x - spanX / 2;
    var top = view.y - spanY / 2;
    var start = mobile ? 0.06 : 0.32;
    return {
      x: left + spanX * (start + Math.random() * (1 - start)),
      y: top + spanY * (0.12 + Math.random() * 0.76)
    };
  }

  function pickEventType() {
    var pool = [];
    var total = 0;
    var i;
    for (i = 0; i < EVENT_TYPES.length; i++) {
      var def = EVENT_TYPES[i];
      if (lowPower && def.heavy) continue;
      if (def.rare && !lowPower && Math.random() < 0.35) continue;
      pool.push(def);
      total += def.weight;
    }
    if (!pool.length) return EVENT_TYPES[0];
    var roll = Math.random() * total;
    for (i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function releaseEvent(event) {
    if (!event) return;
    event.active = false;
    event.def = null;
    if (event.shots) event.shots.length = 0;
    if (event.parts) event.parts.length = 0;
    if (eventPool.length < EVENT_POOL_CAP) eventPool.push(event);
  }

  function clearEvents() {
    for (var i = 0; i < events.length; i++) releaseEvent(events[i]);
    events.length = 0;
  }

  function spawnMeteorParts(event, spanX, spanY, count) {
    for (var i = 0; i < count; i++) {
      var spread = (i - (count - 1) / 2) / count;
      var angle = Math.PI * 0.5 + spread * 1.4 + (Math.random() - 0.5) * 0.24;
      var speed = 0.28 + Math.random() * 0.22;
      event.parts.push({
        x: event.x + spread * spanX * 0.8,
        y: event.y - spanY * 0.45 - Math.random() * spanY * 0.25,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.2 + Math.random() * 1.6,
        hit: false
      });
    }
  }

  function makeEvent(def) {
    if (!def) def = pickEventType();
    var event = eventPool.pop() || {};
    var place = eventLocation();
    var spanX = W / view.z;
    var spanY = H / view.z;
    var duration = def.min + Math.random() * (def.max - def.min);
    var fromLeft = Math.random() > 0.5;
    event.type = def.type;
    event.def = def;
    event.priority = def.priority;
    event.frequency = def.weight;
    event.rare = !!def.rare;
    event.x = place.x;
    event.y = place.y;
    event.vx = 0;
    event.vy = 0;
    event.life = duration;
    event.maxLife = duration;
    event.size = def.size * (0.82 + Math.random() * 0.36);
    event.color = def.color;
    event.alt = def.alt;
    event.phase = Math.random() * TAU;
    event.seed = Math.random() * 1000;
    event.active = true;
    event.cooldown = 0;
    event.hit = 0;
    event.impactX = 0;
    event.impactY = 0;
    event.angle = 0;
    event.shots = event.shots || [];
    event.parts = event.parts || [];
    event.shots.length = 0;
    event.parts.length = 0;
    if (event.type === 'drift') {
      event.x = fromLeft ? view.x - spanX / 2 - 50 : view.x + spanX / 2 + 50;
      event.y = view.y - spanY / 2 + spanY * (0.12 + Math.random() * 0.76);
      event.vx = (fromLeft ? 1 : -1) * spanX * (0.00011 + Math.random() * 0.00007);
      event.vy = (Math.random() - 0.5) * 0.012;
    } else if (event.type === 'alien-ship') {
      event.x = fromLeft ? view.x - spanX / 2 - 70 : view.x + spanX / 2 + 70;
      event.y = view.y - spanY / 2 + spanY * (0.18 + Math.random() * 0.6);
      event.vx = (fromLeft ? 1 : -1) * spanX * (0.00017 + Math.random() * 0.00008);
      event.vy = (Math.random() - 0.5) * 0.018;
    } else if (event.type === 'creature') {
      event.vx = (Math.random() - 0.5) * 0.018;
      event.vy = (Math.random() - 0.5) * 0.012;
    } else if (event.type === 'encounter') {
      event.angle = Math.random() < 0.5 ? 0 : Math.PI;
      event.vx = Math.cos(event.angle) * 0.012;
      event.vy = Math.sin(event.angle) * 0.006;
      event.cooldown = 320;
    } else if (event.type === 'meteor' || event.type === 'meteor-storm') {
      spawnMeteorParts(event, spanX, spanY, event.type === 'meteor-storm' ? (lowPower ? 5 : 11) : (lowPower ? 3 : 6));
    } else if (event.type === 'alien-fleet') {
      event.angle = fromLeft ? 0 : Math.PI;
      event.vx = (fromLeft ? 1 : -1) * spanX * 0.00012;
      event.vy = (Math.random() - 0.5) * 0.01;
      var fleetCount = lowPower ? 3 : 5;
      for (var f = 0; f < fleetCount; f++) {
        event.parts.push({
          x: (f - (fleetCount - 1) / 2) * event.size * 2.4,
          y: Math.sin(f * 1.7) * event.size * 1.2,
          size: event.size * (0.45 + Math.random() * 0.18),
          phase: Math.random() * TAU
        });
      }
    } else if (event.type === 'unknown-planet' || event.type === 'black-hole') {
      event.vx = (Math.random() > 0.5 ? 1 : -1) * 0.009;
      event.vy = (Math.random() - 0.5) * 0.006;
    }
    eventSystem.spawned++;
    eventSystem.lastType = def.type;
    return event;
  }

  function updateEncounter(event, delta) {
    event.cooldown -= delta;
    var progress = 1 - event.life / event.maxLife;
    if (event.cooldown <= 0 && event.shots.length < (lowPower ? 2 : 4) && progress < 0.82) {
      var offset = event.size * 3.6;
      var fromX = event.x - Math.cos(event.angle) * offset;
      var fromY = event.y - Math.sin(event.angle) * offset;
      var toX = event.x + Math.cos(event.angle) * offset;
      var toY = event.y + Math.sin(event.angle) * offset;
      var angle = Math.atan2(toY - fromY, toX - fromX) + (Math.random() - 0.5) * 0.09;
      var speed = 0.45 + Math.random() * 0.2;
      event.shots.push({
        x: fromX,
        y: fromY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1400,
        color: event.shots.length % 2 ? event.alt : event.color
      });
      event.cooldown = (lowPower ? 620 : 380) + Math.random() * 260;
    }
    for (var i = event.shots.length - 1; i >= 0; i--) {
      var shot = event.shots[i];
      shot.x += shot.vx * delta;
      shot.y += shot.vy * delta;
      shot.life -= delta;
      if (shot.life <= 0 || Math.abs(shot.x - event.x) > event.size * 9) {
        event.hit = 1;
        event.shots.splice(i, 1);
      }
    }
    event.hit = Math.max(0, event.hit - delta * 0.002);
  }

  function updateMeteor(event, delta, spanX, spanY) {
    var active = 0;
    for (var i = 0; i < event.parts.length; i++) {
      var part = event.parts[i];
      if (part.hit) continue;
      active++;
      part.x += part.vx * delta;
      part.y += part.vy * delta;
      if (part.y > event.y + spanY * 0.18 || part.x < view.x - spanX || part.x > view.x + spanX) {
        part.hit = true;
        event.hit = 1;
        event.impactX = part.x;
        event.impactY = Math.min(part.y, event.y + spanY * 0.18);
      }
    }
    event.hit = Math.max(0, event.hit - delta * 0.0009);
    if (active === 0 && event.life > 700) event.life = 700;
  }

  function updateEvents(delta) {
    if (!eventSystem.enabled || eventSystem.paused || reduce || warp || !visible) return;
    eventSystem.clock += delta;
    var minInterval = navMode === 'explore' ? Math.max(1800, EVENT_MIN_INTERVAL * 0.45) : EVENT_MIN_INTERVAL;
    var maxInterval = navMode === 'explore' ? Math.max(minInterval + 900, EVENT_MAX_INTERVAL * 0.55) : EVENT_MAX_INTERVAL;
    var maxActive = navMode === 'explore' ? Math.max(EVENT_MAX_ACTIVE, lowPower ? 2 : 3) : EVENT_MAX_ACTIVE;
    if (eventSystem.clock >= eventSystem.next) {
      eventSystem.clock = 0;
      eventSystem.next = minInterval + Math.random() * (maxInterval - minInterval);
      if (Math.random() <= (navMode === 'explore' ? Math.max(EVENT_SPAWN_CHANCE, 0.92) : EVENT_SPAWN_CHANCE)) {
        var def = pickEventType();
        if (events.length >= maxActive) {
          var victim = -1;
          for (var v = 0; v < events.length; v++) {
            if (victim < 0 || events[v].priority < events[victim].priority) victim = v;
          }
          if (victim >= 0 && def.priority > events[victim].priority) {
            releaseEvent(events[victim]);
            events.splice(victim, 1);
          } else {
            def = null;
            eventSystem.skipped++;
          }
        }
        if (def) events.push(makeEvent(def));
      } else {
        eventSystem.skipped++;
      }
    }
    var spanX = W / view.z;
    var spanY = H / view.z;
    for (var i = events.length - 1; i >= 0; i--) {
      var event = events[i];
      event.life -= delta;
      event.x += event.vx * delta;
      event.y += event.vy * delta;
      if (event.type === 'encounter') updateEncounter(event, delta);
      else if (event.type === 'meteor' || event.type === 'meteor-storm') updateMeteor(event, delta, spanX, spanY);
      if (event.type === 'drift' || event.type === 'alien-ship' || event.type === 'alien-fleet') {
        if (event.x < view.x - spanX * 0.75 || event.x > view.x + spanX * 0.75 || event.y < view.y - spanY || event.y > view.y + spanY) event.life = 0;
      }
      if (event.life <= 0) {
        releaseEvent(event);
        events.splice(i, 1);
      }
    }
  }

  function drawEventDrift(event, alpha) {
    ctx.save();
    ctx.strokeStyle = rgba(event.color, alpha * 0.3);
    ctx.lineWidth = Math.max(0.8, event.size * 0.7);
    ctx.beginPath();
    ctx.moveTo(event.x, event.y);
    ctx.lineTo(event.x - event.vx * 220, event.y - event.vy * 220);
    ctx.stroke();
    ctx.fillStyle = rgba(event.alt, alpha * 0.9);
    ctx.beginPath();
    ctx.arc(event.x, event.y, Math.max(0.9, event.size), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEventFlare(event, alpha, progress) {
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.rotate(event.phase + progress * 0.5);
    var outer = event.size * (2.5 + progress * 4);
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, outer);
    glow.addColorStop(0, rgba([255, 255, 255], alpha * 0.55));
    glow.addColorStop(0.3, rgba(event.color, alpha * 0.3));
    glow.addColorStop(1, rgba(event.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, TAU);
    ctx.fill();
    for (var i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      var length = event.size * (2.4 + progress * 6);
      var beam = ctx.createLinearGradient(0, 0, length, 0);
      beam.addColorStop(0, rgba(event.color, alpha * 0.4));
      beam.addColorStop(1, rgba(event.alt, 0));
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(0, -event.size * 0.16);
      ctx.lineTo(length, 0);
      ctx.lineTo(0, event.size * 0.16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = rgba(event.alt, alpha * (1 - progress) * 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, event.size * (1 + progress * 3), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawEventShip(event, alpha) {
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.rotate(Math.atan2(event.vy, event.vx));
    var size = event.size;
    var trail = ctx.createLinearGradient(-size * 8, 0, 0, 0);
    trail.addColorStop(0, rgba(event.color, 0));
    trail.addColorStop(1, rgba(event.color, alpha * 0.4));
    ctx.fillStyle = trail;
    ctx.beginPath();
    ctx.moveTo(-size * 8, -size * 0.1);
    ctx.lineTo(0, -size * 0.4);
    ctx.lineTo(0, size * 0.4);
    ctx.lineTo(-size * 8, size * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(6,14,34,0.92)';
    ctx.strokeStyle = rgba(event.color, alpha * 0.9);
    ctx.lineWidth = Math.max(0.8, size * 0.05);
    ctx.beginPath();
    ctx.moveTo(-size * 1.3, 0);
    ctx.lineTo(-size * 0.4, -size * 0.42);
    ctx.lineTo(size * 0.85, -size * 0.24);
    ctx.lineTo(size * 1.35, 0);
    ctx.lineTo(size * 0.85, size * 0.24);
    ctx.lineTo(-size * 0.4, size * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba(event.alt, alpha * (0.6 + 0.4 * Math.sin(t * 0.006 + event.phase)));
    ctx.beginPath();
    ctx.arc(size * 0.15, 0, size * 0.14, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEventCreature(event, alpha) {
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.rotate(Math.sin(t * 0.0003 + event.phase) * 0.3);
    var size = event.size;
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.6);
    glow.addColorStop(0, rgba(event.color, alpha * 0.34));
    glow.addColorStop(0.5, rgba(event.alt, alpha * 0.12));
    glow.addColorStop(1, rgba(event.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, size * 2.6, 0, TAU);
    ctx.fill();
    var arms = lowPower ? 3 : 5;
    for (var i = 0; i < arms; i++) {
      var a = i * TAU / arms + t * 0.0004;
      var wobble = Math.sin(t * 0.0011 + i * 1.4 + event.phase) * size * 0.4;
      ctx.strokeStyle = rgba(i % 2 ? event.alt : event.color, alpha * 0.42);
      ctx.lineWidth = Math.max(0.7, size * 0.09);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * size * 0.5, Math.sin(a) * size * 0.5);
      ctx.quadraticCurveTo(
        Math.cos(a) * size * 1.5 + wobble,
        Math.sin(a) * size * 1.5 - wobble,
        Math.cos(a + 0.3) * size * 2.1,
        Math.sin(a + 0.3) * size * 2.1
      );
      ctx.stroke();
    }
    var body = ctx.createRadialGradient(-size * 0.3, -size * 0.35, 0, 0, 0, size);
    body.addColorStop(0, rgba([230, 255, 245], alpha * 0.8));
    body.addColorStop(0.45, rgba(event.color, alpha * 0.55));
    body.addColorStop(1, rgba(event.alt, 0));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEncounterCraft(x, color, alpha, direction, size) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(direction, 1);
    ctx.fillStyle = 'rgba(7,12,32,0.92)';
    ctx.strokeStyle = rgba(color, alpha * 0.9);
    ctx.lineWidth = Math.max(0.8, size * 0.06);
    ctx.beginPath();
    ctx.moveTo(-size * 1.1, 0);
    ctx.lineTo(size * 0.5, -size * 0.5);
    ctx.lineTo(size * 1.2, 0);
    ctx.lineTo(size * 0.5, size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba([255, 255, 255], alpha * 0.8);
    ctx.beginPath();
    ctx.arc(size * 0.2, 0, size * 0.13, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEventEncounter(event, alpha) {
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.rotate(event.angle);
    var offset = event.size * 3.6;
    drawEncounterCraft(-offset, event.color, alpha, 1, event.size);
    drawEncounterCraft(offset, event.alt, alpha, -1, event.size);
    ctx.restore();
    for (var i = 0; i < event.shots.length; i++) {
      var shot = event.shots[i];
      var life = Math.min(1, shot.life / 420);
      ctx.save();
      ctx.strokeStyle = rgba(shot.color, alpha * life * 0.8);
      ctx.lineWidth = Math.max(1, event.size * 0.12);
      ctx.beginPath();
      ctx.moveTo(shot.x, shot.y);
      ctx.lineTo(shot.x - shot.vx * 46, shot.y - shot.vy * 46);
      ctx.stroke();
      ctx.fillStyle = rgba([255, 255, 255], alpha * life);
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, Math.max(1, event.size * 0.1), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    if (event.hit > 0.02) {
      ctx.save();
      var flash = ctx.createRadialGradient(event.x, event.y, 0, event.x, event.y, event.size * 6);
      flash.addColorStop(0, rgba([255, 255, 255], alpha * event.hit * 0.7));
      flash.addColorStop(1, rgba(event.alt, 0));
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.arc(event.x, event.y, event.size * 6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawEventMeteorStorm(event, alpha) {
    drawEventMeteor(event, alpha * 0.92);
    ctx.save();
    ctx.strokeStyle = rgba(event.alt, alpha * 0.1);
    ctx.lineWidth = Math.max(1, event.size * 0.4);
    ctx.beginPath();
    ctx.arc(event.x, event.y, event.size * 12, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawEventNebulaBloom(event, alpha, progress) {
    var radius = event.size * (0.7 + progress * 0.8);
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.rotate(event.phase + progress * 0.5);
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    glow.addColorStop(0, rgba(event.alt, alpha * 0.24));
    glow.addColorStop(0.4, rgba(event.color, alpha * 0.16));
    glow.addColorStop(1, rgba(event.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    for (var i = 0; i < 5; i++) {
      ctx.strokeStyle = rgba(i % 2 ? event.alt : event.color, alpha * 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * (0.44 + i * 0.12), radius * (0.2 + i * 0.08), i * 0.9, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEventFleet(event, alpha) {
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.rotate(event.angle);
    for (var i = 0; i < event.parts.length; i++) {
      var part = event.parts[i];
      var pulse = 0.82 + 0.18 * Math.sin(orbitalTime * 0.004 + part.phase);
      ctx.strokeStyle = rgba(event.color, alpha * 0.2 * pulse);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(part.x - part.size * 3, part.y);
      ctx.lineTo(part.x - part.size * 8, part.y);
      ctx.stroke();
      ctx.fillStyle = rgba(i % 2 ? event.alt : event.color, alpha * pulse);
      ctx.beginPath();
      ctx.moveTo(part.x + part.size, part.y);
      ctx.lineTo(part.x - part.size, part.y - part.size * 0.62);
      ctx.lineTo(part.x - part.size * 0.5, part.y);
      ctx.lineTo(part.x - part.size, part.y + part.size * 0.62);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEventDistress(event, alpha, progress) {
    var pulse = 0.6 + 0.4 * Math.sin(orbitalTime * 0.006 + event.phase);
    ctx.save();
    ctx.translate(event.x, event.y);
    for (var i = 0; i < 3; i++) {
      var radius = event.size * (1.1 + i * 0.8 + progress * 1.4);
      ctx.strokeStyle = rgba(i % 2 ? event.alt : event.color, alpha * (0.28 - i * 0.07) * pulse);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.rotate(Math.PI / 4 + orbitalTime * 0.001);
    ctx.fillStyle = rgba(event.color, alpha * (0.6 + pulse * 0.4));
    ctx.fillRect(-event.size * 0.42, -event.size * 0.42, event.size * 0.84, event.size * 0.84);
    ctx.fillStyle = rgba([255, 255, 255], alpha);
    ctx.fillRect(-event.size * 0.12, -event.size * 0.12, event.size * 0.24, event.size * 0.24);
    ctx.restore();
  }

  function drawEventSupernova(event, alpha, progress) {
    ctx.save();
    ctx.translate(event.x, event.y);
    var radius = event.size * (0.5 + progress * 3.4);
    for (var i = 0; i < 12; i++) {
      var angle = i * TAU / 12 + event.phase;
      ctx.strokeStyle = rgba(i % 2 ? event.alt : event.color, alpha * (0.34 - progress * 0.24));
      ctx.lineWidth = Math.max(1, event.size * 0.14);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * event.size * 0.35, Math.sin(angle) * event.size * 0.35);
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      ctx.stroke();
    }
    for (var r = 0; r < 3; r++) {
      ctx.strokeStyle = rgba(r === 1 ? event.alt : event.color, alpha * (0.5 - r * 0.12) * (1 - progress * 0.6));
      ctx.lineWidth = Math.max(1, event.size * (0.1 - r * 0.02));
      ctx.beginPath();
      ctx.arc(0, 0, radius * (0.5 + r * 0.32), 0, TAU);
      ctx.stroke();
    }
    var core = ctx.createRadialGradient(0, 0, 0, 0, 0, event.size * 1.5);
    core.addColorStop(0, rgba([255, 255, 255], alpha));
    core.addColorStop(0.25, rgba(event.color, alpha * 0.8));
    core.addColorStop(1, rgba(event.alt, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, event.size * 1.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEventWormhole(event, alpha, progress) {
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.rotate(event.phase + progress * 2.6);
    for (var i = 0; i < 7; i++) {
      var radius = event.size * (0.24 + i * 0.17);
      ctx.strokeStyle = rgba(i % 2 ? event.alt : event.color, alpha * (0.42 - i * 0.045));
      ctx.lineWidth = Math.max(0.7, event.size * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, radius, i * 0.6, i * 0.6 + Math.PI * 1.45);
      ctx.stroke();
    }
    var throat = ctx.createRadialGradient(0, 0, 0, 0, 0, event.size * 0.34);
    throat.addColorStop(0, rgba([255, 255, 255], alpha * 0.7));
    throat.addColorStop(1, rgba(event.color, 0));
    ctx.fillStyle = throat;
    ctx.beginPath();
    ctx.arc(0, 0, event.size * 0.34, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEventBlackHole(event, alpha, progress) {
    var radius = event.size * (1 + progress * 0.18);
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.rotate(event.phase + orbitalTime * 0.0004);
    var glow = ctx.createRadialGradient(0, 0, radius * 0.4, 0, 0, radius * 3.2);
    glow.addColorStop(0, rgba(event.alt, alpha * 0.18));
    glow.addColorStop(0.35, rgba(event.color, alpha * 0.34));
    glow.addColorStop(1, rgba(event.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 3.2, 0, TAU);
    ctx.fill();
    for (var i = 0; i < 4; i++) {
      ctx.strokeStyle = rgba(i % 2 ? event.alt : [255, 210, 150], alpha * (0.4 - i * 0.07));
      ctx.lineWidth = Math.max(0.8, radius * (0.08 - i * 0.012));
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * (1.5 + i * 0.42), radius * (0.42 + i * 0.12), i * 0.34, 0, TAU);
      ctx.stroke();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(2,3,12,' + alpha + ')';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.78, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba([255, 255, 255], alpha * 0.42);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.82, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawEventMegaStructure(event, alpha, progress) {
    var spin = event.phase + orbitalTime * 0.0003 + progress * 0.8;
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.rotate(spin);
    for (var i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate(i * TAU / 6);
      ctx.fillStyle = rgba(i % 2 ? event.alt : event.color, alpha * 0.28);
      ctx.fillRect(event.size * 0.38, -event.size * 0.09, event.size * 1.15, event.size * 0.18);
      ctx.restore();
    }
    ctx.strokeStyle = rgba(event.color, alpha * 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, event.size * 1.45, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = rgba([255, 255, 255], alpha * 0.7);
    ctx.beginPath();
    ctx.arc(0, 0, event.size * 0.32, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEventMeteor(event, alpha) {
    ctx.save();
    for (var i = 0; i < event.parts.length; i++) {
      var part = event.parts[i];
      if (part.hit) continue;
      var length = Math.max(14, Math.sqrt(part.vx * part.vx + part.vy * part.vy) * 62);
      var angle = Math.atan2(part.vy, part.vx);
      var tail = ctx.createLinearGradient(part.x, part.y, part.x - Math.cos(angle) * length, part.y - Math.sin(angle) * length);
      tail.addColorStop(0, rgba(event.alt, alpha * 0.85));
      tail.addColorStop(1, rgba(event.color, 0));
      ctx.strokeStyle = tail;
      ctx.lineWidth = Math.max(0.8, part.size);
      ctx.beginPath();
      ctx.moveTo(part.x, part.y);
      ctx.lineTo(part.x - Math.cos(angle) * length, part.y - Math.sin(angle) * length);
      ctx.stroke();
      ctx.fillStyle = rgba([255, 250, 235], alpha * 0.95);
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, TAU);
      ctx.fill();
    }
    if (event.hit > 0.02) {
      var ix = typeof event.impactX === 'number' ? event.impactX : event.x;
      var iy = typeof event.impactY === 'number' ? event.impactY : event.y;
      var impact = ctx.createRadialGradient(ix, iy, 0, ix, iy, event.size * 9);
      impact.addColorStop(0, rgba([255, 255, 255], alpha * event.hit * 0.75));
      impact.addColorStop(0.35, rgba(event.color, alpha * event.hit * 0.32));
      impact.addColorStop(1, rgba(event.color, 0));
      ctx.fillStyle = impact;
      ctx.beginPath();
      ctx.arc(ix, iy, event.size * 9, 0, TAU);
      ctx.fill();
      for (var k = 0; k < 3; k++) {
        ctx.strokeStyle = rgba(event.alt, alpha * event.hit * (0.4 - k * 0.1));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ix, iy, event.size * (1.5 + k * 1.7 + (1 - event.hit) * 5), 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEventWave(event, alpha, progress) {
    ctx.save();
    ctx.translate(event.x, event.y);
    for (var i = 0; i < 3; i++) {
      var phase = corePhase(progress * 1.4 + i / 3);
      ctx.strokeStyle = rgba(i % 2 ? event.alt : event.color, alpha * (1 - phase) * 0.45);
      ctx.lineWidth = Math.max(0.8, event.size * 0.04 * (1 - phase));
      ctx.beginPath();
      ctx.ellipse(0, 0, event.size * (0.6 + phase * 3.2), event.size * (0.25 + phase * 1.1), event.phase * 0.1, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEventAnomaly(event, alpha, progress) {
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.rotate(progress * 0.6 + event.phase * 0.1);
    var size = event.size;
    var field = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 1.8);
    field.addColorStop(0, rgba(event.color, 0));
    field.addColorStop(0.52, rgba(event.color, alpha * 0.1));
    field.addColorStop(0.7, rgba(event.alt, alpha * 0.3));
    field.addColorStop(1, rgba(event.color, 0));
    ctx.fillStyle = field;
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.8, 0, TAU);
    ctx.fill();
    for (var i = 0; i < 3; i++) {
      ctx.strokeStyle = rgba(i === 1 ? event.alt : event.color, alpha * (0.42 - i * 0.09));
      ctx.lineWidth = Math.max(0.7, size * 0.035);
      ctx.beginPath();
      ctx.arc(0, 0, size * (0.75 + i * 0.24), t * 0.0005 + i, t * 0.0005 + i + 1.8);
      ctx.stroke();
    }
    var points = lowPower ? 5 : 9;
    for (var j = 0; j < points; j++) {
      var a = j * 2.399 + t * 0.0007;
      var radius = size * (0.6 + ((j * 37) % 55) / 100);
      ctx.fillStyle = rgba(j % 3 ? event.alt : [255, 255, 255], alpha * 0.7);
      ctx.fillRect(Math.cos(a) * radius, Math.sin(a) * radius * 0.85, 1.3, 1.3);
    }
    ctx.restore();
  }

  function drawEventSignal(event, alpha, progress) {
    ctx.save();
    ctx.translate(event.x, event.y);
    var pulse = 0.5 + 0.5 * Math.sin(t * 0.004 + event.phase);
    ctx.setLineDash([3, 7]);
    ctx.lineDashOffset = -t * 0.01;
    ctx.strokeStyle = rgba(event.color, alpha * (0.22 + pulse * 0.35));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, event.size * (1.1 + progress * 0.5), 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = rgba(i === 1 ? event.alt : event.color, alpha * (0.35 + pulse * 0.5));
      ctx.fillRect(-event.size * 0.7 + i * event.size * 0.7, -1, event.size * 0.45, 2);
    }
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, event.size * 1.1);
    glow.addColorStop(0, rgba([255, 255, 255], alpha * (0.5 + pulse * 0.3)));
    glow.addColorStop(1, rgba(event.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, event.size * 1.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEventPortal(event, alpha, progress) {
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.rotate(event.phase * 0.2);
    ctx.scale(1, 0.55);
    var outer = event.size * (0.6 + Math.sin(progress * Math.PI) * 0.7);
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, outer * 1.5);
    glow.addColorStop(0, rgba([255, 255, 255], alpha * 0.5));
    glow.addColorStop(0.4, rgba(event.alt, alpha * 0.3));
    glow.addColorStop(1, rgba(event.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, outer * 1.5, 0, TAU);
    ctx.fill();
    for (var i = 0; i < 3; i++) {
      ctx.strokeStyle = rgba(i === 1 ? event.color : event.alt, alpha * (0.6 - i * 0.14));
      ctx.lineWidth = Math.max(0.8, event.size * 0.04);
      ctx.beginPath();
      ctx.arc(0, 0, outer * (0.5 + i * 0.22), t * 0.001 * (i % 2 ? -1 : 1), t * 0.001 * (i % 2 ? -1 : 1) + 2.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEventPlanet(event, alpha) {
    ctx.save();
    ctx.translate(event.x, event.y);
    var size = event.size;
    var glow = ctx.createRadialGradient(0, 0, size * 0.4, 0, 0, size * 2.6);
    glow.addColorStop(0, rgba(event.alt, alpha * 0.28));
    glow.addColorStop(1, rgba(event.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, size * 2.6, 0, TAU);
    ctx.fill();
    var body = ctx.createRadialGradient(-size * 0.35, -size * 0.4, 0, 0, 0, size);
    body.addColorStop(0, rgba(event.alt, alpha * 0.85));
    body.addColorStop(0.5, rgba(event.color, alpha * 0.5));
    body.addColorStop(1, rgba(3, 4, 16, 0.96));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.rotate(-0.24);
    ctx.scale(1, 0.32);
    ctx.strokeStyle = rgba(event.alt, alpha * 0.45);
    ctx.lineWidth = Math.max(0.7, size * 0.06);
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.6, 0, TAU);
    ctx.stroke();
    ctx.restore();
    var ma = t * 0.0004 + event.phase;
    ctx.fillStyle = rgba([235, 245, 255], alpha * 0.85);
    ctx.beginPath();
    ctx.arc(Math.cos(ma) * size * 2.1, Math.sin(ma) * size * 0.6, Math.max(1, size * 0.1), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEvents() {
    if (!events.length || !ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      var fadeIn = Math.min(1, (event.maxLife - event.life) / Math.min(700, event.maxLife * 0.25));
      var fadeOut = Math.min(1, event.life / Math.min(900, event.maxLife * 0.3));
      var alpha = clamp(fadeIn * fadeOut, 0, 1);
      if (alpha < 0.01) continue;
      var progress = clamp(1 - event.life / event.maxLife, 0, 1);
      if (event.type === 'drift') drawEventDrift(event, alpha);
      else if (event.type === 'flare') drawEventFlare(event, alpha, progress);
      else if (event.type === 'wave') drawEventWave(event, alpha, progress);
      else if (event.type === 'anomaly') drawEventAnomaly(event, alpha, progress);
      else if (event.type === 'creature') drawEventCreature(event, alpha);
      else if (event.type === 'meteor') drawEventMeteor(event, alpha);
      else if (event.type === 'alien-ship') drawEventShip(event, alpha);
      else if (event.type === 'secret-signal') drawEventSignal(event, alpha, progress);
      else if (event.type === 'portal') drawEventPortal(event, alpha, progress);
      else if (event.type === 'unknown-planet') drawEventPlanet(event, alpha);
      else if (event.type === 'encounter') drawEventEncounter(event, alpha);
      else if (event.type === 'meteor-storm') drawEventMeteorStorm(event, alpha);
      else if (event.type === 'nebula-bloom') drawEventNebulaBloom(event, alpha, progress);
      else if (event.type === 'alien-fleet') drawEventFleet(event, alpha);
      else if (event.type === 'distress-signal') drawEventDistress(event, alpha, progress);
      else if (event.type === 'supernova') drawEventSupernova(event, alpha, progress);
      else if (event.type === 'wormhole') drawEventWormhole(event, alpha, progress);
      else if (event.type === 'black-hole') drawEventBlackHole(event, alpha, progress);
      else if (event.type === 'mega-structure') drawEventMegaStructure(event, alpha, progress);
    }
    ctx.restore();
  }

  function drawBlackHoles() {
    if (!ctx || !blackHoles.length) return;
    for (var i = 0; i < blackHoles.length; i++) {
      var hole = blackHoles[i];
      var radius = hole.r || 1;
      var pulse = 0.85 + 0.15 * Math.sin(orbitalTime * 0.0013 + hole.seed);
      ctx.save();
      ctx.translate(hole.x, hole.y);
      ctx.rotate(hole.seed + orbitalTime * hole.spin);
      var glow = ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, radius * 4);
      glow.addColorStop(0, 'rgba(255,170,100,' + (0.2 * pulse) + ')');
      glow.addColorStop(0.35, 'rgba(120,80,220,' + (0.14 * pulse) + ')');
      glow.addColorStop(1, 'rgba(20,8,50,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 4, 0, TAU);
      ctx.fill();
      for (var r = 0; r < 4; r++) {
        ctx.strokeStyle = 'rgba(' + (r % 2 ? '255,190,120' : '150,120,255') + ',' + (0.3 - r * 0.055) * pulse + ')';
        ctx.lineWidth = Math.max(0.6, radius * (0.07 - r * 0.01));
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * (1.4 + r * 0.45), radius * (0.38 + r * 0.13), r * 0.4, 0, TAU);
        ctx.stroke();
      }
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(2,3,12,0.98)';
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.82, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.3 * pulse) + ')';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.86, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function applyBlackHoleGravity(delta) {
    if (navMode !== 'explore' || reduce || !blackHoles.length) return;
    for (var i = 0; i < blackHoles.length; i++) {
      var hole = blackHoles[i];
      var dx = hole.x - view.tx;
      var dy = hole.y - view.ty;
      var distance = Math.sqrt(dx * dx + dy * dy) || 1;
      var reach = hole.r * 9;
      if (distance >= reach) continue;
      var pull = (1 - distance / reach) * 0.00028 * delta;
      view.tx += dx / distance * pull;
      view.ty += dy / distance * pull;
      view.vx *= 0.96;
      view.vy *= 0.96;
    }
  }

  function worldBounds() {
    var factor = navMode === 'explore' ? BOUND_FACTOR * 2.4 : BOUND_FACTOR;
    return {
      left: cx - W * factor,
      right: cx + W * factor,
      top: cy - H * factor,
      bottom: cy + H * factor
    };
  }

  function clampCamera() {
    var bounds = worldBounds();
    var halfW = W / (2 * view.tz);
    var halfH = H / (2 * view.tz);
    view.tz = clamp(view.tz, MIN_ZOOM, MAX_ZOOM);
    view.tx = bounds.right - bounds.left < halfW * 2 ? cx : clamp(view.tx, bounds.left + halfW, bounds.right - halfW);
    view.ty = bounds.bottom - bounds.top < halfH * 2 ? cy : clamp(view.ty, bounds.top + halfH, bounds.bottom - halfH);
  }

  function recenterStrength() {
    return clamp((RECENTER_ZOOM - view.tz) / (RECENTER_ZOOM - MIN_ZOOM), 0, 1);
  }

  function canRecenter() {
    return navMode === 'multiverse' && !focusId && !drag && !pinch && !keys.left && !keys.right && !keys.up && !keys.down && !keys.forward && !keys.backward && !hunter.active && performance.now() >= recenterHoldUntil;
  }

  function recenterCamera(delta) {
    var strength = recenterStrength();
    if (strength <= 0 || !canRecenter()) return;
    var ease = 1 - Math.pow(1 - 0.16 * strength, delta / 16.67);
    view.tx += (cx - view.tx) * ease;
    view.ty += (cy - view.ty) * ease;
  }

  function updateLod() {
    currentLod = view.z < 0.78 ? 'overview'
      : view.z < 1.8 ? 'intermediate'
        : view.z < 3.4 ? 'close' : 'exploration';
    return currentLod;
  }

  function layerState(depth) {
    var zoom = Math.pow(view.z, depth);
    return {
      x: W / 2 + (view.x - W / 2) * depth,
      y: H / 2 + (view.y - H / 2) * depth,
      z: zoom
    };
  }

  function applyLayer(depth) {
    var layer = layerState(depth);
    ctx.translate(W / 2, H / 2);
    ctx.scale(layer.z, layer.z);
    ctx.translate(-layer.x, -layer.y);
  }

  function applyView() {
    applyLayer(1);
    if (Math.abs(view.rot) > 0.0001) {
      ctx.translate(W / 2, H / 2);
      ctx.rotate(view.rot);
      ctx.translate(-W / 2, -H / 2);
    }
  }

  function applyWarp() {
    if (!warp) return;
    var zoom = 1 + warpProgress * 3.6;
    ctx.translate(warp.x, warp.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-warp.x, -warp.y);
  }

  function screenToWorld(x, y) {
    var dx = x - W / 2;
    var dy = y - H / 2;
    var angle = -view.trot;
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    return {
      x: view.tx + (dx * cos - dy * sin) / view.tz,
      y: view.ty + (dx * sin + dy * cos) / view.tz
    };
  }

  function panBy(dx, dy) {
    if (navMode === 'universe') return;
    var angle = -view.trot;
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    view.tx -= (dx * cos - dy * sin) / view.tz;
    view.ty -= (dx * sin + dy * cos) / view.tz;
    recenterHoldUntil = performance.now() + RECENTER_HOLD;
    clampCamera();
  }

  function zoomAt(x, y, factor) {
    if (navMode === 'universe') return;
    var next = clamp(view.tz * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === view.tz) return;
    var point = screenToWorld(x, y);
    var angle = -view.trot;
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    var dx = x - W / 2;
    var dy = y - H / 2;
    view.tx = point.x - (dx * cos - dy * sin) / next;
    view.ty = point.y - (dx * sin + dy * cos) / next;
    view.tz = next;
    clampCamera();
  }

  function updateView(delta) {
    if (reduce) {
      recenterCamera(1000);
      clampCamera();
      view.x = view.tx;
      view.y = view.ty;
      view.z = view.tz;
      view.rot = view.trot;
      return;
    }
    if (!drag && !pinch) {
      view.tx += view.vx * delta * 0.6;
      view.ty += view.vy * delta * 0.6;
      view.trot += view.vrot * delta * 0.6;
      var decay = Math.pow(0.9, delta / 16.67);
      view.vx *= decay;
      view.vy *= decay;
      view.vrot *= decay;
      if (Math.abs(view.vx) < 0.00002) view.vx = 0;
      if (Math.abs(view.vy) < 0.00002) view.vy = 0;
      if (Math.abs(view.vrot) < 0.000001) view.vrot = 0;
    }
    applyBlackHoleGravity(delta);
    recenterCamera(delta);
    clampCamera();
    var ease = 1 - Math.pow(0.86, delta / 16.67);
    view.x += (view.tx - view.x) * ease;
    view.y += (view.ty - view.y) * ease;
    view.z += (view.tz - view.z) * ease;
    view.rot += (view.trot - view.rot) * ease;
    var bounds = worldBounds();
    var halfW = W / (2 * view.z);
    var halfH = H / (2 * view.z);
    view.x = bounds.right - bounds.left < halfW * 2 ? cx : clamp(view.x, bounds.left + halfW, bounds.right - halfW);
    view.y = bounds.bottom - bounds.top < halfH * 2 ? cy : clamp(view.y, bounds.top + halfH, bounds.bottom - halfH);
  }

  function applyKeys(delta) {
    var boost = keys.boost ? 1.9 : 1;
    var step = (navMode === 'explore' ? 360 : 260) * delta / 1000 / view.tz * boost;
    if (keys.left) view.tx -= step;
    if (keys.right) view.tx += step;
    if (keys.up) view.ty -= step;
    if (keys.down) view.ty += step;
    if (freeStick.active) {
      view.tx += freeStick.x * step * 1.15;
      view.ty += freeStick.y * step * 1.15;
    }
    if (keys.zoomIn || keys.forward) zoomAt(W / 2, H / 2, 1 + delta * 0.00055 * boost);
    if (keys.zoomOut || keys.backward) zoomAt(W / 2, H / 2, 1 - delta * 0.00055 * boost);
    if (keys.rotLeft) view.trot -= delta * 0.0009 * boost;
    if (keys.rotRight) view.trot += delta * 0.0009 * boost;
    if (navMode === 'explore') recenterHoldUntil = performance.now() + RECENTER_HOLD;
    clampCamera();
  }

  function resetView() {
    view.tx = cx;
    view.ty = cy;
    view.tz = OVERVIEW_ZOOM;
    view.vx = 0;
    view.vy = 0;
    view.trot = 0;
    view.vrot = 0;
    view.rot = 0;
    recenterHoldUntil = 0;
  }

  function requestRender() {
    if (reduce) {
      recenterCamera(1000);
      clampCamera();
      view.x = view.tx;
      view.y = view.ty;
      view.z = view.tz;
      view.rot = view.trot;
    }
    if (!running) render();
  }

  function drawPointerAura() {
    if (coarse || lowPower || !ctx) return;
    var px = W * (pointer.x + 1) / 2;
    var py = H * (pointer.y + 1) / 2;
    var radius = M * 0.14;
    var aura = ctx.createRadialGradient(px, py, 0, px, py, radius);
    aura.addColorStop(0, 'rgba(130,190,255,0.055)');
    aura.addColorStop(1, 'rgba(130,190,255,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function rgba(color, alpha) {
    var c = Object.prototype.toString.call(color) === '[object Array]' ? color : [255, 255, 255];
    var a = isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0;
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  function mix(a, b, amount) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * amount),
      Math.round(a[1] + (b[1] - a[1]) * amount),
      Math.round(a[2] + (b[2] - a[2]) * amount)
    ];
  }

  function buildScene() {
    var area = W * H;
    starLayers = [];
    var starCount = lowPower ? 200 : mobile ? 280 : 420;
    var nearCount = Math.round(starCount * 0.45);
    for (var layerIndex = 0; layerIndex < 2; layerIndex++) {
      var count = layerIndex ? nearCount : starCount - nearCount;
      var layer = { depth: layerIndex ? 0.72 : 0.46, points: [] };
      for (var i = 0; i < count; i++) {
        layer.points.push({
          x: Math.random() * W,
          y: Math.random() * H,
          z: 0.25 + Math.random() * 0.9,
          s: Math.random() < 0.07 ? 1.8 + Math.random() * 0.8 : 0.5 + Math.random() * 1,
          p: Math.random() * TAU,
          c: Math.random() < 0.22 ? hexRgb('#9bdcff') : Math.random() < 0.2 ? hexRgb('#d4b5ff') : [235, 240, 255]
        });
      }
      starLayers.push(layer);
    }

    spiral = [];
    var spiralCount = lowPower ? 100 : mobile ? 150 : Math.min(420, Math.round(area / 3000));
    for (var j = 0; j < spiralCount; j++) {
      var arm = j % 3;
      var radius = 18 + Math.pow(Math.random(), 0.72) * M * 0.58;
      spiral.push({
        r: radius,
        a: arm * TAU / 3 + radius * 0.014 + (Math.random() - 0.5) * 0.55,
        s: 0.5 + Math.random() * 1.1,
        alpha: 0.12 + Math.random() * 0.3,
        p: Math.random() * TAU,
        c: arm === 0 ? hexRgb('#8b9bff') : arm === 1 ? hexRgb('#54e8ff') : hexRgb('#c084fc')
      });
    }

    dust = [];
    var dustCount = lowPower ? 22 : mobile ? 28 : 58;
    for (var k = 0; k < dustCount; k++) {
      dust.push({
        x: Math.random() * W,
        y: Math.random() * H,
        s: 0.6 + Math.random() * 1.5,
        p: Math.random() * TAU,
        c: Math.random() < 0.5 ? hexRgb('#9d8bff') : hexRgb('#6de5ff')
      });
    }

    coreParticles = [];
    var coreCount = lowPower ? 18 : mobile ? 30 : 48;
    for (var c = 0; c < coreCount; c++) {
      var arm = c % 3;
      coreParticles.push({
        angle: arm * TAU / 3 + (Math.random() - 0.5) * 0.6,
        radius: 0.85 + Math.random() * 1.4,
        reach: 1.5 + Math.random() * 2.6,
        speed: (0.00004 + Math.random() * 0.0001) * (Math.random() < 0.35 ? -1 : 1),
        tilt: 0.75 + Math.random() * 0.5,
        size: 0.7 + Math.random() * 1.3,
        phase: Math.random(),
        c: arm === 0 ? hexRgb('#ffd89b') : arm === 1 ? hexRgb('#54e8ff') : hexRgb('#cbbcff')
      });
    }

    if (!ctx) return;
    nebulaRect = { x: cx - W * 1.6, y: cy - H * 1.6, w: W * 3.2, h: H * 3.2 };
    var nw = Math.max(2, Math.round(W / 2));
    var nh = Math.max(2, Math.round(H / 2));
    nebula = document.createElement('canvas');
    nebula.width = nw;
    nebula.height = nh;
    var nctx = nebula.getContext('2d');
    nctx.fillStyle = '#03040e';
    nctx.fillRect(0, 0, nw, nh);
    var clouds = [
      [0.2, 0.26, 0.5, '#4c2a9c', 0.17],
      [0.74, 0.2, 0.52, '#155e9c', 0.16],
      [0.56, 0.8, 0.48, '#6a2a8f', 0.14],
      [0.88, 0.62, 0.4, '#0f7183', 0.13],
      [0.1, 0.72, 0.36, '#2b2176', 0.15]
    ];
    clouds.forEach(function (cloud) {
      var x = cloud[0] * nw;
      var y = cloud[1] * nh;
      var r = cloud[2] * Math.max(nw, nh);
      var color = hexRgb(cloud[3]);
      var gradient = nctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, rgba(color, cloud[4]));
      gradient.addColorStop(0.45, rgba(color, cloud[4] * 0.4));
      gradient.addColorStop(1, rgba(color, 0));
      nctx.fillStyle = gradient;
      nctx.fillRect(0, 0, nw, nh);
    });
  }

  function resize() {
    var rect = stage.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    M = Math.min(W, H);
    mobile = window.innerWidth < 760;
    medium = !mobile && W < 1200;
    OVERVIEW_ZOOM = mobile ? 0.5 : 0.64;
    RECENTER_ZOOM = OVERVIEW_ZOOM;
    cx = W * (mobile ? 0.5 : medium ? 0.62 : 0.58);
    cy = H * (mobile ? 0.58 : 0.5);
    rx = M * (mobile ? 0.78 : medium ? 0.64 : 0.72);
    ry = M * (mobile ? 0.56 : 0.5);
    if (!viewInit) {
      view.x = view.tx = cx;
      view.y = view.ty = cy;
      view.z = view.tz = OVERVIEW_ZOOM;
      viewInit = true;
    }
    clampCamera();
    var resizeFactor = navMode === 'explore' ? BOUND_FACTOR * 2.4 : BOUND_FACTOR;
    view.x = clamp(view.x, cx - W * resizeFactor, cx + W * resizeFactor);
    view.y = clamp(view.y, cy - H * resizeFactor, cy + H * resizeFactor);
    DPR = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.6);
    if (ctx) {
      var pw = Math.round(W * DPR);
      var ph = Math.round(H * DPR);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    for (var secretIndex = 0; secretIndex < secrets.length; secretIndex++) {
      var secret = secrets[secretIndex];
      secret.baseX = cx + rx * secret.factorX;
      secret.baseY = cy + ry * secret.factorY;
    }
    hunter.zone.x = cx + rx * (mobile ? 1.05 : 1.5);
    hunter.zone.y = cy - ry * (mobile ? 1.15 : 1.25);
    hunter.zone.r = M * (mobile ? 0.46 : 0.5);
    hunter.beacon.x = hunter.zone.x;
    hunter.beacon.y = hunter.zone.y;
    blackHoles.forEach(function (hole) {
      hole.x = cx + rx * hole.fx;
      hole.y = cy + ry * hole.fy;
      hole.r = M * hole.size;
    });
    if (hunter.active) spawnFragments();
    buildScene();
    if (!eventsSeeded && !reduce) {
      events.push(makeEvent());
      eventsSeeded = true;
    }
    syncNodes();
    if (!running) render();
  }

  function worldState(world) {
    var wave = orbitalTime * world.speed + world.seed;
    var angle = world.base + Math.sin(wave) * 0.2 + (coarse ? 0 : pointer.x * 0.025);
    var depth = world.depth + Math.sin(wave * 1.3) * 0.08;
    var scale = 0.86 + 0.14 * (depth + 1) / 2;
    return {
      x: cx + rx * world.px + Math.sin(wave) * M * 0.045 + (coarse ? 0 : pointer.x * world.parallax),
      y: cy + ry * world.py + Math.cos(wave * 0.8) * M * 0.035 + (coarse ? 0 : pointer.y * world.parallax * 0.55),
      r: M * world.size * scale * (mobile ? 1.08 : 1),
      depth: depth,
      angle: angle,
      scale: scale,
      spin: orbitalTime * (world.spin || 0.00012),
      phase: world.tech ? orbitalTime * 0.00016 + world.seed : 0,
      signal: world.tech ? 0.5 + 0.5 * Math.sin(orbitalTime * 0.0012 + world.seed) : 0
    };
  }

  function syncNodes() {
    var states = {};
    worlds.forEach(function (world) {
      var state = worldState(world);
      states[world.id] = state;
      var element = world.el;
      if (!element) return;
      var active = hovered === world.id || openId === world.id || document.activeElement === element;
      element.style.left = '0px';
      element.style.top = '0px';
      var vx = (state.x - view.x) * view.z + W / 2;
      var vy = (state.y - view.y) * view.z + H / 2;
      element.style.transform = 'translate3d(' + vx.toFixed(2) + 'px,' + vy.toFixed(2) + 'px,0) translate(-50%,-50%)';
      element.style.zIndex = String(10 + Math.round((state.depth + 1) * 8));
      element.style.setProperty('--node-r', clamp(state.r * view.z, 10, M * 0.7).toFixed(1) + 'px');
      element.classList.toggle('is-active', !!active);
      if (indexById[world.id]) indexById[world.id].classList.toggle('is-active', !!active);
    });
    return states;
  }

  function drawBackground() {
    var background = ctx.createLinearGradient(0, 0, W, H);
    background.addColorStop(0, '#03040e');
    background.addColorStop(0.55, '#070819');
    background.addColorStop(1, '#02030a');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);
  }

  function forEachTile(layer, callback) {
    var marginX = W * 0.35;
    var marginY = H * 0.35;
    var left = layer.x - W / (2 * layer.z) - marginX;
    var right = layer.x + W / (2 * layer.z) + marginX;
    var top = layer.y - H / (2 * layer.z) - marginY;
    var bottom = layer.y + H / (2 * layer.z) + marginY;
    var minX = Math.floor(left / W);
    var maxX = Math.floor(right / W);
    var minY = Math.floor(top / H);
    var maxY = Math.floor(bottom / H);
    var tiles = (maxX - minX + 1) * (maxY - minY + 1);
    var step = tiles > 8 ? 3 : tiles > 2 ? 2 : 1;
    for (var tx = minX; tx <= maxX; tx++) {
      for (var ty = minY; ty <= maxY; ty++) {
        for (var i = 0; i < layer.points.length; i += step) {
          var point = layer.points[i];
          callback(point, point.x + tx * W, point.y + ty * H, i + tx * 31 + ty * 17);
        }
      }
    }
  }

  function drawNebula() {
    if (!nebula || !nebulaRect) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.9;
    var dx = Math.sin(t * 0.00005) * 12 + pointer.x * 8;
    var dy = Math.cos(t * 0.00004) * 9 + pointer.y * 6;
    ctx.drawImage(nebula, nebulaRect.x + dx, nebulaRect.y + dy, nebulaRect.w, nebulaRect.h);
    ctx.restore();
  }

  function drawStars() {
    for (var l = 0; l < starLayers.length; l++) {
      var layer = starLayers[l];
      if (view.z > 4.5 && layer.depth < 0.6) continue;
      var state = layerState(layer.depth);
      state.points = layer.points;
      ctx.save();
      applyLayer(layer.depth);
      applyWarp();
      ctx.globalCompositeOperation = 'lighter';
      forEachTile(state, function (star, x, y, seed) {
        if (view.z < 0.6 && star.s < 1) return;
        var px = x + pointer.x * 16 * star.z * layer.depth;
        var py = y + pointer.y * 11 * star.z * layer.depth;
        var twinkle = 0.45 + 0.55 * Math.sin(t * 0.0012 * star.z + seed);
        var burst = !lowPower && view.z < 3 && star.z > 0.86
          ? Math.pow(Math.max(0, Math.sin(t * 0.00031 + seed * 0.7)), 14) * (star.z - 0.86) * 6.5
          : 0;
        var size = star.s * star.z * (layer.depth > 0.6 ? 1 : 0.8);
        if (burst > 0.03) {
          ctx.fillStyle = rgba(star.c, burst * 0.13);
          ctx.beginPath();
          ctx.arc(px, py, size * 3.4, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = rgba(star.c, Math.min(0.95, 0.12 + twinkle * 0.52 * star.z + burst * 0.5));
        ctx.fillRect(px, py, size, size);
        if (star.s > 1.8 || burst > 0.24) {
          ctx.strokeStyle = rgba(star.c, Math.min(0.7, 0.16 + twinkle * 0.22 + burst * 0.4));
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(px - 5 - burst * 3, py);
          ctx.lineTo(px + 5 + burst * 3, py);
          ctx.moveTo(px, py - 5 - burst * 3);
          ctx.lineTo(px, py + 5 + burst * 3);
          ctx.stroke();
        }
      });
      ctx.restore();
    }
  }

  function drawSpiral() {
    var rotation = t * 0.000035;
    var state = layerState(0.74);
    var halfW = W / (2 * state.z) + 40;
    var halfH = H / (2 * state.z) + 40;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < spiral.length; i++) {
      var particle = spiral[i];
      var angle = particle.a + rotation;
      var x = cx + Math.cos(angle) * particle.r + pointer.x * 5;
      var y = cy + Math.sin(angle) * particle.r * 0.33 + pointer.y * 3;
      if (x < state.x - halfW || x > state.x + halfW || y < state.y - halfH || y > state.y + halfH) continue;
      var alpha = particle.alpha * (0.62 + 0.38 * Math.sin(t * 0.001 + particle.p));
      ctx.fillStyle = rgba(particle.c, alpha);
      ctx.fillRect(x, y, particle.s, particle.s);
    }
    ctx.restore();
  }

  function corePhase(value) {
    return ((value % 1) + 1) % 1;
  }

  function drawCoreHalo(r, pulse) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var outer = r * (mobile ? 4.8 : 6);
    var halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, outer);
    halo.addColorStop(0, rgba([160, 230, 255], 0.19 + pulse * 0.04));
    halo.addColorStop(0.24, rgba([105, 120, 255], 0.13));
    halo.addColorStop(0.56, rgba([128, 74, 220], 0.075));
    halo.addColorStop(1, rgba([60, 40, 140], 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawCoreNebula(r, pulse) {
    var clouds = lowPower
      ? [[-1.7, 0.25, 2.1, [86, 64, 200], 0.075], [1.5, -0.3, 1.9, [38, 140, 205], 0.07]]
      : [[-1.9, 0.25, 2.4, [86, 64, 200], 0.08], [1.7, -0.35, 2.2, [38, 140, 205], 0.075], [0.1, 1.35, 1.9, [190, 90, 150], 0.05]];
    for (var i = 0; i < clouds.length; i++) {
      var cloud = clouds[i];
      var size = r * cloud[2];
      ctx.save();
      ctx.translate(cloud[0] * r, cloud[1] * r);
      ctx.rotate(0.28 + i * 0.8 + (reduce ? 0 : t * 0.000008));
      ctx.scale(1, 0.5);
      var glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, size);
      glow.addColorStop(0, rgba(cloud[3], cloud[4] * (0.7 + pulse * 0.3)));
      glow.addColorStop(0.55, rgba(cloud[3], cloud[4] * 0.35));
      glow.addColorStop(1, rgba(cloud[3], 0));
      ctx.fillStyle = glow;
      ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.restore();
    }
  }

  function drawCoreParticles(r, front) {
    if (view.z > 4.6) return;
    var step = lowPower ? 3 : 1;
    for (var i = 0; i < coreParticles.length; i += step) {
      var particle = coreParticles[i];
      var drift = reduce ? 0 : t * particle.speed;
      var phase = corePhase(particle.phase + drift * 0.7);
      var radius = r * (particle.radius + particle.reach * phase);
      var angle = particle.angle + phase * 0.8 + drift * 2.2 + Math.sin(t * 0.0002 + particle.phase * 9) * 0.03;
      if ((Math.sin(angle) >= 0) !== front) continue;
      var alpha = (0.12 + 0.42 * Math.sin(Math.PI * phase)) * (front ? 1 : 0.6);
      var size = particle.size * (front ? 1 : 0.75);
      ctx.fillStyle = rgba(particle.c, alpha);
      ctx.fillRect(Math.cos(angle) * radius, Math.sin(angle) * radius * particle.tilt, size, size);
    }
  }

  function drawCoreDisk(r, front, pulse) {
    ctx.save();
    ctx.rotate(-0.26 + (reduce ? 0.1 : t * 0.000018) + pointer.x * 0.02);
    ctx.scale(1, mobile ? 0.42 : 0.36);
    if (!front) {
      var outer = r * (mobile ? 3.5 : 4.3);
      var disk = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, outer);
      disk.addColorStop(0, rgba([180, 225, 255], 0.19));
      disk.addColorStop(0.42, rgba([120, 100, 255], 0.12));
      disk.addColorStop(0.76, rgba([245, 170, 120], 0.06));
      disk.addColorStop(1, rgba([90, 60, 200], 0));
      ctx.fillStyle = disk;
      ctx.beginPath();
      ctx.arc(0, 0, outer, 0, TAU);
      ctx.fill();
    }
    var bands = lowPower ? 2 : 4;
    var start = front ? 0 : Math.PI;
    var end = front ? Math.PI : TAU;
    for (var i = 0; i < bands; i++) {
      var color = i % 2 ? [84, 232, 255] : [200, 165, 255];
      ctx.strokeStyle = rgba(color, (front ? 0.18 : 0.11) * (1 - i * 0.12) + pulse * 0.02);
      ctx.lineWidth = Math.max(0.6, r * (0.05 - i * 0.007));
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.45 + i * 0.66), start, end);
      ctx.stroke();
      if (!lowPower && front) {
        ctx.strokeStyle = rgba([255, 196, 128], 0.08 + pulse * 0.03);
        ctx.lineWidth = Math.max(0.5, r * 0.012);
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.75 + i * 0.66), 0.4, 2.4);
        ctx.stroke();
      }
    }
    drawCoreParticles(r, front);
    ctx.restore();
  }

  function drawCoreLens(r, pulse) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    var shadow = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 1.45);
    shadow.addColorStop(0, 'rgba(1,2,10,0.99)');
    shadow.addColorStop(0.58, 'rgba(2,3,14,0.84)');
    shadow.addColorStop(0.84, 'rgba(3,4,18,0.3)');
    shadow.addColorStop(1, 'rgba(3,4,18,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.45, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba([215, 240, 255], 0.28 + pulse * 0.14);
    ctx.lineWidth = Math.max(0.8, r * 0.035);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.02, 0, TAU);
    ctx.stroke();
    for (var i = 0; i < 2; i++) {
      ctx.strokeStyle = rgba(i ? [120, 210, 255] : [190, 160, 255], 0.14 + i * 0.04 + pulse * 0.04);
      ctx.lineWidth = Math.max(0.6, r * 0.016);
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.18 + i * 0.2), t * 0.00012 + i, t * 0.00012 + i + 2.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCoreNucleus(r, pulse) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var body = ctx.createRadialGradient(-r * 0.16, -r * 0.2, r * 0.02, 0, 0, r * 0.95);
    body.addColorStop(0, 'rgba(255,255,255,0.98)');
    body.addColorStop(0.13, 'rgba(205,246,255,0.92)');
    body.addColorStop(0.36, rgba([120, 190, 255], 0.76));
    body.addColorStop(0.68, rgba([139, 92, 246], 0.42));
    body.addColorStop(1, rgba([70, 50, 170], 0));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.95, 0, TAU);
    ctx.fill();
    var spark = ctx.createRadialGradient(-r * 0.22, -r * 0.28, 0, -r * 0.22, -r * 0.28, r * 0.42);
    spark.addColorStop(0, rgba([255, 255, 255], 0.8 + pulse * 0.18));
    spark.addColorStop(1, rgba([255, 255, 255], 0));
    ctx.fillStyle = spark;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  function drawCoreWaves(r) {
    var count = lowPower ? 2 : 3;
    for (var i = 0; i < count; i++) {
      var phase = corePhase(t * 0.000075 + i / count);
      var radius = r * (1.35 + phase * (mobile ? 3.6 : 4.6));
      var color = i === 1 ? [84, 232, 255] : [176, 151, 255];
      ctx.strokeStyle = rgba(color, (1 - phase) * 0.14);
      ctx.lineWidth = Math.max(0.6, r * 0.04 * (1 - phase));
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.42, 0.08, 0, TAU);
      ctx.stroke();
    }
  }

  function drawCoreRings(r, pulse) {
    var rings = [
      { radius: 1.6, tilt: 0.34, speed: 0.00007, color: [166, 150, 255], alpha: 0.24 },
      { radius: 2.15, tilt: -0.22, speed: -0.00006, color: [84, 232, 255], alpha: 0.19 },
      { radius: 2.85, tilt: 0.48, speed: 0.000045, color: [255, 196, 128], alpha: 0.12 },
      { radius: 3.55, tilt: -0.36, speed: -0.00003, color: [205, 190, 255], alpha: 0.08 }
    ];
    var count = lowPower ? 2 : rings.length;
    for (var i = 0; i < count; i++) {
      var ring = rings[i];
      ctx.save();
      ctx.rotate((reduce ? i * 0.62 : t * ring.speed + i * 0.62));
      ctx.scale(1, ring.tilt);
      ctx.strokeStyle = rgba(ring.color, ring.alpha + pulse * 0.04);
      ctx.lineWidth = Math.max(0.7, r * 0.026);
      ctx.beginPath();
      ctx.arc(0, 0, r * ring.radius, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgba(ring.color, Math.min(0.6, ring.alpha * 2.4 + pulse * 0.1));
      ctx.lineWidth = Math.max(1, r * 0.045);
      ctx.beginPath();
      ctx.arc(0, 0, r * ring.radius, 0.16, 0.95 + pulse * 0.35);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCoreFlares(r) {
    var flare = Math.pow(Math.max(0, Math.sin(t * 0.00016)), 22);
    if (flare < 0.025) return;
    ctx.save();
    ctx.rotate(t * 0.00003);
    for (var i = 0; i < 2; i++) {
      ctx.rotate(Math.PI);
      var length = r * (3 + flare * 3.6);
      var beam = ctx.createLinearGradient(0, 0, length, 0);
      beam.addColorStop(0, rgba([255, 255, 255], flare * 0.4));
      beam.addColorStop(0.38, rgba([130, 215, 255], flare * 0.2));
      beam.addColorStop(1, rgba([84, 232, 255], 0));
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.045);
      ctx.lineTo(length, 0);
      ctx.lineTo(0, r * 0.045);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCore() {
    var r = M * (mobile ? 0.05 : 0.055);
    var pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.0006);
    var driftX = reduce ? 0 : pointer.x * r * 0.09;
    var driftY = reduce ? 0 : pointer.y * r * 0.06;
    ctx.save();
    ctx.translate(cx + driftX, cy + driftY);

    drawCoreHalo(r, pulse);
    drawCoreNebula(r, pulse);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawCoreDisk(r, false, pulse);
    ctx.restore();

    drawCoreLens(r, pulse);
    drawCoreNucleus(r, pulse);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawCoreDisk(r, true, pulse);
    drawCoreRings(r, pulse);
    drawCoreWaves(r);
    if (!lowPower && view.z > 0.48 && view.z < 4.6) drawCoreFlares(r);
    ctx.restore();
    ctx.restore();
  }

  function drawRing(x, y, r, angle, front, world) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.3 + Math.sin(angle) * 0.08);
    ctx.scale(1, 0.28);
    ctx.strokeStyle = rgba(world.argb, front ? 0.58 : 0.26);
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.56, front ? 0 : Math.PI, front ? Math.PI : TAU);
    ctx.stroke();
    ctx.strokeStyle = rgba([255, 255, 255], front ? 0.3 : 0.12);
    ctx.lineWidth = Math.max(1, r * 0.014);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.8, front ? 0 : Math.PI, front ? Math.PI : TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayDataRing(x, y, r, state, highlighted, front) {
    var boost = (highlighted ? 1 : 0) + (warp && warp.worldId === 'play' ? 0.6 : 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.22 + Math.sin(state.phase) * 0.05);
    ctx.scale(1, 0.36);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    var start = front ? 0 : Math.PI;
    var end = front ? Math.PI : TAU;
    ctx.strokeStyle = rgba([125, 211, 252], (front ? 0.5 : 0.18) + boost * 0.24);
    ctx.lineWidth = Math.max(0.8, r * 0.035);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.95, start, end);
    ctx.stroke();
    ctx.setLineDash([Math.max(2, r * 0.1), Math.max(5, r * 0.22)]);
    ctx.lineDashOffset = -state.phase * 70;
    ctx.strokeStyle = rgba([244, 114, 182], (front ? 0.42 : 0.14) + boost * 0.2);
    ctx.lineWidth = Math.max(0.7, r * 0.02);
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.28, start, end);
    ctx.stroke();
    ctx.setLineDash([]);
    for (var i = 0; i < 6; i++) {
      var a = state.phase * 1.8 + i * TAU / 6;
      if ((Math.sin(a) >= 0) !== front) continue;
      var px = Math.cos(a) * r * 1.95;
      var py = Math.sin(a) * r * 1.95;
      var pulse = 0.6 + 0.4 * Math.sin(t * 0.002 + i);
      ctx.fillStyle = rgba(i % 3 === 0 ? [244, 114, 182] : [125, 211, 252], (front ? 0.9 : 0.35) * pulse);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, r * 0.035), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlaySurface(x, y, r, state, highlighted) {
    var boost = highlighted || (warp && warp.worldId === 'play') ? 1 : 0;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 7; i++) {
      var a = i * 2.399 + state.spin * 0.7;
      var lr = 0.24 + ((i * 3) % 5) * 0.13;
      var lx = x + Math.cos(a) * lr * r;
      var ly = y + Math.sin(a) * lr * r * 0.88;
      var depth = Math.sqrt(Math.max(0, 1 - lr * lr));
      var pulse = 0.5 + 0.5 * Math.sin(t * 0.0013 + i * 1.7 + state.phase);
      ctx.fillStyle = rgba(i % 3 === 0 ? [244, 114, 182] : [155, 235, 255], (0.3 + depth * 0.45) * pulse + boost * 0.12);
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(0.7, r * 0.025), 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba([125, 211, 252], 0.14 + depth * 0.14 + boost * 0.08);
      ctx.lineWidth = Math.max(0.6, r * 0.01);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + Math.cos(a) * r * 0.1, ly + Math.sin(a) * r * 0.08);
      ctx.stroke();
    }
    for (var j = 0; j < 3; j++) {
      var towerA = j * 2.1 + state.phase;
      var tr = 0.32 + j * 0.16;
      var tx = x + Math.cos(towerA) * tr * r;
      var ty = y + Math.sin(towerA) * tr * r * 0.8;
      var td = Math.sqrt(Math.max(0, 1 - tr * tr));
      ctx.fillStyle = rgba([225, 245, 255], 0.22 + td * 0.3 + boost * 0.1);
      ctx.fillRect(tx - r * 0.015, ty - r * 0.09 * td, Math.max(1, r * 0.03), r * 0.1 * td);
    }
    ctx.restore();
  }

  function drawPlaySignals(x, y, r, state, highlighted) {
    var boost = highlighted || (warp && warp.worldId === 'play') ? 1 : 0;
    var energy = typeof state.signal === 'number' ? state.signal : 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 3; i++) {
      var wave = corePhase((reduce ? 0 : t * 0.00022) + i / 3 + state.phase * 0.02);
      ctx.strokeStyle = rgba(i === 1 ? [244, 114, 182] : [125, 211, 252], (1 - wave) * (0.26 + boost * 0.22) * (0.7 + energy * 0.3));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r * (1.22 + wave * 1.5), 0, TAU);
      ctx.stroke();
    }
    if (boost && !reduce) {
      ctx.strokeStyle = rgba([200, 245, 255], 0.35);
      ctx.lineWidth = 1;
      for (var k = 0; k < 4; k++) {
        var a = k * Math.PI / 2 + t * 0.0004;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 2.45, y + Math.sin(a) * r * 2.45);
        ctx.lineTo(x + Math.cos(a) * r * 2.75, y + Math.sin(a) * r * 2.75);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function focusAlpha(world) {
    return focusId && focusId !== world.id ? 0.22 : 1;
  }

  function drawHex(x, y, r, rotation) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var angle = rotation + i * TAU / 6;
      var px = x + Math.cos(angle) * r;
      var py = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawUniverseField(world, state, highlighted) {
    if (view.z < 0.42) return;
    var x = state.x;
    var y = state.y;
    var r = state.r;
    var spread = world.kind === 'quantum-reactor' ? 3
      : world.kind === 'digital-civilization' ? 3.25 : 3.6;
    var outer = r * spread;
    var boost = highlighted || focusId === world.id ? 1 : 0;
    var detail = currentLod === 'overview' ? 0
      : currentLod === 'intermediate' ? 8
        : currentLod === 'close' ? 16 : 26;

    ctx.save();
    ctx.globalAlpha = focusAlpha(world);
    ctx.globalCompositeOperation = 'lighter';

    var halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, outer * 1.25);
    halo.addColorStop(0, rgba(world.rgb, 0.2 + boost * 0.1));
    halo.addColorStop(0.42, rgba(world.rgb, 0.09 + boost * 0.05));
    halo.addColorStop(1, rgba(world.rgb, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, outer * 1.25, 0, TAU);
    ctx.fill();

    if (world.kind === 'market-nebula') {
      for (var lane = 0; lane < 3; lane++) {
        ctx.strokeStyle = rgba(lane === 1 ? world.argb : world.rgb, (0.16 + boost * 0.09) - lane * 0.03);
        ctx.lineWidth = Math.max(0.6, r * (0.012 - lane * 0.002));
        ctx.setLineDash(lane === 2 ? [Math.max(3, r * 0.08), Math.max(8, r * 0.22)] : []);
        ctx.lineDashOffset = -state.spin * 40;
        ctx.beginPath();
        ctx.ellipse(x, y, outer * (0.7 + lane * 0.18), outer * (0.24 + lane * 0.06), -0.22 + lane * 0.12, 0, TAU);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (var parcel = 0; parcel < detail; parcel++) {
        var pa = state.spin * 1.4 + parcel * TAU / detail;
        var pr = outer * (0.72 + (parcel % 3) * 0.11);
        var px = x + Math.cos(pa) * pr;
        var py = y + Math.sin(pa) * pr * 0.34;
        ctx.fillStyle = rgba(parcel % 4 === 0 ? [255, 181, 92] : world.argb, 0.55 + boost * 0.2);
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, r * 0.025), 0, TAU);
        ctx.fill();
      }
    } else if (world.kind === 'narrative-nebula') {
      for (var thread = 0; thread < 7; thread++) {
        var ta = thread * TAU / 7 + state.spin * 0.4;
        var tx = x + Math.cos(ta) * outer * 0.9;
        var ty = y + Math.sin(ta) * outer * 0.72;
        ctx.strokeStyle = rgba(thread % 2 ? world.argb : world.rgb, 0.13 + boost * 0.08);
        ctx.lineWidth = Math.max(0.6, r * 0.008);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ta) * r * 0.9, y + Math.sin(ta) * r * 0.7);
        ctx.quadraticCurveTo(x + Math.cos(ta + 0.7) * outer * 0.55, y + Math.sin(ta - 0.5) * outer * 0.34, tx, ty);
        ctx.stroke();
      }
      for (var shard = 0; shard < detail; shard++) {
        var sa = state.spin * 0.8 + shard * 2.399;
        var sr = r * (1.5 + (shard % 5) * 0.36);
        var sx = x + Math.cos(sa) * sr;
        var sy = y + Math.sin(sa) * sr * 0.66;
        ctx.fillStyle = rgba(shard % 3 === 0 ? [255, 216, 155] : world.argb, 0.42 + boost * 0.16);
        ctx.fillRect(sx, sy, Math.max(1, r * 0.035), Math.max(1, r * 0.012));
      }
    } else if (world.kind === 'quantum-reactor') {
      for (var ring = 0; ring < 3; ring++) {
        ctx.strokeStyle = rgba(ring === 1 ? world.argb : world.rgb, 0.26 + boost * 0.12 - ring * 0.05);
        ctx.lineWidth = Math.max(0.7, r * 0.012);
        drawHex(x, y, outer * (0.52 + ring * 0.22), state.spin * (ring % 2 ? -0.7 : 1) + ring * 0.3);
        ctx.stroke();
      }
      var pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.0014 + world.seed);
      ctx.strokeStyle = rgba([255, 255, 255], 0.12 + pulse * 0.18 + boost * 0.08);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, outer * (0.75 + pulse * 0.18), 0, TAU);
      ctx.stroke();
      for (var tick = 0; tick < detail; tick++) {
        var tickAngle = tick * TAU / detail + state.spin * 0.6;
        ctx.strokeStyle = rgba(world.argb, 0.2 + boost * 0.12);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(tickAngle) * outer * 1.05, y + Math.sin(tickAngle) * outer * 1.05);
        ctx.lineTo(x + Math.cos(tickAngle) * outer * 1.16, y + Math.sin(tickAngle) * outer * 1.16);
        ctx.stroke();
      }
    } else {
      for (var platform = 0; platform < 2; platform++) {
        ctx.strokeStyle = rgba(platform ? world.rgb : world.argb, 0.2 + boost * 0.12);
        ctx.lineWidth = Math.max(0.7, r * 0.012);
        ctx.beginPath();
        ctx.ellipse(x, y, outer * (0.72 + platform * 0.22), outer * (0.26 + platform * 0.06), -0.2, 0, TAU);
        ctx.stroke();
      }
      for (var tower = 0; tower < detail; tower++) {
        var angleT = tower * TAU / detail + state.spin * 0.5;
        var tr = r * (1.6 + (tower % 3) * 0.34);
        var towerX = x + Math.cos(angleT) * tr;
        var towerY = y + Math.sin(angleT) * tr * 0.42;
        var towerH = r * (0.16 + (tower % 4) * 0.07);
        ctx.fillStyle = rgba(tower % 3 === 0 ? [244, 114, 182] : [155, 235, 255], 0.28 + boost * 0.16);
        ctx.fillRect(towerX - r * 0.012, towerY - towerH, Math.max(1, r * 0.024), towerH);
      }
      for (var ship = 0; ship < 3; ship++) {
        var shipAngle = state.spin * 2.2 + ship * TAU / 3;
        var shipX = x + Math.cos(shipAngle) * outer * 0.98;
        var shipY = y + Math.sin(shipAngle) * outer * 0.38;
        ctx.fillStyle = rgba([225, 250, 255], 0.55 + boost * 0.2);
        ctx.beginPath();
        ctx.moveTo(shipX + Math.cos(shipAngle) * r * 0.09, shipY + Math.sin(shipAngle) * r * 0.05);
        ctx.lineTo(shipX - Math.cos(shipAngle) * r * 0.05, shipY - Math.sin(shipAngle) * r * 0.04 + r * 0.035);
        ctx.lineTo(shipX - Math.cos(shipAngle) * r * 0.05, shipY - Math.sin(shipAngle) * r * 0.04 - r * 0.035);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawUniverseSatellites(world, state, highlighted) {
    if (currentLod === 'overview') return;
    var config = universeById[world.id];
    var planets = config && config.planets ? config.planets : [];
    var count = Math.min(planets.length || 3, currentLod === 'intermediate' ? 3 : currentLod === 'close' ? 5 : 7);
    if (!count) return;
    ctx.save();
    ctx.globalAlpha = focusAlpha(world);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < count; i++) {
      var planet = planets[i] || {};
      var hidden = planet.status === 'oculto';
      var angle = state.spin * (i % 2 ? -0.55 : 0.75) + i * TAU / Math.max(3, planets.length) + world.seed;
      var orbit = state.r * (1.85 + (i % 3) * 0.36);
      var sx = state.x + Math.cos(angle) * orbit;
      var sy = state.y + Math.sin(angle) * orbit * 0.42;
      var sr = clamp(state.r * 0.075, 1.8, 9);
      var color = hidden ? [145, 150, 190] : hexRgb(planet.code === 'gravity' ? '#8be9ff' : world.accent);
      var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 3.5);
      glow.addColorStop(0, rgba(color, hidden ? 0.5 : 0.85));
      glow.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, sr * 3.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(color, hidden ? 0.55 : 0.92);
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, TAU);
      ctx.fill();
      if (hidden) {
        ctx.strokeStyle = rgba(color, 0.4);
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(sx, sy, sr * 2, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  function drawPlayCivilization(x, y, r, state, highlighted) {
    if (currentLod === 'overview') return;
    var boost = highlighted || focusId === 'play' ? 1 : 0;
    ctx.save();
    ctx.globalAlpha = focusAlpha(byId.play);
    ctx.globalCompositeOperation = 'lighter';

    var spireH = r * (0.7 + boost * 0.16);
    var core = ctx.createLinearGradient(x, y - spireH, x, y + r * 0.2);
    core.addColorStop(0, 'rgba(210,250,255,0.95)');
    core.addColorStop(0.45, 'rgba(125,211,252,0.72)');
    core.addColorStop(1, 'rgba(244,114,182,0.18)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.075, y + r * 0.1);
    ctx.lineTo(x - r * 0.045, y - spireH * 0.62);
    ctx.lineTo(x, y - spireH);
    ctx.lineTo(x + r * 0.045, y - spireH * 0.62);
    ctx.lineTo(x + r * 0.075, y + r * 0.1);
    ctx.closePath();
    ctx.fill();

    for (var portal = 0; portal < 2; portal++) {
      var side = portal ? 1 : -1;
      var px = x + side * r * 0.72;
      var py = y - r * 0.06;
      var pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.002 + portal * 1.8);
      ctx.strokeStyle = rgba(portal ? [244, 114, 182] : [125, 211, 252], 0.55 + boost * 0.22 + pulse * 0.12);
      ctx.lineWidth = Math.max(0.8, r * 0.022);
      ctx.beginPath();
      ctx.ellipse(px, py, r * 0.2, r * 0.32, side * 0.18, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = rgba([220, 250, 255], 0.14 + pulse * 0.16 + boost * 0.08);
      ctx.beginPath();
      ctx.ellipse(px, py, r * 0.15, r * 0.26, side * 0.18, 0, TAU);
      ctx.fill();
    }

    if (currentLod === 'close' || currentLod === 'exploration') {
      for (var arc = 0; arc < 3; arc++) {
        ctx.strokeStyle = rgba(arc === 1 ? [244, 114, 182] : [125, 211, 252], 0.18 + boost * 0.08);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x, y - r * 0.12, r * (1.15 + arc * 0.18), r * (0.2 + arc * 0.05), -0.16, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPlanet(world, state, highlighted) {
    var x = state.x;
    var y = state.y;
    var r = state.r;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(x, y, r * 0.25, x, y, r * (highlighted ? 3.8 : 3));
    glow.addColorStop(0, rgba(world.rgb, highlighted ? 0.34 : 0.2));
    glow.addColorStop(0.45, rgba(world.rgb, highlighted ? 0.14 : 0.07));
    glow.addColorStop(1, rgba(world.rgb, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.8, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (world.id === 'play') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var techGlow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * (highlighted ? 4.4 : 3.2));
      techGlow.addColorStop(0, rgba([125, 211, 252], highlighted ? 0.3 : 0.16));
      techGlow.addColorStop(0.5, rgba([244, 114, 182], highlighted ? 0.14 : 0.07));
      techGlow.addColorStop(1, rgba([125, 211, 252], 0));
      ctx.fillStyle = techGlow;
      ctx.beginPath();
      ctx.arc(x, y, r * 4.4, 0, TAU);
      ctx.fill();
      ctx.restore();
      drawPlayDataRing(x, y, r, state, highlighted, false);
    }

    if (world.ring) drawRing(x, y, r, state.angle, false, world);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    var body = ctx.createRadialGradient(x - r * 0.34, y - r * 0.42, r * 0.04, x + r * 0.08, y + r * 0.06, r * 1.25);
    body.addColorStop(0, rgba(mix(world.rgb, [255, 255, 255], 0.62), 1));
    body.addColorStop(0.28, rgba(world.rgb, 1));
    body.addColorStop(0.72, rgba(mix(world.rgb, [3, 4, 16], 0.55), 1));
    body.addColorStop(1, '#070817');
    ctx.fillStyle = body;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    ctx.globalAlpha = 0.16;
    for (var i = 0; i < 5; i++) {
      var offset = (i - 2) * r * 0.34 + Math.sin(state.spin * 2.2 + i + world.seed) * r * 0.05;
      ctx.fillStyle = i % 2 ? rgba(world.argb, 0.55) : 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(state.spin + i) * r * 0.08, y + offset, r * 1.15, r * (0.08 + i * 0.012), -0.18, 0, TAU);
      ctx.fill();
    }

    ctx.globalAlpha = 0.5;
    for (var j = 0; j < 7; j++) {
      var px = x + Math.cos(world.seed + j * 2.1 + state.spin * 1.4) * r * 0.72;
      var py = y + Math.sin(world.seed * 1.7 + j * 1.3 + state.spin * 0.8) * r * 0.72;
      ctx.fillStyle = rgba(world.argb, 0.8);
      ctx.fillRect(px, py, 1.4, 1.4);
    }

    if (world.id === 'play') drawPlaySurface(x, y, r, state, highlighted);

    var shadow = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    shadow.addColorStop(0, 'rgba(0,0,0,0)');
    shadow.addColorStop(0.5, 'rgba(2,3,12,0.18)');
    shadow.addColorStop(1, 'rgba(1,2,9,0.92)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = shadow;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(world.argb, highlighted ? 0.95 : 0.5);
    ctx.lineWidth = highlighted ? 2 : 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 0.5, 0, TAU);
    ctx.stroke();
    if (highlighted) {
      for (var k = 0; k < 3; k++) {
        ctx.strokeStyle = rgba(world.argb, 0.5 - k * 0.14);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r * (1.18 + k * 0.16), t * 0.001 + k, t * 0.001 + k + 1.6);
        ctx.stroke();
      }
    }
    ctx.restore();

    if (world.ring) drawRing(x, y, r, state.angle, true, world);

    if (world.id === 'play') {
      drawPlayDataRing(x, y, r, state, highlighted, true);
      drawPlaySignals(x, y, r, state, highlighted);
      drawPlayCivilization(x, y, r, state, highlighted);
    }

    if (world.moons) {
      for (var m = 0; m < 2; m++) {
        var ma = state.spin * 2.6 * (m ? -0.7 : 1) + m * 2.4;
        var mx = x + Math.cos(ma) * r * 2.15;
        var my = y + Math.sin(ma) * r * 0.72;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var mg = ctx.createRadialGradient(mx, my, 0, mx, my, 5);
        mg.addColorStop(0, 'rgba(220,245,255,0.9)');
        mg.addColorStop(1, rgba(world.argb, 0));
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawShopRing(x, y, r, angle, spin, front, highlighted) {
    var start = front ? 0 : Math.PI;
    var end = front ? Math.PI : TAU;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.3 + Math.sin(angle) * 0.08);
    ctx.scale(1, 0.28);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(shopPalette.cyan, front ? (highlighted ? 0.72 : 0.46) : 0.2);
    ctx.lineWidth = Math.max(1, r * 0.055);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.56, start, end);
    ctx.stroke();
    ctx.strokeStyle = rgba(shopPalette.violet, front ? 0.5 : 0.16);
    ctx.lineWidth = Math.max(0.7, r * 0.014);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.8, start, end);
    ctx.stroke();
    ctx.strokeStyle = rgba(shopPalette.gold, front ? (highlighted ? 0.78 : 0.5) : 0.18);
    ctx.lineWidth = Math.max(0.6, r * 0.008);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.66, start, end);
    ctx.stroke();
    ctx.setLineDash([Math.max(3, r * 0.13), Math.max(9, r * 0.36)]);
    ctx.lineDashOffset = -spin * 90 * (front ? 1 : -1);
    ctx.strokeStyle = rgba(shopPalette.cyan, front ? (highlighted ? 0.34 : 0.2) : 0.08);
    ctx.lineWidth = Math.max(0.7, r * 0.011);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.72, start, end);
    ctx.stroke();
    ctx.setLineDash([]);
    var phase = spin;
    for (var i = 0; i < 8; i++) {
      var a = phase + i * TAU / 8;
      if ((Math.sin(a) >= 0) !== front) continue;
      var pulse = 0.74 + 0.26 * Math.sin(t * 0.00058 + i * 1.1);
      var px = Math.cos(a) * r * 1.66;
      var py = Math.sin(a) * r * 1.66;
      ctx.fillStyle = rgba(i % 3 === 0 ? shopPalette.gold : shopPalette.cyan, (front ? 0.95 : 0.35) * pulse);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1.1, r * 0.026) * (0.85 + pulse * 0.3), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawShopParcel(px, py, size, angle, alpha) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.scale(size, size);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(0, -0.55);
    ctx.lineTo(0.9, 0);
    ctx.lineTo(0, 0.55);
    ctx.lineTo(-0.9, 0);
    ctx.closePath();
    ctx.fillStyle = rgba(shopPalette.ice, 0.96);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.9, 0);
    ctx.lineTo(0, 0.55);
    ctx.lineTo(0, 1.05);
    ctx.lineTo(-0.9, 0.5);
    ctx.closePath();
    ctx.fillStyle = rgba(mix(shopPalette.violet, shopPalette.deep, 0.25), 0.94);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.9, 0);
    ctx.lineTo(0, 0.55);
    ctx.lineTo(0, 1.05);
    ctx.lineTo(0.9, 0.5);
    ctx.closePath();
    ctx.fillStyle = rgba(shopPalette.gold, 0.96);
    ctx.fill();
    ctx.strokeStyle = rgba(shopPalette.gold, 0.95);
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.moveTo(0, -0.55);
    ctx.lineTo(0, 0.55);
    ctx.stroke();
    ctx.restore();
  }

  function drawShopPlanet(world, state, highlighted) {
    var x = state.x;
    var y = state.y;
    var r = state.r;
    var halo = mix(shopPalette.cyan, shopPalette.gold, 0.18);
    var pulse = 0.5 + 0.5 * Math.sin(t * 0.00042);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(x, y, r * 0.18, x, y, r * (highlighted ? 4.2 : 3.2));
    glow.addColorStop(0, rgba(halo, (highlighted ? 0.4 : 0.24) + pulse * (highlighted ? 0.07 : 0.05)));
    glow.addColorStop(0.45, rgba(shopPalette.violet, (highlighted ? 0.22 : 0.12) + pulse * 0.02));
    glow.addColorStop(1, rgba(shopPalette.cyan, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 4.2, 0, TAU);
    ctx.fill();
    ctx.restore();

    drawShopRing(x, y, r, state.angle, state.spin, false, highlighted);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();

    var body = ctx.createRadialGradient(x - r * 0.36, y - r * 0.44, r * 0.03, x + r * 0.1, y + r * 0.08, r * 1.28);
    body.addColorStop(0, rgba(mix(shopPalette.ice, shopPalette.cyan, 0.32), 1));
    body.addColorStop(0.22, rgba(shopPalette.cyan, 1));
    body.addColorStop(0.52, rgba(shopPalette.blue, 1));
    body.addColorStop(0.78, rgba(mix(shopPalette.blue, shopPalette.violet, 0.7), 1));
    body.addColorStop(1, rgba(shopPalette.deep, 1));
    ctx.fillStyle = body;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    var drift = Math.sin(state.spin * 1.4) * r * 0.025;
    ctx.globalCompositeOperation = 'lighter';
    var sweep = Math.sin(state.spin * 2.2) * r * 0.6;
    var sheen = ctx.createLinearGradient(x + sweep - r * 0.4, y - r, x + sweep + r * 0.4, y + r);
    sheen.addColorStop(0, rgba(shopPalette.ice, 0));
    sheen.addColorStop(0.5, rgba(shopPalette.ice, highlighted ? 0.1 : 0.055));
    sheen.addColorStop(1, rgba(shopPalette.ice, 0));
    ctx.fillStyle = sheen;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    for (var i = 0; i < shopLand.length; i++) {
      var land = shopLand[i];
      var depth = Math.sqrt(Math.max(0, 1 - land.x * land.x - land.y * land.y));
      var lx = x + land.x * r + drift * (i % 2 ? 1 : -1);
      var ly = y + land.y * r + Math.cos(state.spin + i) * r * 0.012;
      var landColor = land.gold ? shopPalette.gold : shopPalette.cyan;
      ctx.globalAlpha = 0.2 + depth * 0.26 + (highlighted ? 0.12 : 0);
      ctx.fillStyle = rgba(landColor, 1);
      ctx.beginPath();
      ctx.ellipse(lx, ly, land.w * r * depth, land.h * r * depth, land.a, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = rgba(land.gold ? shopPalette.ice : shopPalette.violet, 0.7);
      ctx.lineWidth = Math.max(0.6, r * 0.008);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    var market = ctx.createRadialGradient(x + r * 0.18, y + r * 0.12, 0, x + r * 0.18, y + r * 0.12, r * 0.42);
    market.addColorStop(0, rgba(shopPalette.gold, 0.32));
    market.addColorStop(0.55, rgba(shopPalette.gold, 0.1));
    market.addColorStop(1, rgba(shopPalette.gold, 0));
    ctx.fillStyle = market;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(shopPalette.ice, 0.13);
    ctx.lineWidth = Math.max(0.6, r * 0.009);
    for (var b = 0; b < 3; b++) {
      ctx.beginPath();
      ctx.ellipse(x, y + (b - 1) * r * 0.36 + drift * 0.4, r * 0.88, r * (0.12 + b * 0.015), -0.18, 0, TAU);
      ctx.stroke();
    }

    for (var l = 0; l < 24; l++) {
      var la = l * 2.399 + 0.4;
      var lr = Math.sqrt((l + 0.5) / 24) * 0.86;
      var lx2 = x + Math.cos(la) * lr * r;
      var ly2 = y + Math.sin(la) * lr * r * 0.86 - r * 0.07;
      var lightDepth = Math.sqrt(Math.max(0, 1 - lr * lr));
      var twinkle = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(t * 0.00075 + l * 1.7));
      ctx.fillStyle = rgba(l % 5 === 0 ? shopPalette.gold : shopPalette.ice, (0.25 + lightDepth * 0.45) * twinkle + (highlighted ? 0.14 : 0));
      ctx.beginPath();
      ctx.arc(lx2, ly2, Math.max(0.7, r * (l % 5 === 0 ? 0.018 : 0.012)), 0, TAU);
      ctx.fill();
    }

    for (var f = 0; f < 5; f++) {
      var fa = f * 1.9 + 0.7;
      var fx = x + Math.cos(fa) * r * 0.62;
      var fy = y + Math.sin(fa) * r * 0.62;
      var flash = Math.pow(Math.max(0, Math.sin(t * 0.00062 + f * 2.3)), 10);
      if (flash < 0.04) continue;
      ctx.fillStyle = rgba(f % 2 ? shopPalette.gold : shopPalette.ice, flash * (highlighted ? 0.8 : 0.45));
      ctx.beginPath();
      ctx.arc(fx, fy, Math.max(0.8, r * 0.014) * (0.7 + flash * 0.6), 0, TAU);
      ctx.fill();
    }

    for (var q = 0; q < shopParcels.length; q++) {
      var item = shopParcels[q];
      var pd = Math.sqrt(Math.max(0, 1 - item.x * item.x - item.y * item.y));
      var px = x + item.x * r + drift * 0.5;
      var py = y + item.y * r + Math.sin(state.spin * 1.6 + q) * r * 0.01;
      drawShopParcel(px, py, r * item.s * (0.62 + pd * 0.38), item.a, 0.35 + pd * 0.45 + (highlighted ? 0.14 : 0));
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    var shadow = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    shadow.addColorStop(0, 'rgba(0,0,0,0)');
    shadow.addColorStop(0.46, rgba(shopPalette.deep, 0.12));
    shadow.addColorStop(1, 'rgba(2,3,12,0.93)');
    ctx.fillStyle = shadow;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(halo, highlighted ? 0.98 : 0.56);
    ctx.lineWidth = highlighted ? 2 : 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 0.5, 0, TAU);
    ctx.stroke();
    if (highlighted) {
      for (var k = 0; k < 3; k++) {
        ctx.strokeStyle = rgba(k === 1 ? shopPalette.gold : shopPalette.cyan, 0.48 - k * 0.12);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r * (1.16 + k * 0.16), t * 0.00035 + k, t * 0.00035 + k + 1.5);
        ctx.stroke();
      }
    }
    ctx.restore();

    drawShopRing(x, y, r, state.angle, state.spin, true, highlighted);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var m = 0; m < 3; m++) {
      var ma = state.spin * (m === 1 ? -0.78 : 1) + m * 2.2;
      var mx = x + Math.cos(ma) * r * 2.15;
      var my = y + Math.sin(ma) * r * 0.72;
      ctx.fillStyle = rgba(m === 1 ? shopPalette.gold : shopPalette.cyan, 0.22);
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(2.4, r * 0.075), 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(m === 1 ? shopPalette.gold : shopPalette.ice, 0.9);
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(1.1, r * 0.032), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDust() {
    if (view.z < 0.5 || lowPower) return;
    var layer = { depth: 1.14, x: layerState(1.14).x, y: layerState(1.14).y, z: layerState(1.14).z, points: dust };
    ctx.save();
    applyLayer(1.14);
    applyWarp();
    ctx.globalCompositeOperation = 'lighter';
    forEachTile(layer, function (particle, x, y) {
      var distance = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
      var influence = Math.max(0, 1 - distance / 420);
      var px = x + pointer.x * 30 * influence + Math.sin(t * 0.0004 + particle.p) * 5;
      var py = y + pointer.y * 24 * influence + Math.cos(t * 0.00035 + particle.p) * 5;
      ctx.fillStyle = rgba(particle.c, 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.001 + particle.p)));
      ctx.fillRect(px, py, particle.s, particle.s);
    });
    ctx.restore();
  }

  function drawStreaks() {
    var strength = warpProgress * warpProgress;
    var color = '190,215,255';
    if (warp && warp.worldId === 'play') color = warp.accentRgb || '125,211,252';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy);
    for (var i = 0; i < 52; i++) {
      var angle = i / 52 * TAU + t * 0.0002;
      var inner = M * 0.08;
      var length = strength * M * 0.9 * (0.5 + (i % 5) / 8);
      ctx.strokeStyle = 'rgba(' + color + ',' + (strength * 0.3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * (inner + length), Math.sin(angle) * (inner + length));
      ctx.stroke();
    }
    ctx.restore();
  }

  function loadDiscoveries() {
    try {
      var raw = window.localStorage.getItem(discoveryKey);
      discoveries = raw ? JSON.parse(raw) || {} : {};
    } catch (error) {
      discoveries = {};
    }
  }

  function saveDiscoveries() {
    try {
      window.localStorage.setItem(discoveryKey, JSON.stringify(discoveries));
    } catch (error) {
      return;
    }
  }

  function registerSecret(config) {
    var secret = {
      id: config.id,
      kind: config.kind,
      note: config.note,
      factorX: config.factorX,
      factorY: config.factorY,
      driftX: config.driftX,
      driftY: config.driftY,
      size: config.size,
      minSize: config.minSize,
      maxSize: config.maxSize,
      hitRadius: config.hitRadius,
      baseX: 0,
      baseY: 0,
      x: 0,
      y: 0,
      opacity: 0,
      found: !!discoveries[config.id]
    };
    secrets.push(secret);
    return secret;
  }

  function updateDiscoveryProgress() {
    if (!discoveryProgress) return;
    var count = 0;
    for (var i = 0; i < secrets.length; i++) {
      if (secrets[i].found) count++;
    }
    discoveryProgress.textContent = 'DESCUBRIMIENTOS ' + count + ' / ' + secrets.length;
    discoveryProgress.hidden = !discoveryOpen;
  }

  function setDiscoveryPanel(open) {
    discoveryOpen = !!open;
    if (discoveryPanel) {
      discoveryPanel.hidden = !discoveryOpen;
      discoveryPanel.classList.toggle('is-open', discoveryOpen);
    }
    if (discoveryToggle) discoveryToggle.setAttribute('aria-expanded', discoveryOpen ? 'true' : 'false');
    updateDiscoveryProgress();
  }

  function syncSecretPosition(secret) {
    var seed = secret.id.length;
    secret.x = secret.baseX + Math.sin(t * 0.00007 + seed) * W * secret.driftX;
    secret.y = secret.baseY + Math.cos(t * 0.00005 + seed * 0.7) * H * secret.driftY;
  }

  function secretScreen(secret) {
    syncSecretPosition(secret);
    return {
      x: (secret.x - view.x) * view.z + W / 2,
      y: (secret.y - view.y) * view.z + H / 2,
      size: clamp(secret.size * view.z, secret.minSize, secret.maxSize)
    };
  }

  function secretOnScreen(secret) {
    var screen = secretScreen(secret);
    return screen.x > -60 && screen.x < W + 60 && screen.y > -60 && screen.y < H + 60;
  }

  function secretExplored() {
    return view.z < 1.35 || Math.abs(view.x - W / 2) > W * 0.32 || Math.abs(view.y - H / 2) > H * 0.32;
  }

  function secretTargetOpacity(secret) {
    if (!secretOnScreen(secret) || !secretExplored()) return 0;
    return secret.found ? 0.55 : 0.92;
  }

  function updateSecrets(delta) {
    var ease = 1 - Math.pow(0.9, delta / 16.67);
    for (var i = 0; i < secrets.length; i++) {
      var secret = secrets[i];
      syncSecretPosition(secret);
      secret.opacity += (secretTargetOpacity(secret) - secret.opacity) * ease;
    }
  }

  function drawShipSecret(secret, screen, alpha) {
    var size = screen.size;
    var pulse = reduce ? 0 : 0.5 + 0.5 * Math.sin(t * 0.0024);
    var cyan = [84, 232, 255];
    var ice = [196, 246, 255];
    var gold = [255, 190, 120];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    var halo = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, size * 3);
    halo.addColorStop(0, rgba(cyan, 0.22 + pulse * 0.12));
    halo.addColorStop(0.45, rgba(cyan, 0.08));
    halo.addColorStop(1, rgba(cyan, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size * 3, 0, TAU);
    ctx.fill();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(-0.22 + Math.sin(t * 0.00014) * 0.1);
    ctx.fillStyle = rgba([10, 24, 48], 0.94);
    ctx.strokeStyle = rgba(cyan, 0.72 + pulse * 0.22);
    ctx.lineWidth = Math.max(0.8, size * 0.045);
    ctx.beginPath();
    ctx.moveTo(-size * 1.55, 0);
    ctx.lineTo(-size * 0.56, -size * 0.46);
    ctx.lineTo(size * 0.72, -size * 0.34);
    ctx.lineTo(size * 1.5, 0);
    ctx.lineTo(size * 0.72, size * 0.34);
    ctx.lineTo(-size * 0.56, size * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba(ice, 0.72);
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.08, size * 0.46, size * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(gold, 0.9);
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * size * 0.62, 0, size * 0.07, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMarbleSecret(secret, screen, alpha) {
    var size = screen.size;
    var pulse = reduce ? 0 : 0.5 + 0.5 * Math.sin(t * 0.0018);
    var cyan = [120, 230, 255];
    var violet = [178, 140, 255];
    var ice = [222, 246, 255];
    var gold = [255, 210, 140];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    var halo = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, size * 2.6);
    halo.addColorStop(0, rgba(violet, 0.2 + pulse * 0.1));
    halo.addColorStop(0.5, rgba(cyan, 0.07));
    halo.addColorStop(1, rgba(cyan, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size * 2.6, 0, TAU);
    ctx.fill();
    ctx.translate(screen.x, screen.y);
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, TAU);
    ctx.save();
    ctx.clip();
    var glass = ctx.createRadialGradient(-size * 0.35, -size * 0.4, size * 0.05, 0, 0, size);
    glass.addColorStop(0, rgba(ice, 0.34));
    glass.addColorStop(0.48, rgba(violet, 0.16));
    glass.addColorStop(1, rgba([8, 10, 34], 0.94));
    ctx.fillStyle = glass;
    ctx.fillRect(-size, -size, size * 2, size * 2);
    ctx.rotate(t * 0.00028);
    for (var i = 0; i < 3; i++) {
      ctx.strokeStyle = rgba(i === 1 ? violet : cyan, 0.34 + pulse * 0.18);
      ctx.lineWidth = Math.max(0.7, size * 0.035);
      ctx.beginPath();
      ctx.ellipse(0, 0, size * (0.78 - i * 0.18), size * (0.3 + i * 0.08), i * 0.72, 0, TAU);
      ctx.stroke();
    }
    for (var j = 0; j < 9; j++) {
      var angle = j * 2.399 + t * 0.0004;
      var radius = size * (0.12 + ((j * 37) % 70) / 100);
      ctx.fillStyle = rgba(j % 3 === 0 ? gold : ice, 0.65);
      ctx.fillRect(Math.cos(angle) * radius, Math.sin(angle) * radius, 1.3, 1.3);
    }
    ctx.restore();
    ctx.strokeStyle = rgba(ice, 0.55 + pulse * 0.2);
    ctx.lineWidth = Math.max(0.9, size * 0.05);
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = rgba(ice, 0.28);
    ctx.beginPath();
    ctx.ellipse(-size * 0.32, -size * 0.38, size * 0.2, size * 0.08, -0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawSecrets() {
    if (warp) return;
    for (var i = 0; i < secrets.length; i++) {
      var secret = secrets[i];
      if (!secretOnScreen(secret)) continue;
      var alpha = running ? secret.opacity : secretTargetOpacity(secret);
      if (alpha < 0.02) continue;
      var screen = secretScreen(secret);
      if (secret.kind === 'marble') drawMarbleSecret(secret, screen, alpha);
      else drawShipSecret(secret, screen, alpha);
    }
  }

  function findSecretHit(point) {
    if (warp) return null;
    for (var i = 0; i < secrets.length; i++) {
      var secret = secrets[i];
      if (secret.found || !secretOnScreen(secret)) continue;
      var alpha = running ? secret.opacity : secretTargetOpacity(secret);
      if (alpha < 0.28) continue;
      var screen = secretScreen(secret);
      var dx = point.x - screen.x;
      var dy = point.y - screen.y;
      var radius = Math.max(secret.hitRadius, screen.size * 1.9);
      if (dx * dx + dy * dy <= radius * radius) return secret;
    }
    return null;
  }

  function showTransientNote(note) {
    if (!secretNote) return;
    if (discoveryOpen) setDiscoveryPanel(false);
    window.clearTimeout(noteTimer);
    secretNote.textContent = note;
    secretNote.hidden = false;
    window.requestAnimationFrame(function () {
      secretNote.classList.add('is-visible');
    });
    noteTimer = window.setTimeout(function () {
      secretNote.classList.remove('is-visible');
      noteTimer = window.setTimeout(function () {
        secretNote.hidden = true;
      }, 500);
    }, 7200);
  }

  function revealSecret(secret) {
    if (!secret || secret.found) return false;
    secret.found = true;
    secret.opacity = Math.max(secret.opacity, 0.75);
    discoveries[secret.id] = true;
    saveDiscoveries();
    updateDiscoveryProgress();
    showTransientNote(secret.note);
    requestRender();
    return true;
  }

  function hunterScreen(x, y) {
    return {
      x: (x - view.x) * view.z + W / 2,
      y: (y - view.y) * view.z + H / 2
    };
  }

  function spawnFragments() {
    hunter.fragments = [];
    hunter.waves++;
    var now = performance.now();
    var count = lowPower ? 6 : 9;
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * TAU;
      var distance = Math.sqrt(Math.random()) * hunter.zone.r;
      var special = i > 0 && i % 4 === 0;
      hunter.fragments.push({
        x: hunter.zone.x + Math.cos(angle) * distance,
        y: hunter.zone.y + Math.sin(angle) * distance * 0.82,
        size: special ? 5.6 : 4.2,
        value: special ? 3 : 1,
        special: special,
        phase: Math.random() * TAU,
        born: now + Math.random() * 260,
        collected: false
      });
    }
  }

  function updateHunterHud() {
    if (hunterScore) hunterScore.textContent = String(hunter.score);
    if (hunterTime) hunterTime.textContent = String(Math.max(0, Math.ceil((hunter.endsAt - performance.now()) / 1000)));
  }

  function startHunter() {
    if (hunter.timer) window.clearInterval(hunter.timer);
    if (discoveryOpen) setDiscoveryPanel(false);
    hunter.active = true;
    hunter.score = 0;
    hunter.startedAt = performance.now();
    hunter.endsAt = hunter.startedAt + HUNTER_DURATION;
    hunter.sparks = [];
    if (hunterResult) {
      hunterResult.hidden = true;
      hunterResult.textContent = '';
    }
    if (hunterPanel) {
      hunterPanel.hidden = false;
      window.requestAnimationFrame(function () {
        hunterPanel.classList.add('is-open');
      });
    }
    spawnFragments();
    updateHunterHud();
    hunter.timer = window.setInterval(function () {
      updateHunter(performance.now());
    }, 200);
    requestRender();
  }

  function endHunter() {
    if (!hunter.active) return;
    hunter.active = false;
    if (hunter.timer) window.clearInterval(hunter.timer);
    hunter.timer = 0;
    hunter.fragments = [];
    hunter.sparks = [];
    var message = hunter.score >= 24
      ? 'RESONANCIA DE ALTA ENERGÍA'
      : hunter.score >= 14 ? 'BUENA CAZA ESTELAR' : 'SEÑAL ESTABLE';
    if (hunterResult) {
      hunterResult.hidden = false;
      hunterResult.textContent = 'RESULTADO ' + hunter.score + ' · ' + message;
    }
    if (hunter.score >= 24) showTransientNote('CAZADOR DE ESTRELLAS · RESONANCIA DE ALTA ENERGÍA');
    requestRender();
  }

  function exitHunter() {
    if (hunter.timer) window.clearInterval(hunter.timer);
    hunter.timer = 0;
    hunter.active = false;
    hunter.fragments = [];
    hunter.sparks = [];
    if (hunterResult) {
      hunterResult.hidden = true;
      hunterResult.textContent = '';
    }
    if (hunterPanel) {
      hunterPanel.classList.remove('is-open');
      window.setTimeout(function () {
        if (!hunter.active) hunterPanel.hidden = true;
      }, 320);
    }
    requestRender();
  }

  function updateHunter(now) {
    if (!hunter.active) return;
    if (now >= hunter.endsAt) {
      endHunter();
      return;
    }
    updateHunterHud();
  }

  function hunterFragmentScreen(fragment) {
    var screen = hunterScreen(fragment.x, fragment.y);
    screen.size = clamp(fragment.size * view.z, 3, 11);
    return screen;
  }

  function collectFragment(point) {
    if (!hunter.active) return false;
    var now = performance.now();
    for (var i = 0; i < hunter.fragments.length; i++) {
      var fragment = hunter.fragments[i];
      if (fragment.collected || now < fragment.born) continue;
      var screen = hunterFragmentScreen(fragment);
      var radius = Math.max(22, screen.size * 2.4);
      var dx = point.x - screen.x;
      var dy = point.y - screen.y;
      if (dx * dx + dy * dy > radius * radius) continue;
      fragment.collected = true;
      hunter.score += fragment.value;
      hunter.sparks.push({ x: fragment.x, y: fragment.y, start: now, special: fragment.special });
      if (hunter.sparks.length > 12) hunter.sparks.shift();
      updateHunterHud();
      var remaining = 0;
      for (var j = 0; j < hunter.fragments.length; j++) {
        if (!hunter.fragments[j].collected) remaining++;
      }
      if (remaining === 0) {
        window.setTimeout(function () {
          if (hunter.active) spawnFragments();
        }, 420);
      }
      requestRender();
      return true;
    }
    return false;
  }

  function hitHunterBeacon(point) {
    if (warp || hunter.active) return false;
    var screen = hunterScreen(hunter.beacon.x, hunter.beacon.y);
    if (screen.x < -40 || screen.x > W + 40 || screen.y < -40 || screen.y > H + 40) return false;
    var dx = point.x - screen.x;
    var dy = point.y - screen.y;
    return dx * dx + dy * dy <= 32 * 32;
  }

  function drawHunterBeacon() {
    if (warp) return;
    var screen = hunterScreen(hunter.beacon.x, hunter.beacon.y);
    if (screen.x < -80 || screen.x > W + 80 || screen.y < -80 || screen.y > H + 80) return;
    var target = hunter.active ? 0 : view.z < 0.6 ? 0.45 : 0.9;
    hunter.beacon.opacity += (target - hunter.beacon.opacity) * (running ? 0.12 : 1);
    if (hunter.beacon.opacity < 0.03) return;
    var size = clamp(7 * view.z, 5, 12);
    var pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.003);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = hunter.beacon.opacity;
    var halo = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, size * 4.5);
    halo.addColorStop(0, rgba([255, 229, 185], 0.4 + pulse * 0.16));
    halo.addColorStop(0.45, rgba([255, 181, 92], 0.14));
    halo.addColorStop(1, rgba([255, 181, 92], 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size * 4.5, 0, TAU);
    ctx.fill();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(t * 0.0009);
    ctx.strokeStyle = rgba([255, 216, 155], 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 2, size * 0.7, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = rgba([255, 242, 220], 0.92);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.72, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.72, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (hunter.beacon.opacity < 0.4) return;
    var label = 'CAZADOR DE ESTRELLAS';
    ctx.save();
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var width = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(4,8,24,0.86)';
    ctx.fillRect(screen.x - width / 2 - 8, screen.y + size * 2.2, width + 16, 18);
    ctx.strokeStyle = 'rgba(255,216,155,0.42)';
    ctx.lineWidth = 1;
    ctx.strokeRect(screen.x - width / 2 - 8, screen.y + size * 2.2, width + 16, 18);
    ctx.fillStyle = 'rgba(255,232,196,0.96)';
    ctx.fillText(label, screen.x, screen.y + size * 2.2 + 9);
    ctx.restore();
  }

  function drawHunter() {
    if (!hunter.active) return;
    var now = performance.now();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var s = 0; s < hunter.sparks.length; s++) {
      var spark = hunter.sparks[s];
      var age = (now - spark.start) / 560;
      if (age < 0 || age > 1) continue;
      var sparkScreen = hunterScreen(spark.x, spark.y);
      var color = spark.special ? [255, 216, 155] : [130, 232, 255];
      ctx.strokeStyle = rgba(color, (1 - age) * 0.75);
      ctx.lineWidth = Math.max(0.6, 2.4 * (1 - age));
      ctx.beginPath();
      ctx.arc(sparkScreen.x, sparkScreen.y, 8 + age * 30, 0, TAU);
      ctx.stroke();
    }
    for (var i = 0; i < hunter.fragments.length; i++) {
      var fragment = hunter.fragments[i];
      if (fragment.collected) continue;
      var ageFragment = now - fragment.born;
      if (ageFragment < 0) continue;
      var screen = hunterFragmentScreen(fragment);
      if (screen.x < -30 || screen.x > W + 30 || screen.y < -30 || screen.y > H + 30) continue;
      var alpha = clamp(ageFragment / 260, 0, 1) * (reduce ? 1 : 0.72 + 0.28 * Math.sin(t * 0.006 + fragment.phase));
      var color = fragment.special ? [255, 216, 155] : [130, 232, 255];
      var size = screen.size;
      var halo = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, size * 4);
      halo.addColorStop(0, rgba(color, alpha * 0.44));
      halo.addColorStop(0.5, rgba(color, alpha * 0.14));
      halo.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size * 4, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(t * 0.002 + fragment.phase);
      ctx.fillStyle = rgba(fragment.special ? [255, 246, 224] : [232, 250, 255], alpha);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.68, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size * 0.68, 0);
      ctx.closePath();
      ctx.fill();
      if (fragment.special) {
        ctx.strokeStyle = rgba(color, alpha * 0.9);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-size * 1.6, 0);
        ctx.lineTo(size * 1.6, 0);
        ctx.moveTo(0, -size * 1.6);
        ctx.lineTo(0, size * 1.6);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function updateRecenterButton() {
    if (!recenterButton) return;
    var distance = Math.sqrt(Math.pow(view.tx - cx, 2) + Math.pow(view.ty - cy, 2));
    var visible = navMode === 'multiverse' && (view.tz < 0.985 || distance > Math.min(W, H) * 0.08);
    recenterButton.classList.toggle('is-visible', visible);
    recenterButton.setAttribute('aria-hidden', visible ? 'false' : 'true');
    recenterButton.tabIndex = visible ? 0 : -1;
  }

  function updateModeUi() {
    stage.setAttribute('data-nav-mode', navMode);
    stage.setAttribute('data-nav-state', navMode);
    stage.classList.toggle('is-free-exploring', navMode === 'explore');
    document.body.classList.toggle('is-exploring-universe', navMode === 'explore');
    if (navMode === 'universe') {
      if (modeNote) modeNote.textContent = 'SCROLL PARA VER MUNDOS · CÁMARA FIJA';
    } else if (navMode === 'explore') {
      if (modeNote) modeNote.textContent = 'EXPLORACIÓN LIBRE · ESC PARA VOLVER';
    } else if (modeNote) {
      modeNote.textContent = exploreMode ? 'RUEDA O PINZA PARA ZOOM · DESLIZA PARA MOVER' : 'DESPLAZAMIENTO DE PÁGINA ACTIVO';
    }
    if (exploreButton) exploreButton.setAttribute('aria-pressed', exploreMode && navMode === 'multiverse' ? 'true' : 'false');
    if (exploreLabel) exploreLabel.textContent = exploreMode && navMode === 'multiverse' ? 'EXPLORACIÓN ACTIVA' : 'EXPLORAR ESPACIO';
  }

  function setExploreMode(enabled) {
    exploreMode = navMode === 'multiverse' ? !!enabled : false;
    stage.classList.toggle('is-exploring', exploreMode);
    updateModeUi();
  }

  function setNavMode(mode) {
    var previous = navMode;
    navMode = mode;
    if (mode !== 'multiverse') exploreMode = false;
    stage.classList.toggle('is-exploring', exploreMode);
    stage.setAttribute('data-nav-state', navMode);
    updateModeUi();
    if (!window.CustomEvent || previous === navMode) return;
    window.dispatchEvent(new window.CustomEvent(NAV_EVENT, {
      detail: {
        runtime: 'galaxy',
        contract: NAV_CONTRACT,
        state: navMode,
        previous: previous,
        focusId: focusId,
        selectedWorld: selectedWorld
      }
    }));
  }

  function closeFocusPanels() {
    Object.keys(focusPanels).forEach(function (id) {
      var panel = focusPanels[id];
      panel.classList.remove('is-open');
      panel.hidden = true;
    });
  }

  function updateMap(universe, planet) {
    if (mapUniverse) mapUniverse.textContent = universe || 'MULTIVERSO';
    if (mapPlanet) mapPlanet.textContent = planet || '—';
  }

  function selectWorld(link, worldId) {
    selectedWorld = worldId || null;
    stage.setAttribute('data-selected-world', selectedWorld || '');
    Array.prototype.forEach.call(document.querySelectorAll('[data-world-planet]'), function (item) {
      item.classList.toggle('is-selected', item === link);
    });
    if (link) {
      var label = link.querySelector('strong');
      if (label && label.textContent) updateMap(null, label.textContent.trim());
    }
  }

  function focusUniverse(id) {
    var world = byId[id];
    if (!world) return;
    focusId = id;
    selectedWorld = null;
    stage.setAttribute('data-selected-world', '');
    var state = worldState(world);
    view.tx = state.x;
    view.ty = state.y;
    view.tz = clamp(Math.max(view.tz, 2.45), MIN_ZOOM, MAX_ZOOM);
    view.vx = 0;
    view.vy = 0;
    view.trot = 0;
    view.vrot = 0;
    view.rot = 0;
    recenterHoldUntil = performance.now() + 4200;
    stage.classList.add('has-focus');
    nodes.forEach(function (node) {
      node.classList.toggle('is-dimmed', node.getAttribute('data-world') !== id);
    });
    closeFocusPanels();
    var panel = focusPanels[id];
    if (panel) {
      panel.style.setProperty('--focus-color', world.color);
      panel.hidden = false;
      window.requestAnimationFrame(function () {
        panel.classList.add('is-open');
      });
    }
    var config = universeById[id];
    updateMap(config ? config.short : id.toUpperCase(), 'MUNDOS');
    setNavMode('universe');
    requestRender();
  }

  function startFreeExploration(id) {
    var world = byId[id];
    if (!world) return;
    if (focusId !== id) focusUniverse(id);
    setNavMode('explore');
    closeFocusPanels();
    view.tz = clamp(Math.max(view.tz, mobile ? 2.6 : 3.1), MIN_ZOOM, MAX_ZOOM);
    view.trot = 0;
    view.vrot = 0;
    view.rot = 0;
    view.vx = 0;
    view.vy = 0;
    var config = universeById[id];
    if (config) updateMap(config.short, 'EXPLORACIÓN');
    if (exploreName) exploreName.textContent = config ? config.name : id.toUpperCase();
    if (exploreHud) {
      exploreHud.hidden = false;
      window.requestAnimationFrame(function () {
        exploreHud.classList.add('is-open');
      });
    }
    stage.classList.add('is-entering-exploration');
    window.setTimeout(function () {
      stage.classList.remove('is-entering-exploration');
    }, 900);
    window.requestAnimationFrame(resize);
    start();
    requestRender();
    if (exploreExit) window.setTimeout(function () { exploreExit.focus(); }, 420);
  }

  function exitFreeExploration() {
    if (navMode !== 'explore') return;
    if (exploreHud) {
      exploreHud.classList.remove('is-open');
      window.setTimeout(function () {
        if (navMode !== 'explore') exploreHud.hidden = true;
      }, 320);
    }
    freeStick.active = false;
    freeStick.x = 0;
    freeStick.y = 0;
    keys = {};
    var returnId = focusId;
    focusId = null;
    setNavMode('universe');
    if (returnId) focusUniverse(returnId);
    else backToMultiverse();
    window.requestAnimationFrame(resize);
    requestRender();
  }

  function backToMultiverse() {
    if (!focusId && navMode === 'multiverse') return;
    if (navMode === 'explore') exitFreeExploration();
    focusId = null;
    selectedWorld = null;
    stage.setAttribute('data-selected-world', '');
    closeFocusPanels();
    stage.classList.remove('has-focus');
    nodes.forEach(function (node) {
      node.classList.remove('is-dimmed');
    });
    updateMap('MULTIVERSO', '—');
    exploreMode = false;
    setNavMode('multiverse');
    resetView();
    requestRender();
  }

  function render() {
    var states = syncNodes();
    var lod = updateLod();
    updateRecenterButton();
    stage.setAttribute('data-lod', lod);
    stage.setAttribute('data-nav-mode', navMode);
    stage.setAttribute('data-zoom', view.z.toFixed(3));
    stage.setAttribute('data-core-x', ((cx - view.x) * view.z + W / 2).toFixed(1));
    stage.setAttribute('data-core-y', ((cy - view.y) * view.z + H / 2).toFixed(1));
    stage.setAttribute('data-hunter-x', hunter.zone.x.toFixed(1));
    stage.setAttribute('data-hunter-y', hunter.zone.y.toFixed(1));
    stage.setAttribute('data-hunter-r', hunter.zone.r.toFixed(1));
    stage.setAttribute('data-hunter-active', hunter.active ? '1' : '0');
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground();
    drawPointerAura();
    drawStars();
    ctx.save();
    applyLayer(0.74);
    applyWarp();
    drawNebula();
    drawSpiral();
    ctx.restore();
    ctx.save();
    applyView();
    applyWarp();
    drawBlackHoles();
    ctx.save();
    ctx.translate(pointer.x * 12, pointer.y * 8);
    ctx.save();
    ctx.globalAlpha = focusId ? 0.28 : 1;
    drawCore();
    ctx.restore();
    worlds.slice().sort(function (a, b) {
      return states[a.id].depth - states[b.id].depth;
    }).forEach(function (world) {
      var active = hovered === world.id || openId === world.id || document.activeElement === world.el;
      drawUniverseField(world, states[world.id], !!active);
      if (world.id === 'shop') drawShopPlanet(world, states[world.id], !!active);
      else drawPlanet(world, states[world.id], !!active);
      drawUniverseSatellites(world, states[world.id], !!active);
    });
    if (view.z > 0.55) drawEvents();
    ctx.restore();
    ctx.restore();
    drawDust();
    if (view.z > 1.15 && currentLod !== 'overview') drawSecrets();
    if (view.z > 0.7) drawHunterBeacon();
    drawHunter();
    if (warp) drawStreaks();
    if (ui && !coarse) {
      ui.style.setProperty('--ui-x', (-pointer.x * 12).toFixed(1) + 'px');
      ui.style.setProperty('--ui-y', (-pointer.y * 8).toFixed(1) + 'px');
    }
  }

  function frame(now) {
    if (!running) return;
    var rawDelta = last ? Math.min(48, now - last) : 16;
    var delta = last ? motionStep + (rawDelta - motionStep) * 0.08 : 16;
    motionStep = delta;
    last = now;
    t += rawDelta;
    orbitalTime += delta;
    var pointerEase = 1 - Math.pow(0.945, rawDelta / 16.67);
    pointer.x += (pointer.tx - pointer.x) * pointerEase;
    pointer.y += (pointer.ty - pointer.y) * pointerEase;
    applyKeys(rawDelta);
    updateView(rawDelta);
    updateEvents(delta);
    updateSecrets(delta);
    if (warp) {
      warpProgress = Math.min(1, (now - warp.start) / 900);
      if (warpProgress >= 1) {
        var destination = warp.href;
        if (warp.navigated) return;
        warp.navigated = true;
        if (warp.timer) window.clearTimeout(warp.timer);
        stage.classList.remove('is-warping');
        stage.classList.remove('warp-play');
        warp = null;
        window.location.assign(destination);
        return;
      }
    }
    render();
    raf = window.requestAnimationFrame(frame);
  }

  function start() {
    if (reduce || !visible) {
      if (reduce) render();
      return;
    }
    if (running) return;
    running = true;
    last = 0;
    raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    clearEvents();
    eventSystem.clock = 0;
    eventSystem.next = EVENT_MIN_INTERVAL;
  }

  function setHover(id) {
    if (hovered === id) return;
    hovered = id;
    if (!running) render();
  }

  function openDialog(id) {
    var dialog = dialogs[id];
    if (!dialog) return;
    if (openId) closeDialog(true);
    openId = id;
    lastTrigger = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('modal-open');
    window.requestAnimationFrame(function () {
      dialog.classList.add('is-open');
    });
    var close = dialog.querySelector('.world-detail__close');
    if (close) close.focus();
    render();
  }

  function closeDialog(silent) {
    if (!openId) return;
    var dialog = dialogs[openId];
    var closing = openId;
    openId = null;
    document.body.classList.remove('modal-open');
    if (dialog) {
      dialog.classList.remove('is-open');
      window.setTimeout(function () {
        if (openId !== closing) dialog.hidden = true;
      }, 380);
    }
    if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
    if (!silent) render();
  }

  nodes.forEach(function (element) {
    var id = element.getAttribute('data-world');
    element.addEventListener('pointerenter', function () { setHover(id); });
    element.addEventListener('pointerleave', function () { setHover(null); });
    element.addEventListener('focus', function () { setHover(id); });
    element.addEventListener('blur', function () { setHover(null); });
  });
  indexItems.forEach(function (element) {
    var id = element.getAttribute('data-index');
    element.addEventListener('pointerenter', function () { setHover(id); });
    element.addEventListener('pointerleave', function () { setHover(null); });
    element.addEventListener('focus', function () { setHover(id); });
    element.addEventListener('blur', function () { setHover(null); });
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var universeTrigger = target.closest('[data-universe-focus]');
    if (universeTrigger) {
      event.preventDefault();
      var universeId = universeTrigger.getAttribute('data-universe-focus');
      if (universeId === focusId) backToMultiverse();
      else focusUniverse(universeId);
      return;
    }
    if (target.closest('[data-universe-back]')) {
      event.preventDefault();
      backToMultiverse();
      return;
    }
    var exploreTrigger = target.closest('[data-explore-universe]');
    if (exploreTrigger) {
      event.preventDefault();
      startFreeExploration(exploreTrigger.getAttribute('data-explore-universe') || focusId);
      return;
    }
    if (target.closest('[data-explore-exit]')) {
      event.preventDefault();
      exitFreeExploration();
      return;
    }
    var trigger = target.closest('[data-dialog]');
    if (trigger) {
      event.preventDefault();
      openDialog(trigger.getAttribute('data-dialog'));
      return;
    }
    var warpLink = target.closest('[data-warp]');
    if (!warpLink || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (warp) return;
    event.preventDefault();
    var href = warpLink.getAttribute('href') || '/shop';
    var panel = warpLink.closest('[data-universe-panel]');
    var worldId = warpLink.getAttribute('data-world')
      || (panel && panel.getAttribute('data-universe-panel')) || 'shop';
    var world = byId[worldId] || byId.shop;
    selectWorld(warpLink, worldId);
    if (reduce || !ctx) {
      window.location.assign(href);
      return;
    }
    var state = worldState(world);
    var accentRgb = (world.argb || [125, 211, 252]).join(',');
    warp = { x: state.x, y: state.y, start: performance.now(), href: href, worldId: worldId, navigated: false, timer: 0, accentRgb: accentRgb };
    warpProgress = 0;
    clearEvents();
    if (worldId === 'play') {
      stage.classList.add('warp-play');
      stage.style.setProperty('--warp-accent', world.accent || '#7dd3fc');
      stage.style.setProperty('--warp-accent-rgb', accentRgb);
    } else {
      stage.classList.remove('warp-play');
      stage.style.removeProperty('--warp-accent');
      stage.style.removeProperty('--warp-accent-rgb');
    }
    warp.timer = window.setTimeout(function () {
      if (!warp || warp.navigated) return;
      warp.navigated = true;
      stage.classList.remove('is-warping');
      stage.classList.remove('warp-play');
      var fallbackHref = warp.href;
      warp = null;
      window.location.assign(href);
    }, 1000);
    stage.classList.add('is-warping');
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-close]')) closeDialog(false);
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-discovery-toggle]')) {
      event.preventDefault();
      setDiscoveryPanel(!discoveryOpen);
      return;
    }
    if (discoveryOpen && !target.closest('[data-exploration]')) setDiscoveryPanel(false);
  });

  function localPoint(event) {
    var rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pointerCount() {
    return Object.keys(pointers).length;
  }

  function pointerCenter() {
    var ids = Object.keys(pointers);
    var x = 0;
    var y = 0;
    for (var i = 0; i < ids.length; i++) {
      x += pointers[ids[i]].x;
      y += pointers[ids[i]].y;
    }
    return { x: x / ids.length, y: y / ids.length };
  }

  function pointerDistance() {
    var ids = Object.keys(pointers);
    if (ids.length < 2) return 1;
    var a = pointers[ids[0]];
    var b = pointers[ids[1]];
    return Math.max(1, Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)));
  }

  function endPointer(event) {
    delete pointers[event.pointerId];
    if (pointerCount() < 2) pinch = null;
    if (drag && drag.id === event.pointerId) {
      drag = null;
      stage.classList.remove('is-dragging');
    }
    if (freeStick.active && freeStick.id === event.pointerId) {
      freeStick.active = false;
      freeStick.id = null;
      freeStick.x = 0;
      freeStick.y = 0;
      if (exploreStickKnob) exploreStickKnob.style.transform = '';
    }
    if (stage.releasePointerCapture) {
      try { stage.releasePointerCapture(event.pointerId); } catch (error) { return; }
    }
  }

  function updateFreeStick(event) {
    if (!exploreStick) return;
    var rect = exploreStick.getBoundingClientRect();
    var x = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    var y = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    var length = Math.sqrt(x * x + y * y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    freeStick.x = x;
    freeStick.y = y;
    if (exploreStickKnob) exploreStickKnob.style.transform = 'translate(' + (x * 20).toFixed(1) + 'px,' + (y * 20).toFixed(1) + 'px)';
  }

  function controlKey(event) {
    if (event.code === 'Space') return 'up';
    var key = String(event.key || '').toLowerCase();
    if (key === 'arrowleft') return 'left';
    if (key === 'arrowright') return 'right';
    if (key === 'arrowup') return 'forward';
    if (key === 'arrowdown') return 'backward';
    if (key === 'a') return 'left';
    if (key === 'd') return 'right';
    if (key === 'w') return 'forward';
    if (key === 's') return 'backward';
    if (key === 'c') return 'down';
    if (key === 'q') return 'rotLeft';
    if (key === 'e') return 'rotRight';
    if (key === 'shift') return 'boost';
    if (key === '+' || key === '=') return 'zoomIn';
    if (key === '-' || key === '_') return 'zoomOut';
    if (key === '0') return 'reset';
    return '';
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && hunter.active) {
      exitHunter();
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && openId) {
      closeDialog(false);
      return;
    }
    if (event.key === 'Escape' && discoveryOpen) {
      setDiscoveryPanel(false);
      return;
    }
    if (event.key === 'Escape' && navMode === 'explore') {
      exitFreeExploration();
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && focusId) {
      backToMultiverse();
      return;
    }
    if (event.target && event.target.closest && event.target.closest('input,textarea,select,[contenteditable]')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (navMode === 'universe') return;
    var focused = document.activeElement;
    if (navMode !== 'explore' && !exploreMode && !(focused && stage.contains(focused))) return;
    var control = controlKey(event);
    if (!control) return;
    if (control === 'reset') {
      if (navMode === 'explore') view.trot = 0;
      resetView();
      requestRender();
      event.preventDefault();
      return;
    }
    if (reduce) {
      if (control === 'left') panBy(90, 0);
      else if (control === 'right') panBy(-90, 0);
      else if (control === 'forward') zoomAt(W / 2, H / 2, 1.18);
      else if (control === 'backward') zoomAt(W / 2, H / 2, 0.85);
      else if (control === 'down') panBy(0, -90);
      else if (control === 'up') panBy(0, 90);
      else if (control === 'zoomIn') zoomAt(W / 2, H / 2, 1.18);
      else if (control === 'zoomOut') zoomAt(W / 2, H / 2, 0.85);
      else return;
      event.preventDefault();
      requestRender();
      return;
    }
    keys[control] = true;
    event.preventDefault();
  });

  document.addEventListener('keyup', function (event) {
    var control = controlKey(event);
    if (control && control !== 'reset') keys[control] = false;
  });

  window.addEventListener('pointermove', function (event) {
    var point = localPoint(event);
    if (!coarse && !reduce) {
      pointer.tx = clamp(point.x / W * 2 - 1, -1, 1);
      pointer.ty = clamp(point.y / H * 2 - 1, -1, 1);
    } else if (reduce) {
      pointer.tx = 0;
      pointer.ty = 0;
    }
    if (freeStick.active && freeStick.id === event.pointerId) updateFreeStick(event);
    if (navMode === 'explore' && !drag && !coarse && !reduce && pointerCount() === 0) {
      var lookDx = event.movementX || 0;
      if (lookDx) {
        view.trot += lookDx * 0.0011;
        view.vrot = clamp(lookDx * 0.00035, -0.012, 0.012);
      }
    }
    if (pointers[event.pointerId]) pointers[event.pointerId] = point;
    if (pinch && pointerCount() >= 2) {
      event.preventDefault();
      var center = pointerCenter();
      var distance = pointerDistance();
      panBy(center.x - pinch.center.x, center.y - pinch.center.y);
      zoomAt(center.x, center.y, distance / pinch.distance);
      pinch.center = center;
      pinch.distance = distance;
      requestRender();
      return;
    }
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    var dx = point.x - drag.x;
    var dy = point.y - drag.y;
    var now = performance.now();
    var dt = Math.max(8, now - drag.time);
    panBy(dx, dy);
    if (!reduce) {
      view.vx = -dx / view.tz / dt * 0.8;
      view.vy = -dy / view.tz / dt * 0.8;
    }
    drag.x = point.x;
    drag.y = point.y;
    drag.time = now;
    requestRender();
  }, { passive: false });

  stage.addEventListener('pointerleave', function () {
    if (!drag) {
      pointer.tx = 0;
      pointer.ty = 0;
    }
  });

  stage.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest && event.target.closest('a,button,.galaxy-intro,.galaxy-index,.galaxy-game,.galaxy-exploration,.galaxy-explore-hud,.galaxy-focus,.galaxy-controls,.world-detail')) return;
    var point = localPoint(event);
    if (collectFragment(point)) {
      event.preventDefault();
      return;
    }
    if (hitHunterBeacon(point)) {
      startHunter();
      event.preventDefault();
      return;
    }
    if (revealSecret(findSecretHit(point))) {
      event.preventDefault();
      return;
    }
    if (navMode === 'universe') return;
    if (event.pointerType === 'touch' && !exploreMode && navMode !== 'explore') return;
    pointers[event.pointerId] = point;
    if (stage.setPointerCapture) {
      try {
        stage.setPointerCapture(event.pointerId);
      } catch (error) {
        delete pointers[event.pointerId];
        return;
      }
    }
    if (pointerCount() === 2) {
      pinch = { center: pointerCenter(), distance: pointerDistance() };
      drag = null;
      stage.classList.remove('is-dragging');
      event.preventDefault();
      return;
    }
    if (pointerCount() > 1) return;
    drag = { id: event.pointerId, x: point.x, y: point.y, time: performance.now() };
    stage.classList.add('is-dragging');
    event.preventDefault();
  }, { passive: false });

  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  window.addEventListener('blur', function () {
    keys = {};
    pointers = {};
    pinch = null;
    if (drag) {
      drag = null;
      stage.classList.remove('is-dragging');
    }
  });

  stage.addEventListener('wheel', function (event) {
    if (event.target.closest && event.target.closest('.galaxy-index,.galaxy-intro,.galaxy-focus,.galaxy-controls,.galaxy-explore-hud,.world-detail')) return;
    if (navMode === 'universe') return;
    if (navMode !== 'explore' && !exploreMode && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    var delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? H : 1);
    var speed = event.shiftKey ? FINE_ZOOM_SPEED : ZOOM_SPEED;
    var point = localPoint(event);
    zoomAt(point.x, point.y, Math.exp(-delta * speed));
    view.vx = 0;
    view.vy = 0;
    requestRender();
  }, { passive: false });

  stage.addEventListener('dblclick', function (event) {
    if (event.target.closest && event.target.closest('a,button,.galaxy-intro,.galaxy-index,.galaxy-focus,.world-detail')) return;
    if (navMode === 'explore') exitFreeExploration();
    else if (focusId) backToMultiverse();
    else {
      resetView();
      requestRender();
    }
  });

  if (recenterButton) {
    recenterButton.addEventListener('click', function () {
      if (navMode === 'explore') exitFreeExploration();
      else if (focusId) backToMultiverse();
      else {
        resetView();
        requestRender();
      }
    });
  }
  if (exploreButton) {
    exploreButton.addEventListener('click', function () {
      setExploreMode(!exploreMode);
    });
  }
  if (exploreExit) exploreExit.addEventListener('click', exitFreeExploration);
  if (exploreStick) {
    exploreStick.addEventListener('pointerdown', function (event) {
      if (navMode !== 'explore') return;
      event.preventDefault();
      event.stopPropagation();
      freeStick.active = true;
      freeStick.id = event.pointerId;
      updateFreeStick(event);
      if (exploreStick.setPointerCapture) {
        try { exploreStick.setPointerCapture(event.pointerId); } catch (error) {}
      }
    });
  }
  if (hunterStart) hunterStart.addEventListener('click', startHunter);
  Array.prototype.forEach.call(document.querySelectorAll('[data-hunter-restart]'), function (button) {
    button.addEventListener('click', function () {
      if (hunter.timer) window.clearInterval(hunter.timer);
      hunter.timer = 0;
      hunter.active = false;
      startHunter();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-hunter-exit]'), function (button) {
    button.addEventListener('click', exitHunter);
  });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      eventSystem.paused = true;
      stop();
    } else {
      eventSystem.paused = false;
      eventSystem.clock = 0;
      eventSystem.next = EVENT_MIN_INTERVAL;
      start();
    }
  });

  if (!window.OTRAVERSO) window.OTRAVERSO = {};
  window.OTRAVERSO.GALAXY_EVENTS = {
    getState: function () {
      var active = [];
      for (var i = 0; i < events.length; i++) {
        active.push({
          type: events[i].type,
          priority: events[i].priority,
          frequency: events[i].frequency,
          x: events[i].x,
          y: events[i].y,
          life: events[i].life,
          duration: events[i].maxLife,
          rare: events[i].rare
        });
      }
      return {
        active: eventSystem.enabled && !eventSystem.paused && !reduce && !warp,
        paused: eventSystem.paused,
        reduce: reduce,
        lowPower: lowPower,
        visible: visible,
        probability: EVENT_SPAWN_CHANCE,
        minInterval: EVENT_MIN_INTERVAL,
        maxInterval: EVENT_MAX_INTERVAL,
        maxActive: EVENT_MAX_ACTIVE,
        poolCap: EVENT_POOL_CAP,
        clock: eventSystem.clock,
        next: eventSystem.next,
        spawned: eventSystem.spawned,
        skipped: eventSystem.skipped,
        lastType: eventSystem.lastType,
        activeCount: events.length,
        events: active
      };
    },
    pause: function () {
      eventSystem.paused = true;
      clearEvents();
    },
    resume: function () {
      eventSystem.paused = false;
      eventSystem.clock = 0;
      eventSystem.next = EVENT_MIN_INTERVAL;
    },
    clear: function () {
      clearEvents();
      eventSystem.clock = 0;
      eventSystem.next = EVENT_MIN_INTERVAL;
    }
  };

  window.OTRAVERSO.GALAXY_NAV = {
    contract: 'navigation-1',
    runtime: 'galaxy',
    states: NAV_STATES.slice(),
    event: NAV_EVENT,
    getState: function () {
      return {
        contract: 'navigation-1',
        runtime: 'galaxy',
        state: navMode,
        mode: navMode,
        focusId: focusId,
        selectedWorld: selectedWorld,
        exploreMode: exploreMode,
        zoom: view.z,
        rotation: view.rot
      };
    },
    focus: focusUniverse,
    explore: startFreeExploration,
    exit: exitFreeExploration,
    back: backToMultiverse
  };

  window.OTRAVERSO.NAVIGATION = {
    contract: NAV_CONTRACT,
    event: NAV_EVENT,
    states: NAV_STATES.slice(),
    runtime: 'galaxy',
    getState: window.OTRAVERSO.GALAXY_NAV.getState
  };

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start();
      else stop();
    }, { threshold: 0.02 });
    observer.observe(stage);
  }

  setExploreMode(false);
  resize();
  start();
})();
