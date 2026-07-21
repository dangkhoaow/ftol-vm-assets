import { GameObject } from "./gameobject.js";
import { Hitbox, POSE_STAND, STATE_BLOCK } from "./kinematics.js";
import { ctxArc, ctxBeginPath, ctxEllipse, ctxFill, ctxFillStyle, ctxMoveTo, ctxRestore, ctxSave, ctxTranslate } from "./utils.js";

export class Projectile extends GameObject {
    constructor(x, y, h, dx, dy, owner) {
        super(x, y, "projectile");
        this.h = h; // height offset
        this.dx = dx;
        this.dy = dy;
        this.owner = owner; // reference to the GameObject that created this projectile
        this.ttl = 4; // time to live in seconds
        this.sink = 1; // last second sink into the ground
        this.radius = 30; // for collision detection
        this.rot = 0;
    }

    update(delta) {
        this.x += this.dx * delta;
        this.y += this.dy * delta;
        this.ttl -= delta; 
        this.rot += 10 * delta;
        
        let h = this.getH();
        let projectileHitbox = new Hitbox(this.x, this.y + h, this.radius, this.radius);
        this.game.getGameObjects("cat")
            .filter(obj => obj.hp > 0 && obj !== this && obj.y > this.y - 30 && obj.y < this.y + 30)
            .forEach(obj => {
                let hitboxes = obj.getHitboxes();
                hitboxes.forEach(hitbox => {
                    let hit = projectileHitbox.intersects(hitbox) ? hitbox : null;
                    if (hit) {
                        this.game.sfxPlayer.playAudio("hit");
                        if(obj.state == STATE_BLOCK) {
                            // deflect projectile
                            this.ttl = 1; 
                            this.dx *= -1;
                            this.dy = Math.random() * 300 - 150;
                            return;
                        }
                        this.ttl = -1; // destroy projectile
                        let direction = obj.x > this.x ? 1 : -1;
                        obj.forceX = 500 * direction;
                        obj.hp -= 10;
                        if(hitbox.poseId) {
                            obj.queueMorph(hitbox.poseId, 0.1, true);
                            obj.queueMorph(POSE_STAND, 0.2);
                        }
                        let worldHit = hit.getWorldRect();
                        for(let i=0; i<10; i++) {
                            obj.addParticle(worldHit.x, worldHit.y);
                        }
                    }
                });
            });
    }

    getH() {
        let h = this.h;
        if (this.ttl < this.sink) {
            h = this.h * (this.ttl / this.sink);
        }
        return h;
    }

    render(ctx) {
        let h = this.getH();
        ctxSave(ctx);
        ctxTranslate(ctx, this.x, this.y + h);
        ctxFillStyle(ctx, "#0001");
        [1,0.8,0.6,0.4].forEach(scale => {
            ctxBeginPath(ctx);
            ctxEllipse(ctx, 0, -h, this.radius * scale, this.radius * scale * 0.5, 0, 0, 2 * Math.PI);
            ctxFill(ctx);
        });
        ctx.rotate(this.rot);
        ctxBeginPath(ctx);
        ctxMoveTo(ctx, -10 , -10);
        ctxArc(ctx, 0, 0, this.radius, 0, Math.PI / 4);
        ctxFillStyle(ctx, "yellow");
        ctxFill(ctx);
        ctx.closePath();
        ctxRestore(ctx);
    }
}