(function (global) {
  'use strict';

  var O = global.OTRAVERSO;
  if (!O || !O.THREE) return;
  var THREE = O.THREE;
  var clamp = O.clamp;
  var lerp = O.lerp;

  var CIRCUITS = [
    {
      name: 'NEXUS I · ARRANQUE',
      color: 0x67e8f9,
      css: '#67e8f9',
      limit: 95,
      baseSpeed: 30,
      obstacles: 7,
      pickups: 12,
      points: [
        [0, 0, 0], [0, 2, -45], [18, 8, -85], [42, 14, -110],
        [70, 10, -95], [78, 4, -55], [62, 8, -18], [36, 12, 8], [8, 5, 16]
      ]
    },
    {
      name: 'NEXUS II · VÉRTICE',
      color: 0xf472b6,
      css: '#f472b6',
      limit: 88,
      baseSpeed: 34,
      obstacles: 11,
      pickups: 14,
      points: [
        [0, 0, 0], [-22, 6, -38], [-38, 18, -78], [-16, 26, -118],
        [24, 20, -136], [56, 12, -112], [68, 24, -72], [44, 16, -34], [18, 6, 12]
      ]
    },
    {
      name: 'NEXUS III · COLAPSO',
      color: 0xa78bfa,
      css: '#a78bfa',
      limit: 82,
      baseSpeed: 38,
      obstacles: 15,
      pickups: 16,
      points: [
        [0, 0, 0], [28, 10, -42], [56, 26, -72], [44, 38, -116],
        [4, 30, -150], [-38, 20, -132], [-62, 30, -88], [-40, 14, -42], [-10, 4, 14]
      ]
    }
  ];

  var BEST_KEY = 'otraverso.nexus.best.v1';

  function loadBest() {
    try {
      return JSON.parse(global.localStorage.getItem(BEST_KEY) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function saveBest(circuit, score, time) {
    var all = loadBest();
    var previous = all[circuit];
    if (!previous || score > previous.score) {
      all[circuit] = { score: Math.round(score), time: Math.round(time * 10) / 10, at: new Date().toISOString() };
      try { global.localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (error) { /* almacenamiento bloqueado */ }
    }
    return all[circuit];
  }

  function createPlay(app) {
    var scene = app.scene;
    var root = app.root;
    var quality = app.quality;
    var handlers = [];

    root.setAttribute('data-warp-color', '#f472b6');
    scene.background = new THREE.Color(0x070512);
    scene.fog = new THREE.FogExp2(0x070512, 0.012);
    scene.add(new THREE.AmbientLight(0x7c6bff, 0.6));
    var light = new THREE.DirectionalLight(0xffffff, 1.1);
    light.position.set(10, 24, 18);
    scene.add(light);
    O.addStars(scene, quality === 'low' ? 300 : 800, 400, 0xffc7f0);

    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 220),
      new THREE.MeshStandardMaterial({ color: 0x0a081d, metalness: 0.75, roughness: 0.35, emissive: 0x2a114e, emissiveIntensity: 0.25 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    scene.add(floor);

    var grid = new THREE.GridHelper(160, quality === 'low' ? 20 : 40, 0xf472b6, 0x43318c);
    grid.position.y = -0.96;
    grid.material.transparent = true;
    grid.material.opacity = 0.36;
    scene.add(grid);

    for (var a = 0; a < 5; a += 1) {
      var arch = new THREE.Mesh(
        new THREE.TorusGeometry(11, 0.35, 8, 40, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x120d2d, metalness: 0.9, roughness: 0.2, emissive: a % 2 ? 0x67e8f9 : 0xf472b6, emissiveIntensity: 0.75 })
      );
      arch.position.set(0, 0, -a * 28);
      scene.add(arch);
    }

    var holo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(7, 2),
      new THREE.MeshStandardMaterial({ color: 0x1a1042, metalness: 0.6, roughness: 0.15, emissive: 0xf472b6, emissiveIntensity: 0.65, wireframe: true })
    );
    holo.position.set(0, 10, -52);
    scene.add(holo);
    var holoGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: O.glowTexture(), color: 0xf472b6, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    holoGlow.scale.set(34, 34, 1);
    holoGlow.position.copy(holo.position);
    scene.add(holoGlow);

    var pads = [];
    CIRCUITS.forEach(function (circuit, index) {
      var group = new THREE.Group();
      group.position.set((index - 1) * 13, 0, -18);
      var pad = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, 4.8, 0.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x100c27, metalness: 0.85, roughness: 0.3, emissive: circuit.color, emissiveIntensity: 0.4 })
      );
      group.add(pad);
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.6, 0.18, 8, 40),
        new THREE.MeshBasicMaterial({ color: circuit.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.4;
      group.add(ring);
      var label = document.createElement('button');
      label.type = 'button';
      label.className = 'universe-label universe-label--circuit';
      label.innerHTML = '<span class="universe-label__state">CIRCUITO 0' + (index + 1) + '</span><strong>' + circuit.name.split(' · ')[1] + '</strong><small>' + circuit.limit + 's · ' + circuit.obstacles + ' obstáculos</small>';
      label.addEventListener('click', function () { start(index); });
      app.labelLayer.appendChild(label);
      app.registerLabels((app.labels || []).concat([{ element: label, position: group.position.clone().add(new THREE.Vector3(0, 5.6, 0)) }]));
      pads.push({ group: group, ring: ring, circuit: circuit });
      scene.add(group);
    });

    function listen(element, event, handler) {
      if (!element) return;
      element.addEventListener(event, handler);
      handlers.push([element, event, handler]);
    }

    Array.prototype.forEach.call(root.querySelectorAll('[data-start-circuit]'), function (button) {
      listen(button, 'click', function () { start(parseInt(button.getAttribute('data-circuit'), 10) || 0); });
    });

    function start(index) {
      app.navigate('/play/nexus-rush', 'game', { circuit: clamp(index, 0, CIRCUITS.length - 1) });
    }

    var best = loadBest();
    var bestNode = root.querySelector('[data-play-best]');
    if (bestNode) {
      var entries = CIRCUITS.map(function (circuit, index) {
        var record = best[index];
        return circuit.name.split(' · ')[1] + ': ' + (record ? record.score.toLocaleString('es-CO') : '—');
      });
      bestNode.textContent = entries.join(' · ');
    }

    var orbit = 0;
    return {
      warpColor: '#f472b6',
      update: function (delta, elapsed) {
        orbit += delta * 0.07;
        holo.rotation.y += delta * 0.22;
        holo.rotation.x = Math.sin(elapsed * 0.4) * 0.14;
        holoGlow.material.opacity = 0.32 + Math.sin(elapsed * 1.6) * 0.1;
        pads.forEach(function (pad, index) {
          pad.ring.rotation.z += delta * (0.3 + index * 0.1);
          pad.group.position.y = Math.sin(elapsed * 1.3 + index) * 0.35;
        });
        app.camera.position.set(Math.sin(orbit) * 30, 14, Math.cos(orbit) * 30 - 6);
        app.camera.lookAt(0, 7, -24);
      },
      dispose: function () {
        handlers.forEach(function (entry) { entry[0].removeEventListener(entry[1], entry[2]); });
      }
    };
  }

  function buildTrack(scene, circuit, quality) {
    var points = circuit.points.map(function (point) { return new THREE.Vector3(point[0], point[1], point[2]); });
    var curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
    var segments = quality === 'low' ? 130 : 260;
    var width = 4.2;
    var positions = [];
    var indices = [];
    var leftPoints = [];
    var rightPoints = [];

    for (var i = 0; i <= segments; i += 1) {
      var t = i / segments;
      var point = curve.getPointAt(t);
      var tangent = curve.getTangentAt(t).normalize();
      var side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
      var left = point.clone().addScaledVector(side, -width);
      var right = point.clone().addScaledVector(side, width);
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      leftPoints.push(left.clone().add(new THREE.Vector3(0, 0.5, 0)));
      rightPoints.push(right.clone().add(new THREE.Vector3(0, 0.5, 0)));
      if (i < segments) {
        var base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    var road = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: 0x090818, metalness: 0.72, roughness: 0.38, side: THREE.DoubleSide,
      emissive: circuit.color, emissiveIntensity: 0.14
    }));
    scene.add(road);
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftPoints), new THREE.LineBasicMaterial({
      color: circuit.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending
    })));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightPoints), new THREE.LineBasicMaterial({
      color: circuit.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending
    })));

    for (var p = 0; p <= 10; p += 1) {
      var at = p / 10;
      var pillarPoint = curve.getPointAt(at);
      var pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 1.2, 22, 6),
        new THREE.MeshStandardMaterial({ color: 0x0c0a20, metalness: 0.8, roughness: 0.4, emissive: circuit.color, emissiveIntensity: 0.1 })
      );
      pillar.position.set(pillarPoint.x, pillarPoint.y - 12, pillarPoint.z);
      scene.add(pillar);
    }

    return { curve: curve, length: curve.getLength(), sideAt: function (t) {
      var tangent = curve.getTangentAt(clamp(t, 0, 1)).normalize();
      return new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
    } };
  }

  function makeCraft(color) {
    var group = new THREE.Group();
    var material = new THREE.MeshStandardMaterial({ color: 0x0c0a22, metalness: 0.9, roughness: 0.18, emissive: color, emissiveIntensity: 0.3 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 3.2), material);
    group.add(body);
    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.76, 1.6, 4), material);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -2.25;
    group.add(nose);
    var canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x7dd3fc, metalness: 0.4, roughness: 0.08, transparent: true, opacity: 0.75, emissive: color, emissiveIntensity: 0.35 })
    );
    canopy.scale.set(1, 0.55, 1.45);
    canopy.position.set(0, 0.45, -0.35);
    group.add(canopy);
    [-1, 1].forEach(function (sign) {
      var wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 1.1), material);
      wing.position.set(sign * 1.25, -0.05, 0.45);
      wing.rotation.z = sign * 0.16;
      group.add(wing);
      var thruster = new THREE.Sprite(new THREE.SpriteMaterial({
        map: O.glowTexture(), color: color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      thruster.scale.set(2.2, 2.2, 1);
      thruster.position.set(sign * 0.55, 0, 1.9);
      group.add(thruster);
    });
    return group;
  }

  function createGame(app, options) {
    var index = clamp(parseInt(options.circuit, 10) || 0, 0, CIRCUITS.length - 1);
    var circuit = CIRCUITS[index];
    var scene = app.scene;
    var root = app.root;
    var quality = app.quality;
    var handlers = [];

    root.setAttribute('data-warp-color', circuit.css);
    scene.background = new THREE.Color(0x04040f);
    scene.fog = new THREE.FogExp2(0x04040f, 0.006);
    scene.add(new THREE.AmbientLight(0x6f6bff, 0.5));
    var sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(30, 60, 20);
    scene.add(sun);
    O.addStars(scene, quality === 'low' ? 400 : 1100, 500, circuit.color);

    var track = buildTrack(scene, circuit, quality);
    var craft = makeCraft(circuit.color);
    scene.add(craft);

    for (var b = 0; b < (quality === 'low' ? 8 : 18); b += 1) {
      var angle = (b / (quality === 'low' ? 8 : 18)) * Math.PI * 2;
      var building = new THREE.Mesh(
        new THREE.BoxGeometry(6 + (b % 3) * 3, 30 + (b % 4) * 12, 6 + (b % 2) * 4),
        new THREE.MeshStandardMaterial({ color: 0x080719, metalness: 0.8, roughness: 0.4, emissive: circuit.color, emissiveIntensity: 0.07 })
      );
      building.position.set(Math.cos(angle) * 150, -8, -70 + Math.sin(angle) * 110);
      scene.add(building);
    }

    var obstacles = [];
    for (var o = 0; o < circuit.obstacles; o += 1) {
      var ot = 0.12 + (o / circuit.obstacles) * 0.8 + (Math.random() - 0.5) * 0.025;
      var lane = (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * 2.5);
      var barrier = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.5, 0),
        new THREE.MeshStandardMaterial({ color: 0x2b0718, metalness: 0.7, roughness: 0.3, emissive: 0xff3d6e, emissiveIntensity: 0.9 })
      );
      var op = track.curve.getPointAt(ot).addScaledVector(track.sideAt(ot), lane);
      barrier.position.copy(op);
      scene.add(barrier);
      obstacles.push({ t: ot, lane: lane, mesh: barrier, active: true });
    }

    var pickups = [];
    for (var c = 0; c < circuit.pickups; c += 1) {
      var ct = 0.07 + (c / circuit.pickups) * 0.87;
      var clane = (Math.random() - 0.5) * 6;
      var orb = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.22, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending })
      );
      var cp = track.curve.getPointAt(ct).addScaledVector(track.sideAt(ct), clane).add(new THREE.Vector3(0, 1.4, 0));
      orb.position.copy(cp);
      scene.add(orb);
      pickups.push({ t: ct, lane: clane, mesh: orb, active: true });
    }

    var state = {
      t: 0.005, lane: 0, speed: circuit.baseSpeed, turbo: 100, energy: 100,
      score: 0, time: 0, jump: 0, velocity: 0, countdown: 3.4,
      running: false, finished: false, paused: false, result: null
    };
    var touch = { left: false, right: false, boost: false, jump: false };
    var hudTimer = 0;
    var camPosition = new THREE.Vector3();
    var camTarget = new THREE.Vector3();

    var hud = {
      speed: root.querySelector('[data-hud-speed]'),
      time: root.querySelector('[data-hud-time]'),
      score: root.querySelector('[data-hud-score]'),
      turbo: root.querySelector('[data-hud-turbo]'),
      energy: root.querySelector('[data-hud-energy]'),
      progress: root.querySelector('[data-hud-progress]'),
      countdown: root.querySelector('[data-game-countdown]'),
      result: root.querySelector('[data-game-result]'),
      resultTitle: root.querySelector('[data-result-title]'),
      resultScore: root.querySelector('[data-result-score]'),
      resultTime: root.querySelector('[data-result-time]'),
      resultBest: root.querySelector('[data-result-best]'),
      paused: root.querySelector('[data-game-paused]')
    };

    function listen(element, event, handler) {
      if (!element) return;
      element.addEventListener(event, handler);
      handlers.push([element, event, handler]);
    }

    function bindTouch(selector, key) {
      Array.prototype.forEach.call(root.querySelectorAll(selector), function (button) {
        var on = function (event) { event.preventDefault(); touch[key] = true; app.audio.unlock(); };
        var off = function (event) { event.preventDefault(); touch[key] = false; };
        listen(button, 'pointerdown', on);
        listen(button, 'pointerup', off);
        listen(button, 'pointerleave', off);
        listen(button, 'pointercancel', off);
      });
    }
    bindTouch('[data-touch-left]', 'left');
    bindTouch('[data-touch-right]', 'right');
    bindTouch('[data-touch-boost]', 'boost');
    bindTouch('[data-touch-jump]', 'jump');

    listen(root.querySelector('[data-retry]'), 'click', function () { app.setScene('game', { circuit: index }); });
    listen(root.querySelector('[data-circuit-menu]'), 'click', function () { app.navigate('/play', 'play'); });
    listen(root.querySelector('[data-game-hub]'), 'click', function () { app.navigate('/', 'hub'); });
    listen(global, 'keydown', function (event) {
      if (event.code === 'KeyR' && state.finished) app.setScene('game', { circuit: index });
      if (event.code === 'Escape') app.navigate('/play', 'play');
      if (event.code === 'KeyP' && state.running && !state.finished) {
        state.paused = !state.paused;
        if (hud.paused) hud.paused.hidden = !state.paused;
      }
    });

    function updateHud() {
      if (hud.speed) hud.speed.textContent = Math.round(state.speed * 3.6) + ' km/h';
      if (hud.time) hud.time.textContent = state.time.toFixed(1) + ' / ' + circuit.limit + 's';
      if (hud.score) hud.score.textContent = Math.round(state.score).toLocaleString('es-CO');
      if (hud.turbo) hud.turbo.style.width = clamp(state.turbo, 0, 100) + '%';
      if (hud.energy) hud.energy.style.width = clamp(state.energy, 0, 100) + '%';
      if (hud.progress) hud.progress.style.width = clamp(state.t * 100, 0, 100) + '%';
      if (hud.countdown) {
        if (!state.running && !state.finished) {
          hud.countdown.hidden = false;
          hud.countdown.textContent = state.countdown > 0 ? Math.ceil(state.countdown) : '¡YA!';
        } else {
          hud.countdown.hidden = true;
        }
      }
    }

    function finish(won) {
      if (state.finished) return;
      state.finished = true;
      state.running = false;
      var bonus = won ? Math.max(0, circuit.limit - state.time) * 120 + state.energy * 3 : 0;
      state.score += bonus;
      var record = saveBest(index, state.score, state.time);
      app.audio.setEngine(0, false);
      if (won) app.audio.success(); else app.audio.impact();
      if (hud.result) hud.result.hidden = false;
      if (hud.resultTitle) hud.resultTitle.textContent = won ? 'CIRCUITO COMPLETADO' : 'TIEMPO AGOTADO';
      if (hud.resultScore) hud.resultScore.textContent = Math.round(state.score).toLocaleString('es-CO');
      if (hud.resultTime) hud.resultTime.textContent = state.time.toFixed(1) + ' s';
      if (hud.resultBest) hud.resultBest.textContent = record ? record.score.toLocaleString('es-CO') + ' pts · ' + record.time.toFixed(1) + ' s' : '—';
      updateHud();
    }

    function checkCollisions(previousT) {
      var crossed = function (t) {
        return t > Math.min(previousT, state.t) && t <= Math.max(previousT, state.t);
      };
      obstacles.forEach(function (item) {
        if (!item.active || !crossed(item.t) || Math.abs(state.lane - item.lane) > 1.25 || state.jump > 1.6) return;
        item.active = false;
        item.mesh.visible = false;
        state.energy = clamp(state.energy - 24, 0, 100);
        state.speed *= 0.68;
        state.score = Math.max(0, state.score - 180);
        app.audio.impact();
        app.notify('Colisión · energía reducida');
      });
      pickups.forEach(function (item) {
        if (!item.active || !crossed(item.t) || Math.abs(state.lane - item.lane) > 1.5) return;
        item.active = false;
        item.mesh.visible = false;
        state.energy = clamp(state.energy + 12, 0, 100);
        state.turbo = clamp(state.turbo + 18, 0, 100);
        state.score += 240;
        app.audio.pickup();
      });
    }

    return {
      warpColor: circuit.css,
      update: function (delta, elapsed, rawDelta) {
        var step = rawDelta || delta;
        if (state.countdown > 0 && !state.finished) {
          state.countdown = Math.max(0, state.countdown - step);
          if (state.countdown === 0) state.running = true;
        }

        if (state.running && !state.paused && !state.finished) {
          var previousT = state.t;
          var steering = 0;
          if (app.input.key('ArrowLeft') || app.input.key('KeyA') || touch.left) steering -= 1;
          if (app.input.key('ArrowRight') || app.input.key('KeyD') || touch.right) steering += 1;
          state.lane = clamp(state.lane + steering * step * 12, -3.3, 3.3);

          var boost = (app.input.key('Space') || touch.boost) && state.turbo > 1;
          if (boost) {
            state.turbo = clamp(state.turbo - step * 26, 0, 100);
            state.score += step * 18;
          } else {
            state.turbo = clamp(state.turbo + step * 7, 0, 100);
          }
          var targetSpeed = circuit.baseSpeed * (boost ? 1.75 : 1) * (0.7 + state.energy / 330);
          state.speed = lerp(state.speed, targetSpeed, clamp(step * 4, 0, 1));
          state.energy = clamp(state.energy - step * 1.4, 0, 100);

          var jumpPressed = app.input.key('ShiftLeft') || app.input.key('ShiftRight') || touch.jump;
          if (jumpPressed && state.jump <= 0.01 && state.velocity === 0) state.velocity = 9;
          if (state.jump > 0 || state.velocity > 0) {
            state.jump = Math.max(0, state.jump + state.velocity * step);
            state.velocity -= 24 * step;
            if (state.jump <= 0) { state.jump = 0; state.velocity = 0; }
          }

          state.t += (state.speed * step) / track.length;
          state.time += step;
          state.score += step * (state.speed * 0.9 + state.t * 60);
          checkCollisions(previousT);

          if (state.t >= 1) finish(true);
          else if (state.time >= circuit.limit) finish(false);
        }

        var point = track.curve.getPointAt(clamp(state.t, 0, 1));
        var side = track.sideAt(state.t);
        craft.position.copy(point).addScaledVector(side, state.lane).add(new THREE.Vector3(0, 1.1 + state.jump + Math.sin(app.elapsed * 6) * 0.08, 0));
        var ahead = track.curve.getPointAt(clamp(state.t + 0.012, 0, 1));
        craft.lookAt(ahead);
        craft.rotation.z = lerp(craft.rotation.z, -state.lane * 0.045, 0.1);

        camPosition.copy(craft.position).addScaledVector(track.curve.getTangentAt(clamp(state.t, 0, 1)).normalize(), -14).add(new THREE.Vector3(0, 6, 0));
        camTarget.copy(craft.position).addScaledVector(track.curve.getTangentAt(clamp(state.t + 0.02, 0, 1)).normalize(), 10);
        app.camera.position.lerp(camPosition, 0.14);
        app.camera.lookAt(camTarget);
        app.camera.fov = lerp(app.camera.fov, 58 + (state.speed - circuit.baseSpeed) * 0.35, 0.06);
        app.camera.updateProjectionMatrix();

        obstacles.forEach(function (item) { if (item.active) item.mesh.rotation.y += delta * 1.2; });
        pickups.forEach(function (item) { if (item.active) item.mesh.rotation.z += delta * 2.4; });

        app.audio.setEngine(state.speed, state.running && !state.finished && !state.paused);

        hudTimer += delta;
        if (hudTimer > 0.07) { hudTimer = 0; updateHud(); }
      },
      dispose: function () {
        handlers.forEach(function (entry) { entry[0].removeEventListener(entry[1], entry[2]); });
        app.audio.setEngine(0, false);
      }
    };
  }

  O.registerScene('play', createPlay);
  O.registerScene('game', createGame);
})(window);
