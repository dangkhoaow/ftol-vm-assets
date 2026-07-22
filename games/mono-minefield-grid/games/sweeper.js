(function () {
  'use strict';

  const R = (window.CursorArcade = window.CursorArcade || {});
  R.games = R.games || {};

  const DIFFICULTIES = {
    easy: { cols: 9, rows: 9, mines: 10 },
    medium: { cols: 16, rows: 16, mines: 40 },
    hard: { cols: 24, rows: 16, mines: 80 },
  };

  R.games.sweeper = {
    create(c) {
      return new SweeperGame(c);
    },
  };

  class SweeperGame {
    constructor({ host, api }) {
      this.api = api;
      this.host = host;
      const saved = api.getSettings('sweeper') || {};
      this.difficulty = DIFFICULTIES[saved.difficulty] ? saved.difficulty : 'medium';

      this.wrap = document.createElement('div');
      this.wrap.style.display = 'flex';
      this.wrap.style.alignItems = 'center';
      this.wrap.style.justifyContent = 'center';
      this.wrap.style.width = '100%';
      this.wrap.style.height = '100%';
      this.wrap.style.padding = '20px';
      this.wrap.style.overflow = 'auto';

      this.board = document.createElement('div');
      this.board.className = 'sweeper-board';
      this.wrap.appendChild(this.board);
      host.appendChild(this.wrap);

      this._resize = this._resize.bind(this);
      window.addEventListener('resize', this._resize);

      api.setTopbarControls({ restart: true });

      this.reset();
      this._interval = setInterval(() => this.tickTimer(), 1000);
    }

    reset() {
      const d = DIFFICULTIES[this.difficulty];
      this.cols = d.cols;
      this.rows = d.rows;
      this.mines = d.mines;
      this.grid = [];
      for (let r = 0; r < this.rows; r++) {
        const row = [];
        for (let c = 0; c < this.cols; c++) {
          row.push({ mine: false, open: false, flag: false, n: 0 });
        }
        this.grid.push(row);
      }
      this.firstClick = true;
      this.dead = false;
      this.won = false;
      this.flagsPlaced = 0;
      this.opened = 0;
      this.startTs = null;
      this.elapsed = 0;
      this.api.hideOverlay();
      this.render(true);
      this.updateStats();
    }

    plantMines(avoidR, avoidC) {
      const avoid = new Set();
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = avoidR + dr;
          const c = avoidC + dc;
          if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
            avoid.add(r * this.cols + c);
          }
        }
      }
      const total = this.rows * this.cols;
      const eligible = [];
      for (let i = 0; i < total; i++) {
        if (!avoid.has(i)) eligible.push(i);
      }
      for (let i = 0; i < this.mines; i++) {
        const j = i + Math.floor(Math.random() * (eligible.length - i));
        [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
        const idx = eligible[i];
        const r = Math.floor(idx / this.cols);
        const c = idx % this.cols;
        this.grid[r][c].mine = true;
      }
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c].mine) continue;
          let n = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = r + dr;
              const nc = c + dc;
              if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
              if (this.grid[nr][nc].mine) n++;
            }
          }
          this.grid[r][c].n = n;
        }
      }
    }

    openCell(r, c) {
      if (this.dead || this.won) return;
      const cell = this.grid[r][c];
      if (cell.open || cell.flag) return;
      if (this.firstClick) {
        this.plantMines(r, c);
        this.firstClick = false;
        this.startTs = Date.now();
      }
      if (cell.mine) {
        cell.open = true;
        return this.die(r, c);
      }
      this.flood(r, c);
      this.checkWin();
      this.renderCells();
      this.updateStats();
    }

    flood(r, c) {
      const stack = [[r, c]];
      while (stack.length) {
        const [r0, c0] = stack.pop();
        if (r0 < 0 || r0 >= this.rows || c0 < 0 || c0 >= this.cols) continue;
        const cell = this.grid[r0][c0];
        if (cell.open || cell.flag || cell.mine) continue;
        cell.open = true;
        this.opened++;
        if (cell.n === 0) {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              stack.push([r0 + dr, c0 + dc]);
            }
          }
        }
      }
    }

    toggleFlag(r, c) {
      if (this.dead || this.won) return;
      const cell = this.grid[r][c];
      if (cell.open) {
        this.chord(r, c);
        return;
      }
      cell.flag = !cell.flag;
      this.flagsPlaced += cell.flag ? 1 : -1;
      this.renderCells();
      this.updateStats();
    }

    chord(r, c) {
      const cell = this.grid[r][c];
      if (!cell.open || cell.n === 0) return;
      let flagCount = 0;
      const neighbors = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
          const n = this.grid[nr][nc];
          if (n.flag) flagCount++;
          else if (!n.open) neighbors.push([nr, nc]);
        }
      }
      if (flagCount !== cell.n) return;
      for (const [nr, nc] of neighbors) {
        this.openCell(nr, nc);
      }
    }

    checkWin() {
      const total = this.rows * this.cols;
      if (this.opened === total - this.mines) {
        this.won = true;
        const elapsed = this.startTs ? Math.floor((Date.now() - this.startTs) / 1000) : 0;
        this.elapsed = elapsed;
        const score = Math.max(1, Math.floor(10000 / (elapsed + 1)));
        this.api.submitScore('sweeper:' + this.difficulty, score);
        this.api.showOverlay({
          title: 'Cleared.',
          subtitle: `Time ${elapsed}s. Score ${score.toLocaleString()}. Press R to play again.`,
          primaryLabel: 'Replay',
          secondaryLabel: 'Back to menu',
          onPrimary: () => this.reset(),
        });
      }
    }

    die(mr, mc) {
      this.dead = true;
      this.elapsed = this.startTs ? Math.floor((Date.now() - this.startTs) / 1000) : 0;
      // reveal all mines
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c].mine) this.grid[r][c].open = true;
        }
      }
      this.renderCells();
      this.api.showOverlay({
        title: 'You hit a mine.',
        subtitle: 'Press R to retry.',
        primaryLabel: 'Replay',
        secondaryLabel: 'Back to menu',
        onPrimary: () => this.reset(),
      });
    }

    tickTimer() {
      if (this.startTs && !this.dead && !this.won) {
        this.elapsed = Math.floor((Date.now() - this.startTs) / 1000);
        this.updateStats();
      }
    }

    updateStats() {
      this.api.setStats({
        difficulty: this.difficulty,
        mines: Math.max(0, this.mines - this.flagsPlaced),
        time: this.elapsed + 's',
        best: this.api.getHighScore('sweeper:' + this.difficulty).toLocaleString(),
      });
    }

    _resize() {
      this.render(true);
    }

    render(fresh) {
      const hostW = this.wrap.clientWidth - 40;
      const hostH = this.wrap.clientHeight - 40;
      const maxCell = Math.max(16, Math.min(Math.floor(hostW / this.cols), Math.floor(hostH / this.rows), 36));
      this.cellSize = maxCell;
      this.board.style.gridTemplateColumns = `repeat(${this.cols}, ${maxCell}px)`;
      this.board.style.gridTemplateRows = `repeat(${this.rows}, ${maxCell}px)`;

      if (fresh) {
        this.board.innerHTML = '';
        this.cells = [];
        for (let r = 0; r < this.rows; r++) {
          const row = [];
          for (let c = 0; c < this.cols; c++) {
            const el = document.createElement('div');
            el.className = 'sweeper-cell';
            el.dataset.r = String(r);
            el.dataset.c = String(c);
            el.addEventListener('mousedown', (e) => this.onMouseDown(e, r, c));
            this.board.appendChild(el);
            row.push(el);
          }
          this.cells.push(row);
        }
      }
      this.renderCells();
    }

    renderCells() {
      if (!this.cells) return;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cell = this.grid[r][c];
          const el = this.cells[r][c];
          el.className = 'sweeper-cell';
          el.removeAttribute('data-n');
          el.textContent = '';
          if (cell.flag) el.classList.add('flag');
          if (cell.open) {
            if (cell.mine) el.classList.add('mine');
            else {
              el.classList.add('open');
              if (cell.n > 0) {
                el.textContent = String(cell.n);
                el.dataset.n = String(cell.n);
              }
            }
          }
        }
      }
    }

    onMouseDown(e, r, c) {
      e.preventDefault();
      if (e.button === 2) {
        this.toggleFlag(r, c);
      } else if (e.button === 0) {
        if (e.shiftKey || e.metaKey) this.toggleFlag(r, c);
        else this.openCell(r, c);
      } else if (e.button === 1) {
        this.chord(r, c);
      }
    }

    onContextMenu(e) {
      e.preventDefault();
    }

    onKey(e) {
      if (e.key === 'r' || e.key === 'R') {
        this.reset();
        e.preventDefault();
      }
    }

    restart() {
      this.reset();
    }

    buildSettings(container) {
      const field = document.createElement('div');
      field.className = 'field';
      field.innerHTML = `<label>Difficulty</label>`;
      const sel = document.createElement('select');
      for (const k of Object.keys(DIFFICULTIES)) {
        const d = DIFFICULTIES[k];
        const o = document.createElement('option');
        o.value = k;
        o.textContent = `${k[0].toUpperCase() + k.slice(1)} — ${d.cols}×${d.rows}, ${d.mines} mines`;
        sel.appendChild(o);
      }
      sel.value = this.difficulty;
      sel.addEventListener('change', () => {
        this.difficulty = sel.value;
        this.api.saveSettings('sweeper', { difficulty: this.difficulty });
        this.reset();
      });
      field.appendChild(sel);
      container.appendChild(field);
    }

    destroy() {
      window.removeEventListener('resize', this._resize);
      if (this._interval) clearInterval(this._interval);
      if (this.wrap && this.wrap.parentNode) this.wrap.parentNode.removeChild(this.wrap);
    }
  }
})();
