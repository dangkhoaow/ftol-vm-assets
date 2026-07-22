class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.radius = 12;
        this.angle = 0;
        this.pulse = 0;
    }
    update() {
        this.angle += 0.05;
        this.pulse += 0.1;
        this.y += 0.5;
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        const scale = 1 + Math.sin(this.pulse) * 0.1;
        ctx.scale(scale, scale);
        ctx.rotate(this.angle);
        if (this.type === 'health') {   //回复生命值或护盾道具
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#0f0';
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, -12);
            ctx.lineTo(10, 0);
            ctx.lineTo(0, 12);
            ctx.lineTo(-10, 0);
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-6, 0);
            ctx.lineTo(6, 0);
            ctx.moveTo(0, -6);
            ctx.lineTo(0, 6);
            ctx.stroke();
        } else if (this.type === 'weapon') {    //武器升级道具
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fa0';
            ctx.strokeStyle = '#fa0';
            ctx.fillStyle = 'rgba(255, 170, 0, 0.2)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(10, 0);
            ctx.lineTo(0, 10);
            ctx.lineTo(-10, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (this.type === 'freeze') {    //冻结道具
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#0ff';
            ctx.strokeStyle = '#0ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for(let i=0; i<6; i++) {
                ctx.lineTo(Math.cos(i*Math.PI/3)*10, Math.sin(i*Math.PI/3)*10);
                ctx.lineTo(0,0);
            }
            ctx.stroke();
        } else if (this.type === 'bomb') {    //炸弹道具
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#f00';
            ctx.strokeStyle = '#f00';
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI*2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-4, -4);
            ctx.lineTo(4, 4);
            ctx.moveTo(4, -4);
            ctx.lineTo(-4, 4);
            ctx.stroke();
        } else if (this.type === 'orbiter') {    //卫星道具
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fff';
            ctx.strokeStyle = '#fff';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI*2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, -4, 2, 0, Math.PI*2);
            ctx.fill(); 
        } else if (this.type === 'speed') {    //加速道具
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#f0f';
            ctx.strokeStyle = '#f0f';
            ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(6, 0);
            ctx.lineTo(-2, 0);
            ctx.lineTo(2, 10);
            ctx.lineTo(-4, 0);
            ctx.lineTo(0, 0);
            ctx.fill();
            ctx.stroke();   
        }
        ctx.restore();
    }
}