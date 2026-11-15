// Garde de l'amendement L2 de la référence (#10265) : chaque cadre dont Mee et Meo ont bougé (lib/anchors.json) porte,
// sous `amendments.l2` de reference/sha256.json, les ancres et l'empreinte du SVG que les ateliers produisent dans out/.
// Une ancre corrigée sans amendement rejoué rougit ici, avant que recompose.mjs ne juge le cadre contre le rendu d'un
// autre dessin. Un rendu qui reste à refaire (`png: null`) est signalé : il se rejoue par
// `node lib/reference.mjs out ../reference --amend l2 --design <out CADRES_ANCHORS=off> --only <cadres>`, au Chromium
// de l'amendement. Sans navigateur ; les SVG doivent être générés (ateliers/*/gen.py).
// Usage : node lib/amendment.mjs --check [--out out] [--mutate anchor]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { amendmentDrift } from './amendment-rule.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(arg('--out', path.join(HERE, '../out')));
const MUTATE = arg('--mutate');
if (MUTATE && MUTATE !== 'anchor') throw new Error(`--mutate ${MUTATE} : seul « anchor » est connu.`);

const reference = JSON.parse(fs.readFileSync(path.join(HERE, '../../reference/sha256.json'), 'utf8'));
const read = JSON.parse(fs.readFileSync(path.join(HERE, 'anchors.json'), 'utf8'));
const [first] = Object.keys(read).sort();
const anchors = MUTATE ? { ...read, [first]: read[first].map((a, i) => (i ? a : { ...a, dx: a.dx + 1 })) } : read;
const frames = reference.amendments?.l2?.frames ?? {};
const svgOf = (name) => {
  const file = path.join(OUT, frames[name].collection, name + '.svg');
  return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
};
const svg = Object.fromEntries(Object.keys(frames).map((name) => [name, svgOf(name)]));
const { drift, pending } = amendmentDrift({ frames, anchors, svg });

const WHY = { anchors: 'ancres ≠ lib/anchors.json', svg: 'SVG régénéré ≠ empreinte de l’amendement', missing: 'ancré sans amendement', orphan: 'amendé sans ancre' };
console.log(`amendement l2 : ${Object.keys(frames).length} cadres, ${drift.length} dérive(s), ${pending.length} rendu(s) à refaire`);
for (const { frame, reason } of drift) console.log(`  ${frame} : ${WHY[reason]}`);
if (pending.length) console.log(`  à rendre au Chromium ${reference.amendments.l2.chromium} : node lib/reference.mjs out ../reference --amend l2 --design <out CADRES_ANCHORS=off> --only ${pending.join(',')}`);
process.exit(drift.length ? 1 : 0);
