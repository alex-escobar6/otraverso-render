(function (global) {
  'use strict';

  var THREE = global.THREE;
  var registries = {};
  var appInstance = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function detectQuality() {
    var cores = global.navigator && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
    var memory = global.navigator && navigator.deviceMemory ? navigator.deviceMemory : 4;
    var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    if (cores <= 2 || memory <= 2 || mobile) return 'low';
    if (cores <= 4 || memory <= 4) return 'medium';
    return 'high';
  }

  function supportsWebGL() {
    try {
      var probe = document.createElement('canvas');
      return !!(probe.getContext('webgl2') || probe.getContext('webgl') || probe.getContext('experimental-webgl'));
    } catch (error) {
      return false;
    }
  }

  function makeGlowTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    var context = canvas.getContext('2d');
    var gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    var texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  function disposeScene(scene) {
    if (!scene) return;
    scene.traverse(function (object) {
      if (object.geometry && object.geometry.dispose) object.geometry.dispose();
      var materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
      materials.forEach(function (material) {
        Object.keys(material).forEach(function (key) {
          var value = material[key];
          if (value && value.isTexture && value.dispose && value !== (appInstance && appInstance.glowTexture)) value.dispose();
        });
        if (material.dispose) material.dispose();
      });
    });
    while (scene.children.length) scene.remove(scene.children[0]);
  }

  function AudioEngine() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.musicNodes = [];
    this.engineNode = null;
    this.noiseBuffer = null;
  }

  AudioEngine.prototype.unlock = function () {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    var Context = global.AudioContext || global.webkitAudioContext;
    if (!Context) return;
    try {
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(this.context.destination);
    } catch (error) {
      this.context = null;
    }
  };

  AudioEngine.prototype.setMuted = function (muted) {
    this.muted = !!muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.32, this.context.currentTime, 0.05);
  };

  AudioEngine.prototype.tone = function (frequency, duration, type, volume, delay) {
    if (!this.context || this.muted) return;
    var now = this.context.currentTime + (delay || 0);
    var oscillator = this.context.createOscillator();
    var gain = this.context.createGain();
    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume || 0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.05);
  };

  AudioEngine.prototype.noise = function (duration, volume) {
    if (!this.context || this.muted) return;
    if (!this.noiseBuffer) {
      var length = this.context.sampleRate * 0.5;
      this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
      var data = this.noiseBuffer.getChannelData(0);
      for (var i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    var source = this.context.createBufferSource();
    var filter = this.context.createBiquadFilter();
    var gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    gain.gain.value = volume || 0.18;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    source.stop(this.context.currentTime + duration);
  };

  AudioEngine.prototype.startMusic = function (root) {
    if (!this.context || this.musicNodes.length) return;
    var self = this;
    var base = root === 'game' ? 55 : root === 'play' ? 65.41 : 73.42;
    [1, 1.5, 2.01].forEach(function (ratio, index) {
      var oscillator = self.context.createOscillator();
      var gain = self.context.createGain();
      var lfo = self.context.createOscillator();
      var lfoGain = self.context.createGain();
      oscillator.type = index === 0 ? 'sawtooth' : 'sine';
      oscillator.frequency.value = base * ratio;
      gain.gain.value = index === 0 ? 0.018 : 0.012;
      lfo.frequency.value = 0.08 + index * 0.03;
      lfoGain.gain.value = 0.008;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      oscillator.connect(gain);
      gain.connect(self.master);
      oscillator.start();
      lfo.start();
      self.musicNodes.push(oscillator, lfo, gain);
    });
  };

  AudioEngine.prototype.stopMusic = function () {
    this.musicNodes.forEach(function (node) {
      try { if (node.stop) node.stop(); } catch (error) { /* ya detenido */ }
      try { node.disconnect(); } catch (error) { /* ya desconectado */ }
    });
    this.musicNodes = [];
  };

  AudioEngine.prototype.setEngine = function (speed, active) {
    if (!this.context) return;
    if (!this.engineNode) {
      var oscillator = this.context.createOscillator();
      var filter = this.context.createBiquadFilter();
      var gain = this.context.createGain();
      oscillator.type = 'sawtooth';
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      gain.gain.value = 0;
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      oscillator.start();
      this.engineNode = { oscillator: oscillator, filter: filter, gain: gain };
    }
    var now = this.context.currentTime;
    this.engineNode.oscillator.frequency.setTargetAtTime(60 + speed * 2.4, now, 0.08);
    this.engineNode.filter.frequency.setTargetAtTime(420 + speed * 22, now, 0.08);
    this.engineNode.gain.gain.setTargetAtTime(active && !this.muted ? 0.035 : 0, now, 0.12);
  };

  AudioEngine.prototype.pickup = function () {
    this.tone(880, 0.16, 'triangle', 0.12);
    this.tone(1320, 0.2, 'sine', 0.09, 0.06);
  };

  AudioEngine.prototype.impact = function () {
    this.noise(0.22, 0.2);
    this.tone(95, 0.25, 'square', 0.09);
  };

  AudioEngine.prototype.portal = function () {
    this.tone(180, 0.5, 'sawtooth', 0.08);
    this.tone(360, 0.7, 'sine', 0.07, 0.08);
    this.tone(720, 0.8, 'triangle', 0.05, 0.16);
  };

  AudioEngine.prototype.success = function () {
    [523, 659, 784, 1046].forEach(function (note, index) {
      this.tone(note, 0.3, 'triangle', 0.1, index * 0.11);
    }, this);
  };

  function Input(app) {
    this.app = app;
    this.keys = {};
    this.pointer = { x: 0, y: 0, down: false, clicked: false, clickX: 0, clickY: 0 };
    var self = this;

    global.addEventListener('keydown', function (event) {
      if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName || '')) return;
      self.keys[event.code] = true;
      self.keys[event.key.toLowerCase()] = true;
      self.app.audio.unlock();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(event.code) >= 0 && self.app.current && self.app.current.preventScroll) {
        event.preventDefault();
      }
    });
    global.addEventListener('keyup', function (event) {
      self.keys[event.code] = false;
      self.keys[event.key.toLowerCase()] = false;
    });
    global.addEventListener('blur', function () { self.keys = {}; self.pointer.down = false; });

    app.canvas.addEventListener('pointermove', function (event) {
      var rect = app.canvas.getBoundingClientRect();
      self.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      self.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    });
    app.canvas.addEventListener('pointerdown', function (event) {
      self.pointer.down = true;
      self.pointer.clicked = true;
      var rect = app.canvas.getBoundingClientRect();
      self.pointer.clickX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      self.pointer.clickY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      self.app.audio.unlock();
    });
    global.addEventListener('pointerup', function () { self.pointer.down = false; });
    app.canvas.addEventListener('wheel', function (event) {
      self.wheel = (self.wheel || 0) + event.deltaY;
      event.preventDefault();
    }, { passive: false });
  }

  Input.prototype.key = function (name) {
    return !!this.keys[name] || !!this.keys[name.toLowerCase()] || !!this.keys[name.toUpperCase()];
  };

  Input.prototype.consumeClick = function () {
    if (!this.pointer.clicked) return null;
    this.pointer.clicked = false;
    return { x: this.pointer.clickX, y: this.pointer.clickY };
  };

  Input.prototype.consumeWheel = function () {
    var value = this.wheel || 0;
    this.wheel = 0;
    return value;
  };

  function UniverseApp(root) {
    this.root = root;
    this.sceneName = root.getAttribute('data-scene') || 'hub';
    this.quality = root.getAttribute('data-quality') || detectQuality();
    this.reduced = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.canvas = root.querySelector('[data-universe-canvas]');
    this.labelLayer = root.querySelector('[data-universe-labels]');
    this.overlay = root.querySelector('[data-warp-overlay]');
    this.loader = root.querySelector('[data-loader]');
    this.loaderBar = root.querySelector('[data-loader-bar]');
    this.loaderStatus = root.querySelector('[data-loader-status]');
    this.audio = new AudioEngine();
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.current = null;
    this.labels = [];
    this.warping = false;

    var settings = {
      canvas: this.canvas,
      antialias: this.quality !== 'low',
      alpha: true,
      powerPreference: 'high-performance'
    };
    this.renderer = new THREE.WebGLRenderer(settings);
    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.35));
    this.renderer.setSize(root.clientWidth || global.innerWidth, root.clientHeight || global.innerHeight, false);
    if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, this.aspect(), 0.1, 3000);
    this.camera.position.set(0, 12, 44);
    this.input = new Input(this);

    this.glowTexture = makeGlowTexture();

    var self = this;
    global.addEventListener('resize', function () { self.resize(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) self.clock.getDelta();
    });
    global.addEventListener('popstate', function (event) {
      var name = self.sceneFromPath(global.location.pathname);
      if (registries[name] && name !== self.sceneName) self.setScene(name, (event.state && event.state.options) || {});
    });
    root.addEventListener('click', function () { self.audio.unlock(); });

    this.hideLoader(0.35);
    this.setScene(this.sceneName);
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  UniverseApp.prototype.aspect = function () {
    var width = this.root.clientWidth || global.innerWidth;
    var height = this.root.clientHeight || global.innerHeight;
    return width / Math.max(height, 1);
  };

  UniverseApp.prototype.resize = function () {
    var width = this.root.clientWidth || global.innerWidth;
    var height = this.root.clientHeight || global.innerHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  UniverseApp.prototype.sceneFromPath = function (path) {
    if (path.indexOf('/play/nexus-rush') === 0) return 'game';
    if (path.indexOf('/play') === 0) return 'play';
    return 'hub';
  };

  UniverseApp.prototype.hideLoader = function (delay) {
    var self = this;
    global.setTimeout(function () {
      if (!self.loader) return;
      self.loader.classList.add('is-hidden');
      global.setTimeout(function () { self.loader.setAttribute('hidden', ''); }, 600);
    }, delay * 1000);
  };

  UniverseApp.prototype.setLoader = function (percent, status) {
    if (this.loaderBar) this.loaderBar.style.width = clamp(percent, 0, 100) + '%';
    if (this.loaderStatus && status) this.loaderStatus.textContent = status;
  };

  UniverseApp.prototype.registerLabels = function (labels) {
    this.labels = labels || [];
  };

  UniverseApp.prototype.updateLabels = function () {
    if (!this.labelLayer) return;
    var width = this.root.clientWidth || global.innerWidth;
    var height = this.root.clientHeight || global.innerHeight;
    var vector = new THREE.Vector3();
    var self = this;
    this.labels.forEach(function (label) {
      vector.copy(label.position).project(self.camera);
      var visible = vector.z < 1 && vector.x > -1.25 && vector.x < 1.25 && vector.y > -1.25 && vector.y < 1.25;
      label.element.style.opacity = visible ? '1' : '0';
      if (!visible) return;
      var x = (vector.x * 0.5 + 0.5) * width;
      var y = (-vector.y * 0.5 + 0.5) * height;
      label.element.style.transform = 'translate(-50%, -50%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    });
  };

  UniverseApp.prototype.setScene = function (name, options) {
    options = options || {};
    var factory = registries[name];
    if (!factory) {
      this.setLoader(100, 'Escena no disponible');
      return;
    }
    if (this.current && this.current.dispose) this.current.dispose();
    if (this.audio.engineNode) this.audio.setEngine(0, false);
    disposeScene(this.scene);
    this.scene = new THREE.Scene();
    this.sceneName = name;
    this.root.setAttribute('data-scene', name);
    if (options.circuit != null) this.root.setAttribute('data-circuit', options.circuit);
    this.labels = [];
    if (this.labelLayer) this.labelLayer.innerHTML = '';
    this.current = factory(this, options || {}) || {};
    this.current.preventScroll = name === 'game' || name === 'play';
    this.audio.stopMusic();
    this.audio.startMusic(name);
    this.setLoader(100, name === 'game' ? 'NEXUS RUSH listo' : 'Universo conectado');
    this.resize();
  };

  UniverseApp.prototype.navigate = function (path, scene, options) {
    var self = this;
    this.warp((this.current && this.current.warpColor) || this.root.getAttribute('data-warp-color') || '#8b5cf6', function () {
      if (scene) {
        global.history.pushState({ scene: scene, options: options }, '', path);
        self.setScene(scene, options);
      } else {
        global.location.assign(path);
      }
    });
  };

  UniverseApp.prototype.warp = function (color, callback) {
    if (this.warping) return;
    this.warping = true;
    this.audio.portal();
    this.root.classList.add('is-warping');
    if (this.overlay) {
      this.overlay.style.setProperty('--warp-color', color || '#8b5cf6');
      this.overlay.classList.add('is-active');
    }
    var self = this;
    global.setTimeout(function () {
      if (callback) callback();
      global.setTimeout(function () {
        if (self.overlay) self.overlay.classList.remove('is-active');
        self.root.classList.remove('is-warping');
        self.warping = false;
      }, 420);
    }, 620);
  };

  UniverseApp.prototype.notify = function (message) {
    var toast = this.root.querySelector('[data-universe-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    global.clearTimeout(this.toastTimer);
    this.toastTimer = global.setTimeout(function () { toast.classList.remove('is-visible'); }, 2400);
  };

  UniverseApp.prototype.tick = function () {
    requestAnimationFrame(this.tick);
    if (document.hidden) return;
    var rawDelta = this.clock.getDelta();
    var delta = Math.min(rawDelta, 0.05);
    this.elapsed += rawDelta;
    if (this.current && this.current.update) this.current.update(delta, this.elapsed, rawDelta);
    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
  };

  function boot() {
    if (appInstance) return appInstance;
    var root = document.querySelector('[data-universe-root]');
    if (!root) return null;
    if (!THREE || !supportsWebGL()) {
      root.classList.add('no-webgl');
      var fallback = root.querySelector('[data-universe-fallback]');
      if (fallback) fallback.hidden = false;
      var loader = root.querySelector('[data-loader]');
      if (loader) loader.setAttribute('hidden', '');
      return null;
    }
    try {
      appInstance = new UniverseApp(root);
      global.OTRAVERSO_APP = appInstance;
      return appInstance;
    } catch (error) {
      root.classList.add('no-webgl');
      var alt = root.querySelector('[data-universe-fallback]');
      if (alt) alt.hidden = false;
      var spin = root.querySelector('[data-loader]');
      if (spin) spin.setAttribute('hidden', '');
      if (global.console) console.error('OTRAVERSO: WebGL no disponible', error);
      return null;
    }
  }

  global.OTRAVERSO = {
    THREE: THREE,
    registerScene: function (name, factory) { registries[name] = factory; },
    boot: boot,
    app: function () { return appInstance; },
    clamp: clamp,
    lerp: lerp,
    glowTexture: function () { return appInstance ? appInstance.glowTexture : makeGlowTexture(); },
    addStars: function (scene, count, radius, color) {
      var positions = new Float32Array(count * 3);
      for (var i = 0; i < count; i += 1) {
        var theta = Math.random() * Math.PI * 2;
        var phi = Math.acos(2 * Math.random() - 1);
        var r = radius * (0.65 + Math.random() * 0.35);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi);
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      var material = new THREE.PointsMaterial({ color: color || 0xbfc8ff, size: 1.2, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false });
      var points = new THREE.Points(geometry, material);
      scene.add(points);
      return points;
    },
    makePanel: function (width, height, color, opacity) {
      var geometry = new THREE.PlaneGeometry(width, height);
      var material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity == null ? 0.35 : opacity, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
      return new THREE.Mesh(geometry, material);
    }
  };

  if (document.readyState === 'complete') {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})(window);
