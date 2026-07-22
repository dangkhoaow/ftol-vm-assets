/* =========================================================================
   Cursor Arcade — Tic-Tac-Toe
   3x3 grid. 1P vs CPU (Easy / Normal / Hard with full minimax), or
   hotseat 2P. Mouse and keyboard (numpad layout 7-8-9 / 4-5-6 / 1-2-3,
   or arrows + Enter).
   ========================================================================= */

(function () {
  'use strict';

  const R = (window.CursorArcade = window.CursorArcade || {});
  R.games = R.games || {};

  const SIZE = 360;       // canvas square size
  const PAD = 18;
  const CELL = (SIZE - PAD * 2) / 3;

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8],   // cols
    [0, 4, 8], [2, 4, 6],              // diags
  ];

  const KEY_TO_IDX = {
    '7': 0, '8': 1, '9': 2,
    '4': 3, '5': 4, '6': 5,
    '1': 6, '2': 7, '3': 8,
  };

  const DIFFICULTY = {
    easy:   { label: 'Easy',   smartProb: 0.0  }, // random
    normal: { label: 'Normal', smartProb: 0.65 }, // mostly smart
    hard:   { label: 'Hard',   smartProb: 1.0  }, // perfect minimax
  };

  R.games.tictactoe = {
    create(c) { return new TicTacToeGame(c); },
  };

  class TicTacToeGame {
    constructor({ host, api, meta }) {
      this.api = api;
      this.meta = meta;
      this.host = host;

      const saved = api.getSettings('tictactoe') || {};
      this.mode = saved.mode === '2p' ? '2p' : '1p';
      this.difficulty = DIFFICULTY[saved.difficulty] ? saved.difficulty : 'hard';
      this.playerMark = saved.playerMark === 'O' ? 'O' : 'X'; // 1P only

      this.canvas = document.createElement('canvas');
      this.canvas.width = SIZE;
      this.canvas.height = SIZE;
      this.canvas.style.border = '1px solid var(--line-strong)';
      this.canvas.style.borderRadius = '8px';
      this.canvas.style.maxWidth = '100%';
      this.canvas.style.height = 'auto';
      this.canvas.style.cursor = 'pointer';
      host.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');

      this.canvas.addEventListener('click', (e) => this._onClick(e));
      this.canvas.addEventListener('mousemove', (e) => this._onMove(e));
      this.canvas.addEventListener('mouseleave', () => {
        this.hover = -1;
        this.render();
      });

      api.setTopbarControls({ pause: false, restart: true });

      this.cursorIdx = 4;
      this.hover = -1;
      this.rafId = null;
      this.flash = 0;
      this.reset(true);

      this.loop = this.loop.bind(this);
      this.rafId = requestAnimationFrame(this.loop);
    }

    destroy() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      if (this.canvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
    }

    reset(full) {
      this.board = Array(9).fill(null);
      this.winLine = null;
      this.over = false;
      this.winner = null; // 'X' | 'O' | 'draw' | null
      this.cpuPending = null;

      // Alternate who goes first across games for fairness in 1P.
      if (full) {
        this.gameCount = 0;
      }
      this.gameCount = (this.gameCount || 0) + 1;
      const firstIsX = this.gameCount % 2 === 1;
      this.turn = firstIsX ? 'X' : 'O';

      // In 1P: figure out who is human vs CPU.
      this.cpuMark = this.mode === '1p'
        ? (this.playerMark === 'X' ? 'O' : 'X')
        : null;

      this.api.hideOverlay();
      this.updateStats();

      if (this.mode === '1p' && this.turn === this.cpuMark) {
        this._scheduleCpuMove();
      }
    }

    save() {
      this.api.saveSettings('tictactoe', {
        mode: this.mode,
        difficulty: this.difficulty,
        playerMark: this.playerMark,
      });
    }

    updateStats() {
      const wins = this.api.getHighScore('tictactoe:wins:' + this.difficulty) || 0;
      const stats = {
        mode: this.mode === '2p' ? '2P hotseat' : 'vs CPU (' + DIFFICULTY[this.difficulty].label + ')',
        turn: this.over ? '—' : this.turn,
      };
      if (this.mode === '1p') {
        stats.you = this.playerMark;
        stats.wins = wins;
      }
      this.api.setStats(stats);
    }

    restart() {
      this.reset(true);
    }

    onKey(e) {
      if (e.key === 'r' || e.key === 'R') {
        if (this.over) this.reset(false); else this.reset(true);
        e.preventDefault();
        return;
      }
      if (this.over) return;

      // Direct numpad mapping.
      if (KEY_TO_IDX.hasOwnProperty(e.key)) {
        const idx = KEY_TO_IDX[e.key];
        this.cursorIdx = idx;
        this._tryPlay(idx);
        e.preventDefault();
        return;
      }

      // Arrow nav + Enter/Space to commit.
      const r = Math.floor(this.cursorIdx / 3);
      const c = this.cursorIdx % 3;
      if (e.key === 'ArrowUp')         { this.cursorIdx = ((r + 2) % 3) * 3 + c; e.preventDefault(); }
      else if (e.key === 'ArrowDown')  { this.cursorIdx = ((r + 1) % 3) * 3 + c; e.preventDefault(); }
      else if (e.key === 'ArrowLeft')  { this.cursorIdx = r * 3 + (c + 2) % 3; e.preventDefault(); }
      else if (e.key === 'ArrowRight') { this.cursorIdx = r * 3 + (c + 1) % 3; e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') {
        this._tryPlay(this.cursorIdx);
        e.preventDefault();
      }
    }

    buildSettings(container) {
      const mk = (labelText) => {
        const f = document.createElement('div');
        f.className = 'field';
        const l = document.createElement('label');
        l.textContent = labelText;
        f.appendChild(l);
        return f;
      };

      const modeField = mk('Mode');
      const modeSel = document.createElement('select');
      [['1p', '1 player vs CPU'], ['2p', '2 players (hotseat)']].forEach(([v, t]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        modeSel.appendChild(o);
      });
      modeSel.value = this.mode;
      modeSel.addEventListener('change', () => {
        this.mode = modeSel.value;
        this.save();
        this.reset(true);
      });
      modeField.appendChild(modeSel);
      container.appendChild(modeField);

      const diffField = mk('CPU difficulty');
      const diffSel = document.createElement('select');
      Object.entries(DIFFICULTY).forEach(([k, v]) => {
        const o = document.createElement('option');
        o.value = k; o.textContent = v.label;
        diffSel.appendChild(o);
      });
      diffSel.value = this.difficulty;
      diffSel.addEventListener('change', () => {
        this.difficulty = diffSel.value;
        this.save();
        this.updateStats();
      });
      diffField.appendChild(diffSel);
      container.appendChild(diffField);

      const markField = mk('Your mark (1P)');
      const markSel = document.createElement('select');
      [['X', 'X (goes first when alternating)'], ['O', 'O']].forEach(([v, t]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        markSel.appendChild(o);
      });
      markSel.value = this.playerMark;
      markSel.addEventListener('change', () => {
        this.playerMark = markSel.value;
        this.save();
        this.reset(true);
      });
      markField.appendChild(markSel);
      container.appendChild(markField);
    }

    // ---------- input ----------
    _cellFromPoint(x, y) {
      const rect = this.canvas.getBoundingClientRect();
      const cx = ((x - rect.left) / rect.width) * SIZE;
      const cy = ((y - rect.top) / rect.height) * SIZE;
      const col = Math.floor((cx - PAD) / CELL);
      const row = Math.floor((cy - PAD) / CELL);
      if (col < 0 || col > 2 || row < 0 || row > 2) return -1;
      return row * 3 + col;
    }

    _onClick(e) {
      if (this.over) {
        this.reset(false);
        return;
      }
      const idx = this._cellFromPoint(e.clientX, e.clientY);
      if (idx < 0) return;
      this.cursorIdx = idx;
      this._tryPlay(idx);
    }

    _onMove(e) {
      const idx = this._cellFromPoint(e.clientX, e.clientY);
      if (idx !== this.hover) {
        this.hover = idx;
        this.render();
      }
    }

    _tryPlay(idx) {
      if (this.over) return;
      if (this.board[idx]) return;
      // In 1P, ignore clicks while it's the CPU's turn.
      if (this.mode === '1p' && this.turn === this.cpuMark) return;

      this._place(idx, this.turn);
      if (this.over) return;

      if (this.mode === '1p' && this.turn === this.cpuMark) {
        this._scheduleCpuMove();
      }
    }

    _place(idx, mark) {
      this.board[idx] = mark;
      const result = evalBoard(this.board);
      if (result.winner) {
        this.over = true;
        this.winner = result.winner;
        this.winLine = result.line;
        this._onGameEnd();
      } else if (result.draw) {
        this.over = true;
        this.winner = 'draw';
        this._onGameEnd();
      } else {
        this.turn = mark === 'X' ? 'O' : 'X';
      }
      this.flash = 0.4;
      this.updateStats();
    }

    _scheduleCpuMove() {
      // Small delay for tactility.
      this.cpuPending = performance.now() + 320;
    }

    _doCpuMove() {
      const pick = chooseCpuMove(this.board, this.cpuMark, this.difficulty);
      if (pick == null) return;
      this._place(pick, this.cpuMark);
    }

    _onGameEnd() {
      let title, sub;
      if (this.mode === '2p') {
        if (this.winner === 'draw') {
          title = 'Draw';
          sub = 'Click anywhere or press R to play again.';
        } else {
          title = (this.winner === 'X' ? 'Player 1' : 'Player 2') + ' wins';
          sub = `${this.winner} got three in a row. Click or R to rematch.`;
        }
      } else {
        const userWon = this.winner === this.playerMark;
        const cpuWon = this.winner === this.cpuMark;
        if (this.winner === 'draw') {
          title = 'Draw';
          sub = 'Click or R for another round.';
        } else if (userWon) {
          title = 'You win';
          sub = 'Beat ' + DIFFICULTY[this.difficulty].label + ' CPU. Click or R to play again.';
          const key = 'tictactoe:wins:' + this.difficulty;
          const cur = this.api.getHighScore(key) || 0;
          this.api.submitScore(key, cur + 1);
        } else if (cpuWon) {
          title = 'CPU wins';
          sub = 'Click or R to take revenge.';
        }
      }

      this.api.showOverlay({
        title,
        subtitle: sub,
        primaryLabel: 'Play again',
        secondaryLabel: 'Back to menu',
        onPrimary: () => this.reset(false),
      });
    }

    loop(t) {
      if (this.rafId === null) return;
      if (this.cpuPending && t >= this.cpuPending && !this.over) {
        this.cpuPending = null;
        this._doCpuMove();
      }
      if (this.flash > 0) this.flash = Math.max(0, this.flash - 1 / 60);
      this.render();
      this.rafId = requestAnimationFrame(this.loop);
    }

    render() {
      const ctx = this.ctx;
      const cs = getComputedStyle(document.documentElement);
      const bg = cs.getPropertyValue('--bg').trim() || '#ffffff';
      const fg = cs.getPropertyValue('--fg').trim() || '#0a0a0a';
      const line = cs.getPropertyValue('--line').trim() || '#ececec';
      const lineStrong = cs.getPropertyValue('--line-strong').trim() || '#d4d4d4';
      const hover = cs.getPropertyValue('--hover').trim() || '#f2f2f2';

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, SIZE, SIZE);

      // hover / cursor highlight
      const interactiveCell = this.over
        ? -1
        : (this.mode === '1p' && this.turn === this.cpuMark ? -1 : (this.hover >= 0 ? this.hover : this.cursorIdx));
      if (interactiveCell >= 0 && !this.board[interactiveCell]) {
        const r = Math.floor(interactiveCell / 3);
        const c = interactiveCell % 3;
        ctx.fillStyle = hover;
        ctx.fillRect(PAD + c * CELL, PAD + r * CELL, CELL, CELL);
      }

      // grid
      ctx.strokeStyle = lineStrong;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(PAD + i * CELL, PAD);
        ctx.lineTo(PAD + i * CELL, SIZE - PAD);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(PAD, PAD + i * CELL);
        ctx.lineTo(SIZE - PAD, PAD + i * CELL);
        ctx.stroke();
      }

      // cursor outline (keyboard nav indicator)
      if (interactiveCell >= 0 && !this.board[interactiveCell] && this.hover < 0) {
        const r = Math.floor(interactiveCell / 3);
        const c = interactiveCell % 3;
        ctx.strokeStyle = fg;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(PAD + c * CELL + 6, PAD + r * CELL + 6, CELL - 12, CELL - 12);
        ctx.setLineDash([]);
      }

      // marks
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = fg;
      ctx.fillStyle = fg;
      for (let i = 0; i < 9; i++) {
        const m = this.board[i];
        if (!m) continue;
        const r = Math.floor(i / 3);
        const c = i % 3;
        const cx = PAD + c * CELL + CELL / 2;
        const cy = PAD + r * CELL + CELL / 2;
        const radius = CELL * 0.28;
        if (m === 'X') {
          ctx.beginPath();
          ctx.moveTo(cx - radius, cy - radius);
          ctx.lineTo(cx + radius, cy + radius);
          ctx.moveTo(cx + radius, cy - radius);
          ctx.lineTo(cx - radius, cy + radius);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // win line
      if (this.winLine) {
        const [a, , b] = this.winLine;
        const ar = Math.floor(a / 3), ac = a % 3;
        const br = Math.floor(b / 3), bc = b % 3;
        const ax = PAD + ac * CELL + CELL / 2;
        const ay = PAD + ar * CELL + CELL / 2;
        const bx = PAD + bc * CELL + CELL / 2;
        const by = PAD + br * CELL + CELL / 2;
        // extend slightly past both endpoints
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy);
        const ex = (dx / len) * (CELL * 0.32);
        const ey = (dy / len) * (CELL * 0.32);
        ctx.lineWidth = 6;
        ctx.strokeStyle = fg;
        ctx.beginPath();
        ctx.moveTo(ax - ex, ay - ey);
        ctx.lineTo(bx + ex, by + ey);
        ctx.stroke();
      }

      // bottom hint when waiting on CPU
      if (!this.over && this.mode === '1p' && this.turn === this.cpuMark && this.cpuPending) {
        ctx.fillStyle = fg;
        ctx.globalAlpha = 0.45;
        ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('CPU is thinking…', SIZE / 2, SIZE - 4);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------- pure board logic ----------
  function evalBoard(b) {
    for (const ln of LINES) {
      const [a, c, d] = ln;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) {
        return { winner: b[a], line: ln, draw: false };
      }
    }
    if (b.every((x) => x)) return { winner: null, line: null, draw: true };
    return { winner: null, line: null, draw: false };
  }

  function chooseCpuMove(board, cpuMark, difficulty) {
    const opts = freeCells(board);
    if (!opts.length) return null;

    const cfg = DIFFICULTY[difficulty];
    const useSmart = Math.random() < cfg.smartProb;
    if (!useSmart) {
      // random move
      return opts[Math.floor(Math.random() * opts.length)];
    }

    // 1) win if possible
    for (const i of opts) {
      const test = board.slice();
      test[i] = cpuMark;
      if (evalBoard(test).winner === cpuMark) return i;
    }
    // 2) block opponent's win
    const opp = cpuMark === 'X' ? 'O' : 'X';
    for (const i of opts) {
      const test = board.slice();
      test[i] = opp;
      if (evalBoard(test).winner === opp) return i;
    }

    // 3) hard difficulty: full minimax for an unbeatable CPU
    if (difficulty === 'hard') {
      let bestScore = -Infinity;
      let bestMove = opts[0];
      for (const i of opts) {
        const test = board.slice();
        test[i] = cpuMark;
        const score = minimax(test, opp, cpuMark, 0);
        if (score > bestScore) {
          bestScore = score;
          bestMove = i;
        }
      }
      return bestMove;
    }

    // Normal difficulty: heuristic preferences (centre > corner > edge),
    // randomised within each tier.
    const centre = 4;
    if (opts.includes(centre) && Math.random() < 0.85) return centre;
    const corners = [0, 2, 6, 8].filter((i) => opts.includes(i));
    if (corners.length && Math.random() < 0.7) return corners[Math.floor(Math.random() * corners.length)];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  function freeCells(b) {
    const r = [];
    for (let i = 0; i < 9; i++) if (!b[i]) r.push(i);
    return r;
  }

  function minimax(board, turn, cpuMark, depth) {
    const res = evalBoard(board);
    if (res.winner === cpuMark) return 10 - depth;
    if (res.winner && res.winner !== cpuMark) return depth - 10;
    if (res.draw) return 0;

    const opts = freeCells(board);
    if (turn === cpuMark) {
      let best = -Infinity;
      for (const i of opts) {
        const t = board.slice();
        t[i] = cpuMark;
        best = Math.max(best, minimax(t, cpuMark === 'X' ? 'O' : 'X', cpuMark, depth + 1));
      }
      return best;
    } else {
      let best = Infinity;
      for (const i of opts) {
        const t = board.slice();
        t[i] = turn;
        best = Math.min(best, minimax(t, turn === 'X' ? 'O' : 'X', cpuMark, depth + 1));
      }
      return best;
    }
  }
})();
