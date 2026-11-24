(function (global) {
  'use strict';

  var doc = global.document;
  var SELF_KEY = 'otraverso.play.discoveries.v1';
  var GALAXY_KEY = 'otraverso.discoveries.v1';
  var PROFILE_KEY = 'otraverso.play.profile.v1';
  var KNOWN_NOTES = {
    'alien-ship': 'SEÑAL NO CATALOGADA · NAVE EXTRATERRESTRE DETECTADA',
    'universe-marble': 'ESFERA PRISMA · UNIVERSO INTERNO DETECTADO'
  };
  var DEFAULT_NOTE = 'Hallazgo registrado en el perfil PLAY';

  var context = null;
  var records = null;
  var rendered = [];
  var booted = false;

  function readJson(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) || fallback : fallback;
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

  function normalizeCode(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function recordFrom(code, value) {
    var note = '';
    var at = '';
    if (typeof value === 'string') note = value;
    else if (value && typeof value === 'object') {
      note = value.note || value.label || '';
      at = value.at || '';
    }
    return {
      code: code,
      found: true,
      note: note || KNOWN_NOTES[code] || DEFAULT_NOTE,
      at: at || nowIso()
    };
  }

  function normalizeRecords(raw) {
    var map = {};
    if (Array.isArray(raw)) {
      raw.forEach(function (item) {
        var code = normalizeCode(item && typeof item === 'object' ? item.code : item);
        if (!code || item && typeof item === 'object' && item.found === false) return;
        map[code] = recordFrom(code, item);
      });
    } else if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(function (key) {
        var value = raw[key];
        var code = normalizeCode(key);
        if (!code || value === false || !value) return;
        if (value && typeof value === 'object' && value.found === false) return;
        map[code] = recordFrom(code, value);
      });
    }
    return map;
  }

  function saveRecords() {
    var output = {};
    Object.keys(records || {}).forEach(function (code) {
      var item = records[code];
      output[code] = { found: true, note: item.note, at: item.at };
    });
    writeJson(SELF_KEY, output);
  }

  function saveGalaxy(code) {
    var galaxy = readJson(GALAXY_KEY, {});
    if (!galaxy || typeof galaxy !== 'object' || Array.isArray(galaxy)) galaxy = {};
    galaxy[code] = true;
    writeJson(GALAXY_KEY, galaxy);
  }

  function mergeGalaxy(write) {
    if (!records) return false;
    var galaxy = readJson(GALAXY_KEY, {});
    if (!galaxy || typeof galaxy !== 'object' || Array.isArray(galaxy)) return false;
    var changed = false;
    Object.keys(galaxy).forEach(function (key) {
      var value = galaxy[key];
      var code = normalizeCode(key);
      if (!code || !value) return;
      if (value && typeof value === 'object' && value.found === false) return;
      if (!records[code]) {
        records[code] = recordFrom(code, value);
        changed = true;
      } else if (value && typeof value === 'object' && value.note && !records[code].note) {
        records[code].note = String(value.note);
        changed = true;
      }
    });
    if (changed && write) saveRecords();
    return changed;
  }

  function mergeProgress(write) {
    if (!records) return false;
    var profile = readJson(PROFILE_KEY, null);
    if (!profile || typeof profile !== 'object' || !profile.collectibles) return false;
    var source = profile.collectibles;
    var changed = false;
    function add(code, value) {
      var key = normalizeCode(code);
      if (!key || records[key]) return;
      records[key] = recordFrom(key, value);
      changed = true;
    }
    if (Array.isArray(source)) {
      source.forEach(function (item) {
        add(item && typeof item === 'object' ? item.code : item, item);
      });
    } else {
      Object.keys(source).forEach(function (key) { add(key, source[key]); });
    }
    if (changed && write) saveRecords();
    return changed;
  }

  function loadRecords() {
    records = normalizeRecords(readJson(SELF_KEY, {}));
    mergeGalaxy(true);
    mergeProgress(true);
  }

  function ensureRecords() {
    if (!records) loadRecords();
    else {
      mergeGalaxy(true);
      mergeProgress(true);
    }
  }

  function findRoot() {
    if (!doc || !doc.querySelector) return null;
    return doc.querySelector('[data-play-profile]') || doc.querySelector('[data-universe-root]');
  }

  function defaultContext() {
    var api = global.OTRAVERSO;
    return {
      root: findRoot(),
      notify: api && api.notify,
      progress: api && api.PROGRESS
    };
  }

  function ensureContext() {
    if (!context) init(defaultContext());
  }

  function getProgress() {
    if (context && context.progress && typeof context.progress.unlock === 'function') return context.progress;
    var api = global.OTRAVERSO;
    if (api && api.PROGRESS && typeof api.PROGRESS.unlock === 'function') return api.PROGRESS;
    return null;
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

  function init(ctx) {
    ctx = ctx || defaultContext();
    context = ctx || {};
    loadRecords();
    render(context.root);
    return all();
  }

  function discover(code, note) {
    ensureContext();
    var key = normalizeCode(code);
    if (!key) return false;
    mergeGalaxy(true);
    if (records[key]) return false;
    var item = recordFrom(key, note || KNOWN_NOTES[key]);
    records[key] = item;
    saveRecords();
    saveGalaxy(key);
    notify('Descubrimiento registrado: ' + key);
    var progress = getProgress();
    if (progress) {
      try {
        progress.unlock(key);
      } catch (error) {
        return item;
      }
    }
    render(context.root);
    return item;
  }

  function found(code) {
    ensureRecords();
    var key = normalizeCode(code);
    return !!(key && records[key] && records[key].found);
  }

  function all() {
    ensureRecords();
    return Object.keys(records).sort().map(function (code) {
      return {
        code: code,
        found: !!records[code].found,
        note: records[code].note || ''
      };
    });
  }

  function attrNodes(node) {
    var list = [];
    if (node && node.getAttribute && node.hasAttribute && node.hasAttribute('data-profile-collectibles')) list.push(node);
    if (node && node.getAttribute && node.hasAttribute && node.hasAttribute('data-collectibles-list')) list.push(node);
    if (node && node.getAttribute && node.hasAttribute && node.hasAttribute('data-play-collectibles')) list.push(node);
    if (node && node.querySelectorAll) {
      list = list.concat(Array.prototype.slice.call(node.querySelectorAll('[data-profile-collectibles],[data-collectibles-list],[data-play-collectibles]')));
    }
    return list;
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
    ensureRecords();
    var rows = all();
    attrNodes(target).forEach(function (container) {
      while (container.firstChild) container.removeChild(container.firstChild);
      var tag = container.tagName && (container.tagName.toLowerCase() === 'ul' || container.tagName.toLowerCase() === 'ol') ? 'li' : 'div';
      rows.forEach(function (item) {
        var element = doc.createElement(tag);
        element.className = 'play-profile__item ' + (item.found ? 'is-unlocked' : 'is-locked');
        element.setAttribute('data-code', item.code);
        element.textContent = item.code + ' · ' + (item.found ? 'Encontrado' : 'Pendiente') + (item.note ? ' · ' + item.note : '');
        container.appendChild(element);
      });
    });
    remember(target);
  }

  function boot() {
    if (booted) return;
    booted = true;
    var root = doc && doc.querySelector ? doc.querySelector('[data-play-profile]') : null;
    if (!root) return;
    var api = global.OTRAVERSO;
    init({ root: root, notify: api && api.notify, progress: api && api.PROGRESS });
  }

  var collectiblesApi = {
    init: init,
    discover: discover,
    found: found,
    all: all,
    render: render
  };

  var store = global.OTRAVERSO && typeof global.OTRAVERSO === 'object' ? global.OTRAVERSO : {};

  function attach(target, previous) {
    if (!target || typeof target !== 'object') return;
    var source = previous || store;
    if (!target.PROGRESS && source && source.PROGRESS) target.PROGRESS = source.PROGRESS;
    if (!target.COLLECTIBLES && source && source.COLLECTIBLES) target.COLLECTIBLES = source.COLLECTIBLES;
    if (!target.COLLECTIBLES) target.COLLECTIBLES = collectiblesApi;
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
