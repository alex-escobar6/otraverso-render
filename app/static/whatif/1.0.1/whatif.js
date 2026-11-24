(function () {
  'use strict';

  var API = '/api/what-if/v1';
  var GUEST_KEY = 'otraverso.whatif.guest.v1';
  var guestToken = '';
  var csrfToken = '';
  var configReady = false;
  var state = null;
  var activeChapterId = 0;
  var pendingProposal = null;
  var pendingIntervention = null;

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

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

  function isIdentityError(status, detail) {
    return (status === 400 || status === 401) && /seguridad|invitado|csrf|sesi[oó]n/i.test(detail);
  }

  function applyConfig(config) {
    csrfToken = config.csrf || csrfToken;
    qsa('input[name="csrf"]').forEach(function (input) { input.value = csrfToken; });
    var ai = config.ai || {};
    var note = qs('[data-wi-ai-status]');
    if (note) {
      note.textContent = 'Motor: ' + (ai.text_provider === 'local'
        ? 'narrativo local determinista, sin credenciales externas'
        : (ai.text_configured ? ai.text_provider + ' · ' + ai.text_model : ai.text_provider + ' sin configurar'));
    }
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

  async function request(path, form, method, canRetry) {
    var verb = method || (form ? 'POST' : 'GET');
    var retry = canRetry !== false;
    var params = new URLSearchParams();
    if (guestToken) params.set('guest', guestToken);
    if (form) {
      Object.keys(form).forEach(function (key) {
        if (form[key] !== undefined && form[key] !== null) params.set(key, String(form[key]));
      });
    }
    if (verb === 'POST' && csrfToken) params.set('csrf', csrfToken);
    var options = { method: verb, credentials: 'same-origin' };
    if (guestToken) options.headers = { 'X-WHATIF-GUEST': guestToken };
    if (verb === 'POST') options.body = params.toString();
    var url = API + path + (verb === 'GET' ? '?' + params.toString() : '');
    var response = await withTimeout(fetch(url, options), 90000);
    var data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error('El servidor no devolvió una respuesta válida (' + response.status + ').');
    }
    if (!response.ok || data.ok === false) {
      var detail = data.error || data.message || 'No fue posible completar la operación.';
      if (retry && isIdentityError(response.status, detail)) {
        guestToken = '';
        csrfToken = '';
        configReady = false;
        try { window.localStorage.removeItem(GUEST_KEY); } catch (error) { guestToken = ''; }
        await refreshIdentity();
        return request(path, form, method, false);
      }
      throw new Error(detail);
    }
    return data;
  }

  async function init() {
    try {
      return await refreshIdentity();
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

  function setupIdeaButtons() {
    qsa('[data-idea]').forEach(function (button) {
      button.addEventListener('click', function () {
        var field = qs('#wi-idea');
        if (field) {
          field.value = button.dataset.idea;
          field.focus();
        } else {
          window.location.href = '/what-if/crear';
        }
      });
    });
  }

  function setupHome() {
    var container = qs('[data-wi-featured]');
    if (!container) return;
    window.addEventListener('whatif:library', function (event) {
      renderRealityCards(container, event.detail, { limit: 3, empty: 'Aún no has creado realidades en este navegador o cuenta.' });
    });
    loadLibrary();
  }

  function renderProposal(proposal, providerName) {
    pendingProposal = proposal;
    var panel = qs('[data-wi-proposal]');
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
  }

  function setupCreate() {
    var form = qs('[data-wi-create-form]');
    if (!form) return;
    var proposalKey = 'proposal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var button = qs('button[type="submit"]', form);
      busy(button, true, 'PREPARANDO PROPUESTA…');
      try {
        var payload = {};
        qsa('input[name], textarea[name], select[name]', form).forEach(function (field) { payload[field.name] = field.value; });
        payload.idempotency_key = proposalKey;
        var data = await request('/proposals', payload);
        renderProposal(data.proposal, data.provider);
        message('Propuesta lista. Puedes ajustarla antes de crear la realidad.');
      } catch (error) {
        message(error.message, true);
      } finally {
        busy(button, false);
      }
    });
    var confirm = qs('[data-wi-confirm-form]');
    if (confirm) {
      confirm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var button = qs('button[type="submit"]', confirm);
        busy(button, true, 'CONSTRUYENDO REALIDAD…');
        try {
          var payload = {};
          qsa('input[name], textarea[name]', confirm).forEach(function (field) { payload[field.name] = field.value; });
          payload.rules = JSON.stringify((payload.rules_text || '').split('\n').map(function (line) { return line.trim(); }).filter(Boolean).map(function (text) { return { text: text, kind: 'established' }; }));
          payload.idempotency_key = proposalKey + ':realities';
          var data = await request('/realities', payload);
          message('Realidad creada. Abriendo la sala narrativa…');
          window.location.href = '/what-if/espacio/' + data.reality.id;
        } catch (error) {
          message(error.message, true);
          busy(button, false);
        }
      });
    }
    var cancel = qs('[data-wi-cancel]');
    if (cancel) cancel.addEventListener('click', function () { qs('[data-wi-proposal]').hidden = true; qs('#wi-idea').focus(); });
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
        if (paragraph.trim()) body.appendChild(element('p', '', paragraph.trim()));
      });
    }
  }

  function renderState(data) {
    state = data;
    var reality = data.reality || {};
    setText('[data-wi-title]', reality.title);
    setText('[data-wi-reality-code]', 'REALIDAD ' + reality.code + ' · ' + reality.genre);
    var premise = qs('[data-wi-premise]');
    if (premise) premise.textContent = reality.premise || '';
    var studio = qs('[data-wi-studio]');
    if (studio) studio.href = '/what-if/studio/' + reality.id;
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
    renderChapter(data.chapter);
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
      var item = element('div', 'wi-list__item');
      item.appendChild(element('strong', '', character.name));
      item.appendChild(element('p', '', character.personality || character.identity || character.description));
      item.appendChild(element('small', '', character.status));
      var portrait = element('button', 'wi-btn wi-btn--small', 'RETRATO');
      portrait.type = 'button';
      portrait.addEventListener('click', function () { generateAsset('portrait', character.id); });
      item.appendChild(portrait);
      return item;
    }, 'Todavía no hay personajes registrados.');
    renderList(qs('[data-wi-locations]'), data.locations || [], function (location) {
      var item = element('div', 'wi-list__item');
      item.appendChild(element('strong', '', location.name));
      item.appendChild(element('p', '', location.description));
      item.appendChild(element('small', '', location.kind + ' · ' + location.status));
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
      item.appendChild(element('strong', '', rule.kind.toUpperCase() + (rule.active ? '' : ' · RETIRADA')));
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
    var root = qs('[data-wi-room]');
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
        qsa('[data-wi-tabs-right] button[data-tab]').forEach(function (other) { other.classList.toggle('is-active', other === button); });
        qsa('[data-wi-right]').forEach(function (panel) { panel.hidden = panel.dataset.wiRight !== button.dataset.tab; });
      });
    });
  }

  async function generateAsset(kind, entityId) {
    if (!state) return;
    message('Preparando recurso visual…');
    try {
      var data = await request('/realities/' + state.reality.id + '/assets', { kind: kind, entity: entityId || 0 });
      message(data.provider === 'schematic' ? 'Mapa o portada esquemática generada localmente.' : 'Imagen generada por el proveedor configurado.');
      await loadSpace();
    } catch (error) { message(error.message, true); }
  }

  function setupSpace() {
    if (!qs('[data-wi-room]')) return;
    setupTabs('[data-wi-tabs-left]');
    setupRightTabs();
    activeChapterId = Number(new URLSearchParams(window.location.search).get('chapter') || 0);
    loadSpace();

    var continueButton = qs('[data-wi-continue]');
    if (continueButton) continueButton.addEventListener('click', async function () {
      busy(continueButton, true, 'GENERANDO CAPÍTULO…');
      message('Preparando contexto…');
      try {
        var data = await request('/realities/' + state.reality.id + '/chapter', { timeline: state.timeline_id });
        activeChapterId = data.chapter.id;
        await loadSpace(activeChapterId);
        message('Capítulo guardado con continuidad y memoria actualizada.');
      } catch (error) { message(error.message, true); }
      finally { busy(continueButton, false); }
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
    var root = qs('[data-wi-studio]');
    if (!root) return;
    try {
      var data = await request('/realities/' + root.dataset.realityId);
      renderState(data);
    } catch (error) { message(error.message, true); }
  }

  function setupStudio() {
    if (!qs('[data-wi-studio]')) return;
    loadStudio();
    var open = qs('[data-wi-open-room]');
    if (open && state) open.href = '/what-if/espacio/' + state.reality.id;
    var metaForm = qs('[data-wi-meta-form]');
    if (metaForm) metaForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      var payload = {};
      qsa('input[name], textarea[name]', metaForm).forEach(function (field) { payload[field.name] = field.value; });
      try {
        await request('/realities/' + qs('[data-wi-studio]').dataset.realityId + '/update', payload);
        message('Cambios guardados.');
        await loadStudio();
      } catch (error) { message(error.message, true); }
    });
    var map = qs('[data-wi-generate-map]');
    if (map) map.addEventListener('click', async function () {
      try {
        await request('/realities/' + qs('[data-wi-studio]').dataset.realityId + '/assets', { kind: 'map' });
        message('Mapa esquemático guardado.');
        await loadStudio();
      } catch (error) { message(error.message, true); }
    });
    var compare = qs('[data-wi-compare]');
    if (compare) compare.addEventListener('click', async function () {
      var left = qs('[data-wi-compare-left]');
      var right = qs('[data-wi-compare-right]');
      try {
        var data = await request('/realities/' + qs('[data-wi-studio]').dataset.realityId + '/timelines/' + left.value + '/compare', { other: right.value }, 'GET');
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
    setupSpace();
    setupStudio();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
