(function (global) {
  'use strict';
  var GK = global.OTRAVERSO && global.OTRAVERSO.GAMEKIT;
  if (!GK) return;

  function rand(a, b) { return a + Math.random() * (b - a); }

  GK.register({
    id: 'star-hunter',
    name: 'STAR HUNTER',
    version: '1.0.0',
    create: function (api) {
      return { items: [], particles: [], score: 0, timeLeft: 32, wave: 1, spawnAcc: 0, over: false, collected: 0, specials: 0 };
    },
    reset: function (state, api) {
      state.items = [];
      state.particles = [];
      state.score = 0;
      state.timeLeft = 32;
      state.wave = 1;
      state.spawnAcc = 0;
      state.over = false;
      state.collected = 0;
      state.specials = 0;
      state.endTitle = '';
    },
    update: function (state, dt, api) {
      if (state.over) return;
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        state.over = true;
        state.endTitle = 'TIEMPO AGOTADO';
        api.finish({ title: state.endTitle, score: state.score, durationMs: 32000, stats: { wave: state.wave, collected: state.collected, specials: state.specials }, success: state.score >= 20 });
        return;
      }
      var w = api.width;
      var h = api.height;
      state.wave = 1 + Math.floor((32 - state.timeLeft) / 5);
      var rate = 0.85 - Math.min(0.45, state.wave * 0.07);
      state.spawnAcc += dt;
      while (state.spawnAcc >= rate) {
        state.spawnAcc -= rate;
        var special = Math.random() < Math.min(0.28, 0.1 + state.wave * 0.02);
        var r = special ? rand(14, 20) : rand(10, 18);
        state.items.push({
          x: rand(r, w - r),
          y: rand(r + 30, h - r),
          r: r,
          vx: rand(-20, 20) * (1 + state.wave * 0.05),
          vy: rand(-15, 15) * (1 + state.wave * 0.05),
          life: rand(2.2, 4.0) - state.wave * 0.08,
          maxLife: 3.2,
          special: special,
          hue: special ? rand(40, 60) : rand(180, 280)
        });
      }
      var i;
      for (i = state.items.length - 1; i >= 0; i--) {
        var it = state.items[i];
        it.life -= dt;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        if (it.x < it.r || it.x > w - it.r) it.vx *= -1;
        if (it.y < it.r || it.y > h - it.r) it.vy *= -1;
        it.x = api.clamp(it.x, it.r, w - it.r);
        it.y = api.clamp(it.y, it.r, h - it.r);
        if (it.life <= 0) state.items.splice(i, 1);
      }
      for (i = state.particles.length - 1; i >= 0; i--) {
        var p = state.particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.98;
        p.vy *= 0.98;
        if (p.life <= 0) state.particles.splice(i, 1);
      }
    },
    draw: function (state, ctx, api) {
      var w = api.width;
      var h = api.height;
      ctx.clearRect(0, 0, w, h);
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#050816');
      g.addColorStop(1, '#0b1028');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      var i;
      for (i = 0; i < 60; i++) {
        var sx = (i * 97 % w);
        var sy = (i * 53 % h);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + (i % 5) * 0.08) + ')';
        ctx.fillRect(sx, sy, (i % 3) + 1, (i % 3) + 1);
      }
      for (i = 0; i < state.items.length; i++) {
        var it = state.items[i];
        var alpha = api.clamp(it.life / 0.6, 0.2, 1);
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
        ctx.fillStyle = it.special ? 'rgba(255,210,80,' + alpha + ')' : 'hsla(' + it.hue + ',85%,65%,' + alpha + ')';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,' + (alpha * 0.6) + ')';
        ctx.stroke();
        if (it.special) {
          ctx.fillStyle = 'rgba(40,20,0,0.8)';
          ctx.font = 'bold ' + Math.max(10, it.r) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('3', it.x, it.y + 1);
        }
      }
      for (i = 0; i < state.particles.length; i++) {
        var p = state.particles[i];
        ctx.globalAlpha = api.clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    pointer: function (state, x, y, api) {
      if (state.over) return;
      var i;
      for (i = state.items.length - 1; i >= 0; i--) {
        var it = state.items[i];
        var dx = x - it.x;
        var dy = y - it.y;
        if (dx * dx + dy * dy <= it.r * it.r) {
          var val = it.special ? 3 : 1;
          state.score += val;
          state.collected += 1;
          if (it.special) state.specials += 1;
          var j;
          for (j = 0; j < 10; j++) {
            state.particles.push({
              x: it.x, y: it.y,
              vx: rand(-90, 90), vy: rand(-90, 90),
              r: rand(1.5, 3.5),
              life: rand(0.25, 0.6), max: 0.6,
              color: it.special ? '#ffd250' : 'hsl(' + it.hue + ',90%,70%)'
            });
          }
          state.items.splice(i, 1);
          api.sound(it.special ? 'special' : 'collect');
          break;
        }
      }
    },
    key: function (state, code, down, api) {},
    hud: function (state) {
      return { score: state.score, time: Math.ceil(state.timeLeft) + 's', extra: 'Oleada ' + state.wave };
    },
    result: function (state) {
      return { title: state.endTitle || 'CAZA FINALIZADA', score: state.score, durationMs: Math.round((32 - state.timeLeft) * 1000), stats: { wave: state.wave, collected: state.collected, specials: state.specials }, success: state.score >= 20 };
    }
  });
})(window);
