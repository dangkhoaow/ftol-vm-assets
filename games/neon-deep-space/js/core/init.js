function init() {
    resizeCanvas();
    stars = [];
    for (let i = 0; i < 100; i++) stars.push(new Star());
    highScoreDisplay.innerText = highScore.toLocaleString();
    energyDisplay.innerText = currentEnergy.toLocaleString();
    renderShop(); 

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('keydown', (e) => {
        if(e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = true;
        if (e.key === 'Shift') {
            keys.shift = true;
            if (currentState === STATE.PLAYING) player.dash();
        }
        else if (e.key.toLowerCase() === 'f' && currentState === STATE.PLAYING) {
            player.switchWeapon();
        }
        else if (e.code === 'Space' && currentState === STATE.PLAYING) player.useBomb();
        // ESC键暂停功能
        else if (e.key === 'Escape' ) {
            if (currentState === STATE.PLAYING) pauseGame();
            else if (currentState === STATE.PAUSED) continueGame();
        }
    });
    window.addEventListener('keyup', (e) => { 
        if(e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = false; 
        if (e.key === 'Shift') keys.shift = false;
    });
    window.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
        mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    });
    window.addEventListener('mousedown', () => mouseBtn.left = true);
    window.addEventListener('mouseup', () => mouseBtn.left = false);

    document.getElementById('start-btn').addEventListener('click', ()=>{
        startScreen.classList.add('hidden');
        hud.style.display = 'flex';
        if(currentState === STATE.MENU)
            startGame();
    });
    document.getElementById('restart-btn').addEventListener('click', ()=>{
        gameOverScreen.classList.add('hidden');
        hud.style.display = 'flex';
        if(currentState === STATE.GAMEOVER)
            startGame();
    });
    document.getElementById('open-shop-btn').addEventListener('click', () => {
        renderShop();
        startScreen.classList.add('hidden');
        shopScreen.classList.remove('hidden');
    });
    document.getElementById('close-shop-btn').addEventListener('click', () => {
        shopScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
    });
    document.getElementById('return-menu-btn').addEventListener('click', returnToMenu); 
    muteBtn.addEventListener('click', () => AudioSys.toggleMute());

    // 绑定重置按钮
    document.getElementById('reset-save-btn').addEventListener('click', resetSave);
    
    // 绑定暂停菜单按钮
    document.getElementById('resume-btn').addEventListener('click', continueGame);
    document.getElementById('restart-pause-btn').addEventListener('click', restartGameFromPause);
    document.getElementById('return-menu-pause-btn').addEventListener('click', returnToMainMenuFromPause);

    requestAnimationFrame(gameLoop);
}

function resizeCanvas() { 
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function returnToMenu() {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    currentState = STATE.MENU;
    highScoreDisplay.innerText = highScore.toLocaleString();
    energyDisplay.innerText = currentEnergy.toLocaleString();
    AudioSys.stopBGM(); //返回主菜单暂停BGM
}

function startGame() {
    // 如果游戏状态已经是 PLAYING 且玩家已存在，避免重复初始化
    if (currentState === STATE.PLAYING && player && player.isAlive ) return;

    currentState = STATE.PLAYING;
    isPaused = false; // 确保游戏没有暂停
    globalDamageMult = 1 + ((playerUpgrades.damage || 0) * 0.1);
    globalEnemySpeedMult = 1 - Math.min(0.5, ((playerUpgrades.enemySlow || 0) * 0.1)); 
    globalRecoilMult = 1 - Math.min(0.8, ((playerUpgrades.recoil || 0) * 0.2)); 
    globalFreezeDurationBonus = (playerUpgrades.freezeDuration || 0) * 60; 
    globalOrbitRadiusAdd = (playerUpgrades.satRadius || 0) * 10;
    globalOrbitSpeedMult = 1 + ((playerUpgrades.satRadius || 0) * 0.15);

    AudioSys.init();
    AudioSys.startBGM();
    score = 0;
    bullets = [];
    enemies = [];
    enemyBullets = [];
    asteroids = [];
    particles = [];
    powerUps = [];
    boss = null;
    scoreEl.innerText = score;
    healthEl.innerText = 100;
    shieldEl.innerText = 0;
    weaponEl.innerText = "LV.1";
    bombEl.innerText = 1;
    speedEl.innerText = "LV.1";
    orbiterEl.innerText = "0";
    
    player = new Player();
    player.isAlive = true;
    // 确保所有升级值都有默认值，避免NaN计算
    player.health = 100 + ((playerUpgrades.health || 0) * 20);
    player.maxHealth = player.health; 
    player.bombs = 1 + (playerUpgrades.bomb || 0);
    player.maxBombs = 3 + (playerUpgrades.bomb || 0); 
    player.dashCooldownTime = 10000 - ((playerUpgrades.dashCD || 0) * 1000);
    if (player.dashCooldownTime < 2000) player.dashCooldownTime = 2000; 

    player.maxSatellites = 6 + (playerUpgrades.satellite || 0); 

    // --- 初始化卫星 ---
    const satelliteCount = playerUpgrades.satellite || 0;
    for(let i = 0; i < satelliteCount; i++) {
        // 传入索引 i 和 总数 satelliteCount
        player.orbiters.push(new Orbiter(i, satelliteCount));
    }
    freezeTimer = 0;
    difficultyFactor = 0.5;
    currentMilestoneIndex = 0;
    globalDifficultyMultiplier = 1;
    startScreen.classList.add('hidden');
    shopScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.style.display = 'flex';
    player.updateWeaponUI();
    updateHUD();
}
