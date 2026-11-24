(function (global) {
  'use strict';

  var O = global.OTRAVERSO = global.OTRAVERSO || {};
  var doc = global.document;
  var raf = global.requestAnimationFrame || function (fn) { return global.setTimeout(fn, 16); };
  var caf = global.cancelAnimationFrame || global.clearTimeout;

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function nowMs() {
    return (global.performance && global.performance.now) ? global.performance.now() : Date.now();
  }

  function q(root, sel) {
    return root ? root.querySelector(sel) : null;
  }

  function qa(root, sel) {
    return root ? Array.prototype.slice.call(root.querySelectorAll(sel)) : [];
  }

  function setText(node, value) {
    if (node) node.textContent = value == null ? '' : String(value);
  }

  function show(node, on) {
    if (!node) return;
    if ('hidden' in node) node.hidden = !on;
    if (node.style) node.style.display = on ? '' : 'none';
  }

  function readBest(id) {
    try {
      var raw = global.localStorage.getItem('otraverso.' + id + '.best.v1');
      if (!raw) return 0;
      var n = parseFloat(raw);
      return isFinite(n) ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function writeBest(id, score) {
    try {
      global.localStorage.setItem('otraverso.' + id + '.best.v1', String(score));
    } catch (e) {}
  }

  function formatMs(ms) {
    var s = Math.max(0, ms || 0) / 1000;
    return s.toFixed(1) + ' s';
  }

  function createAudio() {
    var ctx = null;
    function ensure() {
      if (ctx) return ctx;
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return null;
      try { ctx = new Ctx(); } catch (e) { ctx = null; }
      return ctx;
    }
    function beep(freq, dur, type, vol, slide) {
      var c = ensure();
      if (!c) return;
      try {
        if (c.state === 'suspended' && c.resume) c.resume();
        var o = c.createOscillator();
        var g = c.createGain();
        o.type = type || 'sine';
        o.frequency.value = freq || 440;
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), c.currentTime + dur);
        g.gain.value = vol == null ? 0.04 : vol;
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
        o.connect(g);
        g.connect(c.destination);
        o.start();
        o.stop(c.currentTime + dur);
      } catch (e) {}
    }
    return function (name) {
      if (name === 'start') beep(440, 0.12, 'triangle', 0.05, 660);
      else if (name === 'score' || name === 'collect') beep(720, 0.08, 'sine', 0.05, 980);
      else if (name === 'hit' || name === 'fail') beep(180, 0.18, 'sawtooth', 0.04, 90);
      else if (name === 'success' || name === 'win') { beep(523, 0.1, 'triangle', 0.04, 659); beep(659, 0.14, 'triangle', 0.04, 784); }
      else if (name === 'tick') beep(600, 0.04, 'square', 0.03, 500);
      else if (name === 'combo') beep(880, 0.09, 'triangle', 0.045, 1320);
      else if (name === 'special') beep(990, 0.12, 'sine', 0.05, 1480);
      else beep(520, 0.06, 'sine', 0.03, 520);
    };
  }

  function create(spec) {
    var host = null;
    var root = null;
    var container = null;
    var canvas = null;
    var ctx = null;
    var state = null;
    var running = false;
    var paused = false;
    var finished = false;
    var started = false;
    var rafId = 0;
    var last = 0;
    var elapsedMs = 0;
    var listeners = [];
    var sound = createAudio();
    var pendingStart = false;

    function getRoot() {
      return root || (O.root && O.root()) || doc.querySelector('[data-universe-root]') || doc.body;
    }

    function on(target, type, fn, opts) {
      if (!target) return;
      target.addEventListener(type, fn, opts);
      listeners.push({ target: target, type: type, fn: fn, opts: opts });
    }

    function offAll() {
      var i;
      for (i = 0; i < listeners.length; i++) {
        var l = listeners[i];
        try { l.target.removeEventListener(l.type, l.fn, l.opts); } catch (e) {}
      }
      listeners = [];
    }

    function ensureCanvas() {
      var r = getRoot();
      if (!canvas) canvas = q(r, 'canvas[data-game-canvas]');
      if (!canvas) {
        canvas = doc.createElement('canvas');
        canvas.setAttribute('data-game-canvas', '');
        canvas.setAttribute('data-play-runtime', spec.id);
        var hostEl = q(r, '[data-game-host]') || q(r, '[data-game-viewport]') || container || r;
        hostEl.appendChild(canvas);
      }
      if (!canvas.getAttribute('data-play-runtime')) canvas.setAttribute('data-play-runtime', spec.id);
      ctx = canvas.getContext('2d');
      resize();
    }

    function resize() {
      if (!canvas) return;
      var parent = canvas.parentElement || container || getRoot();
      var rect = parent.getBoundingClientRect ? parent.getBoundingClientRect() : { width: 800, height: 450 };
      var w = Math.max(320, Math.floor(rect.width || 800));
      var h = Math.max(240, Math.floor(rect.height || 450));
      var dpr = global.devicePixelRatio || 1;
      if (dpr > 2) dpr = 2;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function apiObj() {
      var w = canvas ? (canvas.width / ((global.devicePixelRatio || 1) > 2 ? 2 : (global.devicePixelRatio || 1))) : 800;
      var h = canvas ? (canvas.height / ((global.devicePixelRatio || 1) > 2 ? 2 : (global.devicePixelRatio || 1))) : 450;
      if (canvas) {
        var dpr = global.devicePixelRatio || 1;
        if (dpr > 2) dpr = 2;
        w = canvas.width / dpr;
        h = canvas.height / dpr;
      }
      return {
        finish: finish,
        sound: sound,
        width: w,
        height: h,
        now: nowMs,
        random: function () { return Math.random(); },
        clamp: clamp,
        root: getRoot()
      };
    }

    function updateHud() {
      var r = getRoot();
      var h = null;
      try { h = spec.hud ? spec.hud(state) : null; } catch (e) { h = null; }
      if (!h) return;
      setText(q(r, '[data-hud-score]'), h.score != null ? h.score : '');
      setText(q(r, '[data-hud-time]'), h.time != null ? h.time : '');
      setText(q(r, '[data-hud-extra]'), h.extra != null ? h.extra : '');
    }

    function showStart(on) {
      show(q(getRoot(), '[data-game-start]'), on);
    }

    function showPaused(on) {
      show(q(getRoot(), '[data-game-paused]'), on);
    }

    function showResult(on) {
      show(q(getRoot(), '[data-game-result]'), on);
    }

    function bestValue() {
      return readBest(spec.id);
    }

    function finish(result) {
      if (finished) return;
      finished = true;
      running = false;
      var r = getRoot();
      var res = result;
      if (!res && spec.result) {
        try { res = spec.result(state); } catch (e) { res = {}; }
      }
      res = res || {};
      var score = res.score != null ? res.score : 0;
      var duration = res.durationMs != null ? res.durationMs : Math.round(elapsedMs);
      var prev = bestValue();
      if (typeof score === 'number' && score > prev) {
        writeBest(spec.id, score);
        prev = score;
      }
      setText(q(r, '[data-result-title]'), res.title != null ? res.title : 'RESULTADO');
      setText(q(r, '[data-result-score]'), score);
      setText(q(r, '[data-result-time]'), formatMs(duration));
      setText(q(r, '[data-result-best]'), prev);
      var detail = '';
      if (res.stats) {
        var parts = [];
        var k;
        for (k in res.stats) {
          if (Object.prototype.hasOwnProperty.call(res.stats, k)) parts.push(k + ': ' + res.stats[k]);
        }
        detail = parts.join(' · ');
      }
      setText(q(r, '[data-result-detail]'), detail);
      showPaused(false);
      showResult(true);
      if (host && typeof host.submitResult === 'function') {
        try {
          host.submitResult({
            game: spec.id,
            version: spec.version || '1.0.0',
            score: score,
            durationMs: duration,
            stats: res.stats || {},
            success: !!res.success
          });
        } catch (e) {}
      }
      if (spec.draw && ctx) {
        try { spec.draw(state, ctx, apiObj()); } catch (e) {}
      }
    }

    function loop(ts) {
      if (!running) return;
      rafId = raf(loop);
      if (paused || doc.hidden) { last = ts; return; }
      if (!last) last = ts;
      var dt = (ts - last) / 1000;
      last = ts;
      if (dt < 0) dt = 0;
      if (dt > 0.05) dt = 0.05;
      elapsedMs += dt * 1000;
      try { if (spec.update) spec.update(state, dt, apiObj()); } catch (e) {}
      try { if (spec.draw && ctx) spec.draw(state, ctx, apiObj()); } catch (e) {}
      updateHud();
    }

    function doStart(options) {
      if (!canvas) ensureCanvas();
      resize();
      if (!state && spec.create) {
        try { state = spec.create(apiObj()); } catch (e) { state = {}; }
      }
      try { if (spec.reset) spec.reset(state, apiObj()); } catch (e) {}
      elapsedMs = 0;
      last = 0;
      running = true;
      paused = false;
      finished = false;
      started = true;
      showStart(false);
      showResult(false);
      showPaused(false);
      updateHud();
      try { sound('start'); } catch (e) {}
      if (rafId) caf(rafId);
      rafId = raf(loop);
    }

    function bindDom() {
      var r = getRoot();
      var startBtn = q(r, '[data-game-start-button]');
      if (startBtn) on(startBtn, 'click', function (ev) { ev.preventDefault(); doStart({}); });
      var retry = q(r, '[data-retry]');
      if (retry) on(retry, 'click', function (ev) { ev.preventDefault(); doStart({}); });
      var menu = q(r, '[data-circuit-menu]');
      if (menu) on(menu, 'click', function (ev) { ev.preventDefault(); if (host && host.goPlay) host.goPlay(); else if (O.goPlay) O.goPlay(); });
      var hub = q(r, '[data-game-hub]');
      if (hub) on(hub, 'click', function (ev) { ev.preventDefault(); if (host && host.goHub) host.goHub(); else if (O.goHub) O.goHub(); });
      on(doc, 'visibilitychange', function () {
        if (!started || finished) return;
        if (doc.hidden) { paused = true; showPaused(true); }
        else { paused = false; showPaused(false); last = 0; }
      });
      on(global, 'resize', function () { resize(); if (started && spec.draw && ctx && !running) { try { spec.draw(state, ctx, apiObj()); } catch (e) {} } });
      on(doc, 'keydown', function (ev) {
        if (!started || finished) return;
        if (ev.code === 'KeyP') { ev.preventDefault(); if (paused) contract.resume(); else contract.pause(); return; }
        if (paused) return;
        try { if (spec.key) spec.key(state, ev.code || ev.key, true, apiObj()); } catch (e) {}
      });
      on(doc, 'keyup', function (ev) {
        if (!started || finished || paused) return;
        try { if (spec.key) spec.key(state, ev.code || ev.key, false, apiObj()); } catch (e) {}
      });
      if (canvas) {
        var pointerHandler = function (ev) {
          if (!started || finished || paused) return;
          var rect = canvas.getBoundingClientRect();
          var x = ev.clientX - rect.left;
          var y = ev.clientY - rect.top;
          if (rect.width && canvas.width) x = x * (apiObj().width / rect.width);
          if (rect.height && canvas.height) y = y * (apiObj().height / rect.height);
          try { if (spec.pointer) spec.pointer(state, x, y, apiObj()); } catch (e) {}
        };
        on(canvas, 'pointerdown', function (ev) { ev.preventDefault(); pointerHandler(ev); });
        on(canvas, 'touchstart', function (ev) {
          if (!started || finished || paused) return;
          var t = ev.touches && ev.touches[0];
          if (!t) return;
          ev.preventDefault();
          var rect = canvas.getBoundingClientRect();
          var x = t.clientX - rect.left;
          var y = t.clientY - rect.top;
          if (rect.width) x = x * (apiObj().width / rect.width);
          if (rect.height) y = y * (apiObj().height / rect.height);
          try { if (spec.pointer) spec.pointer(state, x, y, apiObj()); } catch (e) {}
        }, { passive: false });
      }
    }

    var contract = {
      init: function (context, options) {
        host = context || null;
        root = (O.root && O.root()) || (context && context.root && context.root()) || doc.querySelector('[data-universe-root]');
        return true;
      },
      mount: function (cont) {
        container = cont || container;
        ensureCanvas();
        showStart(true);
        showResult(false);
        showPaused(false);
        bindDom();
        if (pendingStart) { pendingStart = false; doStart({}); }
      },
      start: function (options) {
        if (!canvas) ensureCanvas();
        if (!state && spec.create) {
          try { state = spec.create(apiObj()); } catch (e) { state = {}; }
        }
        try { if (spec.reset) spec.reset(state, apiObj()); } catch (e) {}
        running = false;
        paused = false;
        finished = false;
        showStart(true);
        showResult(false);
        showPaused(false);
        updateHud();
        return true;
      },
      pause: function () {
        if (!started || finished || paused) return;
        paused = true;
        showPaused(true);
      },
      resume: function () {
        if (!started || finished || !paused) return;
        if (doc.hidden) return;
        paused = false;
        showPaused(false);
        last = 0;
      },
      restart: function () { doStart({}); },
      getState: function () {
        var res = null;
        try { res = spec.result ? spec.result(state) : null; } catch (e) { res = null; }
        return {
          id: spec.id,
          running: running,
          paused: paused,
          finished: finished,
          elapsedMs: Math.round(elapsedMs),
          result: res
        };
      },
      stop: function () {
        running = false;
        if (rafId) caf(rafId);
        rafId = 0;
      },
      dispose: function () {
        running = false;
        finished = true;
        if (rafId) caf(rafId);
        rafId = 0;
        offAll();
        if (canvas) {
          try { canvas.width = 1; canvas.height = 1; } catch (e) {}
          if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        }
        canvas = null;
        ctx = null;
        state = null;
      }
    };

    return contract;
  }

  function register(spec) {
    if (!spec || !spec.id) return null;
    var contract = create(spec);
    if (O.PLAY && typeof O.PLAY.register === 'function') {
      O.PLAY.register(spec.id, contract);
    }
    return contract;
  }

  O.GAMEKIT = {
    register: register,
    create: create
  };
})(window);
