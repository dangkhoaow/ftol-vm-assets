// carga y valida los mapas

import { info, warn, error } from "./debug.js";
import { parseFlexJSON, fetchFlexJSON } from "./json.js";

const MODULE = "Map";

function parseCSV(text) {
    return text.trim().split("\n")
        .map(r => r.trim()).filter(Boolean)
        .map(r => r.split(",").map(v => Number(v.trim())));
}

// carga mapa completo desde archivos
export async function load(mapName) {
    info(MODULE, `cargando "${mapName}"`);
    const base = `maps/${mapName}/`;

    let r1, r2;
    try {
        [r1, r2] = await Promise.all([
            fetch(base + "map.csv"),
            fetch(base + "collisions.csv"),
        ]);
        if (!r1.ok) throw new Error(`map.csv fallo (${r1.status})`);
        if (!r2.ok) throw new Error(`collisions.csv fallo (${r2.status})`);
    } catch (err) {
        error(MODULE, `error cargando "${mapName}":`, err);
        throw err;
    }

    const [mapCSV, logicCSV, defText] = await Promise.all([
        r1.text(), r2.text(), fetchFlexJSON(`${base}definitions`)
    ]);

    const map         = parseCSV(mapCSV);
    const logic       = parseCSV(logicCSV);
    const definitions = parseFlexJSON(defText);

    validarEstructura(map, logic);
    validarLogica(logic, definitions);

    const spawn = buscarSpawn(logic, definitions);

    return {
        name: mapName,
        map, logic, definitions, spawn,
        width:  map[0].length,
        height: map.length,
    };
}

function validarEstructura(map, logic) {
    if (map.length !== logic.length)
        throw new Error(`filas distintas: map=${map.length}, logic=${logic.length}`);
    const w = map[0].length;
    for (let y = 0; y < map.length; y++) {
        if (map[y].length !== w || logic[y].length !== w)
            throw new Error(`fila ${y} tiene ancho inconsistente`);
    }
}

function validarLogica(logic, definitions) {
    let spawns = 0;
    for (let y = 0; y < logic.length; y++) {
        for (let x = 0; x < logic[y].length; x++) {
            const id  = logic[y][x];
            const def = definitions.collisions[id];
            if (!def) throw new Error(`sin definicion pa id ${id} en (${x},${y})`);
            if (def.type === "player_spawn") spawns++;
        }
    }
    if (spawns > 1) throw new Error(`demasiados player_spawn: ${spawns}`);
}

function buscarSpawn(logic, definitions) {
    for (let y = 0; y < logic.length; y++) {
        for (let x = 0; x < logic[y].length; x++) {
            const def = definitions.collisions[logic[y][x]];
            if (def?.type === "player_spawn") return { x, y };
        }
    }
    warn(MODULE, "no hay player_spawn en este mapa");
    return null;
}
