// entidades enemigas y su ia basica

import { warn } from "./debug.js";

const MODULE = "Entity";
// tiles que puede pisar una entidad
const CAMINABLES = new Set(["air", "player_spawn"]);

export class Entity {
    constructor(instanceId, x, y, template, spawnDef) {
        this.instanceId = instanceId;
        this.type      = template.name ?? instanceId;
        this.sprite    = template.sprite ?? null;
        this.x = x;
        this.y = y;
        this.health    = Number(template.health  ?? 3);
        this.maxHealth = this.health;
        this.damage    = Number(template.damage  ?? 1);
        this.speed     = Number(template.speed   ?? 1);
        this.moveInterval  = 1 / Math.max(0.1, this.speed);
        this.behavior      = template.behavior   ?? "patrol";
        this.chaseRadius   = Number(template.chaseRadius ?? 3);
        this.expDrop       = Number(template.exp_drop ?? 10);

        // ruta de patrulla, si no hay se inventa una
        const rawPatrol = spawnDef.patrol;
        this.patrol = Array.isArray(rawPatrol) && rawPatrol.length >= 2
            ? rawPatrol : [[x, y], [x + 2, y]];

        this.patrolIndex   = 0;
        this.patrolForward = true;
        this.moveTimer      = Math.random() * this.moveInterval;
        this.damageCooldown = 0;
        this.dead   = false;
        this.facing = "right";

        // posicion visual pa la animacion de caminar
        this.vx           = x;
        this.vy           = y;
        this.animFrom     = { x, y };
        this.animProgress = 1;
    }

    // actualiza cada frame, devuelve daño al jugador
    update(dt, map, playerX, playerY) {
        if (this.dead) return 0;

        // avanza anim
        if (this.animProgress < 1) {
            this.animProgress = Math.min(1, this.animProgress + dt / this.moveInterval);
            const ease = this.animProgress * (2 - this.animProgress);
            this.vx = this.animFrom.x + (this.x - this.animFrom.x) * ease;
            this.vy = this.animFrom.y + (this.y - this.animFrom.y) * ease;
        }

        if (this.damageCooldown > 0) {
            this.damageCooldown = Math.max(0, this.damageCooldown - dt);
        }

        this.moveTimer += dt;
        if (this.moveTimer >= this.moveInterval) {
            this.moveTimer -= this.moveInterval;
            const cerca = this.isPlayerInRange(playerX, playerY);
            if (this.behavior === "chase" || (this.behavior === "patrol" && cerca)) {
                this.doChase(map, playerX, playerY);
            } else {
                this.doPatrol(map, playerX, playerY);
            }
        }

        // daña si esta al lado del jugador
        const dist = Math.abs(this.x - playerX) + Math.abs(this.y - playerY);
        if (dist === 1 && this.damageCooldown <= 0) {
            this.damageCooldown = 1.5;
            return this.damage;
        }
        return 0;
    }

    isPlayerInRange(playerX, playerY) {
        return Math.abs(this.x - playerX) + Math.abs(this.y - playerY) <= this.chaseRadius;
    }

    doPatrol(map, playerX, playerY) {
        if (this.patrol.length < 2) return;
        const [tx, ty] = this.patrol[this.patrolIndex];

        if (this.x === tx && this.y === ty) {
            if (this.patrolForward) {
                if (this.patrolIndex < this.patrol.length - 1) { this.patrolIndex++; }
                else { this.patrolForward = false; this.patrolIndex = Math.max(0, this.patrol.length - 2); }
            } else {
                if (this.patrolIndex > 0) { this.patrolIndex--; }
                else { this.patrolForward = true; this.patrolIndex = Math.min(1, this.patrol.length - 1); }
            }
            return;
        }

        const dx = Math.sign(tx - this.x);
        const dy = Math.sign(ty - this.y);
        if (dx !== 0 && this.tryMove(this.x + dx, this.y,      map, playerX, playerY)) return;
        if (dy !== 0 && this.tryMove(this.x,       this.y + dy, map, playerX, playerY)) return;
        // bloqueado, va al siguiente punto
        this.patrolIndex = this.patrolForward
            ? Math.min(this.patrolIndex + 1, this.patrol.length - 1)
            : Math.max(this.patrolIndex - 1, 0);
    }

    doChase(map, playerX, playerY) {
        if (this.x === playerX && this.y === playerY) return;
        const dx = Math.sign(playerX - this.x);
        const dy = Math.sign(playerY - this.y);
        if (dx !== 0 && this.tryMove(this.x + dx, this.y,      map, playerX, playerY)) return;
        if (dy !== 0 && this.tryMove(this.x,       this.y + dy, map, playerX, playerY)) return;
    }

    tryMove(nx, ny, map, playerX, playerY) {
        if (ny < 0 || ny >= map.height || nx < 0 || nx >= map.width) return false;
        if (nx === playerX && ny === playerY) return false;
        const id  = map.logic[ny]?.[nx];
        if (id === undefined) return false;
        const def = map.definitions.collisions[id];
        if (!def || !CAMINABLES.has(def.type)) return false;

        if (nx > this.x) this.facing = "right";
        else if (nx < this.x) this.facing = "left";

        this.animFrom     = { x: this.x, y: this.y };
        this.animProgress = 0;
        this.x = nx;
        this.y = ny;
        return true;
    }

    takeDamage(amount) {
        if (this.dead) return true;
        this.health = Math.max(0, this.health - amount);
        if (this.health <= 0) this.dead = true;
        return this.dead;
    }

    // knockback visual, no mueve la posicion real del tile
    applyKnockback(dx, dy, map) {
        if (this.dead) return;
        this.animFrom     = { x: this.x + dx * 0.2, y: this.y + dy * 0.2 };
        this.animProgress = 0.75;
    }
}

// escanea el grid y spawna entidades en los tiles correspondientes
export function spawnEntities(map) {
    const entities   = [];
    let   counter    = 0;
    const entityDefs = map.definitions.entities ?? {};
    const airId      = findAirId(map.definitions.collisions);

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const id  = map.logic[y][x];
            const def = map.definitions.collisions[id];
            if (!def || def.type !== "entity_spawn") continue;

            const templateName = def.entity;
            const template     = entityDefs[templateName];
            // reemplaza spawn tile con aire pa que sea caminable
            map.logic[y][x] = def.floorCollision ?? airId;

            if (!template) {
                warn(MODULE, `template "${templateName}" no existe — skip (${x},${y})`);
                continue;
            }

            entities.push(new Entity(
                `${templateName}_${counter++}`,
                x, y,
                { ...template, name: templateName },
                def
            ));
        }
    }

    return entities;
}

function findAirId(collisions) {
    for (const [id, def] of Object.entries(collisions)) {
        if (def.type === "air") return Number(id);
    }
    return 0;
}
