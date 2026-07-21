import { Rat } from "./rat.js";
import { ctxArc, ctxBeginPath, ctxLineTo, ctxMoveTo, ctxStroke, ctxStrokeStyle } from "./utils.js";

const BONE_ROOT = 0;
const BONE_UPPER_LEG_LEFT = 1;
const BONE_LOWER_LEG_LEFT = 2;
const BONE_UPPER_LEG_RIGHT = 3;
const BONE_LOWER_LEG_RIGHT = 4;
const BONE_BODY = 5;
const BONE_SHOULDER_LEFT = 6;
const BONE_ARM_LEFT = 7;
const BONE_FOREARM_LEFT = 8;
const BONE_SHOULDER_RIGHT = 9;
const BONE_ARM_RIGHT = 10;
const BONE_FOREARM_RIGHT = 11;
const BONE_NECK = 12;
const BONE_FACE = 13;
const BONE_NOSE = 14;
const BONE_EAR1 = 15;
const BONE_EAR2 = 16;
const BONE_EYE1 = 17;
const BONE_EYE2 = 18;
const BONE_TAIL1 = 19;
const BONE_TAIL2 = 20;
const BONE_TAIL3 = 21;

export class RatKing extends Rat {
    constructor(x, y) {
        super(x, y);
        this.bones[BONE_ROOT].length = 80;
        this.bones[BONE_BODY].length = 60;
        this.bones[BONE_UPPER_LEG_LEFT].length = 50;
        this.bones[BONE_LOWER_LEG_LEFT].length = 30;
        this.bones[BONE_UPPER_LEG_RIGHT].length = 50;
        this.bones[BONE_LOWER_LEG_RIGHT].length = 30;
        this.bones[BONE_ARM_RIGHT].length = 50;
        this.bones[BONE_FOREARM_RIGHT].length = 40;
        this.bones[BONE_ARM_LEFT].length = 50;
        this.bones[BONE_FOREARM_LEFT].length = 40;
        this.bones[BONE_EYE2].length = 20;
        this.fur = "#222";
        this.giColors = ['#000', '#333'];
        this.renderEars = false;
        this.invertX = true;
    }


    
    renderSpecials(ctx) {
       [BONE_EYE2].forEach((boneId) => {
            ctxBeginPath(ctx);
            ctxStrokeStyle(ctx, "#a60");
            ctx.lineWidth = 2;
            ctxArc(ctx, this.bones[boneId].endX, this.bones[boneId].endY, 10 * this.sizing, 0, 2 * Math.PI);
            ctxStroke(ctx);
        });
        let bone = this.bones[BONE_EAR2];
        let dx = bone.endX - bone.x;
        let dy = bone.endY - bone.y;
        ctxBeginPath(ctx);
        ctxStrokeStyle(ctx, "#000");
        ctx.lineWidth = 90*this.sizing;
        ctxMoveTo(ctx, bone.x + dx*0.5, bone.y + dy*0.5);
        ctxLineTo(ctx, bone.x + dx*0.6, bone.y + dy*0.6);
        ctxStroke(ctx);
        ctxBeginPath(ctx);
        ctx.lineWidth = 60*this.sizing;
        ctxMoveTo(ctx, bone.x + dx*0.5, bone.y + dy*0.5);
        ctxLineTo(ctx, bone.x + dx*1.5, bone.y + dy*1.5);
        ctxStroke(ctx);
    }
}