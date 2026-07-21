import {
  DIFFICULTIES,
  STAGES,
  buildChallengeUrl,
  buildShareText,
  createGame,
  getCurrentStage,
  getShanghaiDateKey,
  getUpcomingStages,
  normalizeSeedText,
  pressStage,
  setDifficulty,
  startGame,
  tick,
  togglePause
} from "./game.js";

const canvas = document.querySelector("#gameCanvas");
const context = canvas.getContext("2d");
const startButton = document.querySelector("#startButton");
const pauseButton = document.querySelector("#pauseButton");
const soundButton = document.querySelector("#soundButton");
const seedForm = document.querySelector("#seedForm");
const seedInput = document.querySelector("#seedInput");
const loadSeedButton = document.querySelector("#loadSeedButton");
const copySeedButton = document.querySelector("#copySeedButton");
const todaySeedButton = document.querySelector("#todaySeedButton");
const scoreValue = document.querySelector("#scoreValue");
const frameValue = document.querySelector("#frameValue");
const beamValue = document.querySelector("#beamValue");
const glitchValue = document.querySelector("#glitchValue");
const comboValue = document.querySelector("#comboValue");
const nextStage = document.querySelector("#nextStage");
const queueList = document.querySelector("#queueList");
const screenNote = document.querySelector("#screenNote");
const seedText = document.querySelector("#seedText");
const bestText = document.querySelector("#bestText");
const goalText = document.querySelector("#goalText");
const resultPanel = document.querySelector("#resultPanel");
const resultTitle = document.querySelector("#resultTitle");
const resultCopy = document.querySelector("#resultCopy");
const shareButton = document.querySelector("#shareButton");
const stageButtons = Array.from(document.querySelectorAll("[data-stage]"));
const difficultyButtons = Array.from(document.querySelectorAll("[data-difficulty]"));

const todaySeed = getShanghaiDateKey();
const seed = normalizeSeedText(new URL(window.location.href).searchParams.get("seed"), todaySeed);
const soundStorageKey = "ftol:pixelpipelinereflex:sound-enabled";
let game = createGame({ seedText: seed, difficulty: "arcade" });
let lastFrame = performance.now();
let flash = null;
let audioContext = null;
let soundEnabled = localStorage.getItem(soundStorageKey) === "true";
let soundUnavailable = false;
let endedSoundPlayed = false;

seedText.textContent = seed;
seedInput.value = seed;
syncBest();
syncSoundButton();
render();

startButton.addEventListener("click", () => {
  startGame(game);
  flash = null;
  endedSoundPlayed = false;
  resultPanel.hidden = true;
  playTone(330, 0.07, "square", 0.04);
  syncHud();
});

pauseButton.addEventListener("click", () => {
  if (togglePause(game)) {
    playTone(game.mode === "paused" ? 220 : 440, 0.06, "triangle", 0.035);
  }
  syncHud();
});

soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem(soundStorageKey, String(soundEnabled));
  syncSoundButton();

  if (soundEnabled) {
    playTone(523, 0.08, "square", 0.045);
  }
});

seedForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadSeed(seedInput.value);
});

loadSeedButton.addEventListener("click", () => {
  loadSeed(seedInput.value);
});

todaySeedButton.addEventListener("click", () => {
  loadSeed(todaySeed);
});

copySeedButton.addEventListener("click", async () => {
  const challengeUrl = buildChallengeUrl(window.location.href, game.seedText);
  const text = challengeUrl || `Scanline Sprint challenge seed: ${game.seedText}`;
  await copyText(text, copySeedButton, challengeUrl ? "Copied link" : "Seed copied");
});

stageButtons.forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handleStage(button.dataset.stage);
  });
});

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (game.mode === "running") {
      return;
    }

    setDifficulty(game, button.dataset.difficulty);
    endedSoundPlayed = false;
    difficultyButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    resultPanel.hidden = true;
    syncBest();
    syncHud();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }

  const keyMap = {
    "1": "fetch",
    "2": "fifo",
    "3": "mix",
    "4": "light"
  };

  if (keyMap[event.key]) {
    event.preventDefault();
    handleStage(keyMap[event.key]);
  }

  if (event.code === "Space" || event.key === "Enter") {
    event.preventDefault();
    if (game.mode === "running") {
      handleStage(getCurrentStage(game)?.id);
    } else {
      startGame(game);
    }
  }

  if (event.key.toLowerCase() === "p") {
    if (togglePause(game)) {
      playTone(game.mode === "paused" ? 220 : 440, 0.06, "triangle", 0.035);
    }
  }
});

