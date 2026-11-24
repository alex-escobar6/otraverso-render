(function (global) {
  'use strict';

  var O = global.OTRAVERSO;
  if (!O) return;

  var doc = global.document;
  var root = doc.querySelector('[data-universe-root]');
  if (!root) return;

  var bound = false;

  function all(selector) {
    return Array.prototype.slice.call(root.querySelectorAll(selector));
  }

  function updateBest() {
    var best = root.querySelector('[data-play-best]');
    if (best) best.textContent = O.PLAY && O.PLAY.version ? O.bestLabel() : '';
  }

  function markGame(code) {
    all('[data-play-game]').forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-play-game') === code);
    });
  }

  function bindGames() {
    all('[data-play-game]').forEach(function (button) {
      button.addEventListener('click', function () {
        O.startGame(button.getAttribute('data-play-game'));
      });
    });
  }

  function bindCircuits() {
    all('[data-start-circuit]').forEach(function (button) {
      button.addEventListener('click', function () {
        var index = parseInt(button.getAttribute('data-circuit'), 10) || 0;
        O.startCircuit(index);
      });
    });
    updateBest();
  }

  function bindResults() {
    var retry = root.querySelector('[data-retry]');
    if (retry) {
      retry.addEventListener('click', function () {
        var code = root.getAttribute('data-game-code') || 'nexus-rush';
        var options = code === 'nexus-rush' ? { circuit: O.clamp(parseInt(root.getAttribute('data-circuit'), 10) || 0, 0, 2) } : {};
        O.startGame(code, options);
      });
    }
    var menu = root.querySelector('[data-circuit-menu]');
    if (menu) menu.addEventListener('click', function () { O.goPlay(); });
    var hub = root.querySelector('[data-game-hub]');
    if (hub) hub.addEventListener('click', function () { O.goHub(); });
  }

  function openProfile(push) {
    root.classList.add('is-profile-open');
    if (push !== false && global.location.pathname !== '/play/profile') {
      try {
        global.history.pushState({ scene: 'play', options: { panel: 'profile' } }, '', '/play/profile');
      } catch (error) {}
    }
    if (O.PROGRESS && typeof O.PROGRESS.sync === 'function') {
      try { O.PROGRESS.sync(); } catch (error) {}
    }
  }

  function closeProfile() {
    root.classList.remove('is-profile-open');
    if (global.location.pathname === '/play/profile') {
      try {
        global.history.replaceState({ scene: 'play', options: {} }, '', '/play');
      } catch (error) {}
    }
  }

  function bindProfile() {
    all('[data-play-profile-toggle]').forEach(function (button) {
      button.addEventListener('click', function () { openProfile(true); });
    });
    all('[data-play-profile-close]').forEach(function (button) {
      button.addEventListener('click', closeProfile);
    });
    doc.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !root.classList.contains('is-profile-open')) return;
      event.preventDefault();
      event.stopPropagation();
      closeProfile();
    }, true);
    global.addEventListener('popstate', function () {
      if (global.location.pathname === '/play/profile') openProfile(false);
      else closeProfile();
    });
    if (root.getAttribute('data-panel') === 'profile') openProfile(false);
  }

  function onScene(event) {
    var scene = event.detail.scene;
    if (scene === 'game') closeProfile();
    if (scene === 'play') {
      markGame(root.getAttribute('data-game-code') || '');
      updateBest();
      if (event.detail.options && event.detail.options.panel === 'profile') openProfile(false);
    }
    if (scene === 'game') markGame(event.detail.options.game || root.getAttribute('data-game-code') || '');
  }

  function init() {
    if (bound) return;
    bound = true;
    bindGames();
    bindCircuits();
    bindResults();
    bindProfile();
    root.addEventListener('otraverso:scene', onScene);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
