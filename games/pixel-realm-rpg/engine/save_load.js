// guarda y carga el juego en el localStorage

import { info, error } from "./debug.js";

const MODULE = "SaveLoad";
const LLAVE  = "ftol:pixelrealmrpg:jsrpg_save";

function saveGameState(state) {
    try {
        localStorage.setItem(LLAVE, JSON.stringify(state));
    } catch (err) {
        error(MODULE, "no se pudo guardar:", err);
    }
}

function loadGameState() {
    try {
        const raw = localStorage.getItem(LLAVE);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (err) {
        error(MODULE, "save corrompido, borrando:", err);
        clearGameState();
        return null;
    }
}

function clearGameState() {
    info(MODULE, "borrando save");
    localStorage.removeItem(LLAVE);
}

export { saveGameState, loadGameState, clearGameState };
