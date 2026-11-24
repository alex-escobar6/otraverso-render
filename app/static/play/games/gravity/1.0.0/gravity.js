(function (global) {
  'use strict';

  var O = global.OTRAVERSO;
  if (!O) return;

  var PLAY = O.PLAY || null;
  var GFX = O.GFX || null;
  var doc = global.document;
  var THREE = global.THREE;
  var BEST_KEY = 'otraverso.gravity.best.v1';
  var STEP = 1 / 60;
  var RADIUS = 0.62;
  var MAX_SPEED = 10.5;
  var ACCEL = 34;
  var FRICTION = 9;
  var JUMP_SPEED = 9.6;
  var RESTITUTION = 0.22;

  var LEVELS = [
    {
      name: 'ÓRBITA INICIAL',
      spawn: [0, 2.2, 10],
      gravity: [0, -18, 0],
      bounds: -30,
      hint: 'Sector 1 · Aprende a rodar, saltar y usar el campo de elevación.',
      platforms: [
        { p: [0, 0, 8], s: [9, 1, 9], color: 0x3d3a7a },
        { p: [0, 0.4, 0], s: [7, 1, 7], color: 0x4b447f },
        { p: [4, 2, -13], s: [7, 1, 7], color: 0x55407f },
        { p: [0, 3, -20], s: [8, 1, 7], color: 0x3f5d83 }
      ],
      moving: [
        { p: [0, 1.2, -6], s: [5, 0.8, 5], axis: 'x', amplitude: 3.4, speed: 1.1, phase: 0, color: 0x2f7f8c }
      ],
      zones: [
        { p: [4, 4, -13], r: 5.5, v: [0, 1, 0], strength: 7, color: 0x67e8f9 }
      ],
      collectibles: [
        [0, 1.8, 4],
        [0, 2.4, -2],
        [4, 4.2, -13],
        [0, 5, -20]
      ],
      portal: [0, 5, -21]
    },
    {
      name: 'CAMPO INVERSO',
      spawn: [0, 2.2, 12],
      gravity: [0, -18, 0],
      bounds: -34,
      hint: 'Sector 2 · El campo lateral empuja la esfera; compensa con la cámara.',
      platforms: [
        { p: [0, 0, 9], s: [8, 1, 8], color: 0x3d3a7a },
        { p: [-4, 1, 1], s: [6, 1, 6], color: 0x4b447f },
        { p: [4, 2, -7], s: [6, 1, 6], color: 0x55407f },
        { p: [0, 3, -17], s: [7, 1, 7], color: 0x3f5d83 },
        { p: [0, 4, -24], s: [8, 1, 7], color: 0x486b82 }
      ],
      moving: [
        { p: [0, 2, -12], s: [5, 0.8, 5], axis: 'z', amplitude: 2.2, speed: 1.3, phase: 1.2, color: 0x2f7f8c }
      ],
      zones: [
        { p: [1, 3, -7], r: 7, v: [1, 0, 0], strength: 12, color: 0xf472b6 },
        { p: [0, 5, -19], r: 6, v: [0, 1, 0], strength: 8, color: 0x67e8f9 }
      ],
      collectibles: [
        [-4, 2.8, 1],
        [4, 4, -7],
        [0, 5, -13],
        [0, 6.2, -24]
      ],
      portal: [0, 6.2, -25]
    },
    {
      name: 'NÚCLEO VACÍO',
      spawn: [0, 2.2, 12],
      gravity: [0, -18, 0],
      bounds: -40,
      hint: 'Sector 3 · Plataformas móviles y gravedad cambiante. Mantén el impulso.',
      platforms: [
        { p: [0, 0, 9], s: [8, 1, 8], color: 0x3d3a7a },
        { p: [5, 2, -6], s: [6, 1, 6], color: 0x55407f },
        { p: [-5, 4, -20], s: [7, 1, 7], color: 0x3f5d83 },
        { p: [0, 5, -28], s: [9, 1, 7], color: 0x486b82 }
      ],
      moving: [
        { p: [0, 1.5, 2], s: [5, 0.8, 5], axis: 'x', amplitude: 4, speed: 1.2, phase: 0.4, color: 0x2f7f8c },
        { p: [0, 3, -13], s: [5, 0.8, 5], axis: 'y', amplitude: 2, speed: 1.05, phase: 2.1, color: 0x2f7f8c }
      ],
      zones: [
        { p: [5, 4, -6], r: 6.5, v: [1, 0, 0], strength: 13, color: 0xf472b6 },
        { p: [-5, 6, -20], r: 7, v: [0, 1, 0], strength: 9, color: 0x67e8f9 },
        { p: [0, 6, -28], r: 5, v: [0, -1, 0], strength: 10, color: 0xa78bfa }
      ],
      collectibles: [
        [0, 3.4, 2],
        [5, 4.2, -6],
        [0, 5, -13],
        [-5, 6.2, -20],
        [0, 7.4, -28]
      ],
      portal: [0, 7.2, -29]
    }
  ];

  var root = null;
  var host = null;
  var viewport = null;
  var renderer = null;
  var scene = null;
  var camera = null;
  var levelGroup = null;
  var starField = null;
  var raycaster = null;
  var canvas = null;
  var running = false;
  var paused = false;
  var frame = 0;
  var last = 0;
  var accumulator = 0;
  var worldTime = 0;
  var elapsed = 0;
  var levelIndex = 0;
  var score = 0;
  var falls = 0;
  var collected = 0;
  var levelSpan = 1;
  var cameraYaw = 0;
  var cameraPitch = 0.32;
  var cameraDistance = 10.5;
  var hintTimer = 0;
  var listeners = [];
  var keys = {};
  var touchInput = { x: 0, y: 0 };
  var colliders = [];
  var collectibles = [];
  var zones = [];
  var portal = null;
  var hudNodes = {};
  var player = null;
  var gravityVec = null;
  var upVec = null;
  var cameraTarget = null;
  var spawnPoint = null;
  var graphicsMode = 'full';
  var fallback = null;
  var contextGeneration = 0;

  function vector(values) {
    return new THREE.Vector3(values[0], values[1], values[2]);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push([target, type, handler, options]);
  }

  function offAll() {
    listeners.forEach(function (entry) {
      entry[0].removeEventListener(entry[1], entry[2], entry[3]);
    });
    listeners = [];
  }

  function cacheHud() {
    hudNodes = {
      level: root.querySelector('[data-gravity-level]'),
      score: root.querySelector('[data-gravity-score]'),
      orbs: root.querySelector('[data-gravity-orbs]'),
      time: root.querySelector('[data-gravity-time]'),
      falls: root.querySelector('[data-gravity-falls]'),
      gravity: root.querySelector('[data-gravity-gravity]'),
      progress: root.querySelector('[data-gravity-progress]'),
      hint: root.querySelector('[data-gravity-hint]'),
      paused: root.querySelector('[data-game-paused]'),
      result: root.querySelector('[data-game-result]'),
      resultTitle: root.querySelector('[data-result-title]'),
      resultScore: root.querySelector('[data-result-score]'),
      resultTime: root.querySelector('[data-result-time]'),
      resultBest: root.querySelector('[data-result-best]'),
      resultDetail: root.querySelector('[data-result-detail]')
    };
  }

  function setNode(node, value) {
    if (node) node.textContent = String(value);
  }

  function setHint(message) {
    if (!hudNodes.hint) return;
    hudNodes.hint.textContent = message;
    global.clearTimeout(hintTimer);
    hintTimer = global.setTimeout(function () {
      if (hudNodes.hint) hudNodes.hint.textContent = LEVELS[levelIndex].hint;
    }, 2600);
  }

  function initVectors() {
    player = {
      position: vector([0, 0, 0]),
      velocity: vector([0, 0, 0]),
      grounded: false,
      support: null,
      coyote: 0,
      jumpBuffer: 0
    };
    gravityVec = vector([0, -18, 0]);
    upVec = vector([0, 1, 0]);
    cameraTarget = vector([0, 0, 0]);
    spawnPoint = vector([0, 0, 0]);
    raycaster = new THREE.Raycaster();
  }

  function fallbackX(z) {
    return 120 + (z + 32) * 26;
  }

  function fallbackY(y) {
    return 520 - y * 38;
  }

  function createFallbackCanvas() {
    if (fallback && fallback.canvas) return true;
    if (!viewport) return false;
    var canvas = doc.createElement('canvas');
    canvas.className = 'gravity-canvas gravity-canvas--fallback';
    canvas.setAttribute('data-play-runtime', 'gravity-fallback');
    canvas.setAttribute('data-game-canvas', '');
    canvas.setAttribute('aria-hidden', 'true');
    var status = doc.createElement('div');
    status.className = 'gravity-graphics-status';
    status.setAttribute('data-gfx-status', 'fallback');
    status.textContent = 'MODO COMPATIBILIDAD · Canvas 2D';
    viewport.appendChild(canvas);
    viewport.appendChild(status);
    fallback = {
      canvas: canvas,
      status: status,
      ctx: canvas.getContext('2d'),
      width: 0,
      height: 0,
      dpr: 1,
      platforms: [],
      orbs: [],
      portal: { x: 0, y: 0 },
      player: { x: 0, y: 0, vx: 0, vy: 0, grounded: false },
      cameraX: 0,
      worldWidth: 1800,
      jumpBuffer: 0,
      stars: []
    };
    for (var i = 0; i < 90; i += 1) {
      fallback.stars.push({ x: Math.random(), y: Math.random(), r: 0.4 + Math.random() * 1.2, a: 0.2 + Math.random() * 0.7 });
    }
    resizeFallback();
    return true;
  }

  function resizeFallback() {
    if (!fallback || !viewport) return;
    var rect = viewport.getBoundingClientRect();
    fallback.width = Math.max(320, Math.round(rect.width));
    fallback.height = Math.max(360, Math.round(rect.height));
    fallback.dpr = Math.min(global.devicePixelRatio || 1, 1.5);
    fallback.canvas.width = Math.round(fallback.width * fallback.dpr);
    fallback.canvas.height = Math.round(fallback.height * fallback.dpr);
    fallback.canvas.style.width = fallback.width + 'px';
    fallback.canvas.style.height = fallback.height + 'px';
    if (fallback.ctx) fallback.ctx.setTransform(fallback.dpr, 0, 0, fallback.dpr, 0, 0);
  }

  function fallbackReset(index) {
    if (!fallback) return;
    levelIndex = clamp(index | 0, 0, LEVELS.length - 1);
    var spec = LEVELS[levelIndex];
    fallback.platforms = spec.platforms.map(function (item) {
      return { x: fallbackX(item.p[2]) - item.s[2] * 8, y: fallbackY(item.p[1]) + 10, w: item.s[2] * 16, h: 18 };
    });
    fallback.orbs = spec.collectibles.map(function (pos, i) {
      return { x: fallbackX(pos[2]), y: fallbackY(pos[1]), radius: 9, phase: i * 0.9, taken: false };
    });
    fallback.portal = { x: fallbackX(spec.portal[2]), y: fallbackY(spec.portal[1]) - 16 };
    fallback.player.x = fallbackX(spec.spawn[2]);
    fallback.player.y = fallbackY(spec.spawn[1]);
    fallback.player.vx = 0;
    fallback.player.vy = 0;
    fallback.player.grounded = false;
    fallback.jumpBuffer = 0;
    fallback.cameraX = clamp(fallback.player.x - fallback.width * 0.3, 0, fallback.worldWidth - fallback.width);
    collected = 0;
    setNode(hudNodes.level, (levelIndex + 1) + ' / ' + LEVELS.length);
    setHint('MODO COMPATIBILIDAD · ' + spec.name);
  }

  function fallbackUpdate(dt) {
    if (!fallback || paused || doc.hidden) return;
    var player = fallback.player;
    var axis = 0;
    if (keys.ArrowLeft || keys.a || keys.A) axis -= 1;
    if (keys.ArrowRight || keys.d || keys.D) axis += 1;
    if (touchInput.x) axis += touchInput.x;
    axis = clamp(axis, -1, 1);
    player.vx += axis * 1400 * dt;
    player.vx *= Math.max(0, 1 - 7 * dt);
    player.vx = clamp(player.vx, -320, 320);
    player.x = clamp(player.x + player.vx * dt, 20, fallback.worldWidth - 20);
    fallback.jumpBuffer = Math.max(0, fallback.jumpBuffer - dt);
    if (fallback.jumpBuffer > 0 && player.grounded) {
      player.vy = -470;
      player.grounded = false;
      fallback.jumpBuffer = 0;
    }
    player.vy = Math.min(player.vy + 1050 * dt, 620);
    var previousBottom = player.y + 13;
    player.y += player.vy * dt;
    player.grounded = false;
    fallback.platforms.forEach(function (platform) {
      if (player.x < platform.x - 14 || player.x > platform.x + platform.w + 14) return;
      var bottom = player.y + 13;
      if (previousBottom <= platform.y + 6 && bottom >= platform.y && player.vy >= 0) {
        player.y = platform.y - 13;
        player.vy = 0;
        player.grounded = true;
      }
    });
    fallback.orbs.forEach(function (orb) {
      if (orb.taken) return;
      var dx = player.x - orb.x;
      var dy = player.y - orb.y;
      if (dx * dx + dy * dy < 26 * 26) {
        orb.taken = true;
        collected += 1;
        score += 120;
      }
    });
    if (player.y > fallback.height + 160) {
      falls += 1;
      fallbackReset(levelIndex);
    }
    var nearPortal = Math.abs(player.x - fallback.portal.x) < 42 && Math.abs(player.y - fallback.portal.y) < 60;
    if (nearPortal && collected >= fallback.orbs.length) {
      score += 800 + Math.max(0, 600 - Math.round(elapsed * 10));
      if (levelIndex + 1 < LEVELS.length) {
        levelIndex += 1;
        fallbackReset(levelIndex);
      } else {
        finishGame();
        return;
      }
    }
    fallback.cameraX += (clamp(player.x - fallback.width * 0.34, 0, Math.max(0, fallback.worldWidth - fallback.width)) - fallback.cameraX) * Math.min(1, dt * 4);
    elapsed += dt;
    updateHud();
  }

  function fallbackDraw() {
    if (!fallback || !fallback.ctx) return;
    var ctx = fallback.ctx;
    var w = fallback.width;
    var h = fallback.height;
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#05050f');
    sky.addColorStop(0.55, '#160b2e');
    sky.addColorStop(1, '#06040f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    fallback.stars.forEach(function (star) {
      ctx.globalAlpha = star.a;
      ctx.fillStyle = '#cffafe';
      ctx.fillRect(star.x * w, star.y * h * 0.7, star.r, star.r);
    });
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(-fallback.cameraX, 0);
    fallback.platforms.forEach(function (platform) {
      var gradient = ctx.createLinearGradient(platform.x, platform.y, platform.x, platform.y + platform.h);
      gradient.addColorStop(0, '#67e8f9');
      gradient.addColorStop(0.12, '#3b2f78');
      gradient.addColorStop(1, '#120d2b');
      ctx.fillStyle = gradient;
      ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
      ctx.strokeStyle = 'rgba(103,232,249,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(platform.x, platform.y, platform.w, platform.h);
    });
    fallback.orbs.forEach(function (orb) {
      if (orb.taken) return;
      var bob = Math.sin(worldTime * 3 + orb.phase) * 4;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y + bob, orb.radius + 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(103,232,249,0.14)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(orb.x, orb.y + bob, orb.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#67e8f9';
      ctx.fill();
    });
    var portalPulse = 1 + Math.sin(worldTime * 2.4) * 0.09;
    ctx.beginPath();
    ctx.ellipse(fallback.portal.x, fallback.portal.y, 18 * portalPulse, 34 * portalPulse, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(fallback.player.x, fallback.player.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fallback.player.x - 4, fallback.player.y - 4, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#67e8f9';
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(226,232,240,0.72)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText('SECTOR ' + (levelIndex + 1) + ' · RECOGE LOS ORBES Y ALCANZA EL PORTAL', 16, h - 16);
  }

  function addStars() {
    var points = [];
    for (var i = 0; i < 420; i += 1) {
      var radius = 60 + Math.random() * 90;
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      points.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    var material = new THREE.PointsMaterial({
      color: 0xa8b4ff,
      size: 0.55,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72
    });
    starField = new THREE.Points(geometry, material);
    scene.add(starField);
  }

  function addLights() {
    scene.add(new THREE.AmbientLight(0x8f9bff, 0.62));
    var main = new THREE.DirectionalLight(0xffffff, 0.95);
    main.position.set(8, 18, 12);
    scene.add(main);
    var rim = new THREE.PointLight(0xf472b6, 0.85, 55);
    rim.position.set(-10, 10, -18);
    scene.add(rim);
  }

  function enableFallback(reason) {
    graphicsMode = 'fallback';
    if (!createFallbackCanvas()) return false;
    if (hudNodes.gravity) hudNodes.gravity.textContent = 'COMPATIBILIDAD';
    if (reason) notifyFallback(reason);
    return true;
  }

  function notifyFallback(reason) {
    if (!O.notify) return;
    O.notify('GRAVITY en modo compatible: ' + reason);
  }

  function ensureRenderer() {
    if (renderer || fallback) return true;
    if (!viewport) return false;
    if (graphicsMode === 'fallback' || !THREE) return enableFallback('WebGL no disponible');
    try {
      renderer = GFX && typeof GFX.createRenderer === 'function'
        ? GFX.createRenderer({ antialias: false, powerPreference: 'low-power' })
        : new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
    } catch (error) {
      renderer = null;
    }
    if (!renderer) return enableFallback('no se pudo iniciar WebGL');
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x05040f, 1);
    canvas = renderer.domElement;
    canvas.className = 'gravity-canvas';
    canvas.setAttribute('data-play-runtime', 'gravity');
    canvas.setAttribute('data-game-canvas', '');
    canvas.setAttribute('aria-hidden', 'true');
    viewport.appendChild(canvas);
    if (GFX) {
      GFX.onContextLost(function (event) {
        if (!event || event.generation !== contextGeneration) return;
        stop();
        O.showError('El contexto 3D se perdió. Se activó el modo compatible.', function () {
          if (GFX) GFX.releaseRenderer();
          renderer = null;
          start({ level: levelIndex });
        });
      });
      GFX.onContextRestored(function (event) {
        if (!event || event.generation !== contextGeneration || event.attempts > 1) return;
        if (hudNodes.hint) hudNodes.hint.textContent = 'Contexto 3D restaurado';
      });
      contextGeneration += 1;
    }
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05040f, 0.013);
    camera = new THREE.PerspectiveCamera(62, 1, 0.1, 260);
    levelGroup = new THREE.Group();
    scene.add(levelGroup);
    addLights();
    addStars();
    resize();
    return true;
  }

  function resize() {
    if (fallback) {
      resizeFallback();
      return;
    }
    if (!renderer || !camera || !viewport) return;
    var rect = viewport.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width));
    var height = Math.max(360, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function clearLevel() {
    if (!levelGroup) return;
    while (levelGroup.children.length) {
      var child = levelGroup.children[0];
      levelGroup.remove(child);
      child.traverse(function (node) {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          if (Array.isArray(node.material)) node.material.forEach(function (item) { item.dispose(); });
          else node.material.dispose();
        }
      });
    }
    colliders = [];
    collectibles = [];
    zones = [];
    portal = null;
  }

  function addBox(spec) {
    var size = vector(spec.s);
    var geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    var material = new THREE.MeshStandardMaterial({
      color: spec.color || 0x44447a,
      metalness: 0.12,
      roughness: 0.68,
      emissive: spec.color || 0x222244,
      emissiveIntensity: 0.12
    });
    var mesh = new THREE.Mesh(geometry, material);
    var center = vector(spec.p);
    mesh.position.copy(center);
    levelGroup.add(mesh);
    var collider = {
      mesh: mesh,
      center: center,
      base: center.clone(),
      half: size.clone().multiplyScalar(0.5),
      delta: vector([0, 0, 0]),
      moving: null,
      restitution: RESTITUTION
    };
    colliders.push(collider);
    return collider;
  }

  function addMoving(spec) {
    var collider = addBox(spec);
    var axis = vector([0, 0, 0]);
    if (spec.axis === 'x') axis.x = 1;
    else if (spec.axis === 'y') axis.y = 1;
    else axis.z = 1;
    collider.moving = {
      axis: axis,
      amplitude: spec.amplitude,
      speed: spec.speed,
      phase: spec.phase || 0
    };
    collider.restitution = 0.08;
    return collider;
  }

  function addCollectible(position, index) {
    var geometry = new THREE.IcosahedronGeometry(0.42, 0);
    var material = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x67e8f9,
      emissiveIntensity: 0.85,
      metalness: 0.2,
      roughness: 0.3
    });
    var mesh = new THREE.Mesh(geometry, material);
    var point = vector(position);
    mesh.position.copy(point);
    levelGroup.add(mesh);
    collectibles.push({
      mesh: mesh,
      baseY: point.y,
      phase: index * 1.7,
      radius: 1.05,
      collected: false
    });
  }

  function addZone(spec) {
    var center = vector(spec.p);
    var geometry = new THREE.SphereGeometry(spec.r, 16, 12);
    var material = new THREE.MeshBasicMaterial({
      color: spec.color,
      wireframe: true,
      transparent: true,
      opacity: 0.085,
      depthWrite: false
    });
    var mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(center);
    levelGroup.add(mesh);
    zones.push({
      center: center,
      radius: spec.r,
      direction: vector(spec.v).normalize(),
      strength: spec.strength,
      mesh: mesh
    });
  }

  function addPortal(position) {
    var group = new THREE.Group();
    var outerMaterial = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.9 });
    var innerMaterial = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.7 });
    var outer = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.14, 10, 36), outerMaterial);
    var inner = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.08, 8, 28), innerMaterial);
    inner.rotation.y = Math.PI / 2;
    group.add(outer);
    group.add(inner);
    var point = vector(position);
    group.position.copy(point);
    levelGroup.add(group);
    return { group: group, position: point, radius: 1.45, outer: outer, inner: inner, materials: [outerMaterial, innerMaterial] };
  }

  function loadLevel(index) {
    clearLevel();
    levelIndex = clamp(index, 0, LEVELS.length - 1);
    var def = LEVELS[levelIndex];
    def.platforms.forEach(addBox);
    def.moving.forEach(addMoving);
    def.zones.forEach(addZone);
    def.collectibles.forEach(addCollectible);
    portal = addPortal(def.portal);
    spawnPoint.copy(vector(def.spawn));
    player.position.copy(spawnPoint);
    player.velocity.set(0, 0, 0);
    player.grounded = false;
    player.support = null;
    player.coyote = 0;
    player.jumpBuffer = 0;
    collected = 0;
    worldTime = 0;
    accumulator = 0;
    cameraYaw = 0;
    cameraPitch = 0.32;
    levelSpan = Math.max(1, spawnPoint.distanceTo(portal.position));
    cameraTarget.copy(player.position);
    setHint(def.hint);
    updateCamera(1, true);
    updateHud();
  }

  function currentGravity() {
    var def = LEVELS[levelIndex];
    var result = vector(def.gravity);
    zones.forEach(function (zone) {
      var distance = player.position.distanceTo(zone.center);
      if (distance >= zone.radius) return;
      var t = 1 - distance / zone.radius;
      var weight = t * t * (3 - 2 * t);
      var target = zone.direction.clone().multiplyScalar(zone.strength);
      result.lerp(target, weight * 0.82);
    });
    return result;
  }

  function upFromGravity(gravity) {
    var up = gravity.clone();
    if (up.lengthSq() < 0.0001) return vector([0, 1, 0]);
    return up.normalize().negate();
  }

  function inputDirection(up) {
    var x = 0;
    var y = 0;
    if (keys.ArrowLeft || keys.a || keys.A) x -= 1;
    if (keys.ArrowRight || keys.d || keys.D) x += 1;
    if (keys.ArrowUp || keys.w || keys.W) y += 1;
    if (keys.ArrowDown || keys.s || keys.S) y -= 1;
    x += touchInput.x;
    y += touchInput.y;
    var forward = vector([-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)]);
    var right = new THREE.Vector3().crossVectors(forward, up);
    if (right.lengthSq() < 0.01) right.set(1, 0, 0);
    right.normalize();
    var direction = right.multiplyScalar(x).addScaledVector(forward, y);
    direction.addScaledVector(up, -direction.dot(up));
    if (direction.lengthSq() > 1) direction.normalize();
    return direction;
  }

  function updateMovingPlatforms(dt) {
    if (dt <= 0) return;
    colliders.forEach(function (collider) {
      if (!collider.moving) return;
      var previous = collider.center.clone();
      var offset = Math.sin(worldTime * collider.moving.speed + collider.moving.phase) * collider.moving.amplitude;
      collider.center.copy(collider.base).addScaledVector(collider.moving.axis, offset);
      collider.delta.copy(collider.center).sub(previous);
      collider.mesh.position.copy(collider.center);
    });
  }

  function resolveBox(collider, up) {
    var min = collider.center.clone().sub(collider.half);
    var max = collider.center.clone().add(collider.half);
    var closest = new THREE.Vector3(
      clamp(player.position.x, min.x, max.x),
      clamp(player.position.y, min.y, max.y),
      clamp(player.position.z, min.z, max.z)
    );
    var delta = player.position.clone().sub(closest);
    var distanceSq = delta.lengthSq();
    if (distanceSq >= RADIUS * RADIUS) return;
    var normal;
    var penetration;
    if (distanceSq > 0.000001) {
      var distance = Math.sqrt(distanceSq);
      normal = delta.multiplyScalar(1 / distance);
      penetration = RADIUS - distance;
    } else {
      var faces = [
        { d: player.position.x - min.x, n: vector([-1, 0, 0]) },
        { d: max.x - player.position.x, n: vector([1, 0, 0]) },
        { d: player.position.y - min.y, n: vector([0, -1, 0]) },
        { d: max.y - player.position.y, n: vector([0, 1, 0]) },
        { d: player.position.z - min.z, n: vector([0, 0, -1]) },
        { d: max.z - player.position.z, n: vector([0, 0, 1]) }
      ];
      faces.sort(function (a, b) { return a.d - b.d; });
      normal = faces[0].n;
      penetration = RADIUS + faces[0].d;
    }
    player.position.addScaledVector(normal, penetration);
    var normalSpeed = player.velocity.dot(normal);
    if (normalSpeed < 0) {
      player.velocity.addScaledVector(normal, -(1 + collider.restitution) * normalSpeed);
    }
    if (normal.dot(up) > 0.45) {
      player.grounded = true;
      player.support = collider;
    }
  }

  function allOrbs() {
    return collected === collectibles.length;
  }

  function checkCollectibles() {
    collectibles.forEach(function (item) {
      if (item.collected) return;
      if (player.position.distanceTo(item.mesh.position) > item.radius + RADIUS) return;
      item.collected = true;
      item.mesh.visible = false;
      collected += 1;
      score += 100;
      if (allOrbs()) {
        if (portal) portal.materials[0].color.setHex(0x67e8f9);
        setHint('TODOS LOS ORBES CAPTURADOS · PORTAL ABIERTO');
      }
    });
  }

  function checkPortal() {
    if (!portal || !allOrbs()) return;
    if (player.position.distanceTo(portal.position) > portal.radius + RADIUS) return;
    score += 500;
    if (levelIndex >= LEVELS.length - 1) {
      finishGame();
      return;
    }
    setHint('SECTOR SUPERADO · ' + LEVELS[levelIndex + 1].name);
    loadLevel(levelIndex + 1);
  }

  function respawn() {
    falls += 1;
    score = Math.max(0, score - 50);
    player.position.copy(spawnPoint);
    player.velocity.set(0, 0, 0);
    player.grounded = false;
    player.support = null;
    player.coyote = 0;
    player.jumpBuffer = 0;
    setHint('CAÍDA DETECTADA · CHECKPOINT RESTAURADO');
  }

  function checkFall() {
    var def = LEVELS[levelIndex];
    if (player.position.y < def.bounds || Math.abs(player.position.x) > 90 || Math.abs(player.position.z) > 90) {
      respawn();
    }
  }

  function physicsStep(dt) {
    worldTime += dt;
    elapsed += dt;
    updateMovingPlatforms(dt);
    var gravity = currentGravity();
    gravityVec.copy(gravity);
    var up = upFromGravity(gravity);
    upVec.copy(up);

    if (player.support && player.support.delta) player.position.add(player.support.delta);
    var wasGrounded = player.grounded;
    if (wasGrounded) player.coyote = 0.1;
    else player.coyote = Math.max(0, player.coyote - dt);

    var wish = inputDirection(up);
    var planar = player.velocity.clone().addScaledVector(up, -player.velocity.dot(up));
    var target = wish.clone().multiplyScalar(wish.lengthSq() > 0.001 ? MAX_SPEED : 0);
    var response = (wish.lengthSq() > 0.001 ? ACCEL : FRICTION) * dt;
    planar.lerp(target, Math.min(1, response));
    var normalSpeed = player.velocity.dot(up);
    player.velocity.copy(planar).addScaledVector(up, normalSpeed);
    player.velocity.addScaledVector(gravity, dt);
    if (player.velocity.length() > 34) player.velocity.setLength(34);

    if (player.jumpBuffer > 0 && (player.grounded || player.coyote > 0)) {
      player.velocity.addScaledVector(up, JUMP_SPEED);
      player.grounded = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
    }
    player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);

    player.position.addScaledVector(player.velocity, dt);
    player.grounded = false;
    player.support = null;
    colliders.forEach(function (collider) { resolveBox(collider, up); });
    checkCollectibles();
    checkPortal();
    checkFall();
  }

  function cameraMeshes() {
    return colliders.map(function (collider) { return collider.mesh; });
  }

  function updateCamera(dt, immediate) {
    if (!camera || !player) return;
    cameraTarget.copy(player.position).addScaledVector(upVec, 0.8);
    var direction = vector([
      Math.sin(cameraYaw) * Math.cos(cameraPitch),
      Math.sin(cameraPitch) + 0.16,
      Math.cos(cameraYaw) * Math.cos(cameraPitch)
    ]).normalize();
    var desired = cameraTarget.clone().addScaledVector(direction, cameraDistance);
    var offset = desired.clone().sub(cameraTarget);
    var length = offset.length();
    offset.normalize();
    raycaster.set(cameraTarget, offset);
    raycaster.far = length;
    var meshes = cameraMeshes();
    if (meshes.length) {
      var hits = raycaster.intersectObjects(meshes, false);
      if (hits.length) desired.copy(cameraTarget).addScaledVector(offset, Math.max(1.5, hits[0].distance - 0.45));
    }
    var factor = immediate ? 1 : 1 - Math.exp(-8 * dt);
    camera.position.lerp(desired, factor);
    camera.lookAt(cameraTarget);
  }

  function gravityLabel() {
    if (gravityVec.y < -9) return 'NORMAL';
    if (gravityVec.y > 2) return 'INVERTIDA';
    if (Math.abs(gravityVec.x) > Math.abs(gravityVec.z)) return gravityVec.x > 0 ? 'LATERAL →' : 'LATERAL ←';
    return gravityVec.z > 0 ? 'LATERAL ↓' : 'LATERAL ↑';
  }

  function updateHud() {
    setNode(hudNodes.level, (levelIndex + 1) + ' / ' + LEVELS.length);
    setNode(hudNodes.score, Math.round(score).toLocaleString('es-CO'));
    setNode(hudNodes.orbs, collected + ' / ' + collectibles.length);
    setNode(hudNodes.time, elapsed.toFixed(1) + ' s');
    setNode(hudNodes.falls, falls);
    setNode(hudNodes.gravity, fallback ? 'COMPATIBILIDAD' : gravityLabel());
    var progress = 0;
    if (fallback) {
      progress = fallback.orbs.length ? collected / fallback.orbs.length * 100 : 0;
    } else if (spawnPoint && player && player.position) {
      progress = spawnPoint.distanceTo(player.position) / levelSpan * 100;
    }
    if (hudNodes.progress) hudNodes.progress.style.width = clamp(progress, 0, 100) + '%';
  }

  function updateVisuals(dt) {
    if (keys.q || keys.Q) cameraYaw -= dt * 1.7;
    if (keys.e || keys.E) cameraYaw += dt * 1.7;
    cameraYaw = clamp(cameraYaw, -Math.PI * 2, Math.PI * 2);
    collectibles.forEach(function (item) {
      if (item.collected) return;
      item.mesh.rotation.y += dt * 1.8;
      item.mesh.rotation.x += dt * 0.7;
      item.mesh.position.y = item.baseY + Math.sin(worldTime * 2 + item.phase) * 0.18;
    });
    if (portal) {
      portal.outer.rotation.z += dt * 0.65;
      portal.inner.rotation.y += dt * 1.1;
      portal.group.scale.setScalar(1 + Math.sin(worldTime * 2.4) * 0.04);
    }
    if (starField) starField.rotation.y += dt * 0.005;
    updateCamera(dt, false);
    updateHud();
  }

  function loop(now) {
    if (!running) return;
    frame = global.requestAnimationFrame(loop);
    var dt = Math.min((now - (last || now)) / 1000, 0.05);
    last = now;
    if (paused || doc.hidden) return;
    worldTime += dt;
    if (fallback) {
      fallbackUpdate(dt);
      fallbackDraw();
      return;
    }
    accumulator += dt;
    var steps = 0;
    while (accumulator >= STEP && steps < 5) {
      physicsStep(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    updateVisuals(dt);
    renderer.render(scene, camera);
  }

  function loadBest() {
    try {
      return JSON.parse(global.localStorage.getItem(BEST_KEY) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function saveBest(value, time) {
    var best = loadBest();
    if (!best.score || value > best.score) {
      best = { score: Math.round(value), time: Math.round(time * 10) / 10, at: new Date().toISOString() };
      try { global.localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (error) { best.local = true; }
    }
    return best;
  }

  function finishGame() {
    running = false;
    var best = saveBest(score, elapsed);
    if (hudNodes.result) hudNodes.result.hidden = false;
    setNode(hudNodes.resultTitle, 'MUNDO GRAVITY COMPLETADO');
    setNode(hudNodes.resultScore, Math.round(score).toLocaleString('es-CO'));
    setNode(hudNodes.resultTime, elapsed.toFixed(1) + ' s');
    setNode(hudNodes.resultBest, best && best.score ? Math.round(best.score).toLocaleString('es-CO') : '—');
    setNode(hudNodes.resultDetail, falls + ' caídas · ' + collected + ' orbes · ' + LEVELS.length + ' sectores');
    if (host && typeof host.submitResult === 'function') {
      host.submitResult({
        game: 'gravity',
        version: '1.0.0',
        score: Math.round(score),
        durationMs: Math.round(elapsed * 1000),
        success: true,
        stats: { falls: falls, orbs: collected, levels: LEVELS.length }
      });
    }
  }

  function pause() {
    if (!running || paused) return;
    paused = true;
    keys = {};
    touchInput.x = 0;
    touchInput.y = 0;
    if (hudNodes.paused) hudNodes.paused.hidden = false;
  }

  function resume() {
    if (!running || !paused || doc.hidden) return;
    paused = false;
    last = global.performance.now();
    if (hudNodes.paused) hudNodes.paused.hidden = true;
  }

  function resetCamera() {
    cameraYaw = 0;
    cameraPitch = 0.32;
    setHint('CÁMARA REENCUADRADA');
  }

  function bindControls() {
    if (listeners.length) return;
    on(doc, 'keydown', function (event) {
      if (!running) return;
      keys[event.code] = true;
      keys[event.key] = true;
      if (/^(Arrow|Space)/.test(event.code)) event.preventDefault();
      if (event.code === 'Space' || event.key === ' ') {
        if (fallback) fallback.jumpBuffer = 0.14;
        else player.jumpBuffer = 0.14;
      }
      if (event.key === 'p' || event.key === 'P') {
        if (paused) resume();
        else pause();
      }
      if (event.key === 'r' || event.key === 'R') start({ level: levelIndex });
      if (event.key === 'c' || event.key === 'C') resetCamera();
      if (event.key === 'Escape') O.goHub();
    });
    on(doc, 'keyup', function (event) {
      keys[event.code] = false;
      keys[event.key] = false;
    });
    on(global, 'blur', function () { keys = {}; });
    on(global, 'resize', resize);
    on(doc, 'visibilitychange', function () {
      if (!running) return;
      if (doc.hidden) pause();
      else resume();
    });
    if (!canvas && !fallback) return;
    var controlCanvas = fallback ? fallback.canvas : canvas;
    var dragging = false;
    var pointerX = 0;
    var pointerY = 0;
    on(controlCanvas, 'pointerdown', function (event) {
      dragging = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (controlCanvas.setPointerCapture) controlCanvas.setPointerCapture(event.pointerId);
    });
    on(controlCanvas, 'pointermove', function (event) {
      if (!dragging || fallback) return;
      cameraYaw -= (event.clientX - pointerX) * 0.006;
      cameraPitch = clamp(cameraPitch + (event.clientY - pointerY) * 0.004, -0.12, 1.1);
      pointerX = event.clientX;
      pointerY = event.clientY;
    });
    on(controlCanvas, 'pointerup', function () { dragging = false; });
    on(controlCanvas, 'pointercancel', function () { dragging = false; });
    var stick = root.querySelector('[data-gravity-stick]');
    var knob = root.querySelector('[data-gravity-stick-knob]');
    if (stick) {
      var updateStick = function (event) {
        var rect = stick.getBoundingClientRect();
        var dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        var dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        var length = Math.sqrt(dx * dx + dy * dy);
        if (length > 1) {
          dx /= length;
          dy /= length;
        }
        touchInput.x = dx;
        touchInput.y = -dy;
        if (knob) knob.style.transform = 'translate(calc(-50% + ' + (dx * 34) + 'px), calc(-50% + ' + (dy * 34) + 'px))';
      };
      on(stick, 'pointerdown', function (event) {
        if (stick.setPointerCapture) stick.setPointerCapture(event.pointerId);
        updateStick(event);
      });
      on(stick, 'pointermove', function (event) { updateStick(event); });
      var clearStick = function () {
        touchInput.x = 0;
        touchInput.y = 0;
        if (knob) knob.style.transform = 'translate(-50%, -50%)';
      };
      on(stick, 'pointerup', clearStick);
      on(stick, 'pointercancel', clearStick);
      on(stick, 'pointerleave', clearStick);
    }
    var jump = root.querySelector('[data-gravity-jump]');
    if (jump) on(jump, 'pointerdown', function (event) {
      event.preventDefault();
      if (fallback) fallback.jumpBuffer = 0.14;
      else player.jumpBuffer = 0.14;
    });
    var recenter = root.querySelector('[data-gravity-recenter]');
    if (recenter) on(recenter, 'click', resetCamera);
  }

  function init(context) {
    host = context || null;
    root = O.root() || doc.querySelector('[data-universe-root]');
    if (!root) {
      O.showError('No se pudo iniciar GRAVITY.');
      return false;
    }
    graphicsMode = GFX && typeof GFX.mode === 'function' ? GFX.mode() : (THREE ? 'full' : 'fallback');
    viewport = root.querySelector('[data-gravity-viewport]') || root.querySelector('.universe-game-ui') || root;
    cacheHud();
    if (THREE && graphicsMode !== 'fallback') initVectors();
    return true;
  }

  function mount(container) {
    if (container && container.querySelector) {
      viewport = container.querySelector('[data-gravity-viewport]') || container;
    }
    ensureRenderer();
    bindControls();
  }

  function start(options) {
    if (!renderer && !fallback) mount(viewport);
    if (!renderer && !fallback) return false;
    var settings = options || {};
    running = true;
    paused = false;
    elapsed = 0;
    score = 0;
    falls = 0;
    last = global.performance.now();
    accumulator = 0;
    if (hudNodes.result) hudNodes.result.hidden = true;
    if (hudNodes.paused) hudNodes.paused.hidden = true;
    if (fallback) fallbackReset(typeof settings.level === 'number' ? settings.level : 0);
    else loadLevel(typeof settings.level === 'number' ? settings.level : 0);
    if (frame) global.cancelAnimationFrame(frame);
    frame = global.requestAnimationFrame(loop);
    return true;
  }

  function stop() {
    running = false;
    paused = false;
    if (frame) global.cancelAnimationFrame(frame);
    frame = 0;
    if (hudNodes.paused) hudNodes.paused.hidden = true;
  }

  function restart() {
    start({ level: levelIndex });
  }

  function getState() {
    if (!player && !fallback) return null;
    var position = fallback
      ? { x: Math.round(fallback.player.x * 100) / 100, y: Math.round(fallback.player.y * 100) / 100, z: 0 }
      : { x: Math.round(player.position.x * 100) / 100, y: Math.round(player.position.y * 100) / 100, z: Math.round(player.position.z * 100) / 100 };
    return {
      mode: graphicsMode,
      level: levelIndex,
      score: Math.round(score),
      time: Math.round(elapsed * 10) / 10,
      falls: falls,
      orbs: collected,
      paused: paused,
      grounded: fallback ? fallback.player.grounded : player.grounded,
      position: position
    };
  }

  function dispose() {
    stop();
    offAll();
    global.clearTimeout(hintTimer);
    clearLevel();
    if (starField) {
      starField.geometry.dispose();
      starField.material.dispose();
      starField = null;
    }
    if (fallback) {
      if (fallback.canvas && fallback.canvas.parentNode) fallback.canvas.parentNode.removeChild(fallback.canvas);
      if (fallback.status && fallback.status.parentNode) fallback.status.parentNode.removeChild(fallback.status);
      fallback = null;
    }
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
    canvas = null;
    if (renderer && GFX && typeof GFX.releaseRenderer === 'function') GFX.releaseRenderer();
    else if (renderer) {
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
    }
    renderer = null;
    scene = null;
    camera = null;
    levelGroup = null;
    raycaster = null;
    keys = {};
    touchInput = { x: 0, y: 0 };
    hudNodes = {};
    host = null;
  }

  var contract = {
    id: 'gravity',
    init: init,
    mount: mount,
    start: start,
    pause: pause,
    resume: resume,
    restart: restart,
    getState: getState,
    stop: stop,
    dispose: dispose
  };

  if (PLAY) PLAY.register('gravity', contract);
})(window);
