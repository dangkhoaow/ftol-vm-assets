class Boss {
    constructor(level) {
        this.level = level;
        this.x = canvas.width / 2; this.y = -100;
        this.radius = 60 + (level * 5); 
        this.color = '#f0f'; 
        this.maxHp = Math.floor(50 * Math.pow(2, level - 1));
        this.hp = this.maxHp;
        this.score = 50 * level;
        this.speed = 1.2 + (level * 0.3);
        this.angle = 0; this.active = false; this.lastShot = 0; 
        this.fireRate = Math.max(200, 2000 - (level * 300)); 
        this.entered = false;
    }
    update(player) {
        if (!player) return;
        if (!this.entered) {
            this.y += 2; 
            if (this.y > 150) { 
                this.entered = true; 
                this.active = true; 
                AudioSys.playPowerUp('bomb'); 
            } 
            return; 
        }
        this.x += Math.sin(Date.now() / 1000) * (2 + this.level * 0.2); 
        if (this.y < 150) this.y += 0.5;
        this.angle += 0.02 + (this.level * 0.005);
        if (Date.now() - this.lastShot > this.fireRate) {
            this.shoot(player); 
            this.lastShot = Date.now(); 
        }
    }
    shoot(player) {
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        const spread = 0.15 + (this.level * 0.01);
        const count = 3 + Math.floor(this.level / 2);
        const startAngle = angle - ((count - 1) * spread) / 2;

        for(let i=0; i<count; i++) {
            const finalAngle = startAngle + i * spread;
            const vel = 6 + (this.level * 0.5);
            enemyBullets.push(new EnemyBullet(this.x, this.y, { x: Math.cos(finalAngle) * vel, y: Math.sin(finalAngle) * vel }));
        }
    }
    draw() {
        ctx.save(); ctx.translate(this.x, this.y);
        if (!this.entered) {
            ctx.globalAlpha = Math.abs(Math.sin(Date.now() / 200)); 
            ctx.fillStyle = '#f0f';
            ctx.font = '30px Arial'; 
            ctx.fillText("WARNING BOSS", -90, 0);
        }
        ctx.rotate(this.angle); 
        ctx.shadowBlur = 30; 
        ctx.shadowColor = this.color; 
        ctx.strokeStyle = this.color; 
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const theta = i * 2 * Math.PI / 8;
            const r = (i % 2 === 0) ? this.radius : this.radius * 0.6; 
            const x = r * Math.cos(theta); 
            const y = r * Math.sin(theta); 
            if (i === 0) ctx.moveTo(x, y); 
            else ctx.lineTo(x, y); 
        } 
        ctx.closePath(); 
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 0, 255, 0.2)'; 
        ctx.fill(); 
        ctx.rotate(-this.angle * 2); 
        ctx.beginPath(); 
        ctx.arc(0, 0, 20, 0, Math.PI * 2); 
        ctx.fillStyle = '#fff'; 
        ctx.fill(); 
        ctx.restore();  
        if (this.entered) {
            ctx.save();
            ctx.fillStyle = '#f00';
            ctx.fillRect(canvas.width/2 - 100, 50, 200, 10); 
            ctx.fillStyle = '#f0f'; 
            ctx.fillRect(canvas.width/2 - 100, 50, 200 * (this.hp / this.maxHp), 10); 
            ctx.strokeStyle = '#fff'; 
            ctx.lineWidth = 1; 
            ctx.strokeRect(canvas.width/2 - 100, 50, 200, 10); 
            ctx.restore();
        }
    }
    takeDamage(amount) {
        this.hp -= amount; 
        createExplosion(this.x + (Math.random()-0.5)*50, this.y + (Math.random()-0.5)*50, '#f0f', 5); 
        return this.hp <= 0;
    }
    
    destroy() {
        // 播放大型爆炸音效
        AudioSys.playExplosion(true);
        // 增加分数
        score += this.score;
        scoreEl.innerText = score;
        // 创建大型爆炸效果
        createExplosion(this.x, this.y, '#f0f', 150);
        // 屏幕震动
        screenShake(40, 40);
        // 生成多个道具
        spawnPowerUp(this.x, this.y);
        spawnPowerUp(this.x - 30, this.y + 20);
        spawnPowerUp(this.x + 30, this.y + 20);
    }
}