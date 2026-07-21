import { ctxBeginPath, ctxFill, ctxFillStyle, ctxRect, ctxRestore, ctxRotate, ctxSave, ctxTranslate } from "./utils.js";

export const PARTICLE_HIT = 1;

const pDefs = [];
pDefs[PARTICLE_HIT] = {
    s: 50,
    ttl: 0.8,
    color: "#ccc2",
    dx: 200,
    dy: 200
};

export class GameObject {
    constructor(x, y, type = "gameObject") {
        this.x = x;
        this.y = y;
        this.game = null;
        this.type = type;
        this.particles = [];
        this.ttl = Infinity;
    }

    update(delta) {
        this.ttl -= delta;
        this.particles.forEach(p => {
            p.ttl -= delta;
            p.r += p.dr * delta;
            p.x += p.dx * delta;
            p.y += p.dy * delta;
        });
        this.particles = this.particles.filter(p=>p.ttl > 0);
    }

    renderParticles(ctx) {
        this.particles.forEach(p => {
            //TODO: make it depending on type
            ctxSave(ctx);
            ctxTranslate(ctx, p.x, p.y);
            ctxRotate(ctx, p.r);
            ctxBeginPath(ctx);
            let s = p.s * p.ttl/p.ittl;
            ctxFillStyle(ctx,p.c);
            ctxRect(ctx, -s/2, -s/2, s, s);
            ctxFill(ctx);
            ctxRestore(ctx);    
        });
    }

    addParticle(x,y,type=PARTICLE_HIT) {
        let def = pDefs[type];
        this.particles.push({
            x,y, // position
            dx: Math.random() * def.dx - (def.dx / 2), 
            dy: Math.random() * def.dy - (def.dy / 2),
            s: def.s, // size
            ttl: def.ttl, // lifetime in seconds
            type,
            ittl:def.ttl, // initial lifetime
            r:0, // rotation
            dr: 30 * (Math.random() > 0.5 ? 1 : -1), // rotation delta
            c:def.color // color
        });
    }

    
}