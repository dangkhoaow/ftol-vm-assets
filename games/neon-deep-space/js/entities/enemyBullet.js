class EnemyBullet {
    constructor(x, y, velocity) { 
        this.x = x;
        this.y = y;
        this.velocity = velocity; 
        this.radius = 4;
        this.color = '#f05';
    }
    update() { 
        this.x += this.velocity.x;
        this.y += this.velocity.y;
    }
    draw() {
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.translate(this.x, this.y);
        ctx.rotate(Date.now() / 100);
        ctx.fillRect(-this.radius, -this.radius, this.radius*2, this.radius*2); ctx.restore();
    }
}