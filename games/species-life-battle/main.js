/**
 * 兔子 vs 乌龟 - 对战模式主程序
 */
(function () {
  const canvas = document.getElementById('canvas')
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1

  // 多语言配置
  const translations = {
    zh: {
      gen: '代数',
      subtitle: '康威生命游戏 - 对战模式',
      'team-rabbit': '兔子队',
      'team-turtle': '乌龟队',
      'team-a-color': '粉色阵营',
      'team-b-color': '绿色阵营',
      'start-game': '开始游戏',
      start: '开始',
      pause: '暂停',
      reset: '重置',
      clear: '清空',
      speed: '速度',
      draw: '绘制',
      rabbit: '🐰 兔子',
      turtle: '🐢 乌龟',
    },
    en: {
      gen: 'Gen',
      subtitle: "Conway's Game of Life - Battle Mode",
      'team-rabbit': 'TEAM RABBIT',
      'team-turtle': 'TEAM TURTLE',
      'team-a-color': 'Pink Team',
      'team-b-color': 'Green Team',
      'start-game': 'START GAME',
      start: 'Start',
      pause: 'Pause',
      reset: 'Reset',
      clear: 'Clear',
      speed: 'Speed',
      draw: 'Draw',
      rabbit: '🐰 Rabbit',
      turtle: '🐢 Turtle',
    }
  }

  let currentLang = 'en'

  function switchLanguage(lang) {
    currentLang = lang
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n')
      if (translations[lang][key]) {
        el.textContent = translations[lang][key]
      }
    })
    btnLang.textContent = lang === 'zh' ? 'EN' : '中文'
  }

  // 颜色配置（支持最多4种族）
  const RACE_COLORS = ['#ff6b9d', '#00ff88', '#4da6ff', '#ffffff']
  const RACE_LABELS = ['粉色', '绿色', '蓝色', '白色']
  const RACE_POSITIONS = [0.25, 0.75, 0.35, 0.65] // 每个种族的水平位置比例

  // UI 元素
  const introOverlay = document.getElementById('intro-overlay')
  const introStartBtn = document.getElementById('intro-start-btn')
  const selectPatternA = document.getElementById('select-pattern-a')
  const selectPatternB = document.getElementById('select-pattern-b')
  const btnStart = document.getElementById('btn-start')
  const btnPause = document.getElementById('btn-pause')
  const btnReset = document.getElementById('btn-reset')
  const btnClear = document.getElementById('btn-clear')
  const btnLang = document.getElementById('btn-lang')
  const sliderSpeed = document.getElementById('slider-speed')
  const speedValue = document.getElementById('speed-value')
  const generationDisplay = document.getElementById('generation')
  const teamACount = document.getElementById('team-a-count')
  const teamBCount = document.getElementById('team-b-count')

  // 种族按钮
  const raceButtons = [
    document.getElementById('btn-race-1'),
    document.getElementById('btn-race-2'),
    document.getElementById('btn-race-3'),
    document.getElementById('btn-race-4'),
  ]
  const btnAddRace = document.getElementById('btn-add-race')

  // 游戏状态
  let running = false
  let lastTime = 0
  let speed = parseInt(sliderSpeed.value, 10)
  let currentRace = 1 // 当前手绘用的种族
  let raceCount = 2   // 默认2种族
  let racePatterns = ['penguin', 'spaceship117', 'pufferTrain', 'pulsar']

  // 撤回功能：保存最近 20 步操作快照
  const undoStack = []
  const MAX_UNDO = 20

  function saveSnapshot() {
    const snapshot = grid.cells.map(row => [...row])
    undoStack.push(snapshot)
    if (undoStack.length > MAX_UNDO) undoStack.shift()
  }

  function undo() {
    if (undoStack.length === 0) return
    grid.cells = undoStack.pop()
    draw()
    updateStats()
  }

  // ---------- 网格配置 ----------
  // 移动端自动缩小格子
  const isMobile = window.innerWidth <= 768
  const CELL_SIZE = isMobile ? 6 : 10
  let cols, rows, grid

  // 创建/重建网格（铺满屏幕）
  function createGrid() {
    const w = window.innerWidth
    const h = window.innerHeight
    cols = Math.floor(w / CELL_SIZE)
    rows = Math.floor(h / CELL_SIZE)
    grid = new MultiGrid(cols, rows, raceCount, RACE_COLORS.slice(0, raceCount), w, h)
    grid.cellSize = CELL_SIZE
    grid.raceColors = RACE_COLORS.slice(0, raceCount)
  }

  // Canvas 尺寸调整 + 网格自适应
  let resizeTimer = null
  function resizeCanvas() {
    const w = window.innerWidth
    const h = window.innerHeight

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 如果屏幕大小变化导致行列数改变，重建网格
    const newCols = Math.floor(w / CELL_SIZE)
    const newRows = Math.floor(h / CELL_SIZE)
    if (!grid || newCols !== cols || newRows !== rows) {
      createGrid()
      resetBattle()
    } else {
      draw()
    }
  }

  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(resizeCanvas, 100)
  })

  // 初始化对战场景
  function resetBattle() {
    // 清空
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        grid.cells[r][c] = 0
      }
    }
    grid.generation = 0

    // 种族1（粉色）：企鹅，上方居中
    const topRow = Math.floor(rows * 0.2)
    const centerCol = Math.floor(cols / 2)
    placePattern(grid.cells, racePatterns[0], centerCol, topRow, 1)

    // 种族2：3 台 117 飞船，下方横排（间距=飞船宽度+间隙）
    const botRow = Math.floor(rows * 0.7)
    const shipSpacing = 20 // 飞船宽17 + 3格间隙
    placePattern(grid.cells, racePatterns[1], centerCol - shipSpacing, botRow, 2)
    placePattern(grid.cells, racePatterns[1], centerCol, botRow, 2)
    placePattern(grid.cells, racePatterns[1], centerCol + shipSpacing, botRow, 2)

    draw()
    updateStats()
  }

  // 绘制网格（铺满整个 canvas）
  function draw() {
    const w = grid.cellSize
    const canvasW = canvas.width / dpr
    const canvasH = canvas.height / dpr
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvasW, canvasH)
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * w
        const y = r * w
        const cellValue = grid.cells[r][c]
        
        if (cellValue > 0) {
          ctx.fillStyle = RACE_COLORS[cellValue - 1] || '#ffffff'
          ctx.fillRect(x, y, w, w)
        }
        
        ctx.strokeStyle = '#1a1a1a'
        ctx.lineWidth = 0.5
        ctx.strokeRect(x, y, w, w)
      }
    }
  }

  // 更新统计信息
  const teamCCount = document.getElementById('team-c-count')

  function updateStats() {
    const counts = grid.getRaceCounts()
    generationDisplay.textContent = grid.generation
    teamACount.textContent = counts[1] || 0
    teamBCount.textContent = counts[2] || 0
    if (teamCCount) teamCCount.textContent = counts[3] || 0
  }

  // 游戏循环
  function loop(timestamp) {
    if (!running) return
    if (timestamp - lastTime > speed) {
      grid.step()
      draw()
      updateStats()
      lastTime = timestamp
    }
    requestAnimationFrame(loop)
  }

  // 初始加载按钮
  introStartBtn.addEventListener('click', function () {
    racePatterns[0] = selectPatternA.value
    racePatterns[1] = selectPatternB.value
    introOverlay.classList.add('hidden')
    resetBattle()
    updateRaceButtons()
  })

  // 控制按钮
  btnStart.addEventListener('click', function () {
    if (running) return
    running = true
    btnStart.classList.add('active')
    btnPause.classList.remove('active')
    requestAnimationFrame(loop)
  })

  btnPause.addEventListener('click', function () {
    running = false
    btnStart.classList.remove('active')
    btnPause.classList.add('active')
  })

  btnReset.addEventListener('click', function () {
    running = false
    btnStart.classList.remove('active')
    btnPause.classList.add('active')
    resetBattle()
  })

  btnClear.addEventListener('click', function () {
    running = false
    btnStart.classList.remove('active')
    btnPause.classList.add('active')
    saveSnapshot()
    grid.cells = grid.createEmptyGrid()
    grid.generation = 0
    draw()
    updateStats()
  })

  // 撤回按钮
  const btnUndo = document.getElementById('btn-undo')
  btnUndo.addEventListener('click', function () {
    undo()
  })

  // 键盘快捷键：Ctrl+Z / Cmd+Z 撤回
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      undo()
    }
  })

  // 随机按钮：大随机汤×3 在画布中央
  const btnRandom = document.getElementById('btn-random')
  btnRandom.addEventListener('click', function () {
    saveSnapshot()
    // 清空后生成大随机汤（占画布中央约60%面积）
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        grid.cells[r][c] = 0
      }
    }
    grid.generation = 0

    const soupSize = Math.floor(Math.min(cols, rows) * 0.6)
    const halfS = Math.floor(soupSize / 2)
    const cx = Math.floor(cols / 2)
    const cy = Math.floor(rows / 2)

    for (let dr = -halfS; dr < halfS; dr++) {
      for (let dc = -halfS; dc < halfS; dc++) {
        if (Math.random() < 0.45) {
          const r = cy + dr, c = cx + dc
          if (r >= 0 && r < rows && c >= 0 && c < cols) {
            // 随机分配种族
            grid.cells[r][c] = Math.floor(Math.random() * raceCount) + 1
          }
        }
      }
    }
    draw()
    updateStats()
  })

  // 速度滑块
  sliderSpeed.addEventListener('input', function () {
    speed = parseInt(sliderSpeed.value, 10)
    speedValue.textContent = speed + 'ms'
  })

  // 语言切换按钮
  btnLang.addEventListener('click', function () {
    switchLanguage(currentLang === 'zh' ? 'en' : 'zh')
  })

  // ---------- 种族按钮 + 图案库 ----------
  const patternPanel = document.getElementById('pattern-panel')
  const patternPanelTitle = document.getElementById('pattern-panel-title')
  const patternPanelClose = document.getElementById('pattern-panel-close')
  const patternGridAnimal = document.getElementById('pattern-grid-animal')
  const patternGridClassic = document.getElementById('pattern-grid-classic')

  let panelForRace = 1 // 当前打开面板是为哪个种族选图案

  // 更新种族按钮文字和可见性
  function updateRaceButtons() {
    for (let i = 0; i < 4; i++) {
      const btn = raceButtons[i]
      if (i < raceCount) {
        btn.style.display = ''
        const p = PATTERN_LIBRARY[racePatterns[i]]
        btn.textContent = p ? (currentLang === 'zh' ? p.name : p.nameEn) : '选择种族图案'
      } else {
        btn.style.display = 'none'
      }
    }
    btnAddRace.style.display = raceCount >= 4 ? 'none' : ''
  }

  // 设置当前手绘种族（高亮）
  function setActiveRace(raceIdx) {
    currentRace = raceIdx + 1
    raceButtons.forEach((btn, i) => {
      btn.classList.toggle('active', i === raceIdx)
    })
  }

  // 种族按钮点击：弹出图案库为该种族选图案
  raceButtons.forEach((btn, i) => {
    btn.addEventListener('click', function () {
      setActiveRace(i)
      // 弹出图案库
      panelForRace = i + 1
      patternPanelTitle.textContent = RACE_LABELS[i] + '种族 — 选择图案'
      patternPanel.classList.add('active')
      renderPatternPanel()
    })
  })

  // ＋ 添加种族
  btnAddRace.addEventListener('click', function () {
    if (raceCount >= 4) return
    raceCount++
    grid.raceCount = raceCount
    grid.raceColors = RACE_COLORS.slice(0, raceCount)
    updateRaceButtons()
    resetBattle()
  })

  // 渲染图案库面板
  let stampPattern = null // stamp模式下选中的图案ID

  function renderPatternPanel() {
    patternGridAnimal.innerHTML = ''
    patternGridClassic.innerHTML = ''

    Object.entries(PATTERN_LIBRARY).forEach(([id, p]) => {
      const div = document.createElement('div')
      div.className = 'pattern-item'
      // 高亮：当前种族已选 or stamp模式选中
      if (id === racePatterns[panelForRace - 1]) div.classList.add('selected')
      if (id === stampPattern) div.classList.add('stamp-active')
      div.textContent = currentLang === 'zh' ? p.name : p.nameEn
      div.dataset.patternId = id
      div.title = p.desc

      div.addEventListener('click', function (e) {
        e.stopPropagation()

        if (stampPattern === id) {
          // 再次点击同一图案：退出stamp模式
          stampPattern = null
          canvas.style.cursor = 'crosshair'
          patternPanelTitle.textContent = RACE_LABELS[panelForRace - 1] + '种族 — 选择图案'
        } else {
          // 进入stamp模式
          stampPattern = id
          canvas.style.cursor = 'cell'
          const pName = currentLang === 'zh' ? p.name : p.nameEn
          patternPanelTitle.textContent = '🖌️ 点击画布放置: ' + pName
          // 同时更新该种族的初始图案
          racePatterns[panelForRace - 1] = id
          updateRaceButtons()
        }
        renderPatternPanel()
      })

      if (p.category === 'animal') {
        patternGridAnimal.appendChild(div)
      } else {
        patternGridClassic.appendChild(div)
      }
    })
  }

  patternPanelClose.addEventListener('click', function () {
    patternPanel.classList.remove('active')
    // 保持 stamp 模式，不清除 stampPattern
  })

  // Canvas 点击 - stamp模式放置图案 或 手绘细胞
  canvas.addEventListener('click', function (e) {
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width / dpr / rect.width)
    const y = (e.clientY - rect.top) * (canvas.height / dpr / rect.height)
    const col = Math.floor(x / grid.cellSize)
    const row = Math.floor(y / grid.cellSize)

    saveSnapshot() // 保存操作前状态

    if (stampPattern) {
      placePattern(grid.cells, stampPattern, col, row, currentRace)
    } else {
      grid.toggleCell(row, col, currentRace)
    }
    draw()
    updateStats()
  })

  // ---------- 开始游戏遮罩 ----------
  const startOverlay = document.getElementById('start-overlay')
  const btnStartGame = document.getElementById('btn-start-game')

  btnStartGame.addEventListener('click', function () {
    startOverlay.classList.add('hidden')
    // 自动开始演化
    running = true
    btnStart.classList.add('active')
    btnPause.classList.remove('active')
    requestAnimationFrame(loop)
  })

  // 初始化
  resizeCanvas()
  updateRaceButtons()
  setActiveRace(0)
  switchLanguage('en');
  console.log('Battle Mode Ready')
})()
