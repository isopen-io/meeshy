// Pose `window.path` (#10254) sur les contrats VERSIONNÉS, depuis le masque que chacun sert déjà — sans réexporter.
// Un export complet n'est pas reproductible à l'octet d'une machine à l'autre (mesuré le 2026-10-25 : 98 masques sur
// 188 diffèrent de 1 à 108 px, 181 décors) : réimporter pour ajouter une clé changerait toutes les couches des packs
// pour du bruit de rendu. Le chemin se dérive donc du masque VERSIONNÉ, par la même fonction que lib/export.mjs
// (lib/window-path.mjs) : un import futur le porte depuis l'export, et ce script n'a plus rien à écrire.
// Rien d'autre ne change dans un contrat : la clé se pose après `box`, le reste est réécrit à l'identique.
// Usage : node lib/window-paths.mjs (puis, depuis packages/shared : bun run generate:glory-frames)
import fs from 'node:fs';
import path from 'node:path';
import sharp from './sharp.mjs';
import { windowPath } from './window-path.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../../../../..');
const CONTRACTS = path.join(ROOT, 'packages/shared/design/glory-frames');
const STORE = path.join(ROOT, 'services/gateway/assets/packs');

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function pathOf(window) {
  const { data, info } = await sharp(path.join(STORE, window.mask.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const binary = new Uint8Array(info.width * info.height);
  for (let i = 0; i < binary.length; i++) binary[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  return windowPath({ data: binary, width: info.width, height: info.height, origin: [window.mask.box[0], window.mask.box[1]] });
}

async function withPath(window) {
  const d = await pathOf(window);
  const { box, path: _old, ...rest } = window;
  return d === null ? { box, ...rest } : { box, path: d, ...rest };
}

let written = 0;
let frames = 0;
for (const file of fs.readdirSync(CONTRACTS).filter((name) => name.endsWith('.json')).sort()) {
  const full = path.join(CONTRACTS, file);
  const before = fs.readFileSync(full, 'utf8');
  const document = JSON.parse(before);
  if (!Array.isArray(document.frames) || typeof document.collection !== 'string') continue;
  if (jsonText(document) !== before) throw new Error(`${file} : la réécriture à l'identique échoue, rien n'est posé`);
  const next = [];
  for (const frame of document.frames) {
    const formats = {};
    for (const [name, format] of Object.entries(frame.formats)) formats[name] = format === null ? null : { ...format, window: await withPath(format.window) };
    next.push({ ...frame, formats });
    frames++;
  }
  const after = jsonText({ ...document, frames: next });
  if (after !== before) {
    fs.writeFileSync(full, after);
    written++;
  }
}
console.log(`window.path : ${frames} cadres, ${written} contrat(s) réécrit(s)`);
