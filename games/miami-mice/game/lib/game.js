import { Cat } from "./cat.js";
import { POSE_CHECK_ATTACK, POSE_STAND, POSE_THROW_1, POSE_THROW_2, POSE_THROW_EXECUTE, POSE_WALK_1, POSE_WALK_2, STATE_BLOCK, STATE_THROW } from "./kinematics.js";
import { Player } from "./player.js";
import { Rat } from "./rat.js";
import { RatKing } from "./ratking.js";
import { SCENES } from "./scenes.js";
import SFXPlayer from "./soundbox/sfxplayer.js";

export const ACTION_MOVE_LEFT_PLAYER_1 = 0;
export const ACTION_MOVE_RIGHT_PLAYER_1 = 1;
export const ACTION_MOVE_UP_PLAYER_1 = 2;
export const ACTION_MOVE_DOWN_PLAYER_1 = 3;
export const ACTION_BLOCK_PLAYER_1 = 4;
export const ACTION_PUNCH_PLAYER_1 = 5;
export const ACTION_KICK_PLAYER_1 = 6;

const keyActionMap = {
    "KeyA": ACTION_MOVE_LEFT_PLAYER_1,
    "KeyD": ACTION_MOVE_RIGHT_PLAYER_1,
    "KeyW": ACTION_MOVE_UP_PLAYER_1,
    "KeyS": ACTION_MOVE_DOWN_PLAYER_1,
    "KeyB": ACTION_BLOCK_PLAYER_1,
    "KeyH": ACTION_PUNCH_PLAYER_1,
    "KeyJ": ACTION_KICK_PLAYER_1
};

const CUTSCENE_SKIP_TIME = 0.5; // seconds until cutscene can be skipped


export class Game {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext("2d");
        this.isGameRunning = false;
        this.gameObjects = [];
        this.enemies = []; // cache for enemy objects
        this.lastUpdateTime = 0;

        this.texts = [];
        this.txtPointer = -1;

        this.sfxPlayer = new SFXPlayer(); // Sound effect player

        this.cutscene = [];
        this.cutsceneCallback = null;
        this.cutsceneSkip = CUTSCENE_SKIP_TIME;
        this.cutsceneRunning = false;

        this.currentScene = null;
        this.sceneWonCallback = null;

        this.keys = {};
        this.actions = [];

        this.hordeStage = 0;
        this.hordePlayer = null;

