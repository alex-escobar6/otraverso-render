(function (global) {
  'use strict';

  var doc = global.document;
  var probe = null;
  var activeRenderer = null;
  var activeCanvas = null;
  var generation = 0;
  var restoreAttempts = 0;
  var listeners = { lost: [], restored: [] };

  function mode() {
    detect();
    return probe ? probe.mode : 'fallback';
  }

  function detect() {
    if (probe) return probe;
    probe = {
      supported: false,
      mode: 'fallback',
      api: null,
      renderer: 'desconocido',
      vendor: 'desconocido',
      software: false,
      limitedInfo: false,
      reason: 'WebGL no disponible'
    };
    if (!doc || !doc.createElement) return probe;
    var canvas = doc.createElement('canvas');
    var options = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: false
    };
    var gl = null;
    var api = null;
    try {
      gl = canvas.getContext('webgl2', options);
      if (gl) api = 'webgl2';
      if (!gl) {
        gl = canvas.getContext('webgl', options) || canvas.getContext('experimental-webgl', options);
        if (gl) api = 'webgl';
      }
    } catch (error) {
      probe.reason = 'El navegador bloqueó la creación del contexto WebGL';
      return probe;
    }
    if (!gl) return probe;
    var debug = gl.getExtension('WEBGL_debug_renderer_info');
    var renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    var vendor = debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    renderer = String(renderer || 'desconocido');
    vendor = String(vendor || 'desconocido');
    var software = /llvmpipe|swiftshader|softpipe|software|mesa offscreen/i.test(renderer + ' ' + vendor);
    var limitedInfo = !debug || /^(webkit webgl|webgl|opengl es)/i.test(renderer);
    var memory = (global.navigator && global.navigator.deviceMemory) || 4;
    var cores = (global.navigator && global.navigator.hardwareConcurrency) || 4;
    var reduced = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    probe.supported = true;
    probe.api = api;
    probe.renderer = renderer;
    probe.vendor = vendor;
    probe.software = software;
    probe.limitedInfo = limitedInfo;
    probe.mode = (software || limitedInfo || memory <= 2 || cores <= 2 || reduced) ? 'optimized' : 'full';
    probe.reason = software ? 'Renderizador por software detectado' : (limitedInfo ? 'Información gráfica limitada; modo optimizado' : 'WebGL disponible');
    var lose = gl.getExtension('WEBGL_lose_context');
    if (lose && typeof lose.loseContext === 'function') {
      try { lose.loseContext(); } catch (error) {}
    }
    return probe;
  }

  function emit(type, payload) {
    listeners[type].forEach(function (handler) {
      try { handler(payload); } catch (error) {}
    });
  }

  function clearRenderer() {
    if (!activeRenderer) return;
    var renderer = activeRenderer;
    var canvas = activeCanvas;
    activeRenderer = null;
    activeCanvas = null;
    restoreAttempts = 0;
    generation += 1;
    try { renderer.dispose(); } catch (error) {}
    try { if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (error) {}
    if (canvas && canvas.parentNode) {
      try { canvas.parentNode.removeChild(canvas); } catch (error) {}
    }
  }

  function createRenderer(options) {
    options = options || {};
    var info = detect();
    if (!info.supported || !global.THREE) return null;
    if (activeRenderer) clearRenderer();
    var renderer = null;
    try {
      renderer = new global.THREE.WebGLRenderer({
        alpha: false,
        antialias: !!options.antialias,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: false
      });
    } catch (error) {
      info.supported = false;
      info.mode = 'fallback';
      info.reason = 'No se pudo crear el renderizador WebGL';
      return null;
    }
    activeRenderer = renderer;
    activeCanvas = renderer.domElement;
    generation += 1;
    restoreAttempts = 0;
    if (activeCanvas) {
      activeCanvas.addEventListener('webglcontextlost', function (event) {
        if (event && event.preventDefault) event.preventDefault();
        emit('lost', { generation: generation, attempts: restoreAttempts });
      }, false);
      activeCanvas.addEventListener('webglcontextrestored', function () {
        restoreAttempts += 1;
        emit('restored', { generation: generation, attempts: restoreAttempts });
        if (restoreAttempts > 1) {
          info.supported = false;
          info.mode = 'fallback';
          info.reason = 'El contexto WebGL se perdió de forma repetida';
        }
      }, false);
    }
    return renderer;
  }

  function onContextLost(handler) {
    if (typeof handler === 'function') listeners.lost.push(handler);
  }

  function onContextRestored(handler) {
    if (typeof handler === 'function') listeners.restored.push(handler);
  }

  function describe() {
    detect();
    return {
      mode: probe.mode,
      supported: probe.supported,
      api: probe.api,
      renderer: probe.renderer,
      vendor: probe.vendor,
      software: probe.software,
      limitedInfo: probe.limitedInfo,
      reason: probe.reason
    };
  }

  var api = {
    version: 'webgl-runtime-1',
    detect: detect,
    mode: mode,
    describe: describe,
    createRenderer: createRenderer,
    releaseRenderer: clearRenderer,
    onContextLost: onContextLost,
    onContextRestored: onContextRestored
  };

  global.OTRAVERSO = global.OTRAVERSO || {};
  global.OTRAVERSO.GFX = api;
})(window);
