// 游戏效果相关函数
// 在指定坐标生成一团彩色粒子，用于表现爆炸、撞击、拾取等视觉特效
function createExplosion(x, y, color, count = 15) {
    for (let i = 0; i < count; i++)
        particles.push(new Particle(x, y, color, { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) *8 }));
}

// 触发屏幕震动效果：在指定帧数内按随机偏移量平移画布，用于表现爆炸、受击等冲击感
function screenShake(duration, magnitude) {
    shakeDuration = duration;
    shakeMagnitude = magnitude;
}