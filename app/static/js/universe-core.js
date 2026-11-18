(function (global) {
  'use strict';

  var doc = global.document;
  var root = null;
  var activeScene = 'hub';
  var timers = [];
  var gamePromise = null;
  var gameScript = null;
  var pointerFrame = 0;
  var pointerX = 0;
  var pointerY = 0;
  var storageBlocked = false;
  var BEST_KEY = 'otraverso.nexus.best.v1';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function later(fn, delay) {
    var id = global.setTimeout(fn, delay);
    timers.push(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(global.clearTimeout);
    timers = [];
  }

  function loadBest() {
    try {
      return JSON.parse(global.localStorage.getItem(BEST_KEY) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function saveBest(circuit, score, time) {
    var all = loadBest();
    var previous = all[circuit];
    if (!previous || score > previous.score) {
      all[circuit] = { score: Math.round(score), time: Math.round(time * 10) / 10, at: new Date().toISOString() };
      try { global.localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (error) { storageBlocked = true; }
    }
    return all[circuit];
  }

  function bestLabel() {
    var all = loadBest();
    var names = ['NEXUS I', 'NEXUS II', 'NEXUS III'];
    return names.map(function (name, index) {
      var record = all[index];
      return name + ': ' + (record ? record.score.toLocaleString('es-CO') : '—');
    }).join(' · ');
  }

  function sceneFromPath(path) {
    if (path.indexOf('/play/nexus-rush') === 0) return 'game';
    if (path.indexOf('/play') === 0) return 'play';
    return 'hub';
  }

  function notify(message) {
    var toast = root && root.querySelector('[data-universe-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    global.clearTimeout(notify.timer);
    notify.timer = global.setTimeout(function () { toast.classList.remove('is-visible'); }, 2200);
  }

  function showError(message, retry) {
    var bar = root && root.querySelector('[data-universe-error]');
    if (!bar) return;
    bar.hidden = false;
    var text = bar.querySelector('[data-error-text]');
    if (text) text.textContent = message;
    var button = bar.querySelector('[data-error-retry]');
    if (button) {
      button.onclick = function () {
        bar.hidden = true;
        if (retry) retry();
      };
    }
  }

  function ensureGame() {
    if (global.OTRAVERSO.Game) return global.Promise.resolve(global.OTRAVERSO.Game);
    if (gamePromise) return gamePromise;
    gamePromise = new global.Promise(function (resolve, reject) {
      var finished = false;
      var timeout = global.setTimeout(function () {
        if (finished) return;
        finished = true;
        gamePromise = null;
        reject(new Error('Tiempo de espera agotado al cargar NEXUS RUSH'));
      }, 8000);
      gameScript = doc.createElement('script');
      gameScript.src = '/static/js/nexus-rush.js';
      gameScript.async = true;
      gameScript.onload = function () {
        global.clearTimeout(timeout);
        if (finished) return;
        finished = true;
        if (global.OTRAVERSO.Game) resolve(global.OTRAVERSO.Game);
        else {
          gamePromise = null;
          reject(new Error('NEXUS RUSH no se inicializó'));
        }
      };
      gameScript.onerror = function () {
        global.clearTimeout(timeout);
        if (finished) return;
        finished = true;
        gamePromise = null;
        reject(new Error('No se pudo cargar NEXUS RUSH'));
      };
      doc.head.appendChild(gameScript);
    });
    return gamePromise.catch(function (error) {
      showError(error.message || 'No se pudo iniciar NEXUS RUSH.', function () {
        gamePromise = null;
        ensureGame().then(function (Game) { Game.start(currentCircuit()); });
      });
      throw error;
    });
  }

  function currentCircuit() {
    var raw = parseInt(root && root.getAttribute('data-circuit'), 10);
    return clamp(isNaN(raw) ? 0 : raw, 0, 2);
  }

  function stopGame() {
    if (global.OTRAVERSO.Game && global.OTRAVERSO.Game.stop) global.OTRAVERSO.Game.stop();
  }

  function setScene(name, options) {
    options = options || {};
    if (!root) return;
    activeScene = name;
    root.setAttribute('data-scene', name);
    if (options.circuit != null && name !== 'hub') root.setAttribute('data-circuit', String(options.circuit));
    doc.body.classList.toggle('in-game', name === 'game');
    root.dispatchEvent(new global.CustomEvent('otraverso:scene', { detail: { scene: name, options: options } }));
    if (name === 'game') {
      ensureGame().then(function (Game) { Game.start(options.circuit != null ? options.circuit : currentCircuit()); });
    } else {
      stopGame();
    }
  }

  function warpTo(path, scene, options, external) {
    if (!root || root.classList.contains('is-warping')) return;
    clearTimers();
    root.classList.add('is-warping');
    var overlay = root.querySelector('[data-warp-overlay]');
    if (overlay) {
      var color = (scene === 'play' || scene === 'game') ? '#f472b6' : '#8b5cf6';
      overlay.style.setProperty('--warp-color', color);
      overlay.classList.add('is-active');
    }
    later(function () {
      if (external) {
        global.location.assign(path);
        return;
      }
      global.history.pushState({ scene: scene || sceneFromPath(path), options: options || {} }, '', path);
      setScene(scene || sceneFromPath(path), options);
    }, 460);
    later(function () {
      root.classList.remove('is-warping');
      if (overlay) overlay.classList.remove('is-active');
    }, 880);
  }

  function startCircuit(index) {
    warpTo('/play/nexus-rush', 'game', { circuit: clamp(index | 0, 0, 2) });
  }

  function goHub() {
    if (global.location.pathname !== '/') warpTo('/', 'hub');
    else setScene('hub');
  }

  function bindLinks() {
    doc.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a[data-warp]');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      var url = new global.URL(link.href, global.location.href);
      if (url.origin !== global.location.origin) return;
      event.preventDefault();
      warpTo(url.pathname, sceneFromPath(url.pathname));
    });
    global.addEventListener('popstate', function () {
      setScene(sceneFromPath(global.location.pathname), { circuit: currentCircuit() });
    });
  }

  function applyPointer() {
    pointerFrame = 0;
    if (!root) return;
    root.style.setProperty('--mx', pointerX.toFixed(3));
    root.style.setProperty('--my', pointerY.toFixed(3));
  }

  function bindPointer() {
    if (!root) return;
    root.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch') return;
      var rect = root.getBoundingClientRect();
      pointerX = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
      pointerY = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
      if (!pointerFrame) pointerFrame = global.requestAnimationFrame(applyPointer);
    }, { passive: true });
    root.addEventListener('pointerleave', function () {
      pointerX = 0;
      pointerY = 0;
      if (!pointerFrame) pointerFrame = global.requestAnimationFrame(applyPointer);
    });
    doc.addEventListener('visibilitychange', function () {
      doc.body.classList.toggle('is-hidden', doc.hidden);
    });
  }

  function boot() {
    root = doc.querySelector('[data-universe-root]');
    if (!root) return;
    activeScene = root.getAttribute('data-scene') || sceneFromPath(global.location.pathname);
    root.classList.add('is-ready');
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('is-reduced');
    }
    var badge = root.querySelector('[data-loader]');
    if (badge) later(function () { badge.hidden = true; }, 900);
    var errorRetry = root.querySelector('[data-error-retry]');
    if (errorRetry) errorRetry.addEventListener('click', function () { root.querySelector('[data-universe-error]').hidden = true; });
    bindLinks();
    bindPointer();
    setScene(activeScene, activeScene === 'game' ? { circuit: currentCircuit() } : {});
  }

  global.OTRAVERSO = {
    version: 'light-css-2',
    boot: boot,
    root: function () { return root; },
    scene: function () { return activeScene; },
    setScene: setScene,
    warpTo: warpTo,
    startCircuit: startCircuit,
    goHub: goHub,
    notify: notify,
    showError: showError,
    ensureGame: ensureGame,
    loadBest: loadBest,
    saveBest: saveBest,
    bestLabel: bestLabel,
    clamp: clamp,
    lerp: lerp
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
