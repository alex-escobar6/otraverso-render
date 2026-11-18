(function () {
  'use strict';

  var stage = document.querySelector('.galaxy-stage');
  if (!stage) return;

  var canvas = stage.querySelector('.galaxy-canvas');
  var ui = stage.querySelector('.galaxy-ui');
  var nodes = Array.prototype.slice.call(stage.querySelectorAll('.world-node'));
  var indexItems = Array.prototype.slice.call(stage.querySelectorAll('[data-index]'));
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
    { id: 'shop', color: '#8b5cf6', accent: '#54e8ff', base: -0.42, orbit: 1.02, size: 0.076, speed: 0.13, parallax: 22, ring: true, moons: true },
    { id: 'whatif', color: '#ffb347', accent: '#ffd89b', base: -1.74, orbit: 0.96, size: 0.056, speed: 0.09, parallax: 15, ring: false, moons: false },
    { id: 'play', color: '#f472b6', accent: '#7dd3fc', base: 0.78, orbit: 0.92, size: 0.052, speed: 0.16, parallax: 18, ring: true, moons: false },
    { id: 'labs', color: '#60a5fa', accent: '#5eead4', base: 2.52, orbit: 0.9, size: 0.05, speed: 0.11, parallax: 14, ring: false, moons: false }
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
  var stars = [];
  var spiral = [];
  var dust = [];
  var nebula = null;
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var t = 0;
  var last = 0;
  var raf = 0;
  var running = false;
  var visible = true;
  var hovered = null;
  var openId = null;
  var lastTrigger = null;
  var warp = null;
  var warpProgress = 0;

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
    syncNodes();
    if (!running) render();
  }

  function worldState(world) {
    var angle = world.base + Math.sin(t * world.speed + world.seed) * 0.16 + (coarse ? 0 : pointer.x * 0.035);
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
      element.style.transform = 'translate3d(' + state.x.toFixed(1) + 'px,' + state.y.toFixed(1) + 'px,0) translate(-50%,-50%)';
      element.style.zIndex = String(10 + Math.round((state.depth + 1) * 8));
      element.style.setProperty('--node-r', Math.max(14, state.r).toFixed(1) + 'px');
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
    for (var i = 0; i < stars.length; i++) {
      var star = stars[i];
      var x = star.x + pointer.x * 16 * star.z;
      var y = star.y + pointer.y * 11 * star.z;
      if (x < -6 || x > W + 6 || y < -6 || y > H + 6) continue;
      var twinkle = 0.45 + 0.55 * Math.sin(t * 0.0012 * star.z + star.p);
      var size = star.s * star.z;
      ctx.fillStyle = rgba(star.c, 0.12 + twinkle * 0.52 * star.z);
      ctx.fillRect(x, y, size, size);
      if (star.s > 1.8) {
        ctx.strokeStyle = rgba(star.c, 0.16 + twinkle * 0.22);
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + 5, y);
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
        ctx.stroke();
      }
    }
  }

  function drawSpiral() {
    var rotation = t * 0.000035;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < spiral.length; i++) {
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

  function drawDust() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < dust.length; i++) {
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
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.save();
    if (warp) {
      var zoom = 1 + warpProgress * 3.6;
      ctx.translate(warp.x, warp.y);
      ctx.scale(zoom, zoom);
      ctx.translate(-warp.x, -warp.y);
    }
    drawBackground();
    drawStars();
    drawSpiral();
    drawCore();
    worlds.slice().sort(function (a, b) {
      return states[a.id].depth - states[b.id].depth;
    }).forEach(function (world) {
      var active = hovered === world.id || openId === world.id || document.activeElement === world.el;
      drawPlanet(world, states[world.id], !!active);
    });
    drawDust();
    ctx.restore();
    if (warp) drawStreaks();
    if (ui && !coarse) {
      ui.style.setProperty('--ui-x', (-pointer.x * 12).toFixed(1) + 'px');
      ui.style.setProperty('--ui-y', (-pointer.y * 8).toFixed(1) + 'px');
    }
  }

  function frame(now) {
    if (!running) return;
    var delta = last ? Math.min(48, now - last) : 16;
    last = now;
    t += delta;
    pointer.x += (pointer.tx - pointer.x) * 0.055;
    pointer.y += (pointer.ty - pointer.y) * 0.055;
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

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && openId) closeDialog(false);
  });

  window.addEventListener('pointermove', function (event) {
    if (coarse) return;
    pointer.tx = Math.max(-1, Math.min(1, event.clientX / W * 2 - 1));
    pointer.ty = Math.max(-1, Math.min(1, event.clientY / H * 2 - 1));
  }, { passive: true });
  stage.addEventListener('pointerleave', function () {
    pointer.tx = 0;
    pointer.ty = 0;
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
