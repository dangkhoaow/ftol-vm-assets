// parsear json con comentarios y comas de mas

import { debug, warn } from "./debug.js";

const MODULE = "JSON";

// limpia el texto y parsea
export function parseFlexJSON(text) {
    const limpio = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n\r]*/g, "")
        .replace(/,(\s*[\]}])/g, "$1");
    return JSON.parse(limpio);
}

// busca el archivo probando extensiones jsonc json5 json
export async function fetchFlexJSON(url) {
    const exts = ["jsonc", "json5", "json"];
    const res = await Promise.allSettled(exts.map(e => fetch(`${url}.${e}`)));

    for (let i = 0; i < res.length; i++) {
        const r = res[i];
        if (r.status === "fulfilled" && r.value.ok) {
            debug(MODULE, `resuelto: ${url}.${exts[i]}`);
            return r.value.text();
        }
    }

    warn(MODULE, `no encontro nada en: ${url}`);
    throw new Error(`No JSON en "${url}"`);
}
