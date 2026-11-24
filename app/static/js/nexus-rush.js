(function (global) {
  'use strict';

  var O = global.OTRAVERSO;
  if (!O) return;

  var PLAY = O.PLAY || null;
  var doc = global.document;
  var CIRCUITS = [
    { name: 'NEXUS I · ARRANQUE', css: '#67e8f9', shade: '#22d3ee', limit: 95, speed: 250, length: 5200, obstacles: 7, pickups: 12, seed: 1.2, curve: 22 },
    { name: 'NEXUS II · VÉRTICE', css: '#f472b6', shade: '#ec4899', limit: 88, speed: 268, length: 5600, obstacles: 11, pickups: 14, seed: 3.7, curve: 34 },
    { name: 'NEXUS III · COLAPSO', css: '#a78bfa', shade: '#8b5cf6', limit: 82, speed: 286, length: 6000, obstacles: 15, pickups: 16, seed: 5.4, curve: 46 }
  ];
  var LANES = [-0.62, 0, 0.62];
  var VIEW = 2100;
  var SEGMENT = 28;
  var root = null;
  var canvas = null;
  var ctx = null;
  var running = false;
  var paused = false;
  var frame = 0;
  var state = null;
  var circuit = null;
  var keys = {};
  var touch = {};
  var stars = [];
  var skyline = [];
  var hudCache = {};
  var audioContext = null;
  var bound = false;
  var lastHud = 0;
  var host = null;
  var listeners = [];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push([target, type, handler, options]);
  }

  function offAll() {
    listeners.forEach(function (entry) {
      entry[0].removeEventListener(entry[1], entry[2], entry[3]);
    });
    listeners = [];
    bound = false;
  }

  function rand(seed) {
    var value = seed;
    return function () {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    };
  }

  function hud(selector, value) {
    var node = root.querySelector(selector);
    if (!node) return;
    var text = String(value);
    if (hudCache[selector] !== text) {
      node.textContent = text;
      hudCache[selector] = text;
    }
  }

  function unlockAudio() {
    if (audioContext) {
      if (audioContext.state === 'suspended') audioContext.resume();
      return;
    }
    var Context = global.AudioContext || global.webkitAudioContext;
    if (!Context) return;
    try { audioContext = new Context(); } catch (error) { audioContext = null; }
  }

  function tone(frequency, duration, type, volume) {
    if (!audioContext) return;
    var now = audioContext.currentTime;
    var oscillator = audioContext.createOscillator();
    var gain = audioContext.createGain();
    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume || 0.09, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.04);
  }

  function buildScenery(index) {
    var random = rand(index * 97 + 31);
    stars = [];
    skyline = [];
    for (var i = 0; i < 54; i += 1) {
      stars.push({ x: random(), y: random() * 0.55, a: 0.25 + random() * 0.55, r: random() > 0.8 ? 1.6 : 1 });
    }
    var x = 0;
    while (x < 120) {
      var width = 3 + random() * 7;
      skyline.push({ x: x, w: width, h: 10 + random() * 42, side: random() > 0.5 ? 1 : -1 });
      x += width + random() * 3;
    }
  }

  function entitiesFor(index) {
    var random = rand(index * 211 + 17);
    var list = [];
    var config = CIRCUITS[index];
    var i;
    for (i = 0; i < config.obstacles; i += 1) {
      list.push({
        type: 'obstacle',
        z: 520 + i * ((config.length - 760) / config.obstacles) + random() * 140,
        lane: Math.floor(random() * LANES.length),
        done: false
      });
    }
    for (i = 0; i < config.pickups; i += 1) {
      list.push({
        type: 'pickup',
        z: 340 + i * ((config.length - 560) / config.pickups) + random() * 90,
        lane: Math.floor(random() * LANES.length),
        done: false
      });
    }
    return list.sort(function (a, b) { return a.z - b.z; });
  }

  function ensureCanvas() {
    canvas = root.querySelector('[data-game-canvas]');
    if (!canvas) {
      canvas = doc.createElement('canvas');
      canvas.className = 'universe-game-canvas';
      canvas.setAttribute('data-game-canvas', '');
      canvas.setAttribute('data-play-runtime', 'nexus-rush');
      canvas.setAttribute('aria-hidden', 'true');
      root.querySelector('.universe-game-ui').appendChild(canvas);
    }
    ctx = canvas.getContext('2d', { alpha: false });
    resize();
  }

  function resize() {
    if (!canvas || !ctx) return;
    var rect = root.getBoundingClientRect();
    var ratio = Math.min(global.devicePixelRatio || 1, 1.5);
    var width = Math.max(320, Math.round(rect.width));
    var height = Math.max(360, Math.round(rect.height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function curveAt(z) {
    var phase = z / 520 + circuit.seed;
    return (Math.sin(phase) + Math.sin(phase * 0.43) * 0.6) * circuit.curve;
  }

  function project(relativeZ, lane, width, height, horizon) {
    var depth = clamp(relativeZ / VIEW, 0, 1);
    var perspective = 1 - depth;
    var scale = perspective * perspective;
    var center = width / 2 + curveAt(relativeZ) * scale - lane * 150 * scale;
    var y = horizon + scale * (height - horizon) * 0.92;
    return { x: center, y: y, scale: scale, half: 26 + scale * width * 0.44 };
  }

  function drawBackground(width, height, horizon) {
    var gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#050412');
    gradient.addColorStop(0.46, circuit.shade);
    gradient.addColorStop(0.48, '#090720');
    gradient.addColorStop(1, '#05040d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#dff9ff';
    stars.forEach(function (star) {
      ctx.globalAlpha = star.a;
      ctx.fillRect(star.x * width, star.y * height, star.r, star.r);
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(9,7,28,0.94)';
    skyline.forEach(function (tower) {
      var shift = (state.distance * 0.012 * tower.side) % 130;
      var x = ((tower.x + shift + 130) % 130) / 120 * width - tower.w;
      var h = tower.h / 52 * (horizon - height * 0.08);
      ctx.fillRect(x, horizon - h, tower.w / 120 * width, h);
    });

    ctx.fillStyle = circuit.css;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, horizon - 2, width, 2);
    ctx.globalAlpha = 1;
  }

  function drawRoad(width, height, horizon) {
    var segments = Math.ceil(VIEW / SEGMENT);
    var lane = state.lane * 0.55;
    for (var i = segments - 1; i >= 0; i -= 1) {
      var farZ = (i + 1) * SEGMENT;
      var nearZ = i * SEGMENT;
      var far = project(farZ, lane, width, height, horizon);
      var near = project(nearZ, lane, width, height, horizon);
      var band = i % 2;
      ctx.beginPath();
      ctx.moveTo(far.x - far.half, far.y);
      ctx.lineTo(far.x + far.half, far.y);
      ctx.lineTo(near.x + near.half, near.y);
      ctx.lineTo(near.x - near.half, near.y);
      ctx.closePath();
      ctx.fillStyle = band ? 'rgba(20,16,48,0.94)' : 'rgba(12,10,32,0.94)';
      ctx.fill();
      ctx.strokeStyle = band ? circuit.css : circuit.shade;
      ctx.globalAlpha = band ? 0.55 : 0.22;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (band === 0) {
        ctx.fillStyle = circuit.css;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(far.x - 2, far.y, 4, Math.max(1, near.y - far.y));
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawEntities(width, height, horizon) {
    var lane = state.lane * 0.55;
    state.entities.forEach(function (entity) {
      if (entity.done) return;
      var relative = entity.z - state.distance;
      if (relative < 10 || relative > VIEW) return;
      var point = project(relative, lane, width, height, horizon);
      var size = 6 + point.scale * 34;
      var x = point.x + entity.lane * 150 * point.scale;
      var y = point.y - size * 0.4;
      if (entity.type === 'pickup') {
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = Math.max(1, size * 0.16);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(125,211,252,0.28)';
        ctx.fill();
      } else {
        ctx.fillStyle = '#ff3d6e';
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd1dc';
        ctx.fillRect(x - size * 0.14, y - size * 0.55, size * 0.28, size * 1.1);
      }
    });
  }

  function drawCraft(width, height) {
    var x = width / 2 + state.lane * width * 0.17;
    var y = height * 0.86 - state.jump * height * 0.12;
    var size = Math.min(width, height) * 0.045;
    ctx.fillStyle = circuit.css;
    ctx.globalAlpha = 0.28;
    ctx.fillRect(x - size * 0.6, y + size * 0.9, size * 1.2, size * 0.4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e8f7ff';
    ctx.beginPath();
    ctx.moveTo(x, y - size * 1.4);
    ctx.lineTo(x + size, y + size * 0.8);
    ctx.lineTo(x + size * 0.45, y + size * 0.5);
    ctx.lineTo(x - size * 0.45, y + size * 0.5);
    ctx.lineTo(x - size, y + size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = circuit.shade;
    ctx.fillRect(x - size * 0.22, y - size * 0.6, size * 0.44, size * 0.9);
  }

  function render() {
    if (!ctx) return;
    var width = canvas.clientWidth || root.clientWidth;
    var height = canvas.clientHeight || root.clientHeight;
    var horizon = height * 0.45;
    drawBackground(width, height, horizon);
    drawRoad(width, height, horizon);
    drawEntities(width, height, horizon);
    drawCraft(width, height);
  }

  function updateHud(now) {
    if (now - lastHud < 90) return;
    lastHud = now;
    hud('[data-hud-speed]', Math.round(state.speed / 2.3) + ' km/h');
    hud('[data-hud-time]', Math.max(0, circuit.limit - state.time).toFixed(1) + ' / ' + circuit.limit + 's');
    hud('[data-hud-score]', Math.round(state.score).toLocaleString('es-CO'));
    hud('[data-hud-progress]', Math.round(clamp(state.distance / circuit.length, 0, 1) * 100) + '%');
    var turbo = root.querySelector('[data-hud-turbo]');
    var energy = root.querySelector('[data-hud-energy]');
    var progress = root.querySelector('[data-hud-progress]');
    if (turbo) turbo.style.width = clamp(state.turbo, 0, 100) + '%';
    if (energy) energy.style.width = clamp(state.energy, 0, 100) + '%';
    if (progress) progress.style.width = clamp(state.distance / circuit.length * 100, 0, 100) + '%';
  }

  function finish(success) {
    if (!state || state.finished) return;
    state.finished = true;
    running = false;
    if (frame) global.cancelAnimationFrame(frame);
    frame = 0;
    root.classList.remove('is-racing');
    var bonus = success ? Math.round((circuit.limit - state.time) * 18 + state.turbo * 4) : 0;
    state.score += bonus;
    var record = success ? O.saveBest(state.index, state.score, state.time) : O.loadBest()[state.index];
    var result = root.querySelector('[data-game-result]');
    if (result) {
      result.hidden = false;
      var title = root.querySelector('[data-result-title]');
      if (title) title.textContent = success ? 'CIRCUITO COMPLETADO' : 'TIEMPO AGOTADO';
      hud('[data-result-score]', Math.round(state.score).toLocaleString('es-CO'));
      hud('[data-result-time]', state.time.toFixed(1) + ' s');
      hud('[data-result-best]', record ? Math.round(record.score).toLocaleString('es-CO') : '—');
    }
    if (host && typeof host.submitResult === 'function') {
      host.submitResult({
        game: 'nexus-rush',
        version: '1.0.0',
        circuit: state.index,
        circuitName: circuit.name,
        success: success,
        score: Math.round(state.score),
        durationMs: Math.round(state.time * 1000),
        stats: {
          pickups: state.pickups,
          crashes: state.crashes,
          turbo: Math.round(state.turbo)
        }
      });
    }
    if (success) tone(784, 0.18, 'triangle', 0.1);
    else tone(120, 0.32, 'sawtooth', 0.08);
  }

  function update(now, delta) {
    if (!state.finished && now < state.countdownEnd) {
      var remaining = Math.ceil((state.countdownEnd - now) / 700);
      var label = remaining > 3 ? '3' : remaining > 0 ? String(remaining) : 'GO';
      hud('[data-game-countdown]', label);
      return;
    }
    var countdown = root.querySelector('[data-game-countdown]');
    if (countdown) countdown.hidden = true;

    if (paused) return;

    var boost = keys.boost || keys.Space || keys[' '];
    var target = circuit.speed * (boost && state.turbo > 0 ? 1.45 : 1);
    state.speed += (target - state.speed) * Math.min(1, delta * 2.6);
    if (boost && state.turbo > 0) state.turbo = Math.max(0, state.turbo - delta * 26);
    else state.turbo = Math.min(100, state.turbo + delta * 3.5);

    if (keys.left || keys.ArrowLeft || keys.a || keys.A) state.lane -= delta * 1.7;
    if (keys.right || keys.ArrowRight || keys.d || keys.D) state.lane += delta * 1.7;
    state.lane = clamp(state.lane, -1, 1);

    if ((keys.jump || keys.Shift || keys.shift) && state.jump <= 0 && state.energy > 10) {
      state.jump = 1;
      state.energy -= 10;
      tone(520, 0.12, 'sine', 0.07);
    }
    keys.jump = false;
    state.jump = Math.max(0, state.jump - delta * 2.2);
    state.energy = Math.min(100, state.energy + delta * 4);

    var previous = state.distance;
    state.distance += state.speed * delta;
    state.time += delta;
    state.score += delta * 18;

    state.entities.forEach(function (entity) {
      if (entity.done || entity.z < previous || entity.z > state.distance) return;
      var playerLane = clamp(Math.round(state.lane), -1, 1);
      if (Math.abs(playerLane - entity.lane) > 0.5 || state.jump > 0.45) return;
      entity.done = true;
      if (entity.type === 'pickup') {
        state.pickups += 1;
        state.score += 140;
        state.turbo = Math.min(100, state.turbo + 12);
        tone(880, 0.12, 'triangle', 0.08);
      } else {
        state.crashes += 1;
        state.energy = Math.max(0, state.energy - 26);
        state.speed *= 0.62;
        state.score = Math.max(0, state.score - 80);
        tone(95, 0.2, 'square', 0.08);
      }
    });

    if (state.time >= circuit.limit) finish(false);
    else if (state.distance >= circuit.length) finish(true);
    updateHud(now);
  }

  function loop(now) {
    if (!running) return;
    frame = global.requestAnimationFrame(loop);
    if (paused || document.hidden) return;
    var delta = Math.min((now - (state.last || now)) / 1000, 0.05);
    state.last = now;
    update(now, delta);
    render();
  }

  function bindControls() {
    if (bound) return;
    bound = true;
    on(doc, 'keydown', function (event) {
      if (!running) return;
      keys[event.key] = true;
      keys[event.code] = true;
      unlockAudio();
      if (/^(Arrow|Space|Shift)/.test(event.code)) event.preventDefault();
      if (event.key === 'p' || event.key === 'P') {
        if (paused) resume();
        else pause();
      }
      if (event.key === 'r' || event.key === 'R') restart();
      if (event.key === 'Escape') O.goHub();
    });
    on(doc, 'keyup', function (event) {
      keys[event.key] = false;
      keys[event.code] = false;
    });
    on(global, 'blur', function () { keys = {}; });
    on(global, 'resize', resize);
    on(doc, 'visibilitychange', function () {
      if (!running) return;
      if (doc.hidden) pause();
      else resume();
    });
    var mappings = [
      ['[data-touch-left]', 'left'], ['[data-touch-right]', 'right'],
      ['[data-touch-jump]', 'jump'], ['[data-touch-boost]', 'boost']
    ];
    mappings.forEach(function (mapping) {
      var node = root.querySelector(mapping[0]);
      if (!node) return;
      ['pointerdown', 'pointerup', 'pointercancel', 'pointerleave'].forEach(function (eventName) {
        on(node, eventName, function (event) {
          event.preventDefault();
          touch[mapping[1]] = eventName === 'pointerdown';
          keys[mapping[1]] = touch[mapping[1]];
          if (eventName === 'pointerdown') unlockAudio();
        });
      });
    });
  }

  function start(options) {
    if (!root) return;
    var index = typeof options === 'number'
      ? options
      : (options && options.circuit != null ? options.circuit : 0);
    index = clamp(index | 0, 0, CIRCUITS.length - 1);
    stop();
    bindControls();
    ensureCanvas();
    buildScenery(index);
    circuit = CIRCUITS[index];
    state = {
      index: index,
      distance: 0,
      time: 0,
      score: 0,
      speed: circuit.speed * 0.55,
      turbo: 100,
      energy: 100,
      lane: 0,
      jump: 0,
      pickups: 0,
      crashes: 0,
      entities: entitiesFor(index),
      countdownEnd: global.performance.now() + 2600,
      last: 0,
      finished: false
    };
    paused = false;
    keys = {};
    touch = {};
    hudCache = {};
    var countdown = root.querySelector('[data-game-countdown]');
    if (countdown) {
      countdown.hidden = false;
      countdown.textContent = '3';
    }
    var pausePanel = root.querySelector('[data-game-paused]');
    if (pausePanel) pausePanel.hidden = true;
    var result = root.querySelector('[data-game-result]');
    if (result) result.hidden = true;
    root.classList.add('is-racing');
    running = true;
    updateHud(global.performance.now());
    frame = global.requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    paused = false;
    if (frame) global.cancelAnimationFrame(frame);
    frame = 0;
    if (!root) return;
    root.classList.remove('is-racing');
    var result = root.querySelector('[data-game-result]');
    var pausePanel = root.querySelector('[data-game-paused]');
    if (result) result.hidden = true;
    if (pausePanel) pausePanel.hidden = true;
    var countdown = root.querySelector('[data-game-countdown]');
    if (countdown) countdown.hidden = true;
  }

  function init(context) {
    host = context || null;
    root = O.root() || doc.querySelector('[data-universe-root]');
    if (!root) return false;
    bindControls();
    return true;
  }

  function mount(container) {
    if (!container || !container.closest) return;
    root = container.closest('[data-universe-root]') || root;
  }

  function pause() {
    if (!running || paused) return;
    paused = true;
    keys = {};
    touch = {};
    var panel = root && root.querySelector('[data-game-paused]');
    if (panel) panel.hidden = false;
  }

  function resume() {
    if (!running || !paused || doc.hidden) return;
    paused = false;
    var panel = root && root.querySelector('[data-game-paused]');
    if (panel) panel.hidden = true;
    if (state) state.last = global.performance.now();
  }

  function restart() {
    start(state ? state.index : 0);
  }

  function getState() {
    if (!state) return null;
    return {
      circuit: state.index,
      distance: state.distance,
      time: state.time,
      score: Math.round(state.score),
      energy: state.energy,
      turbo: state.turbo,
      paused: paused,
      finished: state.finished
    };
  }

  function dispose() {
    stop();
    offAll();
    if (audioContext && typeof audioContext.close === 'function') {
      try { audioContext.close(); } catch (error) { audioContext = null; }
    }
    audioContext = null;
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    canvas = null;
    ctx = null;
    state = null;
    circuit = null;
    stars = [];
    skyline = [];
    hudCache = {};
    keys = {};
    touch = {};
    host = null;
  }

  var contract = {
    id: 'nexus-rush',
    init: init,
    mount: mount,
    start: start,
    pause: pause,
    resume: resume,
    restart: restart,
    getState: getState,
    stop: stop,
    dispose: dispose
  };

  if (PLAY) PLAY.register('nexus-rush', contract);

  O.Game = {
    start: start,
    stop: stop,
    pause: pause,
    resume: resume,
    restart: restart,
    dispose: dispose,
    isRunning: function () { return running; }
  };
})(window);
