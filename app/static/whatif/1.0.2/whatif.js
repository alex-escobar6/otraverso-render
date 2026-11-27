(function () {
  'use strict';

  var API = '/api/what-if/v1';
  var GUEST_KEY = 'otraverso.whatif.guest.v1';
  var DRAFT_KEY = 'otraverso.whatif.draft.v1';
  var FAVORITES_KEY = 'otraverso.whatif.ideas.favorites.v1';
  var HANDOFF_KEY = 'otraverso.whatif.idea.handoff.v1';
  var HOME_EXAMPLES = [
    'Viajar al año 30 d. C., en Judea, con conocimientos de la historia futura',
    '¿Y si los dinosaurios nunca se hubieran extinguido?',
    '¿Y si Roma nunca hubiera caído?',
    '¿Y si la humanidad descubriera vida inteligente en Marte?',
    '¿Y si pudiéramos viajar al pasado?',
    '¿Y si los sueños fueran compartidos?',
    '¿Y si existiera una civilización bajo los océanos?',
    '¿Y si la Luna se hubiera convertido en un segundo sol?',
    '¿Y si las bibliotecas guardaran los recuerdos de quienes las leen?',
    '¿Y si los mapas dibujaran ciudades que todavía no existen?',
    '¿Y si cada invento imposible encontrara su propio continente?'
  ];
  var EXPLORE_TABS = ['mundo', 'historia', 'cronologia', 'personajes', 'lugares', 'civilizaciones', 'misterios', 'eventos', 'lineas', 'memoria'];
  var SECTION_LABELS = {
    world: 'Mundo', history: 'Historia', chronology: 'Cronología', characters: 'Personajes',
    places: 'Lugares', civilizations: 'Civilizaciones', mysteries: 'Descubrimientos', events: 'Acontecimientos',
    timelines: 'Líneas', culture: 'Cultura', technology: 'Tecnología', economy: 'Economía',
    religions: 'Religiones', species: 'Especies', flora: 'Flora', fauna: 'Fauna',
    customs: 'Costumbres', conflicts: 'Conflictos'
  };
  var CONFIG_FIELDS = [
    'apocalypse', 'apocalypse_level', 'crazy', 'crazy_level', 'unlimited', 'chapter_length',
    'randomness', 'surprise_frequency', 'point_of_view', 'initial_characters', 'ending'
  ];
  var KEY_ALIASES = {
    ideas_enabled: ['ideas_enabled', 'ideasEnabled', 'ideas'],
    apocalypse_enabled: ['apocalypse_enabled', 'apocalypseEnabled', 'apocalypse'],
    crazy_enabled: ['crazy_enabled', 'crazyEnabled', 'crazy'],
    unlimited_enabled: ['unlimited_enabled', 'unlimitedEnabled', 'unlimited', 'sin_limites'],
    chapter_lengths: ['chapter_lengths', 'chapterLengths', 'chapter_length_options'],
    surprise_frequency: ['surprise_frequency_levels', 'surprise_frequencies', 'surprise_frequency_options'],
    randomness_level: ['randomness_levels', 'randomness_options'],
    genres: ['available_genres', 'availableGenres', 'genres'],
    styles: ['available_styles', 'availableStyles', 'styles'],
    memory_cards_limit: ['memory_cards_limit', 'memoryCardsLimit', 'memory_limit']
  };
  var guestToken = '';
  var csrfToken = '';
  var csrfExpiresAt = 0;
  var configReady = false;
  var clientConfig = {};
  var state = null;
  var activeChapterId = 0;
  var pendingProposal = null;
  var pendingIntervention = null;
  var debugEnabled = false;
  var ideasState = [];
  var ideaExcludes = [];
  var favoritesOnly = false;
  var jobTimer = 0;
  var autostartConfirm = null;

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function logDiagnostic(label, data) {
    if (!debugEnabled || !window.console || !window.console.info) return;
    window.console.info('[WHAT IF][' + label + ']', JSON.stringify(data));
  }

  function tokenMeta(token) {
    return { presente: Boolean(token), longitud: token ? String(token).length : 0 };
  }

  function safeDetail(detail) { return String(detail || '').slice(0, 200); }

  function stageForError(status, code) {
    if (code === 'csrf_invalid' || code === 'csrf_expired' || code === 'session_expired') return 'Validación CSRF/sesión';
    if (code === 'identity_required' || status === 401) return 'Autenticación';
    if (code === 'permission_denied' || status === 403) return 'Permisos';
    if (code === 'not_found' || status === 404) return 'Recurso inexistente';
    if (code === 'validation_error' || status === 400) return 'Validación de datos';
    if (code === 'rate_limited' || status === 429) return 'Límite de uso';
    if (status >= 500) return 'Servidor';
    return 'Respuesta';
  }

  function friendlyError(status, code, detail) {
    var text = safeDetail(detail);
    if (code === 'csrf_invalid') return 'Token de seguridad inválido. Recarga la página e inténtalo de nuevo.';
    if (code === 'csrf_expired') return 'El token de seguridad expiró. Recarga la página para continuar.';
    if (code === 'identity_required') return 'No se pudo identificar la sesión. Vuelve a entrar a WHAT IF.';
    if (code === 'validation_error') return text || 'Revisa los datos e inténtalo de nuevo.';
    if (status === 401) return 'Debes iniciar sesión para continuar.';
    if (status === 403) return 'No tienes permiso para esta operación.';
    if (status === 404) return 'El recurso solicitado no existe.';
    if (status === 429) return text || 'Alcanzaste el límite de operaciones. Intenta de nuevo más tarde.';
    if (status >= 500) return 'Error interno del servidor. Inténtalo de nuevo.';
    return text || 'No fue posible completar la operación.';
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function message(text, isError) {
    var node = qs('[data-wi-status]');
    if (!node) return;
    node.textContent = text || '';
    node.classList.toggle('is-error', Boolean(isError));
    if (text) {
      window.setTimeout(function () {
        if (node.textContent === text) node.textContent = '';
      }, 7000);
    }
  }

  function saveDraft(path, form) {
    var draft = { path: path, form: {}, savedAt: Date.now() };
    Object.keys(form || {}).forEach(function (key) {
      if (key !== 'csrf' && key !== 'guest') draft.form[key] = form[key];
    });
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (error) { return; }
  }

  function restoreDraft() {
    var raw;
    try { raw = window.localStorage.getItem(DRAFT_KEY); } catch (error) { return; }
    if (!raw) return;
    var draft;
    try { draft = JSON.parse(raw); } catch (error) { return; }
    if (!draft || draft.path !== window.location.pathname) return;
    var restored = 0;
    var controls = qsa('input, textarea, select');
    Object.keys(draft.form || {}).forEach(function (key) {
      controls.forEach(function (control) {
        if (control.getAttribute('name') !== key) return;
        if (control.type === 'checkbox' || control.type === 'radio') control.checked = Boolean(draft.form[key]);
        else control.value = String(draft.form[key]);
        restored += 1;
      });
    });
    try { window.localStorage.removeItem(DRAFT_KEY); } catch (error) { return; }
    if (restored) message('Recuperamos lo que estabas escribiendo antes de la expiración de la sesión.');
  }

  function showSessionExpired(path) {
    var node = qs('[data-wi-status]');
    if (!node) return;
    node.textContent = '';
    node.classList.add('is-error');
    node.appendChild(document.createTextNode('Tu sesión expiró y guardamos tu borrador. '));
    var link = document.createElement('a');
    link.href = '/admin/login?next=' + encodeURIComponent(path || window.location.pathname);
    link.textContent = 'Inicia sesión';
    node.appendChild(link);
    node.appendChild(document.createTextNode(' y vuelve a WHAT IF para recuperarlo.'));
  }

  function busy(button, value, label) {
    if (!button) return;
    if (value) {
      button.dataset.label = button.textContent;
      button.disabled = true;
      button.textContent = label || 'PROCESANDO…';
    } else {
      button.disabled = false;
      button.textContent = button.dataset.label || button.textContent;
    }
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = window.setTimeout(function () {
        if (!done) reject(new Error('La operación tardó demasiado. Puedes reintentar; el estado anterior se conserva.'));
      }, ms);
      promise.then(function (value) {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve(value);
      }, function (error) {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        reject(error);
      });
    });
  }

  try { guestToken = window.localStorage.getItem(GUEST_KEY) || ''; } catch (error) { guestToken = ''; }

  function configContainers() {
    var ai = clientConfig.ai || {};
    return [ai.features || {}, ai.defaults || {}, ai.options || {}, ai, clientConfig.options || {}, clientConfig];
  }

  function findConfigValue(key) {
    var aliases = KEY_ALIASES[key] || [key];
    var containers = configContainers();
    for (var index = 0; index < containers.length; index += 1) {
      for (var aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
        var candidate = containers[index][aliases[aliasIndex]];
        if (candidate !== undefined && candidate !== null) return candidate;
      }
    }
    return undefined;
  }

  function boolValue(value) {
    if (value === true || value === 1) return true;
    if (typeof value === 'number') return value > 0;
    var text = String(value === undefined || value === null ? '' : value).toLowerCase().trim();
    return ['1', 'true', 'on', 'yes', 'si', 'sí', 'activo', 'enabled'].indexOf(text) >= 0;
  }

  function normalizeOptions(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) {
        if (item === null || item === undefined) return null;
        if (typeof item !== 'object') return { value: String(item), label: String(item) };
        var code = item.value !== undefined ? item.value : (item.code !== undefined ? item.code : (item.id !== undefined ? item.id : item.key));
        var label = item.label || item.name || item.title || code;
        if (code === undefined || code === null) return null;
        return { value: String(code), label: String(label) };
      }).filter(Boolean);
    }
    if (value && typeof value === 'object') {
      return Object.keys(value).map(function (key) {
        return { value: key, label: typeof value[key] === 'string' ? value[key] : key };
      });
    }
    return [];
  }

  function populateSelect(select, options, placeholder) {
    if (!select) return;
    var current = select.value;
    select.textContent = '';
    if (placeholder) {
      var first = element('option', '', placeholder.label);
      first.value = placeholder.value === undefined ? '' : placeholder.value;
      select.appendChild(first);
    }
    options.forEach(function (option) {
      var node = element('option', '', option.label);
      node.value = option.value;
      select.appendChild(node);
    });
    if (current && qsa('option', select).some(function (option) { return option.value === current; })) select.value = current;
  }

  function populateConfigOptions() {
    var genres = normalizeOptions(findConfigValue('genres'));
    if (genres.length) populateSelect(qs('[data-wi-ideas-genre]'), genres, { value: '', label: 'Automático' });
    qsa('[data-wi-options]').forEach(function (select) {
      var options = normalizeOptions(findConfigValue(select.dataset.wiOptions));
      if (options.length) populateSelect(select, options, null);
    });
  }

  function setWiMode(mode) {
    var clean = String(mode || 'normal').toLowerCase().trim().replace(/_/g, '-').replace(/\s+/g, '-');
    var valid = [
      'normal', 'apocalipsis', 'loco', 'combinado', 'sin-limites',
      'sin-limites-apocalipsis', 'sin-limites-loco', 'sin-limites-combinado'
    ];
    if (valid.indexOf(clean) < 0) clean = 'normal';
    if (document.body) document.body.dataset.wiMode = clean;
    return clean;
  }

  function modeLabel(mode) {
    var labels = {
      normal: 'NORMAL', apocalipsis: 'APOCALIPSIS', loco: 'LOCO', combinado: 'COMBINADO',
      'sin-limites': 'SIN LÍMITES', 'sin-limites-apocalipsis': 'SIN LÍMITES + APOCALIPSIS',
      'sin-limites-loco': 'SIN LÍMITES + LOCO', 'sin-limites-combinado': 'SIN LÍMITES + COMBINADO'
    };
    return labels[mode] || String(mode || 'NORMAL').toUpperCase();
  }

  function narrativeConfigFrom(source) {
    if (!source || typeof source !== 'object') return {};
    var raw = source.narrative_config || source.narrativeConfig;
    var parsed = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch (error) { parsed = {}; }
    }
    if (parsed && typeof parsed === 'object') return Object.assign({}, source, parsed);
    return source;
  }

  function modeFromSource(source) {
    var data = source || {};
    var config = narrativeConfigFrom(data);
    var apocalypse = boolValue(config.apocalypse) || boolValue(config.apocalypse_enabled);
    var crazy = boolValue(config.crazy) || boolValue(config.crazy_enabled);
    var unlimited = boolValue(config.unlimited) || boolValue(config.unlimited_enabled);
    function readCode(raw) {
      var code = String(raw || '').toLowerCase();
      if (code.indexOf('sin-limit') >= 0 || code.indexOf('sin limit') >= 0
          || code.indexOf('unlimited') >= 0 || code.indexOf('ilimitad') >= 0) unlimited = true;
      if (code.indexOf('apocalip') >= 0 || code.indexOf('apocalypse') >= 0) apocalypse = true;
      if (code.indexOf('loco') >= 0 || code.indexOf('crazy') >= 0) crazy = true;
      if (code.indexOf('combinad') >= 0) { apocalypse = true; crazy = true; }
    }
    var modes = data.modes;
    if (Array.isArray(modes)) {
      modes.forEach(function (item) {
        readCode(typeof item === 'object' && item !== null
          ? (item.code || item.mode || item.name || '') : item);
      });
    } else if (modes && typeof modes === 'object') {
      apocalypse = apocalypse || boolValue(modes.apocalipsis) || boolValue(modes.apocalypse);
      crazy = crazy || boolValue(modes.loco) || boolValue(modes.crazy);
      unlimited = unlimited || boolValue(modes['sin-limites']) || boolValue(modes.unlimited);
    }
    readCode(config.mode);
    var base = apocalypse && crazy ? 'combinado' : (apocalypse ? 'apocalipsis' : (crazy ? 'loco' : ''));
    if (unlimited) return setWiMode(base ? 'sin-limites-' + base : 'sin-limites');
    return setWiMode(base || 'normal');
  }

  function pickConfig(config) {
    var out = {};
    CONFIG_FIELDS.forEach(function (key) {
      if (config[key] !== undefined && config[key] !== null) out[key] = config[key];
    });
    return out;
  }

  function setInputValue(node, value, name) {
    if (node.type === 'checkbox' || node.type === 'radio') {
      node.checked = boolValue(value);
      return;
    }
    if (node.type === 'hidden' && (name === 'apocalypse' || name === 'crazy' || name === 'unlimited')) {
      node.value = boolValue(value) ? '1' : '0';
      return;
    }
    node.value = value === undefined || value === null ? '' : String(value);
  }

  function fillConfigInputs(root, config) {
    if (!root || !config || typeof config !== 'object') return;
    CONFIG_FIELDS.forEach(function (name) {
      var value = config[name];
      if (value === undefined || value === null) return;
      var nodes = qsa('[data-wi-config="' + name + '"]', root);
      if (!nodes.length) nodes = qsa('[name="' + name + '"]', root);
      nodes.forEach(function (node) { setInputValue(node, value, name); });
    });
    qsa('[data-wi-config="narrative_config"]', root).forEach(function (node) {
      node.value = JSON.stringify(pickConfig(config));
    });
    qsa('[data-wi-range-output]', root).forEach(function (output) {
      var field = qs('[name="' + output.dataset.wiRangeOutput + '"]', root);
      if (field) output.textContent = field.value;
    });
  }

  function readConfigForm(form) {
    var out = {};
    if (!form) return out;
    CONFIG_FIELDS.forEach(function (name) {
      var nodes = qsa('[name="' + name + '"]', form);
      if (!nodes.length) return;
      var value = '';
        nodes.forEach(function (node) {
          if (node.type === 'checkbox' || node.type === 'radio') {
            value = node.checked ? (node.value || '1') : '0';
          } else {
            value = node.value;
          }
        });
      out[name] = value;
    });
    out.narrative_config = JSON.stringify(pickConfig(out));
    return out;
  }

  function computeStability(config) {
    var raw = findConfigValue('stability');
    if (typeof raw === 'number') return raw.toFixed(1) + '%';
    if (typeof raw === 'string' && raw.trim()) return raw;
    var score = 98.6;
    if (boolValue(config && config.apocalypse)) score -= 4.2;
    if (boolValue(config && config.crazy)) score -= 7.1;
    if (config && config.surprise_frequency === 'alta') score -= 3.3;
    if (config && config.randomness === 'extremo') score -= 5.5;
    return Math.max(12, score).toFixed(1) + '%';
  }

  function applyVisualConfig(config) {
    var visual = (config && config.visual) || {};
    var names = {
      primary: '--wi-primary',
      secondary: '--wi-secondary',
      accent: '--wi-accent',
      background: '--wi-background'
    };
    Object.keys(names).forEach(function (key) {
      var value = visual[key];
      if (typeof value === 'string' && value.trim()) {
        document.documentElement.style.setProperty(names[key], value.trim());
      }
    });
  }

  function applyConfig(config) {
    csrfToken = config.csrf || csrfToken;
    csrfExpiresAt = Number(config.csrf_expires_at || 0);
    debugEnabled = Boolean(config.debug);
    clientConfig = config || {};
    applyVisualConfig(clientConfig);
    qsa('input[name="csrf"]').forEach(function (input) { input.value = csrfToken; });
    var ai = clientConfig.ai || {};
    var note = qs('[data-wi-ai-status]');
    if (note) {
      note.textContent = 'Motor: ' + (ai.text_provider === 'local'
        ? 'narrativo local determinista, sin credenciales externas'
        : (ai.text_configured ? ai.text_provider + ' · ' + ai.text_model : ai.text_provider + ' sin configurar'));
    }
    var lab = qs('[data-wi-lab-status]');
    if (lab) {
      var signals = ['BIBLIOTECA ACTIVA'];
      if (findConfigValue('ideas_enabled') !== undefined) {
        signals.push(boolValue(findConfigValue('ideas_enabled')) ? 'GENERADOR DE IDEAS ONLINE' : 'GENERADOR EN MANTENIMIENTO');
      }
      if (boolValue(findConfigValue('apocalypse_enabled'))) signals.push('MODO APOCALIPSIS DISPONIBLE');
      if (boolValue(findConfigValue('crazy_enabled'))) signals.push('MODO LOCO DISPONIBLE');
      if (boolValue(findConfigValue('unlimited_enabled'))) signals.push('MODO SIN LÍMITES DISPONIBLE');
      lab.textContent = signals.join(' · ');
    }
    var defaults = ai.defaults || (clientConfig.config && clientConfig.config.defaults) || {};
    var createForm = qs('[data-wi-create-form]');
    if (createForm && Object.keys(defaults).length) fillConfigInputs(createForm, narrativeConfigFrom(defaults));
    var studioForm = qs('[data-wi-modes-form]');
    if (studioForm && Object.keys(defaults).length) fillConfigInputs(studioForm, narrativeConfigFrom(defaults));
    populateConfigOptions();
    setWiMode(modeFromSource(defaults));
    var stability = qs('[data-wi-stability]');
    if (stability) stability.textContent = computeStability(defaults);
    configReady = true;
    return config;
  }

  async function refreshIdentity() {
    if (!guestToken) {
      var guest = await request('/guest', null, 'GET', false);
      guestToken = guest.token || '';
      try { window.localStorage.setItem(GUEST_KEY, guestToken); } catch (error) { guestToken = ''; }
    }
    return applyConfig(await request('/config', null, 'GET', false));
  }

  async function request(path, form, method, canRetry, meta) {
    var verb = method || (form ? 'POST' : 'GET');
    var retry = canRetry !== false;
    var operation = (meta && meta.operation) || 'Petición';
    var requestId = Math.random().toString(36).slice(2, 10);
    var startedAt = Date.now();
    var contentType = verb === 'POST' ? 'application/x-www-form-urlencoded;charset=UTF-8' : '';
    if (verb === 'POST' && csrfToken && csrfExpiresAt
        && Math.floor(Date.now() / 1000) > csrfExpiresAt - 60) {
      await refreshCsrf();
    }
    logDiagnostic(operation, {
      inicio: true,
      id_solicitud: requestId,
      endpoint: API + path,
      metodo: verb,
      estado_sesion: guestToken ? 'invitado' : 'sin invitado',
      csrf: tokenMeta(csrfToken),
      cookie_sesion: 'no verificable (HttpOnly)',
      tipo_contenido: contentType || 'n/a',
      reintento: !retry
    });
    var params = new URLSearchParams();
    if (guestToken) params.set('guest', guestToken);
    if (form) {
      Object.keys(form).forEach(function (key) {
        if (form[key] !== undefined && form[key] !== null) params.set(key, String(form[key]));
      });
    }
    if (verb === 'POST' && csrfToken) params.set('csrf', csrfToken);
    var options = { method: verb, credentials: 'same-origin', headers: { 'X-Request-ID': requestId } };
    if (guestToken) options.headers['X-WHATIF-GUEST'] = guestToken;
    if (verb === 'POST') {
      options.headers['Content-Type'] = contentType;
      options.body = params.toString();
    }
    var url = API + path + (verb === 'GET' ? '?' + params.toString() : '');
    var response;
    try {
      response = await withTimeout(fetch(url, options), 90000);
    } catch (error) {
      logDiagnostic('ERROR', {
        operacion: operation, id_solicitud: requestId, etapa: 'Conexión',
        mensaje: safeDetail(error.message), duracion_ms: Date.now() - startedAt
      });
      throw error;
    }
    var data;
    try {
      data = await response.json();
    } catch (error) {
      logDiagnostic('ERROR', {
        operacion: operation, id_solicitud: requestId, http: response.status,
        etapa: 'Respuesta', mensaje: 'JSON inválido', duracion_ms: Date.now() - startedAt
      });
      throw new Error('El servidor no devolvió una respuesta válida (' + response.status + ').');
    }
    if (!response.ok || data.ok === false) {
      var detail = data.error || data.message || 'No fue posible completar la operación.';
      var code = data.code || '';
      var stage = stageForError(response.status, code);
      logDiagnostic('ERROR', {
        operacion: operation,
        id_solicitud: requestId,
        http: response.status,
        codigo_interno: code || 'sin_codigo',
        mensaje_backend: safeDetail(detail),
        etapa: stage,
        solicitud: API + path,
        duracion_ms: Date.now() - startedAt
      });
      if (code === 'session_expired') {
        if (verb === 'POST') saveDraft(path, form);
        showSessionExpired(path);
        throw new Error(detail);
      }
      var retryable = code === 'csrf_invalid' || code === 'csrf_expired'
        || (response.status === 401 && !code);
      if (retry && retryable) {
        csrfToken = '';
        configReady = false;
        guestToken = '';
        try { window.localStorage.removeItem(GUEST_KEY); } catch (error) { guestToken = ''; }
        await refreshIdentity();
        return request(path, form, method, false, meta);
      }
      throw new Error(friendlyError(response.status, code, detail));
    }
    logDiagnostic(operation, {
      resultado: 'ok',
      id_solicitud: requestId,
      http: response.status,
      etapa: 'Respuesta',
      duracion_ms: Date.now() - startedAt
    });
    return data;
  }

  async function refreshCsrf() {
    return applyConfig(await request('/config', null, 'GET', false));
  }

  async function init() {
    try {
      var config = await refreshIdentity();
      restoreDraft();
      return config;
    } catch (error) {
      message(error.message, true);
      return {};
    }
  }

  function renderRealityCards(container, realities, options) {
    if (!container) return;
    container.textContent = '';
    var settings = options || {};
    var rows = settings.limit ? realities.slice(0, settings.limit) : realities;
    if (!rows.length) {
      container.appendChild(element('div', 'wi-empty', settings.empty || 'Todavía no hay realidades guardadas. Crea la primera para empezar.'));
      return;
    }
    rows.forEach(function (row) {
      var card = element('article', 'wi-card');
      if (row.cover_asset_id) {
        var image = element('img', 'wi-card__cover');
        image.src = API + '/assets/' + row.cover_asset_id + '?guest=' + encodeURIComponent(guestToken);
        image.alt = 'Portada de ' + row.title;
        card.appendChild(image);
      }
      card.appendChild(element('h3', '', row.title));
      card.appendChild(element('p', '', row.premise));
      var meta = element('div', 'wi-card__meta');
      meta.appendChild(element('span', '', row.chapter_count + ' capítulos'));
      meta.appendChild(element('span', '', row.timeline_count + ' líneas'));
      meta.appendChild(element('span', '', row.status === 'active' ? 'Activa' : 'Archivada'));
      if (row.favorite) meta.appendChild(element('span', '', 'Favorita'));
      card.appendChild(meta);
      var actions = element('div', 'wi-card__actions');
      var open = element('a', 'wi-btn wi-btn--primary wi-btn--small', 'CONTINUAR');
      open.href = '/what-if/espacio/' + row.id;
      actions.appendChild(open);
      var studio = element('a', 'wi-btn wi-btn--small', 'STUDIO');
      studio.href = '/what-if/studio/' + row.id;
      actions.appendChild(studio);
      if (settings.manage) {
        var favorite = element('button', 'wi-btn wi-btn--small', row.favorite ? 'QUITAR FAVORITA' : 'FAVORITA');
        favorite.type = 'button';
        favorite.addEventListener('click', async function () {
          try {
            await request('/realities/' + row.id + '/update', { favorite: row.favorite ? 0 : 1 });
            await loadLibrary();
            message('Biblioteca actualizada.');
          } catch (error) { message(error.message, true); }
        });
        actions.appendChild(favorite);
        var archive = element('button', 'wi-btn wi-btn--small', row.status === 'active' ? 'ARCHIVAR' : 'RECUPERAR');
        archive.type = 'button';
        archive.addEventListener('click', async function () {
          try {
            await request('/realities/' + row.id + '/update', { status: row.status === 'active' ? 'archived' : 'active' });
            await loadLibrary();
            message('Estado actualizado.');
          } catch (error) { message(error.message, true); }
        });
        actions.appendChild(archive);
      }
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  async function loadLibrary() {
    try {
      var data = await request('/realities');
      window.dispatchEvent(new CustomEvent('whatif:library', { detail: data.realities || [] }));
      return data.realities || [];
    } catch (error) {
      message(error.message, true);
      return [];
    }
  }

  function ideaMode() {
    var mode = document.body.dataset.wiMode || 'normal';
    if (mode.indexOf('combinado') >= 0) return 'combinado';
    if (mode.indexOf('apocalipsis') >= 0) return 'apocalipsis';
    if (mode.indexOf('loco') >= 0) return 'loco';
    return 'normal';
  }

  function modeFlags(mode) {
    var value = String(mode || 'normal').toLowerCase();
    return {
      apocalypse: value.indexOf('apocalip') >= 0 || value.indexOf('combinad') >= 0 ? '1' : '0',
      crazy: value.indexOf('loco') >= 0 || value.indexOf('crazy') >= 0 || value.indexOf('combinad') >= 0 ? '1' : '0',
      unlimited: value.indexOf('sin-limit') >= 0 || value.indexOf('sin limit') >= 0 || value.indexOf('unlimit') >= 0 ? '1' : '0',
      chapter_length: 'escena',
      point_of_view: 'segunda persona'
    };
  }

  function presetFromButton(button) {
    if (!button || !button.dataset) return {};
    return { mode: button.dataset.mode || '', genre: button.dataset.genre || '', style: button.dataset.style || '' };
  }

  function proposalPayload(proposal, preset) {
    var source = narrativeConfigFrom(proposal || {});
    var settings = preset || {};
    var config = Object.assign({}, source, modeFlags(settings.mode));
    config.chapter_length = 'escena';
    var payload = {};
    ['title', 'premise', 'description', 'genre', 'style', 'depth', 'format', 'recommendation', 'first_scene'].forEach(function (key) {
      if (source[key]) payload[key] = source[key];
    });
    var rules = Array.isArray(source.rules) ? source.rules : [];
    payload.rules = JSON.stringify(rules.map(function (rule) {
      return typeof rule === 'string' ? { text: rule, kind: 'established' } : rule;
    }));
    payload.characters = JSON.stringify(Array.isArray(source.characters) ? source.characters : []);
    payload.locations = JSON.stringify(Array.isArray(source.locations) ? source.locations : []);
    payload.narrative_config = JSON.stringify(pickConfig(config));
    CONFIG_FIELDS.forEach(function (key) {
      if (config[key] !== undefined && config[key] !== null) payload[key] = config[key];
    });
    return payload;
  }

  async function launchIdea(text, preset, trigger) {
    var clean = String(text || '').trim();
    if (!clean) return;
    var settings = preset || {};
    var key = 'launch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    var payload = { idea: clean, chapter_length: 'escena', idempotency_key: key };
    ['genre', 'style', 'depth', 'format'].forEach(function (field) {
      if (settings[field]) payload[field] = settings[field];
    });
    var flags = modeFlags(settings.mode);
    Object.keys(flags).forEach(function (field) { payload[field] = flags[field]; });
    if (trigger) busy(trigger, true, 'ABRIENDO…');
    try {
      var prepared = await request('/proposals', payload, 'POST', true, { operation: 'Preparar simulación' });
      var created = await request(
        '/realities',
        Object.assign(proposalPayload(prepared.proposal, settings), { idempotency_key: key + ':realities' }),
        'POST', true, { operation: 'Crear simulación' }
      );
      window.location.href = '/what-if/espacio/' + created.reality.id;
    } catch (error) {
      message(error.message, true);
      if (trigger) busy(trigger, false);
    }
  }

  function storeHandoff(text, autostart) {
    var payload = {
      text: text,
      autostart: Boolean(autostart),
      mode: document.body.dataset.wiMode || 'normal'
    };
    try { window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload)); } catch (error) { return false; }
    return true;
  }

  function setupIdeaButtons() {
    qsa('[data-idea]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.closest('#ejemplos') && qs('[data-wi-hero-form]')) {
          launchIdea(button.dataset.idea, presetFromButton(button), button);
          return;
        }
        var field = qs('[data-wi-hero-idea]') || qs('#wi-idea');
        if (field) {
          field.value = button.dataset.idea;
          field.focus();
          if (field.id === 'wi-hero-idea' && field.scrollIntoView) field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (storeHandoff(button.dataset.idea, false)) {
          saveDraft('/what-if/crear', { idea: button.dataset.idea });
          window.location.href = '/what-if/crear';
        }
      });
    });
  }

  function setupHome() {
    var container = qs('[data-wi-featured]');
    if (container) {
      window.addEventListener('whatif:library', function (event) {
        renderRealityCards(container, event.detail, { limit: 3, empty: 'Aún no has creado mundos en este navegador o cuenta.' });
      });
      loadLibrary();
    }
    var form = qs('[data-wi-hero-form]');
    if (!form) return;
    var field = qs('[data-wi-hero-idea]', form);
    var rotation = qs('[data-wi-rotating-idea]', form);
    var index = 0;
    function currentExample() { return HOME_EXAMPLES[index % HOME_EXAMPLES.length]; }
    function paintRotation() {
      if (!field || field.value.trim()) return;
      var text = currentExample();
      if (rotation) rotation.textContent = 'Ejemplo: ' + text;
      field.placeholder = text;
    }
    paintRotation();
    window.setInterval(function () {
      if (!field || field.value.trim()) return;
      index += 1;
      paintRotation();
    }, 4500);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!field) return;
      var text = (field.value || '').trim() || currentExample();
      field.value = text;
      launchIdea(text, { mode: document.body.dataset.wiMode || 'normal' }, qs('[data-wi-discover]', form));
    });
    var surprise = qs('[data-wi-home-surprise]');
    if (surprise) surprise.addEventListener('click', async function () {
      busy(surprise, true, 'BUSCANDO…');
      try {
        var data = await request('/ideas', {
          count: 1,
          genre: '',
          mode: ideaMode(),
          variation: 'mix',
          exclude: '[]',
          idempotency_key: 'surprise-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
        }, 'POST', true, { operation: 'Idea sorpresa' });
        var idea = (data.ideas || [])[0];
        if (!idea) throw new Error('No se obtuvo ninguna idea. Inténtalo de nuevo.');
        var text = ideaText(idea);
        if (field) field.value = text;
        busy(surprise, false);
        launchIdea(text, { mode: ideaMode() }, surprise);
      } catch (error) { message(error.message, true); }
      finally { busy(surprise, false); }
    });
  }

  function renderProposal(proposal, providerName) {
    pendingProposal = proposal;
    var panel = qs('[data-wi-proposal]');
    var config = narrativeConfigFrom(proposal);
    fillConfigInputs(qs('[data-wi-create-form]'), config);
    fillConfigInputs(panel, config);
    setWiMode(modeFromSource(config));
    if (!panel) return;
    panel.hidden = false;
    var providerNote = qs('[data-wi-provider]');
    if (providerNote) providerNote.textContent = 'Propuesta preparada con ' + (providerName || 'motor narrativo') + '. Revisa los campos antes de crear la realidad.';
    qsa('[data-wi-field]', panel).forEach(function (field) {
      var key = field.dataset.wiField;
      if (key === 'rules') {
        field.value = (proposal.rules || []).map(function (rule) { return typeof rule === 'string' ? rule : rule.text; }).filter(Boolean).join('\n');
      } else {
        field.value = proposal[key] || '';
      }
    });
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (autostartConfirm) autostartConfirm();
  }

  function setupCreate() {
    var form = qs('[data-wi-create-form]');
    if (!form) return;
    var proposalKey = 'proposal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    var ideaField = qs('#wi-idea');
    var confirm = qs('[data-wi-confirm-form]');
    var autostart = false;
    var proposalTriggered = false;
    var confirmTriggered = false;
    var submittingProposal = false;
    var submittingConfirm = false;
    autostartConfirm = null;
    function submitForm(target) {
      if (target.requestSubmit) target.requestSubmit();
      else target.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
    qsa('[data-wi-range]', form).forEach(function (field) {
      field.addEventListener('input', function () {
        var output = qs('[data-wi-range-output="' + field.dataset.wiRange + '"]', form);
        if (output) output.textContent = field.value;
      });
    });
    try {
      var raw = window.sessionStorage.getItem(HANDOFF_KEY);
      if (raw) {
        var handoff = JSON.parse(raw);
        if (ideaField && !ideaField.value && handoff.text) {
          ideaField.value = handoff.text;
          autostart = Boolean(handoff.autostart);
          if (handoff.mode) setWiMode(handoff.mode);
          if (handoff.config) fillConfigInputs(form, narrativeConfigFrom(handoff.config));
          message('Idea cargada desde el portal. Preparando el mundo…');
        }
        window.sessionStorage.removeItem(HANDOFF_KEY);
      }
    } catch (error) {
      try { window.sessionStorage.removeItem(HANDOFF_KEY); } catch (cleanupError) {}
      message('No se pudo recuperar la idea compartida.', true);
    }

    var randomButton = qs('[data-wi-random-idea]');
    if (randomButton) randomButton.addEventListener('click', async function () {
      busy(randomButton, true, 'BUSCANDO…');
      try {
        var data = await request('/ideas', {
          count: 1,
          genre: qs('[name="genre"]', form) ? qs('[name="genre"]', form).value : '',
          mode: ideaMode(),
          variation: 'mix',
          exclude: '[]',
          idempotency_key: 'idea-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
        }, 'POST', true, { operation: 'Idea aleatoria' });
        var idea = (data.ideas || [])[0];
        if (!idea) throw new Error('No se obtuvo ninguna idea. Inténtalo de nuevo.');
        if (ideaField) {
          ideaField.value = ideaText(idea);
          ideaField.focus();
        }
        message('Idea sorpresa cargada. Puedes editarla antes de abrir el mundo.');
      } catch (error) { message(error.message, true); }
      finally { busy(randomButton, false); }
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (submittingProposal) return;
      submittingProposal = true;
      var button = qs('button[type="submit"]', form);
      busy(button, true, 'PREPARANDO PROPUESTA…');
      try {
        var payload = {};
        qsa('input[name], textarea[name], select[name]', form).forEach(function (field) { payload[field.name] = field.value; });
        payload.idempotency_key = proposalKey;
        var data = await request('/proposals', payload, 'POST', true, { operation: 'Preparar respuesta' });
        renderProposal(data.proposal, data.provider);
        message('Propuesta lista. Puedes ajustarla antes de crear el mundo.');
      } catch (error) {
        message(error.message, true);
      } finally {
        submittingProposal = false;
        busy(button, false);
      }
    });
    if (confirm) {
      confirm.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (submittingConfirm) return;
        submittingConfirm = true;
        var button = qs('button[type="submit"]', confirm);
        busy(button, true, 'ABRIENDO EL MUNDO…');
        try {
          var payload = {};
          qsa('input[name], textarea[name]', confirm).forEach(function (field) { payload[field.name] = field.value; });
          var config = narrativeConfigFrom(pendingProposal || payload);
          var sourceConfig = readConfigForm(form);
          CONFIG_FIELDS.forEach(function (name) {
            if (sourceConfig[name] !== undefined) config[name] = sourceConfig[name];
          });
          payload.narrative_config = JSON.stringify(pickConfig(config));
          CONFIG_FIELDS.forEach(function (name) {
            if (config[name] !== undefined && config[name] !== null) payload[name] = config[name];
          });
          payload.rules = JSON.stringify((payload.rules_text || '').split('\n').map(function (line) { return line.trim(); }).filter(Boolean).map(function (text) { return { text: text, kind: 'established' }; }));
          payload.idempotency_key = proposalKey + ':realities';
          var data = await request('/realities', payload, 'POST', true, { operation: 'Crear realities' });
          message('Mundo creado. Abriendo la sala narrativa…');
          window.location.href = '/what-if/espacio/' + data.reality.id;
        } catch (error) {
          message(error.message, true);
          busy(button, false);
        } finally {
          submittingConfirm = false;
        }
      });
      if (autostart && ideaField && ideaField.value.trim()) {
        autostartConfirm = function () {
          if (confirmTriggered || submittingConfirm) return;
          confirmTriggered = true;
          submitForm(confirm);
        };
        window.setTimeout(function () {
          if (proposalTriggered || submittingProposal) return;
          proposalTriggered = true;
          submitForm(form);
        }, 0);
      }
    }
    var cancel = qs('[data-wi-cancel]');
    if (cancel) cancel.addEventListener('click', function () {
      var panel = qs('[data-wi-proposal]');
      if (panel) panel.hidden = true;
      if (ideaField) ideaField.focus();
    });
  }

  function readFavorites() {
    try {
      var raw = window.localStorage.getItem(FAVORITES_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) { return []; }
  }

  function ideaKey(idea) {
    return String((idea && idea.title) || '').trim() + '|' + String((idea && idea.premise) || '').trim();
  }

  function ideaText(idea) {
    return [idea && idea.title, idea && idea.premise].filter(Boolean).join(' — ').slice(0, 1200);
  }

  function isFavorite(idea) { return readFavorites().indexOf(ideaKey(idea)) >= 0; }

  function toggleFavorite(idea) {
    var favorites = readFavorites();
    var key = ideaKey(idea);
    var index = favorites.indexOf(key);
    if (index >= 0) favorites.splice(index, 1);
    else favorites.push(key);
    try { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (error) { return; }
  }

  function metaRow(label, text) {
    var row = element('div');
    row.appendChild(element('strong', '', label));
    row.appendChild(element('span', '', text || '—'));
    return row;
  }

  function renderIdeaCards(ideas) {
    var grid = qs('[data-wi-ideas-grid]');
    if (!grid) return;
    grid.textContent = '';
    var rows = favoritesOnly ? (ideas || []).filter(isFavorite) : (ideas || []);
    if (!rows.length) {
      grid.appendChild(element('div', 'wi-empty', favoritesOnly
        ? 'Aún no hay ideas favoritas. Pulsa FAVORITA en una tarjeta para guardarla aquí.'
        : 'No se generaron ideas. Revisa los parámetros y vuelve a intentarlo.'));
      return;
    }
    rows.forEach(function (idea, index) {
      var favorite = isFavorite(idea);
      var card = element('article', 'wi-idea-card' + (favorite ? ' is-favorite' : ''));
      card.dataset.ideaIndex = String(index);
      var head = element('div', 'wi-idea-card__head');
      head.appendChild(element('span', 'wi-idea-card__index', 'VAR · ' + String(index + 1).padStart(2, '0')));
      head.appendChild(element('h3', '', idea.title || 'Idea sin título'));
      card.appendChild(head);
      card.appendChild(element('p', '', idea.premise || ''));
      var detail = element('div', 'wi-idea-card__meta');
      detail.appendChild(metaRow('Género', idea.genre));
      detail.appendChild(metaRow('Contexto', idea.context));
      detail.appendChild(metaRow('Conflicto', idea.conflict));
      detail.appendChild(metaRow('Elemento inesperado', idea.unexpected_element));
      detail.appendChild(metaRow('Dirección', idea.direction));
      detail.appendChild(metaRow('Imagen sugerida', idea.image_suggestion));
      card.appendChild(detail);
      var tags = element('div', 'wi-idea-card__tags');
      (Array.isArray(idea.tags) ? idea.tags : []).forEach(function (tag) {
        tags.appendChild(element('span', 'wi-tag', tag));
      });
      if (tags.childNodes.length) card.appendChild(tags);
      var actions = element('div', 'wi-idea-card__actions');
      var definitions = [
        ['create', 'CREAR'], ['regen', 'OTRA'], ['mix', 'MEZCLAR'],
        ['darker', 'MÁS OSCURA'], ['absurd', 'ABSURDA'], ['twist', 'GIRO'],
        ['favorite', favorite ? 'QUITAR FAVORITA' : 'FAVORITA']
      ];
      definitions.forEach(function (definition) {
        var button = element('button', 'wi-btn wi-btn--small' + (definition[0] === 'create' ? ' wi-btn--primary' : ''), definition[1]);
        button.type = 'button';
        button.dataset.ideaAction = definition[0];
        button.dataset.ideaIndex = String(index);
        if (definition[0] === 'favorite' && favorite) button.classList.add('wi-btn--signal');
        if (definition[0] === 'create') button.dataset.idea = ideaText(idea);
        actions.appendChild(button);
      });
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  async function generateIdeas(options) {
    var form = qs('[data-wi-ideas-form]');
    if (!form) return;
    var settings = options || {};
    var countField = qs('[data-wi-ideas-count]', form);
    var count = Math.min(8, Math.max(1, Number(countField && countField.value || 4)));
    var payload = {
      count: count,
      genre: qs('[data-wi-ideas-genre]', form) ? qs('[data-wi-ideas-genre]', form).value : '',
      genre_override: qs('[name="genre_override"]', form) ? qs('[name="genre_override"]', form).value : '',
      mode: settings.mode || (qs('[data-wi-ideas-mode]', form) ? qs('[data-wi-ideas-mode]', form).value : 'normal'),
      variation: settings.variation || (qs('[data-wi-ideas-variation]', form) ? qs('[data-wi-ideas-variation]', form).value : 'none'),
      exclude: JSON.stringify(ideaExcludes.slice(-24)),
      idempotency_key: 'ideas-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
    };
    var button = settings.button || qs('[data-wi-ideas-generate]');
    busy(button, true, 'BUSCANDO…');
    try {
      var data = await request('/ideas', payload, 'POST', true, { operation: 'Generar ideas' });
      ideasState = Array.isArray(data.ideas) ? data.ideas : [];
      if (!settings.keepExclude) ideaExcludes = [];
      renderIdeaCards(ideasState);
      var meta = qs('[data-wi-ideas-meta]');
      if (meta) {
        meta.textContent = (data.count || ideasState.length) + ' variantes · '
          + (data.provider || 'motor narrativo') + (data.model ? ' / ' + data.model : '');
      }
      if (ideasState.length) message('Variantes generadas. Puedes crear, mezclar o guardar tus favoritas.');
      else message('El motor no devolvió variantes con esos parámetros.', true);
    } catch (error) {
      message(error.message, true);
    } finally {
      busy(button, false);
    }
  }

  function setupIdeas() {
    var form = qs('[data-wi-ideas-form]');
    if (!form) return;
    ideasState = [];
    ideaExcludes = [];
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      await generateIdeas();
    });
    var favoritesButton = qs('[data-wi-ideas-favorites]');
    if (favoritesButton) favoritesButton.addEventListener('click', function () {
      favoritesOnly = !favoritesOnly;
      favoritesButton.textContent = favoritesOnly ? 'Ver todas' : 'Solo favoritas';
      favoritesButton.classList.toggle('wi-btn--signal', favoritesOnly);
      renderIdeaCards(ideasState);
    });
    var grid = qs('[data-wi-ideas-grid]');
    if (!grid) return;
    grid.addEventListener('click', async function (event) {
      var target = event.target;
      while (target && target !== grid && !(target.matches && target.matches('[data-idea-action]'))) target = target.parentNode;
      if (!target || target === grid || !target.dataset || !target.dataset.ideaAction) return;
      var index = Number(target.dataset.ideaIndex);
      var idea = ideasState[index];
      if (!idea) return;
      var action = target.dataset.ideaAction;
      if (action === 'favorite') {
        toggleFavorite(idea);
        renderIdeaCards(ideasState);
        message(isFavorite(idea) ? 'Idea guardada en favoritas.' : 'Idea retirada de favoritas.');
        return;
      }
      if (action === 'create') {
        var payload = { text: ideaText(idea), genre: idea.genre || '', mode: document.body.dataset.wiMode || 'normal', config: pickConfig(idea) };
        try { window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload)); } catch (error) { return; }
        saveDraft('/what-if/crear', { idea: payload.text });
        window.location.href = '/what-if/crear';
        return;
      }
      var variations = {
        regen: { variation: 'none' },
        mix: { variation: 'mix', mode: 'combinado' },
        darker: { variation: 'darker', mode: 'apocalipsis' },
        absurd: { variation: 'absurd', mode: 'loco' },
        twist: { variation: 'twist' }
      };
      var settings = variations[action];
      if (!settings) return;
      ideaExcludes.push(String(idea.title || ideaText(idea)));
      if (ideaExcludes.length > 40) ideaExcludes.shift();
      settings.keepExclude = true;
      settings.button = target;
      await generateIdeas(settings);
    });
  }

  function setupLibrary() {
    var container = qs('[data-wi-library]');
    if (!container || !qs('[data-wi-filter]')) return;
    var search = qs('[data-wi-search]');
    var filter = qs('[data-wi-filter]');
    window.addEventListener('whatif:library', function (event) {
      var term = (search && search.value || '').toLowerCase();
      var status = filter && filter.value || 'active';
      var rows = (event.detail || []).filter(function (row) {
        return row.status === status && (!term || (row.title + ' ' + row.premise).toLowerCase().indexOf(term) >= 0);
      });
      renderRealityCards(container, rows, { manage: true });
    });
    if (search) search.addEventListener('input', function () { loadLibrary(); });
    if (filter) filter.addEventListener('change', function () { loadLibrary(); });
    loadLibrary();
  }

  function setupExplore() {
    var container = qs('[data-wi-library]');
    if (!container) return;
    window.addEventListener('whatif:library', function (event) { renderRealityCards(container, event.detail || []); });
    loadLibrary();
  }

  function setText(selector, value) {
    var node = qs(selector);
    if (node) node.textContent = value || '';
  }

  function renderList(container, rows, builder, emptyText) {
    if (!container) return;
    container.textContent = '';
    if (!rows || !rows.length) {
      container.appendChild(element('p', 'wi-hint', emptyText || 'Sin registros.'));
      return;
    }
    rows.forEach(function (row) { container.appendChild(builder(row)); });
  }

  function valueFrom(row, keys) {
    if (!row || typeof row !== 'object') return '';
    for (var index = 0; index < keys.length; index += 1) {
      var value = row[keys[index]];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return '';
  }

  function titleFrom(row) {
    return valueFrom(row, ['subject', 'title', 'name', 'label', 'character_a', 'kind', 'type']);
  }

  function textFrom(row) {
    return valueFrom(row, ['content', 'text', 'summary', 'description', 'detail', 'body', 'history', 'personality', 'motivations', 'importance']);
  }

  function normalizeRows(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter(Boolean).map(function (row) {
        return typeof row === 'string' ? { content: row } : row;
      });
    }
    if (typeof value === 'object') {
      var keys = Object.keys(value);
      var named = ['content', 'text', 'summary', 'description', 'subject', 'title', 'name', 'label'];
      if (keys.some(function (key) { return named.indexOf(key) >= 0; })) return [value];
      return keys.reduce(function (all, key) { return all.concat(normalizeRows(value[key])); }, []);
    }
    return [{ content: String(value) }];
  }

  function taggedRows(rows, label) {
    return normalizeRows(rows).map(function (row) { return Object.assign({ kind: label }, row); });
  }

  function sectionRows(code, data) {
    var source = data || state || {};
    return normalizeRows((source.sections || {})[code]);
  }

  function blueprintRows(code, data) {
    var source = data || state || {};
    return normalizeRows((source.blueprint || {})[code]);
  }

  function memoryRows(data) {
    var source = data || state || {};
    var memories = source.memories || {};
    return flattenMemoryCards(source).concat(normalizeRows(memories.current), normalizeRows(memories.chapter));
  }

  function relationshipRows(data) {
    var source = data || state || {};
    return normalizeRows(source.character_relationships).map(function (row) {
      var first = valueFrom(row, ['character_a', 'characterA', 'a', 'source', 'from']);
      var second = valueFrom(row, ['character_b', 'characterB', 'b', 'target', 'to']);
      var relation = valueFrom(row, ['relation', 'relationship', 'relation_type', 'kind', 'status']);
      return {
        kind: 'Relación',
        subject: [first, second].filter(Boolean).join(' · '),
        content: [relation, valueFrom(row, ['description', 'content', 'note'])].filter(Boolean).join(' · ')
      };
    });
  }

  function rowsForTab(tab, data) {
    var source = data || state || {};
    if (tab === 'mundo') {
      var worldSections = ['world', 'culture', 'technology', 'economy', 'religions', 'species', 'flora', 'fauna', 'customs', 'conflicts'];
      return worldSections.reduce(function (all, code) {
        return all.concat(taggedRows(sectionRows(code, source), SECTION_LABELS[code]));
      }, []).concat(blueprintRows('world', source), blueprintRows('situation', source));
    }
    if (tab === 'historia') {
      return taggedRows(sectionRows('history', source), 'Historia')
        .concat(blueprintRows('evolution', source), blueprintRows('premise', source));
    }
    if (tab === 'cronologia') {
      return taggedRows(sectionRows('chronology', source), 'Cronología')
        .concat(taggedRows(sectionRows('timelines', source), 'Línea'));
    }
    if (tab === 'personajes') {
      return normalizeRows(source.characters)
        .concat(sectionRows('characters', source), relationshipRows(source));
    }
    if (tab === 'lugares') return normalizeRows(source.locations).concat(sectionRows('places', source));
    if (tab === 'civilizaciones') return sectionRows('civilizations', source);
    if (tab === 'misterios') return sectionRows('mysteries', source);
    if (tab === 'eventos') return normalizeRows(source.events).concat(sectionRows('events', source));
    if (tab === 'lineas') return normalizeRows(source.timelines).concat(sectionRows('timelines', source));
    if (tab === 'memoria') return memoryRows(source);
    return [];
  }

  function metadataText(row) {
    var meta = valueFrom(row, ['metadata', 'meta', 'location', 'status', 'era', 'date', 'narrative_date', 'importance', 'relation']);
    if (!meta) return '';
    if (Array.isArray(meta)) return meta.map(function (item) { return typeof item === 'object' ? textFrom(item) : String(item); }).filter(Boolean).join(' · ');
    if (typeof meta === 'object') {
      return Object.keys(meta).map(function (key) { return key + ': ' + String(meta[key]); }).join(' · ');
    }
    return String(meta);
  }

  function exploreItem(row) {
    var title = titleFrom(row);
    var body = textFrom(row);
    var kind = valueFrom(row, ['kind', 'type']);
    if (!title && kind) title = String(kind).replace(/_/g, ' ');
    if (!title && !body) return null;
    var item = element('div', 'wi-list__item wi-explore__item');
    if (title) item.appendChild(element('strong', '', kind && String(kind) !== String(title)
      ? String(kind).replace(/_/g, ' ').toUpperCase() + ' · ' + title : title));
    if (body) item.appendChild(element('p', '', body));
    var meta = metadataText(row);
    if (meta) item.appendChild(element('small', '', meta));
    return item;
  }

  function renderExplore(data) {
    EXPLORE_TABS.forEach(function (tab) {
      var box = qs('[data-wi-explore="' + tab + '"]');
      if (!box) return;
      var rows = rowsForTab(tab, data).map(exploreItem).filter(Boolean);
      renderList(box, rows, function (item) { return item; }, 'Esta sección todavía no tiene registros.');
    });
    var blueprintBox = qs('[data-wi-blueprint-chapters]');
    if (blueprintBox) {
      var chapterRows = blueprintRows('narrative', data);
      renderList(blueprintBox, chapterRows, function (row) {
        var item = element('div', 'wi-list__item');
        item.appendChild(element('strong', '', titleFrom(row) || 'Argumento del mundo'));
        item.appendChild(element('p', '', textFrom(row)));
        return item;
      }, 'El argumento aparecerá al generar los primeros capítulos.');
    }
    var timelineBox = qs('[data-wi-timeline-cards]');
    if (timelineBox) {
      renderList(timelineBox, normalizeRows(data.timelines), function (timeline) {
        var item = element('div', 'wi-list__item');
        item.appendChild(element('strong', '', timeline.name || 'Línea temporal'));
        item.appendChild(element('p', '', timeline.divergence_event || 'Línea principal de la realidad.'));
        item.appendChild(element('small', '', valueFrom(timeline, ['status', 'created_at', 'narrative_date'])));
        return item;
      }, 'Solo existe la línea principal.');
    }
  }

  function activateRightTab(button) {
    if (!button) return;
    qsa('[data-wi-tabs-right] button[data-tab]').forEach(function (other) {
      other.classList.toggle('is-active', other === button);
    });
    qsa('[data-wi-right]').forEach(function (panel) {
      panel.hidden = panel.dataset.wiRight !== button.dataset.tab;
    });
  }

  function syncExploreTabs(data) {
    var buttons = qsa('[data-wi-tabs-right] button[data-tab]');
    buttons.forEach(function (button) {
      var tab = button.dataset.tab;
      if (tab === 'reglas') {
        button.hidden = !normalizeRows(data.rules).length;
        return;
      }
      if (EXPLORE_TABS.indexOf(tab) < 0) return;
      button.hidden = rowsForTab(tab, data).length === 0;
    });
    var active = buttons.filter(function (button) { return button.classList.contains('is-active'); })[0];
    if (!active || active.hidden) {
      var first = buttons.filter(function (button) { return !button.hidden; })[0];
      if (first) activateRightTab(first);
    }
  }

  function detailBlock(title, value) {
    var block = element('div', 'wi-detail__block');
    block.appendChild(element('h4', '', title));
    if (Array.isArray(value)) {
      var list = element('ul');
      value.filter(Boolean).forEach(function (item) {
        list.appendChild(element('li', '', typeof item === 'object' ? (textFrom(item) || titleFrom(item)) : item));
      });
      block.appendChild(list);
    } else {
      block.appendChild(element('p', '', value || 'Sin registro.'));
    }
    return block;
  }

  function relatedNames(name, data) {
    var lower = String(name || '').toLowerCase().trim();
    if (!lower) return [];
    return relationshipRows(data).filter(function (row) {
      return String(row.subject).toLowerCase().indexOf(lower) >= 0;
    }).map(function (row) { return row.subject + (row.content ? ' · ' + row.content : ''); });
  }

  function relatedEvents(name, data) {
    var lower = String(name || '').toLowerCase().trim();
    if (!lower) return [];
    return normalizeRows(data.events).filter(function (event) {
      return JSON.stringify(event).toLowerCase().indexOf(lower) >= 0;
    }).map(function (event) {
      return titleFrom(event) + (textFrom(event) ? ' · ' + textFrom(event) : '');
    });
  }

  function showDetail(kind, row, data) {
    var panel = qs('[data-wi-detail]');
    if (!panel) return;
    setText('[data-wi-detail-kind]', kind);
    setText('[data-wi-detail-title]', titleFrom(row) || 'Ficha del mundo');
    var body = qs('[data-wi-detail-body]');
    if (!body) return;
    body.textContent = '';
    var name = valueFrom(row, ['name', 'title', 'subject']);
    var blocks;
    if (kind === 'Personaje') {
      blocks = [
        ['Historia', textFrom(row) || valueFrom(row, ['history', 'backstory', 'identity'])],
        ['Personalidad', valueFrom(row, ['personality', 'traits', 'nature'])],
        ['Relaciones', relatedNames(name, data)],
        ['Objetivos', valueFrom(row, ['motivations', 'goals', 'objectives'])],
        ['Acontecimientos', relatedEvents(name, data)],
        ['Estado', valueFrom(row, ['status', 'condition', 'arc'])]
      ];
    } else {
      blocks = [
        ['Descripción', textFrom(row)],
        ['Ubicación', valueFrom(row, ['location', 'coordinates', 'region'])],
        ['Importancia', valueFrom(row, ['importance', 'significance', 'role'])],
        ['Acontecimientos', relatedEvents(name, data)],
        ['Personajes relacionados', relatedNames(name, data)],
        ['Estado', valueFrom(row, ['status', 'condition'])]
      ];
    }
    blocks.forEach(function (item) {
      var value = item[1];
      if (Array.isArray(value) && !value.length) return;
      if (!Array.isArray(value) && !value) return;
      body.appendChild(detailBlock(item[0], value));
    });
    panel.hidden = false;
    if (panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderChapter(current) {
    if (!current) {
      setText('[data-wi-chapter-number]', 'SIN CAPÍTULOS');
      setText('[data-wi-chapter-title]', 'La historia aún no comienza');
      var content = qs('[data-wi-chapter-content]');
      if (content) content.textContent = 'Usa «Continuar historia» para generar el primer capítulo.';
      return;
    }
    setText('[data-wi-chapter-number]', 'CAPÍTULO ' + current.number);
    setText('[data-wi-chapter-title]', current.title);
    setText('[data-wi-chapter-date]', current.narrative_date);
    var body = qs('[data-wi-chapter-content]');
    if (body) {
      body.textContent = '';
      String(current.content || '').split(/\n\s*\n/).forEach(function (paragraph) {
        var text = paragraph.trim();
        if (!text) return;
        if (/^(-{3,}|\*{3,}|_{3,}|·\s*·\s*·)$/.test(text)) {
          body.appendChild(element('div', 'wi-prose__separator', '◆'));
          return;
        }
        if (/^[-*•]\s+/.test(text)) {
          body.appendChild(element('p', 'wi-prose__bullet', text.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '')));
          return;
        }
        if (/^#{1,4}\s+/.test(text)) {
          body.appendChild(element('h3', 'wi-prose__section', text.replace(/^#{1,4}\s+/, '')));
          return;
        }
        if (/^(>|—|–|"|“|«|')/.test(text)) {
          body.appendChild(element('p', 'wi-prose__quote', text));
          return;
        }
        body.appendChild(element('p', '', text));
      });
    }
  }

  function namesFrom(rows, limit) {
    return (Array.isArray(rows) ? rows : []).filter(function (row) {
      return row && (typeof row === 'string' || row.name || row.title);
    }).slice(0, limit).map(function (row) {
      return typeof row === 'string' ? row : String(row.name || row.title);
    });
  }

  function renderSceneActions(actions) {
    var box = qs('[data-wi-actions]');
    if (!box) return;
    var rows = Array.isArray(actions) && actions.length ? actions : [
      'Observar el entorno antes de moverte',
      'Hablar con alguien presente',
      'Buscar una pista concreta',
      'Hacer algo inesperado'
    ];
    box.textContent = '';
    rows.slice(0, 5).forEach(function (text, index) {
      var action = String(text || '').trim();
      if (!action) return;
      var button = element('button', 'wi-btn wi-btn--action', String(index + 1).padStart(2, '0') + ' · ' + action);
      button.type = 'button';
      button.dataset.wiAction = action;
      box.appendChild(button);
    });
  }

  function applySceneImage(data) {
    var image = qs('[data-wi-scene-image]');
    var canvas = qs('[data-wi-scene-canvas]');
    if (!image) return;
    var assets = Array.isArray(data.assets) ? data.assets : [];
    var asset = null;
    if (data.reality && data.reality.cover_asset_id) {
      asset = assets.filter(function (row) { return String(row.id) === String(data.reality.cover_asset_id); })[0] || { id: data.reality.cover_asset_id };
    }
    if (!asset) asset = assets.filter(function (row) { return String(row.kind) === 'cover'; })[0];
    if (!asset) {
      var located = (Array.isArray(data.locations) ? data.locations : []).filter(function (row) { return row && row.image_asset_id; })[0];
      if (located) asset = { id: located.image_asset_id };
    }
    if (asset && asset.id) {
      image.src = API + '/assets/' + encodeURIComponent(asset.id) + '?guest=' + encodeURIComponent(guestToken);
      image.alt = (data.reality && data.reality.title) || 'Escena de la realidad';
      image.hidden = false;
      if (canvas) canvas.hidden = true;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      if (canvas) canvas.hidden = false;
    }
  }

  function renderScene(data) {
    var simulation = data.simulation || {};
    var chapter = data.chapter || {};
    var sceneNumber = Number(simulation.scene_number || chapter.number || 1);
    var characters = Array.isArray(simulation.characters_present) && simulation.characters_present.length
      ? simulation.characters_present : namesFrom(data.characters, 3);
    var elements = Array.isArray(simulation.interactive_elements) && simulation.interactive_elements.length
      ? simulation.interactive_elements : namesFrom(data.locations, 3).concat(namesFrom(data.events, 2));
    var location = simulation.location || namesFrom(data.locations, 1)[0] || 'Lugar por determinar';
    setText('[data-wi-chapter-number]', 'ESCENA ' + String(sceneNumber).padStart(2, '0'));
    setText('[data-wi-chapter-date]', simulation.narrative_date || chapter.narrative_date || '');
    setText('[data-wi-scene-location]', location);
    setText('[data-wi-scene-date]', simulation.narrative_date || chapter.narrative_date || 'Fecha por confirmar');
    setText('[data-wi-scene-situation]', simulation.situation || chapter.summary || 'La escena acaba de comenzar.');
    setText('[data-wi-scene-characters]', characters.length ? characters.join(' · ') : 'Nadie visible todavía');
    setText('[data-wi-scene-elements]', elements.length ? elements.slice(0, 4).join(' · ') : 'Elementos por descubrir');
    renderSceneActions(simulation.suggested_actions || data.suggested_actions || []);
    applySceneImage(data);
  }

  async function runTurn(text, branch, trigger) {
    if (!state) {
      message('La realidad todavía se está cargando. Inténtalo de nuevo.', true);
      return;
    }
    if (trigger) busy(trigger, true, 'SIMULANDO…');
    try {
      var data = await request('/realities/' + state.reality.id + '/turn', {
        action: text || '',
        timeline: state.timeline_id,
        branch: branch ? 1 : 0,
        idempotency_key: 'turn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      }, 'POST', true, { operation: 'Avanzar escena' });
      activeChapterId = data.chapter && data.chapter.id || 0;
      renderState(data);
      dramaPulse();
      message('Escena guardada. El mundo ha respondido y recuerda tu decisión.');
    } catch (error) {
      message(error.message, true);
    } finally {
      if (trigger) busy(trigger, false);
    }
  }

  function renderProgress(job) {
    var box = qs('[data-wi-progress]');
    if (!box) return;
    var label = qs('.wi-progress__label', box);
    var track = qs('.wi-progress__track', box);
    var fill = qs('.wi-progress__fill', box);
    if (!label) { label = element('span', 'wi-progress__label'); box.appendChild(label); }
    if (!track) {
      track = element('span', 'wi-progress__track');
      fill = element('span', 'wi-progress__fill');
      track.appendChild(fill);
      box.appendChild(track);
    }
    if (!fill) {
      fill = element('span', 'wi-progress__fill');
      track.appendChild(fill);
    }
    var raw = job && job.progress;
    var progress = typeof raw === 'number' ? raw : Number(String(job && job.progress || '').replace('%', ''));
    if (!isFinite(progress)) progress = 0;
    progress = Math.min(100, Math.max(0, progress));
    var stage = String((job && (job.stage || job.status)) || 'GENERANDO');
    label.textContent = stage.toUpperCase() + ' · ' + Math.round(progress) + '%';
    fill.style.width = progress + '%';
    box.classList.add('is-running');
  }

  function clearProgress() {
    var box = qs('[data-wi-progress]');
    if (!box) return;
    var label = qs('.wi-progress__label', box);
    var fill = qs('.wi-progress__fill', box);
    if (label) label.textContent = 'BIBLIOTECA ESTABLE · SIN GENERACIÓN EN CURSO';
    if (fill) fill.style.width = '0%';
    box.classList.remove('is-running');
  }

  function pollJob(jid) {
    return new Promise(function (resolve, reject) {
      var startedAt = Date.now();
      function tick() {
        request('/jobs/' + encodeURIComponent(jid), null, 'GET', false, { operation: 'Estado de generación' })
          .then(function (data) {
            var job = data.job || data;
            renderProgress(job);
            var status = String(job.status || '').toLowerCase();
            if (['done', 'completed', 'finished', 'succeeded', 'complete'].indexOf(status) >= 0
                || (job.progress >= 100 && !status)) {
              resolve(job);
              return;
            }
            if (['error', 'failed', 'cancelled', 'canceled'].indexOf(status) >= 0) {
              reject(new Error(job.error || 'La generación se detuvo antes de completarse.'));
              return;
            }
            if (Date.now() - startedAt > 150000) {
              reject(new Error('La generación tardó demasiado. Comprueba el estado en unos instantes.'));
              return;
            }
            jobTimer = window.setTimeout(tick, 900);
          }, function (error) { reject(error); });
      }
      tick();
    });
  }

  function jobInfoFrom(data) {
    var job = data && data.job ? data.job : (data || {});
    var id = data && (data.job_id || data.jid) || job.id || job.jid || job.job_id || 0;
    return { id: id, job: job, data: data || {} };
  }

  function flattenMemoryCards(data) {
    var source = (data && data.memory_cards) || (data && data.memories) || [];
    var rows = [];
    if (Array.isArray(source)) {
      source.forEach(function (item) { rows.push(typeof item === 'string' ? { content: item } : item); });
    } else if (source && typeof source === 'object') {
      Object.keys(source).forEach(function (kind) {
        var values = Array.isArray(source[kind]) ? source[kind] : [source[kind]];
        values.forEach(function (item) {
          if (typeof item === 'string') rows.push({ kind: kind, content: item });
          else if (item && typeof item === 'object') rows.push(Object.assign({ kind: kind }, item));
        });
      });
    }
    return rows.filter(Boolean);
  }

  function memoryLimit() {
    var limit = Number(findConfigValue('memory_cards_limit'));
    return isFinite(limit) && limit > 0 ? Math.min(limit, 40) : 12;
  }

  function renderMemoryCards(data) {
    var cards = flattenMemoryCards(data).slice(0, memoryLimit());
    [qs('[data-wi-memory-cards]'), qs('[data-wi-studio-memory]')].forEach(function (box) {
      if (!box) return;
      box.textContent = '';
      if (!cards.length) {
        box.appendChild(element('p', 'wi-hint', 'Sin fichas de memoria registradas todavía.'));
        return;
      }
      cards.forEach(function (card) {
        var item = element('div', 'wi-list__item wi-memory-card');
        var kind = String(card.kind || card.source || 'memoria').replace(/_/g, ' ');
        item.appendChild(element('span', 'wi-memory-card__kind', kind));
        item.appendChild(element('p', '', card.content || card.text || card.summary || ''));
        if (card.narrative_date || card.created_at) {
          item.appendChild(element('small', '', card.narrative_date || card.created_at));
        }
        box.appendChild(item);
      });
    });
  }

  function renderConfigBadges(config, modes) {
    var box = qs('[data-wi-modes]');
    if (!box) return;
    box.textContent = '';
    var mode = modeFromSource({ narrative_config: config, modes: modes });
    var badges = [{ text: modeLabel(mode), className: 'wi-badge' }];
    if (boolValue(config.apocalypse)) {
      badges.push({ text: 'APOCALIPSIS N' + (config.apocalypse_level || 0), className: 'wi-badge wi-badge--orange' });
    }
    if (boolValue(config.crazy)) {
      badges.push({ text: 'LOCURA N' + (config.crazy_level || 0), className: 'wi-badge wi-badge--violet' });
    }
    if (boolValue(config.unlimited)) {
      badges.push({ text: 'SIN LÍMITES', className: 'wi-badge wi-badge--acid' });
    }
    if (config.surprise_frequency) {
      badges.push({ text: 'SORPRESA ' + String(config.surprise_frequency).toUpperCase(), className: 'wi-badge wi-badge--acid' });
    }
    if (config.point_of_view) {
      badges.push({ text: 'POV ' + String(config.point_of_view).toUpperCase(), className: 'wi-badge' });
    }
    badges.forEach(function (badge) { box.appendChild(element('span', badge.className, badge.text)); });
  }

  function renderState(data) {
    state = data;
    var reality = data.reality || {};
    var config = narrativeConfigFrom(data);
    setText('[data-wi-title]', reality.title);
    setText('[data-wi-reality-code]', 'REALIDAD ' + reality.code + ' · ' + reality.genre);
    var premise = qs('[data-wi-premise]');
    if (premise) premise.textContent = reality.premise || '';
    var studio = qs('[data-wi-studio]');
    if (studio) studio.href = '/what-if/studio/' + reality.id;
    var openRoom = qs('[data-wi-open-room]');
    if (openRoom && reality.id) openRoom.href = '/what-if/espacio/' + reality.id;
    var timelineSelect = qs('[data-wi-timeline]');
    if (timelineSelect) {
      timelineSelect.textContent = '';
      (data.timelines || []).forEach(function (timeline) {
        var option = element('option', '', timeline.name);
        option.value = timeline.id;
        if (timeline.id === data.timeline_id) option.selected = true;
        timelineSelect.appendChild(option);
      });
      timelineSelect.onchange = async function () {
        try {
          await request('/realities/' + reality.id + '/update', { status: 'active' });
          window.location.href = '/what-if/espacio/' + reality.id + '?timeline=' + timelineSelect.value;
        } catch (error) { message(error.message, true); }
      };
    }
    var stability = data.stability;
    if (stability && typeof stability === 'object') {
      stability = stability.value !== undefined ? stability.value : (stability.percent !== undefined ? stability.percent : stability.score);
    }
    if (stability === undefined || stability === null || stability === '') stability = computeStability(config);
    setText('[data-wi-stability]', typeof stability === 'number' ? stability.toFixed(1) + '%' : String(stability));
    renderConfigBadges(config, data.modes);
    if (data.progress) renderProgress(data.progress); else clearProgress();
    fillConfigInputs(qs('[data-wi-modes-form]'), config);
    renderChapter(data.chapter);
    renderScene(data);
    renderList(qs('[data-wi-chapters]'), data.chapters || [], function (chapter) {
      var item = element('div', 'wi-list__item' + (data.chapter && chapter.id === data.chapter.id ? ' is-active' : ''));
      item.appendChild(element('strong', '', chapter.number + '. ' + chapter.title));
      item.appendChild(element('p', '', chapter.summary));
      item.appendChild(element('small', '', chapter.narrative_date));
      item.addEventListener('click', function () { loadSpace(chapter.id); });
      return item;
    }, 'Aún no hay capítulos en esta línea temporal.');
    renderList(qs('[data-wi-timelines]'), data.timelines || [], function (timeline) {
      var item = element('div', 'wi-list__item' + (timeline.id === data.timeline_id ? ' is-active' : ''));
      item.appendChild(element('strong', '', timeline.name));
      item.appendChild(element('p', '', timeline.divergence_event || 'Línea principal de la realidad.'));
      return item;
    });
    renderList(qs('[data-wi-characters]'), data.characters || [], function (character) {
      var item = element('div', 'wi-list__item wi-list__item--action');
      item.appendChild(element('strong', '', character.name));
      item.appendChild(element('p', '', character.personality || character.identity || character.description));
      item.appendChild(element('small', '', character.status));
      var portrait = element('button', 'wi-btn wi-btn--small', 'RETRATO');
      portrait.type = 'button';
      portrait.addEventListener('click', function (event) {
        event.stopPropagation();
        generateAsset('portrait', character.id);
      });
      item.appendChild(portrait);
      item.addEventListener('click', function () { showDetail('Personaje', character, data); });
      return item;
    }, 'Todavía no hay personajes registrados.');
    renderList(qs('[data-wi-locations]'), data.locations || [], function (location) {
      var item = element('div', 'wi-list__item wi-list__item--action');
      item.appendChild(element('strong', '', location.name));
      item.appendChild(element('p', '', location.description));
      item.appendChild(element('small', '', location.kind + ' · ' + location.status));
      item.addEventListener('click', function () { showDetail('Lugar', location, data); });
      return item;
    }, 'Todavía no hay lugares registrados.');
    renderList(qs('[data-wi-events]'), data.events || [], function (event) {
      var item = element('div', 'wi-list__item');
      item.appendChild(element('strong', '', event.title));
      item.appendChild(element('p', '', event.description));
      item.appendChild(element('small', '', event.narrative_date + ' · ' + event.status));
      return item;
    }, 'Aún no hay acontecimientos.');
    renderList(qs('[data-wi-rules]'), data.rules || [], function (rule) {
      var item = element('div', 'wi-list__item');
      item.appendChild(element('strong', '', String(rule.kind).toUpperCase() + (rule.active ? '' : ' · RETIRADA')));
      item.appendChild(element('p', '', rule.text));
      return item;
    }, 'Aún no hay reglas.');
    var currentMemory = (data.memories && data.memories.current) || [];
    var chapterMemory = (data.memories && data.memories.chapter) || [];
    setText('[data-wi-current]', currentMemory.length ? currentMemory[0].content : 'Sin estado actual registrado.');
    var memoryBox = qs('[data-wi-memory-chapter]');
    if (memoryBox) {
      memoryBox.textContent = '';
      chapterMemory.slice(0, 5).forEach(function (memory) { memoryBox.appendChild(element('p', '', memory.content)); });
      if (!chapterMemory.length) memoryBox.appendChild(element('p', '', 'Las memorias aparecerán al generar capítulos.'));
    }
    renderMemoryCards(data);
    syncExploreTabs(data);
    renderExplore(data);
    renderStudioPanels(data);
  }

  function renderStudioPanels(data) {
    var reality = data.reality || {};
    qsa('[data-wi-meta]').forEach(function (field) { field.value = reality[field.dataset.wiMeta] || ''; });
    setText('[data-wi-title]', reality.title);
    renderList(qs('.wi-studio [data-wi-rules]'), data.rules || [], function (rule) {
      var item = element('div', 'wi-list__item');
      item.appendChild(element('strong', '', rule.kind + (rule.active ? '' : ' · retirada')));
      item.appendChild(element('p', '', rule.text));
      return item;
    });
    renderList(qs('.wi-studio [data-wi-characters]'), data.characters || [], function (character) {
      var item = element('div', 'wi-list__item');
      item.appendChild(element('strong', '', character.name + ' · ' + character.status));
      item.appendChild(element('p', '', [character.identity, character.personality, character.motivations].filter(Boolean).join(' · ')));
      return item;
    });
    renderList(qs('.wi-studio [data-wi-locations]'), data.locations || [], function (location) {
      var item = element('div', 'wi-list__item');
      item.appendChild(element('strong', '', location.name));
      item.appendChild(element('p', '', location.description));
      return item;
    });
    renderList(qs('[data-wi-events]'), data.events || [], function (event) {
      var item = element('div', 'wi-list__item');
      item.appendChild(element('strong', '', event.title));
      item.appendChild(element('p', '', event.consequences || event.description));
      return item;
    });
    renderList(qs('[data-wi-interventions]'), data.interventions || [], function (intervention) {
      var item = element('div', 'wi-list__item');
      item.appendChild(element('strong', '', intervention.intent + ' · ' + intervention.status));
      item.appendChild(element('p', '', intervention.user_text));
      return item;
    });
    renderList(qs('.wi-studio [data-wi-versions]'), data.versions || [], function (version) {
      var item = element('div', 'wi-list__item');
      item.appendChild(element('strong', '', version.action + ' · ' + version.entity_type));
      item.appendChild(element('p', '', version.note));
      item.appendChild(element('small', '', version.created_at));
      return item;
    });
    var timelineTargets = [qs('[data-wi-compare-left]'), qs('[data-wi-compare-right]')];
    timelineTargets.forEach(function (select) {
      if (!select) return;
      select.textContent = '';
      (data.timelines || []).forEach(function (timeline, index) {
        var option = element('option', '', timeline.name);
        option.value = timeline.id;
        if (index === 0 && select === timelineTargets[0]) option.selected = true;
        if (index === (data.timelines || []).length - 1 && select === timelineTargets[1]) option.selected = true;
        select.appendChild(option);
      });
    });
  }

  async function loadSpace(chapterId) {
    var root = qs('[data-wi-room][data-reality-id]');
    if (!root) return;
    var realityId = root.dataset.realityId;
    activeChapterId = chapterId || activeChapterId;
    try {
      var path = '/realities/' + realityId;
      var data = await request(path, activeChapterId ? { chapter: activeChapterId } : null, 'GET');
      renderState(data);
    } catch (error) {
      message(error.message, true);
    }
  }

  function setupTabs(group) {
    qsa(group + ' button[data-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        qsa(group + ' button[data-tab]').forEach(function (other) { other.classList.toggle('is-active', other === button); });
        qsa('[data-wi-tab-content]').forEach(function (panel) {
          panel.hidden = panel.dataset.wiTabContent !== button.dataset.tab;
        });
      });
    });
  }

  function setupRightTabs() {
    qsa('[data-wi-tabs-right] button[data-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.hidden) return;
        activateRightTab(button);
      });
    });
  }

  async function generateAsset(kind, entityId) {
    if (!state) return;
    var labels = { cover: 'La portada', map: 'El mapa', portrait: 'El retrato' };
    var label = labels[kind] || 'El recurso visual';
    message(label + ' se está preparando en la biblioteca…');
    try {
      var data = await request('/realities/' + state.reality.id + '/assets', {
        kind: kind,
        entity: entityId || 0,
        async: '1',
        idempotency_key: 'asset-' + kind + '-' + (entityId || 0) + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      }, 'POST', true, { operation: 'Generar ' + label });
      var info = jobInfoFrom(data);
      if (info.id) {
        message(label + ' está en la cola. Puedes seguir leyendo mientras se dibuja.');
        var finished = await pollJob(info.id);
        if (finished && finished.error) throw new Error(finished.error);
        clearProgress();
      } else if (data.provider === 'schematic') {
        message(label + ' esquemático listo en la biblioteca.');
      }
      message(label + ' listo. Actualizando el mundo…');
      if (qs('[data-wi-room]')) await loadSpace();
      else if (qs('[data-wi-studio][data-reality-id]')) await loadStudio();
    } catch (error) {
      clearProgress();
      message(error.message, true);
    }
  }

  function dramaPulse() {
    var stage = qs('.wi-stage');
    if (stage) {
      stage.classList.remove('wi-stage--surge');
      void stage.offsetWidth;
      stage.classList.add('wi-stage--surge');
      window.setTimeout(function () { stage.classList.remove('wi-stage--surge'); }, 1600);
    }
    if (document.body) {
      document.body.dataset.wiEvent = 'surprise';
      window.setTimeout(function () { delete document.body.dataset.wiEvent; }, 2400);
    }
  }

  function setupSpace() {
    if (!qs('[data-wi-room]')) return;
    setupTabs('[data-wi-tabs-left]');
    setupRightTabs();
    var detailClose = qs('[data-wi-detail-close]');
    if (detailClose) detailClose.addEventListener('click', function () {
      var panel = qs('[data-wi-detail]');
      if (panel) panel.hidden = true;
    });
    activeChapterId = Number(new URLSearchParams(window.location.search).get('chapter') || 0);
    loadSpace();

    var continueButton = qs('[data-wi-continue]');
    if (continueButton) continueButton.addEventListener('click', function () {
      runTurn('', false, continueButton);
    });

    var actions = qs('[data-wi-actions]');
    if (actions) actions.addEventListener('click', function (event) {
      var button = event.target.closest('[data-wi-action]');
      if (button) runTurn(button.dataset.wiAction, false, button);
    });

    var actionForm = qs('[data-wi-action-form]');
    if (actionForm) actionForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var field = qs('textarea[name="action"]', actionForm);
      var branch = qs('input[name="branch"]', actionForm);
      var button = qs('button[type="submit"]', actionForm);
      var text = field ? field.value.trim() : '';
      if (!text) {
        message('Escribe una acción para que el mundo pueda responder.', true);
        return;
      }
      if (field) field.value = '';
      runTurn(text, Boolean(branch && branch.checked), button);
    });

    var surprise = qs('[data-wi-surprise]');
    if (surprise) surprise.addEventListener('click', async function () {
      if (!state) return;
      busy(surprise, true, 'SORPRENDIENDO…');
      try {
        var interventionId = 'surprise-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        var data = await request('/realities/' + state.reality.id + '/interventions', {
          text: 'Introduce una anomalía inesperada respetando la continuidad',
          timeline: state.timeline_id,
          idempotency_key: interventionId
        });
        if (!data.proposal || !data.intervention_id) {
          message('El motor no propuso una sorpresa compatible. El estado no cambió.', true);
          return;
        }
        var applied = await request('/realities/' + state.reality.id + '/interventions/' + data.intervention_id + '/apply', {
          branch: data.proposal.branch_required ? 1 : 0,
          idempotency_key: 'apply-' + data.intervention_id
        });
        activeChapterId = applied.chapter && applied.chapter.id || 0;
        await loadSpace(activeChapterId);
        dramaPulse();
        message('Sorpresa integrada y registrada en la continuidad.');
      } catch (error) {
        message(error.message, true);
      } finally { busy(surprise, false); }
    });

    var interventionForm = qs('[data-wi-intervention-form]');
    if (interventionForm) interventionForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      var button = qs('button[type="submit"]', interventionForm);
      busy(button, true, 'ANALIZANDO…');
      try {
        var payload = {};
        qsa('input[name], textarea[name]', interventionForm).forEach(function (field) { payload[field.name] = field.value; });
        payload.timeline = state.timeline_id;
        payload.idempotency_key = 'interv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        var data = await request('/realities/' + state.reality.id + '/interventions', payload);
        pendingIntervention = data;
        renderIntervention(data.proposal);
        message('Propuesta lista. Revísala antes de aplicar cambios.');
      } catch (error) { message(error.message, true); }
      finally { busy(button, false); }
    });

    var branchForm = qs('[data-wi-branch-form]');
    if (branchForm) branchForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      var payload = {};
      qsa('input[name]', branchForm).forEach(function (field) { payload[field.name] = field.value; });
      payload.timeline = state.timeline_id;
      try {
        var data = await request('/realities/' + state.reality.id + '/timelines', payload);
        message('Línea temporal creada. La original se conserva.');
        await loadSpace();
      } catch (error) { message(error.message, true); }
    });

    var cover = qs('[data-wi-generate-image]');
    if (cover) cover.addEventListener('click', function () { generateAsset('cover'); });
    var map = qs('[data-wi-generate-map]');
    if (map) map.addEventListener('click', function () { generateAsset('map'); });

    var versions = qs('[data-wi-versions]');
    if (versions) versions.addEventListener('click', async function () {
      if (!state.chapter) return;
      try {
        var data = await request('/realities/' + state.reality.id + '/chapter/' + state.chapter.id + '/versions');
        var panel = qs('[data-wi-versions-panel]');
        panel.textContent = '';
        panel.hidden = false;
        data.versions.forEach(function (version) {
          var row = element('div', 'wi-list__item');
          row.appendChild(element('strong', '', version.note || version.provider));
          row.appendChild(element('small', '', version.created_at + ' · ' + version.chars + ' caracteres'));
          var restore = element('button', 'wi-btn wi-btn--small', 'RECUPERAR COMO NUEVA VERSIÓN');
          restore.type = 'button';
          restore.addEventListener('click', async function () {
            try {
              await request('/realities/' + state.reality.id + '/versions/' + version.id + '/restore', { chapter: state.chapter.id });
              message('Versión recuperada; la anterior sigue en el historial.');
              await loadSpace(state.chapter.id);
              panel.hidden = true;
            } catch (error) { message(error.message, true); }
          });
          row.appendChild(restore);
          panel.appendChild(row);
        });
      } catch (error) { message(error.message, true); }
    });
  }

  function renderIntervention(proposal) {
    var panel = qs('[data-wi-intervention-proposal]');
    if (!panel) return;
    panel.textContent = '';
    panel.hidden = false;
    panel.appendChild(element('h3', '', 'Cambios propuestos · ' + proposal.intent));
    panel.appendChild(element('p', '', proposal.summary));
    var list = element('ul');
    (proposal.consequences || []).forEach(function (item) { list.appendChild(element('li', '', item)); });
    panel.appendChild(list);
    var actions = element('div', 'wi-actions');
    var apply = element('button', 'wi-btn wi-btn--primary', proposal.branch_required ? 'APLICAR EN NUEVA LÍNEA' : 'APLICAR CAMBIOS');
    apply.type = 'button';
    apply.addEventListener('click', async function () {
      busy(apply, true, 'APLICANDO…');
      try {
        var data = await request('/realities/' + state.reality.id + '/interventions/' + pendingIntervention.intervention_id + '/apply', {
          branch: proposal.branch_required ? 1 : 0,
          idempotency_key: 'apply-' + pendingIntervention.intervention_id
        });
        pendingIntervention = null;
        panel.hidden = true;
        activeChapterId = data.chapter && data.chapter.id || 0;
        await loadSpace(activeChapterId);
        message(data.branched ? 'Cambio aplicado en una nueva línea temporal.' : 'Cambio aplicado y registrado.');
      } catch (error) { message(error.message, true); busy(apply, false); }
    });
    var reject = element('button', 'wi-btn wi-btn--ghost', 'DESCARTAR PROPUESTA');
    reject.type = 'button';
    reject.addEventListener('click', async function () {
      try {
        await request('/realities/' + state.reality.id + '/interventions/' + pendingIntervention.intervention_id + '/reject', {});
        pendingIntervention = null;
        panel.hidden = true;
        message('Propuesta descartada; el estado no cambió.');
      } catch (error) { message(error.message, true); }
    });
    actions.appendChild(apply);
    actions.appendChild(reject);
    panel.appendChild(actions);
  }

  async function loadStudio() {
    var root = qs('[data-wi-studio][data-reality-id]');
    if (!root) return;
    try {
      var data = await request('/realities/' + root.dataset.realityId);
      renderState(data);
    } catch (error) { message(error.message, true); }
  }

  function setupStudio() {
    if (!qs('[data-wi-studio][data-reality-id]')) return;
    var root = qs('[data-wi-studio][data-reality-id]');
    loadStudio();
    var open = qs('[data-wi-open-room]');
    if (open && root.dataset.realityId) open.href = '/what-if/espacio/' + root.dataset.realityId;
    var metaForm = qs('[data-wi-meta-form]');
    if (metaForm) metaForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      var payload = {};
      qsa('input[name], textarea[name]', metaForm).forEach(function (field) { payload[field.name] = field.value; });
      try {
        await request('/realities/' + root.dataset.realityId + '/update', payload);
        message('Cambios guardados.');
        await loadStudio();
      } catch (error) { message(error.message, true); }
    });
    var modesForm = qs('[data-wi-modes-form]');
    if (modesForm) {
      qsa('[data-wi-range]', modesForm).forEach(function (field) {
        field.addEventListener('input', function () {
          var output = qs('[data-wi-range-output="' + field.dataset.wiRange + '"]', modesForm);
          if (output) output.textContent = field.value;
        });
      });
      modesForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var payload = readConfigForm(modesForm);
        delete payload.narrative_config;
        var button = qs('button[type="submit"]', modesForm);
        busy(button, true, 'GUARDANDO MODOS…');
        try {
          var data = await request('/realities/' + root.dataset.realityId + '/modes', payload, 'POST', true, { operation: 'Guardar modos' });
          var config = narrativeConfigFrom(data.narrative_config || data.config || data.modes || payload);
          fillConfigInputs(modesForm, config);
          setWiMode(modeFromSource(config));
          if (state) {
            state.narrative_config = config;
            renderConfigBadges(config, data.modes || state.modes);
          }
          message('Modos y parámetros guardados.');
          await loadStudio();
        } catch (error) {
          message(error.message, true);
        } finally { busy(button, false); }
      });
    }
    var map = qs('[data-wi-generate-map]');
    if (map) map.addEventListener('click', function () { generateAsset('map'); });
    var compare = qs('[data-wi-compare]');
    if (compare) compare.addEventListener('click', async function () {
      var left = qs('[data-wi-compare-left]');
      var right = qs('[data-wi-compare-right]');
      try {
        var data = await request('/realities/' + root.dataset.realityId + '/timelines/' + left.value + '/compare', { other: right.value }, 'GET');
        var box = qs('[data-wi-compare-result]');
        box.textContent = '';
        box.appendChild(element('p', '', 'Capítulos: ' + data.differences.chapter_count_left + ' frente a ' + data.differences.chapter_count_right));
        box.appendChild(element('p', '', 'Solo en la izquierda: ' + (data.differences.only_left_events.join(', ') || 'ninguno')));
        box.appendChild(element('p', '', 'Solo en la derecha: ' + (data.differences.only_right_events.join(', ') || 'ninguno')));
        box.appendChild(element('p', '', 'Divergencia: ' + (data.differences.divergence_right || 'sin registrar')));
      } catch (error) { message(error.message, true); }
    });
  }

  async function start() {
    try { guestToken = window.localStorage.getItem(GUEST_KEY) || ''; } catch (error) { guestToken = ''; }
    setupIdeaButtons();
    await init();
    setupHome();
    setupCreate();
    setupExplore();
    setupLibrary();
    setupIdeas();
    setupSpace();
    setupStudio();
    if (jobTimer) window.clearTimeout(jobTimer);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
