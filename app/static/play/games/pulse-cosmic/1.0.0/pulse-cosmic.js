(function (global) {
  'use strict';
  var GK = global.OTRAVERSO && global.OTRAVERSO.GAMEKIT;
  if (!GK) return;

  function rand(a, b) { return a + Math.random() * (b - a); }

  GK.register({
    id: 'pulse-cosmic',
    name: 'PULSE COSMIC',
    version: '1.0.0',
    create: function (api) {
      return { t: 0, score: 0, combo: 0, bestCombo: 0, hits: 0, misses: 0, over: false, rings: [], energy: 100 };
    },
    reset: function (state, api) {
      state.t = 0;
      state.score = 0;
      state.combo = 0;
      state.bestCombo = 0;
      state.hits = 0;
      state.misses = 0;
      state.over = false;
      state.rings = [];
      state.energy = 100;
      var i;
      for (i = 0; i < 3; i++) state.rings.push(makeRing(state, api, i));
    },
    update: function (state, dt, api) {
      if (state.over) return;
      state.t += dt;
      var i;
      for (i = 0; i < state.rings.length; i++) {
        var r = state.rings[i];
        r.phase += dt * r.speed;
        if (r.phase > Math.PI * 2) r.phase -= Math.PI * 2;
      }
      state.energy = Math.max(0, state.energy - dt * (4 + state.t * 0.15));
      if (state.energy <= 0) {
        state.over = true;
        api.sound('fail');
        api.finish({ title: 'ENERGÍA AGOTADA', score: state.score, durationMs: Math.round(state.t * 1000), stats: { hits: state.hits, misses: state.misses, combo: state.bestCombo }, success: state.score >= 150 });
      }
      if (state.t > 10 + state.rings.length * 8 && state.rings.length < 5) {
        state.rings.push(makeRing(state, api, state.rings.length));
      }
    },
    draw: function (state, ctx, api) {
      var w = api.width;
      var h = api.height;
      var cx = w / 2;
      var cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      var bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.7);
      bg.addColorStop(0, '#10163a');
      bg.addColorStop(1, '#040510');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.fillStyle = '#0b1028';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PULSE', cx, cy);
      var i;
      for (i = 0; i < state.rings.length; i++) {
        var r = state.rings[i];
        ctx.beginPath();
        ctx.arc(cx, cy, r.radius, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(120,160,255,0.35)';
        ctx.stroke();
        var winStart = r.target - r.window / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r.radius, winStart, winStart + r.window);
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(120,255,200,0.8)';
        ctx.stroke();
        var mx = cx + Math.cos(r.phase) * r.radius;
        var my = cy + Math.sin(r.phase) * r.radius;
        ctx.beginPath();
        ctx.arc(mx, my, r.marker, 0, Math.PI * 2);
        ctx.fillStyle = r.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      var barW = Math.min(240, w * 0.5);
      var barX = (w - barW) / 2;
      var barY = h - 28;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(barX, barY, barW, 8);
      ctx.fillStyle = state.energy > 30 ? '#67f3a6' : '#ff6b6b';
      ctx.fillRect(barX, barY, barW * (state.energy / 100), 8);
      ctx.textBaseline = 'alphabetic';
    },
    pointer: function (state, x, y, api) {
      if (state.over) return;
      var best = null;
      var bestDiff = 1e9;
      var i;
      for (i = 0; i < state.rings.length; i++) {
        var r = state.rings[i];
        var diff = angleDiff(r.phase, r.target);
        if (diff < bestDiff) { bestDiff = diff; best = r; }
      }
      if (!best) return;
      if (bestDiff <= best.window / 2) {
        state.combo += 1;
        if (state.combo > state.bestCombo) state.bestCombo = state.combo;
        var mult = 1 + Math.min(4, Math.floor(state.combo / 3));
        var gained = 10 * mult;
        state.score += gained;
        state.hits += 1;
        state.energy = api.clamp(state.energy + 8 + mult, 0, 100);
        best.target = Math.random() * Math.PI * 2;
        best.speed = Math.min(4.2, best.speed * 1.03 + 0.02);
        best.window = Math.max(0.35, best.window * 0.985);
        best.marker = Math.max(6, best.marker - 0.05);
        api.sound(state.combo % 3 === 0 ? 'combo' : 'score');
      } else {
        state.combo = 0;
        state.misses += 1;
        state.energy = api.clamp(state.energy - 10, 0, 100);
        api.sound('hit');
      }
    },
    key: function (state, code, down, api) {
      if (down && (code === 'Space' || code === 'Enter')) {
        this.pointer(state, api.width / 2, api.height / 2, api);
      }
    },
    hud: function (state) {
      return { score: state.score, time: Math.floor(state.energy) + '%', extra: 'Combo x' + state.combo };
    },
    result: function (state) {
      return { title: 'ENERGÍA AGOTADA', score: state.score, durationMs: Math.round(state.t * 1000), stats: { hits: state.hits, misses: state.misses, combo: state.bestCombo }, success: state.score >= 150 };
    }
  });

  function angleDiff(a, b) {
    var d = Math.abs(a - b) % (Math.PI * 2);
    return d > Math.PI ? (Math.PI * 2 - d) : d;
  }

  function makeRing(state, api, i) {
    var baseR = Math.min(api.width, api.height) * (0.18 + i * 0.12);
    return {
      radius: baseR,
      phase: Math.random() * Math.PI * 2,
      speed: 1.1 + i * 0.35 + Math.random() * 0.4,
      target: Math.random() * Math.PI * 2,
      window: Math.max(0.45, 1.1 - i * 0.12),
      marker: 8,
      color: ['#7cf7ff', '#ffd166', '#ff7ad9', '#b0ff72', '#ffa86b'][i % 5]
    };
  }
})(window);
