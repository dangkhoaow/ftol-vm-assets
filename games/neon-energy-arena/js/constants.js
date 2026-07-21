// 升级定义
const UPGRADE_DEFS = [
    { id: 'bomb', name: "Tactical Bomb", desc: "Start with +1; raise carry cap +1", baseCost: 2000, max: 3 },
    { id: 'satellite', name: "Orbiter Escort", desc: "Start with +1; raise carry cap +1", baseCost: 3500, max: 4 },
    { id: 'damage', name: "Weapon Boost", desc: "All damage +10%", baseCost: 3000, max: 20 },
    { id: 'dashCD', name: "Quantum Drive", desc: "Dash cooldown -1s", baseCost: 4000, max: 5 },
    { id: 'health', name: "Nano Armor", desc: "Max health +20%", baseCost: 2500, max: 20 },
    { id: 'enemySlow', name: "Time Dilate", desc: "Enemy speed -10%", baseCost: 3000, max: 5 },
    { id: 'satRadius', name: "Orbiter Expand", desc: "Orbit radius +10, spin +15%", baseCost: 5000, max: 5 },
    { id: 'freezeDuration', name: "Cryo Core", desc: "Freeze pickup duration +1s", baseCost: 1500, max: 5 },
    { id: 'recoil', name: "Recoil Damper", desc: "Shoot recoil -20%", baseCost: 4500, max: 5 }
];

// 武器配置系统
const WEAPON_CONFIG = {
    'blaster': {
        name: "Pulse Blaster",
        color: "#ff0",
        recoil: 0.5,
        getStats: (lvl) => ({
            count: Math.min(lvl, 8),
            rate: Math.max(150 - lvl * 10, 80),
            spread: 0.15,
            damage: 1,
            pierce: 1,
            velocity: 12,
            radius: 3,
            life: Infinity
        })
    },
    'shotgun': {
        name: "Blast Shotgun",
        color: "#fa0",
        recoil: 0,
        getStats: (lvl) => ({
            count: 6 + lvl * 3,
            rate: 500,
            spread: 0.8,
            damage: 5,
            pierce: 2,
            velocity: 10,
            radius: 5,
            life: 30
        })
    },
    'sniper': {
        name: "Photon Sniper",
        color: "#0ff",
        recoil: 1.5,
        getStats: (lvl) => ({
            count: 1,
            rate: Math.max(400 - lvl * 30, 150),
            spread: 0,
            damage: 10 + lvl * 4,
            pierce: 5 + lvl,
            velocity: 30,
            radius: 5,
            life: Infinity
        })
    },
    'plasma_railgun': {
        name: "Plasma Rail",
        color: "#a0f",
        recoil: 3.0,    //较高的后座力
        getStats: (lvl) => ({
            count: Math.min(1 + Math.floor(lvl / 3), 3), // 每3级增加1束
            rate: Math.max(300 - lvl * 20, 120), // 较快的射速
            spread: 0.1, // 较小的散布
            damage: 6 + lvl * 2, // 较高的基础伤害
            pierce: 3 + Math.floor(lvl / 2), // 良好的穿透能力
            velocity: 20, // 中等速度
            radius: 3, // 中等大小
            life: 100 // 100生命周期
        })
    }
};

const WEAPON_TYPES = ['blaster', 'shotgun', 'sniper', 'plasma_railgun'];

// 敌人配置
const ENEMY_TYPES = [
    { type: 'triangle', color: '#ff0', speed: 4.5, hp: 3, score: 2, radius: 15, sides: 3, collisionDamage: 10 },
    { type: 'diamond',  color: '#fff', speed: 7.0, hp: 9, score: 5, radius: 12, sides: 4, collisionDamage: 20 },
    { type: 'square',   color: '#0ff', speed: 2.5, hp: 6, score: 1, radius: 18, sides: 4, collisionDamage: 10 },
    { type: 'hexagon',  color: '#f05', speed: 1.8, hp: 3, score: 3, radius: 22, sides: 6, collisionDamage: 10 },
    { type: 'pentagon', color: '#0af', speed: 1.5, hp: 50, score: 10, radius: 25, sides: 5, collisionDamage: 15 },
    { type: 'circle',   color: '#a0f', speed: 0.8, hp: 60, score: 8, radius: 28, sides: 20, collisionDamage: 20 }
];

const SPEED_LEVELS = { 1: 5.0, 2: 5.5, 3: 6.0, 4: 6.5, 5: 7.0, 6: 7.5 };