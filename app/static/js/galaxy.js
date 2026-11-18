(function () {
  'use strict';

  var stage = document.querySelector('.galaxy-stage');
  if (!stage) return;

  var canvas = stage.querySelector('.galaxy-canvas');
  var ui = stage.querySelector('.galaxy-ui');
  var loader = stage.querySelector('[data-loader]');
  var loaderBar = stage.querySelector('[data-loader-bar]');
  var loaderStatus = stage.querySelector('[data-loader-status]');
  var dossier = stage.querySelector('[data-dossier]');
  var progressBar = stage.querySelector('[data-tour-progress]');
  var toggleBtn = stage.querySelector('[data-tour-toggle]');
  var skipBtn = stage.querySelector('[data-tour-skip]');
  var overviewBtn = stage.querySelector('[data-tour-overview]');
  var indexItems = Array.prototype.slice.call(stage.querySelectorAll('[data-index]'));
  var dialogs = {};
  Array.prototype.forEach.call(document.querySelectorAll('.world-detail[data-dialog]'), function (dialog) {
    dialogs[dialog.getAttribute('data-dialog')] = dialog;
  });

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var lowPower = (navigator.hardwareConcurrency || 4) <= 2 || (navigator.deviceMemory || 4) <= 2 || !!(navigator.connection && navigator.connection.saveData);
  var mobile = window.innerWidth < 760;
  var worldIds = ['shop', 'whatif', 'play', 'labs'];
  var byId = {};
  var TAU = Math.PI * 2;

  function cssVar(el, name, fallback) {
    var value = el ? window.getComputedStyle(el).getPropertyValue(name).trim() : '';
    return value || fallback;
  }

  function hexRgb(hex) {
    var value = String(hex || '#ffffff').replace('#', '');
    if (value.length === 3) value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    var number = parseInt(value, 16);
    if (isNaN(number)) return [0.5, 0.5, 1];
    return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
  }

  worldIds.forEach(function (id) {
    var el = stage.querySelector('.world-node[data-world="' + id + '"]');
    if (!el) return;
    byId[id] = {
      id: id,
      el: el,
      indexEl: stage.querySelector('[data-index="' + id + '"]'),
      color: cssVar(el, '--node-color', '#8b5cf6'),
      accent: cssVar(el, '--node-accent', '#54e8ff'),
      name: (el.querySelector('strong') || {}).textContent || id.toUpperCase(),
      tagline: el.getAttribute('data-tagline') || '',
      description: el.getAttribute('data-description') || '',
      status: el.getAttribute('data-status') || ''
    };
  });

  var hovered = null;
  var selected = null;
  var tourFocus = null;
  var openId = null;
  var lastTrigger = null;
  var warpState = null;
  var autoPausedAt = 0;
  var manualPaused = false;
  var tour = { time: 0, active: true, finished: false, segment: -1, start: performance.now(), pauseAt: 0 };

  var loaderStep = 0;
  function setLoader(percent, message) {
    loaderStep = Math.max(loaderStep, percent);
    if (loaderBar) loaderBar.style.width = loaderStep + '%';
    if (loaderStatus && message) loaderStatus.textContent = message;
  }
  setLoader(12, 'Calibrando telescopio…');

  function hideLoader() {
    setLoader(100, 'Galaxia lista');
    if (!loader) return;
    loader.classList.add('is-done');
    window.setTimeout(function () { loader.hidden = true; }, 500);
  }

  function markActive(id) {
    worldIds.forEach(function (key) {
      var active = key === id;
      if (byId[key] && byId[key].el) byId[key].el.classList.toggle('is-active', active);
      if (byId[key] && byId[key].indexEl) byId[key].indexEl.classList.toggle('is-active', active);
    });
  }

  function showDossier(id) {
    if (!dossier) return;
    if (!id || !byId[id]) {
      dossier.hidden = true;
      return;
    }
    var world = byId[id];
    dossier.hidden = false;
    dossier.style.setProperty('--dossier-accent', world.accent);
    var state = dossier.querySelector('[data-dossier-state]');
    var name = dossier.querySelector('[data-dossier-name]');
    var tagline = dossier.querySelector('[data-dossier-tagline]');
    var description = dossier.querySelector('[data-dossier-description]');
    var cta = dossier.querySelector('[data-dossier-cta]');
    var dialogBtn = dossier.querySelector('[data-dossier-dialog]');
    if (state) state.textContent = 'UNIVERSO · ' + world.status;
    if (name) name.textContent = world.name;
    if (tagline) tagline.textContent = world.tagline;
    if (description) description.textContent = world.description;
    if (cta) cta.hidden = id !== 'shop';
    if (dialogBtn) {
      dialogBtn.hidden = id === 'shop';
      dialogBtn.setAttribute('data-dialog', id);
    }
  }

  function refreshFocus() {
    var focus = hovered || selected || tourFocus;
    markActive(focus);
    showDossier(focus);
  }

  function setHover(id) {
    if (hovered === id) return;
    hovered = id;
    refreshFocus();
    if (three) three.setHover(id);
  }

  function openDialog(id) {
    var dialog = dialogs[id];
    if (!dialog || openId) return;
    if (openId) closeDialog(true);
    openId = id;
    lastTrigger = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('modal-open');
    window.requestAnimationFrame(function () { dialog.classList.add('is-open'); });
    var close = dialog.querySelector('.world-detail__close');
    if (close) close.focus();
  }

  function closeDialog(silent) {
    if (!openId) return;
    var dialog = dialogs[openId];
    var closing = openId;
    openId = null;
    document.body.classList.remove('modal-open');
    if (dialog) {
      dialog.classList.remove('is-open');
      window.setTimeout(function () {
        if (openId !== closing) dialog.hidden = true;
      }, 380);
    }
    if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
    if (!silent) refreshFocus();
  }

  function selectWorld(id, activate) {
    if (!byId[id]) return;
    selected = id;
    tour.active = false;
    tour.finished = true;
    manualPaused = true;
    updateToggle();
    refreshFocus();
    if (three) three.focusWorld(id);
    if (activate) activateWorld(id);
  }

  function activateWorld(id) {
    if (id === 'shop') startWarp('/shop');
    else openDialog(id);
  }

  function startWarp(href) {
    if (warpState) return;
    if (reduce || !three) {
      stage.classList.add('is-warping');
      window.setTimeout(function () { window.location.assign(href); }, reduce ? 0 : 520);
      return;
    }
    warpState = { start: performance.now(), duration: 1750, href: href, done: false };
    stage.classList.add('is-warping');
    if (three) three.beginWarp();
  }

  function updateToggle() {
    if (!toggleBtn) return;
    var label = tour.finished ? 'REPETIR' : tour.active && !manualPaused ? 'PAUSAR' : 'REANUDAR';
    toggleBtn.setAttribute('aria-label', label === 'PAUSAR' ? 'Pausar recorrido' : label === 'REANUDAR' ? 'Reanudar recorrido' : 'Repetir recorrido');
    var text = toggleBtn.querySelector('span');
    var symbol = toggleBtn.firstChild;
    if (text) text.textContent = label;
    if (symbol && symbol.nodeType === 3) symbol.nodeValue = label === 'PAUSAR' ? '❚❚ ' : label === 'REANUDAR' ? '▶ ' : '↺ ';
    toggleBtn.setAttribute('aria-pressed', tour.active && !manualPaused ? 'true' : 'false');
  }

  function resetTour() {
    tour.time = 0;
    tour.start = performance.now();
    tour.pauseAt = 0;
    tour.active = true;
    tour.finished = false;
    tour.segment = -1;
    manualPaused = false;
    autoPausedAt = 0;
    selected = null;
    tourFocus = null;
    if (three) three.overview(true);
    refreshFocus();
    updateToggle();
  }

  function skipTour() {
    tour.time = THREE_TOUR_DURATION;
    tour.active = false;
    tour.finished = true;
    tour.segment = -1;
    tourFocus = null;
    selected = null;
    if (three) three.overview();
    refreshFocus();
    updateToggle();
  }

  var THREE_TOUR_DURATION = 0;

  function bindUi() {
    worldIds.forEach(function (id) {
      var world = byId[id];
      if (!world || !world.el) return;
      world.el.addEventListener('pointerenter', function () { setHover(id); });
      world.el.addEventListener('pointerleave', function () { setHover(null); });
      world.el.addEventListener('focus', function () { setHover(id); });
      world.el.addEventListener('blur', function () { setHover(null); });
      world.el.addEventListener('click', function (event) {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        selectWorld(id, true);
      });
      if (world.indexEl) {
        world.indexEl.addEventListener('pointerenter', function () { setHover(id); });
        world.indexEl.addEventListener('pointerleave', function () { setHover(null); });
        world.indexEl.addEventListener('focus', function () { setHover(id); });
        world.indexEl.addEventListener('blur', function () { setHover(null); });
        world.indexEl.addEventListener('click', function (event) {
          if (world.indexEl.tagName !== 'BUTTON') return;
          event.preventDefault();
          selectWorld(id, true);
        });
      }
    });

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var closeTrigger = target.closest('[data-close]');
      if (closeTrigger) {
        event.preventDefault();
        closeDialog(false);
        return;
      }
      var dialogTrigger = target.closest('[data-dialog]');
      if (dialogTrigger && dialogTrigger.getAttribute('data-dialog')) {
        event.preventDefault();
        var dialogId = dialogTrigger.getAttribute('data-dialog');
        selected = dialogId;
        refreshFocus();
        if (three) three.focusWorld(dialogId);
        openDialog(dialogId);
        return;
      }
      var warpLink = target.closest('[data-warp]');
      if (warpLink && !event.defaultPrevented && (event.button === undefined || event.button === 0) &&
          !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        var href = warpLink.getAttribute('href') || '/shop';
        selected = 'shop';
        refreshFocus();
        startWarp(href);
        return;
      }
      var showUniverses = target.closest('[data-show-universes]');
      if (showUniverses) {
        event.preventDefault();
        if (indexItems.length) {
          indexItems[0].focus();
          stage.classList.add('show-index');
        }
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && openId) closeDialog(false);
    });

    if (toggleBtn) toggleBtn.addEventListener('click', function () {
      if (tour.finished) resetTour();
      else manualPaused = !manualPaused;
      updateToggle();
    });
    if (skipBtn) skipBtn.addEventListener('click', skipTour);
    if (overviewBtn) overviewBtn.addEventListener('click', function () {
      tour.active = false;
      tour.finished = true;
      tourFocus = null;
      selected = null;
      manualPaused = true;
      if (three) three.overview();
      refreshFocus();
      updateToggle();
    });

    window.addEventListener('pointermove', function (event) {
      if (coarse || !three) return;
      three.setPointer(
        Math.max(-1, Math.min(1, event.clientX / Math.max(1, stage.clientWidth) * 2 - 1)),
        Math.max(-1, Math.min(1, event.clientY / Math.max(1, stage.clientHeight) * 2 - 1))
      );
    }, { passive: true });
    stage.addEventListener('pointerleave', function () { if (three) three.setPointer(0, 0); });

    var down = null;
    canvas.addEventListener('pointerdown', function (event) { down = { x: event.clientX, y: event.clientY }; });
    canvas.addEventListener('pointerup', function (event) {
      if (!down || !three) return;
      var moved = Math.abs(event.clientX - down.x) + Math.abs(event.clientY - down.y);
      down = null;
      if (moved > 12) return;
      var id = three.pick(event.clientX, event.clientY);
      if (id) selectWorld(id, true);
    });
  }

  var GLSL_NOISE = [
    'float hash31(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
    'float noise3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);',
    ' return mix(mix(mix(hash31(i+vec3(0,0,0)),hash31(i+vec3(1,0,0)),f.x),',
    ' mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),',
    ' mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),',
    ' mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z); }',
    'float fbm3(vec3 p){ float v=0.0; float a=0.5; for(int i=0;i<4;i++){ v += a*noise3(p); p*=2.03; a*=0.5; } return v; }',
    'float hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }',
    'float noise2(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);',
    ' return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y); }',
    'float fbm2(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<4;i++){ v += a*noise2(p); p*=2.07; a*=0.5; } return v; }'
  ].join('\n');

  var POINT_VS = [
    'attribute float aSize; attribute vec3 aColor;',
    'uniform float uTime; uniform float uScale;',
    'varying vec3 vColor; varying float vTwinkle;',
    'void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);',
    ' float dist = max(1.0,-mv.z);',
    ' gl_PointSize = clamp(aSize*uScale/dist, 0.7, 16.0);',
    ' vColor = aColor;',
    ' vTwinkle = 0.68 + 0.32*sin(uTime*0.0013 + position.x*0.13 + position.z*0.09);',
    ' gl_Position = projectionMatrix*mv; }'
  ].join('\n');

  var POINT_FS = [
    'varying vec3 vColor; varying float vTwinkle;',
    'void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p);',
    ' float a = smoothstep(0.5,0.02,d); a *= a;',
    ' if(a < 0.01) discard;',
    ' gl_FragColor = vec4(vColor*(0.8+vTwinkle*0.5), a*vTwinkle); }'
  ].join('\n');

  var PLANET_VS = [
    'uniform float uTime; uniform float uType; uniform float uDisplace; uniform float uSeed;',
    'varying vec3 vNormalW; varying vec3 vWorld; varying vec3 vObj;',
    GLSL_NOISE,
    'void main(){ vec3 n = normalize(normal);',
    ' float bump = fbm3(n*4.0 + vec3(uTime*0.012,uSeed,0.0)) - 0.5;',
    ' vec3 p = position + n*bump*uDisplace;',
    ' vObj = normalize(position);',
    ' vec4 world = modelMatrix*vec4(p,1.0);',
    ' vWorld = world.xyz;',
    ' vNormalW = normalize(mat3(modelMatrix)*n);',
    ' gl_Position = projectionMatrix*viewMatrix*world; }'
  ].join('\n');

  var PLANET_FS = [
    'uniform float uTime; uniform float uType; uniform float uHighlight; uniform float uSeed;',
    'uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uAccent; uniform vec3 uLightDir;',
    'varying vec3 vNormalW; varying vec3 vWorld; varying vec3 vObj;',
    GLSL_NOISE,
    'void main(){',
    ' vec3 n = normalize(vNormalW); vec3 sp = normalize(vObj);',
    ' float diff = max(dot(n,normalize(uLightDir)),0.0);',
    ' vec3 viewDir = normalize(cameraPosition - vWorld);',
    ' float fres = pow(1.0 - max(dot(n,viewDir),0.0), 3.0);',
    ' float pattern = 0.0; float emissive = 0.0; vec3 base = uColorA;',
    ' if(uType < 0.5){',
    '   float bands = fbm3(sp*5.0 + vec3(0.0,uTime*0.015,0.0));',
    '   float grid = smoothstep(0.94,1.0,abs(sin(sp.y*42.0)))*smoothstep(0.8,1.0,abs(sin(atan(sp.z,sp.x)*18.0)));',
    '   float city = smoothstep(0.76,0.92,fbm3(sp*22.0 + uTime*0.006));',
    '   pattern = clamp(bands*0.72 + grid*0.5 + city*0.35,0.0,1.0);',
    '   base = mix(uColorA,uColorB,pattern); emissive = grid*0.6 + city*0.85;',
    ' } else if(uType < 1.5){',
    '   float swirl = fbm3(sp*4.2 + vec3(sin(uTime*0.06),cos(uTime*0.05),uSeed));',
    '   float portal = smoothstep(0.62,0.78,abs(sin(sp.y*9.0 + swirl*7.0 + uTime*0.18)));',
    '   pattern = clamp(swirl*0.8 + portal*0.5,0.0,1.0);',
    '   base = mix(uColorA,uColorB,pattern); emissive = portal*0.9;',
    ' } else if(uType < 2.5){',
    '   float plasma = fbm3(sp*6.0 + vec3(uTime*0.04,0.0,-uTime*0.03));',
    '   float stripes = smoothstep(0.72,0.98,abs(sin(sp.y*30.0 + plasma*10.0)));',
    '   float facets = smoothstep(0.72,0.95,noise3(sp*12.0));',
    '   pattern = clamp(plasma*0.6 + stripes*0.55 + facets*0.3,0.0,1.0);',
    '   base = mix(uColorA,uColorB,pattern); emissive = stripes*0.8 + facets*0.45;',
    ' } else {',
    '   vec3 q = sp*11.0;',
    '   float lines = smoothstep(0.88,1.0,abs(sin(q.x)))*smoothstep(0.7,0.95,abs(sin(q.z)));',
    '   float nodes = smoothstep(0.8,0.97,noise3(q*0.7));',
    '   float flow = smoothstep(0.65,0.9,fbm3(sp*7.0 + vec3(0.0,uTime*0.03,0.0)));',
    '   pattern = clamp(lines*0.65 + nodes*0.5 + flow*0.35,0.0,1.0);',
    '   base = mix(uColorA,uColorB,pattern); emissive = lines*0.75 + nodes*0.9 + flow*0.35;',
    ' }',
    ' float rim = fres*(0.45 + uHighlight*0.9);',
    ' vec3 color = base*(0.14 + diff*0.95) + uAccent*emissive*(0.5 + uHighlight*1.1);',
    ' color += uAccent*rim;',
    ' color += uHighlight*0.16*(1.0-diff);',
    ' gl_FragColor = vec4(color,1.0); }'
  ].join('\n');

  var ATMOSPHERE_VS = [
    'varying vec3 vN; varying vec3 vV;',
    'void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0);',
    ' vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);',
    ' gl_Position = projectionMatrix*mv; }'
  ].join('\n');
  var ATMOSPHERE_FS = [
    'uniform vec3 uColor; uniform float uOpacity;',
    'varying vec3 vN; varying vec3 vV;',
    'void main(){ float f = pow(1.0 - abs(dot(normalize(vN),normalize(vV))), 2.6);',
    ' gl_FragColor = vec4(uColor, f*uOpacity); }'
  ].join('\n');

  var RING_VS = [
    'varying float vR; varying float vA;',
    'void main(){ vR = length(position.xy); vA = atan(position.y,position.x);',
    ' gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
  ].join('\n');
  var RING_FS = [
    'uniform vec3 uColor; uniform float uTime; uniform float uInner; uniform float uOuter; uniform float uPower;',
    'varying float vR; varying float vA;',
    GLSL_NOISE,
    'void main(){ float r = (vR-uInner)/(uOuter-uInner);',
    ' float bands = 0.5 + 0.5*sin(r*54.0 + noise2(vec2(vA*3.0,r*9.0))*4.0);',
    ' float gaps = smoothstep(0.16,0.42,abs(sin(r*17.0 + uTime*0.0002)));',
    ' float edge = smoothstep(0.0,0.12,r)*(1.0-smoothstep(0.82,1.0,r));',
    ' float a = bands*gaps*edge*uPower;',
    ' gl_FragColor = vec4(uColor*(0.7+bands*0.8), a); }'
  ].join('\n');

  var NEBULA_VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
  var NEBULA_FS = [
    'uniform float uTime; uniform float uSeed; uniform float uReveal;',
    'uniform vec3 uColorA; uniform vec3 uColorB; varying vec2 vUv;',
    GLSL_NOISE,
    'void main(){ vec2 p = (vUv-0.5)*2.0;',
    ' vec2 q = p*2.2 + vec2(uSeed,uSeed*0.7);',
    ' float warp = fbm2(q + vec2(uTime*0.000025,uTime*0.000017));',
    ' float density = fbm2(q*1.6 + warp*2.1);',
    ' float mask = smoothstep(0.36,0.82,density) * max(0.0,1.0-dot(p,p)*0.62);',
    ' float wisp = smoothstep(0.52,0.9,fbm2(q*3.2 + warp));',
    ' vec3 col = mix(uColorA,uColorB,clamp(fbm2(q*0.8 + 3.0),0.0,1.0));',
    ' float a = (mask*0.5 + wisp*0.16)*uReveal;',
    ' gl_FragColor = vec4(col*(0.9+mask),a); }'
  ].join('\n');

  var GALAXY_FS = [
    'uniform float uTime; uniform float uSeed; uniform float uReveal;',
    'uniform vec3 uColorA; uniform vec3 uColorB; varying vec2 vUv;',
    GLSL_NOISE,
    'void main(){ vec2 p=(vUv-0.5)*2.0; float r=length(p);',
    ' float a=atan(p.y,p.x);',
    ' float arms = pow(max(0.0,sin(a*2.0 + r*11.0 - uTime*0.00002)),2.0);',
    ' float glow = exp(-r*3.3)*(0.55+arms*0.65);',
    ' float dust = fbm2(p*5.0 + uSeed);',
    ' vec3 col = mix(uColorA,uColorB,clamp(dust,0.0,1.0));',
    ' float alpha = (glow*0.55 + dust*0.08)*smoothstep(1.0,0.35,r)*uReveal;',
    ' gl_FragColor = vec4(col*(0.8+arms),alpha); }'
  ].join('\n');

  var POST_VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }';
  var BRIGHT_FS = [
    'uniform sampler2D tDiffuse; uniform float uThreshold; varying vec2 vUv;',
    'void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb;',
    ' float l=max(max(c.r,c.g),c.b); float k=smoothstep(uThreshold,uThreshold+0.4,l);',
    ' gl_FragColor=vec4(c*k,1.0); }'
  ].join('\n');
  var BLUR_FS = [
    'uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;',
    'void main(){ vec3 s=texture2D(tDiffuse,vUv).rgb*0.227027;',
    ' s += texture2D(tDiffuse,vUv+uDir*1.3846).rgb*0.316216;',
    ' s += texture2D(tDiffuse,vUv-uDir*1.3846).rgb*0.316216;',
    ' s += texture2D(tDiffuse,vUv+uDir*3.2307).rgb*0.070270;',
    ' s += texture2D(tDiffuse,vUv-uDir*3.2307).rgb*0.070270;',
    ' gl_FragColor=vec4(s,1.0); }'
  ].join('\n');
  var COMPOSITE_FS = [
    'uniform sampler2D tScene; uniform sampler2D tBloom;',
    'uniform float uBloom; uniform float uReveal; uniform float uWarp;',
    'uniform float uTime; uniform vec2 uResolution; varying vec2 vUv;',
    'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }',
    'void main(){ vec2 d=vUv-0.5; float ca=0.0014+uWarp*0.012;',
    ' vec2 off=d*ca; vec3 c;',
    ' c.r=texture2D(tScene,vUv+off).r; c.g=texture2D(tScene,vUv).g; c.b=texture2D(tScene,vUv-off).b;',
    ' c += texture2D(tBloom,vUv).rgb*uBloom;',
    ' c *= 1.0 - dot(d,d)*0.55;',
    ' c = aces(c*1.22); c = pow(c,vec3(1.0/2.2));',
    ' float grain = fract(sin(dot(vUv*uResolution*0.4 + uTime*0.01,vec2(12.9898,78.233)))*43758.5453)-0.5;',
    ' c += grain*0.012; c *= uReveal;',
    ' gl_FragColor=vec4(c,1.0); }'
  ].join('\n');

  var three = null;

  function initThree() {
    if (!window.THREE) return null;
    var T = window.THREE;
    var renderer;
    try {
      renderer = new T.WebGLRenderer({
        canvas: canvas, antialias: false, alpha: false,
        powerPreference: lowPower ? 'low-power' : 'default', stencil: false
      });
    } catch (error) {
      return null;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower || mobile ? 1 : 1.25));
    renderer.autoClear = true;
    var rendererName = '';
    try { rendererName = String(renderer.getContext().getParameter(renderer.getContext().RENDERER) || ''); } catch (error) { rendererName = ''; }
    var softwareRenderer = /swiftshader|llvmpipe|software/i.test(rendererName);

    var scene = new T.Scene();
    scene.background = new T.Color(0x03040e);
    var camera = new T.PerspectiveCamera(56, 1, 0.1, 2000);
    camera.position.set(0, 8, 64);
    var lookTarget = new T.Vector3(0, 0, 0);
    var lookFinal = new T.Vector3(0, 0, 0);
    var pointer = { x: 0, y: 0 };
    var drift = 0;

    scene.add(new T.AmbientLight(0x6b70b5, 0.75));
    var key = new T.DirectionalLight(0xc9d8ff, 1.35);
    key.position.set(12, 14, 20);
    scene.add(key);

    var timeUniform = { value: 0 };
    var revealUniform = { value: 0 };

    function makePoints(count, build, scale) {
      var positions = new Float32Array(count * 3);
      var colors = new Float32Array(count * 3);
      var sizes = new Float32Array(count);
      for (var i = 0; i < count; i++) {
        var item = build(i);
        positions[i * 3] = item[0]; positions[i * 3 + 1] = item[1]; positions[i * 3 + 2] = item[2];
        colors[i * 3] = item[3]; colors[i * 3 + 1] = item[4]; colors[i * 3 + 2] = item[5];
        sizes[i] = item[6];
      }
      var geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
      geometry.setAttribute('aColor', new T.BufferAttribute(colors, 3));
      geometry.setAttribute('aSize', new T.BufferAttribute(sizes, 1));
      var material = new T.ShaderMaterial({
        uniforms: { uTime: timeUniform, uScale: { value: scale } },
        vertexShader: POINT_VS, fragmentShader: POINT_FS,
        transparent: true, blending: T.AdditiveBlending, depthWrite: false
      });
      return new T.Points(geometry, material);
    }

    var starCount = lowPower ? 700 : mobile ? 1200 : 2600;
    var stars = makePoints(starCount, function () {
      var u = Math.random() * 2 - 1;
      var phi = Math.random() * TAU;
      var r = 220 + Math.random() * 380;
      var s = Math.sqrt(1 - u * u);
      var tint = Math.random();
      var color = tint < 0.16 ? [0.62, 0.78, 1] : tint < 0.28 ? [0.78, 0.65, 1] : [0.92, 0.94, 1];
      var size = Math.random() < 0.05 ? 2.4 + Math.random() * 2.4 : 0.7 + Math.random() * 1.3;
      return [Math.cos(phi) * s * r, u * r, Math.sin(phi) * s * r, color[0], color[1], color[2], size];
    }, 150);
    scene.add(stars);

    var diskCount = lowPower ? 1000 : mobile ? 2200 : 4200;
    var disk = makePoints(diskCount, function (i) {
      var arm = i % 3;
      var radius = 3 + Math.pow(Math.random(), 0.65) * 52;
      var angle = arm * TAU / 3 + radius * 0.055 + (Math.random() - 0.5) * 0.62;
      var height = (Math.random() - 0.5) * (2.2 + radius * 0.035);
      var color = arm === 0 ? [0.55, 0.5, 1] : arm === 1 ? [0.3, 0.85, 1] : [0.85, 0.55, 1];
      return [Math.cos(angle) * radius, height, Math.sin(angle) * radius, color[0], color[1], color[2], 0.6 + Math.random() * 1.5];
    }, 52);
    disk.rotation.x = 0.18;
    scene.add(disk);

    var dustCount = lowPower ? 140 : mobile ? 220 : 420;
    var dust = makePoints(dustCount, function () {
      var r = 6 + Math.random() * 46;
      var a = Math.random() * TAU;
      var color = Math.random() < 0.5 ? [0.6, 0.45, 1] : [0.35, 0.9, 1];
      return [Math.cos(a) * r, (Math.random() - 0.5) * 16, Math.sin(a) * r - 12,
              color[0], color[1], color[2], 0.5 + Math.random()];
    }, 34);
    scene.add(dust);

    var billboards = [];
    function addBillboard(width, height, position, colorA, colorB, fragment, seed, spin) {
      var material = new T.ShaderMaterial({
        uniforms: {
          uTime: timeUniform, uReveal: revealUniform, uSeed: { value: seed },
          uColorA: { value: new T.Color(colorA) }, uColorB: { value: new T.Color(colorB) }
        },
        vertexShader: NEBULA_VS, fragmentShader: fragment,
        transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
      });
      var mesh = new T.Mesh(new T.PlaneGeometry(width, height), material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.userData.spin = spin || 0;
      scene.add(mesh);
      billboards.push(mesh);
      return mesh;
    }

    var nebulaSpots = [
      [-46, 24, -105, 92, '#3b1d91', '#7c3aed'],
      [52, -12, -130, 108, '#0e5d91', '#22d3ee'],
      [-8, 40, -160, 130, '#4c1d95', '#c026d3'],
      [70, 34, -80, 74, '#4338ca', '#a78bfa'],
      [-72, -22, -70, 80, '#6d28d9', '#38bdf8'],
      [8, -44, -120, 96, '#312e81', '#c084fc']
    ];
    nebulaSpots.forEach(function (spot, i) {
      if ((lowPower || mobile) && i > 3) return;
      addBillboard(spot[3], spot[3] * 0.72, [spot[0], spot[1], spot[2]], spot[4], spot[5], NEBULA_FS, i * 3.7 + 1, 0.00001);
    });
    [[-180, 70, -420, 80], [210, -50, -480, 110], [60, 150, -560, 130]].forEach(function (g, i) {
      if (mobile && i > 1) return;
      addBillboard(g[3], g[3] * 0.7, [g[0], g[1], g[2]], '#8b5cf6', '#67e8f9', GALAXY_FS, i * 2.3, 0);
    });

    var coreGroup = new T.Group();
    scene.add(coreGroup);
    var coreMaterial = new T.ShaderMaterial({
      uniforms: { uTime: timeUniform, uReveal: revealUniform, uColorA: { value: new T.Color('#a78bfa') }, uColorB: { value: new T.Color('#67e8f9') } },
      vertexShader: NEBULA_VS,
      fragmentShader: [
        'uniform float uTime; uniform float uReveal; uniform vec3 uColorA; uniform vec3 uColorB; varying vec2 vUv;',
        GLSL_NOISE,
        'void main(){ vec2 p=(vUv-0.5)*2.0; float r=length(p); float a=atan(p.y,p.x);',
        ' float spin = sin(a*3.0 + r*16.0 - uTime*0.0004);',
        ' float glow = exp(-r*4.0)*(0.8 + spin*0.3) + exp(-r*1.6)*0.12;',
        ' float core = smoothstep(0.28,0.0,r);',
        ' vec3 col = mix(uColorA,uColorB,clamp(r*1.8,0.0,1.0)) + core*0.8;',
        ' gl_FragColor = vec4(col, glow*uReveal); }'
      ].join('\n'),
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
    });
    var coreGlow = new T.Mesh(new T.PlaneGeometry(26, 26), coreMaterial);
    coreGroup.add(coreGlow);
    for (var c = 0; c < 3; c++) {
      var ringGeo = new T.RingGeometry(6 + c * 2.4, 6.05 + c * 2.4, 128);
      var ringMat = new T.MeshBasicMaterial({ color: c === 1 ? 0x67e8f9 : 0x8b5cf6, transparent: true, opacity: 0.22, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false });
      var coreRing = new T.Mesh(ringGeo, ringMat);
      coreRing.rotation.x = 0.7 + c * 0.12;
      coreRing.rotation.y = c * 0.5;
      coreGroup.add(coreRing);
    }
    scene.add(new T.PointLight(0x8b5cf6, 1.6, 90));

    var defs = [
      { id: 'shop', type: 0, radius: 2.35, pos: [8.5, 1.4, 5], color: '#8b5cf6', accent: '#54e8ff', seed: 1.2, speed: 0.11, ring: true, moons: true },
      { id: 'whatif', type: 1, radius: 1.9, pos: [-9.5, 4.8, -7], color: '#8b7cff', accent: '#c4b5fd', seed: 3.4, speed: 0.07, portals: true },
      { id: 'play', type: 2, radius: 1.75, pos: [11, -5, -11], color: '#f472b6', accent: '#67e8f9', seed: 5.6, speed: 0.14, ring: true, shapes: true },
      { id: 'labs', type: 3, radius: 1.7, pos: [-8, -3.4, 7], color: '#2dd4bf', accent: '#60a5fa', seed: 7.8, speed: 0.09, lattice: true }
    ];
    var planets = {};
    var pickables = [];
    var segments = lowPower ? 24 : mobile ? 32 : 44;

    defs.forEach(function (def, index) {
      var group = new T.Group();
      group.position.set(def.pos[0], def.pos[1], def.pos[2]);
      scene.add(group);
      var planetMat = new T.ShaderMaterial({
        uniforms: {
          uTime: timeUniform, uType: { value: def.type }, uSeed: { value: def.seed },
          uHighlight: { value: 0 }, uDisplace: { value: def.type === 1 ? 0.06 : 0.035 },
          uColorA: { value: new T.Color(def.color) }, uColorB: { value: new T.Color(def.accent) },
          uAccent: { value: new T.Color(def.accent) }, uLightDir: { value: new T.Vector3(0.55, 0.65, 1).normalize() }
        },
        vertexShader: PLANET_VS, fragmentShader: PLANET_FS
      });
      var mesh = new T.Mesh(new T.SphereGeometry(def.radius, segments, Math.max(20, segments / 2)), planetMat);
      mesh.userData.worldId = def.id;
      group.add(mesh);
      pickables.push(mesh);

      var atmosphere = new T.Mesh(
        new T.SphereGeometry(def.radius * 1.13, Math.max(24, segments / 2), 20),
        new T.ShaderMaterial({
          uniforms: { uColor: { value: new T.Color(def.accent) }, uOpacity: { value: 0.7 } },
          vertexShader: ATMOSPHERE_VS, fragmentShader: ATMOSPHERE_FS,
          transparent: true, blending: T.AdditiveBlending, side: T.BackSide, depthWrite: false
        })
      );
      group.add(atmosphere);

      var light = new T.PointLight(new T.Color(def.accent), 1.1, 26);
      light.position.set(def.radius * 1.6, def.radius, def.radius * 1.2);
      group.add(light);

      var extras = [];
      if (def.ring) {
        var inner = def.radius * 1.35;
        var outer = def.radius * (def.id === 'play' ? 2.3 : 2.05);
        var ringMat = new T.ShaderMaterial({
          uniforms: {
            uTime: timeUniform, uColor: { value: new T.Color(def.accent) },
            uInner: { value: inner }, uOuter: { value: outer }, uPower: { value: 0.75 }
          },
          vertexShader: RING_VS, fragmentShader: RING_FS,
          transparent: true, blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false
        });
        var ring = new T.Mesh(new T.RingGeometry(inner, outer, 128, 1), ringMat);
        ring.rotation.x = -Math.PI / 2 + (def.id === 'play' ? 0.5 : 0.28);
        ring.rotation.y = 0.22;
        group.add(ring);
        extras.push({ obj: ring, speed: def.id === 'play' ? 0.22 : 0.08, type: 'ring' });
      }

      if (def.portals) {
        for (var p = 0; p < 3; p++) {
          var portal = new T.Mesh(
            new T.TorusGeometry(def.radius * (1.5 + p * 0.22), 0.018 + p * 0.006, 6, 96, Math.PI * (1.3 + p * 0.2)),
            new T.MeshBasicMaterial({ color: p === 1 ? 0xc4b5fd : 0x8b7cff, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false })
          );
          portal.rotation.set(p * 0.9, p * 1.2, p * 0.6);
          group.add(portal);
          extras.push({ obj: portal, speed: (p % 2 ? -1 : 1) * (0.16 + p * 0.05), type: 'portal' });
        }
      }

      if (def.shapes && !lowPower) {
        for (var s = 0; s < 6; s++) {
          var shape = new T.Mesh(
            new T.OctahedronGeometry(0.14 + (s % 2) * 0.07, 0),
            new T.MeshBasicMaterial({ color: s % 2 ? 0x67e8f9 : 0xf472b6, transparent: true, opacity: 0.8 })
          );
          shape.userData.orbit = s / 6 * TAU;
          group.add(shape);
          extras.push({ obj: shape, speed: 0.3, type: 'shape' });
        }
      }

      if (def.lattice) {
        var lattice = new T.LineSegments(
          new T.EdgesGeometry(new T.IcosahedronGeometry(def.radius * 1.55, 1)),
          new T.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.32, blending: T.AdditiveBlending })
        );
        group.add(lattice);
        extras.push({ obj: lattice, speed: -0.12, type: 'lattice' });
        for (var b = 0; b < 8; b++) {
          var node = new T.Mesh(
            new T.BoxGeometry(0.16, 0.16, 0.16),
            new T.MeshBasicMaterial({ color: b % 2 ? 0x2dd4bf : 0x60a5fa, transparent: true, opacity: 0.85 })
          );
          node.userData.orbit = b / 8 * TAU;
          group.add(node);
          extras.push({ obj: node, speed: 0.24, type: 'node' });
        }
      }

      if (def.moons) {
        for (var m = 0; m < 2; m++) {
          var moon = new T.Mesh(
            new T.SphereGeometry(0.22 + m * 0.1, 16, 12),
            new T.MeshStandardMaterial({ color: m ? 0xa5b4fc : 0xe0f2fe, emissive: m ? 0x4c1d95 : 0x0e7490, emissiveIntensity: 0.5, roughness: 0.7 })
          );
          moon.userData.orbit = m * 2.6;
          group.add(moon);
          extras.push({ obj: moon, speed: m ? -0.28 : 0.36, type: 'moon' });
        }
      }

      var sprite = new T.Sprite(new T.SpriteMaterial({
        map: makeGlowTexture(document.createElement('canvas'), def.accent),
        color: new T.Color(def.accent), transparent: true, opacity: 0.65,
        blending: T.AdditiveBlending, depthWrite: false
      }));
      sprite.scale.set(def.radius * 8, def.radius * 8, 1);
      group.add(sprite);

      planets[def.id] = {
        def: def, group: group, mesh: mesh, material: planetMat,
        atmosphere: atmosphere.material.uniforms.uOpacity,
        ringPower: null, extras: extras, sprite: sprite,
        highlight: 0, target: 0, base: new T.Vector3().copy(group.position), index: index
      };
      var ringUniform = extras.length && def.ring ? extras[0].obj.material.uniforms.uPower : null;
      planets[def.id].ringPower = ringUniform;
    });

    var meteorCount = lowPower ? 8 : mobile ? 12 : 22;
    var meteorGeo = new T.IcosahedronGeometry(0.075, 0);
    var meteorMat = new T.MeshBasicMaterial({ color: 0xc7d2fe, transparent: true, opacity: 0.75 });
    var meteors = new T.InstancedMesh(meteorGeo, meteorMat, meteorCount);
    var meteorData = [];
    for (var mi = 0; mi < meteorCount; mi++) {
      meteorData.push({ r: 10 + Math.random() * 46, a: Math.random() * TAU, y: (Math.random() - 0.5) * 22, speed: 0.00008 + Math.random() * 0.00022, tilt: Math.random() * 0.5 });
    }
    scene.add(meteors);
    var dummy = new T.Object3D();

    var warpPortal = new T.Mesh(
      new T.TorusGeometry(1, 0.055, 12, 128),
      new T.MeshBasicMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false })
    );
    warpPortal.visible = false;
    scene.add(warpPortal);

    var postScene = new T.Scene();
    var postCamera = new T.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    var quad = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial());
    postScene.add(quad);

    function postMaterial(fragment, uniforms) {
      return new T.ShaderMaterial({
        uniforms: uniforms, vertexShader: POST_VS, fragmentShader: fragment,
        depthTest: false, depthWrite: false
      });
    }
    var brightMat = postMaterial(BRIGHT_FS, { tDiffuse: { value: null }, uThreshold: { value: 0.58 } });
    var blurMat = postMaterial(BLUR_FS, { tDiffuse: { value: null }, uDir: { value: new T.Vector2() } });
    var compositeMat = postMaterial(COMPOSITE_FS, {
      tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.9 },
      uReveal: revealUniform, uWarp: { value: 0 }, uTime: timeUniform,
      uResolution: { value: new T.Vector2(1, 1) }
    });

    var sceneTarget = null;
    var bloomA = null;
    var bloomB = null;
    var useBloom = !lowPower && !mobile && !softwareRenderer;
    compositeMat.uniforms.uBloom.value = useBloom ? 0.95 : 0;
    var width = 1;
    var height = 1;

    function makeTarget(w, h, depth) {
      return new T.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
        minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: !!depth
      });
    }

    function renderPass(material, target) {
      quad.material = material;
      renderer.setRenderTarget(target || null);
      renderer.render(postScene, postCamera);
    }

    function resize() {
      var rect = stage.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      mobile = window.innerWidth < 760;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = mobile ? 66 : 56;
      camera.updateProjectionMatrix();
      var ratio = renderer.getPixelRatio();
      var pw = Math.round(width * ratio);
      var ph = Math.round(height * ratio);
      if (sceneTarget) sceneTarget.dispose();
      if (bloomA) bloomA.dispose();
      if (bloomB) bloomB.dispose();
      sceneTarget = makeTarget(pw, ph, true);
      bloomA = makeTarget(Math.round(pw * 0.45), Math.round(ph * 0.45), false);
      bloomB = makeTarget(Math.round(pw * 0.45), Math.round(ph * 0.45), false);
      compositeMat.uniforms.uResolution.value.set(pw, ph);
      compositeMat.uniforms.uBloom.value = useBloom ? 0.95 : 0;
    }

    var tourSegments = [
      { d: 3.4, from: [0, 9, 68], to: [0, 5, 46], lookFrom: [0, 0, 0], lookTo: [0, 0, 0], focus: null },
      { d: 4.0, from: [0, 5, 46], to: [14, 6, 22], lookFrom: [0, 0, 0], lookTo: [5, 1, 3], focus: null },
      { d: 4.6, from: [14, 6, 22], to: [13.2, 4.2, 14.5], lookFrom: [5, 1, 3], lookTo: [8.5, 1.4, 5], focus: 'shop' },
      { d: 4.6, from: [13.2, 4.2, 14.5], to: [-16, 8, 3], lookFrom: [8.5, 1.4, 5], lookTo: [-9.5, 4.8, -7], focus: 'whatif' },
      { d: 4.6, from: [-16, 8, 3], to: [16, -7, -1], lookFrom: [-9.5, 4.8, -7], lookTo: [11, -5, -11], focus: 'play' },
      { d: 4.6, from: [16, -7, -1], to: [-14, -5, 17], lookFrom: [11, -5, -11], lookTo: [-8, -3.4, 7], focus: 'labs' },
      { d: 4.4, from: [-14, -5, 17], to: [0, 4, 34], lookFrom: [-8, -3.4, 7], lookTo: [0, 0, 0], focus: null }
    ];
    THREE_TOUR_DURATION = tourSegments.reduce(function (sum, segment) { return sum + segment.d; }, 0);

    var overrides = null;
    var hoverId = null;
    var warp = null;

    function ease(value) { return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2; }
    function lerp(a, b, amount) { return a + (b - a) * amount; }
    function lerpVec(out, a, b, amount) {
      out.set(lerp(a[0], b[0], amount), lerp(a[1], b[1], amount), lerp(a[2], b[2], amount));
      return out;
    }

    function computeTour(seconds) {
      var elapsed = 0;
      for (var i = 0; i < tourSegments.length; i++) {
        var segment = tourSegments[i];
        if (seconds <= elapsed + segment.d || i === tourSegments.length - 1) {
          var p = Math.max(0, Math.min(1, (seconds - elapsed) / segment.d));
          var e = ease(p);
          lerpVec(camera.position, segment.from, segment.to, e);
          lerpVec(lookTarget, segment.lookFrom, segment.lookTo, e);
          if (tour.segment !== i) {
            tour.segment = i;
            tourFocus = segment.focus;
            refreshFocus();
            if (segment.focus) markActive(segment.focus);
          }
          return;
        }
        elapsed += segment.d;
      }
    }

    function overview(instant) {
      var to = new T.Vector3(0, 4, 34);
      var look = new T.Vector3(0, 0, 0);
      if (instant || reduce) {
        camera.position.copy(to);
        lookTarget.copy(look);
        overrides = null;
      } else {
        overrides = {
          fromPos: camera.position.clone(), fromLook: lookTarget.clone(),
          toPos: to, toLook: look, start: performance.now(), duration: 1200
        };
      }
    }

    function focusWorld(id) {
      var planet = planets[id];
      if (!planet) return;
      var pos = planet.group.position;
      var dir = new T.Vector3(0.4, 0.22, 1).normalize();
      var to = pos.clone().add(dir.multiplyScalar(planet.def.radius * 5.6));
      overrides = {
        fromPos: camera.position.clone(), fromLook: lookTarget.clone(),
        toPos: to, toLook: pos.clone(), start: performance.now(), duration: 1250
      };
    }

    function beginWarp() {
      if (!selected || !planets[selected]) selected = 'shop';
      var planet = planets[selected];
      var pos = planet.group.position;
      var dir = new T.Vector3(0.35, 0.18, 1).normalize();
      warp = {
        fromPos: camera.position.clone(), fromLook: lookTarget.clone(),
        toPos: pos.clone().add(dir.multiplyScalar(planet.def.radius * 0.8)),
        toLook: pos.clone(), planet: planet, start: performance.now(), duration: 1750
      };
      warpPortal.position.copy(pos);
      warpPortal.visible = true;
      planet.target = 1;
    }

    function pick(clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      var ndc = new T.Vector2(
        ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
      );
      var raycaster = new T.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObjects(pickables, false);
      return hits.length ? hits[0].object.userData.worldId : null;
    }

    function makeGlowTexture(cv, color) {
      cv.width = 128; cv.height = 128;
      var context = cv.getContext('2d');
      var rgb = hexRgb(color);
      var r = Math.round(rgb[0] * 255) + ',' + Math.round(rgb[1] * 255) + ',' + Math.round(rgb[2] * 255);
      var gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
      gradient.addColorStop(0.14, 'rgba(' + r + ',0.55)');
      gradient.addColorStop(0.45, 'rgba(' + r + ',0.12)');
      gradient.addColorStop(1, 'rgba(' + r + ',0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
      var texture = new T.CanvasTexture(cv);
      texture.needsUpdate = true;
      return texture;
    }

    var projection = new T.Vector3();
    var running = false;
    var raf = 0;
    var last = 0;
    var elapsed = 0;

    function syncNodes() {
      var rect = stage.getBoundingClientRect();
      worldIds.forEach(function (id) {
        var planet = planets[id];
        var element = byId[id] && byId[id].el;
        if (!planet || !element) return;
        projection.copy(planet.group.position).project(camera);
        var x = (projection.x * 0.5 + 0.5) * rect.width;
        var y = (-projection.y * 0.5 + 0.5) * rect.height;
        var visible = projection.z < 1 && projection.z > -1;
        var distance = camera.position.distanceTo(planet.group.position);
        var size = Math.max(16, Math.min(72, planet.def.radius * 520 / Math.max(8, distance)));
        element.style.left = '0px';
        element.style.top = '0px';
        element.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%)';
        element.style.zIndex = String(10 + Math.round((1 - projection.z) * 20));
        element.style.setProperty('--node-r', size.toFixed(1) + 'px');
        element.style.visibility = visible ? 'visible' : 'hidden';
      });
    }

    function updatePlanet(id, delta, now) {
      var planet = planets[id];
      var active = hoverId === id || selected === id || tourFocus === id;
      var wanted = active ? 1 : 0;
      planet.target = wanted;
      planet.highlight += (planet.target - planet.highlight) * Math.min(1, delta * 0.005);
      planet.material.uniforms.uHighlight.value = planet.highlight;
      planet.atmosphere.value = 0.55 + planet.highlight * 0.75;
      if (planet.ringPower) planet.ringPower.value = 0.55 + planet.highlight * 0.75;
      planet.sprite.material.opacity = 0.42 + planet.highlight * 0.45;
      planet.mesh.rotation.y += delta * 0.001 * planet.def.speed * 12;
      planet.group.position.set(
        planet.base.x + Math.sin(elapsed * 0.00006 * (planet.index + 1) + planet.index) * 0.5,
        planet.base.y + Math.sin(elapsed * 0.00009 + planet.index * 1.7) * 0.35,
        planet.base.z + Math.cos(elapsed * 0.00005 + planet.index) * 0.5
      );
      planet.extras.forEach(function (extra) {
        if (extra.type === 'shape' || extra.type === 'node' || extra.type === 'moon') {
          var a = (extra.obj.userData.orbit || 0) + now * 0.00025 * extra.speed * 8;
          var r = planet.def.radius * (extra.type === 'moon' ? 2.25 : 1.9);
          extra.obj.position.set(Math.cos(a) * r, Math.sin(a * 0.7) * r * 0.32, Math.sin(a) * r * 0.6);
          if (extra.type !== 'moon') extra.obj.rotation.y += delta * 0.001;
        } else {
          extra.obj.rotation.z += delta * 0.001 * extra.speed * 5;
          extra.obj.rotation.x += delta * 0.0003 * extra.speed;
        }
      });
    }

    function update(delta, now) {
      elapsed += delta;
      timeUniform.value = elapsed;
      revealUniform.value = Math.min(1, revealUniform.value + delta * 0.00055);
      disk.rotation.y += delta * 0.000012;
      dust.rotation.y -= delta * 0.000008;
      coreGroup.rotation.z += delta * 0.000015;
      coreGroup.children.forEach(function (child, i) {
        if (i > 0) child.rotation.z += delta * 0.00008 * (i % 2 ? 1 : -1);
      });
      billboards.forEach(function (mesh) {
        mesh.quaternion.copy(camera.quaternion);
        if (mesh.userData.spin) mesh.rotation.z += mesh.userData.spin * delta;
      });

      if (hovered) autoPausedAt = now;
      var paused = manualPaused || !!warp || (autoPausedAt && now - autoPausedAt < 1200);
      if (!hovered && autoPausedAt && now - autoPausedAt >= 1200) autoPausedAt = 0;
      if (tour.active && paused && !tour.pauseAt) tour.pauseAt = now;
      if (tour.active && !paused && tour.pauseAt) {
        tour.start += now - tour.pauseAt;
        tour.pauseAt = 0;
      }
      if (tour.active) {
        tour.time = Math.min(THREE_TOUR_DURATION, Math.max(0, now - tour.start));
        computeTour(tour.time);
        if (tour.time >= THREE_TOUR_DURATION) {
          tour.active = false;
          tour.finished = true;
          tour.segment = -1;
          tourFocus = null;
          refreshFocus();
          updateToggle();
        }
        if (progressBar) progressBar.style.width = (tour.time / THREE_TOUR_DURATION * 100).toFixed(1) + '%';
      } else if (progressBar && tour.finished) {
        progressBar.style.width = '100%';
      }

      if (warp) {
        var wp = Math.min(1, (now - warp.start) / warp.duration);
        var we = ease(wp);
        camera.position.lerpVectors(warp.fromPos, warp.toPos, we);
        lookTarget.lerpVectors(warp.fromLook, warp.toLook, we);
        warp.planet.highlight = 1;
        warp.planet.material.uniforms.uHighlight.value = 1;
        warp.planet.sprite.material.opacity = 0.95;
        warpPortal.quaternion.copy(camera.quaternion);
        warpPortal.scale.setScalar(0.4 + we * warp.planet.def.radius * 5.5);
        warpPortal.material.opacity = Math.sin(wp * Math.PI) * 0.85;
        warpPortal.rotation.z += delta * 0.002;
        compositeMat.uniforms.uWarp.value = wp;
        if (wp >= 1 && !warp.done) {
          warp.done = true;
          stage.classList.remove('is-warping');
          window.location.assign(warpState ? warpState.href : '/shop');
          return;
        }
      } else if (overrides) {
        var op = Math.min(1, (now - overrides.start) / overrides.duration);
        var oe = ease(op);
        camera.position.lerpVectors(overrides.fromPos, overrides.toPos, oe);
        lookTarget.lerpVectors(overrides.fromLook, overrides.toLook, oe);
        if (op >= 1) overrides = null;
      } else if (tour.active || reduce) {
        if (reduce) overview(true);
      }

      camera.position.y -= drift;
      drift = !warp && !overrides && !tour.active && !reduce ? Math.sin(elapsed * 0.00035) * 0.02 : 0;
      camera.position.y += drift;
      lookFinal.copy(lookTarget);
      lookFinal.x += pointer.x * 0.35;
      lookFinal.y += pointer.y * 0.2;
      camera.lookAt(lookFinal);

      worldIds.forEach(function (id) { updatePlanet(id, delta, now); });

      for (var i = 0; i < meteorCount; i++) {
        var data = meteorData[i];
        var a = data.a + elapsed * data.speed;
        dummy.position.set(Math.cos(a) * data.r, data.y + Math.sin(a * 1.7) * data.tilt * 4, Math.sin(a) * data.r - 10);
        dummy.rotation.set(a, a * 0.7, a * 1.3);
        dummy.updateMatrix();
        meteors.setMatrixAt(i, dummy.matrix);
      }
      meteors.instanceMatrix.needsUpdate = true;
      syncNodes();

      if (ui && !coarse) {
        ui.style.setProperty('--ui-x', (-pointer.x * 10).toFixed(1) + 'px');
        ui.style.setProperty('--ui-y', (-pointer.y * 7).toFixed(1) + 'px');
      }
    }

    function render() {
      renderer.setRenderTarget(sceneTarget);
      renderer.clear();
      renderer.render(scene, camera);
      if (useBloom) {
        brightMat.uniforms.tDiffuse.value = sceneTarget.texture;
        renderPass(brightMat, bloomA);
        blurMat.uniforms.tDiffuse.value = bloomA.texture;
        blurMat.uniforms.uDir.value.set(1 / Math.max(2, bloomA.width), 0);
        renderPass(blurMat, bloomB);
        blurMat.uniforms.tDiffuse.value = bloomB.texture;
        blurMat.uniforms.uDir.value.set(0, 1 / Math.max(2, bloomB.height));
        renderPass(blurMat, bloomA);
        compositeMat.uniforms.tBloom.value = bloomA.texture;
      } else {
        compositeMat.uniforms.tBloom.value = sceneTarget.texture;
      }
      compositeMat.uniforms.tScene.value = sceneTarget.texture;
      renderPass(compositeMat, null);
    }

    function frame(now) {
      if (!running) return;
      var delta = last ? Math.min(50, now - last) : 16;
      last = now;
      update(delta, now);
      render();
      raf = window.requestAnimationFrame(frame);
    }

    function start() {
      if (running || document.hidden) return;
      if (reduce) {
        syncNodes();
        render();
        hideLoader();
        return;
      }
      running = true;
      last = 0;
      raf = window.requestAnimationFrame(frame);
      hideLoader();
    }

    function stop() {
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    }

    resize();
    render();
    setLoader(72, 'Formando planetas…');
    tour.start = performance.now();
    if (reduce) {
      overview(true);
      camera.lookAt(lookTarget);
      syncNodes();
      tour.active = false;
      tour.finished = true;
      updateToggle();
      render();
      hideLoader();
    } else {
      start();
      hideLoader();
    }

    return {
      setPointer: function (x, y) { pointer.x = x; pointer.y = y; },
      setHover: function (id) { hoverId = id; },
      focusWorld: focusWorld,
      overview: overview,
      beginWarp: beginWarp,
      pick: pick,
      resize: function () { resize(); if (!running) render(); },
      start: start,
      stop: stop,
      dispose: function () {
        stop();
        scene.traverse(function (object) {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) object.material.forEach(function (m) { m.dispose(); });
            else object.material.dispose();
          }
        });
        if (sceneTarget) sceneTarget.dispose();
        if (bloomA) bloomA.dispose();
        if (bloomB) bloomB.dispose();
        renderer.dispose();
      }
    };
  }

  bindUi();
  updateToggle();
  window.setTimeout(function () {
    if (loader && !loader.hidden && !loader.classList.contains('is-done')) hideLoader();
  }, 5000);

  try {
    setLoader(42, 'Encendido de motores gráficos…');
    three = initThree();
    if (three) stage.classList.remove('no-webgl');
  } catch (error) {
    three = null;
  }

  if (!three) {
    stage.classList.add('no-webgl');
    if (loaderBar) loaderBar.style.width = '100%';
    hideLoader();
    if (toggleBtn) toggleBtn.hidden = true;
    if (skipBtn) skipBtn.hidden = true;
    if (overviewBtn) overviewBtn.hidden = true;
  } else {
    tour.start = performance.now();
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () { three.resize(); }, 140);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) three.stop();
      else three.start();
    });
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) three.start();
        else three.stop();
      }, { threshold: 0.02 });
      observer.observe(stage);
    }
    canvas.addEventListener('webglcontextlost', function (event) {
      event.preventDefault();
      three.stop();
      three.dispose();
      three = null;
      stage.classList.add('no-webgl');
      if (loader) loader.hidden = true;
    });
    window.addEventListener('pagehide', function () { if (three) three.dispose(); });
  }
})();
