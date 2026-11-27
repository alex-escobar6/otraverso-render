(function (global) {
  'use strict';

  var THREE = global.THREE;
  var GFX = global.OTRAVERSO && global.OTRAVERSO.GFX;
  var doc = global.document;
  var STATES = ['idle', 'curious', 'happy', 'playing', 'walking', 'running', 'resting', 'sleeping', 'flying', 'interacting'];
  var DEFAULT_TRANSITIONS = {
    idle: ['curious', 'happy', 'playing', 'walking', 'running', 'resting', 'sleeping', 'flying', 'interacting'],
    curious: ['idle', 'happy', 'playing', 'walking', 'interacting'],
    happy: ['idle', 'curious', 'playing', 'walking', 'resting', 'interacting'],
    playing: ['idle', 'curious', 'happy', 'running', 'resting', 'interacting'],
    walking: ['idle', 'curious', 'happy', 'running', 'resting', 'interacting'],
    running: ['idle', 'happy', 'playing', 'walking', 'resting', 'interacting'],
    resting: ['idle', 'curious', 'sleeping', 'walking', 'interacting'],
    sleeping: ['idle', 'curious', 'resting', 'interacting'],
    flying: ['idle', 'curious', 'happy', 'resting', 'interacting'],
    interacting: ['idle', 'curious', 'happy', 'playing', 'walking', 'running', 'resting', 'sleeping', 'flying']
  };
  var ACTION_STATES = { pet: 'interacting', call: 'walking', play: 'playing', sit: 'resting', sleep: 'sleeping', fly: 'flying' };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function approach(current, target, dt, speed) {
    return current + (target - current) * (1 - Math.exp(-dt * speed));
  }

  function seeded(seed) {
    var value = seed >>> 0;
    return function () {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function transitionMap(capabilities) {
    var raw = capabilities && capabilities.transitions;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_TRANSITIONS;
    var result = {};
    STATES.forEach(function (state) {
      var value = raw[state];
      result[state] = Array.isArray(value) ? value.slice() : DEFAULT_TRANSITIONS[state].slice();
    });
    return result;
  }

  function canMove(map, current, next) {
    return current === next || (map[current] || DEFAULT_TRANSITIONS.idle).indexOf(next) >= 0;
  }

  function canvasFallback(stage, config, handlers, initial) {
    var canvas = doc.createElement('canvas');
    var context = canvas.getContext && canvas.getContext('2d');
    var wrap = doc.createElement('div');
    var state = STATES.indexOf(initial) >= 0 ? initial : 'idle';
    var stateTime = 0;
    var last = performance.now();
    var pointer = { x: 0, y: 0 };
    var blinkAt = 2.4;
    var raf = 0;
    var disposed = false;

    wrap.className = 'draconia-fallback';
    wrap.appendChild(canvas);
    stage.appendChild(wrap);
    handlers.onState(state);

    function resize() {
      var rect = stage.getBoundingClientRect();
      var ratio = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      if (context) context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function setState(next) {
      state = STATES.indexOf(next) >= 0 ? next : 'idle';
      stateTime = 0;
      if (global.DRACONIA_DEBUG) global.DRACONIA_DEBUG.state = state;
      handlers.onState(state);
    }

    function draw(now) {
      raf = 0;
      if (disposed || !context) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stateTime += dt;
      var rect = stage.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;
      var scale = Math.min(w / 9, h / 6);
      var flying = state === 'flying';
      var sleeping = state === 'sleeping';
      var walking = state === 'walking' || state === 'running';
      var happy = state === 'happy' || state === 'interacting' || state === 'playing';
      var x = w / 2 + Math.sin(now / 1400) * scale * 0.35 * (walking ? 1 : 0.2);
      var y = h / 2 + scale * (flying ? -0.65 : 0.25) + Math.sin(now / 600) * 0.07;

      context.clearRect(0, 0, w, h);
      var sky = context.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#cbbdec');
      sky.addColorStop(0.55, '#f4dbe9');
      sky.addColorStop(1, '#c9eadc');
      context.fillStyle = sky;
      context.fillRect(0, 0, w, h);
      context.fillStyle = '#dff4e7';
      context.beginPath();
      context.ellipse(w / 2, h * 0.85, scale * 3.5, scale * 0.78, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#8fdacb';
      context.beginPath();
      context.ellipse(w * 0.76, h * 0.79, scale * 0.78, scale * 0.22, 0, 0, Math.PI * 2);
      context.fill();

      context.save();
      context.translate(x, y);
      context.scale(scale, scale);
      var tailSwing = Math.sin(now / 320) * (happy ? 0.5 : 0.22);
      context.strokeStyle = '#d8c7f3';
      context.lineWidth = 0.3;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(-0.7, 0.2);
      context.quadraticCurveTo(-1.6, 0.1 + tailSwing, -2.1 + tailSwing * 0.4, -0.35);
      context.stroke();

      context.fillStyle = '#cbb9f2';
      context.save();
      context.rotate(Math.sin(now / (flying ? 90 : 500)) * (flying ? 0.5 : 0.12));
      context.beginPath();
      context.ellipse(-0.55, -0.3, 0.75, 0.5, -0.35, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(0.55, -0.3, 0.75, 0.5, 0.35, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.fillStyle = '#fbf7ff';
      context.beginPath();
      context.ellipse(0, 0.1, 0.95, 0.72, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.ellipse(0.12, 0.26, 0.62, 0.44, 0, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = '#efe6ff';
      context.lineWidth = 0.2;
      var legPhase = walking ? Math.sin(now / (state === 'running' ? 90 : 180)) : 0;
      for (var leg = -1; leg <= 1; leg += 2) {
        context.beginPath();
        context.moveTo(leg * 0.52, 0.55);
        context.lineTo(leg * (0.62 + legPhase * 0.12), 1.05);
        context.stroke();
      }

      context.fillStyle = '#fbf7ff';
      context.beginPath();
      context.ellipse(0, -0.62, 0.66, 0.58, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.ellipse(0.34, -0.48, 0.34, 0.25, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8c98a';
      for (var horn = -1; horn <= 1; horn += 2) {
        context.beginPath();
        context.moveTo(horn * 0.35, -0.95);
        context.lineTo(horn * 0.42, -1.35);
        context.lineTo(horn * 0.15, -1.02);
        context.fill();
      }
      var blink = now / 1000 > blinkAt && now / 1000 < blinkAt + 0.14;
      if (now / 1000 > blinkAt + 0.2) blinkAt = now / 1000 + 2 + Math.random() * 3;
      for (var eye = -1; eye <= 1; eye += 2) {
        var eyeHeight = sleeping || blink ? 0.02 : 0.19;
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.ellipse(eye * 0.26, -0.7, 0.16, eyeHeight, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#7b55c9';
        context.beginPath();
        context.ellipse(eye * 0.26, -0.69, 0.09, sleeping || blink ? 0.01 : 0.12, 0, 0, Math.PI * 2);
        context.fill();
        if (!sleeping && !blink) {
          context.fillStyle = '#ffffff';
          context.arc(eye * 0.23, -0.74, 0.03, 0, Math.PI * 2);
          context.fill();
        }
      }
      if (happy) {
        context.strokeStyle = '#b78ae5';
        context.lineWidth = 0.05;
        context.beginPath();
        context.arc(0, -0.38, 0.16, 0.2, Math.PI - 0.2);
        context.stroke();
      }
      context.restore();

      context.fillStyle = 'rgba(45,36,80,.68)';
      context.font = Math.max(12, Math.round(scale * 0.22)) + 'px system-ui';
      context.fillText('Vista simplificada: WebGL no disponible', 18, 26);
      raf = global.requestAnimationFrame(draw);
    }

    function onDown(event) { pointer.x = event.clientX; }
    function onUp(event) {
      if (Math.abs(event.clientX - pointer.x) < 12) {
        petCount += 1;
        setState(ACTION_STATES.pet);
      }
    }

    var petCount = 0;
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    global.addEventListener('resize', resize);
    resize();
    raf = global.requestAnimationFrame(draw);

    return {
      setState: setState,
      setAction: function (name) {
        if (name === 'pet') {
          petCount += 1;
          setState(ACTION_STATES.pet);
          return;
        }
        setState(ACTION_STATES[name] || 'idle');
      },
      setReducedMotion: function () {},
      focus: function () {},
      dispose: function () {
        disposed = true;
        if (raf) global.cancelAnimationFrame(raf);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerup', onUp);
        global.removeEventListener('resize', resize);
      }
    };
  }

  function create3D(stage, config, handlers, initial) {
    config = config || {};
    config.profile = config.profile || {};
    config.capabilities = config.capabilities || {};
    if (!THREE.GLTFLoader) return null;
    var info = GFX && GFX.describe ? GFX.describe() : { mode: 'optimized', supported: true };
    var full = info.mode === 'full';
    var renderer = GFX.createRenderer({ antialias: full });
    if (!renderer) return null;
    stage.setAttribute('data-gfx-mode', info.mode);
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, full ? 2 : 1.25));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = full;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', 'Santuario 3D de DRACONIA');

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#ded5f0', 12, 27);
    var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    var rand = seeded(20261126);
    var transitions = transitionMap(config.capabilities);

    var materials = {
      pearl: new THREE.MeshPhysicalMaterial({ color: '#fbf7ff', roughness: 0.42, metalness: 0.02, clearcoat: 0.55, clearcoatRoughness: 0.32, sheen: 0.35, sheenColor: new THREE.Color('#d9c7ff') }),
      pearlWarm: new THREE.MeshPhysicalMaterial({ color: '#fffaf6', roughness: 0.52, clearcoat: 0.3 }),
      lavender: new THREE.MeshPhysicalMaterial({ color: '#cdbaf5', roughness: 0.48, metalness: 0.02, side: THREE.DoubleSide }),
      lavenderDeep: new THREE.MeshPhysicalMaterial({ color: '#9b83dd', roughness: 0.55 }),
      violet: new THREE.MeshPhysicalMaterial({ color: '#6f52bd', roughness: 0.24 }),
      gold: new THREE.MeshPhysicalMaterial({ color: '#ead39e', roughness: 0.28, metalness: 0.42 }),
      ink: new THREE.MeshPhysicalMaterial({ color: '#2b2148', roughness: 0.24 }),
      rose: new THREE.MeshPhysicalMaterial({ color: '#ffc9df', roughness: 0.6 }),
      turquoise: new THREE.MeshPhysicalMaterial({ color: '#97e6d6', roughness: 0.3, metalness: 0.12 }),
      grass: new THREE.MeshStandardMaterial({ color: '#79b590', roughness: 0.94 }),
      grassDark: new THREE.MeshStandardMaterial({ color: '#528266', roughness: 0.95 }),
      stone: new THREE.MeshStandardMaterial({ color: '#d8d0e6', roughness: 0.86 }),
      stoneLight: new THREE.MeshStandardMaterial({ color: '#eee8f6', roughness: 0.8 }),
      wood: new THREE.MeshStandardMaterial({ color: '#b99ac7', roughness: 0.9 }),
      glow: new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false })
    };

    function group(parent, x, y, z) {
      var item = new THREE.Group();
      item.position.set(x || 0, y || 0, z || 0);
      parent.add(item);
      return item;
    }

    function mesh(geometry, material, parent, x, y, z, sx, sy, sz) {
      var item = new THREE.Mesh(geometry, material);
      item.position.set(x || 0, y || 0, z || 0);
      if (sx !== undefined) item.scale.set(sx, sy, sz);
      item.castShadow = full;
      item.receiveShadow = full;
      parent.add(item);
      return item;
    }

    function cylinderBetween(a, b, radius, material, parent, segments) {
      var delta = new THREE.Vector3().subVectors(b, a);
      var item = mesh(new THREE.CylinderGeometry(radius * 0.72, radius, delta.length(), segments || 10),
        material, parent, 0, 0, 0);
      item.position.copy(a).add(b).multiplyScalar(0.5);
      item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
      return item;
    }

    var sky = new THREE.Mesh(new THREE.SphereGeometry(34, 32, 20), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color('#b9a8e8') },
        midColor: { value: new THREE.Color('#f2d8ea') },
        bottomColor: { value: new THREE.Color('#c4eadc') }
      },
      vertexShader: 'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 topColor;uniform vec3 midColor;uniform vec3 bottomColor;varying vec3 vDirection;void main(){vec3 d=normalize(vDirection);float h=d.y;vec3 c=mix(bottomColor,midColor,smoothstep(-0.4,0.14,h));c=mix(c,topColor,smoothstep(0.08,0.72,h));float g=pow(max(0.0,dot(d,normalize(vec3(-0.55,0.32,0.72)))),9.0);c+=vec3(1.0,0.86,0.74)*g*0.16;gl_FragColor=vec4(c,1.0);}'
    }));
    sky.frustumCulled = false;
    scene.add(sky);

    scene.add(new THREE.HemisphereLight('#f6ebff', '#638d70', 1.35));
    var sun = new THREE.DirectionalLight('#fff0d6', 2.05);
    sun.position.set(-4.5, 8, 5.5);
    sun.castShadow = full;
    sun.shadow.mapSize.set(full ? 1024 : 512, full ? 1024 : 512);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    scene.add(sun);
    var rim = new THREE.PointLight('#cbb8ff', 1.5, 15);
    rim.position.set(4.5, 3.2, -4);
    scene.add(rim);
    var warm = new THREE.PointLight('#ffd3bf', 1.15, 12);
    warm.position.set(-4.5, 2.4, 3.5);
    scene.add(warm);

    var environment = group(scene, 0, 0, 0);
    mesh(new THREE.CylinderGeometry(5.7, 5.9, 0.48, full ? 56 : 32), materials.stone, environment, 0, -0.26, 0);
    mesh(new THREE.CylinderGeometry(5.52, 5.58, 0.1, full ? 56 : 32), materials.grass, environment, 0, -0.01, 0);
    var border = mesh(new THREE.TorusGeometry(5.48, 0.07, 8, 64), materials.stoneLight, environment, 0, 0.03, 0);
    border.rotation.x = -Math.PI / 2;

    var waterUniforms = { time: { value: 0 } };
    var pond = mesh(new THREE.CircleGeometry(1.28, full ? 48 : 28), new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: waterUniforms,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform float time;varying vec2 vUv;void main(){float d=length(vUv-vec2(0.5));float wave=sin(d*38.0-time*2.6)*0.5+0.5;float shimmer=sin((vUv.x+vUv.y)*22.0+time*1.7)*0.5+0.5;vec3 c=mix(vec3(0.36,0.76,0.72),vec3(0.72,0.95,0.88),wave*0.35+shimmer*0.18);float edge=smoothstep(0.5,0.42,d);gl_FragColor=vec4(c,0.18+edge*0.62);}'
    }), environment, 2.9, 0.04, 1.85);
    pond.rotation.x = -Math.PI / 2;
    var pondRing = mesh(new THREE.TorusGeometry(1.3, 0.08, 8, 48), materials.stoneLight, environment, 2.9, 0.06, 1.85);
    pondRing.rotation.x = -Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.34, 10), materials.stone, environment, 2.9, 0.17, 1.85);
    mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.55, 10), materials.stoneLight, environment, 2.9, 0.48, 1.85);

    var crystals = [];
    for (var c = 0; c < 8; c += 1) {
      var ca = c * Math.PI * 2 / 8 + 0.22;
      var cr = 4.45 + (c % 3) * 0.2;
      var cx = Math.cos(ca) * cr;
      var cz = Math.sin(ca) * cr;
      var crystalGroup = group(environment, cx, 0, cz);
      mesh(new THREE.DodecahedronGeometry(0.34, 0), materials.stone, crystalGroup, 0, 0.08, 0);
      var crystal = mesh(new THREE.OctahedronGeometry(0.26 + (c % 3) * 0.07, 0),
        c % 2 ? materials.lavender : materials.turquoise, crystalGroup, 0, 0.46, 0);
      crystal.rotation.z = (c % 2 ? 1 : -1) * 0.2;
      var aura = mesh(new THREE.SphereGeometry(0.42, 12, 10), materials.glow, crystalGroup, 0, 0.46, 0);
      aura.material = materials.glow.clone();
      aura.material.opacity = 0.16;
      crystals.push({ group: crystalGroup, crystal: crystal, aura: aura, phase: rand() * 6 });
    }

    function makeTree(x, z, scale, seed) {
      var random = seeded(seed);
      var tree = group(environment, x, 0, z);
      tree.scale.setScalar(scale);
      cylinderBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, 1.5, 0), 0.16, materials.wood, tree, 9);
      for (var k = 0; k < 5; k += 1) {
        var angle = random() * Math.PI * 2;
        var spread = 0.28 + random() * 0.45;
        var blob = mesh(new THREE.IcosahedronGeometry(0.5 + random() * 0.22, full ? 2 : 1),
          k % 2 ? materials.grass : materials.grassDark, tree,
          Math.cos(angle) * spread, 1.45 + random() * 0.5, Math.sin(angle) * spread);
        blob.scale.y = 0.82;
      }
      for (var b = 0; b < 6; b += 1) {
        mesh(new THREE.SphereGeometry(0.06, 8, 6), b % 2 ? materials.rose : materials.pearlWarm, tree,
          (random() - 0.5) * 1.4, 1.5 + random() * 0.7, (random() - 0.5) * 1.4);
      }
    }
    makeTree(-3.6, -2.1, 1.05, 11);
    makeTree(-2.9, 2.7, 0.88, 23);
    makeTree(3.7, -2.6, 1.12, 37);
    makeTree(4.2, 0.9, 0.82, 41);
    makeTree(-4.2, 0.2, 0.76, 53);

    for (var g = 0; g < 34; g += 1) {
      var ga = rand() * Math.PI * 2;
      var gr = 1.25 + rand() * 4.1;
      var gx = Math.cos(ga) * gr;
      var gz = Math.sin(ga) * gr;
      if (Math.hypot(gx - 2.9, gz - 1.85) < 1.55 || Math.hypot(gx, gz) < 1.4) continue;
      var tuft = mesh(new THREE.ConeGeometry(0.1 + rand() * 0.06, 0.28 + rand() * 0.16, 5),
        materials.grassDark, environment, gx, 0.14, gz);
      tuft.rotation.z = (rand() - 0.5) * 0.35;
    }

    for (var f = 0; f < 18; f += 1) {
      var fa = rand() * Math.PI * 2;
      var fr = 2.1 + rand() * 3;
      var fx = Math.cos(fa) * fr;
      var fz = Math.sin(fa) * fr;
      if (Math.hypot(fx - 2.9, fz - 1.85) < 1.5) continue;
      var flower = group(environment, fx, 0, fz);
      cylinderBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.03, 0.34, 0), 0.018, materials.grassDark, flower, 6);
      for (var p = 0; p < 5; p += 1) {
        var pa = p * Math.PI * 2 / 5;
        mesh(new THREE.SphereGeometry(0.075, 8, 6), f % 3 === 0 ? materials.rose : materials.pearlWarm,
          flower, Math.cos(pa) * 0.1, 0.36, Math.sin(pa) * 0.1, 1, 0.5, 1);
      }
      mesh(new THREE.SphereGeometry(0.045, 8, 6), materials.gold, flower, 0, 0.37, 0);
    }

    for (var s = 0; s < 12; s += 1) {
      var sa = rand() * Math.PI * 2;
      var sr = 2.5 + rand() * 2.7;
      var stone = mesh(new THREE.DodecahedronGeometry(0.16 + rand() * 0.18, 0), materials.stone,
        environment, Math.cos(sa) * sr, 0.06, Math.sin(sa) * sr);
      stone.scale.y = 0.5;
      stone.rotation.y = rand() * Math.PI;
    }

    var fireflyCount = full ? 80 : 42;
    var fireflyPositions = new Float32Array(fireflyCount * 3);
    var fireflyBase = [];
    for (var i = 0; i < fireflyCount; i += 1) {
      var x = (rand() - 0.5) * 10;
      var z = (rand() - 0.5) * 10;
      var y = 0.3 + rand() * 3.2;
      fireflyBase.push({ x: x, y: y, z: z, phase: rand() * Math.PI * 2 });
      fireflyPositions[i * 3] = x;
      fireflyPositions[i * 3 + 1] = y;
      fireflyPositions[i * 3 + 2] = z;
    }
    var fireflyGeometry = new THREE.BufferGeometry();
    fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
    var fireflies = new THREE.Points(fireflyGeometry, new THREE.PointsMaterial({
      color: '#fff0b8', size: 0.11, transparent: true, opacity: 0.86,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    scene.add(fireflies);

    var sparklePositions = new Float32Array(36 * 3);
    var sparkleVelocities = [];
    for (var q = 0; q < 36; q += 1) {
      sparkleVelocities.push({ x: 0, y: 0, z: 0, life: 0 });
    }
    var sparkleGeometry = new THREE.BufferGeometry();
    sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
    var sparkles = new THREE.Points(sparkleGeometry, new THREE.PointsMaterial({
      color: '#fff1c8', size: 0.14, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    sparkles.visible = false;
    scene.add(sparkles);

    function burst(x, y, z) {
      var positions = sparkles.geometry.attributes.position;
      for (var i = 0; i < positions.count; i += 1) {
        var angle = rand() * Math.PI * 2;
        var lift = 0.4 + rand() * 1.5;
        positions.setXYZ(i, x, y, z);
        sparkleVelocities[i] = {
          x: Math.cos(angle) * (0.6 + rand() * 1.2),
          y: lift,
          z: Math.sin(angle) * (0.6 + rand() * 1.2),
          life: 0.75 + rand() * 0.45
        };
      }
      positions.needsUpdate = true;
      sparkles.visible = true;
    }

    var orb = group(scene, 0, 0.7, 1.5);
    var orbCore = mesh(new THREE.IcosahedronGeometry(0.2, 2), materials.turquoise, orb, 0, 0, 0);
    var orbGlow = mesh(new THREE.SphereGeometry(0.38, 14, 10), materials.glow.clone(), orb, 0, 0, 0);
    orbGlow.material.opacity = 0.42;
    var orbRing = mesh(new THREE.TorusGeometry(0.32, 0.022, 6, 28), materials.gold, orb, 0, 0, 0);
    orb.visible = false;

    var clickable = [];
    var dragon = group(scene, 0, 0, 0);
    var AXIS_X = new THREE.Vector3(1, 0, 0);
    var AXIS_Y = new THREE.Vector3(0, 1, 0);
    var AXIS_Z = new THREE.Vector3(0, 0, 1);
    var TEMP_QUAT = new THREE.Quaternion();
    var dragonRig = {
      ready: false, mixer: null, model: null, actions: {}, clips: {}, bones: {},
      current: null, eye: null, eyeIntensity: 1
    };
    var assets = isObject(config.assets) ? config.assets : (typeof config.assets === 'string' ? { dragon: config.assets } : {});
    var modelConfig = isObject(assets.model) ? assets.model : {};
    var staticModel = asFlag(modelConfig.static, false);
    var dragonUrl = String(assets.dragon || modelConfig.path || '').trim();
    var transformConfig = isObject(modelConfig.transform) ? modelConfig.transform : {};
    var shadowConfig = isObject(modelConfig.shadow) ? modelConfig.shadow : {};
    var clipMap = isObject(modelConfig.clips) ? modelConfig.clips : {};
    var speedMap = isObject(modelConfig.clipSpeeds) ? modelConfig.clipSpeeds : {};
    var materialMap = isObject(modelConfig.materials) ? modelConfig.materials : {};
    var initialClip = asText(modelConfig.initialClip, 'Idle');
    var fallbackClip = asText(modelConfig.fallbackClip, initialClip);
    var eyeMaterialName = asText(modelConfig.eyeMaterial, 'Eye_Ice');

    function asText(value, fallback) {
      var text = String(value === undefined || value === null ? '' : value).trim();
      return text || fallback;
    }

    function asNumber(value, fallback, min, max) {
      var number = typeof value === 'number' ? value : Number(value);
      if (!isFinite(number)) return fallback;
      return Math.max(min, Math.min(max, number));
    }

    function asVector(value, fallback, min, max) {
      var list = Array.isArray(value) ? value : [];
      if (list.length !== 3) return fallback.slice();
      return [asNumber(list[0], fallback[0], min, max),
        asNumber(list[1], fallback[1], min, max),
        asNumber(list[2], fallback[2], min, max)];
    }

    function asFlag(value, fallback) {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') {
        var text = value.trim().toLowerCase();
        if (text === '1' || text === 'true' || text === 'yes' || text === 'on') return true;
        if (text === '0' || text === 'false' || text === 'no' || text === 'off' || !text) return false;
      }
      return fallback;
    }

    function clipFor(key, fallback) {
      return asText(clipMap[key], asText(fallback, fallbackClip));
    }

    function materialTweak(source) {
      var raw = isObject(materialMap[source.name]) ? materialMap[source.name] : {};
      var tweak = {};
      Object.keys(raw).forEach(function (key) {
        var value = raw[key];
        if (value === undefined || value === null) return;
        if (key === 'side') {
          if (value === 'DoubleSide') tweak.side = THREE.DoubleSide;
          else if (value === 'FrontSide') tweak.side = THREE.FrontSide;
          else if (value === 'BackSide') tweak.side = THREE.BackSide;
          else if (typeof value === 'number') tweak.side = value;
          return;
        }
        if (key === 'color' || key === 'sheenColor' || key === 'emissive') {
          tweak[key] = asText(value, '#ffffff');
          return;
        }
        if (key === 'roughness' || key === 'clearcoat' || key === 'clearcoatRoughness' ||
            key === 'sheen' || key === 'emissiveIntensity' || key === 'opacity') {
          tweak[key] = asNumber(value, 0, 0, key === 'opacity' ? 1 : 5);
        }
      });
      return tweak;
    }

    function dragonMaterial(source) {
      var tweak = materialTweak(source);
      var params = {
        color: source.color ? source.color.clone() : new THREE.Color('#ffffff'),
        roughness: tweak.roughness === undefined ? source.roughness : tweak.roughness,
        metalness: 0.02,
        emissive: source.emissive ? source.emissive.clone() : new THREE.Color('#000000'),
        emissiveIntensity: source.emissiveIntensity === undefined ? 1 : source.emissiveIntensity,
        transparent: source.transparent,
        opacity: source.opacity,
        side: source.side,
        depthWrite: source.depthWrite,
        alphaTest: source.alphaTest
      };
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'].forEach(function (key) {
        if (source[key]) params[key] = source[key];
      });
      if (source.normalScale) params.normalScale = source.normalScale.clone();
      if (tweak.clearcoat !== undefined) params.clearcoat = tweak.clearcoat;
      if (tweak.clearcoatRoughness !== undefined) params.clearcoatRoughness = tweak.clearcoatRoughness;
      if (tweak.sheen !== undefined) params.sheen = tweak.sheen;
      if (tweak.sheenColor !== undefined) params.sheenColor = new THREE.Color(tweak.sheenColor);
      var result = new THREE.MeshPhysicalMaterial(params);
      if (tweak.color) result.color.set(tweak.color);
      if (tweak.emissive) result.emissive.set(tweak.emissive);
      if (tweak.emissiveIntensity !== undefined) result.emissiveIntensity = tweak.emissiveIntensity;
      if (tweak.opacity !== undefined) {
        result.transparent = true;
        result.opacity = tweak.opacity;
        result.depthWrite = false;
      }
      if (tweak.side !== undefined) result.side = tweak.side;
      return result;
    }

    function rotateBone(name, axis, angle) {
      if (!angle) return;
      var record = dragonRig.bones[name];
      if (!record) return;
      TEMP_QUAT.setFromAxisAngle(axis, angle);
      record.node.quaternion.multiply(TEMP_QUAT);
    }

    function liftRoot(amount) {
      var record = dragonRig.bones.Root;
      if (record) record.node.position.y += amount;
    }

    function playClip(name, speed, restart) {
      if (staticModel) return;
      var mixer = dragonRig.mixer;
      if (!mixer) return;
      var clipName = asText(name, fallbackClip);
      var next = dragonRig.actions[clipName] || dragonRig.actions[initialClip] || dragonRig.actions[fallbackClip];
      if (!next) return;
      speed = asNumber(speed, 1, 0.05, 4);
      if (dragonRig.current === next && !restart) {
        next.timeScale = speed;
        return;
      }
      var previous = dragonRig.current;
      if (restart) next.reset();
      next.timeScale = speed;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.play();
      if (previous && previous !== next) previous.crossFadeTo(next, reduced ? 0.12 : 0.3, false);
      dragonRig.current = next;
      if (global.DRACONIA_DEBUG) global.DRACONIA_DEBUG.clip = clipName;
    }

    function syncStateClip() {
      if (staticModel || !dragonRig.ready) return;
      if (action.name === 'fly') {
        playClip(clipFor('fly', 'Fly'), 1);
        return;
      }
      if (action.name === 'call' && action.elapsed > 2.2) {
        playClip(clipFor('call', 'Roar'), 1, true);
        return;
      }
      var clip = clipFor(state, 'Idle');
      var speed = asNumber(speedMap[state], 1, 0.05, 4);
      if (reduced) speed *= asNumber(speedMap.reduced, 0.7, 0.05, 4);
      playClip(clip, speed);
    }

    function applyRig(now, blink, dt) {
      if (staticModel || !dragonRig.ready || !dragonRig.mixer) return;
      Object.keys(dragonRig.bones).forEach(function (name) {
        var record = dragonRig.bones[name];
        record.node.quaternion.copy(record.quaternion);
        record.node.position.copy(record.position);
      });
      dragonRig.mixer.update(dt);
      var t = stateTime;
      var motion = reduced ? 0.45 : 1;
      rotateBone('Chest', AXIS_X, reduced ? 0 : Math.sin(now * 0.002) * 0.025);
      if (state === 'walking' || state === 'running') {
        var gait = state === 'running' ? 12 : 7.2;
        rotateBone('Head', AXIS_X, -0.05 * motion);
        rotateBone('Tail3', AXIS_Y, Math.sin(t * gait * 0.55) * 0.18 * motion);
        liftRoot(Math.abs(Math.sin(t * gait)) * 0.015 * motion);
      } else if (state === 'playing') {
        var look = orb.visible ? Math.atan2(orb.position.x, 1.4) * 0.5 : Math.sin(t * 2.4) * 0.28;
        rotateBone('Neck4', AXIS_Y, look * 0.45);
        rotateBone('Head', AXIS_Y, look);
        rotateBone('Tail2', AXIS_Y, Math.sin(t * 6) * 0.3 * motion);
        rotateBone('Jaw', AXIS_X, Math.abs(Math.sin(t * 5)) * 0.14 * motion);
        rotateBone('Fore_Thigh_L', AXIS_X, -Math.abs(Math.sin(t * 7)) * 0.18 * motion);
        rotateBone('Fore_Thigh_R', AXIS_X, -Math.abs(Math.sin(t * 7)) * 0.18 * motion);
        liftRoot(Math.abs(Math.sin(t * 7)) * 0.06 * motion);
      } else if (state === 'flying') {
        var flap = Math.sin(t * 12) * 0.1 * motion;
        rotateBone('Wing_Arm_L', AXIS_Z, flap);
        rotateBone('Wing_Arm_R', AXIS_Z, -flap);
        rotateBone('Tail4', AXIS_Y, Math.sin(t * 4) * 0.14 * motion);
        liftRoot(Math.sin(t * 3) * 0.03 * motion);
      } else if (state === 'resting') {
        rotateBone('Hips', AXIS_X, 0.3);
        rotateBone('Spine', AXIS_X, 0.12);
        rotateBone('Neck3', AXIS_X, 0.16);
        rotateBone('Head', AXIS_X, 0.18);
        rotateBone('Jaw', AXIS_X, 0.06);
        rotateBone('Fore_Thigh_L', AXIS_X, -0.62);
        rotateBone('Fore_Thigh_R', AXIS_X, -0.62);
        rotateBone('Fore_Shin_L', AXIS_X, 0.9);
        rotateBone('Fore_Shin_R', AXIS_X, 0.9);
        rotateBone('Hind_Thigh_L', AXIS_X, 0.4);
        rotateBone('Hind_Thigh_R', AXIS_X, 0.4);
        rotateBone('Hind_Shin_L', AXIS_X, -0.55);
        rotateBone('Hind_Shin_R', AXIS_X, -0.55);
        rotateBone('Tail3', AXIS_Y, Math.sin(t * 1.3) * 0.1 * motion);
        liftRoot(-0.08);
      } else if (state === 'sleeping') {
        rotateBone('Hips', AXIS_X, 0.42);
        rotateBone('Spine', AXIS_X, 0.2);
        rotateBone('Neck2', AXIS_X, 0.24);
        rotateBone('Neck4', AXIS_X, 0.2);
        rotateBone('Head', AXIS_X, 0.3);
        rotateBone('Head', AXIS_Z, 0.12);
        rotateBone('Jaw', AXIS_X, 0.14);
        rotateBone('Fore_Thigh_L', AXIS_X, -0.8);
        rotateBone('Fore_Thigh_R', AXIS_X, -0.8);
        rotateBone('Fore_Shin_L', AXIS_X, 1.05);
        rotateBone('Fore_Shin_R', AXIS_X, 1.05);
        rotateBone('Hind_Thigh_L', AXIS_X, 0.52);
        rotateBone('Hind_Thigh_R', AXIS_X, 0.52);
        rotateBone('Hind_Shin_L', AXIS_X, -0.7);
        rotateBone('Hind_Shin_R', AXIS_X, -0.7);
        rotateBone('Wing_Arm_L', AXIS_Z, -0.22);
        rotateBone('Wing_Arm_R', AXIS_Z, 0.22);
        rotateBone('Tail2', AXIS_Y, Math.sin(t * 0.8) * 0.07);
        liftRoot(-0.14);
      } else if (state === 'happy') {
        rotateBone('Head', AXIS_X, -Math.sin(t * 5) * 0.12 * motion);
        rotateBone('Tail2', AXIS_Y, Math.sin(t * 9) * 0.38 * motion);
        rotateBone('Tail4', AXIS_Y, Math.sin(t * 9 + 0.6) * 0.3 * motion);
        rotateBone('Jaw', AXIS_X, Math.abs(Math.sin(t * 4)) * 0.16 * motion);
        rotateBone('Wing_Arm_L', AXIS_Z, Math.abs(Math.sin(t * 7)) * 0.14 * motion);
        rotateBone('Wing_Arm_R', AXIS_Z, -Math.abs(Math.sin(t * 7)) * 0.14 * motion);
        liftRoot(Math.abs(Math.sin(t * 6)) * 0.08 * motion);
      } else if (state === 'curious') {
        rotateBone('Neck4', AXIS_Y, Math.sin(t * 2.2) * 0.24);
        rotateBone('Head', AXIS_Y, Math.sin(t * 2.2) * 0.32);
        rotateBone('Head', AXIS_X, -0.12);
        rotateBone('Tail3', AXIS_Y, Math.sin(t * 3) * 0.16 * motion);
      } else if (state === 'interacting') {
        rotateBone('Head', AXIS_X, 0.14 + Math.sin(t * 2.6) * 0.07);
        rotateBone('Head', AXIS_Y, Math.sin(t * 1.8) * 0.22);
        rotateBone('Jaw', AXIS_X, 0.08);
        rotateBone('Tail3', AXIS_Y, Math.sin(t * 4.2) * 0.3 * motion);
        if (t < petUntil) {
          rotateBone('Neck4', AXIS_X, -0.16);
          rotateBone('Tail5', AXIS_Y, Math.sin(t * 9) * 0.35 * motion);
        }
      }
      if (action.name === 'call') {
        rotateBone('Neck3', AXIS_X, -0.18 * Math.sin(Math.min(action.elapsed / 2.2, 1) * Math.PI));
        rotateBone('Head', AXIS_X, -0.08);
      }
      if (dragonRig.eye) {
        var base = state === 'sleeping' ? 0.22 : 1;
        var target = base * (1 - blink * 0.92);
        dragonRig.eye.emissiveIntensity += (target - dragonRig.eye.emissiveIntensity) * Math.min(1, dt * 18);
      }
    }

    new THREE.GLTFLoader().load(dragonUrl, function (gltf) {
      if (disposed) return;
      var model = gltf.scene;
      var scale = asNumber(transformConfig.scale, 0.38, 0.05, 5);
      var position = asVector(transformConfig.position, [0, 0.04, 0], -100, 100);
      var rotation = asVector(transformConfig.rotation, [0, 0, 0], -Math.PI * 2, Math.PI * 2);
      model.scale.setScalar(scale);
      model.position.set(position[0], position[1], position[2]);
      model.rotation.set(rotation[0], rotation[1], rotation[2]);
      model.traverse(function (item) {
        if (item.isBone) {
          dragonRig.bones[item.name] = { node: item, quaternion: item.quaternion.clone(), position: item.position.clone() };
        }
        if (!item.isMesh) return;
        item.castShadow = full && asFlag(shadowConfig.cast, true);
        item.receiveShadow = full && asFlag(shadowConfig.receive, true);
        item.frustumCulled = asFlag(shadowConfig.frustumCulled, false);
        var original = Array.isArray(item.material) ? item.material : [item.material];
        var prepared = original.map(function (material) {
          var result = dragonMaterial(material);
          if (material.name === eyeMaterialName && !dragonRig.eye) {
            dragonRig.eye = result;
            dragonRig.eyeIntensity = result.emissiveIntensity;
          }
          return result;
        });
        item.material = Array.isArray(item.material) ? prepared : prepared[0];
        clickable.push(item);
      });
      dragon.add(model);
      dragonRig.model = model;
      if (!staticModel) {
        dragonRig.mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach(function (clip) {
          dragonRig.clips[clip.name] = clip;
          var clipAction = dragonRig.mixer.clipAction(clip);
          clipAction.clampWhenFinished = false;
          dragonRig.actions[clip.name] = clipAction;
        });
      }
      dragonRig.ready = true;
      if (staticModel && global.DRACONIA_DEBUG) global.DRACONIA_DEBUG.clip = 'static';
      syncStateClip();
      if (global.DRACONIA_DEBUG) {
        var debugModel = asText(modelConfig.path, dragonUrl);
        if (debugModel.indexOf(asText(assets.base, '')) === 0) debugModel = debugModel.slice(asText(assets.base, '').length);
        global.DRACONIA_DEBUG.model = debugModel.replace(/^\/+/, '') || 'error';
        global.DRACONIA_DEBUG.meshes = clickable.length;
      }
      if (global.Event) doc.dispatchEvent(new global.Event('draconia:ready'));
    }, undefined, function () {
      if (disposed || !global.DRACONIA_DEBUG) return;
      global.DRACONIA_DEBUG.model = 'error';
      global.DRACONIA_DEBUG.ready = true;
      if (global.Event) doc.dispatchEvent(new global.Event('draconia:ready'));
    });

    var state = STATES.indexOf(initial) >= 0 ? initial : 'idle';
    var stateTime = 0;
    var last = performance.now();
    var raf = 0;
    var paused = false;
    var disposed = false;
    var reduced = config.capabilities.reduced_motion === undefined
      ? !!config.profile.reduced_motion
      : !!config.capabilities.reduced_motion;
    var timers = [];
    var nextBlink = performance.now() / 1000 + 1.6 + rand() * 2;
    var blinkTimer = 0;
    var nextThought = 6 + rand() * 4;
    var lastAutonomous = 'idle';
    var petVariant = 0;
    var petUntil = 0;
    var action = { name: null, elapsed: 0, duration: 0, completed: {} };
    var cameraState = {
      theta: 0.34, phi: 1.03, radius: 7.1, targetY: 0.92,
      wantTheta: 0.34, wantPhi: 1.03, wantRadius: 7.1, wantY: 0.92
    };
    var pointers = {};
    var dragStart = null;
    var dragged = false;
    var pinchDistance = 0;
    var lastInteraction = performance.now();
    var raycaster = new THREE.Raycaster();
    var pointerNdc = new THREE.Vector2();

    if (global.DRACONIA_DEBUG) {
      global.DRACONIA_DEBUG.version = 4;
      global.DRACONIA_DEBUG.mode = info.mode;
      global.DRACONIA_DEBUG.state = state;
      global.DRACONIA_DEBUG.model = 'loading';
      global.DRACONIA_DEBUG.meshes = 0;
    }

    function later(fn, delay) {
      var id = global.setTimeout(function () {
        timers = timers.filter(function (value) { return value !== id; });
        if (!disposed) fn();
      }, delay);
      timers.push(id);
    }

    function clearTimers() {
      timers.forEach(global.clearTimeout);
      timers = [];
    }

    function setState(next, force) {
      var clean = STATES.indexOf(next) >= 0 ? next : 'idle';
      if (!force && !canMove(transitions, state, clean)) clean = 'idle';
      state = clean;
      stateTime = 0;
      if (global.DRACONIA_DEBUG) global.DRACONIA_DEBUG.state = state;
      syncStateClip();
      handlers.onState(state);
    }

    function returnHome(delay) {
      later(function () { if (!action.name) setState('idle'); }, delay);
    }

    function petReaction() {
      var variants = ['happy', 'curious', 'interacting'];
      var next = variants[petVariant % variants.length];
      petVariant += 1;
      setState(next, true);
      petUntil = stateTime + (next === 'curious' ? 2.8 : 2.2);
      burst(0, 1.15, 0.35);
      returnHome(next === 'curious' ? 3000 : 2500);
    }

    function actionFor(name) {
      clearTimers();
      var next = ACTION_STATES[name];
      if (!next) {
        setState('idle', true);
        return;
      }
      action = { name: name, elapsed: 0, duration: 4.2, completed: {} };
      setState(next, true);
      if (name === 'pet') {
        action.duration = 1.8;
        petReaction();
      } else if (name === 'call') {
        action.duration = 4.4;
        cameraState.wantRadius = 5.5;
        cameraState.wantY = 1;
        cameraState.wantTheta = 0;
      } else if (name === 'play') {
        action.duration = 9.4;
        orb.visible = true;
      } else if (name === 'sit') {
        action.duration = 9;
      } else if (name === 'sleep') {
        action.duration = 14;
      } else if (name === 'fly') {
        action.duration = 7.6;
      }
      syncStateClip();
    }

    function finishAction() {
      var name = action.name;
      action.name = null;
      action.elapsed = 0;
      orb.visible = false;
      cameraState.wantRadius = 7.1;
      cameraState.wantPhi = 1.03;
      cameraState.wantY = 0.92;
      if (name === 'play' || name === 'fly') burst(0, 1.1, 0.2);
      setState(name === 'sleep' ? 'resting' : 'idle', true);
      syncStateClip();
      if (name === 'sleep') returnHome(1800);
    }

    function updateAction(dt) {
      if (!action.name) return;
      action.elapsed += dt;
      var e = action.elapsed;
      if (action.name === 'call' && e > 2.2 && !action.completed.happy) {
        action.completed.happy = true;
        setState('happy', true);
        playClip(clipFor('call', 'Roar'), 1, true);
      }
      if (action.name === 'play' && e > 7.6 && !action.completed.burst) {
        action.completed.burst = true;
        burst(orb.position.x, orb.position.y, orb.position.z);
      }
      if (e >= action.duration) finishAction();
    }

    function updateAutonomous(now) {
      if (reduced || action.name || state !== 'idle' || stateTime < nextThought) return;
      var choices = ['curious', 'walking', 'resting', 'happy', 'interacting'];
      var filtered = choices.filter(function (item) { return item !== lastAutonomous; });
      var picked = filtered[Math.floor(rand() * filtered.length)];
      lastAutonomous = picked;
      setState(picked, true);
      nextThought = stateTime + 7 + rand() * 6;
      returnHome(picked === 'resting' ? 4200 : 2600);
    }

    function updateSparkles(dt) {
      if (!sparkles.visible) return;
      var positions = sparkles.geometry.attributes.position;
      var alive = false;
      for (var i = 0; i < positions.count; i += 1) {
        var item = sparkleVelocities[i];
        if (item.life <= 0) continue;
        alive = true;
        item.life -= dt;
        item.y -= dt * 1.8;
        positions.setXYZ(i,
          positions.getX(i) + item.x * dt,
          positions.getY(i) + item.y * dt,
          positions.getZ(i) + item.z * dt);
        if (item.life <= 0) positions.setXYZ(i, 0, -20, 0);
      }
      positions.needsUpdate = true;
      if (!alive) sparkles.visible = false;
    }

    function animate(now) {
      raf = 0;
      if (paused || disposed) return;
      var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      stateTime += dt;
      updateAction(dt);
      updateAutonomous(now);

      var blink = 0;
      if (!reduced && now / 1000 >= nextBlink) {
        blinkTimer += dt;
        if (blinkTimer < 0.18) blink = Math.sin((blinkTimer / 0.18) * Math.PI);
        else {
          blinkTimer = 0;
          nextBlink = now / 1000 + 1.8 + rand() * 3.4;
        }
      }
      if (orb.visible) {
        var ot = now * 0.001;
        orb.position.set(Math.sin(ot * 1.25) * 1.9, 0.72 + Math.abs(Math.sin(ot * 2.1)) * 0.68,
          1.2 + Math.cos(ot * 1.1) * 0.85);
        orbCore.rotation.x += dt * 2;
        orbCore.rotation.y += dt * 3;
        orbRing.rotation.z += dt * 1.5;
        orbGlow.scale.setScalar(1 + Math.sin(now * 0.005) * 0.09);
      }
      applyRig(now, blink, dt);

      waterUniforms.time.value = now * 0.001;
      crystals.forEach(function (item) {
        item.crystal.rotation.y += dt * 0.24;
        item.crystal.position.y = 0.46 + Math.sin(now * 0.0013 + item.phase) * 0.06;
        item.aura.position.y = item.crystal.position.y;
        item.aura.scale.setScalar(1 + Math.sin(now * 0.002 + item.phase) * 0.12);
      });
      var fireflyAttr = fireflies.geometry.attributes.position;
      for (var i = 0; i < fireflyBase.length; i += 1) {
        var item = fireflyBase[i];
        fireflyAttr.setXYZ(i,
          item.x + Math.sin(now * 0.00042 + item.phase) * 0.42,
          item.y + Math.sin(now * 0.0007 + item.phase * 1.7) * 0.32,
          item.z + Math.cos(now * 0.00038 + item.phase) * 0.42);
      }
      fireflyAttr.needsUpdate = true;
      updateSparkles(dt);

      if (!dragStart && !pinchDistance && now - lastInteraction > 2600 && !reduced) {
        cameraState.wantTheta += dt * 0.014;
      }
      cameraState.theta = approach(cameraState.theta, cameraState.wantTheta, dt, 5);
      cameraState.phi = approach(cameraState.phi, cameraState.wantPhi, dt, 5);
      cameraState.radius = approach(cameraState.radius, cameraState.wantRadius, dt, 4);
      cameraState.targetY = approach(cameraState.targetY, cameraState.wantY, dt, 4);
      var sinPhi = Math.sin(cameraState.phi);
      camera.position.set(
        Math.sin(cameraState.theta) * sinPhi * cameraState.radius,
        cameraState.targetY + Math.cos(cameraState.phi) * cameraState.radius,
        Math.cos(cameraState.theta) * sinPhi * cameraState.radius
      );
      camera.lookAt(0, cameraState.targetY, 0);
      renderer.render(scene, camera);
      if (global.DRACONIA_DEBUG) {
        global.DRACONIA_DEBUG.frames += 1;
        if (!global.DRACONIA_DEBUG.ready && dragonRig.ready) {
          global.DRACONIA_DEBUG.ready = true;
          global.setTimeout(function () {
            if (global.Event) doc.dispatchEvent(new global.Event('draconia:ready'));
          }, 0);
        }
      }
      requestFrame();
    }

    function requestFrame() {
      if (!raf && !paused && !disposed) raf = global.requestAnimationFrame(animate);
    }

    function resize() {
      var rect = stage.getBoundingClientRect();
      var width = Math.max(1, Math.floor(rect.width));
      var height = Math.max(1, Math.floor(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function updatePinch() {
      var list = Object.keys(pointers);
      if (list.length < 2) {
        pinchDistance = 0;
        return;
      }
      var a = pointers[list[0]];
      var b = pointers[list[1]];
      var distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance) {
        cameraState.wantRadius = clamp(cameraState.wantRadius - (distance - pinchDistance) * 0.012, 3.6, 10.5);
      }
      pinchDistance = distance;
    }

    function onPointerDown(event) {
      lastInteraction = performance.now();
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      dragStart = { x: event.clientX, y: event.clientY, theta: cameraState.wantTheta, phi: cameraState.wantPhi };
      dragged = false;
      if (renderer.domElement.setPointerCapture && event.isPrimary !== false) {
        try { renderer.domElement.setPointerCapture(event.pointerId); } catch (error) {}
      }
      updatePinch();
    }

    function onPointerMove(event) {
      if (pointers[event.pointerId]) {
        lastInteraction = performance.now();
        pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      }
      if (Object.keys(pointers).length > 1) {
        dragged = true;
        updatePinch();
        return;
      }
      if (dragStart) {
        var dx = event.clientX - dragStart.x;
        var dy = event.clientY - dragStart.y;
        if (Math.hypot(dx, dy) > 6) dragged = true;
        cameraState.wantTheta = dragStart.theta - dx * 0.006;
        cameraState.wantPhi = clamp(dragStart.phi - dy * 0.005, 0.58, 1.42);
        return;
      }
      var rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      renderer.domElement.style.cursor = raycaster.intersectObjects(clickable, false).length ? 'pointer' : 'grab';
    }

    function onPointerUp(event) {
      var wasDragged = dragged;
      delete pointers[event.pointerId];
      dragStart = null;
      pinchDistance = 0;
      if (!wasDragged && Object.keys(pointers).length === 0) {
        var rect = renderer.domElement.getBoundingClientRect();
        pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);
        if (raycaster.intersectObjects(clickable, false).length) handlers.onPet();
      }
    }

    function onDoubleClick() {
      cameraState.wantTheta = 0.34;
      cameraState.wantPhi = 1.03;
      cameraState.wantRadius = 6.3;
      cameraState.wantY = 0.92;
      lastInteraction = performance.now();
    }

    function onWheel(event) {
      event.preventDefault();
      lastInteraction = performance.now();
      cameraState.wantRadius = clamp(cameraState.wantRadius + event.deltaY * 0.006, 3.6, 10.5);
    }

    function onKeyDown(event) {
      if (event.key === 'ArrowLeft') cameraState.wantTheta -= 0.22;
      else if (event.key === 'ArrowRight') cameraState.wantTheta += 0.22;
      else if (event.key === 'ArrowUp') cameraState.wantPhi = clamp(cameraState.wantPhi - 0.12, 0.58, 1.42);
      else if (event.key === 'ArrowDown') cameraState.wantPhi = clamp(cameraState.wantPhi + 0.12, 0.58, 1.42);
      else if (event.key === '+' || event.key === '=') cameraState.wantRadius = clamp(cameraState.wantRadius - 0.6, 3.6, 10.5);
      else if (event.key === '-') cameraState.wantRadius = clamp(cameraState.wantRadius + 0.6, 3.6, 10.5);
      else if (event.key.toLowerCase() === 'f') onDoubleClick();
      else return;
      event.preventDefault();
      lastInteraction = performance.now();
    }

    function onVisibility() {
      paused = !!doc.hidden;
      last = performance.now();
      if (!paused) requestFrame();
    }

    function onContextLost() {
      paused = true;
      stage.setAttribute('data-gfx-mode', 'lost');
    }

    function onContextRestored() {
      paused = false;
      stage.setAttribute('data-gfx-mode', GFX.describe().mode);
      last = performance.now();
      resize();
      requestFrame();
    }

    var canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKeyDown);
    doc.addEventListener('visibilitychange', onVisibility);
    if (GFX && GFX.onContextLost) GFX.onContextLost(onContextLost);
    if (GFX && GFX.onContextRestored) GFX.onContextRestored(onContextRestored);

    var observer = null;
    if (global.ResizeObserver) {
      observer = new global.ResizeObserver(resize);
      observer.observe(stage);
    } else {
      global.addEventListener('resize', resize);
    }

    resize();
    handlers.onState(state);
    requestFrame();

    return {
      setState: function (next) { setState(next); },
      setAction: actionFor,
      setReducedMotion: function (value) { reduced = !!value; },
      focus: onDoubleClick,
      dispose: function () {
        if (disposed) return;
        disposed = true;
        clearTimers();
        if (dragonRig.mixer) {
          dragonRig.mixer.stopAllAction();
          if (dragonRig.model) dragonRig.mixer.uncacheRoot(dragonRig.model);
        }
        if (raf) global.cancelAnimationFrame(raf);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('dblclick', onDoubleClick);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('keydown', onKeyDown);
        doc.removeEventListener('visibilitychange', onVisibility);
        if (observer) observer.disconnect(); else global.removeEventListener('resize', resize);
        var geometries = new Set();
        var usedMaterials = new Set();
        scene.traverse(function (item) {
          if (item.geometry) geometries.add(item.geometry);
          if (item.material) {
            (Array.isArray(item.material) ? item.material : [item.material]).forEach(function (material) {
              usedMaterials.add(material);
            });
          }
        });
        geometries.forEach(function (geometry) { geometry.dispose(); });
        usedMaterials.forEach(function (material) { material.dispose(); });
        if (GFX && GFX.releaseRenderer) GFX.releaseRenderer();
        stage.removeAttribute('data-gfx-mode');
      }
    };
  }

  global.DRACONIA_DEBUG = global.DRACONIA_DEBUG || {
    version: 4, mode: 'pending', state: 'idle', model: 'pending', clip: 'none', meshes: 0, frames: 0, ready: false
  };

  global.DRACONIA_WORLD = {
    create: function (config, stage, handlers) {
      var safeHandlers = handlers || {};
      var onState = typeof safeHandlers.onState === 'function' ? safeHandlers.onState : function () {};
      var onPet = typeof safeHandlers.onPet === 'function' ? safeHandlers.onPet : function () {};
      var wrapped = { onState: onState, onPet: onPet };
      var capabilities = config && config.capabilities ? config.capabilities : {};
      var profile = config && config.profile ? config.profile : {};
      var initial = STATES.indexOf(profile.last_state) >= 0 ? profile.last_state
        : (STATES.indexOf(capabilities.last_state) >= 0 ? capabilities.last_state : 'idle');
      var api = null;
      if (THREE && GFX && stage) {
        try { api = create3D(stage, config, wrapped, initial); } catch (error) {
          if (global.DRACONIA_DEBUG) global.DRACONIA_DEBUG.mode = 'fallback';
        }
      }
      if (!api && stage) api = canvasFallback(stage, config, wrapped, initial);
      if (!api) {
        api = { setState: function () {}, setAction: function () {}, setReducedMotion: function () {}, focus: function () {}, dispose: function () {} };
        onState(initial);
      }
      return api;
    }
  };
})(window);
