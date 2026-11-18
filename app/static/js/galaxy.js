(function () {
  'use strict';

  var stage = document.querySelector('.galaxy-stage');
  if (!stage) return;

  var canvas = stage.querySelector('.galaxy-canvas');
  var ui = stage.querySelector('.galaxy-ui');
  var objectLayer = stage.querySelector('.galaxy-objects');
  var hintEl = stage.querySelector('[data-control-hint]');
  var progressEl = stage.querySelector('[data-discovery-progress]');
  var liveEl = stage.querySelector('[data-discovery-live]');
  var nodes = Array.prototype.slice.call(stage.querySelectorAll('.world-node'));
  var indexItems = Array.prototype.slice.call(stage.querySelectorAll('[data-index]'));
  var dialogs = {};
  Array.prototype.forEach.call(document.querySelectorAll('.world-detail[data-dialog]'), function (dialog) {
    dialogs[dialog.getAttribute('data-dialog')] = dialog;
  });

  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var coarseQuery = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  var reduce = reduceQuery ? reduceQuery.matches : false;
  var coarse = coarseQuery ? coarseQuery.matches : false;
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
    { id: 'shop', color: '#8b5cf6', accent: '#54e8ff', base: -0.42, orbit: 1.02, size: 0.076, speed: 0.000055, parallax: 22, ring: true, moons: true },
    { id: 'whatif', color: '#ffb347', accent: '#ffd89b', base: -1.74, orbit: 0.96, size: 0.056, speed: 0.00004, parallax: 15, ring: false, moons: false },
    { id: 'play', color: '#f472b6', accent: '#7dd3fc', base: 0.78, orbit: 0.92, size: 0.052, speed: 0.00007, parallax: 18, ring: true, moons: false },
    { id: 'labs', color: '#60a5fa', accent: '#5eead4', base: 2.52, orbit: 0.9, size: 0.05, speed: 0.00005, parallax: 14, ring: false, moons: false }
  ];
  var objects = [
    { id: 'beacon', label: 'Baliza comercial SHOP', color: '#54e8ff', base: -0.22, orbit: 1.22, size: 0.014, speed: 0.00009 },
    { id: 'fragment', label: 'Fragmento WHAT IF', color: '#ffd89b', base: -2.3, orbit: 1.14, size: 0.013, speed: 0.00007 },
    { id: 'capsule', label: 'Cápsula PLAY', color: '#7dd3fc', base: 0.46, orbit: 1.2, size: 0.013, speed: 0.00011 },
    { id: 'relic', label: 'Relicario LABS', color: '#5eead4', base: 2.78, orbit: 1.16, size: 0.012, speed: 0.00008 }
  ];

  var foundColor = hexRgb('#9cffc4');
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
  var byObject = {};
  var indexById = {};
  worlds.forEach(function (world, i) {
    world.rgb = hexRgb(world.color);
    world.argb = hexRgb(world.accent);
    world.seed = i * 1.7 + 0.6;
    world.el = stage.querySelector('.world-node[data-world="' + world.id + '"]');
    byId[world.id] = world;
    indexById[world.id] = stage.querySelector('[data-index="' + world.id + '"]');
  });
  objects.forEach(function (object, i) {
    object.rgb = hexRgb(object.color);
    object.seed = i * 2.1 + 1.3;
    byObject[object.id] = object;
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
  var stars = [];
  var spiral = [];
  var dust = [];
  var nebula = null;
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
  var camera = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1, vx: 0, vy: 0, dragging: false, pointerId: null, lastX: 0, lastY: 0 };
  var activePointers = {};
  var pinch = null;
  var focusId = null;
  var cameraKeys = {};
  var quality = lowPower ? 0.65 : 1;
  var qualityTime = 0;
  var qualityFrames = 0;
  var storageKey = 'otraverso.discoveries.v1';
  var discovered = {};
  var discoveryFlash = {};
  var achievementAnnounced = false;
  var hoveredObject = null;

  function hexRgb(value) {
    var hex = String(value || '#ffffff').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var number = parseInt(hex, 16);
    if (isNaN(number)) return [255, 255, 255];
    return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loadDiscoveries() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(storageKey) : null;
      var list = raw ? JSON.parse(raw) : [];
      if (list && list.forEach) list.forEach(function (id) { discovered[id] = true; });
    } catch (error) {
      discovered = {};
    }
  }

  function saveDiscoveries() {
    try {
      if (window.localStorage) window.localStorage.setItem(storageKey, JSON.stringify(Object.keys(discovered)));
    } catch (error) {
      return;
    }
  }

  function foundCount() {
    return objects.filter(function (object) { return !!discovered[object.id]; }).length;
  }

  function announce(message) {
    if (!liveEl) return;
    liveEl.textContent = '';
    window.setTimeout(function () { liveEl.textContent = message; }, 40);
  }

  function updateDiscoveryUi() {
    objects.forEach(function (object) {
      if (!object.el) return;
      object.el.setAttribute('data-found', discovered[object.id] ? 'true' : 'false');
      object.el.setAttribute('aria-label', object.label + (discovered[object.id] ? ' · encontrado' : ' · sin encontrar'));
    });
    if (progressEl) progressEl.textContent = foundCount() + '/' + objects.length + ' hallazgos';
    if (foundCount() === objects.length && !achievementAnnounced) {
      achievementAnnounced = true;
      announce('Logro desbloqueado: Cartógrafo multiversal.');
    }
  }

  function discover(id) {
    var object = byObject[id];
    if (!object) return;
    if (!discovered[id]) {
      discovered[id] = true;
      discoveryFlash[id] = t;
      saveDiscoveries();
      announce('Hallazgo registrado: ' + object.label + '.');
    } else {
      announce(object.label + ' ya había sido encontrado.');
    }
    updateDiscoveryUi();
    if (!running) render();
  }

  function initObjects() {
    if (!objectLayer) return;
    objects.forEach(function (object) {
      var button = document.createElement('button');
      var mark = document.createElement('span');
      var label = document.createElement('span');
      button.type = 'button';
      button.className = 'explore-object';
      button.setAttribute('data-object', object.id);
      button.setAttribute('aria-label', object.label);
      button.style.setProperty('--object-color', object.color);
      mark.className = 'explore-object__mark';
      mark.setAttribute('aria-hidden', 'true');
      label.className = 'explore-object__label';
      label.textContent = object.label;
      label.setAttribute('aria-hidden', 'true');
      button.appendChild(mark);
      button.appendChild(label);
      objectLayer.appendChild(button);
      object.el = button;
      button.addEventListener('pointerenter', function () { hoveredObject = object.id; if (!running) render(); });
      button.addEventListener('pointerleave', function () { hoveredObject = null; if (!running) render(); });
      button.addEventListener('focus', function () { hoveredObject = object.id; if (!running) render(); });
      button.addEventListener('blur', function () { hoveredObject = null; if (!running) render(); });
      button.addEventListener('click', function () { discover(object.id); });
    });
    achievementAnnounced = foundCount() === objects.length;
    updateDiscoveryUi();
  }

  function clampCamera() {
    camera.tz = clamp(camera.tz, 0.72, 1.75);
    var maxX = M * (0.34 + camera.tz * 0.1);
    var maxY = H * (0.24 + camera.tz * 0.07);
    camera.tx = clamp(camera.tx, -maxX, maxX);
    camera.ty = clamp(camera.ty, -maxY, maxY);
    camera.x = clamp(camera.x, -maxX, maxX);
    camera.y = clamp(camera.y, -maxY, maxY);
  }

  function zoomAt(nextZoom, localX, localY) {
    var originX = localX == null ? cx : localX;
    var originY = localY == null ? cy : localY;
    var previous = camera.tz;
    var ratio = nextZoom / previous;
    camera.tx = originX - cx - (originX - cx - camera.tx) * ratio;
    camera.ty = originY - cy - (originY - cy - camera.ty) * ratio;
    camera.tz = nextZoom;
    camera.vx = 0;
    camera.vy = 0;
    clampCamera();
    if (!running) render();
  }

  function resetCamera() {
    focusId = null;
    camera.tx = 0;
    camera.ty = 0;
    camera.tz = 1;
    camera.vx = 0;
    camera.vy = 0;
    clampCamera();
    if (!running) render();
  }

  function focusWorld(id) {
    focusId = id || null;
    if (!focusId) {
      camera.tx = 0;
      camera.ty = 0;
      camera.tz = 1;
    } else {
      var world = byId[focusId];
      if (!world) return;
      var state = worldState(world);
      var zoom = mobile ? 1.04 : 1.09;
      camera.tz = zoom;
      camera.tx = -(state.x - cx) * zoom;
      camera.ty = -(state.y - cy) * zoom;
    }
    camera.vx = 0;
    camera.vy = 0;
    clampCamera();
    if (!running) render();
  }

  function applyCamera() {
    ctx.translate(cx + camera.x, cy + camera.y);
    ctx.scale(camera.z, camera.z);
    ctx.translate(-cx, -cy);
  }

  function syncCamera() {
    if (ui) {
      ui.style.setProperty('--cam-x', camera.x.toFixed(1) + 'px');
      ui.style.setProperty('--cam-y', camera.y.toFixed(1) + 'px');
      ui.style.setProperty('--cam-z', camera.z.toFixed(3));
    }
    if (hintEl) hintEl.textContent = coarse ? 'Arrastra · Pulsa · Selecciona' : 'Arrastra · Rueda · Selecciona';
  }

  function updateCamera(rawDelta) {
    var step = rawDelta / 16.67;
    if (!camera.dragging) {
      camera.tx += camera.vx * step;
      camera.ty += camera.vy * step;
      var inertia = Math.pow(0.9, step);
      camera.vx *= inertia;
      camera.vy *= inertia;
      if (Math.abs(camera.vx) < 0.02) camera.vx = 0;
      if (Math.abs(camera.vy) < 0.02) camera.vy = 0;
      if (cameraKeys.left) camera.tx -= 6 * step;
      if (cameraKeys.right) camera.tx += 6 * step;
      if (cameraKeys.up) camera.ty -= 6 * step;
      if (cameraKeys.down) camera.ty += 6 * step;
      if (cameraKeys.zoomIn) zoomAt(camera.tz + 0.04 * step, cx, cy);
      if (cameraKeys.zoomOut) zoomAt(camera.tz - 0.04 * step, cx, cy);
    }
    clampCamera();
    var ease = 1 - Math.pow(0.86, step);
    camera.x += (camera.tx - camera.x) * ease;
    camera.y += (camera.ty - camera.y) * ease;
    camera.z += (camera.tz - camera.z) * ease;
  }

  function monitorQuality(rawDelta) {
    qualityTime += rawDelta;
    qualityFrames += 1;
    if (qualityTime < 2200) return;
    var average = qualityTime / qualityFrames;
    qualityTime = 0;
    qualityFrames = 0;
    if (average > 24 && quality > 0.6) quality = Math.max(0.6, quality - 0.15);
    else if (average < 18 && quality < 1 && !lowPower) quality = Math.min(1, quality + 0.1);
  }

  function buildScene() {
    var area = W * H;
    stars = [];
    var starCount = lowPower ? 70 : mobile ? 110 : Math.min(270, Math.round(area / 5200));
    for (var i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: 0.25 + Math.random() * 0.9,
        s: Math.random() < 0.07 ? 1.8 + Math.random() * 0.8 : 0.5 + Math.random() * 1,
        p: Math.random() * TAU,
        c: Math.random() < 0.22 ? hexRgb('#9bdcff') : Math.random() < 0.2 ? hexRgb('#d4b5ff') : [235, 240, 255]
      });
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
    buildScene();
    clampCamera();
    syncNodes();
    syncObjects();
    syncCamera();
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
      scale: scale
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
      element.style.transform = 'translate3d(' + state.x.toFixed(2) + 'px,' + state.y.toFixed(2) + 'px,0) translate(-50%,-50%)';
      element.style.zIndex = String(10 + Math.round((state.depth + 1) * 8));
      element.style.setProperty('--node-r', Math.max(14, state.r).toFixed(1) + 'px');
      element.classList.toggle('is-active', !!active);
      if (indexById[world.id]) indexById[world.id].classList.toggle('is-active', !!active);
    });
    return states;
  }

  function objectState(object) {
    var angle = object.base + Math.sin(orbitalTime * object.speed + object.seed) * 0.06 + (coarse ? 0 : pointer.x * 0.02);
    var depth = Math.sin(angle);
    var scale = 0.85 + 0.15 * (depth + 1) / 2;
    return {
      x: cx + Math.cos(angle) * rx * object.orbit + (coarse ? 0 : pointer.x * (object.parallax || 12) * 0.45),
      y: cy + Math.sin(angle) * ry * object.orbit + (coarse ? 0 : pointer.y * (object.parallax || 12) * 0.25),
      r: Math.max(6, M * object.size * scale * (mobile ? 1.15 : 1)),
      depth: depth,
      angle: angle,
      scale: scale
    };
  }

  function syncObjects() {
    var states = {};
    objects.forEach(function (object) {
      var state = objectState(object);
      states[object.id] = state;
      if (!object.el) return;
      object.el.style.transform = 'translate3d(' + state.x.toFixed(2) + 'px,' + state.y.toFixed(2) + 'px,0) translate(-50%,-50%)';
      object.el.style.zIndex = String(22 + Math.round((state.depth + 1) * 6));
      var screenX = cx + (state.x - cx) * camera.z + camera.x;
      object.el.setAttribute('data-side', screenX > cx + W * 0.18 ? 'left' : 'right');
      object.el.classList.toggle('is-active', hoveredObject === object.id);
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
    if (!nebula) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.9;
    var dx = Math.sin(t * 0.00005) * 12 + pointer.x * 8;
    var dy = Math.cos(t * 0.00004) * 9 + pointer.y * 6;
    ctx.drawImage(nebula, dx - 10, dy - 10, W + 20, H + 20);
    ctx.restore();
  }

  function drawStars() {
    var limit = Math.max(1, Math.round(stars.length * quality));
    for (var i = 0; i < limit; i++) {
      var star = stars[i];
      var x = star.x + pointer.x * 16 * star.z;
      var y = star.y + pointer.y * 11 * star.z;
      if (x < -6 || x > W + 6 || y < -6 || y > H + 6) continue;
      var twinkle = 0.45 + 0.55 * Math.sin(t * 0.0012 * star.z + star.p);
      var burst = star.z > 0.86 ? Math.pow(Math.max(0, Math.sin(t * 0.00031 + star.p * 2.7)), 14) * (star.z - 0.86) * 6.5 : 0;
      var size = star.s * star.z;
      if (burst > 0.03) {
        ctx.fillStyle = rgba(star.c, burst * 0.13);
        ctx.beginPath();
        ctx.arc(x, y, size * 3.4, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = rgba(star.c, Math.min(0.95, 0.12 + twinkle * 0.52 * star.z + burst * 0.5));
      ctx.fillRect(x, y, size, size);
      if (star.s > 1.8 || burst > 0.24) {
        ctx.strokeStyle = rgba(star.c, Math.min(0.7, 0.16 + twinkle * 0.22 + burst * 0.4));
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x - 5 - burst * 3, y);
        ctx.lineTo(x + 5 + burst * 3, y);
        ctx.moveTo(x, y - 5 - burst * 3);
        ctx.lineTo(x, y + 5 + burst * 3);
        ctx.stroke();
      }
    }
  }

  function drawSpiral() {
    var rotation = t * 0.000035;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var limit = Math.max(1, Math.round(spiral.length * quality));
    for (var i = 0; i < limit; i++) {
      var particle = spiral[i];
      var angle = particle.a + rotation;
      var x = cx + Math.cos(angle) * particle.r + pointer.x * 5;
      var y = cy + Math.sin(angle) * particle.r * 0.33 + pointer.y * 3;
      var alpha = particle.alpha * (0.62 + 0.38 * Math.sin(t * 0.001 + particle.p));
      ctx.fillStyle = rgba(particle.c, alpha);
      ctx.fillRect(x, y, particle.s, particle.s);
    }
    ctx.restore();
  }

  function drawCore() {
    var r = M * (mobile ? 0.044 : 0.05);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 6);
    halo.addColorStop(0, 'rgba(160,150,255,0.3)');
    halo.addColorStop(0.35, 'rgba(90,90,220,0.12)');
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
      var offset = (i - 2) * r * 0.34 + Math.sin(t * 0.0003 + i + world.seed) * r * 0.05;
      ctx.fillStyle = i % 2 ? rgba(world.argb, 0.55) : 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(t * 0.0002 + i) * r * 0.08, y + offset, r * 1.15, r * (0.08 + i * 0.012), -0.18, 0, TAU);
      ctx.fill();
    }

    ctx.globalAlpha = 0.5;
    for (var j = 0; j < 7; j++) {
      var px = x + Math.cos(world.seed + j * 2.1 + t * 0.0002) * r * 0.72;
      var py = y + Math.sin(world.seed * 1.7 + j * 1.3 + t * 0.00015) * r * 0.72;
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
        var ma = t * 0.0004 * (m ? -0.7 : 1) + m * 2.4;
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

  function drawShopRing(x, y, r, angle, front, highlighted) {
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
    ctx.lineDashOffset = -t * 0.012 * (front ? 1 : -1);
    ctx.strokeStyle = rgba(shopPalette.cyan, front ? (highlighted ? 0.34 : 0.2) : 0.08);
    ctx.lineWidth = Math.max(0.7, r * 0.011);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.72, start, end);
    ctx.stroke();
    ctx.setLineDash([]);
    var phase = t * 0.00014;
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

    drawShopRing(x, y, r, state.angle, false, highlighted);

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

    var drift = Math.sin(t * 0.00016) * r * 0.025;
    ctx.globalCompositeOperation = 'lighter';
    var sweep = Math.sin(t * 0.00026) * r * 0.6;
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
      var ly = y + land.y * r + Math.cos(t * 0.00013 + i) * r * 0.012;
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

    var lightLimit = Math.max(6, Math.round(24 * quality));
    for (var l = 0; l < lightLimit; l++) {
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

    var flashLimit = Math.max(2, Math.round(5 * quality));
    for (var f = 0; f < flashLimit; f++) {
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
      var py = y + item.y * r + Math.sin(t * 0.00022 + q) * r * 0.01;
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

    drawShopRing(x, y, r, state.angle, true, highlighted);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var m = 0; m < 3; m++) {
      var ma = t * 0.00011 * (m === 1 ? -0.78 : 1) + m * 2.2;
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
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var limit = Math.max(1, Math.round(dust.length * quality));
    for (var i = 0; i < limit; i++) {
      var particle = dust[i];
      var distance = Math.sqrt(Math.pow(particle.x - cx, 2) + Math.pow(particle.y - cy, 2));
      var influence = Math.max(0, 1 - distance / 320);
      var x = particle.x + pointer.x * 30 * influence + Math.sin(t * 0.0004 + particle.p) * 5;
      var y = particle.y + pointer.y * 24 * influence + Math.cos(t * 0.00035 + particle.p) * 5;
      ctx.fillStyle = rgba(particle.c, 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.001 + particle.p)));
      ctx.fillRect(x, y, particle.s, particle.s);
    }
    ctx.restore();
  }

  function drawExploreObject(object, state) {
    var active = hoveredObject === object.id;
    var found = !!discovered[object.id];
    var flash = Math.max(0, 1 - (t - (discoveryFlash[object.id] || -9999)) / 900);
    var x = state.x;
    var y = state.y;
    var r = state.r * (active ? 1.2 : 1) + flash * 7;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
    glow.addColorStop(0, rgba(found ? foundColor : object.rgb, active || flash ? 0.42 : 0.24));
    glow.addColorStop(0.5, rgba(object.rgb, 0.12));
    glow.addColorStop(1, rgba(object.rgb, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.6, 0, TAU);
    ctx.fill();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4 + Math.sin(t * 0.0004 + object.seed) * 0.08);
    ctx.strokeStyle = rgba(found ? foundColor : object.rgb, active || flash ? 0.95 : 0.6);
    ctx.lineWidth = active || flash ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.stroke();
    if (found || flash) {
      ctx.fillStyle = rgba(foundColor, 0.6 + flash * 0.4);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.2, r * 0.24), 0, TAU);
      ctx.fill();
    }
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

  function render() {
    var states = syncNodes();
    var objectStates = syncObjects();
    if (ui && !coarse) {
      ui.style.setProperty('--ui-x', (-pointer.x * 12).toFixed(1) + 'px');
      ui.style.setProperty('--ui-y', (-pointer.y * 8).toFixed(1) + 'px');
    }
    syncCamera();
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.save();
    drawBackground();
    ctx.save();
    applyCamera();
    if (warp) {
      var zoom = 1 + warpProgress * 3.6;
      ctx.translate(warp.x, warp.y);
      ctx.scale(zoom, zoom);
      ctx.translate(-warp.x, -warp.y);
    }
    drawStars();
    drawSpiral();
    drawCore();
    worlds.slice().sort(function (a, b) {
      return states[a.id].depth - states[b.id].depth;
    }).forEach(function (world) {
      var active = hovered === world.id || openId === world.id || document.activeElement === world.el;
      if (world.id === 'shop') drawShopPlanet(world, states[world.id], !!active);
      else drawPlanet(world, states[world.id], !!active);
    });
    objects.forEach(function (object) {
      drawExploreObject(object, objectStates[object.id]);
    });
    drawDust();
    ctx.restore();
    if (warp) drawStreaks();
    ctx.restore();
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
    if (!warp) updateCamera(rawDelta);
    monitorQuality(rawDelta);
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

  function setDialogTriggers(id, open) {
    var triggers = document.querySelectorAll('.world-node[data-dialog="' + id + '"],.galaxy-index__item[data-dialog="' + id + '"]');
    Array.prototype.forEach.call(triggers, function (trigger) {
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function openDialog(id) {
    var dialog = dialogs[id];
    if (!dialog) return;
    if (openId) closeDialog(true);
    openId = id;
    lastTrigger = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('modal-open');
    setDialogTriggers(id, true);
    focusWorld(id);
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
    setDialogTriggers(closing, false);
    focusWorld(null);
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
    if (target.closest('[data-close]')) return;
    var cameraControl = target.closest('[data-camera]');
    if (cameraControl) {
      event.preventDefault();
      var action = cameraControl.getAttribute('data-camera');
      if (action === 'reset') resetCamera();
      else if (action === 'in') zoomAt(camera.tz + 0.18, cx, cy);
      else if (action === 'out') zoomAt(camera.tz - 0.18, cx, cy);
      return;
    }
    var trigger = target.closest('.world-node[data-dialog],.galaxy-index__item[data-dialog]');
    if (trigger) {
      event.preventDefault();
      openDialog(trigger.getAttribute('data-dialog'));
      return;
    }
    if (target.closest('.world-detail')) return;
    var warpLink = target.closest('[data-warp]');
    if (!warpLink || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    var href = warpLink.getAttribute('href') || '/shop';
    if (reduce || !ctx) {
      window.location.assign(href);
      return;
    }
    var origin = warpLink.closest('[data-world],[data-index]');
    var originId = origin ? (origin.getAttribute('data-world') || origin.getAttribute('data-index')) : 'shop';
    var state = worldState(byId[originId] || byId.shop);
    warp = { x: state.x, y: state.y, start: performance.now(), href: href };
    warpProgress = 0;
    stage.classList.add('is-warping');
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-close]')) closeDialog(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && openId) {
      closeDialog(false);
      return;
    }
    if (openId) {
      if (event.key !== 'Tab') return;
      var dialog = dialogs[openId];
      if (!dialog) return;
      var focusables = Array.prototype.slice.call(dialog.querySelectorAll('button,a[href],[tabindex]:not([tabindex="-1"])'));
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target && event.target.closest && event.target.closest('input,textarea,select,[contenteditable],a,button')) return;
    var key = event.key;
    var mapped = null;
    if (key === 'ArrowLeft') mapped = 'left';
    else if (key === 'ArrowRight') mapped = 'right';
    else if (key === 'ArrowUp') mapped = 'up';
    else if (key === 'ArrowDown') mapped = 'down';
    else if (key === '+' || key === '=') mapped = 'zoomIn';
    else if (key === '-' || key === '_') mapped = 'zoomOut';
    else if (key === '0') {
      event.preventDefault();
      resetCamera();
      return;
    }
    if (mapped) {
      event.preventDefault();
      cameraKeys[mapped] = true;
    }
  });

  document.addEventListener('keyup', function (event) {
    if (event.key === 'ArrowLeft') cameraKeys.left = false;
    else if (event.key === 'ArrowRight') cameraKeys.right = false;
    else if (event.key === 'ArrowUp') cameraKeys.up = false;
    else if (event.key === 'ArrowDown') cameraKeys.down = false;
    else if (event.key === '+' || event.key === '=') cameraKeys.zoomIn = false;
    else if (event.key === '-' || event.key === '_') cameraKeys.zoomOut = false;
  });

  window.addEventListener('blur', function () {
    cameraKeys = {};
  });

  function localPoint(event) {
    var rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pointerIds() {
    return Object.keys(activePointers);
  }

  function pinchDistance() {
    var ids = pointerIds();
    if (ids.length < 2) return 0;
    var a = activePointers[ids[0]];
    var b = activePointers[ids[1]];
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }

  function startPinch() {
    var distance = pinchDistance();
    if (!distance) return;
    pinch = { distance: distance, zoom: camera.tz };
    camera.dragging = false;
    stage.classList.remove('is-dragging');
  }

  function endPointer(event) {
    delete activePointers[event.pointerId];
    if (pointerIds().length < 2) pinch = null;
    if (camera.pointerId === event.pointerId) {
      camera.dragging = false;
      camera.pointerId = null;
      stage.classList.remove('is-dragging');
    }
    if (stage.releasePointerCapture) {
      try { stage.releasePointerCapture(event.pointerId); } catch (error) { return; }
    }
  }

  stage.addEventListener('pointerdown', function (event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (event.target.closest && event.target.closest('a,button,.galaxy-intro,.galaxy-index,.galaxy-controls,.world-detail')) return;
    var point = localPoint(event);
    activePointers[event.pointerId] = point;
    if (stage.setPointerCapture) {
      try { stage.setPointerCapture(event.pointerId); } catch (error) { return; }
    }
    if (pointerIds().length === 2) {
      startPinch();
      return;
    }
    if (pointerIds().length > 1) return;
    camera.dragging = true;
    camera.pointerId = event.pointerId;
    camera.lastX = point.x;
    camera.lastY = point.y;
    camera.vx = 0;
    camera.vy = 0;
    focusId = null;
    stage.classList.add('is-dragging');
    setHover(null);
    hoveredObject = null;
  });

  window.addEventListener('pointermove', function (event) {
    var point = localPoint(event);
    if (activePointers[event.pointerId]) activePointers[event.pointerId] = point;
    if (pinch && pointerIds().length >= 2) {
      event.preventDefault();
      var distance = pinchDistance();
      if (distance && pinch.distance) zoomAt(pinch.zoom * distance / pinch.distance, (activePointers[pointerIds()[0]].x + activePointers[pointerIds()[1]].x) / 2, (activePointers[pointerIds()[0]].y + activePointers[pointerIds()[1]].y) / 2);
      return;
    }
    if (camera.dragging && camera.pointerId === event.pointerId) {
      var dx = point.x - camera.lastX;
      var dy = point.y - camera.lastY;
      if (coarse && Math.abs(dy) > Math.abs(dx) * 1.25) return;
      event.preventDefault();
      camera.lastX = point.x;
      camera.lastY = point.y;
      camera.tx += dx;
      camera.ty += dy;
      camera.vx = dx * 0.65 + camera.vx * 0.35;
      camera.vy = dy * 0.65 + camera.vy * 0.35;
      clampCamera();
      return;
    }
    if (coarse) return;
    pointer.tx = clamp(point.x / W * 2 - 1, -1, 1);
    pointer.ty = clamp(point.y / H * 2 - 1, -1, 1);
  }, { passive: false });

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('pointerleave', function () {
    if (!camera.dragging) {
      pointer.tx = 0;
      pointer.ty = 0;
    }
  });

  stage.addEventListener('wheel', function (event) {
    if (event.target.closest && event.target.closest('.galaxy-index,.galaxy-controls,.world-detail')) return;
    event.preventDefault();
    var point = localPoint(event);
    var factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.04 : 0.0015));
    zoomAt(camera.tz * factor, point.x, point.y);
  }, { passive: false });

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

  function handleMotionPreference() {
    reduce = reduceQuery ? reduceQuery.matches : false;
    coarse = coarseQuery ? coarseQuery.matches : false;
    if (coarse) {
      pointer.tx = 0;
      pointer.ty = 0;
    }
    if (reduce) {
      stop();
      render();
    } else {
      start();
    }
    syncCamera();
  }

  function watchMedia(query, handler) {
    if (!query) return;
    if (query.addEventListener) query.addEventListener('change', handler);
    else if (query.addListener) query.addListener(handler);
  }

  watchMedia(reduceQuery, handleMotionPreference);
  watchMedia(coarseQuery, handleMotionPreference);
  loadDiscoveries();
  initObjects();
  resize();
  start();
})();
