// 游戏主循环
function gameLoop() {
    ctx.fillStyle = 'rgba(5, 5, 16, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (shakeDuration > 0) {
        const dx = (Math.random() - 0.5) * shakeMagnitude;
        const dy = (Math.random() - 0.5) * shakeMagnitude;
        ctx.translate(dx, dy);
        shakeDuration--;
    }

    if (freezeTimer > 0) {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "30px Arial"; ctx.fillStyle = "rgba(0, 255, 255, 0.5)"; ctx.textAlign = "center";
        ctx.fillText("TIME FREEZE", canvas.width / 2, canvas.height / 2);
        freezeTimer--;
    }

    stars.forEach(star => { star.update(); star.draw(); });

    // 只有在游戏进行状态且未暂停时才执行游戏更新逻辑
    if (currentState === STATE.PLAYING && !isPaused) {
        if (score < 1500) {
            difficultyFactor = 0.5 + (score / 1500) * 0.5; globalDifficultyMultiplier = 1;
        } else {
            difficultyFactor = 1.0;
            globalDifficultyMultiplier = 1 + Math.floor((score - 1500) / 2000) * 0.5;
        }

        if (currentMilestoneIndex < bossMilestones.length && score >= bossMilestones[currentMilestoneIndex]) {
            spawnBoss();
            currentMilestoneIndex++;
            screenShake(20, 10);
        }

        // 修改陨石生成频率，大幅增加生成间隔
        asteroidSpawnTimer++;
        // 将生成间隔从250增加到500，大幅降低陨石的生成频率
        if (asteroidSpawnTimer > 500) { 
            spawnAsteroid();
            asteroidSpawnTimer = 0;
        }

        if (!boss || !boss.entered) {
            enemySpawnTimer++;
            // 优化敌人生成频率：提高最小生成间隔，减缓随分数增加的生成速度，限制敌人数量
            // 1. 将最小生成间隔从10帧提高到30帧
            // 2. 增大分数除数，从400改为800，减缓频率提高速度
            // 3. 添加敌人数量上限检查，避免同时出现过多敌人
            let spawnRate = Math.max(30, 60 - Math.floor(score / 800));
            if (enemySpawnTimer > spawnRate && enemies.length < 20) { 
                spawnEnemy(); 
                enemySpawnTimer = 0; 
            }
        }

        powerUpSpawnTimer++;
        if (powerUpSpawnTimer > 400) {
            if (Math.random() < 0.5)
                spawnPowerUp();
            powerUpSpawnTimer = 0;
        }

        player.update();
        player.draw();
        updateHUD();
        bullets.forEach((bullet, bIndex) => {
            bullet.update(); bullet.draw();
            if (bullet.x < -50 || bullet.x > canvas.width + 50 || bullet.y < -50 || bullet.y > canvas.height + 50 || (bullet.life !== Infinity && bullet.life <= 0)) {
                setTimeout(() => bullets.splice(bIndex, 1), 0);
            }
        });

        asteroids.forEach((asteroid, aIndex) => {
            asteroid.update();
            asteroid.draw();
            if (!player.isInvincible) {
                const dist = Math.hypot(player.x - asteroid.x, player.y - asteroid.y);
                if (dist - asteroid.radius - player.radius < 1) {
                    if (player.shield > 0) {
                        player.shield--;
                        createExplosion(player.x, player.y, '#fff', 5);
                    } else {
                        player.health -= 20;
                        screenShake(10, 20);
                        createExplosion(player.x, player.y, '#f05', 10);
                        AudioSys.playExplosion();
                    }
                    createExplosion(asteroid.x, asteroid.y, '#888', 15);
                    if (player.health <= 0) gameOver();
                    setTimeout(() => asteroids.splice(aIndex, 1), 0);
                }
            }
            bullets.forEach((bullet, bIndex) => {
                const dist = Math.hypot(bullet.x - asteroid.x, bullet.y - asteroid.y);
                if (dist - asteroid.radius - bullet.radius < 1) {
                    const destroyed = asteroid.takeDamage(bullet.damage);
                    bullet.pierce--;
                    if (bullet.pierce <= 0) setTimeout(() => bullets.splice(bIndex, 1), 0);
                    createExplosion(bullet.x, bullet.y, '#888', 2);
                    if (destroyed) {
                        asteroid.destroy();
                        setTimeout(() => asteroids.splice(aIndex, 1), 0);
                    }
                }
            });
            enemyBullets.forEach((eb, ebIndex) => {
                const dist = Math.hypot(eb.x - asteroid.x, eb.y - asteroid.y);
                if (dist - asteroid.radius - eb.radius < 1) {
                    const destroyed = asteroid.takeDamage(2);
                    createExplosion(eb.x, eb.y, '#888', 2);
                    setTimeout(() => enemyBullets.splice(ebIndex, 1), 0);
                    if (destroyed) {
                        asteroid.destroy();
                        setTimeout(() => asteroids.splice(aIndex, 1), 0);
                    }
                }
            });
        });

        if (boss) {
            boss.update(player);
            boss.draw();
            enemyBullets.forEach((eb, ebIndex) => {
                eb.update();
                eb.draw();
                const distP = Math.hypot(player.x - eb.x, player.y - eb.y);
                if (distP - player.radius - eb.radius < 1) {
                    if (player.isInvincible) return;
                    setTimeout(() => enemyBullets.splice(ebIndex, 1), 0);
                    if (player.shield > 0) {
                        player.shield--;
                        screenShake(5, 10);
                        createExplosion(player.x, player.y, '#fff', 5);
                    } else {
                        player.health -= 20;
                        screenShake(10, 20);
                        createExplosion(player.x, player.y, '#f05', 10);
                        AudioSys.playExplosion();
                    }
                    if (player.health <= 0) gameOver(); 
                }
                if (eb.x < -50 || eb.x > canvas.width + 50 || eb.y < -50 || eb.y > canvas.height + 50)
                    setTimeout(() => enemyBullets.splice(ebIndex, 1), 0);
            });
            // Boss碰撞检测
            if (boss) {
                const distPlayerBoss = Math.hypot(player.x - boss.x, player.y - boss.y);
                if (distPlayerBoss - boss.radius - player.radius < 1) {
                    // 玩家与Boss碰撞
                    if (player.isInvincible) {
                        // 玩家无敌时Boss受到伤害
                        const bossDestroyed = boss.takeDamage(boss.maxHealth - 10); // 给予10的伤害
                        if (bossDestroyed) {
                            boss.destroy();
                            boss = null;
                        }
                    } else {
                        // 玩家非无敌时原有的碰撞逻辑
                        if (player.shield > 0) {
                            player.shield--;
                            screenShake(15, 25);
                            createExplosion(player.x, player.y, '#fff', 5);
                        } else {
                            player.health -= 50;
                            screenShake(20, 30);
                            createExplosion(player.x, player.y, '#f00', 20);
                            AudioSys.playExplosion();
                        }
                        if (player.health <= 0) gameOver();
                    }
                }
            }
            
            // 子弹与Boss碰撞检测
            bullets.forEach((bullet, bIndex) => {
                const distBullet = Math.hypot(bullet.x - boss.x, bullet.y - boss.y);
                if (distBullet - boss.radius - bullet.radius < 1) {
                    const destroyed = boss.takeDamage(bullet.damage);
                    bullet.pierce--;
                    if (bullet.pierce <= 0) setTimeout(() => bullets.splice(bIndex, 1), 0);
                    if (destroyed) {
                        boss.destroy();
                        setTimeout(() => { boss = null; }, 0);
                    }
                }
            });
            
            // 轨道器与Boss碰撞检测
            player.orbiters.forEach((o, oIndex) => {
                const distOrb = Math.hypot(o.x - boss.x, o.y - boss.y);
                if (distOrb - boss.radius - o.radius < 1) {
                    const destroyed = boss.takeDamage(satelliteDamage);
                    createExplosion(o.x, o.y, '#fff', 2);
                    if (destroyed) {
                        boss.destroy();
                        setTimeout(() => { boss = null; }, 0);
                    }
                }
            });
        }

        enemies.forEach((enemy, eIndex) => {
            enemy.update(player);
            enemy.draw();

            player.orbiters.forEach((o) => {
                const dist = Math.hypot(o.x - enemy.x, o.y - enemy.y);
                if (dist - enemy.radius - o.radius < 1) {
                    const destroyed = enemy.takeDamage(satelliteDamage);
                    createExplosion(o.x, o.y, '#fff', 2);
                    if (destroyed) {
                        enemy.destroy();
                        setTimeout(() => { enemies.splice(eIndex, 1); }, 0);
                    }
                }
            });

            const distPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            if (distPlayer - enemy.radius - player.radius < 1) {
                if (player.isInvincible) {
                    // 玩家无敌时敌人直接死亡
                    enemy.destroy();
                    enemies.splice(eIndex, 1);
                } else {
                    // 玩家非无敌时原有的碰撞逻辑
                    if (player.shield > 0) { 
                        player.shield--; 
                        screenShake(5, 10); 
                        createExplosion(player.x, player.y, '#fff', 5); 
                    } else { 
                        player.health -= enemy.collisionDamage; 
                        screenShake(10, 20); 
                        createExplosion(enemy.x, enemy.y, enemy.color, 10); 
                        AudioSys.playExplosion(); 
                    } 
                    enemies.splice(eIndex, 1); 
                    if (player.health <= 0) gameOver();
                }
            }
            bullets.forEach((bullet, bIndex) => {
                const distBullet = Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y);
                if (distBullet - enemy.radius - bullet.radius < 1) {
                    const destroyed = enemy.takeDamage(bullet.damage);
                    bullet.pierce--;
                    if (bullet.pierce <= 0) setTimeout(() => bullets.splice(bIndex, 1), 0);

                    if (destroyed) {
                        enemy.destroy();
                        setTimeout(() => { enemies.splice(eIndex, 1); }, 0);
                    }
                }
            });
        });

        powerUps.forEach((p, pIndex) => {
            p.update(); p.draw();
            if (p.y > canvas.height + 20) setTimeout(() => powerUps.splice(pIndex, 1), 0);
            const dist = Math.hypot(player.x - p.x, player.y - p.y);
            if (dist - player.radius - p.radius < 1) {
                if (p.type === 'health') {
                    if (player.health < player.maxHealth) {
                        player.health = Math.min(player.maxHealth, player.health + 25);
                        createExplosion(player.x, player.y, '#0f0', 5);
                    } else {
                        player.shield += 1;
                        createExplosion(player.x, player.y, '#fff', 10);
                    }
                } else if (p.type === 'weapon') {
                    if (player.weaponLevel < 8) {
                        player.weaponLevel += 1;
                        createExplosion(player.x, player.y, '#fa0', 15);
                        screenShake(5, 5);
                    } else {
                        score += 30;
                        scoreEl.innerText = score;
                        createExplosion(player.x, player.y, '#fff', 20);
                    }
                } else if (p.type === 'freeze') {
                    freezeTimer = 180 + globalFreezeDurationBonus;
                    createExplosion(player.x, player.y, '#0ff', 10);
                } else if (p.type === 'bomb') {
                    if (player.bombs < player.maxBombs) {
                        player.bombs++;
                        bombEl.innerText = player.bombs;
                    } else {
                        score += 20;
                        scoreEl.innerText = score;
                    }
                    createExplosion(player.x, player.y, '#f00', 10);
                } else if (p.type === 'orbiter') {
                    if (player.orbiters.length < player.maxSatellites) {
                        // 拾取时也计算正确的角度，防止重叠
                        const idx = player.orbiters.length;
                        player.orbiters.push(new Orbiter(idx, player.maxSatellites));
                        orbiterEl.innerText = player.orbiters.length;
                        createExplosion(player.x, player.y, '#fff', 10);
                    } else {
                        score += 20;
                        scoreEl.innerText = score;
                    }
                } else if (p.type === 'speed') {
                    if (player.speedLevel < 6) {
                        player.speedLevel++;
                        player.speed = SPEED_LEVELS[player.speedLevel];
                        speedEl.innerText = "LV." + player.speedLevel;
                        createExplosion(player.x, player.y, '#f0f', 10);
                    } else {
                        score += 20;
                        scoreEl.innerText = score;
                    }
                }
                AudioSys.playPowerUp(p.type);
                setTimeout(() => powerUps.splice(pIndex, 1), 0);
            }
        });
    } else if (currentState === STATE.PLAYING && isPaused) {
        // 暂停状态下只渲染游戏画面但不更新游戏逻辑
        player.draw();
        bullets.forEach(bullet => bullet.draw());
        asteroids.forEach(asteroid => asteroid.draw());
        enemies.forEach(enemy => enemy.draw());
        if (boss) boss.draw();
        enemyBullets.forEach(eb => eb.draw());
        player.orbiters.forEach(orbiter => orbiter.draw());
        powerUps.forEach(powerUp => powerUp.draw());
    }

    particles.forEach((particle, index) => {
        if (particle.alpha <= 0) {
            particles.splice(index, 1);
        } else {
            particle.update();
            particle.draw();
        } 
    });
    ctx.restore();
    requestAnimationFrame(gameLoop);
}