        this.playerStats = [
            {hp: 100, maxHp: 100, score: 0, stamina:100} // Player 1
        ];
        this.scoreElem = document.getElementById("sc");
        window.addEventListener("keydown", (e) => {
            if(e.code in keyActionMap) e.preventDefault();
            this.keys[e.code] = true;
            this.actions[keyActionMap[e.code]] = 1;
        });
        window.addEventListener("keyup", (e) => {
            if(e.code in keyActionMap) e.preventDefault();
            this.keys[e.code] = false;
            this.actions[keyActionMap[e.code]] = 0;
        });
    }

    nextCutscene() {
        this.cutsceneCallback = null;
        this.txtPointer = -1
        this.cutsceneSkip = CUTSCENE_SKIP_TIME;
        this.texts = [];
        this.clearText();
        if (this.cutscene.length > 0) {
            this.cutscene.shift()(this);
            this.cutsceneRunning = true;
        }
    }

    nextText() {
        let txt = document.querySelector('.txt');
        if (this.txtPointer < this.texts.length - 1) {
            this.txtPointer++;
            txt.innerHTML = this.texts[this.txtPointer].text;
            txt.style.textAlign = this.texts[this.txtPointer].align || "center";
            txt.style.display = "block";
        } else {
            this.clearText();
        }
    }
    clearText() {
        let txt = document.querySelector('.txt');
        txt.innerHTML = "";
        txt.style.display = "none";
    }

    getActionState(action) {
        return this.actions[action] || 0;
    }

    addGameObject(obj) {
        obj.game = this;
        if(obj.setStats) obj.setStats(this);
        this.gameObjects.push(obj);
        return obj;
    }

    startHorde() {
        this.hordeStage = 1;
        this.start(9);
    }

    start(stage = 0) {
        if(stage != 9){
            this.hordeStage = 0;
            this.hordePlayer = null;
        }
        this.sfxPlayer.playAudio("gamemusic");
        document.querySelectorAll('.mainmenu,.neon,.cast').forEach(div=>div.style.opacity = 0);
        
        document.querySelector('.mainmenu').style.display = "none";
        document.querySelector('.miamimice').style.fontSize = "33vh";
        document.querySelector('.miamimice').style.opacity = "0";
        document.querySelector('.miamimice').style.top = "15vh";
        document.querySelector('.miamimice').style.zIndex = "20";
        this.isGameRunning = true;
        this.gameLoop();
        this.initObjects(stage);
    }

    initObjects(scene) {
        this.cutscene = [];
        this.cutsceneRunning = false;
        this.currentScene = scene;
        this.sceneWonCallback = null;
        SCENES[scene](this);
    }
    retry() {
        document.querySelector('.gameover').style.opacity = 0;
        this.gameObjects = [];
        this.enemies = [];
        this.playerStats[0].hp = this.playerStats[0].maxHp;
        this.playerStats[0].score = Math.round(this.playerStats[0].score * 0.5);
        this.initObjects(this.currentScene);
    }

    getGameObjects(types) {
        if (!types) {
            return this.gameObjects;
        }
        return this.gameObjects.filter(obj => types.includes(obj.type));
    }

    gameLoop() {
        if (!this.isGameRunning) return;

        const currentTime = performance.now();
        let deltaTime = (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
        this.lastUpdateTime = currentTime;
        deltaTime = Math.min(deltaTime, 0.05); // Cap deltaTime to avoid large jumps

        this.checkGamepads();
        this.gameObjects = this.gameObjects.filter(obj => obj.ttl >= 0);
        this.gameObjects.sort((a, b) => a.y - b.y);
        if(this.sceneWonCallback) 
            this.sceneWonCallback(this);
        this.update(deltaTime);
        this.render();
        this.scoreElem.innerText = this.playerStats[0].score;
        requestAnimationFrame(() => this.gameLoop());

    }
    checkGamepads() {
        if(!navigator.getGamepads) return;
        let connected = navigator.getGamepads().filter(pad => pad && pad.mapping === "standard" && pad.connected);
        let pad1 = connected[0];
        if (pad1) {
            this.actions[ACTION_KICK_PLAYER_1] = pad1.buttons[0].pressed;
            this.actions[ACTION_PUNCH_PLAYER_1] = pad1.buttons[1].pressed;
            this.actions[ACTION_BLOCK_PLAYER_1] = pad1.buttons[2].pressed;
            this.actions[ACTION_MOVE_LEFT_PLAYER_1] = pad1.axes[0] < -0.2 ? pad1.axes[0]*-1 : 0;
            this.actions[ACTION_MOVE_RIGHT_PLAYER_1] = pad1.axes[0] > 0.2 ? pad1.axes[0] : 0;
            this.actions[ACTION_MOVE_UP_PLAYER_1] = pad1.axes[1] < -0.2 ? pad1.axes[1]*-1 : 0;
            this.actions[ACTION_MOVE_DOWN_PLAYER_1] = pad1.axes[1] > 0.2 ? pad1.axes[1] : 0;
            if(pad1.buttons[15].pressed) { // right dpad
                this.actions[ACTION_MOVE_RIGHT_PLAYER_1] = 1;
            }
            if(pad1.buttons[14].pressed) { // left dpad
                this.actions[ACTION_MOVE_LEFT_PLAYER_1] = 1;
            }
            if(pad1.buttons[12].pressed) { // up dpad
                this.actions[ACTION_MOVE_UP_PLAYER_1] = 1;
            }
            if(pad1.buttons[13].pressed) { // down dpad
                this.actions[ACTION_MOVE_DOWN_PLAYER_1] = 1;
            }
        }
    }

    update(delta) {
        if(this.cutsceneCallback && this.cutsceneSkip < 0 && (
            this.actions[ACTION_KICK_PLAYER_1] || this.actions[ACTION_PUNCH_PLAYER_1] || this.actions[ACTION_BLOCK_PLAYER_1]
        )) {
            this.cutsceneCallback(this);
        };
        this.cutsceneSkip-=delta;
        this.enemies = this.getGameObjects(["rat"]).filter(rat => rat.hp > 0);
        this.gameObjects.forEach(obj => {
            obj.update(delta);
        });
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Render game objects here
        this.gameObjects.forEach(obj => {
            obj.render(this.ctx);
        });
    }
}