shareButton.addEventListener("click", async () => {
  await copyText(buildCopyText(), shareButton, "Copied");
});

function loadSeed(seedTextValue) {
  const nextSeed = normalizeSeedText(seedTextValue, todaySeed);
  game = createGame({ seedText: nextSeed, difficulty: game.difficulty });
  flash = null;
  endedSoundPlayed = false;
  resultPanel.hidden = true;
  seedInput.value = game.seedText;
  seedText.textContent = game.seedText;
  syncUrlSeed(game.seedText);
  syncBest();
  syncHud();
  render();
}

function handleStage(stageId) {
  const wasRunning = game.mode === "running";
  const accepted = pressStage(game, stageId);
  const stage = STAGES.find((candidate) => candidate.id === stageId);
  flash = {
    stageId,
    accepted,
    label: stage?.label ?? "Stage",
    until: performance.now() + 210
  };

  if (!wasRunning && game.mode === "running") {
    endedSoundPlayed = false;
    resultPanel.hidden = true;
  }

  playStageSound(stageId, accepted);
  syncHud();
  playResultSound();
}

function loop(now) {
  const delta = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  tick(game, delta);
  syncHud();
  playResultSound();
  render(now);
  window.requestAnimationFrame(loop);
}

window.requestAnimationFrame(loop);

function syncHud() {
  const current = getCurrentStage(game);
  const difficulty = DIFFICULTIES[game.difficulty];
  scoreValue.textContent = String(game.score);
  frameValue.textContent = `${game.completedFrames}/${game.settings.targetFrames}`;
  beamValue.textContent = game.mode === "running" ? game.beamRemaining.toFixed(1) : game.beamLimit.toFixed(1);
  glitchValue.textContent = `${game.glitches}/${game.settings.maxGlitches}`;
  comboValue.textContent = `x${game.combo}`;
  nextStage.textContent = current ? current.label : "Frame clear";
  goalText.textContent = `Stabilize ${difficulty.targetFrames} frames.`;
  screenNote.textContent = game.lastEvent;
  startButton.textContent = game.mode === "running" ? "Restart" : game.mode === "paused" ? "Restart" : "Start frame";
  pauseButton.disabled = game.mode !== "running" && game.mode !== "paused";
  pauseButton.textContent = game.mode === "paused" ? "Resume" : "Pause";

  stageButtons.forEach((button) => {
    const isExpected = button.dataset.stage === current?.id;
    button.classList.toggle("expected", isExpected);
    button.disabled = game.mode === "paused";
  });

  syncQueue();

  if (game.mode === "ended") {
    saveBest();
    resultPanel.hidden = false;
    resultTitle.textContent = game.result.message;
    resultCopy.textContent = buildCopyText();
  }
}

function syncQueue() {
  const upcoming = getUpcomingStages(game).slice(0, 9);
  queueList.replaceChildren(
    ...upcoming.map((stage, index) => {
      const item = document.createElement("li");
      item.style.setProperty("--stage-color", stage.color);
      item.textContent = stage.short;
      item.title = `${index + 1}. ${stage.label}`;
      if (index === 0) {
        item.className = "next";
      }
      return item;
    })
  );
}

function syncBest() {
  bestText.textContent = String(readBest());
}

function syncSoundButton() {
  soundButton.classList.toggle("active", soundEnabled);
  soundButton.disabled = soundUnavailable;
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.textContent = soundUnavailable ? "No sound" : soundEnabled ? "Sound on" : "Sound off";
}

function saveBest() {
  const best = readBest();
  if (game.score > best) {
    localStorage.setItem(bestKey(), String(game.score));
    syncBest();
  }
}

function readBest() {
  return Number(localStorage.getItem(bestKey()) ?? 0);
}

function bestKey() {
  return `ftol:pixelpipelinereflex:${game.seedText}:${game.difficulty}`;
}

