class MultiGrid {
  constructor(cols, rows, raceCount, raceColors, canvasWidth, canvasHeight) {
    this.cols = cols
    this.rows = rows
    this.raceCount = raceCount
    this.raceColors = raceColors
    this.cellSize = Math.min(canvasWidth / cols, canvasHeight / rows)
    this.cells = this.createEmptyGrid()
    this.generation = 0
  }

  createEmptyGrid() {
    return Array.from({ length: this.rows }, () => Array(this.cols).fill(0))
  }

  randomize() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const v = Math.random()
        if (v < 0.3) {
          this.cells[r][c] = Math.floor(Math.random() * this.raceCount) + 1
        } else {
          this.cells[r][c] = 0
        }
      }
    }
  }

  toggleCell(row, col, currentRace) {
    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      if (this.cells[row][col] === 0) {
        this.cells[row][col] = currentRace
      } else {
        this.cells[row][col] = 0
      }
    }
  }

  countNeighborsByRace(row, col) {
    const counts = new Array(9).fill(0)
    let total = 0
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const r = row + dr
        const c = col + dc
        if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
          const race = this.cells[r][c]
          if (race > 0) {
            counts[race]++
            total++
          }
        }
      }
    }
    return { counts, total }
  }

  step() {
    const next = this.createEmptyGrid()
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const current = this.cells[r][c]
        const { counts, total } = this.countNeighborsByRace(r, c)

        if (current > 0) {
          next[r][c] = (total === 2 || total === 3) ? current : 0
        } else {
          if (total === 3) {
            let bestRace = 0
            for (let race = 1; race <= this.raceCount; race++) {
              if (counts[race] >= 2) {
                bestRace = race
                break
              }
            }
            next[r][c] = bestRace
          }
        }
      }
    }
    this.cells = next
    this.generation++
  }

  resize(cols, rows, canvasWidth, canvasHeight) {
    this.cols = cols
    this.rows = rows
    this.cellSize = Math.min(canvasWidth / cols, canvasHeight / rows)
    this.cells = this.createEmptyGrid()
    this.generation = 0
  }

  updateCellSize(canvasWidth, canvasHeight) {
    this.cellSize = Math.min(canvasWidth / this.cols, canvasHeight / this.rows)
  }

  updateRaceCount(raceCount, raceColors) {
    this.raceCount = raceCount
    this.raceColors = raceColors
  }

  getRaceCounts() {
    const counts = new Array(9).fill(0)
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        counts[this.cells[r][c]]++
      }
    }
    return counts
  }
}
