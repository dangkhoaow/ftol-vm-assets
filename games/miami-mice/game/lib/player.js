import { Cat } from "./cat.js";
import { POSE_BLOCK, POSE_CHECK_ATTACK, POSE_KICK_A, POSE_KICK_B, POSE_KO, POSE_PUNCH, POSE_PUNCH2, POSE_STAND, POSE_WALK_1, POSE_WALK_2, STATE_BLOCK, STATE_IDLE, STATE_KICK, STATE_KO, STATE_PUNCH, STATE_WALKING } from "./kinematics.js";
import { ACTION_MOVE_LEFT_PLAYER_1, ACTION_MOVE_RIGHT_PLAYER_1,ACTION_MOVE_UP_PLAYER_1, ACTION_MOVE_DOWN_PLAYER_1, ACTION_BLOCK_PLAYER_1, ACTION_KICK_PLAYER_1, ACTION_PUNCH_PLAYER_1 } from "./game.js";

const STAMINA_RECHARGE_RATE = 10; // stamina points per second
const STAMINA_COST_PUNCH = 5;
const STAMINA_COST_KICK = 20;

export class Player extends Cat {
    constructor(x, y, playerNumber = 1) {
        super(x,y);
        this.playerNumber = playerNumber;
        this.score = 0;
        this.maxHp = 100;
        this.stamina = 100;
        this.walkSpeed = 250;
        this.playerStatsIndex = playerNumber - 1;
        this.staminaRecharge = 0; // accumulate to full points
    }

    setStats(game) {
        this.game = game;
        this.hp = game.playerStats[this.playerStatsIndex].hp;
        this.maxHp = game.playerStats[this.playerStatsIndex].maxHp;
        this.score = game.playerStats[this.playerStatsIndex].score;
        this.stamina = game.playerStats[this.playerStatsIndex].stamina;
    }
    storeStats() {
        if(!this.game) return;
        this.game.playerStats[this.playerStatsIndex].hp = this.hp;
        this.game.playerStats[this.playerStatsIndex].maxHp = this.maxHp;
        this.game.playerStats[this.playerStatsIndex].score = this.score;
        this.game.playerStats[this.playerStatsIndex].stamina = this.stamina;
    }

    update(deltaTime) {
        if(this.stamina < 100) {
            this.staminaRecharge += STAMINA_RECHARGE_RATE * deltaTime;
            if(this.staminaRecharge >= 1) {
                let rechargePoints = Math.floor(this.staminaRecharge);
                this.stamina += rechargePoints;
                if(this.stamina > 100) this.stamina = 100;
                this.staminaRecharge -= rechargePoints;
            }   
        }
        this.storeStats();
        document.querySelector('.stats .health .healthbar').style.width = Math.floor((this.hp / 100)*100) + '%';
        document.querySelector('.stats .stamina .staminabar').style.width = Math.floor((this.stamina / 100) * 100) + '%';
        let previousState = this.state;
        if(this.hp <= 0) {
            this.state = STATE_KO;
            if(previousState != STATE_KO) {
                this.queueMorph(POSE_KO, 0.8, true);
            }
            super.update(deltaTime);
            document.querySelector('.gameover').style.opacity = 1;
            return;
        }
        let noInput = true;
        let moveAllowed = true;
        
        if(noInput && this.game.getActionState(ACTION_BLOCK_PLAYER_1)) {
            this.state = STATE_BLOCK;
            if(previousState != STATE_BLOCK) {
                this.queueMorph(POSE_BLOCK, 0.1, true);
            }
            noInput = false;
            moveAllowed = false;
        }
        if (noInput && this.game.getActionState(ACTION_KICK_PLAYER_1)) {
            if(this.stamina > STAMINA_COST_KICK) {
                this.state = STATE_KICK;
                if(previousState != STATE_KICK) {
                    this.queueMorph(POSE_KICK_A, 0.1, true);
                    this.queueMorph(POSE_KICK_B, 0.1);
                    this.queueMorph(POSE_CHECK_ATTACK, 0);
                    this.game.sfxPlayer.playAudio("swoosh");
                    this.stamina -= STAMINA_COST_KICK;
                }
                
            }
            noInput = false;
            moveAllowed = false;
        }
        if (noInput && this.game.getActionState(ACTION_PUNCH_PLAYER_1)) {
            if(this.stamina > STAMINA_COST_PUNCH) {
                this.state = STATE_PUNCH;
                if(previousState != STATE_PUNCH) {
                    let pose = this.lastPunch == 1 ? POSE_PUNCH2 : POSE_PUNCH;
                    this.queueMorph(pose, 0.1, true);
                    this.queueMorph(POSE_CHECK_ATTACK, 0);
                    this.game.sfxPlayer.playAudio("swoosh");
                    this.stamina -= STAMINA_COST_PUNCH;
                }
            }
            noInput = false;
            moveAllowed = false;
        }
        if(this.stamina < 0) this.stamina = 0;
        if (moveAllowed) {
            let left = this.game.getActionState(ACTION_MOVE_LEFT_PLAYER_1);
            let right = this.game.getActionState(ACTION_MOVE_RIGHT_PLAYER_1);
            let up = this.game.getActionState(ACTION_MOVE_UP_PLAYER_1);
            let down = this.game.getActionState(ACTION_MOVE_DOWN_PLAYER_1);
            if (left) {
                this.x -= this.walkSpeed * left * deltaTime;
                this.state = STATE_WALKING;
                noInput = false;
                this.invertX = true
            }
            if (right) {
                this.x += this.walkSpeed * right * deltaTime;
                this.state = STATE_WALKING;
                noInput = false;
                this.invertX = false;
            }
            if (up) {
                this.y -= this.walkSpeed * 0.8 * up * deltaTime;
                this.state = STATE_WALKING;
                noInput = false;
            }
            if (down) {
                this.y += this.walkSpeed * 0.8 * down * deltaTime;
                this.state = STATE_WALKING;
                noInput = false;
            }
        }
        if(!this.game.cutsceneRunning) {
            if(this.y < 650) this.y = 650;
            if(this.y > 1050) this.y = 1050;
            if(this.x < 100) this.x = 100;
            if(this.x > 1820) this.x = 1820;
        }

        if (noInput) {
            this.state = STATE_IDLE;
            if(previousState !== STATE_IDLE) {
                this.queueMorph(POSE_STAND, 0.2, true);
            }
        } else {
            if(this.state === STATE_WALKING && previousState !== STATE_WALKING) {
                this.queueMorph(POSE_WALK_2, 100 / this.walkSpeed, true);
            }
        }
        
        super.update(deltaTime);
    }
}