function syncUrlSeed(seedTextValue) {
  const url = new URL(window.location.href);
  if (seedTextValue === todaySeed) {
    url.searchParams.delete("seed");
  } else {
    url.searchParams.set("seed", seedTextValue);
  }

  try {
    window.history.replaceState({}, "", url);
  } catch {
    // Some local file viewers restrict History updates; seed loading should still work.
  }
}

function buildCopyText() {
  const challengeUrl = buildChallengeUrl(window.location.href, game.seedText);
  if (!challengeUrl) {
    return `${buildShareText(game)} Replay seed: ${game.seedText}.`;
  }

  return `${buildShareText(game)} Play the same seed: ${challengeUrl}`;
}

async function copyText(text, button, copiedLabel) {
  const defaultLabel = button.dataset.defaultLabel ?? button.textContent;
  button.dataset.defaultLabel = defaultLabel;

  try {
    await navigator.clipboard.writeText(text);
    button.textContent = copiedLabel;
  } catch {
    screenNote.textContent = text;
    button.textContent = "Copy shown";
  }

  window.setTimeout(() => {
    button.textContent = button.dataset.defaultLabel;
  }, 950);
}

function playStageSound(stageId, accepted) {
  if (!accepted) {
    playTone(155, 0.13, "sawtooth", 0.035);
    return;
  }

  const frequencies = {
    fetch: 392,
    fifo: 523,
    mix: 659,
    light: 784
  };
  playTone(frequencies[stageId] ?? 440, 0.07, "square", 0.04);
}

function playResultSound() {
  if (game.mode !== "ended" || endedSoundPlayed) {
    return;
  }

  endedSoundPlayed = true;
  if (!soundEnabled) {
    return;
  }

  if (game.result?.type === "stable") {
    playTone(523, 0.08, "square", 0.045);
    window.setTimeout(() => playTone(659, 0.09, "square", 0.045), 95);
    window.setTimeout(() => playTone(784, 0.12, "square", 0.045), 195);
    return;
  }

  playTone(game.result?.type === "time" ? 247 : 185, 0.16, "sawtooth", 0.035);
}

function playTone(frequency, duration, type = "square", volume = 0.04) {
  if (!soundEnabled || soundUnavailable) {
    return;
  }

  void resumeAudio().then((audio) => {
    if (!audio) {
      return;
    }

    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime;
    const end = start + duration;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }).catch(disableSound);
}

async function resumeAudio() {
  const audio = getAudioContext();
  if (!audio) {
    disableSound();
    return null;
  }

  if (audio.state === "suspended") {
    await audio.resume();
  }

  return audio;
}

function getAudioContext() {
  if (audioContext) {
    return audioContext;
  }

  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  audioContext = new AudioContextClass();
  return audioContext;
}

function disableSound() {
  soundEnabled = false;
  soundUnavailable = true;
  localStorage.setItem(soundStorageKey, "false");
  syncSoundButton();
}

function render(now = performance.now()) {
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  drawBackdrop(width, height);
  drawSignalGrid(width, height, now);
  drawBeam(width, height);
  drawQueueTrack(width, height);
  drawStageMeters(width, height);
  drawOverlay(width, height);
}

