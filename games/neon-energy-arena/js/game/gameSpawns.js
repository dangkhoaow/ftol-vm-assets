// 游戏生成相关函数
// 在屏幕边缘随机位置生成一个普通敌人，并加入 enemies 数组
function spawnEnemy() {
    const edge = Math.floor(Math.random() * 4); let x, y; const buffer = 50;
    switch (edge) {
        case 0: x = Math.random() * canvas.width; y = -buffer;
        break;
        case 1: x = canvas.width + buffer; y = Math.random() * canvas.height;
        break;
        case 2: x = Math.random() * canvas.width; y = canvas.height + buffer;
        break;
        case 3: x = -buffer; y = Math.random() * canvas.height;
        break;
    }
    enemies.push(new Enemy(x, y));
}

// 在屏幕边缘随机位置生成一颗陨石，最多同时存在2颗
function spawnAsteroid() {
    const edge = Math.floor(Math.random() * 4); let x, y; const buffer = 60;
    switch (edge) {
        case 0: x = Math.random() * canvas.width; y = -buffer; break;
        case 1: x = canvas.width + buffer; y = Math.random() * canvas.height; break;
        case 2: x = Math.random() * canvas.width; y = canvas.height + buffer; break;
        case 3: x = -buffer; y = Math.random() * canvas.height; break;
    }

    // 限制陨石数量最多为2个
    if (asteroids.length < 2) asteroids.push(new Asteroid(x, y));
}

// 当玩家分数达到对应里程碑时，生成一个 Boss 实例；若已存在 Boss 则不再重复生成
function spawnBoss() {
    if (boss) return;
    boss = new Boss(currentMilestoneIndex + 1);
}

// 在指定坐标 (x, y) 生成一个道具；若未提供坐标则随机生成在屏幕上方
// 道具类型按既定概率随机决定，并加入 powerUps 数组供后续逻辑处理
function spawnPowerUp(x, y) {
    const rand = Math.random();
    let type = 'health';
    if (rand > 0.75) type = 'weapon';
    else if (rand > 0.65) type = 'orbiter';
    else if (rand > 0.55) type = 'speed';
    else if (rand > 0.45) type = 'freeze';
    else if (rand > 0.35) type = 'bomb';

    const spawnX = x !== undefined ? x : Math.random() * (canvas.width - 40) + 20;
    const spawnY = y !== undefined ? y : -20;
    powerUps.push(new PowerUp(spawnX, spawnY, type));
}