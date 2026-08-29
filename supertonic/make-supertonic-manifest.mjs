#!/usr/bin/env node
// Writes out/supertonic/<version>/manifest.json - the file the tool page fetches
// first. Every asset carries bytes + sha256 so the page can show an honest
// download size before it starts, and verify what it cached.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const [dir, repoId, revision, version] = process.argv.slice(2);
if (!dir) {
    console.error('usage: make-supertonic-manifest.mjs <dir> <repoId> <revision> <version>');
    process.exit(1);
}

function walk(d, acc = []) {
    for (const name of readdirSync(d).sort()) {
        const p = join(d, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, acc);
        else if (name !== 'manifest.json' && !name.endsWith('.part')) acc.push(p);
    }
    return acc;
}

const assets = walk(dir).map((p) => ({
    file: relative(dir, p).split('\\').join('/'),
    bytes: statSync(p).size,
    sha256: createHash('sha256').update(readFileSync(p)).digest('hex'),
}));

const isModel = (f) => f.startsWith('onnx/') && f.endsWith('.onnx');
const manifest = {
    name: 'supertonic',
    version,
    source: { repo: `https://huggingface.co/${repoId}`, revision },
    license: {
        model_weights: 'BigScience OpenRAIL-M (see LICENSE - use-based restrictions apply)',
        reference_code: 'MIT (supertone-inc/supertonic web demo, reimplemented for this site)',
    },
    sample_rate: 44100,
    voices: ['M1', 'M2', 'M3', 'M4', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5'],
    core_bytes: assets.filter((a) => isModel(a.file) || a.file.startsWith('onnx/')).reduce((n, a) => n + a.bytes, 0),
    total_bytes: assets.reduce((n, a) => n + a.bytes, 0),
    assets,
};

writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
    `manifest.json: ${assets.length} assets, core ${(manifest.core_bytes / 1048576).toFixed(1)} MB, total ${(manifest.total_bytes / 1048576).toFixed(1)} MB`
);
