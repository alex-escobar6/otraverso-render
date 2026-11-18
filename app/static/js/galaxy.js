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
  var dialogs = {};
  Array.prototype.forEach.call(document.querySelectorAll('.world-detail[data-dialog]'), function (dialog) {
    dialogs[dialog.getAttribute('data-dialog')] = dialog;
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
    { id: 'shop', color: '#8b5cf6', accent: '#54e8ff', base: -0.42, orbit: 1.02, size: 0.076, speed: 0.000055, spin: 0.00011, parallax: 22, ring: true, moons: true },
    { id: 'whatif', color: '#ffb347', accent: '#ffd89b', base: -1.74, orbit: 0.96, size: 0.056, speed: 0.00004, spin: 0.00017, parallax: 15, ring: false, moons: false },
    { id: 'play', color: '#f472b6', accent: '#7dd3fc', base: 0.78, orbit: 0.92, size: 0.052, speed: 0.00007, spin: 0.00014, parallax: 18, ring: true, moons: false },
    { id: 'labs', color: '#60a5fa', accent: '#5eead4', base: 2.52, orbit: 0.9, size: 0.05, speed: 0.00005, spin: 0.00009, parallax: 14, ring: false, moons: false }
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
  var view = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1, vx: 0, vy: 0 };
  var viewInit = false;
  var keys = {};
  var pointers = {};
  var pinch = null;
  var MIN_ZOOM = 0.35;
  var MAX_ZOOM = 7.2;
  var BOUND_FACTOR = 3.2;
  var ZOOM_SPEED = 0.0013;
  var FINE_ZOOM_SPEED = 0.00045;
  var drag = null;
  var events = [];
  var eventClock = 0;
  var eventNext = 1400;
  var eventsSeeded = false;
  var discoveryKey = 'otraverso.discoveries.v1';
  var discoveries = {};
  var secrets = [];
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

  function makeEvent() {
    var color = Math.random() > 0.55 ? [120, 205, 255] : [190, 160, 255];
    if (Math.random() < 0.45) {
      var life = 1500 + Math.random() * 900;
      return {
        type: 'flare',
        x: cx + (Math.random() - 0.5) * rx * 1.5,
        y: cy + (Math.random() - 0.5) * ry * 1.5,
        life: life,
        maxLife: life,
        color: color,
        size: 3 + Math.random() * 4
      };
    }
    var fromLeft = Math.random() > 0.5;
    var duration = 8500 + Math.random() * 4500;
    return {
      type: 'drift',
      x: fromLeft ? -40 : W + 40,
      y: H * (0.1 + Math.random() * 0.8),
      vx: (fromLeft ? 1 : -1) * (0.038 + Math.random() * 0.05),
      vy: (Math.random() - 0.5) * 0.014,
      life: duration,
      maxLife: duration,
      color: color,
      size: 0.9 + Math.random() * 1.5
    };
  }

  function updateEvents(delta) {
    eventClock += delta;
    if (eventClock >= eventNext) {
      eventClock = 0;
      eventNext = (lowPower ? 6500 : 3800) + Math.random() * (lowPower ? 4000 : 3200);
      if (events.length < (lowPower ? 2 : 5)) events.push(makeEvent());
    }
    for (var i = events.length - 1; i >= 0; i--) {
      var event = events[i];
      event.life -= delta;
      if (event.type === 'drift') {
        event.x += event.vx * delta;
        event.y += event.vy * delta;
        if (event.x < -60 || event.x > W + 60 || event.y < -40 || event.y > H + 40) event.life = 0;
      }
      if (event.life <= 0) events.splice(i, 1);
    }
  }

  function drawEvents() {
    if (!events.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      var fadeIn = Math.min(1, (event.maxLife - event.life) / 700);
      var fadeOut = Math.min(1, event.life / 900);
      var alpha = fadeIn * fadeOut;
      if (event.type === 'flare') {
        var progress = 1 - event.life / event.maxLife;
        ctx.strokeStyle = rgba(event.color, alpha * (0.38 - progress * 0.22));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(event.x, event.y, event.size + progress * 26, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = rgba(event.color, alpha * 0.5);
        ctx.beginPath();
        ctx.arc(event.x, event.y, Math.max(0.8, event.size * (1 - progress * 0.5)), 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = rgba(event.color, alpha * 0.32);
        ctx.lineWidth = Math.max(0.8, event.size * 0.7);
        ctx.beginPath();
        ctx.moveTo(event.x, event.y);
        ctx.lineTo(event.x - event.vx * 220, event.y - event.vy * 220);
        ctx.stroke();
        ctx.fillStyle = rgba(event.color, alpha * 0.9);
        ctx.beginPath();
        ctx.arc(event.x, event.y, Math.max(0.9, event.size), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function worldBounds() {
    return {
      left: W / 2 - W * BOUND_FACTOR,
      right: W / 2 + W * BOUND_FACTOR,
      top: H / 2 - H * BOUND_FACTOR,
      bottom: H / 2 + H * BOUND_FACTOR
    };
  }

  function clampCamera() {
    var bounds = worldBounds();
    var halfW = W / (2 * view.tz);
    var halfH = H / (2 * view.tz);
    view.tz = clamp(view.tz, MIN_ZOOM, MAX_ZOOM);
    view.tx = bounds.right - bounds.left < halfW * 2 ? W / 2 : clamp(view.tx, bounds.left + halfW, bounds.right - halfW);
    view.ty = bounds.bottom - bounds.top < halfH * 2 ? H / 2 : clamp(view.ty, bounds.top + halfH, bounds.bottom - halfH);
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
  }

  function applyWarp() {
    if (!warp) return;
    var zoom = 1 + warpProgress * 3.6;
    ctx.translate(warp.x, warp.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-warp.x, -warp.y);
  }

  function screenToWorld(x, y) {
    return {
      x: view.tx + (x - W / 2) / view.tz,
      y: view.ty + (y - H / 2) / view.tz
    };
  }

  function panBy(dx, dy) {
    view.tx -= dx / view.tz;
    view.ty -= dy / view.tz;
    clampCamera();
  }

  function zoomAt(x, y, factor) {
    var next = clamp(view.tz * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === view.tz) return;
    var point = screenToWorld(x, y);
    view.tx = point.x - (x - W / 2) / next;
    view.ty = point.y - (y - H / 2) / next;
    view.tz = next;
    clampCamera();
  }

  function updateView(delta) {
    if (reduce) {
      clampCamera();
      view.x = view.tx;
      view.y = view.ty;
      view.z = view.tz;
      return;
    }
    if (!drag && !pinch) {
      view.tx += view.vx * delta * 0.6;
      view.ty += view.vy * delta * 0.6;
      var decay = Math.pow(0.9, delta / 16.67);
      view.vx *= decay;
      view.vy *= decay;
      if (Math.abs(view.vx) < 0.00002) view.vx = 0;
      if (Math.abs(view.vy) < 0.00002) view.vy = 0;
    }
    clampCamera();
    var ease = 1 - Math.pow(0.86, delta / 16.67);
    view.x += (view.tx - view.x) * ease;
    view.y += (view.ty - view.y) * ease;
    view.z += (view.tz - view.z) * ease;
    var bounds = worldBounds();
    var halfW = W / (2 * view.z);
    var halfH = H / (2 * view.z);
    view.x = bounds.right - bounds.left < halfW * 2 ? W / 2 : clamp(view.x, bounds.left + halfW, bounds.right - halfW);
    view.y = bounds.bottom - bounds.top < halfH * 2 ? H / 2 : clamp(view.y, bounds.top + halfH, bounds.bottom - halfH);
  }

  function applyKeys(delta) {
    var step = 260 * delta / 1000 / view.tz;
    if (keys.left) view.tx -= step;
    if (keys.right) view.tx += step;
    if (keys.up) view.ty -= step;
    if (keys.down) view.ty += step;
    if (keys.zoomIn) zoomAt(W / 2, H / 2, 1 + delta * 0.0007);
    if (keys.zoomOut) zoomAt(W / 2, H / 2, 1 - delta * 0.0007);
    clampCamera();
  }

  function resetView() {
    view.tx = W / 2;
    view.ty = H / 2;
    view.tz = 1;
    view.vx = 0;
    view.vy = 0;
  }

  function requestRender() {
    if (reduce) {
      clampCamera();
      view.x = view.tx;
      view.y = view.ty;
      view.z = view.tz;
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
    return 'rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',' + alpha + ')';
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
    if (!viewInit) {
      view.x = view.tx = W / 2;
      view.y = view.ty = H / 2;
      viewInit = true;
    }
    clampCamera();
    view.x = clamp(view.x, W / 2 - W * BOUND_FACTOR, W / 2 + W * BOUND_FACTOR);
    view.y = clamp(view.y, H / 2 - H * BOUND_FACTOR, H / 2 + H * BOUND_FACTOR);
    mobile = window.innerWidth < 760;
    medium = !mobile && W < 1200;
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
    cx = W * (mobile ? 0.5 : medium ? 0.7 : 0.61);
    cy = H * (mobile ? 0.64 : 0.5);
    rx = M * (mobile ? 0.4 : medium ? 0.24 : 0.36);
    ry = rx * (mobile ? 0.54 : 0.46);
    for (var secretIndex = 0; secretIndex < secrets.length; secretIndex++) {
      var secret = secrets[secretIndex];
      secret.baseX = cx + rx * secret.factorX;
      secret.baseY = cy + ry * secret.factorY;
    }
    buildScene();
    if (!eventsSeeded) {
      events.push(makeEvent());
      eventsSeeded = true;
    }
    syncNodes();
    if (!running) render();
  }

  function worldState(world) {
    var angle = world.base + Math.sin(orbitalTime * world.speed + world.seed) * 0.16 + (coarse ? 0 : pointer.x * 0.035);
    var depth = Math.sin(angle);
    var scale = 0.84 + 0.16 * (depth + 1) / 2;
    return {
      x: cx + Math.cos(angle) * rx * world.orbit + (coarse ? 0 : pointer.x * world.parallax),
      y: cy + Math.sin(angle) * ry * world.orbit + (coarse ? 0 : pointer.y * world.parallax * 0.55),
      r: M * world.size * scale * (mobile ? 1.16 : 1),
      depth: depth,
      angle: angle,
      scale: scale,
      spin: orbitalTime * (world.spin || 0.00012)
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

  function drawCore() {
    var r = M * (mobile ? 0.044 : 0.05);
    var pulse = 0.5 + 0.5 * Math.sin(t * 0.0006);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 6);
    halo.addColorStop(0, 'rgba(160,150,255,' + (0.26 + pulse * 0.1).toFixed(3) + ')');
    halo.addColorStop(0.35, 'rgba(90,90,220,' + (0.1 + pulse * 0.04).toFixed(3) + ')');
    halo.addColorStop(1, 'rgba(60,60,180,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 6, 0, TAU);
    ctx.fill();
    for (var k = 0; k < 3; k++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.00008 * (k % 2 ? 1 : -1) + k * 0.7);
      ctx.scale(1, 0.32 + k * 0.07);
      ctx.strokeStyle = k === 1 ? 'rgba(84,232,255,0.24)' : 'rgba(170,150,255,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r * (2.1 + k * 0.62), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    for (var s = 0; s < 5; s++) {
      var sa = t * 0.00022 * (s % 2 ? -1 : 1) + s * TAU / 5;
      var sr = r * (2.4 + (s % 3) * 0.44);
      var sx = cx + Math.cos(sa) * sr;
      var sy = cy + Math.sin(sa) * sr * 0.42;
      ctx.fillStyle = rgba(s % 2 ? [130, 215, 255] : [200, 175, 255], 0.35 + pulse * 0.35);
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.8, r * 0.035) * (0.8 + pulse * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    var body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
    body.addColorStop(0, 'rgba(255,255,255,0.98)');
    body.addColorStop(0.16, 'rgba(160,230,255,0.9)');
    body.addColorStop(0.48, 'rgba(110,80,240,0.85)');
    body.addColorStop(1, 'rgba(8,8,28,0.95)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,220,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 0.5, 0, TAU);
    ctx.stroke();
    ctx.font = '800 ' + Math.round(r * 0.72) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText('O/', cx, cy + 1);
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
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy);
    for (var i = 0; i < 52; i++) {
      var angle = i / 52 * TAU + t * 0.0002;
      var inner = M * 0.08;
      var length = strength * M * 0.9 * (0.5 + (i % 5) / 8);
      ctx.strokeStyle = 'rgba(190,215,255,' + (strength * 0.3) + ')';
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
    discoveryProgress.hidden = count === 0;
    discoveryProgress.textContent = 'DESCUBRIMIENTOS ' + count + ' / ' + secrets.length;
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

  function revealSecret(secret) {
    if (!secret || secret.found) return false;
    secret.found = true;
    secret.opacity = Math.max(secret.opacity, 0.75);
    discoveries[secret.id] = true;
    saveDiscoveries();
    updateDiscoveryProgress();
    if (secretNote) {
      secretNote.textContent = secret.note;
      secretNote.hidden = false;
      window.requestAnimationFrame(function () {
        secretNote.classList.add('is-visible');
      });
      window.setTimeout(function () {
        secretNote.classList.remove('is-visible');
        window.setTimeout(function () {
          secretNote.hidden = true;
        }, 500);
      }, 7200);
    }
    requestRender();
    return true;
  }

  function render() {
    var states = syncNodes();
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
    ctx.save();
    ctx.translate(pointer.x * 12, pointer.y * 8);
    drawCore();
    worlds.slice().sort(function (a, b) {
      return states[a.id].depth - states[b.id].depth;
    }).forEach(function (world) {
      var active = hovered === world.id || openId === world.id || document.activeElement === world.el;
      if (world.id === 'shop') drawShopPlanet(world, states[world.id], !!active);
      else drawPlanet(world, states[world.id], !!active);
    });
    drawEvents();
    ctx.restore();
    ctx.restore();
    drawDust();
    drawSecrets();
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
        warp = null;
        stage.classList.remove('is-warping');
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
    var trigger = target.closest('[data-dialog]');
    if (trigger) {
      event.preventDefault();
      openDialog(trigger.getAttribute('data-dialog'));
      return;
    }
    var warpLink = target.closest('[data-warp]');
    if (!warpLink || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    var href = warpLink.getAttribute('href') || '/shop';
    if (reduce || !ctx) {
      window.location.assign(href);
      return;
    }
    var state = worldState(byId.shop);
    warp = { x: state.x, y: state.y, start: performance.now(), href: href };
    warpProgress = 0;
    stage.classList.add('is-warping');
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-close]')) closeDialog(false);
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
    if (stage.releasePointerCapture) {
      try { stage.releasePointerCapture(event.pointerId); } catch (error) { return; }
    }
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && openId) {
      closeDialog(false);
      return;
    }
    if (event.target && event.target.closest && event.target.closest('input,textarea,select,[contenteditable]')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (reduce) {
      if (event.key === 'ArrowLeft') panBy(90, 0);
      else if (event.key === 'ArrowRight') panBy(-90, 0);
      else if (event.key === 'ArrowUp') panBy(0, 90);
      else if (event.key === 'ArrowDown') panBy(0, -90);
      else if (event.key === '+' || event.key === '=') zoomAt(W / 2, H / 2, 1.18);
      else if (event.key === '-' || event.key === '_') zoomAt(W / 2, H / 2, 0.85);
      else if (event.key === '0') resetView();
      else return;
      event.preventDefault();
      requestRender();
      return;
    }
    if (event.key === 'ArrowLeft') keys.left = true;
    else if (event.key === 'ArrowRight') keys.right = true;
    else if (event.key === 'ArrowUp') keys.up = true;
    else if (event.key === 'ArrowDown') keys.down = true;
    else if (event.key === '+' || event.key === '=') keys.zoomIn = true;
    else if (event.key === '-' || event.key === '_') keys.zoomOut = true;
    else if (event.key === '0') {
      resetView();
      requestRender();
      return;
    } else return;
    event.preventDefault();
  });

  document.addEventListener('keyup', function (event) {
    if (event.key === 'ArrowLeft') keys.left = false;
    else if (event.key === 'ArrowRight') keys.right = false;
    else if (event.key === 'ArrowUp') keys.up = false;
    else if (event.key === 'ArrowDown') keys.down = false;
    else if (event.key === '+' || event.key === '=') keys.zoomIn = false;
    else if (event.key === '-' || event.key === '_') keys.zoomOut = false;
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
    if (event.target.closest && event.target.closest('a,button,.galaxy-intro,.galaxy-index,.world-detail')) return;
    var point = localPoint(event);
    if (revealSecret(findSecretHit(point))) {
      event.preventDefault();
      return;
    }
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
    if (event.target.closest && event.target.closest('.galaxy-index,.galaxy-intro,.world-detail')) return;
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
    if (event.target.closest && event.target.closest('a,button,.galaxy-intro,.galaxy-index,.world-detail')) return;
    resetView();
    requestRender();
  });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start();
      else stop();
    }, { threshold: 0.02 });
    observer.observe(stage);
  }

  resize();
  start();
})();
