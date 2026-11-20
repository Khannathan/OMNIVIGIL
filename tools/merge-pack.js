#!/usr/bin/env node
// Flattens a folder pack (pack.json + include files) into ONE json file that can be
// imported in-game via Packs > Import Pack.   Usage: node tools/merge-pack.js packs/my-pack out.json
const fs = require('fs');
const path = require('path');
const [dir, outFile] = process.argv.slice(2);
if (!dir) { console.error('usage: node tools/merge-pack.js <pack-folder> [out.json]'); process.exit(1); }
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'));
const merged = Object.assign({}, meta);
delete merged.include;
for (const f of meta.include || []) {
  const part = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const [k, v] of Object.entries(part)) merged[k] = (merged[k] || []).concat(v);
}
const out = outFile || `${meta.id}.json`;
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
console.log('wrote', out);
