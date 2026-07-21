// 游戏状态枚举
const STATE = {
    MENU: 'menu',
    PLAYING: 'playing',
    GAMEOVER: 'gameover',
    PAUSED: 'paused'
};

// 游戏状态和全局变量
let currentState = STATE.MENU;
let score = 0;
let highScore = localStorage.getItem('ftol:neonenergyarena:high_score') ? parseInt(localStorage.getItem('ftol:neonenergyarena:high_score')) : 0;
let currentEnergy = localStorage.getItem('ftol:neonenergyarena:energy') ? parseInt(localStorage.getItem('ftol:neonenergyarena:energy')) : 0;
let playerUpgrades = {};

// 添加暂停状态控制
let isPaused = false;

// 安全解析localStorage中的升级数据
try {
    const savedUpgrades = localStorage.getItem('ftol:neonenergyarena:upgrades');
    if (savedUpgrades) {
        playerUpgrades = JSON.parse(savedUpgrades);
    }
} catch (error) {
    console.error('Error parsing player upgrades from localStorage:', error);
    playerUpgrades = {};
}

// 游戏对象数组
let stars = [];
let bullets = [];
let enemies = [];
let enemyBullets = [];
let asteroids = [];
let particles = [];
let powerUps = [];
let boss = null;
let player = null;

// 游戏计时器和计数器
let freezeTimer = 0;
let enemySpawnTimer = 0;
let asteroidSpawnTimer = 0;
let powerUpSpawnTimer = 0;

// 游戏难度和里程碑
let currentMilestoneIndex = 0;
let bossMilestones = [500, 1000, 3000, 5000, 15000, 30000, 50000, 70000, 100000, 150000];
let difficultyFactor = 1;
let globalDifficultyMultiplier = 1;

// 全局升级加成
let globalDamageMult = 1;
let globalEnemySpeedMult = 1;
let globalRecoilMult = 1;
let globalFreezeDurationBonus = 0;
let globalOrbitRadiusAdd = 0;
let globalOrbitSpeedMult = 1;
let satelliteDamage = 2;

// 屏幕抖动效果
let shakeDuration = 0;
let shakeMagnitude = 0;

// 游戏元素引用
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const highScoreDisplay = document.getElementById('high-score-display');
const energyDisplay = document.getElementById('energy-display');
const shopScreen = document.getElementById('shop-screen');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const shopGrid = document.getElementById('shop-grid');
const shopEnergy = document.getElementById('shop-energy');
const finalScoreEl = document.getElementById('final-score');
const energyGainedEl = document.getElementById('energy-gained');
const hud = document.getElementById('hud');
const healthEl = document.getElementById('health');
const shieldEl = document.getElementById('shield-count');
const weaponEl = document.getElementById('weapon-level');
const speedEl = document.getElementById('speed-level');
const bombEl = document.getElementById('bomb-count');
const orbiterEl = document.getElementById('orbiter-count');
const dashText = document.getElementById('dash-text');
const dashBar = document.getElementById('dash-bar');
const weaponModeDisplay = document.getElementById('weapon-mode-display');
const muteBtn = document.getElementById('mute-btn');
const scoreEl = document.getElementById('score');

// 输入控制
const mouse = { x: 0, y: 0 };
const keys = { w: false, a: false, s: false, d: false, shift: false };
const mouseBtn = { left: false };

// Reset save逻辑
function resetSave() {
    if (confirm("Reset save?\nThis clears energy, upgrades, and high score.")) {
        localStorage.removeItem('ftol:neonenergyarena:energy');
        localStorage.removeItem('ftol:neonenergyarena:upgrades');
        localStorage.removeItem('ftol:neonenergyarena:high_score');
        location.reload();
    }
}
