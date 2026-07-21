// el jugador y su movimiento

import { debug, warn } from "./debug.js";

const MODULE = "Player";

export default class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.facing = "right";
        this.lastTilePosition = null;
        debug(MODULE, `jugador en (${x}, ${y})`);
    }

    move(dx, dy, logic, definitions) {
        const nx = this.x + dx;
        const ny = this.y + dy;

        if (!logic[ny] || logic[ny][nx] === undefined) return;

        if (dx < 0) this.facing = "left";
        if (dx > 0) this.facing = "right";

        const id  = logic[ny][nx];
        const def = definitions.collisions[id];

        if (!def) {
            warn(MODULE, `sin definicion pa tile ${id} en (${nx},${ny})`);
            return;
        }

        if (def.type === "solid" || def.solid === true) return;

        this.x = nx;
        this.y = ny;

        // puerta, hace warp
        if (def.type === "door") {
            return {
                type: "warp",
                toMap: def.target_map,
                toX:   def.target_tile.x - 1,
                toY:   def.target_tile.y - 1,
            };
        }
    }
}
