(function (global) {
  'use strict';
  var GK = global.OTRAVERSO && global.OTRAVERSO.GAMEKIT;
  if (!GK) return;

  function makeGrid(cols, rows) {
    var g = [];
    var y, x;
    for (y = 0; y < rows; y++) {
      var row = [];
      for (x = 0; x < cols; x++) row.push(1);
      g.push(row);
    }
    var stack = [{ x: 1, y: 1 }];
    g[1][1] = 0;
    var dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var opts = [];
      for (var i = 0; i < dirs.length; i++) {
        var nx = cur.x + dirs[i][0];
        var ny = cur.y + dirs[i][1];
        if (ny > 0 && ny < rows - 1 && nx > 0 && nx < cols - 1 && g[ny][nx] === 1) opts.push({ x: nx, y: ny, dx: dirs[i][0] / 2, dy: dirs[i][1] / 2 });
      }
      if (!opts.length) { stack.pop(); continue; }
      var pick = opts[Math.floor(Math.random() * opts.length)];
      g[cur.y + pick.dy][cur.x + pick.dx] = 0;
      g[pick.y][pick.x] = 0;
      stack.push({ x: pick.x, y: pick.y });
    }
    return g;
  }

  function randEmpty(grid) {
    var tries = 0;
    while (tries++ < 500) {
      var y = 1 + Math.floor(Math.random() * (grid.length - 2));
      var x = 1 + Math.floor(Math.random() * (grid[0].length - 2));
      if (grid[y][x] === 0) return { x: x, y: y };
    }
    return { x: 1, y: 1 };
  }

  function buildLevel(level) {
    var cols = 11 + Math.min(8, level * 2);
    var rows = 11 + Math.min(8, level * 2);
    if (cols % 2 === 0) cols++;
    if (rows % 2 === 0) rows++;
    var grid = makeGrid(cols, rows);
    var player = { x: 1, y: 1 };
    grid[1][1] = 0;
    var exit = { x: cols - 2, y: rows - 2 };
    grid[exit.y][exit.x] = 0;
    var portals = [];
    var count = 2 + Math.min(2, level);
    var i, a, b;
    for (i = 0; i < count; i++) {
      a = randEmpty(grid); b = randEmpty(grid);
      if ((a.x === player.x && a.y === player.y) || (b.x === player.x && b.y === player.y)) continue;
      portals.push({ x: a.x, y: a.y, tx: b.x, ty: b.y, color: portalColor(i) });
      portals.push({ x: b.x, y: b.y, tx: a.x, ty: a.y, color: portalColor(i) });
    }
    var timeLimit = Math.max(20, 45 - level * 4);
    return { cols: cols, rows: rows, grid: grid, player: player, exit: exit, portals: portals, time: timeLimit, timeLimit: timeLimit, shiftTimer: Math.max(3.5, 7 - level * 0.5) };
  }

  function portalColor(i) {
    var c = ['#7cf7ff', '#ff7ad9', '#ffd166', '#7cff6b'];
    return c[i % c.length];
  }

  GK.register({
    id: 'labyrinth-dimensional',
    name: 'LABYRINTH DIMENSIONAL',
    version: '1.0.0',
    create: function (api) {
      return { level: 1, world: null, score: 0, over: false, won: false };
    },
    reset: function (state, api) {
      state.level = 1;
      state.score = 0;
      state.over = false;
      state.won = false;
      state.world = buildLevel(state.level);
    },
    update: function (state, dt, api) {
      if (state.over) return;
      var w = state.world;
      w.time -= dt;
      w.shiftTimer -= dt;
      if (w.shiftTimer <= 0) {
        w.shiftTimer = Math.max(3.5, 7 - state.level * 0.5);
        shiftMaze(w);
        api.sound('tick');
      }
      if (w.time <= 0) {
        w.time = 0;
        state.over = true;
        api.sound('fail');
        api.finish({ title: 'TIEMPO AGOTADO', score: state.score, durationMs: 0, stats: { level: state.level }, success: false });
      }
    },
    draw: function (state, ctx, api) {
      var W = api.width;
      var H = api.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#070a14';
      ctx.fillRect(0, 0, W, H);
      var w = state.world;
      var cell = Math.floor(Math.min((W - 20) / w.cols, (H - 60) / w.rows));
      if (cell < 6) cell = 6;
      var ox = Math.floor((W - cell * w.cols) / 2);
      var oy = Math.floor((H - cell * w.rows) / 2 + 10);
      var y, x;
      for (y = 0; y < w.rows; y++) {
        for (x = 0; x < w.cols; x++) {
          if (w.grid[y][x] === 1) {
            ctx.fillStyle = '#1a2340';
            ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
          } else {
            ctx.fillStyle = '#0d1224';
            ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
          }
        }
      }
      var i;
      for (i = 0; i < w.portals.length; i++) {
        var p = w.portals[i];
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(ox + p.x * cell + cell / 2, oy + p.y * cell + cell / 2, cell * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = '#67f3a6';
      ctx.fillRect(ox + w.exit.x * cell + cell * 0.2, oy + w.exit.y * cell + cell * 0.2, cell * 0.6, cell * 0.6);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox + w.player.x * cell + cell / 2, oy + w.player.y * cell + cell / 2, cell * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9ad1ff';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Salida', ox + w.exit.x * cell - 6, oy + w.exit.y * cell - 6);
    },
    pointer: function (state, x, y, api) {
      if (state.over) return;
      var w = state.world;
      var W = api.width;
      var H = api.height;
      var cell = Math.floor(Math.min((W - 20) / w.cols, (H - 60) / w.rows));
      if (cell < 6) cell = 6;
      var ox = Math.floor((W - cell * w.cols) / 2);
      var oy = Math.floor((H - cell * w.rows) / 2 + 10);
      var gx = Math.floor((x - ox) / cell);
      var gy = Math.floor((y - oy) / cell);
      var dx = gx - w.player.x;
      var dy = gy - w.player.y;
      if (Math.abs(dx) + Math.abs(dy) !== 1) return;
      tryMove(state, dx, dy, api);
    },
    key: function (state, code, down, api) {
      if (!down || state.over) return;
      var dx = 0, dy = 0;
      if (code === 'ArrowUp' || code === 'KeyW') dy = -1;
      else if (code === 'ArrowDown' || code === 'KeyS') dy = 1;
      else if (code === 'ArrowLeft' || code === 'KeyA') dx = -1;
      else if (code === 'ArrowRight' || code === 'KeyD') dx = 1;
      else return;
      tryMove(state, dx, dy, api);
    },
    hud: function (state) {
      var t = state.world ? Math.ceil(state.world.time) : 0;
      return { score: state.score, time: t + 's', extra: 'Nivel ' + state.level };
    },
    result: function (state) {
      return { title: state.won ? 'LABERINTO COMPLETADO' : 'TIEMPO AGOTADO', score: state.score, durationMs: 0, stats: { level: state.level }, success: !!state.won };
    }
  });

  function tryMove(state, dx, dy, api) {
    var w = state.world;
    var nx = w.player.x + dx;
    var ny = w.player.y + dy;
    if (ny < 0 || ny >= w.rows || nx < 0 || nx >= w.cols) return;
    if (w.grid[ny][nx] === 1) { api.sound('tick'); return; }
    w.player.x = nx; w.player.y = ny;
    var i;
    for (i = 0; i < w.portals.length; i++) {
      var p = w.portals[i];
      if (p.x === nx && p.y === ny) {
        w.player.x = p.tx; w.player.y = p.ty;
        api.sound('special');
        break;
      }
    }
    if (w.player.x === w.exit.x && w.player.y === w.exit.y) {
      state.score += 100 * state.level + Math.floor(w.time * 5);
      if (state.level >= 4) {
        state.over = true;
        state.won = true;
        api.sound('win');
        api.finish({ title: 'LABERINTO COMPLETADO', score: state.score, durationMs: 0, stats: { level: state.level }, success: true });
      } else {
        state.level += 1;
        state.world = buildLevel(state.level);
        api.sound('success');
      }
    } else {
      api.sound('tick');
    }
  }

  function shiftMaze(w) {
    var tries = 0;
    while (tries++ < 20) {
      var y = 1 + Math.floor(Math.random() * (w.rows - 2));
      var x = 1 + Math.floor(Math.random() * (w.cols - 2));
      if ((x === w.player.x && y === w.player.y) || (x === w.exit.x && y === w.exit.y)) continue;
      var isPortal = false;
      for (var i = 0; i < w.portals.length; i++) {
        if (w.portals[i].x === x && w.portals[i].y === y) { isPortal = true; break; }
      }
      if (isPortal) continue;
      w.grid[y][x] = w.grid[y][x] === 1 ? 0 : 1;
      var walls = 0;
      if (w.grid[y - 1][x] === 1) walls++;
      if (w.grid[y + 1][x] === 1) walls++;
      if (w.grid[y][x - 1] === 1) walls++;
      if (w.grid[y][x + 1] === 1) walls++;
      if (walls >= 1 && walls <= 3) break;
      w.grid[y][x] = w.grid[y][x] === 1 ? 0 : 1;
    }
  }
})(window);
