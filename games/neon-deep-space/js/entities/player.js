class Player {
    constructor() {
        this.x = canvas.width / 2; this.y = canvas.height / 2;
        this.radius = 15;
        this.color = '#0ff';
        this.velocity = { x: 0, y: 0 };
        this.speed = 5;
        this.friction = 0.92;
        this.angle = 0;
        this.health = 100;
        this.maxHealth = 100;
        this.shield = 0;
        this.weaponLevel = 1;
        this.lastShot = 0;
        this.bombs = 1;
        this.maxBombs = 3;
        this.speedLevel = 1;
        this.orbiters = []; 
        this.maxSatellites = 6;
        this.isAlive = true;
        
        this.dashCooldownTime = 10000; 
        this.lastDash = Date.now() - 10000; // 确保dash一开始就处于就绪状态
        this.dashDistance = 200; 
        this.dashDuration = 500;
        this.isInvincible = false; 
        this.invincibleTimer = null; 

        this.weaponIndex = 0; 
        this.currentWeapon = WEAPON_TYPES[this.weaponIndex];
    }

    switchWeapon() {
        this.weaponIndex = (this.weaponIndex + 1) % WEAPON_TYPES.length;
        this.currentWeapon = WEAPON_TYPES[this.weaponIndex];
        this.updateWeaponUI();
        AudioSys.playPowerUp('speed');
    }

    updateWeaponUI() {
        const config = WEAPON_CONFIG[this.currentWeapon];
        let colorClass = "text-yellow";
        if (this.currentWeapon === 'shotgun') colorClass = "text-orange";
        else if (this.currentWeapon === 'sniper') colorClass = "text-cyan";
        else if (this.currentWeapon === 'plasma_railgun') colorClass = "text-purple";
        weaponModeDisplay.className = `hud-item ${colorClass}`;
        weaponModeDisplay.innerText = `武器: ${config.name} [F]`;
    }

    update(deltaTime) {
        if (keys.w) this.velocity.y -= 0.5;
        if (keys.s) this.velocity.y += 0.5;
        if (keys.a) this.velocity.x -= 0.5;
        if (keys.d) this.velocity.x += 0.5;

        const speed = Math.hypot(this.velocity.x, this.velocity.y);
        if (speed > this.speed) {
            const ratio = this.speed / speed;
            this.velocity.x *= ratio;
            this.velocity.y *= ratio;
        }
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;
        this.x += this.velocity.x;
        this.y += this.velocity.y;

        if (this.x < this.radius) { 
            this.x = this.radius; 
            this.velocity.x = Math.abs(this.velocity.x) * 0.5; 
        }
        if (this.x > canvas.width - this.radius) { 
            this.x = canvas.width - this.radius; 
            this.velocity.x = -Math.abs(this.velocity.x) * 0.5; 
        }
        if (this.y < this.radius) { 
            this.y = this.radius; 
            this.velocity.y = Math.abs(this.velocity.y) * 0.5; 
        }
        if (this.y > canvas.height - this.radius) { 
            this.y = canvas.height - this.radius; 
            this.velocity.y = -Math.abs(this.velocity.y) * 0.5; 
        }

        this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);

        const stats = WEAPON_CONFIG[this.currentWeapon].getStats(this.weaponLevel);
        if (mouseBtn.left && Date.now() - this.lastShot > stats.rate) {
                this.shoot(stats);
        }

        if (keys.w || keys.a || keys.s || keys.d) {
            if (Math.random() < 0.5) 
                particles.push(new Particle(this.x - Math.cos(this.angle) * 15, this.y - Math.sin(this.angle) * 15, 'rgba(0, 255, 255, 0.5)', { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 }));
        }
        this.orbiters.forEach(o => o.update(this));
    }

    draw() {
        this.orbiters.forEach(o => o.draw());
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        if (this.isInvincible) {
            ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 20) * 0.4; 
        }
        if (this.shield > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, 28, 0, Math.PI * 2);
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#0f0';
            ctx.setLineDash([5, 5]);
            ctx.rotate(-Date.now() / 500);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.rotate(Date.now() / 500);
        }
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-5, 0);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.stroke();
        let coreColor = 'rgba(0, 255, 255, 0.1)';
        if(this.weaponLevel >= 3)
            coreColor = 'rgba(255, 170, 0, 0.3)';
        if(this.weaponLevel >= 5)
            coreColor = 'rgba(255, 50, 50, 0.4)';
        ctx.fillStyle = coreColor;
        ctx.fill();
        ctx.restore();
    }

    shoot(stats) {
        const count = stats.count;
        const spread = stats.spread;
        let startAngle = this.angle;
        if (count === 1)
            startAngle = this.angle;
        else if (count % 2 === 1)
            startAngle = this.angle - ((count - 1) / 2) * spread;
        else
            startAngle = this.angle - ((count / 2) * spread) + (spread / 2);

        for (let i = 0; i < count; i++) {
            const finalAngle = startAngle + (i * spread);
            const velocity = { 
                x: Math.cos(finalAngle) * stats.velocity,
                y: Math.sin(finalAngle) * stats.velocity
            };
            bullets.push(new Bullet(
                this.x + Math.cos(finalAngle) * 15, 
                this.y + Math.sin(finalAngle) * 15, 
                velocity, 
                stats.radius, 
                stats.damage * globalDamageMult, 
                stats.pierce,
                stats.life,
                WEAPON_CONFIG[this.currentWeapon].color
            ));
        }
        this.lastShot = Date.now();
        const weaponRecoil = WEAPON_CONFIG[this.currentWeapon].recoil;
        const recoilForce = weaponRecoil * globalRecoilMult;
        this.velocity.x -= Math.cos(this.angle) * recoilForce; 
        this.velocity.y -= Math.sin(this.angle) * recoilForce;
        AudioSys.playShoot(this.currentWeapon);
    }

    useBomb() {
        if (this.bombs > 0) {
            this.bombs--;
            bombEl.innerText = this.bombs;
            screenShake(40, 50);
            AudioSys.playExplosion(true);
            ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
            ctx.fillRect(0,0, canvas.width, canvas.height);
            enemies.forEach(e => {
                createExplosion(e.x, e.y, e.color, 20);
                score += e.score;
            });
            asteroids.forEach(a => {
                createExplosion(a.x, a.y, '#888', 10);
                score += a.score;
            });
            // 使用setTimeout延迟修改数组，避免在遍历过程中修改数组导致的问题
            setTimeout(() => {
                enemies = [];
                enemyBullets = [];
                asteroids = [];
            }, 0);
            scoreEl.innerText = score;
        }
    }

    dash() {
        const now = Date.now();
        if (now - this.lastDash >= this.dashCooldownTime) {
            const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
            for(let i=0; i<10; i++) {
                particles.push(new Particle(this.x, this.y, '#0ff', { 
                    x: (Math.random()-0.5) * 5 - Math.cos(angle)*2, 
                    y: (Math.random()-0.5) * 5 - Math.sin(angle)*2 
                }));
            }
            this.x += Math.cos(angle) * this.dashDistance;
            this.y += Math.sin(angle) * this.dashDistance;

            this.isInvincible = true;
            if (this.invincibleTimer) clearTimeout(this.invincibleTimer);
            this.invincibleTimer = setTimeout(() => { this.isInvincible = false; }, this.dashDuration);

            this.lastDash = now;
            screenShake(5, 5);
            AudioSys.playDash();
        }
    }
}