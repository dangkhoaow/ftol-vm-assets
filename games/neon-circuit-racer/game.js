(() => {
  "use strict";

  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    speed: document.querySelector("#speedValue"),
    speedMeter: document.querySelector("#speedMeter"),
    distance: document.querySelector("#distanceValue"),
    score: document.querySelector("#scoreValue"),
    combo: document.querySelector("#comboValue"),
    best: document.querySelector("#bestValue"),
    nitro: document.querySelector("#nitroValue"),
    nitroMeter: document.querySelector("#nitroMeter"),
    mission: document.querySelector("#missionProgress"),
    zone: document.querySelector("#zoneValue"),
    shield: document.querySelector("#shieldStatus"),
    startOverlay: document.querySelector("#startOverlay"),
    pauseOverlay: document.querySelector("#pauseOverlay"),
    gameOverOverlay: document.querySelector("#gameOverOverlay"),
    finalScore: document.querySelector("#finalScore"),
    finalDistance: document.querySelector("#finalDistance"),
    finalCombo: document.querySelector("#finalCombo"),
    pauseIcon: document.querySelector("#pauseIcon"),
    soundIcon: document.querySelector("#soundIcon"),
  };

  const W = canvas.width;
  const H = canvas.height;
  const ROAD_TOP = 225;
  const ROAD_BOTTOM = 1500;
  const LANES = 3;
  const COLORS = {
    cyan: "#43e8ff",
    lime: "#c8ff3d",
    red: "#ff4f68",
    amber: "#ffc247",
    white: "#f7fbff",
    asphalt: "#171b22",
  };

  const state = {
    running: false,
    paused: false,
    over: false,
    time: 0,
    roadOffset: 0,
    speed: 0,
    targetSpeed: 220,
    distance: 0,
    score: 0,
    combo: 1,
    maxCombo: 1,
    comboTimer: 0,
    nitro: 100,
    nitroActive: false,
    shield: true,
    invulnerable: 0,
    shake: 0,
    spawnTimer: 0,
    pickupTimer: 5,
    best: Number(localStorage.getItem("ftol:neoncircuitracer:best") || 0),
    sound: localStorage.getItem("ftol:neoncircuitracer:sound") !== "off",
    lastFrame: performance.now(),
  };

  const player = {
    lane: 1,
    x: W / 2,
    targetX: W / 2,
    y: 1285,
    width: 136,
    height: 250,
    tilt: 0,
  };

  let traffic = [];
  let pickups = [];
  let particles = [];
  let skyline = [];
  let audioContext = null;

  function roadBoundsAt(y) {
    const t = Math.max(0, Math.min(1, (y - ROAD_TOP) / (ROAD_BOTTOM - ROAD_TOP)));
    const halfWidth = 105 + t * 395;
    return { left: W / 2 - halfWidth, right: W / 2 + halfWidth, width: halfWidth * 2 };
  }

  function laneX(lane, y = player.y) {
    const bounds = roadBoundsAt(y);
    const laneWidth = bounds.width / LANES;
    return bounds.left + laneWidth * (lane + 0.5);
  }

  function seededNoise(index) {
    const x = Math.sin(index * 932.17) * 43758.5453;
    return x - Math.floor(x);
  }

  function createSkyline() {
    skyline = [];
    for (let i = 0; i < 36; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      skyline.push({
        side,
        x: side < 0 ? seededNoise(i) * 210 : W - seededNoise(i) * 210,
        width: 42 + seededNoise(i + 2) * 80,
        height: 90 + seededNoise(i + 4) * 280,
        lights: 2 + Math.floor(seededNoise(i + 8) * 5),
      });
    }
  }

  function resetGame() {
    state.running = true;
    state.paused = false;
    state.over = false;
    state.time = 0;
    state.roadOffset = 0;
    state.speed = 120;
    state.targetSpeed = 220;
    state.distance = 0;
    state.score = 0;
    state.combo = 1;
    state.maxCombo = 1;
    state.comboTimer = 0;
    state.nitro = 100;
    state.nitroActive = false;
    state.shield = true;
    state.invulnerable = 0;
    state.shake = 0;
    state.spawnTimer = 0.8;
    state.pickupTimer = 5;
    player.lane = 1;
    player.x = laneX(1);
    player.targetX = player.x;
    player.tilt = 0;
    traffic = [];
    pickups = [];
    particles = [];
    hideAllOverlays();
    updateUI();
    playTone(110, 0.18, "sawtooth", 0.035);
  }

  function hideAllOverlays() {
    ui.startOverlay.classList.remove("is-visible");
    ui.pauseOverlay.classList.remove("is-visible");
    ui.gameOverOverlay.classList.remove("is-visible");
  }

  function moveLane(direction) {
    if (!state.running || state.paused || state.over) return;
    const nextLane = Math.max(0, Math.min(LANES - 1, player.lane + direction));
    if (nextLane === player.lane) return;
    player.lane = nextLane;
    player.targetX = laneX(nextLane);
    player.tilt = direction * 0.16;
    emitParticles(player.x, player.y + 96, 8, COLORS.cyan, 1.5);
    playTone(180 + nextLane * 35, 0.06, "square", 0.018);
  }

  function useNitro(active = true) {
    if (!state.running || state.paused || state.over) return;
    state.nitroActive = active && state.nitro > 1;
  }

  function togglePause(force) {
    if (!state.running || state.over) return;
    state.paused = typeof force === "boolean" ? force : !state.paused;
    ui.pauseOverlay.classList.toggle("is-visible", state.paused);
    ui.pauseIcon.textContent = state.paused ? "▶" : "Ⅱ";
    document
      .querySelector("#pauseButton")
      .setAttribute("aria-label", state.paused ? "Resume game" : "Pause game");
    if (!state.paused) state.lastFrame = performance.now();
  }

  function endGame() {
    state.over = true;
    state.running = false;
    state.nitroActive = false;
    state.best = Math.max(state.best, Math.floor(state.score));
    localStorage.setItem("ftol:neoncircuitracer:best", String(state.best));
    ui.finalScore.textContent = formatScore(state.score);
    ui.finalDistance.textContent = `${state.distance.toFixed(2)} km`;
    ui.finalCombo.textContent = `×${state.maxCombo}`;
    ui.gameOverOverlay.classList.add("is-visible");
    updateUI();
    playTone(80, 0.42, "sawtooth", 0.05);
  }

  function spawnTraffic() {
    const available = [0, 1, 2].filter(
      (lane) => !traffic.some((car) => car.lane === lane && car.y < 510),
    );
    if (!available.length) return;
    const lane = available[Math.floor(Math.random() * available.length)];
    const palette = [COLORS.red, COLORS.amber, "#a77bff", "#67f29c", "#f0f4f7"];
    traffic.push({
      lane,
      x: laneX(lane, ROAD_TOP + 80),
      y: ROAD_TOP + 50,
      width: 72,
      height: 136,
      speedFactor: 0.28 + Math.random() * 0.34,
      color: palette[Math.floor(Math.random() * palette.length)],
      passed: false,
      nearMissed: false,
      seed: Math.random() * 100,
    });
  }

  function spawnPickup() {
    const lane = Math.floor(Math.random() * LANES);
    pickups.push({
      lane,
      x: laneX(lane, ROAD_TOP + 30),
      y: ROAD_TOP + 30,
      radius: 22,
      type: state.shield && Math.random() > 0.35 ? "nitro" : Math.random() > 0.45 ? "shield" : "nitro",
      spin: 0,
    });
  }

  function update(dt) {
    if (!state.running || state.paused || state.over) return;

    state.time += dt;
    const nitroBoost = state.nitroActive && state.nitro > 0;
    const desiredSpeed = nitroBoost ? 360 : state.targetSpeed + Math.min(80, state.distance * 5);
    state.speed += (desiredSpeed - state.speed) * Math.min(1, dt * 2.5);

    if (nitroBoost) {
      state.nitro = Math.max(0, state.nitro - dt * 25);
      emitParticles(player.x + (Math.random() - 0.5) * 45, player.y + 115, 2, COLORS.cyan, 3);
      if (state.nitro <= 0) state.nitroActive = false;
    } else {
      state.nitro = Math.min(100, state.nitro + dt * 2.6);
    }

    const speedScale = state.speed / 220;
    state.roadOffset += dt * 840 * speedScale;
    state.distance += dt * state.speed / 3600;
    state.score += dt * state.speed * state.combo * 0.64;
    state.spawnTimer -= dt;
    state.pickupTimer -= dt;
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    state.invulnerable = Math.max(0, state.invulnerable - dt);
    state.shake = Math.max(0, state.shake - dt * 18);

    if (state.comboTimer === 0 && state.combo > 1) state.combo = Math.max(1, state.combo - 1);
    if (state.spawnTimer <= 0) {
      spawnTraffic();
      state.spawnTimer = Math.max(0.46, 1.15 - state.distance * 0.025) + Math.random() * 0.4;
    }
    if (state.pickupTimer <= 0) {
      spawnPickup();
      state.pickupTimer = 7 + Math.random() * 5;
    }

    player.x += (player.targetX - player.x) * Math.min(1, dt * 11);
    player.tilt *= Math.pow(0.035, dt);

    const playerRect = {
      x: player.x - player.width * 0.31,
      y: player.y - player.height * 0.38,
      w: player.width * 0.62,
      h: player.height * 0.76,
    };

    traffic.forEach((car) => {
      const movement = dt * (470 + state.speed * 1.6) * (1 - car.speedFactor);
      car.y += movement;
      const scale = 0.45 + ((car.y - ROAD_TOP) / (ROAD_BOTTOM - ROAD_TOP)) * 0.72;
      car.width = 100 * scale;
      car.height = 190 * scale;
      car.x = laneX(car.lane, car.y);

      const carRect = {
        x: car.x - car.width * 0.32,
        y: car.y - car.height * 0.4,
        w: car.width * 0.64,
        h: car.height * 0.8,
      };

      if (!car.passed && car.y > player.y + 125) {
        car.passed = true;
        const gap = Math.abs(car.x - player.x);
        if (gap < 250 && car.lane !== player.lane) {
          car.nearMissed = true;
          state.combo = Math.min(9, state.combo + 1);
          state.maxCombo = Math.max(state.maxCombo, state.combo);
          state.comboTimer = 4;
          state.nitro = Math.min(100, state.nitro + 12);
          state.score += 350 * state.combo;
          emitParticles(car.x, player.y, 14, COLORS.lime, 2);
          playTone(420 + state.combo * 35, 0.08, "triangle", 0.025);
        }
      }

      if (state.invulnerable <= 0 && intersects(playerRect, carRect)) {
        collision(car);
      }
    });

    traffic = traffic.filter((car) => car.y < H + 260);

    pickups.forEach((pickup) => {
      pickup.y += dt * (520 + state.speed * 1.3);
      pickup.x = laneX(pickup.lane, pickup.y);
      pickup.spin += dt * 4;
      const scale = 0.4 + ((pickup.y - ROAD_TOP) / (ROAD_BOTTOM - ROAD_TOP)) * 0.85;
      pickup.radius = 28 * scale;

      if (
        Math.abs(pickup.x - player.x) < player.width * 0.46 &&
        Math.abs(pickup.y - player.y) < player.height * 0.42
      ) {
        pickup.collected = true;
        if (pickup.type === "shield") {
          state.shield = true;
        } else {
          state.nitro = Math.min(100, state.nitro + 42);
        }
        state.score += 500;
        emitParticles(pickup.x, pickup.y, 22, pickup.type === "shield" ? COLORS.cyan : COLORS.lime, 2.8);
        playTone(620, 0.13, "sine", 0.035);
      }
    });

    pickups = pickups.filter((pickup) => !pickup.collected && pickup.y < H + 120);

    particles.forEach((particle) => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
      particle.vx *= Math.pow(0.4, dt);
      particle.vy *= Math.pow(0.65, dt);
    });
    particles = particles.filter((particle) => particle.life > 0);

    updateUI();
  }

  function collision(car) {
    state.invulnerable = 1.25;
    state.shake = 15;
    state.combo = 1;
    state.comboTimer = 0;
    emitParticles(player.x, player.y - 35, 32, COLORS.red, 3.5);

    if (state.shield) {
      state.shield = false;
      state.speed *= 0.62;
      car.y += 230;
      playTone(95, 0.22, "square", 0.05);
    } else {
      endGame();
    }
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function emitParticles(x, y, amount, color, power) {
    for (let i = 0; i < amount; i += 1) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 240 * power,
        vy: (Math.random() - 0.15) * 220 * power,
        radius: 2 + Math.random() * 5,
        life: 0.25 + Math.random() * 0.7,
        maxLife: 0.95,
        color,
      });
    }
  }

  function updateUI() {
    const displayedSpeed = Math.max(0, Math.round(state.speed));
    ui.speed.textContent = String(displayedSpeed);
    ui.speedMeter.style.width = `${Math.min(100, displayedSpeed / 3.6)}%`;
    ui.distance.textContent = state.distance.toFixed(2);
    ui.score.textContent = formatScore(state.score);
    ui.combo.textContent = `×${state.combo}`;
    ui.best.textContent = formatScore(state.best);
    ui.nitro.textContent = `${Math.round(state.nitro)}%`;
    ui.nitroMeter.style.width = `${state.nitro}%`;
    ui.mission.textContent = `${Math.min(5, state.distance).toFixed(2)} / 5.00 km`;
    ui.zone.textContent = String(Math.min(99, 1 + Math.floor(state.distance / 1.5))).padStart(2, "0");
    ui.shield.textContent = state.shield ? "Shield ready" : "Shield spent";
    ui.shield.classList.toggle("is-empty", !state.shield);
  }

  function formatScore(value) {
    return String(Math.floor(value)).padStart(6, "0");
  }

  function draw() {
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawSky();
    drawCity();
    drawRoad();
    drawPickups();
    drawTraffic();
    drawParticles();
    drawPlayer();
    drawSpeedLines();
    ctx.restore();
  }

  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#070914");
    sky.addColorStop(0.36, "#151529");
    sky.addColorStop(0.68, "#0b1118");
    sky.addColorStop(1, "#05070a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#43e8ff";
    ctx.beginPath();
    ctx.arc(W / 2, 174, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(W / 2, 174, 0, W / 2, 174, 250);
    glow.addColorStop(0, "rgba(67,232,255,0.3)");
    glow.addColorStop(1, "rgba(67,232,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(200, 0, 500, 450);
    ctx.restore();
  }

  function drawCity() {
    ctx.save();
    ctx.translate(0, 290);
    skyline.forEach((building, index) => {
      const x = building.side < 0 ? building.x - building.width : building.x;
      const y = 40 - building.height;
      ctx.fillStyle = index % 3 === 0 ? "#101521" : "#0c1119";
      ctx.fillRect(x, y, building.width, building.height + 180);
      ctx.fillStyle = index % 4 === 0 ? "rgba(255,79,104,0.65)" : "rgba(67,232,255,0.52)";
      for (let row = 0; row < building.lights; row += 1) {
        const lightY = y + 18 + row * 27;
        ctx.fillRect(x + 10, lightY, 5, 9);
        if (building.width > 65) ctx.fillRect(x + 31, lightY, 5, 9);
      }
    });
    ctx.restore();

    ctx.fillStyle = "rgba(200,255,61,0.8)";
    ctx.fillRect(74, 194, 86, 5);
    ctx.fillStyle = "rgba(67,232,255,0.72)";
    ctx.fillRect(W - 188, 232, 114, 4);
  }

  function drawRoad() {
    const top = roadBoundsAt(ROAD_TOP);
    const bottom = roadBoundsAt(ROAD_BOTTOM);

    ctx.beginPath();
    ctx.moveTo(top.left, ROAD_TOP);
    ctx.lineTo(top.right, ROAD_TOP);
    ctx.lineTo(bottom.right, ROAD_BOTTOM);
    ctx.lineTo(bottom.left, ROAD_BOTTOM);
    ctx.closePath();
    const asphalt = ctx.createLinearGradient(0, ROAD_TOP, 0, ROAD_BOTTOM);
    asphalt.addColorStop(0, "#20242b");
    asphalt.addColorStop(1, "#111419");
    ctx.fillStyle = asphalt;
    ctx.fill();

    drawRoadShoulder(-1);
    drawRoadShoulder(1);

    for (let lane = 1; lane < LANES; lane += 1) {
      for (let segment = -1; segment < 14; segment += 1) {
        const phase = (state.roadOffset * 0.7) % 132;
        const y1 = ROAD_TOP + segment * 132 + phase;
        const y2 = y1 + 62;
        if (y2 < ROAD_TOP || y1 > ROAD_BOTTOM) continue;
        const b1 = roadBoundsAt(y1);
        const b2 = roadBoundsAt(y2);
        const x1 = b1.left + (b1.width * lane) / LANES;
        const x2 = b2.left + (b2.width * lane) / LANES;
        const lineWidth1 = 2 + ((y1 - ROAD_TOP) / (ROAD_BOTTOM - ROAD_TOP)) * 8;
        const lineWidth2 = 2 + ((y2 - ROAD_TOP) / (ROAD_BOTTOM - ROAD_TOP)) * 8;
        ctx.beginPath();
        ctx.moveTo(x1 - lineWidth1, y1);
        ctx.lineTo(x1 + lineWidth1, y1);
        ctx.lineTo(x2 + lineWidth2, y2);
        ctx.lineTo(x2 - lineWidth2, y2);
        ctx.closePath();
        ctx.fillStyle = "rgba(235,242,248,0.64)";
        ctx.fill();
      }
    }

    for (let i = 0; i < 18; i += 1) {
      const y = ROAD_TOP + ((i * 98 + state.roadOffset) % (ROAD_BOTTOM - ROAD_TOP));
      const bounds = roadBoundsAt(y);
      const size = 2 + ((y - ROAD_TOP) / (ROAD_BOTTOM - ROAD_TOP)) * 5;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(W / 2 - 210 + (i % 7) * 63, y, size, size * 3);
      if (i % 3 === 0) {
        ctx.fillStyle = i % 2 ? "rgba(67,232,255,0.6)" : "rgba(255,79,104,0.6)";
        ctx.fillRect(bounds.left - 22, y, size * 3, size);
        ctx.fillRect(bounds.right + 14, y, size * 3, size);
      }
    }
  }

  function drawRoadShoulder(side) {
    const phase = state.roadOffset % 90;
    for (let i = -1; i < 18; i += 1) {
      const y1 = ROAD_TOP + i * 90 + phase;
      const y2 = y1 + 45;
      if (y2 < ROAD_TOP || y1 > ROAD_BOTTOM) continue;
      const b1 = roadBoundsAt(y1);
      const b2 = roadBoundsAt(y2);
      const edge1 = side < 0 ? b1.left : b1.right;
      const edge2 = side < 0 ? b2.left : b2.right;
      const outer1 = edge1 + side * 18;
      const outer2 = edge2 + side * 24;
      ctx.beginPath();
      ctx.moveTo(edge1, y1);
      ctx.lineTo(outer1, y1);
      ctx.lineTo(outer2, y2);
      ctx.lineTo(edge2, y2);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? COLORS.cyan : COLORS.red;
      ctx.globalAlpha = 0.72;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawCar(car, isPlayer = false) {
    ctx.save();
    ctx.translate(car.x, car.y);
    if (isPlayer) ctx.rotate(player.tilt);
    const width = car.width;
    const height = car.height;

    ctx.shadowColor = car.color;
    ctx.shadowBlur = isPlayer ? 24 : 13;
    ctx.fillStyle = car.color;
    roundedRect(-width * 0.42, -height * 0.5, width * 0.84, height, width * 0.14);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#0b1118";
    roundedRect(-width * 0.3, -height * 0.24, width * 0.6, height * 0.39, width * 0.09);
    ctx.fill();

    ctx.fillStyle = "rgba(190,235,255,0.36)";
    ctx.beginPath();
    ctx.moveTo(-width * 0.24, -height * 0.2);
    ctx.lineTo(width * 0.24, -height * 0.2);
    ctx.lineTo(width * 0.18, -height * 0.06);
    ctx.lineTo(-width * 0.18, -height * 0.06);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#07090c";
    ctx.fillRect(-width * 0.53, -height * 0.28, width * 0.13, height * 0.22);
    ctx.fillRect(width * 0.4, -height * 0.28, width * 0.13, height * 0.22);
    ctx.fillRect(-width * 0.53, height * 0.18, width * 0.13, height * 0.22);
    ctx.fillRect(width * 0.4, height * 0.18, width * 0.13, height * 0.22);

    ctx.fillStyle = isPlayer ? COLORS.lime : "#ff324f";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
    ctx.fillRect(-width * 0.29, height * 0.38, width * 0.18, height * 0.045);
    ctx.fillRect(width * 0.11, height * 0.38, width * 0.18, height * 0.045);

    if (isPlayer) {
      ctx.fillStyle = "#0a0e12";
      ctx.fillRect(-width * 0.32, height * 0.29, width * 0.64, height * 0.05);
      ctx.fillStyle = COLORS.lime;
      ctx.fillRect(-width * 0.04, -height * 0.46, width * 0.08, height * 0.72);
    }

    ctx.restore();
  }

  function drawTraffic() {
    [...traffic]
      .sort((a, b) => a.y - b.y)
      .forEach((car) => drawCar(car));
  }

  function drawPlayer() {
    if (state.invulnerable > 0 && Math.floor(state.invulnerable * 12) % 2 === 0) return;
    if (state.shield) {
      ctx.save();
      ctx.strokeStyle = "rgba(67,232,255,0.75)";
      ctx.lineWidth = 5;
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.ellipse(player.x, player.y, player.width * 0.6, player.height * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawCar({ ...player, color: "#f3f6f8" }, true);

    if (state.nitroActive && state.nitro > 0) {
      ctx.save();
      const flame = ctx.createLinearGradient(0, player.y + 70, 0, player.y + 230);
      flame.addColorStop(0, "rgba(255,255,255,0.95)");
      flame.addColorStop(0.2, "rgba(67,232,255,0.95)");
      flame.addColorStop(1, "rgba(67,232,255,0)");
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(player.x - 35, player.y + 95);
      ctx.lineTo(player.x - 6, player.y + 225 + Math.random() * 45);
      ctx.lineTo(player.x + 4, player.y + 95);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(player.x + 8, player.y + 95);
      ctx.lineTo(player.x + 32, player.y + 225 + Math.random() * 45);
      ctx.lineTo(player.x + 40, player.y + 95);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPickups() {
    pickups.forEach((pickup) => {
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.rotate(pickup.spin);
      const color = pickup.type === "shield" ? COLORS.cyan : COLORS.lime;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, pickup.radius * 0.12);
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        const x = Math.cos(angle) * pickup.radius;
        const y = Math.sin(angle) * pickup.radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.rotate(-pickup.spin);
      ctx.fillStyle = color;
      ctx.font = `900 ${Math.max(12, pickup.radius * 0.78)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pickup.type === "shield" ? "S" : "N", 0, 1);
      ctx.restore();
    });
  }

  function drawParticles() {
    particles.forEach((particle) => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 9;
      ctx.fillRect(particle.x, particle.y, particle.radius, particle.radius * 2.4);
      ctx.restore();
    });
  }

  function drawSpeedLines() {
    if (state.speed < 285) return;
    ctx.save();
    ctx.strokeStyle = "rgba(195,242,255,0.24)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 20; i += 1) {
      const x = (seededNoise(i + Math.floor(state.time * 8)) * W) | 0;
      const y = (seededNoise(i + 40) * H) | 0;
      const length = 45 + seededNoise(i + 80) * 140;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + length);
      ctx.stroke();
    }
    ctx.restore();
  }

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function playTone(frequency, duration, type = "sine", volume = 0.025) {
    if (!state.sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(45, frequency * 0.72),
        audioContext.currentTime + duration,
      );
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch {
      state.sound = false;
    }
  }

  function loop(now) {
    const dt = Math.min(0.034, (now - state.lastFrame) / 1000);
    state.lastFrame = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function bindHoldButton(button, onStart, onEnd) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      onStart();
      button.setPointerCapture?.(event.pointerId);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
      button.addEventListener(eventName, () => onEnd?.());
    });
  }

  document.querySelector("#startButton").addEventListener("click", resetGame);
  document.querySelector("#restartButton").addEventListener("click", resetGame);
  document.querySelector("#resumeButton").addEventListener("click", () => togglePause(false));
  document.querySelector("#pauseButton").addEventListener("click", () => togglePause());
  document.querySelector("#soundButton").addEventListener("click", () => {
    state.sound = !state.sound;
    localStorage.setItem("ftol:neoncircuitracer:sound", state.sound ? "on" : "off");
    ui.soundIcon.textContent = state.sound ? "♪" : "×";
    document.querySelector("#soundButton").setAttribute("aria-label", state.sound ? "Mute sound" : "Enable sound");
    if (state.sound) playTone(440, 0.08, "sine", 0.025);
  });

  bindHoldButton(document.querySelector("#leftButton"), () => moveLane(-1));
  bindHoldButton(document.querySelector("#rightButton"), () => moveLane(1));
  bindHoldButton(
    document.querySelector("#nitroButton"),
    () => useNitro(true),
    () => useNitro(false),
  );

  window.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "a", "d", "w", "A", "D", "W"].includes(event.key)) {
      event.preventDefault();
    }
    if (event.repeat && !["ArrowUp", "w", "W", " "].includes(event.key)) return;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") moveLane(-1);
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") moveLane(1);
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") state.targetSpeed = 275;
    if (event.key === " ") useNitro(true);
    if (event.key.toLowerCase() === "p" || event.key === "Escape") togglePause();
    if (event.key === "Enter" && (!state.running || state.over)) resetGame();
  });

  window.addEventListener("keyup", (event) => {
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") state.targetSpeed = 220;
    if (event.key === " ") useNitro(false);
  });

  window.addEventListener("blur", () => {
    if (state.running && !state.paused) togglePause(true);
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || !state.running || state.paused) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    if (x < 0.38) moveLane(-1);
    else if (x > 0.62) moveLane(1);
    else useNitro(true);
  });

  canvas.addEventListener("pointerup", () => useNitro(false));
  canvas.addEventListener("pointercancel", () => useNitro(false));

  createSkyline();
  ui.best.textContent = formatScore(state.best);
  ui.soundIcon.textContent = state.sound ? "♪" : "×";
  draw();
  requestAnimationFrame(loop);
})();
