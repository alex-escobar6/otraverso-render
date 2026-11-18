(function (global) {
  'use strict';

  var O = global.OTRAVERSO;
  if (!O) return;

  var doc = global.document;
  var root = doc.querySelector('[data-universe-root]');
  if (!root) return;

  var selected = null;
  var bound = false;
  var dossier = root.querySelector('[data-dossier]');

  function all(selector) {
    return Array.prototype.slice.call(root.querySelectorAll(selector));
  }

  function text(selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = value || '';
  }

  function showDossier(button) {
    if (!dossier || !button) return;
    text('[data-dossier-state]', button.getAttribute('data-status') || 'UNIVERSO');
    text('[data-dossier-name]', button.getAttribute('data-name') || 'OTRAVERSO');
    text('[data-dossier-tagline]', button.getAttribute('data-tagline') || '');
    text('[data-dossier-description]', button.getAttribute('data-description') || '');
    var cta = dossier.querySelector('[data-dossier-cta]');
    var dialog = dossier.querySelector('[data-dossier-dialog]');
    var available = button.getAttribute('data-available') === '1';
    if (cta) {
      cta.hidden = !available;
      if (available) cta.href = button.getAttribute('data-href') || '/shop';
    }
    if (dialog) dialog.hidden = available;
    dossier.hidden = false;
  }

  function hideDossier() {
    if (dossier) dossier.hidden = true;
  }

  function closeDialogs() {
    all('[data-dialog-panel]').forEach(function (panel) { panel.hidden = true; });
  }

  function openDialog(code) {
    closeDialogs();
    var panel = root.querySelector('[data-dialog-panel="' + code + '"]');
    if (!panel) {
      var href = '/universos/' + code;
      global.location.assign(href);
      return;
    }
    panel.hidden = false;
  }

  function select(button) {
    if (!button) return;
    if (selected && selected !== button) selected.classList.remove('is-selected');
    selected = button;
    button.classList.add('is-selected');
    root.setAttribute('data-active-portal', button.getAttribute('data-portal') || '');
    all('[data-portal]').forEach(function (node) {
      if (node !== button) node.classList.remove('is-selected');
    });
    showDossier(button);
  }

  function travel(button) {
    if (!button) return;
    var href = button.getAttribute('data-href') || '/shop';
    if (button.getAttribute('data-available') !== '1') {
      openDialog(button.getAttribute('data-portal'));
      return;
    }
    closeDialogs();
    if (href.indexOf('/play') === 0) O.warpTo('/play', 'play');
    else O.warpTo(href, null, {}, true);
  }

  function activate(button) {
    if (!button) return;
    if (selected === button) travel(button);
    else select(button);
  }

  function bindPortals() {
    all('[data-portal]').forEach(function (button) {
      button.addEventListener('click', function () { activate(button); });
      button.addEventListener('pointerenter', function (event) {
        if (event.pointerType !== 'touch') select(button);
      });
      button.addEventListener('focus', function () { select(button); });
    });
  }

  function bindControls() {
    var toggle = root.querySelector('[data-tour-toggle]');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var paused = root.classList.toggle('is-paused');
        toggle.setAttribute('aria-label', paused ? 'Reanudar recorrido' : 'Pausar recorrido');
        var label = toggle.querySelector('span');
        if (label) label.textContent = paused ? 'REANUDAR' : 'PAUSAR';
      });
    }
    var overview = root.querySelector('[data-tour-overview]');
    if (overview) {
      overview.addEventListener('click', function () {
        if (selected) selected.classList.remove('is-selected');
        selected = null;
        root.removeAttribute('data-active-portal');
        hideDossier();
        closeDialogs();
      });
    }
    var showUniverses = root.querySelector('[data-show-universes]');
    if (showUniverses) {
      showUniverses.addEventListener('click', function (event) {
        event.preventDefault();
        var index = root.querySelector('.universe-index');
        if (index) index.scrollIntoView({ behavior: root.classList.contains('is-reduced') ? 'auto' : 'smooth', block: 'nearest' });
      });
    }
    var dossierCta = root.querySelector('[data-dossier-cta]');
    if (dossierCta) {
      dossierCta.addEventListener('click', function (event) {
        event.preventDefault();
        travel(selected);
      });
    }
    var dialogButton = root.querySelector('[data-dossier-dialog]');
    if (dialogButton) {
      dialogButton.addEventListener('click', function () {
        openDialog(selected ? selected.getAttribute('data-portal') : 'whatif');
      });
    }
    all('[data-dialog-panel] [data-close]').forEach(function (button) {
      button.addEventListener('click', closeDialogs);
    });
    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeDialogs();
        hideDossier();
      } else if (event.key === 'Enter' && selected && O.scene() === 'hub') {
        var tag = (event.target && event.target.tagName) || '';
        if (!/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(tag)) travel(selected);
      }
    });
  }

  function bindCircuits() {
    var buttons = all('[data-start-circuit]');
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        var index = parseInt(button.getAttribute('data-circuit'), 10) || 0;
        O.startCircuit(index);
      });
    });
    var best = root.querySelector('[data-play-best]');
    if (best) best.textContent = O.bestLabel();
  }

  function onScene(event) {
    var scene = event.detail.scene;
    if (scene === 'game') {
      hideDossier();
      closeDialogs();
    }
    if (scene === 'play') bindCircuits();
  }

  function init() {
    if (bound) return;
    bound = true;
    bindPortals();
    bindControls();
    bindCircuits();
    root.addEventListener('otraverso:scene', onScene);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
