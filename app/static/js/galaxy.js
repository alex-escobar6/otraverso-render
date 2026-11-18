(function (global) {
  'use strict';

  var O = global.OTRAVERSO;
  if (!O || !O.THREE) return;
  var THREE = O.THREE;
  var clamp = O.clamp;
  var lerp = O.lerp;

  function colorOf(value) {
    try { return new THREE.Color(value || '#8b5cf6'); } catch (error) { return new THREE.Color('#8b5cf6'); }
  }

  function makeTower(color, height, radius) {
    var group = new THREE.Group();
    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.45, radius, height, 6),
      new THREE.MeshStandardMaterial({ color: 0x11102c, metalness: 0.85, roughness: 0.32, emissive: color, emissiveIntensity: 0.08 })
    );
    body.position.y = height / 2;
    body.castShadow = true;
    group.add(body);
    var band = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.52, radius * 0.52, 0.22, 6),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
    );
    band.position.y = height * 0.72;
    group.add(band);
    var spire = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.28, height * 0.28, 6),
      new THREE.MeshStandardMaterial({ color: 0x17153d, metalness: 0.9, roughness: 0.2, emissive: color, emissiveIntensity: 0.2 })
    );
    spire.position.y = height * 1.12;
    group.add(spire);
    return group;
  }

  function makeVehicle(color) {
    var group = new THREE.Group();
    var hull = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 1.6, 4),
      new THREE.MeshStandardMaterial({ color: 0x0b0a1f, metalness: 0.9, roughness: 0.25, emissive: color, emissiveIntensity: 0.25 })
    );
    hull.rotation.x = Math.PI / 2;
    group.add(hull);
    var trail = new THREE.Sprite(new THREE.SpriteMaterial({
      map: O.glowTexture(), color: color, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    trail.scale.set(2.4, 2.4, 1);
    trail.position.z = 1.1;
    group.add(trail);
    return group;
  }

  function createHub(app) {
    var scene = app.scene;
    var root = app.root;
    var quality = app.quality;
    var reduced = app.reduced;

    scene.background = new THREE.Color(0x050512);
    scene.fog = new THREE.FogExp2(0x050512, 0.0075);

    scene.add(new THREE.AmbientLight(0x6f6bff, 0.55));
    var key = new THREE.DirectionalLight(0xd7d5ff, 1.15);
    key.position.set(20, 38, 24);
    if (quality === 'high') {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -50;
      key.shadow.camera.right = 50;
      key.shadow.camera.top = 50;
      key.shadow.camera.bottom = -50;
    }
    scene.add(key);
    [0x8b5cf6, 0x2dd4bf, 0xf472b6].forEach(function (shade, index) {
      var light = new THREE.PointLight(shade, 1.6, 90);
      light.position.set(Math.cos(index * 2.1) * 26, 10 + index * 4, Math.sin(index * 2.1) * 26);
      scene.add(light);
    });

    O.addStars(scene, quality === 'low' ? 500 : 1400, 520, 0xc9c9ff);
    var dustGeometry = new THREE.BufferGeometry();
    var dustCount = quality === 'low' ? 180 : 420;
    var dustPositions = new Float32Array(dustCount * 3);
    for (var d = 0; d < dustCount; d += 1) {
      dustPositions[d * 3] = (Math.random() - 0.5) * 130;
      dustPositions[d * 3 + 1] = Math.random() * 40 - 4;
      dustPositions[d * 3 + 2] = (Math.random() - 0.5) * 130;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    var dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
      color: 0x8be9ff, size: 0.28, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    scene.add(dust);

    var plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 18, 1.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x0d0b24, metalness: 0.8, roughness: 0.35, emissive: 0x2b1b66, emissiveIntensity: 0.2 })
    );
    plaza.position.y = -1.2;
    plaza.receiveShadow = true;
    scene.add(plaza);

    var core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.4, 1),
      new THREE.MeshStandardMaterial({ color: 0x171443, metalness: 0.7, roughness: 0.2, emissive: 0x6d5cff, emissiveIntensity: 0.65, wireframe: true })
    );
    core.position.y = 7;
    scene.add(core);
    var coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: O.glowTexture(), color: 0x8b5cf6, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    coreGlow.scale.set(20, 20, 1);
    coreGlow.position.y = 7;
    scene.add(coreGlow);

    for (var i = 0; i < 8; i += 1) {
      var angle = (i / 8) * Math.PI * 2;
      var tower = makeTower(i % 2 ? 0x2dd4bf : 0x8b5cf6, 8 + (i % 3) * 5, 1.8 + (i % 2) * 0.5);
      tower.position.set(Math.cos(angle) * 13, -0.4, Math.sin(angle) * 13);
      scene.add(tower);
      var bridge = new THREE.Mesh(
        new THREE.BoxGeometry(9, 0.18, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x12102e, metalness: 0.8, roughness: 0.4, emissive: 0x4c3fa8, emissiveIntensity: 0.16 })
      );
      bridge.position.set(Math.cos(angle) * 8.5, 0.6, Math.sin(angle) * 8.5);
      bridge.rotation.y = -angle;
      scene.add(bridge);
    }

    var portals = [];
    var labels = [];
    var portalMeshes = [];
    var handlers = [];
    var nodes = Array.prototype.slice.call(root.querySelectorAll('[data-portal]'));
    if (!nodes.length) nodes = [
      { dataset: { portal: 'shop', name: 'SHOP', tagline: 'Descubre', status: 'DISPONIBLE', color: '#8b5cf6', href: '/shop', available: '1' } },
      { dataset: { portal: 'play', name: 'PLAY', tagline: 'Juega', status: 'DISPONIBLE', color: '#f472b6', href: '/play', available: '1' } },
      { dataset: { portal: 'whatif', name: 'WHAT IF', tagline: 'Imagina', status: 'Planeado', color: '#8b7cff', href: '/universos/whatif', available: '0' } },
      { dataset: { portal: 'labs', name: 'LABS', tagline: 'Experimenta', status: 'Planeado', color: '#2dd4bf', href: '/universos/labs', available: '0' } }
    ];

    nodes.forEach(function (node, index) {
      var data = node.dataset;
      var shade = colorOf(data.color);
      var angle = -Math.PI / 2 + (index / nodes.length) * Math.PI * 2;
      var group = new THREE.Group();
      group.position.set(Math.cos(angle) * 24, 3.5 + (index % 2) * 2, Math.sin(angle) * 24);
      group.lookAt(0, 5, 0);

      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(4.3, 0.36, 10, quality === 'low' ? 32 : 56),
        new THREE.MeshStandardMaterial({ color: 0x151234, metalness: 0.9, roughness: 0.18, emissive: shade, emissiveIntensity: 0.7 })
      );
      ring.userData.portalIndex = index;
      group.add(ring);
      portalMeshes.push(ring);

      var membrane = new THREE.Mesh(
        new THREE.CircleGeometry(4.05, 48),
        new THREE.MeshBasicMaterial({ color: shade, transparent: true, opacity: 0.24, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      membrane.position.z = 0.06;
      group.add(membrane);

      var halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: O.glowTexture(), color: shade, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      halo.scale.set(15, 15, 1);
      halo.position.z = -0.4;
      group.add(halo);

      var base = new THREE.Mesh(
        new THREE.CylinderGeometry(5, 6, 1, 8),
        new THREE.MeshStandardMaterial({ color: 0x0e0c25, metalness: 0.85, roughness: 0.35, emissive: shade, emissiveIntensity: 0.12 })
      );
      base.position.set(group.position.x, -0.8, group.position.z);
      base.rotation.y = -angle;
      scene.add(base);
      scene.add(group);

      var label = document.createElement('button');
      label.type = 'button';
      label.className = 'universe-label';
      label.innerHTML = '<span class="universe-label__state">' + (data.status || 'UNIVERSO') + '</span>' +
        '<strong>' + (data.name || 'UNIVERSO') + '</strong>' +
        '<small>' + (data.tagline || '') + '</small>';
      label.setAttribute('aria-label', 'Cruzar portal ' + (data.name || ''));
      label.addEventListener('click', function () { select(index); activate(index); });
      app.labelLayer.appendChild(label);
      if (node && node.addEventListener) {
        var nodeHandler = function () { select(index); activate(index); };
        node.addEventListener('click', nodeHandler);
        handlers.push([node, 'click', nodeHandler]);
      }

      var anchor = group.position.clone().add(new THREE.Vector3(0, 6.4, 0));
      labels.push({ element: label, position: anchor });
      portals.push({ node: node, data: data, group: group, ring: ring, membrane: membrane, halo: halo, shade: shade, angle: angle, label: label });
    });
    app.registerLabels(labels);

    var vehicles = [];
    for (var v = 0; v < (quality === 'low' ? 3 : 7); v += 1) {
      var craft = makeVehicle(v % 2 ? 0x67e8f9 : 0xf472b6);
      var radius = 16 + (v % 3) * 4;
      craft.userData = { radius: radius, speed: 0.11 + (v % 4) * 0.025, phase: v * 0.9, height: 9 + (v % 3) * 3 };
      scene.add(craft);
      vehicles.push(craft);
    }

    var dossier = root.querySelector('[data-dossier]');
    var dossierState = root.querySelector('[data-dossier-state]');
    var dossierName = root.querySelector('[data-dossier-name]');
    var dossierTagline = root.querySelector('[data-dossier-tagline]');
    var dossierText = root.querySelector('[data-dossier-description]');
    var dossierCta = root.querySelector('[data-dossier-cta]');
    var dossierDialog = root.querySelector('[data-dossier-dialog]');
    var selected = 0;
    var tour = !reduced;
    var orbit = 0;
    var cameraTarget = new THREE.Vector3(0, 5, 0);
    var raycaster = new THREE.Raycaster();
    var pointerVector = new THREE.Vector2();

    function listen(element, event, handler) {
      if (!element) return;
      element.addEventListener(event, handler);
      handlers.push([element, event, handler]);
    }

    function openDialog(code) {
      var dialog = document.querySelector('[data-dialog="' + code + '"][role="dialog"]');
      if (!dialog) { app.notify('Este universo está en diseño. Consulta su dossier.'); return; }
      dialog.hidden = false;
      Array.prototype.forEach.call(dialog.querySelectorAll('[data-close]'), function (button) {
        button.addEventListener('click', function () { dialog.hidden = true; }, { once: true });
      });
    }

    function activate(index) {
      var portal = portals[index];
      if (!portal) return;
      var href = portal.data.href || '/universos/' + portal.data.portal;
      app.audio.portal();
      if (portal.data.available === '1') {
        app.navigate(href, portal.data.portal === 'play' ? 'play' : null);
      } else {
        app.notify(portal.data.name + ' · Planeado. Sin funcionalidades activas.');
        openDialog(portal.data.portal);
      }
    }

    function select(index) {
      selected = (index + portals.length) % portals.length;
      portals.forEach(function (portal, i) {
        var active = i === selected;
        portal.ring.material.emissiveIntensity = active ? 1.5 : 0.55;
        portal.membrane.material.opacity = active ? 0.42 : 0.18;
        portal.halo.material.opacity = active ? 0.8 : 0.36;
        portal.label.classList.toggle('is-active', active);
      });
      var data = portals[selected].data;
      if (dossier) dossier.hidden = false;
      if (dossierState) dossierState.textContent = 'UNIVERSO ' + (data.order || String(selected + 1).padStart(2, '0')) + ' · ' + (data.status || 'UNIVERSO');
      if (dossierName) dossierName.textContent = data.name || 'UNIVERSO';
      if (dossierTagline) dossierTagline.textContent = data.tagline || '';
      if (dossierText) dossierText.textContent = data.description || '';
      if (dossierCta) {
        dossierCta.hidden = data.available !== '1' || data.portal === 'play';
        dossierCta.setAttribute('href', data.href || '/shop');
      }
      if (dossierDialog) dossierDialog.hidden = data.available !== '0';
      if (dossierDialog) dossierDialog.setAttribute('data-dialog', data.portal || 'whatif');
      root.setAttribute('data-warp-color', data.color || '#8b5cf6');
    }

    listen(root.querySelector('[data-tour-toggle]'), 'click', function () {
      tour = !tour;
      this.setAttribute('aria-label', tour ? 'Pausar recorrido' : 'Reanudar recorrido');
    });
    listen(root.querySelector('[data-tour-overview]'), 'click', function () {
      orbit = 0;
      select(0);
    });
    listen(root.querySelector('[data-show-universes]'), 'click', function (event) {
      event.preventDefault();
      var index = root.querySelector('.universe-index');
      if (index) index.classList.add('is-open');
    });
    listen(global, 'keydown', function (event) {
      if (event.code === 'ArrowRight') select(selected + 1);
      if (event.code === 'ArrowLeft') select(selected - 1);
      if (event.code === 'Enter' && !event.repeat) activate(selected);
    });

    select(0);

    return {
      warpColor: portals[0].data.color || '#8b5cf6',
      update: function (delta, elapsed) {
        if (tour && !reduced) orbit += delta * 0.055;
        core.rotation.y += delta * 0.16;
        core.rotation.x += delta * 0.07;
        coreGlow.material.opacity = 0.32 + Math.sin(elapsed * 1.4) * 0.1;
        dust.rotation.y += delta * 0.012;

        portals.forEach(function (portal, index) {
          portal.membrane.material.opacity = (index === selected ? 0.38 : 0.16) + Math.sin(elapsed * 2 + index) * 0.05;
          portal.ring.rotation.z += delta * (index === selected ? 0.32 : 0.11);
        });

        vehicles.forEach(function (craft) {
          var data = craft.userData;
          var angle = elapsed * data.speed + data.phase;
          craft.position.set(Math.cos(angle) * data.radius, data.height + Math.sin(elapsed * 0.7 + data.phase) * 0.5, Math.sin(angle) * data.radius);
          craft.rotation.y = -angle;
        });

        var targetPortal = portals[selected];
        var desiredCamera = new THREE.Vector3(
          Math.sin(orbit) * 46 + app.input.pointer.x * 4,
          17 + app.input.pointer.y * -3,
          Math.cos(orbit) * 46
        );
        if (!reduced) {
          cameraTarget.lerp(targetPortal.group.position.clone().multiplyScalar(0.16).add(new THREE.Vector3(0, 5, 0)), 0.045);
          app.camera.position.lerp(desiredCamera, 0.035);
          app.camera.lookAt(cameraTarget);
        } else {
          app.camera.position.set(0, 18, 48);
          app.camera.lookAt(0, 5, 0);
        }

        var click = app.input.consumeClick();
        if (click) {
          pointerVector.set(click.x, click.y);
          raycaster.setFromCamera(pointerVector, app.camera);
          var hits = raycaster.intersectObjects(portalMeshes, false);
          if (hits.length) {
            var hitIndex = hits[0].object.userData.portalIndex;
            select(hitIndex);
            activate(hitIndex);
          }
        }
        var wheel = app.input.consumeWheel();
        if (wheel) {
          app.camera.fov = clamp(app.camera.fov + wheel * 0.012, 38, 72);
          app.camera.updateProjectionMatrix();
        }
      },
      dispose: function () {
        handlers.forEach(function (entry) { entry[0].removeEventListener(entry[1], entry[2]); });
      }
    };
  }

  O.registerScene('hub', createHub);
})(window);
