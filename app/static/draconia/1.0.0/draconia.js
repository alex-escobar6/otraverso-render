(function (global) {
  'use strict';

  var doc = global.document;
  var DEFAULT_API = '/draconia/api/v1';
  var DEFAULT_ASSET_BASE = '/static/draconia/1.0.0/';
  var DEFAULT_MODEL_CONFIG = {
    path: 'assets/dragon_organic/dragon.glb',
    static: true,
    transform: { scale: 0.38, position: [0, 0.04, 0], rotation: [0, 0, 0] },
    initialClip: '',
    fallbackClip: '',
    clips: {},
    clipSpeeds: {},
    eyeMaterial: '',
    shadow: {},
    materials: {}
  };
  var configNode = doc.getElementById('draconia-config');
  var rawConfig = {};
  if (configNode) {
    try {
      var parsed = JSON.parse(configNode.textContent || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) rawConfig = parsed;
    } catch (error) {
      rawConfig = {};
    }
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function firstDefined() {
    for (var i = 0; i < arguments.length; i += 1) {
      if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
    }
    return undefined;
  }

  function asString(value, fallback, max) {
    var text = String(firstDefined(value, '')).trim();
    return text ? text.slice(0, max || 2000) : fallback;
  }

  function asBool(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      var text = value.trim().toLowerCase();
      if (text === '1' || text === 'true' || text === 'yes' || text === 'on') return true;
      if (text === '0' || text === 'false' || text === 'no' || text === 'off' || text === '') return false;
    }
    return fallback;
  }

  function asList(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function asVector(value, fallback) {
    var list = asList(value);
    if (list.length !== 3) return fallback.slice();
    for (var i = 0; i < list.length; i += 1) {
      if (typeof list[i] !== 'number' || !isFinite(list[i])) return fallback.slice();
    }
    return list;
  }

  function normalizeModelConfig(value) {
    var source = isObject(value) ? value : {};
    var transform = isObject(source.transform) ? source.transform : {};
    return {
      path: asString(source.path, DEFAULT_MODEL_CONFIG.path, 300),
      static: asBool(source.static, DEFAULT_MODEL_CONFIG.static),
      name: asString(source.name, '', 120),
      license: asString(source.license, '', 80),
      transform: {
        scale: typeof transform.scale === 'number' && isFinite(transform.scale)
          ? transform.scale : DEFAULT_MODEL_CONFIG.transform.scale,
        position: asVector(transform.position, DEFAULT_MODEL_CONFIG.transform.position),
        rotation: asVector(transform.rotation, DEFAULT_MODEL_CONFIG.transform.rotation)
      },
      initialClip: asString(source.initialClip, DEFAULT_MODEL_CONFIG.initialClip, 80),
      fallbackClip: asString(source.fallbackClip, DEFAULT_MODEL_CONFIG.fallbackClip, 80),
      clips: isObject(source.clips) ? source.clips : {},
      clipSpeeds: isObject(source.clipSpeeds) ? source.clipSpeeds : {},
      eyeMaterial: asString(source.eyeMaterial, DEFAULT_MODEL_CONFIG.eyeMaterial, 80),
      shadow: isObject(source.shadow) ? source.shadow : {},
      materials: isObject(source.materials) ? source.materials : {}
    };
  }

  function normalizeConfig(value) {
    var source = isObject(value) ? value : {};
    var legacy = isObject(source.state) ? source.state : {};
    var profileRaw = isObject(source.profile) ? source.profile
      : (isObject(legacy.profile) ? legacy.profile : legacy);
    var capabilitiesRaw = isObject(source.capabilities) ? source.capabilities : {};
    var states = asList(firstDefined(capabilitiesRaw.states, source.states));
    var assetBase = isObject(source.assets)
      ? asString(source.assets.base, DEFAULT_ASSET_BASE, 200)
      : asString(source.assets, DEFAULT_ASSET_BASE, 200);
    var assetDragon = isObject(source.assets)
      ? asString(source.assets.dragon, assetBase + DEFAULT_MODEL_CONFIG.path, 300)
      : assetBase + DEFAULT_MODEL_CONFIG.path;
    var lastState = asString(firstDefined(profileRaw.last_state, legacy.last_state), 'idle', 40);
    if (states.length && states.indexOf(lastState) < 0) lastState = 'idle';
    var profile = {
      dragon_name: asString(firstDefined(profileRaw.dragon_name, profileRaw.name, legacy.dragon_name), 'Luma', 40),
      sound: asBool(firstDefined(profileRaw.sound, profileRaw.music, legacy.sound, legacy.music, source.sound), true),
      reduced_motion: asBool(firstDefined(profileRaw.reduced_motion, legacy.reduced_motion, source.reduced_motion), false),
      last_state: lastState
    };
    return {
      version: firstDefined(source.version, 2),
      api: asString(source.api, DEFAULT_API, 200),
      csrf: asString(source.csrf, '', 500),
      user: isObject(source.user) ? source.user : {},
      profile: profile,
      assets: {
        base: assetBase,
        dragon: assetDragon,
        model: normalizeModelConfig(source.assets && source.assets.model)
      },
      capabilities: {
        renderer: asString(capabilitiesRaw.renderer, 'three', 40),
        animations: asList(firstDefined(capabilitiesRaw.animations, source.animations)),
        states: states,
        transitions: isObject(capabilitiesRaw.transitions) ? capabilitiesRaw.transitions : null,
        last_state: lastState,
        reduced_motion: profile.reduced_motion
      }
    };
  }

  var config = normalizeConfig(rawConfig);
  var stage = doc.getElementById('draconia-stage');
  var status = doc.getElementById('draconia-status');
  var loading = doc.getElementById('draconia-loading');
  var heading = doc.getElementById('draconia-companion-name') || doc.querySelector('.draconia-panel h2');
  var nameSummary = doc.getElementById('draconia-name-summary');
  var nameInput = doc.getElementById('draconia-name');
  var nameForm = doc.getElementById('draconia-name-form');
  var soundButton = doc.querySelector('[data-action="sound"]');
  var motionButton = doc.querySelector('[data-action="motion"]');
  var sound = config.profile.sound;
  var reduced = config.profile.reduced_motion;
  var audio = null;
  var manualUntil = 0;
  var stateTimer = null;
  var petCount = 0;
  var userEdited = false;
  var pendingState = null;

  var messages = {
    pet: [
      'El dragón se inclina hacia tu mano y cierra los ojos un momento.',
      'Responde con un pequeño ronroneo y mueve la cola.',
      'Se hunde un poco en la hierba y disfruta la caricia.'
    ],
    call: 'Escucha tu voz, levanta la cabeza y viene a tu encuentro.',
    play: 'La esfera baila entre los dos. El dragón salta curioso.',
    sit: 'Se sienta a tu lado con la cola enrollada.',
    sleep: 'Se acuesta, baja las alas y se queda dormido.',
    fly: 'Da dos saltos, aletea y se eleva unos instantes.'
  };

  var stateMessages = {
    idle: 'El dragón respira tranquilo y te mira de reojo.',
    curious: 'Inclina la cabeza: algo ha despertado su curiosidad.',
    happy: 'Sus ojos brillan y la cola se mueve sin parar.',
    playing: 'Está concentrado en la esfera mágica.',
    walking: 'Camina contigo por el jardín.',
    running: 'Corre en círculos, muy contento.',
    resting: 'Descansa sentado junto a ti.',
    sleeping: 'Duerme. Su respiración es lentísima.',
    flying: 'Vuela bajo sobre el jardín.',
    interacting: 'Te observa esperando otra caricia.'
  };

  function say(text, hold) {
    if (!status) return;
    status.textContent = text;
    manualUntil = Date.now() + (hold || 3200);
  }

  function hideLoading() {
    if (!loading || loading.hidden) return;
    loading.classList.add('is-hidden');
    global.setTimeout(function () { loading.hidden = true; }, 420);
  }

  doc.addEventListener('draconia:ready', hideLoading);
  global.setTimeout(hideLoading, 3500);

  function request(path, fields, method) {
    if (!global.fetch) return Promise.resolve(null);
    var params = new global.URLSearchParams();
    Object.keys(fields || {}).forEach(function (key) { params.append(key, fields[key]); });
    var useGet = String(method || 'POST').toUpperCase() === 'GET';
    var url = config.api + path + (useGet && params.toString() ? '?' + params.toString() : '');
    var options = { method: useGet ? 'GET' : 'POST', credentials: 'same-origin' };
    if (!useGet) {
      options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      options.body = params.toString();
    }
    return global.fetch(url, options).then(function (response) {
      if (!response.ok) throw new Error('request_failed');
      return response.json();
    }).catch(function () { return null; });
  }

  function send(path, fields) {
    return request(path, fields, 'POST');
  }

  function savePrefs() {
    send('/preferences', { csrf: config.csrf, sound: sound ? '1' : '0', reduced_motion: reduced ? '1' : '0' });
  }

  function saveState(state) {
    pendingState = state;
    if (stateTimer) global.clearTimeout(stateTimer);
    stateTimer = global.setTimeout(function () {
      var value = pendingState;
      pendingState = null;
      send('/state', { csrf: config.csrf, state: value });
    }, 900);
  }

  global.addEventListener('pagehide', function () {
    if (!pendingState) return;
    send('/state', { csrf: config.csrf, state: pendingState });
    pendingState = null;
  });

  function applyProfile(value) {
    var normalized = normalizeConfig({ profile: value }).profile;
    config.profile.dragon_name = normalized.dragon_name;
    config.profile.sound = normalized.sound;
    config.profile.reduced_motion = normalized.reduced_motion;
    config.profile.last_state = normalized.last_state;
    config.capabilities.reduced_motion = normalized.reduced_motion;
    sound = normalized.sound;
    reduced = normalized.reduced_motion;
    if (nameInput) nameInput.value = normalized.dragon_name;
    if (heading) heading.textContent = normalized.dragon_name;
    if (nameSummary) nameSummary.textContent = normalized.dragon_name;
    syncButtons();
    if (world && world.setReducedMotion) world.setReducedMotion(reduced);
    if (status && !status.textContent) {
      status.textContent = normalized.dragon_name + ' te está mirando.';
    }
  }

  function loadRemotePreferences() {
    return request('/state', null, 'GET').then(function (payload) {
      if (userEdited || !payload || !payload.ok || !isObject(payload.profile)) return;
      applyProfile(payload.profile);
    });
  }

  function tone(frequencies) {
    if (!sound) return;
    try {
      var Context = global.AudioContext || global.webkitAudioContext;
      if (!Context) return;
      if (!audio) audio = new Context();
      if (audio.state === 'suspended') {
        var resumed = audio.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(function () {});
      }
      frequencies.forEach(function (frequency, index) {
        var oscillator = audio.createOscillator();
        var gain = audio.createGain();
        var start = audio.currentTime + index * 0.09;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.26);
      });
    } catch (error) {
      audio = null;
    }
  }

  function setButtonLabel(button, text) {
    if (!button) return;
    var label = button.querySelector('.draconia-control-label');
    if (label) label.textContent = text; else button.textContent = text;
  }

  function syncButtons() {
    if (soundButton) {
      soundButton.setAttribute('aria-pressed', sound ? 'true' : 'false');
      setButtonLabel(soundButton, sound ? 'Sonido' : 'Sin sonido');
    }
    if (motionButton) {
      motionButton.setAttribute('aria-pressed', reduced ? 'true' : 'false');
      setButtonLabel(motionButton, reduced ? 'Movimiento suave' : 'Movimiento');
    }
  }

  var world = { setAction: function () {}, setReducedMotion: function () {} };
  if (stage && global.DRACONIA_WORLD && global.DRACONIA_WORLD.create) {
    world = global.DRACONIA_WORLD.create(config, stage, {
      onState: function (state) {
        if (Date.now() > manualUntil && stateMessages[state]) say(stateMessages[state], 1200);
        saveState(state);
      },
      onPet: function () {
        petCount += 1;
        var options = messages.pet;
        say(options[petCount % options.length], 3600);
        tone([523.25, 659.25]);
        world.setAction('pet');
      }
    });
  }

  function runAction(name) {
    if (name === 'camera') {
      if (world.focus) world.focus();
      say('Cámara centrada en ' + config.profile.dragon_name + '.', 2400);
      return;
    }
    if (name === 'sound') {
      userEdited = true;
      sound = !sound;
      config.profile.sound = sound;
      syncButtons();
      savePrefs();
      if (sound) tone([523.25, 783.99]);
      return;
    }
    if (name === 'motion') {
      userEdited = true;
      reduced = !reduced;
      config.profile.reduced_motion = reduced;
      config.capabilities.reduced_motion = reduced;
      syncButtons();
      if (world.setReducedMotion) world.setReducedMotion(reduced);
      savePrefs();
      say(reduced ? 'El movimiento de la escena se ha suavizado.' : 'El dragón vuelve a moverse con toda su energía.', 2800);
      return;
    }
    if (name === 'pet') {
      petCount += 1;
      var options = messages.pet;
      say(options[petCount % options.length], 3600);
      tone([523.25, 659.25]);
    } else {
      say(messages[name] || stateMessages[idleName(name)], 3600);
      var tones = {
        call: [440, 587.33], play: [659.25, 880], sit: [392],
        sleep: [329.63, 261.63], fly: [523.25, 659.25, 987.77]
      };
      tone(tones[name] || [523.25]);
    }
    world.setAction(name);
  }

  function idleName(name) {
    return name === 'sit' ? 'resting' : name === 'sleep' ? 'sleeping' : name === 'fly' ? 'flying' : name;
  }

  Array.prototype.forEach.call(doc.querySelectorAll('[data-action]'), function (button) {
    button.addEventListener('click', function () { runAction(button.getAttribute('data-action')); });
  });

  if (nameForm) {
    nameForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = (nameInput.value || '').trim();
      if (!value) return;
      userEdited = true;
      send('/name', { csrf: config.csrf, name: value }).then(function (result) {
        if (!result || !result.ok) {
          say((result && result.error) || 'No se pudo guardar el nombre. Inténtalo de nuevo.', 4000);
          return;
        }
        if (heading) heading.textContent = result.name;
        if (nameSummary) nameSummary.textContent = result.name;
        config.profile.dragon_name = result.name;
        say('Ahora se llama ' + result.name + '.', 3200);
      });
    });
  }

  syncButtons();
  if (world.setReducedMotion) world.setReducedMotion(reduced);
  if (status && config.profile.dragon_name) {
    status.textContent = config.profile.dragon_name + ' te está mirando.';
  }
  if (nameSummary) nameSummary.textContent = config.profile.dragon_name;
  loadRemotePreferences();
})(window);
