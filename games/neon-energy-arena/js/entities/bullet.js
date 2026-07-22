class Bullet {
    constructor(x, y, velocity, radius, damage, pierce, life, color) { 
        this.x = x;
        this.y = y;
        this.velocity = velocity; 
        this.radius = radius || 3;
        this.color = color;
        this.damage = damage;
        this.pierce = pierce || 1; 
        this.life = life !== undefined ? life : Infinity;
        this.maxLife = life !== undefined ? life : Infinity;
    }
    update() { 
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        if (this.life !== Infinity) this.life--;
    }
    draw() {
        ctx.save();
        let alpha = 1;
        if (this.life !== Infinity) alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        if (this.pierce > 3) {
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.atan2(this.velocity.y, this.velocity.x));
            ctx.fillRect(-20, -this.radius, 40, this.radius * 2);
        } else {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}