(function () {
  'use strict';

  const R = (window.CursorArcade = window.CursorArcade || {});
  R.games = R.games || {};

  const COLS = 10;
  const ROWS = 20;

  // Tetromino shapes, each as list of rotations. Each rotation is a 4x4 boolean matrix.
  // We store the minimum bounding coords offsets from origin.
  const SHAPES = {
    I: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]],
    ],
    O: [
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
    ],
    T: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]],
    ],
    S: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
    ],
    Z: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]],
    ],
    J: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]],
    ],
    L: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
  };

  const TYPES = Object.keys(SHAPES);

  // SRS wall-kick data (https://tetris.wiki/Super_Rotation_System).
  // Keyed by "<fromRot><toRot>": list of [dx, dy] offsets to try in order.
  // dy is positive-down in our grid (wiki uses positive-up), so signs are flipped.
  const KICKS_JLSTZ = {
    '01': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '10': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '12': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '21': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '23': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '32': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '30': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '03': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  };
  const KICKS_I = {
    '01': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '10': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '12': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '21': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '23': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '32': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '30': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '03': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  };

  // Standard Tetris scoring for lines
  const LINE_SCORES = [0, 100, 300, 500, 800];

  // Gravity in ms/row by level
  function gravityFor(level) {
    return Math.max(70, 800 - (level - 1) * 60);
  }

  R.games.blocks = {
    create(c) {
      return new BlocksGame(c);
    },
  };

  class BlocksGame {
    constructor({ host, api }) {
      this.api = api;
      this.host = host;

      this.wrap = document.createElement('div');
      this.wrap.style.display = 'flex';
      this.wrap.style.alignItems = 'center';
      this.wrap.style.justifyContent = 'center';
      this.wrap.style.gap = '24px';
      this.wrap.style.width = '100%';
      this.wrap.style.height = '100%';

      this.canvas = document.createElement('canvas');
      this.canvas.style.border = '1px solid var(--line-strong)';
      this.canvas.style.borderRadius = '4px';
      this.wrap.appendChild(this.canvas);

      this.side = document.createElement('div');
      this.side.style.display = 'flex';
      this.side.style.flexDirection = 'column';
      this.side.style.gap = '20px';
      this.side.style.fontFamily = 'var(--mono)';
      this.side.style.fontSize = '12px';
      this.side.style.color = 'var(--fg-soft)';
      this.side.innerHTML = `
        <div>
          <div style="text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Next</div>
          <canvas id="bl-next" width="120" height="120" style="border:1px solid var(--line-strong);border-radius:4px;"></canvas>
        </div>
        <div>
          <div style="text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Hold</div>
          <canvas id="bl-hold" width="120" height="120" style="border:1px solid var(--line-strong);border-radius:4px;"></canvas>
        </div>
        <div style="line-height:1.6;">
          <div style="text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;color:var(--fg-soft);">Controls</div>
          <div>← →&nbsp;&nbsp;move</div>
          <div>↓&nbsp;&nbsp;soft drop</div>
          <div>↑ / W / X&nbsp;&nbsp;rotate</div>
          <div>Z / Q&nbsp;&nbsp;rotate CCW</div>
          <div>Space&nbsp;&nbsp;hard drop</div>
          <div>C / Shift&nbsp;&nbsp;hold</div>
        </div>`;
      this.wrap.appendChild(this.side);
      host.appendChild(this.wrap);

      this.ctx = this.canvas.getContext('2d');
      this.nextCanvas = this.side.querySelector('#bl-next');
      this.nextCtx = this.nextCanvas.getContext('2d');
      this.holdCanvas = this.side.querySelector('#bl-hold');
      this.holdCtx = this.holdCanvas.getContext('2d');

      this._resize = this._resize.bind(this);
      window.addEventListener('resize', this._resize);

      this.api.setTopbarControls({ pause: true, restart: true });

      this.reset();
      this.loop = this.loop.bind(this);
      this.lastT = 0;
      this.acc = 0;
      this.rafId = requestAnimationFrame(this.loop);
    }

    reset() {
      this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.dead = false;
      this.paused = false;
      this.bag = [];
      this.nextQueue = [];
      this.hold = null;
      this.holdUsed = false;
      this.lockDelay = 0;
      this.softDropping = false;
      for (let i = 0; i < 5; i++) this.nextQueue.push(this.drawFromBag());
      this.spawn();
      this.api.hideOverlay();
      this._resize();
      this.updateStats();
    }

    drawFromBag() {
      if (this.bag.length === 0) {
        this.bag = TYPES.slice();
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      return this.bag.shift();
    }

    spawn(type) {
      const t = type || this.nextQueue.shift();
      this.nextQueue.push(this.drawFromBag());
      this.current = { type: t, rot: 0, x: 3, y: -1 };
      this.holdUsed = false;
      this.lockDelay = 0;
      if (this.collides(this.current, 0, 1)) {
        // Can't even drop one into play → game over
        this.current.y = 0;
        if (this.collides(this.current, 0, 0)) return this.die();
      }
    }

    blocksOf(piece) {
      const s = SHAPES[piece.type][piece.rot];
      return s.map(([dx, dy]) => [piece.x + dx, piece.y + dy]);
    }

    collides(piece, dx, dy, rot) {
      const type = piece.type;
      const r = rot === undefined ? piece.rot : rot;
      const s = SHAPES[type][r];
      for (const [ox, oy] of s) {
        const nx = piece.x + dx + ox;
        const ny = piece.y + dy + oy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && this.grid[ny][nx]) return true;
      }
      return false;
    }

    tryMove(dx, dy) {
      if (this.dead || this.paused || !this.current) return false;
      if (!this.collides(this.current, dx, dy)) {
        this.current.x += dx;
        this.current.y += dy;
        this.lockDelay = 0;
        return true;
      }
      return false;
    }

    tryRotate(dir) {
      if (this.dead || this.paused || !this.current) return false;
      const type = this.current.type;
      if (type === 'O') return false; // O doesn't rotate
      const fromRot = this.current.rot;
      const newRot = (fromRot + dir + 4) % 4;
      const key = '' + fromRot + newRot;
      const table = type === 'I' ? KICKS_I : KICKS_JLSTZ;
      const kicks = table[key] || [[0, 0]];
      for (const [dx, dy] of kicks) {
        if (!this.collides(this.current, dx, dy, newRot)) {
          this.current.x += dx;
          this.current.y += dy;
          this.current.rot = newRot;
          this.lockDelay = 0;
          return true;
        }
      }
      return false;
    }

    hardDrop() {
      if (this.dead || this.paused || !this.current) return;
      let dropped = 0;
      while (!this.collides(this.current, 0, 1)) {
        this.current.y++;
        dropped++;
      }
      this.score += dropped * 2;
      this.lockPiece();
    }

    holdPiece() {
      if (this.dead || this.paused || !this.current || this.holdUsed) return;
      const prev = this.hold;
      this.hold = this.current.type;
      this.holdUsed = true;
      if (prev) this.spawn(prev);
      else this.spawn();
    }

    lockPiece() {
      for (const [x, y] of this.blocksOf(this.current)) {
        if (y < 0) return this.die();
        this.grid[y][x] = this.current.type;
      }
      // Clear lines
      let cleared = 0;
      for (let y = ROWS - 1; y >= 0; y--) {
        if (this.grid[y].every((v) => v)) {
          this.grid.splice(y, 1);
          this.grid.unshift(Array(COLS).fill(null));
          cleared++;
          y++;
        }
      }
      if (cleared > 0) {
        this.score += LINE_SCORES[cleared] * this.level;
        this.lines += cleared;
        this.level = Math.floor(this.lines / 10) + 1;
      }
      this.spawn();
      this.updateStats();
    }

    die() {
      this.dead = true;
      this.api.submitScore('blocks', this.score);
      this.api.showOverlay({
        title: 'Stack topped out.',
        subtitle: `Score ${this.score.toLocaleString()} · Lines ${this.lines}. Press R to retry.`,
        primaryLabel: 'Replay',
        secondaryLabel: 'Back to menu',
        onPrimary: () => this.reset(),
      });
    }

    togglePause() {
      if (this.dead) return;
      this.paused = !this.paused;
      if (this.paused) {
        this.api.showOverlay({
          title: 'Paused',
          subtitle: 'Space to resume.',
          primaryLabel: 'Resume',
          onPrimary: () => {
            this.paused = false;
          },
        });
      } else {
        this.api.hideOverlay();
      }
    }

    restart() {
      this.reset();
    }

    updateStats() {
      this.api.setStats({
        score: this.score.toLocaleString(),
        best: this.api.getHighScore('blocks').toLocaleString(),
        lines: this.lines,
        level: this.level,
      });
    }

    onKey(e) {
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          this.tryMove(-1, 0);
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          this.tryMove(1, 0);
          e.preventDefault();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          if (this.tryMove(0, 1)) this.score += 1;
          this.updateStats();
          e.preventDefault();
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
        case 'x':
        case 'X':
          this.tryRotate(1);
          e.preventDefault();
          break;
        case 'z':
        case 'Z':
        case 'q':
        case 'Q':
          this.tryRotate(-1);
          e.preventDefault();
          break;
        case ' ':
          this.hardDrop();
          e.preventDefault();
          break;
        case 'c':
        case 'C':
        case 'Shift':
          this.holdPiece();
          e.preventDefault();
          break;
        case 'p':
        case 'P':
          this.togglePause();
          e.preventDefault();
          break;
        case 'r':
        case 'R':
          this.restart();
          e.preventDefault();
          break;
      }
    }

    _resize() {
      const cs = getComputedStyle(document.documentElement);
      const maxH = Math.max(260, Math.min(this.host.clientHeight - 40, 720));
      const maxW = Math.max(200, Math.min(this.host.clientWidth - 200, 360));
      const cellH = Math.floor(maxH / ROWS);
      const cellW = Math.floor(maxW / COLS);
      const cell = Math.max(16, Math.min(cellH, cellW));
      this.cell = cell;
      this.canvas.width = COLS * cell;
      this.canvas.height = ROWS * cell;
    }

    loop(t) {
      if (!this.lastT) this.lastT = t;
      const dt = t - this.lastT;
      this.lastT = t;
      if (!this.paused && !this.dead) {
        this.acc += dt;
        const g = gravityFor(this.level);
        while (this.acc >= g) {
          this.acc -= g;
          if (this.current) {
            if (!this.tryMove(0, 1)) {
              this.lockDelay += g;
              if (this.lockDelay > 400) this.lockPiece();
            }
          }
        }
      } else {
        this.acc = 0;
      }
      this.render();
      this.rafId = requestAnimationFrame(this.loop);
    }

    render() {
      const cs = getComputedStyle(document.documentElement);
      const bg = cs.getPropertyValue('--bg').trim();
      const fg = cs.getPropertyValue('--fg').trim();
      const line = cs.getPropertyValue('--line').trim();
      const mute = cs.getPropertyValue('--fg-mute').trim();

      const ctx = this.ctx;
      const cell = this.cell;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Grid lines
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (let x = 1; x < COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cell + 0.5, 0);
        ctx.lineTo(x * cell + 0.5, ROWS * cell);
        ctx.stroke();
      }
      for (let y = 1; y < ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cell + 0.5);
        ctx.lineTo(COLS * cell, y * cell + 0.5);
        ctx.stroke();
      }

      // Locked grid cells
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (this.grid[y][x]) this.drawCell(ctx, x, y, cell, fg);
        }
      }

      // Ghost
      if (this.current && !this.dead) {
        const ghost = { ...this.current };
        while (!this.collides(ghost, 0, 1)) ghost.y++;
        ctx.globalAlpha = 0.18;
        for (const [x, y] of this.blocksOf(ghost)) {
          if (y >= 0) this.drawCell(ctx, x, y, cell, fg);
        }
        ctx.globalAlpha = 1;
      }

      // Current piece
      if (this.current && !this.dead) {
        for (const [x, y] of this.blocksOf(this.current)) {
          if (y >= 0) this.drawCell(ctx, x, y, cell, fg);
        }
      }

      // Preview and hold
      this.drawMini(this.nextCtx, this.nextQueue[0], fg, bg, line);
      this.drawMini(this.holdCtx, this.hold, fg, bg, line);
    }

    drawCell(ctx, x, y, cell, fg) {
      ctx.fillStyle = fg;
      ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
    }

    drawMini(ctx, type, fg, bg, line) {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      if (!type) return;
      const s = SHAPES[type][0];
      // bounds
      let minX = 4, maxX = 0, minY = 4, maxY = 0;
      for (const [x, y] of s) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const cell = Math.floor(Math.min(w / (bw + 1), h / (bh + 1)));
      const ox = Math.floor((w - bw * cell) / 2);
      const oy = Math.floor((h - bh * cell) / 2);
      ctx.fillStyle = fg;
      for (const [x, y] of s) {
        ctx.fillRect(ox + (x - minX) * cell + 2, oy + (y - minY) * cell + 2, cell - 4, cell - 4);
      }
    }

    destroy() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      window.removeEventListener('resize', this._resize);
      if (this.wrap && this.wrap.parentNode) this.wrap.parentNode.removeChild(this.wrap);
    }
  }
})();
