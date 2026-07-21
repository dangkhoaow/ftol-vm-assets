// 游戏结束相关函数
function gameOver() {
    currentState = STATE.GAMEOVER;
    const energyGained = Math.floor(score / 10);
    currentEnergy += energyGained;
    let isNewRecord = false;
    if (score > highScore) {
        highScore = score;
        isNewRecord = true;
    }
    saveGameData();

    if (isNewRecord) {
        finalScoreEl.innerHTML = `${score} <span class="text-gold">(new record!)</span>`;
    } else {
        finalScoreEl.innerText = score;
    }
    energyGainedEl.innerText = energyGained.toLocaleString();

    hud.style.display = 'none';
    gameOverScreen.classList.remove('hidden');
    createExplosion(player.x, player.y, '#0ff', 50);
    AudioSys.playExplosion(true);

    bullets = [];
    enemies = [];
    enemyBullets = [];
    asteroids = [];
    particles = [];
    powerUps = [];
    boss = null;
    player.isAlive = false;
}
