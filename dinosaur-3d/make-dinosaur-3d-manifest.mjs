#!/usr/bin/env node
// Emit dinosaur-3d/manifest.json (schema ftol-dinosaur-3d/1) from sources.json +
// the committed .glb files: hashes each file (sha256) and records byte size, so
// the /dinosaur-3d viewer pages can integrity-verify each download. Run after
// adding or replacing a model:  node dinosaur-3d/make-dinosaur-3d-manifest.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sources = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
const models = {};
for (const [slug, m] of Object.entries(sources.models)) {
  const fp = path.join(HERE, m.file);
  if (!fs.existsSync(fp)) { console.error('MISSING model file:', m.file); process.exit(1); }
  const buf = fs.readFileSync(fp);
  if (buf.slice(0, 4).toString('latin1') !== 'glTF') { console.error('NOT a binary glTF:', m.file); process.exit(1); }
  models[slug] = {
    file: m.file,
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    kind: m.kind || 'fleshed',
    targetLenUnits: m.targetLenUnits || 12,
    license: m.license,
    credit: m.credit,
    source_url: m.source_url,
  };
  console.log(`${slug}: ${m.file} ${buf.length}B sha256=${models[slug].sha256.slice(0, 12)}...`);
}
const manifest = {
  schema: 'ftol-dinosaur-3d/1',
  version: sources.version || fs.readFileSync(path.join(HERE, 'VERSION'), 'utf8').trim(),
  category: 'dinosaur-3d',
  generated_note: 'Procedural-first: every /dinosaur-3d viewer first-paints a procedural model (G16). These OPTIONAL free-licensed glTF assets are fetched post-paint and swapped in. A species with no entry here simply stays procedural.',
  models,
};
fs.writeFileSync(path.join(HERE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote manifest.json with', Object.keys(models).length, 'model(s)');
