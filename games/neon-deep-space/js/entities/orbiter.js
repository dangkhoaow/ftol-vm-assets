// --- 卫星类 ---
class Orbiter {
    constructor(index, total) {
        // 计算角度：(当前索引 / 总数) * 360度
        // 这样可以确保卫星均匀分布在圆周上
        this.angle = total > 0 ? (index / total) * Math.PI * 2 : 0;
        
        this.distance = 35 + globalOrbitRadiusAdd;
        this.speed = 0.08 * globalOrbitSpeedMult;
        this.radius = 5;
    }
    update(player) {
        if (!player) return;
        this.angle += this.speed;
        this.x = player.x + Math.cos(this.angle) * this.distance;
        this.y = player.y + Math.sin(this.angle) * this.distance;
    }
    draw() {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.arc(player.x, player.y, this.distance, this.angle - 0.5, this.angle + 0.5);
        ctx.stroke();
        ctx.restore();
    }
}