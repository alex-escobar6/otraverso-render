(function (global) {
  'use strict';
  var GK = global.OTRAVERSO && global.OTRAVERSO.GAMEKIT;
  if (!GK) return;

  function randInt(n) { return Math.floor(Math.random() * n); }

  var PAD_DEFS = [
    { color: '#ff5d73', symbol: '▲' },
    { color: '#4dd6ff', symbol: '●' },
    { color: '#7cff6b', symbol: '■' },
    { color: '#ffd166', symbol: '◆' }
  ];

  function layout(api) {
    var w = api.width;
    var h = api.height;
    var size = Math.min(w, h) * 0.32;
    var cx = w / 2;
    var cy = h / 2 + h * 0.05;
    var gap = size * 0.12;
    var s = (size - gap) / 2;
    var pads = [];
    var positions = [
      { x: cx - s / 2 - gap / 2, y: cy - s / 2 - gap / 2 },
      { x: cx + s / 2 + gap / 2, y: cy - s / 2 - gap / 2 },
      { x: cx - s / 2 - gap / 2, y: cy + s / 2 + gap / 2 },
      { x: cx + s / 2 + gap / 2, y: cy + s / 2 + gap / 2 }
    ];
    var i;
    for (i = 0; i < 4; i++) {
      pads.push({ x: positions[i].x, y: positions[i].y, s: s, color: PAD_DEFS[i].color, symbol: PAD_DEFS[i].symbol });
    }
    return pads;
  }

  GK.register({
    id: 'echo-universe',
    name: 'ECHO UNIVERSE',
    version: '1.0.0',
    create: function (api) {
      return { pads: [], seq: [], input: 0, level: 1, score: 0, lives: 3, phase: 'show', showIndex: 0, showTimer: 0, showOn: false, flash: -1, flashTimer: 0, over: false, startDelay: 0 };
    },
    reset: function (state, api) {
      state.pads = layout(api);
      state.seq = [];
      state.input = 0;
      state.level = 1;
      state.score = 0;
      state.lives = 3;
      state.phase = 'show';
      state.showIndex = 0;
      state.showTimer = 0.6;
      state.showOn = false;
      state.flash = -1;
      state.flashTimer = 0;
      state.over = false;
      state.startDelay = 0.4;
      state.seq.push(randInt(4));
    },
    update: function (state, dt, api) {
      if (state.over) return;
      state.pads = layout(api);
      if (state.flashTimer > 0) {
        state.flashTimer -= dt;
        if (state.flashTimer <= 0) state.flash = -1;
      }
      if (state.startDelay > 0) {
        state.startDelay -= dt;
        return;
      }
      if (state.phase === 'show') {
        state.showTimer -= dt;
        if (state.showTimer <= 0) {
          if (!state.showOn) {
            if (state.showIndex >= state.seq.length) {
              state.phase = 'input';
              state.input = 0;
              state.showOn = false;
              return;
            }
            state.showOn = true;
            state.flash = state.seq[state.showIndex];
            state.flashTimer = Math.max(0.18, 0.45 - state.level * 0.02);
            state.showTimer = Math.max(0.22, 0.5 - state.level * 0.02);
            api.sound('tick');
          } else {
            state.showOn = false;
            state.showIndex += 1;
            state.showTimer = Math.max(0.12, 0.22 - state.level * 0.01);
          }
        }
      } else if (state.phase === 'gap') {
        state.showTimer -= dt;
        if (state.showTimer <= 0) {
          state.level += 1;
          state.seq.push(randInt(4));
          if (state.level % 2 === 0 && state.seq.length < 12) state.seq.push(randInt(4));
          state.phase = 'show';
          state.showIndex = 0;
          state.showOn = false;
          state.showTimer = 0.5;
        }
      }
    },
    draw: function (state, ctx, api) {
      var w = api.width;
      var h = api.height;
      ctx.clearRect(0, 0, w, h);
      var bg = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h));
      bg.addColorStop(0, '#1a1340');
      bg.addColorStop(1, '#070814');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#eaf2ff';
      ctx.textAlign = 'center';
      ctx.font = '16px sans-serif';
      var msg = state.phase === 'show' ? 'Memoriza la secuencia' : (state.phase === 'input' ? 'Repite la secuencia' : 'Nivel superado');
      ctx.fillText(msg, w / 2, Math.max(28, h * 0.12));
      var i;
      for (i = 0; i < state.pads.length; i++) {
        var p = state.pads[i];
        var active = (state.flash === i && (state.showOn || state.phase === 'input'));
        var x = p.x - p.s / 2;
        var y = p.y - p.s / 2;
        ctx.globalAlpha = active ? 1 : 0.55;
        ctx.fillStyle = p.color;
        roundRect(ctx, x, y, p.s, p.s, 16);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = active ? 4 : 2;
        ctx.strokeStyle = active ? '#ffffff' : 'rgba(255,255,255,0.4)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(10,10,20,0.7)';
        ctx.font = 'bold ' + Math.floor(p.s * 0.35) + 'px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.symbol, p.x, p.y + 2);
      }
      ctx.textBaseline = 'alphabetic';
    },
    pointer: function (state, x, y, api) {
      if (state.over || state.phase !== 'input') return;
      var i, hit = -1;
      for (i = 0; i < state.pads.length; i++) {
        var p = state.pads[i];
        if (x >= p.x - p.s / 2 && x <= p.x + p.s / 2 && y >= p.y - p.s / 2 && y <= p.y + p.s / 2) { hit = i; break; }
      }
      if (hit < 0) return;
      state.flash = hit;
      state.flashTimer = 0.18;
      var expect = state.seq[state.input];
      if (hit === expect) {
        state.input += 1;
        state.score += 10 * state.level;
        api.sound('score');
        if (state.input >= state.seq.length) {
          state.score += 25 * state.level;
          state.phase = 'gap';
          state.showTimer = 0.8;
          state.showOn = false;
          api.sound('success');
        }
      } else {
        state.lives -= 1;
        api.sound('fail');
        if (state.lives <= 0) {
          state.over = true;
          api.finish({ title: 'SECUENCIA PERDIDA', score: state.score, durationMs: 0, stats: { level: state.level, length: state.seq.length }, success: false });
        } else {
          state.phase = 'show';
          state.showIndex = 0;
          state.showOn = false;
          state.showTimer = 0.7;
          state.input = 0;
        }
      }
    },
    key: function (state, code, down, api) {
      if (!down || state.over || state.phase !== 'input') return;
      var map = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };
      if (map.hasOwnProperty(code)) {
        var p = state.pads[map[code]];
        if (p) this.pointer(state, p.x, p.y, api);
      }
    },
    hud: function (state) {
      return { score: state.score, time: 'Vidas ' + state.lives, extra: 'Nivel ' + state.level };
    },
    result: function (state) {
      return { title: 'SECUENCIA PERDIDA', score: state.score, durationMs: 0, stats: { level: state.level, length: state.seq.length }, success: false };
    }
  });

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
