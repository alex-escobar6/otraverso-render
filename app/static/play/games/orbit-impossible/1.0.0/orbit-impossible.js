(function (global) {
  'use strict';
  var GK = global.OTRAVERSO && global.OTRAVERSO.GAMEKIT;
  if (!GK) return;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeSat(radius, angle, speed, color) {
    return { r: radius, a: angle, s: speed, color: color, trail: [] };
  }

  GK.register({
    id: 'orbit-impossible',
    name: 'ORBIT IMPOSSIBLE',
    version: '1.0.0',
    create: function (api) {
      return { sats: [], selected: 0, score: 0, time: 0, stable: 0, over: false, level: 1, spawnTimer: 0 };
    },
    reset: function (state, api) {
      var base = Math.min(api.width, api.height);
      state.sats = [
        makeSat(base * 0.18, 0, 1.1, '#7cf7ff'),
        makeSat(base * 0.28, Math.PI, -0.8, '#ffd166'),
        makeSat(base * 0.36, Math.PI / 2, 0.6, '#ff7ad9')
      ];
      state.selected = 0;
      state.score = 0;
      state.time = 0;
      state.stable = 0;
      state.over = false;
      state.level = 1;
      state.spawnTimer = 12;
    },
    update: function (state, dt, api) {
      if (state.over) return;
      state.time += dt;
      state.level = 1 + Math.floor(state.time / 15);
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && state.sats.length < 6) {
        state.spawnTimer = Math.max(8, 14 - state.level);
        var base = Math.min(api.width, api.height);
        var r = base * rand(0.14, 0.4);
        state.sats.push(makeSat(r, rand(0, Math.PI * 2), rand(0.4, 1.3) * (Math.random() < 0.5 ? 1 : -1), pickColor(state.sats.length)));
      }
      var i, j;
      for (i = 0; i < state.sats.length; i++) {
        var s = state.sats[i];
        s.a += s.s * dt;
        if (s.a > Math.PI * 2) s.a -= Math.PI * 2;
        if (s.a < -Math.PI * 2) s.a += Math.PI * 2;
      }
      var danger = false;
      for (i = 0; i < state.sats.length; i++) {
        for (j = i + 1; j < state.sats.length; j++) {
          var a = posOf(state.sats[i], api);
          var b = posOf(state.sats[j], api);
          var dx = a.x - b.x;
          var dy = a.y - b.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          var minD = 22;
          if (d < minD) {
            state.over = true;
            api.sound('hit');
            api.finish({ title: 'COLISIÓN ORBITAL', score: state.score, durationMs: Math.round(state.time * 1000), stats: { level: state.level, stable: Math.floor(state.stable) + 's', sats: state.sats.length }, success: false });
            return;
          }
          if (d < 42) danger = true;
        }
      }
      if (!danger) {
        state.stable += dt;
        state.score += Math.floor(dt * (10 * state.sats.length + state.level * 5));
      } else {
        state.stable = Math.max(0, state.stable - dt * 0.5);
      }
      state.score += Math.floor(dt * 2);
    },
    draw: function (state, ctx, api) {
      var w = api.width;
      var h = api.height;
      var cx = w / 2;
      var cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#050814';
      ctx.fillRect(0, 0, w, h);
      var i;
      for (i = 0; i < 80; i++) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.1 + (i % 5) * 0.1) + ')';
        ctx.fillRect((i * 97) % w, (i * 53) % h, 1 + (i % 2), 1 + (i % 2));
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe29a';
      ctx.fill();
      for (i = 0; i < state.sats.length; i++) {
        var s = state.sats[i];
        ctx.beginPath();
        ctx.arc(cx, cy, s.r, 0, Math.PI * 2);
        ctx.lineWidth = (i === state.selected) ? 2.5 : 1;
        ctx.strokeStyle = (i === state.selected) ? 'rgba(255,255,255,0.8)' : 'rgba(120,150,255,0.25)';
        ctx.stroke();
        var p = posOf(s, api);
        ctx.beginPath();
        ctx.arc(p.x, p.y, (i === state.selected) ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = (i === state.selected) ? 2 : 1;
        ctx.stroke();
      }
      ctx.fillStyle = '#dfeaff';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Toca un satélite para seleccionarlo', w / 2, h - 18);
    },
    pointer: function (state, x, y, api) {
      if (state.over) return;
      var i, hit = -1;
      for (i = 0; i < state.sats.length; i++) {
        var p = posOf(state.sats[i], api);
        var dx = x - p.x;
        var dy = y - p.y;
        if (dx * dx + dy * dy <= 20 * 20) { hit = i; break; }
      }
      if (hit >= 0) {
        state.selected = hit;
        api.sound('tick');
        return;
      }
      var s = state.sats[state.selected];
      if (!s) return;
      var cx = api.width / 2;
      var cy = api.height / 2;
      var nr = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      var minR = Math.min(api.width, api.height) * 0.1;
      var maxR = Math.min(api.width, api.height) * 0.45;
      s.r = api.clamp(nr, minR, maxR);
      s.s *= -1;
      s.s += (s.s > 0 ? 0.08 : -0.08);
      if (Math.abs(s.s) < 0.3) s.s = s.s < 0 ? -0.3 : 0.3;
      if (Math.abs(s.s) > 2.2) s.s = s.s < 0 ? -2.2 : 2.2;
      api.sound('score');
    },
    key: function (state, code, down, api) {
      if (!down || state.over) return;
      if (code === 'ArrowLeft' || code === 'KeyA') { state.selected = (state.selected - 1 + state.sats.length) % state.sats.length; api.sound('tick'); }
      else if (code === 'ArrowRight' || code === 'KeyD') { state.selected = (state.selected + 1) % state.sats.length; api.sound('tick'); }
      else if (code === 'ArrowUp' || code === 'KeyW') { var s1 = state.sats[state.selected]; s1.r = api.clamp(s1.r + 12, 30, Math.min(api.width, api.height) * 0.46); }
      else if (code === 'ArrowDown' || code === 'KeyS') { var s2 = state.sats[state.selected]; s2.r = api.clamp(s2.r - 12, 30, Math.min(api.width, api.height) * 0.46); }
      else if (code === 'Space' || code === 'Enter') { var s3 = state.sats[state.selected]; s3.s *= -1; api.sound('score'); }
    },
    hud: function (state) {
      return { score: state.score, time: Math.floor(state.stable) + 's est.', extra: 'Nivel ' + state.level };
    },
    result: function (state) {
      return { title: 'COLISIÓN ORBITAL', score: state.score, durationMs: Math.round(state.time * 1000), stats: { level: state.level, stable: Math.floor(state.stable) + 's', sats: state.sats.length }, success: false };
    }
  });

  function posOf(s, api) {
    var cx = api.width / 2;
    var cy = api.height / 2;
    return { x: cx + Math.cos(s.a) * s.r, y: cy + Math.sin(s.a) * s.r };
  }
  function pickColor(i) {
    var c = ['#7cf7ff', '#ffd166', '#ff7ad9', '#7cff6b', '#ffa86b', '#c79cff'];
    return c[i % c.length];
  }
})(window);
