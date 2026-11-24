(function (global) {
  'use strict';
  var GK = global.OTRAVERSO && global.OTRAVERSO.GAMEKIT;
  if (!GK) return;

  function rand(a, b) { return a + Math.random() * (b - a); }

  GK.register({
    id: 'fracture-temporal',
    name: 'FRACTURE TEMPORAL',
    version: '1.0.0',
    create: function (api) {
      return { lanes: [], score: 0, time: 0, hits: 0, misses: 0, combo: 0, bestCombo: 0, level: 1, over: false, flash: 0, flashGood: false };
    },
    reset: function (state, api) {
      state.lanes = [makeLane(0), makeLane(1), makeLane(2)];
      state.score = 0;
      state.time = 0;
      state.hits = 0;
      state.misses = 0;
      state.combo = 0;
      state.bestCombo = 0;
      state.level = 1;
      state.over = false;
      state.flash = 0;
      state.flashGood = false;
    },
    update: function (state, dt, api) {
      if (state.over) return;
      state.time += dt;
      state.level = 1 + Math.floor(state.time / 12);
      if (state.flash > 0) state.flash -= dt;
      var baseSpeed = 0.55 + state.level * 0.08;
      var i;
      for (i = 0; i < state.lanes.length; i++) {
        var l = state.lanes[i];
        l.pos += dt * baseSpeed * l.speedMul;
        if (l.pos >= 1) {
          l.pos -= 1;
          if (!l.resolved) {
            state.misses += 1;
            state.combo = 0;
            state.flash = 0.2;
            state.flashGood = false;
            api.sound('fail');
          }
          l.resolved = false;
          l.window = Math.max(0.06, 0.14 - state.level * 0.008);
        }
      }
      var limit = 60;
      var failLimit = 6 + Math.floor(state.level / 2);
      if (state.misses >= failLimit || state.time >= limit) {
        state.over = true;
        var success = state.score >= 200 && state.misses < failLimit;
        api.sound(success ? 'win' : 'fail');
        api.finish({ title: state.time >= limit ? 'TIEMPO COMPLETADO' : 'DESINCRONIZACIÓN', score: state.score, durationMs: Math.round(state.time * 1000), stats: { hits: state.hits, misses: state.misses, combo: state.bestCombo }, success: success });
      }
    },
    draw: function (state, ctx, api) {
      var w = api.width;
      var h = api.height;
      ctx.clearRect(0, 0, w, h);
      var bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0b0820');
      bg.addColorStop(1, '#04030c');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      if (state.flash > 0) {
        ctx.fillStyle = state.flashGood ? 'rgba(100,255,180,' + (state.flash * 0.8) + ')' : 'rgba(255,80,100,' + (state.flash * 0.8) + ')';
        ctx.fillRect(0, 0, w, h);
      }
      var laneH = Math.min(90, (h - 100) / 3);
      var top = (h - laneH * 3 - 40) / 2 + 20;
      var i;
      var targetX = w * 0.75;
      for (i = 0; i < 3; i++) {
        var y = top + i * (laneH + 20);
        var l = state.lanes[i];
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        roundRect(ctx, 30, y, w - 60, laneH, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(120,255,200,0.22)';
        ctx.fillRect(targetX - l.window * (w - 80), y, l.window * 2 * (w - 80), laneH);
        ctx.strokeStyle = 'rgba(120,255,200,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(targetX, y);
        ctx.lineTo(targetX, y + laneH);
        ctx.stroke();
        var tx = 40 + l.pos * (w - 80);
        ctx.beginPath();
        ctx.arc(tx, y + laneH / 2, Math.min(18, laneH * 0.22), 0, Math.PI * 2);
        ctx.fillStyle = l.resolved ? 'rgba(180,180,180,0.5)' : l.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.fillStyle = '#dfeaff';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('T' + (i + 1), 40, y - 6);
      }
      ctx.fillStyle = '#dfeaff';
      ctx.textAlign = 'center';
      ctx.font = '14px sans-serif';
      ctx.fillText('Sincroniza las tres líneas temporales al cruzar la zona', w / 2, 26);
    },
    pointer: function (state, x, y, api) {
      if (state.over) return;
      var w = api.width;
      var h = api.height;
      var laneH = Math.min(90, (h - 100) / 3);
      var top = (h - laneH * 3 - 40) / 2 + 20;
      var i, laneIdx = -1;
      for (i = 0; i < 3; i++) {
        var ly = top + i * (laneH + 20);
        if (y >= ly && y <= ly + laneH) { laneIdx = i; break; }
      }
      if (laneIdx < 0) {
        var best = 1e9;
        for (i = 0; i < 3; i++) {
          var d = Math.abs(state.lanes[i].pos - 0.75);
          if (d < best) { best = d; laneIdx = i; }
        }
      }
      var l = state.lanes[laneIdx];
      if (!l || l.resolved) return;
      var diff = Math.abs(l.pos - 0.75);
      if (diff <= l.window) {
        l.resolved = true;
        state.hits += 1;
        state.combo += 1;
        if (state.combo > state.bestCombo) state.bestCombo = state.combo;
        var mult = 1 + Math.min(4, Math.floor(state.combo / 3));
        state.score += 20 * mult;
        state.flash = 0.15;
        state.flashGood = true;
        api.sound(state.combo % 3 === 0 ? 'combo' : 'score');
      } else {
        state.misses += 1;
        state.combo = 0;
        state.flash = 0.2;
        state.flashGood = false;
        api.sound('hit');
      }
    },
    key: function (state, code, down, api) {
      if (!down || state.over) return;
      var idx = -1;
      if (code === 'Digit1' || code === 'Numpad1' || code === 'KeyJ') idx = 0;
      else if (code === 'Digit2' || code === 'Numpad2' || code === 'KeyK') idx = 1;
      else if (code === 'Digit3' || code === 'Numpad3' || code === 'KeyL') idx = 2;
      else if (code === 'Space' || code === 'Enter') {
        var best = 1e9; var i;
        for (i = 0; i < 3; i++) { var d = Math.abs(state.lanes[i].pos - 0.75); if (d < best) { best = d; idx = i; } }
      }
      if (idx >= 0) {
        var h = api.height;
        var laneH = Math.min(90, (h - 100) / 3);
        var top = (h - laneH * 3 - 40) / 2 + 20;
        this.pointer(state, api.width / 2, top + idx * (laneH + 20) + laneH / 2, api);
      }
    },
    hud: function (state) {
      return { score: state.score, time: Math.max(0, Math.ceil(60 - state.time)) + 's', extra: 'Combo x' + state.combo };
    },
    result: function (state) {
      var success = state.score >= 200 && state.misses < (6 + Math.floor(state.level / 2));
      return { title: state.time >= 60 ? 'TIEMPO COMPLETADO' : 'DESINCRONIZACIÓN', score: state.score, durationMs: Math.round(state.time * 1000), stats: { hits: state.hits, misses: state.misses, combo: state.bestCombo }, success: success };
    }
  });

  function makeLane(i) {
    var colors = ['#7cf7ff', '#ffd166', '#ff7ad9'];
    return { pos: Math.random() * 0.6, speedMul: 0.85 + i * 0.12, color: colors[i], resolved: false, window: 0.13 };
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }
})(window);
