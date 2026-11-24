(function (global) {
  'use strict';

  var doc = global.document;
  var ID_KEY = 'otraverso.play.id.v1';
  var PROFILE_KEY = 'otraverso.play.profile.v1';
  var RESULTS_KEY = 'otraverso.play.results.v1';
  var ID_RE = /^PLAY-[0-9A-Z]{4,32}$/;
  var WIN_BONUS = 100;
  var DISCOVERY_XP = 25;
  var MAX_RESULTS = 50;
  var ACHIEVEMENTS = [
    { code: 'first_game', label: 'Primer juego' },
    { code: 'score_1000', label: 'Mil puntos' },
    { code: 'gravity_clear', label: 'Gravedad superada' },
    { code: 'explorer_5', label: 'Cinco hallazgos' },
    { code: 'collector_10', label: 'Diez coleccionables' }
  ];
  var ACHIEVEMENT_LABELS = {};
  ACHIEVEMENTS.forEach(function (item) { ACHIEVEMENT_LABELS[item.code] = item.label; });

  var context = null;
  var profile = null;
  var rendered = [];
  var booted = false;

  function readRaw(key) {
    try {
      return global.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      global.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function readJson(key, fallback) {
    var raw = readRaw(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      return writeRaw(key, JSON.stringify(value));
    } catch (error) {
      return false;
    }
  }

  function toNumber(value) {
    var number = parseFloat(value);
    return isNaN(number) || !isFinite(number) ? 0 : number;
  }

  function round1(value) {
    return Math.round(toNumber(value) * 10) / 10;
  }

  function normalizeCode(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function levelFor(xp) {
    return Math.floor(Math.max(0, toNumber(xp)) / 500) + 1;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function randomSuffix() {
    return Math.random().toString(36).slice(2, 10);
  }

  function validId(value) {
    var text = String(value == null ? '' : value).trim().toUpperCase();
    return ID_RE.test(text) ? text : '';
  }

  function createId() {
    return 'PLAY-' + (Date.now().toString(36) + randomSuffix()).toUpperCase();
  }

  function saveProfile() {
    if (!profile) return;
    profile.level = levelFor(profile.xp);
    profile.updated_at = nowIso();
    writeJson(PROFILE_KEY, profile);
  }

  function id() {
    var player = validId(readRaw(ID_KEY));
    if (!player) {
      player = createId();
      writeRaw(ID_KEY, player);
    }
    if (profile && profile.player_id !== player) {
      profile.player_id = player;
      saveProfile();
    }
    return player;
  }

  function normalizeMap(raw) {
    var map = {};
    if (Array.isArray(raw)) {
      raw.forEach(function (item) {
        var value = typeof item === 'string' ? item : (item && (item.code || item.id));
        var code = normalizeCode(value);
        if (!code) return;
        map[code] = item && typeof item === 'object' && item.at ? String(item.at) : nowIso();
      });
    } else if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(function (key) {
        var code = normalizeCode(key);
        if (!code) return;
        var value = raw[key];
        map[code] = value && typeof value === 'object' && value.at ? String(value.at) : (value ? String(value) : nowIso());
      });
    }
    return map;
  }

  function normalizeProfile(raw, player) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var games = [];
    var gameSource = source.games;
    if (Array.isArray(gameSource)) {
      gameSource.forEach(function (item) {
        var code = normalizeCode(item && typeof item === 'object' ? item.code : item);
        if (code && games.indexOf(code) < 0) games.push(code);
      });
    } else if (gameSource && typeof gameSource === 'object') {
      Object.keys(gameSource).forEach(function (key) {
        var code = normalizeCode(key);
        if (code && games.indexOf(code) < 0) games.push(code);
      });
    }
    return {
      player_id: player,
      xp: round1(source.xp),
      level: levelFor(source.xp),
      games: games,
      wins: Math.max(0, Math.floor(toNumber(source.wins))),
      total_score: Math.max(0, Math.floor(toNumber(source.total_score != null ? source.total_score : source.score_total))),
      achievements: normalizeMap(source.achievements),
      collectibles: normalizeMap(source.collectibles),
      updated_at: source.updated_at || ''
    };
  }

  function currentProfile() {
    var player = id();
    if (!profile || profile.player_id !== player) profile = normalizeProfile(readJson(PROFILE_KEY, null), player);
    return profile;
  }

  function copyMap(map) {
    var copy = {};
    Object.keys(map || {}).forEach(function (key) { copy[key] = map[key]; });
    return copy;
  }

  function loadResults() {
    var all = readJson(RESULTS_KEY, []);
    return Array.isArray(all) ? all.slice(-MAX_RESULTS) : [];
  }

  function writeResults(all) {
    return writeJson(RESULTS_KEY, (Array.isArray(all) ? all : []).slice(-MAX_RESULTS));
  }

  function collectibleCodes() {
    var codes = [];
    var p = currentProfile();
    Object.keys(p.collectibles).forEach(function (code) {
      if (codes.indexOf(code) < 0) codes.push(code);
    });
    var collectibles = global.OTRAVERSO && global.OTRAVERSO.COLLECTIBLES;
    if (collectibles && typeof collectibles.all === 'function') {
      collectibles.all().forEach(function (item) {
        if (item && item.code && codes.indexOf(item.code) < 0) codes.push(item.code);
      });
    }
    return codes;
  }

  function collectibleRecords() {
    var map = {};
    var p = currentProfile();
    Object.keys(p.collectibles).forEach(function (code) {
      map[code] = { code: code, found: true, note: '', at: p.collectibles[code] };
    });
    var collectibles = global.OTRAVERSO && global.OTRAVERSO.COLLECTIBLES;
    if (collectibles && typeof collectibles.all === 'function') {
      collectibles.all().forEach(function (item) {
        if (!item || !item.code) return;
        if (!map[item.code]) map[item.code] = item;
        else if (item.note && !map[item.code].note) map[item.code].note = item.note;
      });
    }
    return Object.keys(map).sort().map(function (code) { return map[code]; });
  }

  function get() {
    var p = currentProfile();
    return {
      player_id: p.player_id,
      id: p.player_id,
      xp: p.xp,
      level: p.level,
      games: p.games.slice(),
      wins: p.wins,
      total_score: p.total_score,
      achievements: copyMap(p.achievements),
      collectibles: collectibleCodes(),
      results: loadResults(),
      updated_at: p.updated_at
    };
  }

  function notify(message) {
    var api = global.OTRAVERSO;
    var fn = context && typeof context.notify === 'function' ? context.notify : (api && typeof api.notify === 'function' ? api.notify : null);
    if (!fn) return;
    try {
      fn(message);
    } catch (error) {
      return;
    }
  }

  function notifyAchievements(codes) {
    if (!codes || !codes.length) return;
    var labels = codes.map(function (code) { return ACHIEVEMENT_LABELS[code] || code; });
    notify('Logro desbloqueado: ' + labels.join(', '));
  }

  function getCsrf() {
    if (context && context.csrf != null) return String(context.csrf);
    var root = context && context.root;
    return root && root.getAttribute ? (root.getAttribute('data-play-csrf') || '') : '';
  }

  function post(path, params) {
    if (typeof global.fetch !== 'function') return false;
    try {
      var body = null;
      var text = '';
      if (typeof global.URLSearchParams === 'function') {
        body = new global.URLSearchParams();
        Object.keys(params).forEach(function (key) {
          body.append(key, params[key] == null ? '' : String(params[key]));
        });
        text = body.toString();
      } else {
        text = Object.keys(params).map(function (key) {
          return encodeURIComponent(key) + '=' + encodeURIComponent(params[key] == null ? '' : String(params[key]));
        }).join('&');
      }
      global.fetch(path, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: text,
        credentials: 'same-origin'
      }).catch(function () {});
      return true;
    } catch (error) {
      return false;
    }
  }

  function safeJson(value) {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value == null ? {} : value) || '{}';
    } catch (error) {
      return '{}';
    }
  }

  function unwrapResult(value) {
    if (!value || typeof value !== 'object') return {};
    if (!value.result || typeof value.result !== 'object') return value;
    var merged = {};
    Object.keys(value.result).forEach(function (key) { merged[key] = value.result[key]; });
    if (merged.at == null && value.at != null) merged.at = value.at;
    if (merged.id == null && value.id != null) merged.id = value.id;
    return merged;
  }

  function isWin(game, payload) {
    if (payload.success === true || payload.won === true || payload.victory === true || payload.cleared === true || payload.completed === true) return true;
    if (payload.success === false || payload.won === false || payload.victory === false || payload.cleared === false || payload.completed === false) return false;
    return game === 'gravity';
  }

  function markAchievement(code, target, at, unlocked) {
    var key = normalizeCode(code);
    if (!key || target.achievements[key]) return false;
    target.achievements[key] = at || nowIso();
    if (unlocked && ACHIEVEMENT_LABELS[key] && unlocked.indexOf(key) < 0) unlocked.push(key);
    return true;
  }

  function syncCountAchievements(target, unlocked, at) {
    var discoveries = collectibleCodes().filter(function (code) { return !ACHIEVEMENT_LABELS[code]; });
    if (discoveries.length >= 5) markAchievement('explorer_5', target, at, unlocked);
    if (discoveries.length >= 10) markAchievement('collector_10', target, at, unlocked);
  }

  function findRoot() {
    if (!doc || !doc.querySelector) return null;
    return doc.querySelector('[data-play-profile]') || doc.querySelector('[data-universe-root]');
  }

  function defaultContext() {
    var api = global.OTRAVERSO;
    var root = findRoot();
    return {
      root: root,
      csrf: root && root.getAttribute ? (root.getAttribute('data-play-csrf') || '') : '',
      notify: api && api.notify,
      api: api
    };
  }

  function ensureContext() {
    if (!context) init(defaultContext());
  }

  function init(ctx) {
    ctx = ctx || defaultContext();
    context = ctx || {};
    if (context.csrf == null && context.root && context.root.getAttribute) {
      context.csrf = context.root.getAttribute('data-play-csrf') || '';
    }
    if (!context.api) context.api = global.OTRAVERSO;
    id();
    render(context.root);
    return get();
  }

  function addResult(game, result) {
    ensureContext();
    var target = currentProfile();
    var payload = unwrapResult(result);
    var code = normalizeCode(game || payload.game) || 'desconocido';
    var score = Math.max(0, toNumber(payload.score != null ? payload.score : payload.points));
    var durationMs = Math.max(0, toNumber(payload.durationMs != null ? payload.durationMs : (payload.duration_ms != null ? payload.duration_ms : payload.duration)));
    var stats = payload.stats && typeof payload.stats === 'object' ? payload.stats : {};
    var at = payload.at || nowIso();
    var win = isWin(code, payload);
    var receiptId = payload.id || (Date.now() + '-' + randomSuffix());
    var all = loadResults();
    var i;
    for (i = 0; i < all.length; i++) {
      if (all[i] && all[i].id === receiptId) return all[i];
    }
    var receipt = {
      id: receiptId,
      game: code,
      at: at,
      result: {
        game: code,
        version: payload.version || '',
        score: Math.round(score),
        durationMs: Math.round(durationMs),
        duration_ms: Math.round(durationMs),
        success: win,
        stats: stats
      },
      local: true
    };
    if (payload.circuit != null) receipt.result.circuit = payload.circuit;
    if (payload.circuitName != null) receipt.result.circuitName = payload.circuitName;
    target.xp = round1(target.xp + round1(score / 10) + (win ? WIN_BONUS : 0));
    target.total_score = toNumber(target.total_score) + Math.round(score);
    if (win) target.wins += 1;
    if (target.games.indexOf(code) < 0) target.games.push(code);
    var unlocked = [];
    markAchievement('first_game', target, at, unlocked);
    if (score >= 1000 || target.total_score >= 1000) markAchievement('score_1000', target, at, unlocked);
    if (code === 'gravity' && win) markAchievement('gravity_clear', target, at, unlocked);
    syncCountAchievements(target, unlocked, at);
    saveProfile();
    all.unshift(receipt);
    writeResults(all);
    post('/api/play/v1/progress/results', {
      csrf: getCsrf(),
      player_id: id(),
      game: code,
      score: Math.round(score),
      duration_ms: Math.round(durationMs),
      stats: safeJson(stats),
      at: at
    });
    notifyAchievements(unlocked);
    renderAll();
    return receipt;
  }

  function unlock(code) {
    ensureContext();
    var target = currentProfile();
    var key = normalizeCode(code);
    if (!key) return null;
    var at = nowIso();
    var unlocked = [];
    var isAchievement = !!ACHIEVEMENT_LABELS[key];
    if (isAchievement) markAchievement(key, target, at, unlocked);
    var isNew = !target.collectibles[key];
    var gain = isNew && !isAchievement ? DISCOVERY_XP : 0;
    if (isNew) {
      target.collectibles[key] = at;
      target.xp = round1(target.xp + gain);
    }
    syncCountAchievements(target, unlocked, at);
    saveProfile();
    if (isNew) {
      post('/api/play/v1/progress/collectibles', {
        csrf: getCsrf(),
        player_id: id(),
        code: key,
        at: at
      });
    }
    notifyAchievements(unlocked);
    renderAll();
    return { code: key, found: true, at: at, xp: gain, achievement: isAchievement };
  }

  function formatNumber(value) {
    try {
      return toNumber(value).toLocaleString('es-CO');
    } catch (error) {
      return String(value);
    }
  }

  function formatDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    try {
      return date.toLocaleDateString('es-CO');
    } catch (error) {
      return date.toISOString().slice(0, 10);
    }
  }

  function attrNodes(node, suffix) {
    var attribute = 'data-profile-' + suffix;
    var list = [];
    if (node && node.getAttribute && node.hasAttribute && node.hasAttribute(attribute)) list.push(node);
    if (node && node.querySelectorAll) {
      list = list.concat(Array.prototype.slice.call(node.querySelectorAll('[' + attribute + ']')));
    }
    return list;
  }

  function fillText(target, suffix, value) {
    attrNodes(target, suffix).forEach(function (node) { node.textContent = value; });
  }

  function fillList(target, suffix, items) {
    attrNodes(target, suffix).forEach(function (node) {
      while (node.firstChild) node.removeChild(node.firstChild);
      var tag = node.tagName && (node.tagName.toLowerCase() === 'ul' || node.tagName.toLowerCase() === 'ol') ? 'li' : 'div';
      items.forEach(function (item) {
        var element = doc.createElement(tag);
        element.className = item.className || ('play-profile__item ' + (item.found ? 'is-unlocked' : 'is-locked'));
        if (item.code) element.setAttribute('data-code', item.code);
        element.textContent = item.text;
        node.appendChild(element);
      });
    });
  }

  function achievementRows() {
    var p = currentProfile();
    return ACHIEVEMENTS.map(function (item) {
      var found = !!p.achievements[item.code];
      return {
        code: item.code,
        found: found,
        text: item.label + ' · ' + (found ? 'Desbloqueado' : 'Bloqueado')
      };
    });
  }

  function collectibleRows() {
    return collectibleRecords().map(function (item) {
      return {
        code: item.code,
        found: !!item.found,
        text: item.code + ' · ' + (item.found ? 'Encontrado' : 'Pendiente') + (item.note ? ' · ' + item.note : '')
      };
    });
  }

  function resultRows() {
    return loadResults().slice(-6).reverse().map(function (receipt) {
      var result = receipt.result && typeof receipt.result === 'object' ? receipt.result : {};
      var game = receipt.game || result.game || 'juego';
      return {
        code: game,
        found: true,
        className: 'play-profile__item play-profile__item--result',
        text: game + ' · ' + formatNumber(result.score) + ' pts · ' + formatDate(receipt.at)
      };
    });
  }

  function remember(node) {
    if (!node) return;
    for (var i = 0; i < rendered.length; i++) {
      if (rendered[i] === node) return;
    }
    rendered.push(node);
  }

  function render(node) {
    var target = node || (context && context.root) || findRoot();
    if (!target || !doc || !target.querySelectorAll) return;
    var p = currentProfile();
    fillText(target, 'id', p.player_id);
    fillText(target, 'level', String(p.level));
    fillText(target, 'xp', formatNumber(p.xp) + ' XP');
    fillList(target, 'achievements', achievementRows());
    fillList(target, 'collectibles', collectibleRows());
    fillList(target, 'results', resultRows());
    remember(target);
  }

  function renderAll() {
    rendered.slice().forEach(function (node) {
      try {
        render(node);
      } catch (error) {
        return;
      }
    });
  }

  function mergeMap(target, raw) {
    var incoming = normalizeMap(raw);
    Object.keys(incoming).forEach(function (key) {
      if (!target[key]) target[key] = incoming[key];
    });
  }

  function mergeGames(target, raw) {
    var list = [];
    if (Array.isArray(raw)) {
      raw.forEach(function (item) {
        var code = normalizeCode(item && typeof item === 'object' ? item.code : item);
        if (code) list.push(code);
      });
    } else if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(function (key) {
        var code = normalizeCode(key);
        if (code) list.push(code);
      });
    }
    list.forEach(function (code) {
      if (target.indexOf(code) < 0) target.push(code);
    });
  }

  function normalizeReceipt(item) {
    if (!item || typeof item !== 'object') return null;
    var source = item.result && typeof item.result === 'object' ? item.result : item;
    var code = normalizeCode(source.game || item.game);
    if (!code) return null;
    var at = item.at || source.at || nowIso();
    var score = toNumber(source.score != null ? source.score : item.score);
    var durationMs = toNumber(source.durationMs != null ? source.durationMs : (source.duration_ms != null ? source.duration_ms : item.duration_ms));
    return {
      id: item.id || source.id || (at + '-' + code + '-' + randomSuffix()),
      game: code,
      at: at,
      result: {
        game: code,
        score: Math.round(score),
        durationMs: Math.round(durationMs),
        duration_ms: Math.round(durationMs),
        stats: source.stats || item.stats || {}
      },
      local: false
    };
  }

  function mergeResults(all, raw) {
    if (!Array.isArray(raw)) return;
    raw.forEach(function (item) {
      var receipt = normalizeReceipt(item);
      if (!receipt) return;
      var exists = false;
      for (var i = 0; i < all.length; i++) {
        if (all[i] && all[i].id === receipt.id) {
          exists = true;
          break;
        }
      }
      if (!exists) all.unshift(receipt);
    });
  }

  function mergeRemote(payload) {
    if (!payload || typeof payload !== 'object') return;
    var p = currentProfile();
    var remote = payload.profile && typeof payload.profile === 'object' ? payload.profile : {};
    p.xp = Math.max(p.xp, round1(remote.xp));
    p.wins = Math.max(p.wins, Math.floor(toNumber(remote.wins)));
    p.total_score = Math.max(toNumber(p.total_score), Math.floor(toNumber(remote.total_score != null ? remote.total_score : remote.score_total)));
    mergeGames(p.games, remote.games || payload.games);
    mergeMap(p.achievements, payload.achievements || remote.achievements);
    mergeMap(p.collectibles, payload.collectibles || remote.collectibles);
    var unlocked = [];
    syncCountAchievements(p, unlocked, nowIso());
    saveProfile();
    var all = loadResults();
    mergeResults(all, payload.results || remote.results);
    writeResults(all);
    notifyAchievements(unlocked);
  }

  function resolved(value) {
    if (global.Promise && typeof global.Promise.resolve === 'function') return global.Promise.resolve(value);
    return {
      then: function (fn) {
        fn(value);
        return this;
      },
      catch: function () {
        return this;
      }
    };
  }

  function sync() {
    ensureContext();
    if (typeof global.fetch !== 'function') return resolved(get());
    var url = '/api/play/v1/progress?player_id=' + encodeURIComponent(id());
    try {
      return global.fetch(url, {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
      }).then(function (response) {
        if (!response || response.ok === false) return null;
        return response.json();
      }).then(function (payload) {
        if (!payload) return get();
        mergeRemote(payload);
        renderAll();
        return get();
      }).catch(function () {
        return get();
      });
    } catch (error) {
      return resolved(get());
    }
  }

  function boot() {
    if (booted) return;
    booted = true;
    var root = doc && doc.querySelector ? doc.querySelector('[data-play-profile]') : null;
    if (!root) return;
    var api = global.OTRAVERSO;
    init({ root: root, csrf: root.getAttribute('data-play-csrf'), notify: api && api.notify, api: api });
    sync();
  }

  var progressApi = {
    init: init,
    id: id,
    get: get,
    addResult: addResult,
    unlock: unlock,
    render: render,
    sync: sync
  };

  var store = global.OTRAVERSO && typeof global.OTRAVERSO === 'object' ? global.OTRAVERSO : {};

  function attach(target, previous) {
    if (!target || typeof target !== 'object') return;
    var source = previous || store;
    if (!target.PROGRESS && source && source.PROGRESS) target.PROGRESS = source.PROGRESS;
    if (!target.COLLECTIBLES && source && source.COLLECTIBLES) target.COLLECTIBLES = source.COLLECTIBLES;
    if (!target.PROGRESS) target.PROGRESS = progressApi;
  }

  attach(store);
  try {
    Object.defineProperty(global, 'OTRAVERSO', {
      configurable: true,
      enumerable: true,
      get: function () {
        attach(store);
        return store;
      },
      set: function (value) {
        var previous = store;
        store = value && typeof value === 'object' ? value : {};
        attach(store, previous);
      }
    });
  } catch (error) {
    global.OTRAVERSO = store;
  }

  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(window);
