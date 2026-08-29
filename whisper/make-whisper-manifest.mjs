#!/usr/bin/env node
// Writes out/whisper/manifest.json - fetched first by the meeting-notes tool so it
// can show an honest download size before starting, and verify what it cached.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const [root, repoId, revision, modelDir] = process.argv.slice(2);
if (!root) {
    console.error('usage: make-whisper-manifest.mjs <outRoot> <repoId> <revision> <modelDir>');
    process.exit(1);
}
const dir = join(root, modelDir);

function walk(d, acc = []) {
    for (const name of readdirSync(d).sort()) {
        const p = join(d, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, acc);
        else if (!name.endsWith('.part')) acc.push(p);
    }
    return acc;
}

const assets = walk(dir).map((p) => ({
    file: relative(dir, p).split('\\').join('/'),
    bytes: statSync(p).size,
    sha256: createHash('sha256').update(readFileSync(p)).digest('hex'),
}));

const manifest = {
    name: 'whisper',
    models: [
        {
            id: modelDir,
            label: 'Whisper base (q8)',
            source: { repo: `https://huggingface.co/${repoId}`, revision },
            license: 'Apache-2.0 (openai/whisper-base weights; see LICENSE)',
            dtype: 'q8',
            sample_rate: 16000,
            total_bytes: assets.reduce((n, a) => n + a.bytes, 0),
            assets,
        },
    ],
};

writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const mb = (manifest.models[0].total_bytes / 1048576).toFixed(1);
console.log(`manifest.json: ${assets.length} assets, ${mb} MB for ${modelDir}`);
