class Asteroid {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.radius = Math.random() * 30 + 20;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.5 + 0.2;
        this.velocity = {
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed
        };
        this.maxHp = Math.floor(this.radius / 8) * 1000; 
        this.hp = this.maxHp;
        this.score = 1;
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.03;
        this.vertices = [];
        const numVerts = 8;
        for(let i=0; i<numVerts; i++) {
            const theta = (Math.PI * 2 / numVerts) * i;
            const r = this.radius * (0.8 + Math.random() * 0.4);
            this.vertices.push({
                x: Math.cos(theta) * r,
                y: Math.sin(theta) * r
            });
        }
    }
    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.rotation += this.rotationSpeed;
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#444';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#000';
        ctx.beginPath();
        this.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(v.x, v.y);
            else ctx.lineTo(v.x, v.y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (this.hp < this.maxHp) {
            ctx.rotate(-this.rotation);
            ctx.fillStyle = '#555';
            ctx.fillRect(-this.radius, this.radius + 5, this.radius * 2, 3);
            ctx.fillStyle = '#fff';
            ctx.fillRect(-this.radius, this.radius + 5, this.radius * 2 * (this.hp / this.maxHp), 3);
        }
        ctx.restore();
    }
    takeDamage(amount) {
        this.hp -= amount;
        createExplosion(this.x, this.y, '#888', 1);
        return this.hp <= 0;
    }
    
    destroy() {
        // 创建爆炸效果
        createExplosion(this.x, this.y, '#888', 20);
        // 增加分数
        score += this.score;
        scoreEl.innerText = score;
        // 播放爆炸音效
        AudioSys.playExplosion();
    }
}