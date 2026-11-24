(function (global) {
  'use strict';

  var doc = global.document;
  var root = null;
  var activeScene = 'hub';
  var previousScene = null;
  var timers = [];
  var pointerFrame = 0;
  var pointerX = 0;
  var pointerY = 0;
  var BEST_KEY = 'otraverso.nexus.best.v1';
  var RESULT_KEY = 'otraverso.play.results.v1';
  var STATE_PREFIX = 'otraverso.play.state.v1.';
  var NAV_CONTRACT = 'navigation-1';
  var NAV_STATES = ['hub', 'play', 'game'];
  var NAV_EVENT = 'otraverso:navigation';
  var NETWORK_TIMEOUT = 8000;
  var activeGameCode = null;
  var contracts = {};
  var loadedScripts = {};
  var loadedLinks = {};
  var loadPromises = {};
  var manifests = {};
  var active = null;
  var activationToken = 0;

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

  function readJson(key, fallback) {
    try {
      return JSON.parse(global.localStorage.getItem(key) || '') || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function loadBest() {
    return readJson(BEST_KEY, {});
  }

  function saveBest(circuit, score, time) {
    var all = loadBest();
    var previous = all[circuit];
    if (!previous || score > previous.score) {
      all[circuit] = {
        score: Math.round(score),
        time: Math.round(time * 10) / 10,
        at: new Date().toISOString()
      };
      writeJson(BEST_KEY, all);
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

  function validAsset(value) {
    return typeof value === 'string' && value.indexOf('/static/') === 0;
  }

  function validateManifest(manifest, code) {
    if (!manifest || manifest.status !== 'published' || !manifest.code || (code && manifest.code !== code)) {
      throw new Error('Manifiesto de juego no válido');
    }
    if (!validAsset(manifest.entry) || !manifest.route || manifest.route.indexOf('/play') !== 0) {
      throw new Error('Manifiesto de juego no válido');
    }
    if (manifest.css != null && !Array.isArray(manifest.css)) {
      throw new Error('Manifiesto de juego no válido');
    }
    if (manifest.dependencies != null && !Array.isArray(manifest.dependencies)) {
      throw new Error('Manifiesto de juego no válido');
    }
    var assets = (manifest.css || []).concat(manifest.dependencies || []);
    for (var i = 0; i < assets.length; i += 1) {
      if (!validAsset(assets[i])) throw new Error('Manifiesto de juego no válido');
    }
    return manifest;
  }

  function readRegistry() {
    if (!root) return;
    var raw = root.getAttribute('data-game-registry') || '[]';
    try {
      JSON.parse(raw).forEach(function (manifest) {
        if (manifest && manifest.code) {
          try {
            manifests[manifest.code] = validateManifest(manifest, manifest.code);
          } catch (error) {}
        }
      });
    } catch (error) {
      manifests = {};
    }
  }

  function getManifest(code) {
    return manifests[code] || null;
  }

  function withTimeout(promise, message) {
    return new global.Promise(function (resolve, reject) {
      var settled = false;
      var timer = global.setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      }, NETWORK_TIMEOUT);
      promise.then(function (value) {
        if (settled) return;
        settled = true;
        global.clearTimeout(timer);
        resolve(value);
      }, function (error) {
        if (settled) return;
        settled = true;
        global.clearTimeout(timer);
        reject(error);
      });
    });
  }

  function fetchManifest(code) {
    if (manifests[code]) return global.Promise.resolve(manifests[code]);
    if (!global.fetch) return global.Promise.reject(new Error('Juego no disponible'));
    var request = global.fetch('/api/play/v1/games/' + encodeURIComponent(code) + '/manifest', {
      headers: { 'Accept': 'application/json' }
    }).then(function (response) {
      if (!response.ok) throw new Error('Juego no disponible');
      return response.json();
    }).then(function (payload) {
      var manifest = payload && payload.manifest;
      manifests[code] = validateManifest(manifest, code);
      return manifests[code];
    });
    return withTimeout(request, 'Tiempo de espera agotado al consultar el catálogo');
  }

  function notify(message) {
    var toast = root && root.querySelector('[data-universe-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    global.clearTimeout(notify.timer);
    notify.timer = global.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2200);
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

  function injectCss(code, manifest) {
    if (loadedLinks[code] || !manifest.css) return;
    loadedLinks[code] = [];
    manifest.css.forEach(function (href) {
      var link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-play-runtime', code);
      doc.head.appendChild(link);
      loadedLinks[code].push(link);
    });
  }

  function removeRuntimeNode(node, code, src) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
    if (code && src) delete loadedScripts[code + ':' + src];
  }

  function injectScript(src, code, expectContract, name) {
    var existing = doc.querySelector('script[src="' + src + '"]');
    if (existing) {
      if (expectContract && contracts[code]) return global.Promise.resolve(contracts[code]);
      if (expectContract) return global.Promise.reject(new Error(name + ' no se inicializó'));
      return global.Promise.resolve(existing);
    }
    return new global.Promise(function (resolve, reject) {
      var finished = false;
      var script = doc.createElement('script');
      var timeout = global.setTimeout(function () {
        if (finished) return;
        finished = true;
        removeRuntimeNode(script, code, src);
        reject(new Error('Tiempo de espera agotado al cargar ' + (name || src)));
      }, NETWORK_TIMEOUT);
      script.src = src;
      script.async = true;
      script.setAttribute('data-play-runtime', code);
      script.onload = function () {
        global.clearTimeout(timeout);
        if (finished) return;
        finished = true;
        if (expectContract && !contracts[code]) {
          removeRuntimeNode(script, code, src);
          reject(new Error(name + ' no se inicializó'));
          return;
        }
        loadedScripts[code + ':' + src] = script;
        if (expectContract) resolve(contracts[code]);
        else resolve(script);
      };
      script.onerror = function () {
        global.clearTimeout(timeout);
        if (finished) return;
        finished = true;
        removeRuntimeNode(script, code, src);
        reject(new Error('No se pudo cargar ' + (name || src)));
      };
      doc.head.appendChild(script);
    });
  }

  function loadDependencies(code, manifest) {
    var chain = global.Promise.resolve();
    (manifest.dependencies || []).forEach(function (src) {
      chain = chain.then(function () { return injectScript(src, code, false, src); });
    });
    return chain;
  }

  function registerGame(code, contract) {
    if (!code || !contract) return contract || null;
    contracts[code] = contract;
    return contract;
  }

  function loadGame(code, retry) {
    if (contracts[code]) return global.Promise.resolve(contracts[code]);
    if (loadPromises[code]) return loadPromises[code];
    loadPromises[code] = fetchManifest(code).then(function (manifest) {
      injectCss(code, manifest);
      return loadDependencies(code, manifest).then(function () {
        return injectScript(manifest.entry, code, true, manifest.name);
      });
    }).then(function (contract) {
      delete loadPromises[code];
      return contract;
    }).catch(function (error) {
      delete loadPromises[code];
      showError(error.message || 'No se pudo iniciar el juego.', retry || function () { return loadGame(code); });
      throw error;
    });
    return loadPromises[code];
  }

  function runtimeNodes() {
    if (!root) return [];
    return Array.prototype.slice.call(root.querySelectorAll('[data-play-runtime],[data-game-canvas]'));
  }

  function cleanupRuntime() {
    runtimeNodes().forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function hostContext(code) {
    return {
      root: function () { return root; },
      scene: function () { return activeScene; },
      notify: notify,
      showError: showError,
      goHub: goHub,
      goPlay: goPlay,
      warpTo: warpTo,
      loadState: function () { return readJson(STATE_PREFIX + code, {}); },
      saveState: function (value) { return writeJson(STATE_PREFIX + code, value); },
      submitResult: function (result) {
        var receipt = {
          id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
          game: code,
          at: new Date().toISOString(),
          result: result || {},
          local: true
        };
        var progress = global.OTRAVERSO && global.OTRAVERSO.PROGRESS;
        if (progress && typeof progress.addResult === 'function') {
          var enriched = {};
          var key;
          for (key in receipt.result) {
            if (Object.prototype.hasOwnProperty.call(receipt.result, key)) enriched[key] = receipt.result[key];
          }
          enriched.id = receipt.id;
          enriched.at = receipt.at;
          try {
            progress.addResult(code, enriched);
            return receipt;
          } catch (error) {}
        }
        var all = readJson(RESULT_KEY, []);
        all.push(receipt);
        if (all.length > 50) all = all.slice(-50);
        writeJson(RESULT_KEY, all);
        return receipt;
      }
    };
  }

  function hubContext() {
    return {
      root: root,
      notify: notify,
      showError: showError,
      startGame: startGame,
      goPlay: goPlay,
      discover: function (code, note) {
        var collectibles = global.OTRAVERSO && global.OTRAVERSO.COLLECTIBLES;
        if (collectibles && typeof collectibles.discover === 'function') {
          return collectibles.discover(code, note);
        }
        var progress = global.OTRAVERSO && global.OTRAVERSO.PROGRESS;
        if (progress && typeof progress.unlock === 'function') {
          var result = progress.unlock(code);
          notify((note ? note + ' · ' : '') + 'Descubrimiento registrado');
          return result;
        }
        notify((note ? note + ' · ' : '') + 'Descubrimiento registrado');
        return null;
      },
      getGames: function () {
        var published = [];
        var code;
        for (code in manifests) {
          if (!Object.prototype.hasOwnProperty.call(manifests, code)) continue;
          var manifest = manifests[code];
          if (!manifest || manifest.status !== 'published' || !manifest.route) continue;
          published.push({
            code: manifest.code,
            name: manifest.name,
            status: manifest.status,
            category: manifest.category,
            tagline: manifest.tagline || '',
            description: manifest.description || '',
            accent: manifest.accent || '#67e8f9',
            route: manifest.route,
            hub: manifest.hub || {}
          });
        }
        published.sort(function (a, b) {
          var orderA = a.hub && a.hub.order != null ? a.hub.order : 99;
          var orderB = b.hub && b.hub.order != null ? b.hub.order : 99;
          return orderA - orderB;
        });
        return published;
      },
      getProgress: function () {
        var progress = global.OTRAVERSO && global.OTRAVERSO.PROGRESS;
        return progress && typeof progress.get === 'function' ? progress.get() : null;
      }
    };
  }

  function mountHub() {
    var hub = global.OTRAVERSO && global.OTRAVERSO.HUB;
    if (!hub || !root || !root.querySelector('.play-hub')) return;
    hub.mount(root, hubContext());
  }

  function unmountHub() {
    var hub = global.OTRAVERSO && global.OTRAVERSO.HUB;
    if (hub && typeof hub.unmount === 'function') hub.unmount();
  }

  function setHubMode(mode) {
    var hub = global.OTRAVERSO && global.OTRAVERSO.HUB;
    if (hub && typeof hub.setMode === 'function') hub.setMode(mode);
  }

  function exploreUniverse() {
    if (activeScene !== 'play') {
      warpTo('/play', 'play', {});
      later(function () { setHubMode('explore'); }, 520);
      return;
    }
    setHubMode('explore');
  }

  function unloadGame() {
    if (!active) return;
    var contract = active.contract;
    try {
      if (typeof contract.stop === 'function') contract.stop();
    } catch (error) {
      showError('No se pudo detener el juego anterior.');
    }
    try {
      if (typeof contract.dispose === 'function') contract.dispose();
    } catch (error) {
      showError('No se pudo liberar el juego anterior.');
    }
    active = null;
    if (root) root.removeAttribute('data-active-game');
    cleanupRuntime();
  }

  function activateGame(code, options) {
    code = code || currentGame();
    activationToken += 1;
    var token = activationToken;
    unloadGame();
    return loadGame(code, function () { return activateGame(code, options); }).then(function (contract) {
      if (token !== activationToken) return contract;
      var context = hostContext(code);
      var host = root.querySelector('[data-game-host]') || root.querySelector('.universe-game-ui') || root;
      if (typeof contract.init === 'function') contract.init(context, options || {});
      if (typeof contract.mount === 'function') contract.mount(host);
      active = { code: code, contract: contract, host: host, context: context };
      if (root) root.setAttribute('data-active-game', code);
      if (typeof contract.start === 'function') contract.start(options || {});
      return contract;
    }).catch(function () {
      return null;
    });
  }

  function gameCodeFromRoute(path) {
    for (var code in manifests) {
      if (!Object.prototype.hasOwnProperty.call(manifests, code)) continue;
      var route = manifests[code] && manifests[code].route;
      if (route && path.indexOf(route) === 0) return code;
    }
    return null;
  }

  function isGamePath(path) {
    if (path.indexOf('/play/games/') === 0 || path.indexOf('/play/nexus-rush') === 0 || path.indexOf('/play/gravity') === 0) {
      return true;
    }
    return !!gameCodeFromRoute(path);
  }

  function sceneFromPath(path) {
    if (isGamePath(path)) return 'game';
    if (path.indexOf('/play') === 0) return 'play';
    return 'hub';
  }

  function gameFromPath(path) {
    var published = gameCodeFromRoute(path);
    if (published) return published;
    if (path.indexOf('/play/nexus-rush') === 0) return 'nexus-rush';
    if (path.indexOf('/play/gravity') === 0) return 'gravity';
    var matched = /^\/play\/games\/([^/]+)/.exec(path);
    return matched ? decodeURIComponent(matched[1]) : (root && root.getAttribute('data-game-code')) || 'nexus-rush';
  }

  function currentGame() {
    return (root && root.getAttribute('data-active-game')) || gameFromPath(global.location.pathname);
  }

  function currentCircuit() {
    var raw = parseInt(root && root.getAttribute('data-circuit'), 10);
    return clamp(isNaN(raw) ? 0 : raw, 0, 2);
  }

  function navigationState() {
    return {
      contract: NAV_CONTRACT,
      runtime: 'play',
      state: activeScene,
      scene: activeScene,
      previous: previousScene,
      game: activeGameCode,
      circuit: currentCircuit(),
      path: global.location.pathname
    };
  }

  function setScene(name, options) {
    options = options || {};
    if (!root) return;
    var previous = activeScene;
    if (previous !== name) previousScene = previous;
    activeScene = name;
    activeGameCode = name === 'game' ? (options.game || currentGame()) : null;
    root.setAttribute('data-scene', name);
    root.setAttribute('data-nav-state', name);
    if (options.circuit != null && name !== 'hub') root.setAttribute('data-circuit', String(options.circuit));
    if (options.game) root.setAttribute('data-game-code', options.game);
    doc.body.classList.toggle('in-game', name === 'game');
    root.dispatchEvent(new global.CustomEvent('otraverso:scene', {
      detail: { scene: name, options: options }
    }));
    if (global.CustomEvent && previous !== name) {
      global.dispatchEvent(new global.CustomEvent(NAV_EVENT, {
        detail: {
          runtime: 'play',
          contract: NAV_CONTRACT,
          state: name,
          previous: previous,
          game: activeGameCode,
          circuit: currentCircuit(),
          path: global.location.pathname
        }
      }));
    }
    if (name === 'game') {
      unmountHub();
      activateGame(options.game || currentGame(), options);
    } else {
      activationToken += 1;
      unloadGame();
      if (name === 'play') mountHub();
      else unmountHub();
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
      global.history.pushState({
        scene: scene || sceneFromPath(path),
        options: options || {}
      }, '', path);
      setScene(scene || sceneFromPath(path), options);
    }, 460);
    later(function () {
      root.classList.remove('is-warping');
      if (overlay) overlay.classList.remove('is-active');
    }, 880);
  }

  function startCircuit(index) {
    warpTo('/play/nexus-rush', 'game', {
      game: 'nexus-rush',
      circuit: clamp(index | 0, 0, 2)
    });
  }

  function startGame(code, options) {
    var manifest = getManifest(code);
    if (!manifest || manifest.status !== 'published' || !manifest.route) {
      showError('Juego no disponible.');
      return;
    }
    var settings = options || {};
    settings.game = code;
    warpTo(manifest.route, 'game', settings);
  }

  function goPlay() {
    if (global.location.pathname !== '/play') warpTo('/play', 'play');
    else setScene('play');
  }

  function goHub() {
    if (global.location.pathname !== '/') warpTo('/', 'hub', {}, true);
    else setScene('hub');
  }

  function bindLinks() {
    doc.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a[data-warp]');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      var url = new global.URL(link.href, global.location.href);
      if (url.origin !== global.location.origin) return;
      event.preventDefault();
      var external = url.pathname.indexOf('/play') !== 0;
      warpTo(url.pathname, sceneFromPath(url.pathname), {}, external);
    });
    global.addEventListener('popstate', function (event) {
      var state = event.state || {};
      setScene(state.scene || sceneFromPath(global.location.pathname), {
        game: gameFromPath(global.location.pathname),
        circuit: state.options && state.options.circuit != null
          ? state.options.circuit
          : currentCircuit()
      });
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

  function ensureGame() {
    return loadGame('nexus-rush', function () { return ensureGame(); }).then(function (contract) {
      return {
        contract: contract,
        start: function (index) { return activateGame('nexus-rush', { circuit: index }); },
        stop: unloadGame
      };
    });
  }

  function boot() {
    root = doc.querySelector('[data-universe-root]');
    if (!root) return;
    readRegistry();
    activeScene = root.getAttribute('data-scene') || sceneFromPath(global.location.pathname);
    root.classList.add('is-ready');
    if (global.OTRAVERSO && global.OTRAVERSO.GFX) root.setAttribute('data-gfx-mode', global.OTRAVERSO.GFX.mode());
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('is-reduced');
    }
    var badge = root.querySelector('[data-loader]');
    if (badge) later(function () { badge.hidden = true; }, 900);
    var errorRetry = root.querySelector('[data-error-retry]');
    if (errorRetry) errorRetry.addEventListener('click', function () {
      root.querySelector('[data-universe-error]').hidden = true;
    });
    bindLinks();
    bindPointer();
    setScene(activeScene, activeScene === 'game'
      ? { game: gameFromPath(global.location.pathname), circuit: currentCircuit() }
      : {});
  }

  var navigation = {
    contract: NAV_CONTRACT,
    event: NAV_EVENT,
    states: NAV_STATES.slice(),
    runtime: 'play',
    getState: navigationState
  };

  var play = {
    version: 'game-contract-1',
    contracts: contracts,
    manifests: manifests,
    register: registerGame,
    load: loadGame,
    activate: activateGame,
    unload: unloadGame,
    active: function () { return active; },
    manifest: getManifest,
    submitResult: function (code, result) { return hostContext(code).submitResult(result); }
  };

  var api = {
    version: play.version,
    PLAY: play,
    NAVIGATION: navigation,
    boot: boot,
    root: function () { return root; },
    scene: function () { return activeScene; },
    setScene: setScene,
    warpTo: warpTo,
    startCircuit: startCircuit,
    startGame: startGame,
    goHub: goHub,
    goPlay: goPlay,
    setHubMode: setHubMode,
    exploreUniverse: exploreUniverse,
    notify: notify,
    showError: showError,
    ensureGame: ensureGame,
    loadBest: loadBest,
    saveBest: saveBest,
    bestLabel: bestLabel,
    clamp: clamp,
    lerp: lerp
  };

  var namespace = global.OTRAVERSO || {};
  for (var key in api) {
    if (Object.prototype.hasOwnProperty.call(api, key)) namespace[key] = api[key];
  }
  global.OTRAVERSO = namespace;

  if (doc.readyState === 'complete') boot();
  else doc.addEventListener('DOMContentLoaded', boot);
})(window);