function drawBackdrop(width, height) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#181712");
  gradient.addColorStop(0.42, "#101612");
  gradient.addColorStop(1, "#171019");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(248, 244, 227, 0.06)";
  context.lineWidth = 1;
  for (let x = 42; x < width; x += 42) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 38; y < height; y += 38) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawSignalGrid(width, height, now) {
  const columns = 16;
  const rows = 9;
  const gridWidth = width * 0.82;
  const gridHeight = height * 0.56;
  const cell = Math.min(gridWidth / columns, gridHeight / rows);
  const startX = (width - cell * columns) / 2;
  const startY = 68;
  const cells = game.outputCells.slice(-columns * rows);

  context.fillStyle = "rgba(248, 244, 227, 0.05)";
  roundRect(startX - 16, startY - 16, cell * columns + 32, cell * rows + 32, 8);
  context.fill();

  for (let index = 0; index < columns * rows; index += 1) {
    const x = startX + (index % columns) * cell;
    const y = startY + Math.floor(index / columns) * cell;
    const cellData = cells[index];
    const idlePulse = 0.08 + Math.sin(now / 280 + index) * 0.025;
    context.fillStyle = cellData ? cellData.color : `rgba(248, 244, 227, ${idlePulse})`;
    roundRect(x + 3, y + 3, cell - 6, cell - 6, 6);
    context.fill();

    if (cellData) {
      context.fillStyle = cellData.ink;
      context.font = `${Math.max(13, cell * 0.4)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(cellData.short, x + cell / 2, y + cell / 2 + 1);
    }
  }
}

function drawBeam(width, height) {
  const beamProgress = game.beamLimit > 0 ? 1 - game.beamRemaining / game.beamLimit : 0;
  const clamped = Math.max(0, Math.min(1, beamProgress));
  const trackX = width * 0.09;
  const trackY = height * 0.69;
  const trackWidth = width * 0.82;
  const trackHeight = 20;

  context.fillStyle = "rgba(248, 244, 227, 0.1)";
  roundRect(trackX, trackY, trackWidth, trackHeight, 8);
  context.fill();

  const fill = context.createLinearGradient(trackX, trackY, trackX + trackWidth, trackY);
  fill.addColorStop(0, "#41d6a1");
  fill.addColorStop(0.5, "#ffd166");
  fill.addColorStop(1, "#ef476f");
  context.fillStyle = fill;
  roundRect(trackX, trackY, trackWidth * clamped, trackHeight, 8);
  context.fill();

  const beamX = trackX + trackWidth * clamped;
  context.strokeStyle = "#f8f4e3";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(beamX, 58);
  context.lineTo(beamX, trackY + 46);
  context.stroke();
}

function drawQueueTrack(width, height) {
  const upcoming = getUpcomingStages(game).slice(0, 9);
  const startX = width * 0.11;
  const y = height * 0.78;
  const gap = width * 0.014;
  const size = Math.min(56, (width * 0.78 - gap * 8) / 9);

  upcoming.forEach((stage, index) => {
    const x = startX + index * (size + gap);
    context.fillStyle = stage.color;
    context.globalAlpha = index === 0 ? 1 : 0.56;
    roundRect(x, y, size, size, 8);
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = stage.ink;
    context.font = `700 ${Math.round(size * 0.42)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(stage.short, x + size / 2, y + size / 2 + 1);
  });
}

function drawStageMeters(width, height) {
  const meterWidth = width * 0.16;
  const meterHeight = 9;
  const gap = width * 0.035;
  const totalWidth = meterWidth * STAGES.length + gap * (STAGES.length - 1);
  const startX = (width - totalWidth) / 2;
  const y = height - 54;
  const current = getCurrentStage(game);

  STAGES.forEach((stage, index) => {
    const x = startX + index * (meterWidth + gap);
    context.fillStyle = "rgba(248, 244, 227, 0.11)";
    roundRect(x, y, meterWidth, meterHeight, 6);
    context.fill();
    context.fillStyle = stage.color;
    roundRect(x, y, meterWidth * (stage.id === current?.id ? 1 : 0.35), meterHeight, 6);
    context.fill();
    context.fillStyle = "rgba(248, 244, 227, 0.9)";
    context.font = "13px ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(stage.label, x + meterWidth / 2, y + 25);
  });
}

function drawOverlay(width, height) {
  if (game.mode === "ready" || game.mode === "paused" || game.mode === "ended") {
    context.fillStyle = "rgba(16, 14, 12, 0.62)";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#f8f4e3";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 34px ui-sans-serif, system-ui, sans-serif";
    const title = game.mode === "paused" ? "Beam paused" : game.mode === "ended" ? game.result.message : "Feed the pixel pipeline";
    context.fillText(title, width / 2, height / 2 - 18);
    context.font = "17px ui-sans-serif, system-ui, sans-serif";
    context.fillText("Tap the highlighted stage, or use keys 1-4.", width / 2, height / 2 + 24);
  }

  if (flash && flash.until > performance.now()) {
    context.save();
    context.fillStyle = flash.accepted ? "rgba(65, 214, 161, 0.19)" : "rgba(239, 71, 111, 0.22)";
    context.fillRect(0, 0, width, height);
    context.restore();
  }
}

function roundRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}
