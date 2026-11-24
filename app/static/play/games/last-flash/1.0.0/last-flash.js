(function (global) {
  'use strict';
  var GK = global.OTRAVERSO && global.OTRAVERSO.GAMEKIT;
  if (!GK) return;

  function rand(a, b) { return a + Math.random() * (b - a); }

  GK.register({
    id: 'last-flash',
    name: 'LAST FLASH',
    version: '1.0.0',
    create: function (api) {
      return { px: 0, targetX: 0, speed: 320, left: false, right: false, barriers: [], spawn: 0, score: 0, time: 0, over: false, level: 1 };
    },
    reset: function (state, api) {
      state.px = api.width / 2;
      state.targetX = state.px;
      state.left = false;
      state.right = false;
      state.barriers = [];
      state.spawn = 0;
      state.score = 0;
      state.time = 0;
      state.over = false;
      state.level = 1;
    },
    update: function (state, dt, api) {
      if (state.over) return;
      var w = api.width;
      var h = api.height;
      state.time += dt;
      state.level = 1 + Math.floor(state.time / 8);
      state.score = Math.floor(state.time * 10) + state.level * 5;
      var move = 0;
      if (state.left) move -= 1;
      if (state.right) move += 1;
      if (move !== 0) {
        state.px += move * state.speed * dt;
        state.targetX = state.px;
      } else {
        var dx = state.targetX - state.px;
        state.px += dx * Math.min(1, dt * 6);
      }
      var pr = 14;
      state.px = api.clamp(state.px, pr, w - pr);
      state.spawn -= dt;
      var interval = Math.max(0.28, 0.95 - state.level * 0.07);
      if (state.spawn <= 0) {
        state.spawn = interval;
        var count = Math.min(4, 1 + Math.floor(state.level / 2));
        var j;
        for (j = 0; j < count; j++) {
          var bw = rand(40, 120) + state.level * 4;
          var gap = Math.random() < 0.35;
          state.barriers.push({
            x: rand(0, Math.max(0, w - bw)),
            y: -30 - j * rand(20, 60),
            w: gap ? rand(30, 60) : bw,
            h: rand(14, 26),
            vy: rand(120, 180) + state.level * 18,
            hue: rand(0, 360)
          });
        }
      }
      var py = h - 50;
      var i;
      for (i = state.barriers.length - 1; i >= 0; i--) {
        var b = state.barriers[i];
        b.y += b.vy * dt;
        if (b.y > h + 40) { state.barriers.splice(i, 1); continue; }
        if (state.px + pr > b.x && state.px - pr < b.x + b.w && py + pr > b.y && py - pr < b.y + b.h) {
          state.over = true;
          api.sound('hit');
          api.finish({ title: 'IMPACTO', score: state.score, durationMs: Math.round(state.time * 1000), stats: { survived: state.time.toFixed(1) + 's', level: state.level }, success: false });
          return;
        }
      }
    },
    draw: function (state, ctx, api) {
      var w = api.width;
      var h = api.height;
      ctx.clearRect(0, 0, w, h);
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#120018');
      g.addColorStop(1, '#05020b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      var i;
      for (i = 0; i < 40; i++) {
        var y = (i * 37 + (state.time * 120)) % h;
        ctx.fillStyle = 'rgba(255,80,160,' + (0.05 + (i % 4) * 0.03) + ')';
        ctx.fillRect((i * 83) % w, y, 2, 12);
      }
      for (i = 0; i < state.barriers.length; i++) {
        var b = state.barriers[i];
        ctx.fillStyle = 'hsla(' + b.hue + ',90%,60%,0.85)';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
      var py = h - 50;
      ctx.beginPath();
      ctx.arc(state.px, py, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#7ef9ff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(state.px, py - 22);
      ctx.lineTo(state.px - 8, py - 10);
      ctx.lineTo(state.px + 8, py - 10);
      ctx.closePath();
      ctx.fillStyle = '#ffd36e';
      ctx.fill();
    },
    pointer: function (state, x, y, api) {
      state.targetX = x;
    },
    key: function (state, code, down, api) {
      if (code === 'ArrowLeft' || code === 'KeyA') state.left = down;
      if (code === 'ArrowRight' || code === 'KeyD') state.right = down;
    },
    hud: function (state) {
      return { score: state.score, time: state.time.toFixed(1) + 's', extra: 'Nivel ' + state.level };
    },
    result: function (state) {
      return { title: 'IMPACTO', score: state.score, durationMs: Math.round(state.time * 1000), stats: { survived: state.time.toFixed(1) + 's', level: state.level }, success: false };
    }
  });
})(window);
