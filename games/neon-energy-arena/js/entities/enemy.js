class Enemy {
    constructor(x, y) {
        // 性能优化：简化敌人类型选择逻辑
        let rand = Math.random() * 100;
        let typeIdx = 0;
        // 降低高级敌人出现概率，优化性能
        let bonus = Math.min(score / 5000, 20); // 将除数从2500增加到5000，降低bonus增长速度
        
        if (rand < 65 - bonus) typeIdx = 0; // 增加低级敌人出现概率
        else if (rand < 80 - bonus * 0.5) typeIdx = 1;
        else if (rand < 90 - bonus * 0.3) typeIdx = 2;
        else if (rand < 95 - bonus * 0.2) typeIdx = 3;
        else if (rand < 98 - bonus * 0.1) typeIdx = 4;
        else typeIdx = 5;

        const config = ENEMY_TYPES[typeIdx];
        this.x = x; 
        this.y = y; 
        this.type = config.type; 
        this.color = config.color; 
        this.maxHp = config.hp;
        this.score = config.score; 
        this.radius = config.radius; 
        this.sides = config.sides; 
        this.angle = 0; 
        this.baseSpeed = config.speed;
        this.collisionDamage = config.collisionDamage;
        
        // 降低旋转速度，减少动画计算压力
        this.spinSpeed = (Math.random() * 0.05 - 0.025) * (4 / (typeIdx + 1)); 
        this.hp = Math.ceil(this.maxHp * globalDifficultyMultiplier);
        
        // 存储上次计算的角度，减少重复计算
        this.lastAngle = 0;
        this.angleUpdateCounter = 0;
    }

    update(player) {
        if (!player) return;
        if (freezeTimer > 0) return;
        
        // 性能优化：减少角度计算频率，每3帧计算一次角度
        this.angleUpdateCounter++;
        if (this.angleUpdateCounter >= 3) {
            this.lastAngle = Math.atan2(player.y - this.y, player.x - this.x);
            this.angleUpdateCounter = 0;
        }
        
        const currentSpeed = this.baseSpeed * difficultyFactor * globalEnemySpeedMult; 
        this.x += Math.cos(this.lastAngle) * currentSpeed;
        this.y += Math.sin(this.lastAngle) * currentSpeed;
        
        // 减少旋转动画更新频率
        if (this.angleUpdateCounter === 0) {
            this.angle += this.spinSpeed;
        }
    }

    draw() {
        ctx.save(); 
        ctx.translate(this.x, this.y); 
        ctx.rotate(this.angle);
        
        // 性能优化：降低阴影模糊度，减少渲染开销
        ctx.shadowBlur = 10; // 从15减少到10
        ctx.shadowColor = this.color; 
        ctx.strokeStyle = this.color; 
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        if (this.type === 'circle' || this.type === 'diamond') {
            if(this.type === 'diamond') {
                ctx.moveTo(0, -this.radius); 
                ctx.lineTo(this.radius, 0); 
                ctx.lineTo(0, this.radius); 
                ctx.lineTo(-this.radius, 0);
            } else {
                // 性能优化：减少圆形精度，使用180度的角度增量而不是360度
                ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            }
        } else {
            // 性能优化：对于多边形，减少边数计算
            for (let i = 0; i < this.sides; i++) { 
                const theta = i * 2 * Math.PI / this.sides; 
                const x = this.radius * Math.cos(theta); 
                const y = this.radius * Math.sin(theta); 
                if (i === 0) ctx.moveTo(x, y); 
                else ctx.lineTo(x, y); 
            } 
        }
        ctx.closePath(); 
        ctx.stroke(); 
        ctx.fillStyle = this.color + '33'; 
        ctx.fill();
        
        // 优化生命值条渲染，只有在受伤明显时才显示
        if (this.hp < this.maxHp * 0.9) {
            ctx.rotate(-this.angle); 
            ctx.fillStyle = '#f00'; 
            ctx.fillRect(-15, this.radius + 5, 30, 3); 
            ctx.fillStyle = '#0f0'; 
            ctx.fillRect(-15, this.radius + 5, 30 * (this.hp / this.maxHp), 3);
        }
        
        ctx.restore();
    }
    
    takeDamage(amount) { 
        this.hp -= amount; 
        // 减少爆炸粒子数量，优化性能
        createExplosion(this.x, this.y, '#fff', 1); 
        return this.hp <= 0; 
    }
    
    destroy() {
        // 创建爆炸效果
        createExplosion(this.x, this.y, this.color, 15);
        // 增加分数
        score += this.score;
        scoreEl.innerText = score;
        // 播放爆炸音效
        AudioSys.playExplosion();
        // 8%概率生成道具
        if (Math.random() < 0.08) {
            spawnPowerUp(this.x, this.y);
        }
    }
}