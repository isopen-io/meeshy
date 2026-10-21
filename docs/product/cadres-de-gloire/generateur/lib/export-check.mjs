// Juge un export (lot L1) : rouge tant qu'une couche peinte par le générateur porte du texte ou un oiseau, qu'une
// fenêtre photo est voilée par le décor ou trop voilée par le grade, que la bande du bandeau n'est pas pleine, qu'un
// emplacement de texte n'a pas de contraste mesuré, qu'une plaque dessinée n'a pas ses deux variantes (plain et message,
// la seconde sans changer le décor), ou qu'un fichier déclaré ne correspond pas à ses octets.
// Usage : node lib/export-check.mjs [export] [--reference ../reference/sha256.json] [--partial : n'exige pas les 191 cadres]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from './sharp.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const root = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(HERE, '../export'));
const referencePath = path.resolve(arg('--reference', path.join(HERE, '../../reference/sha256.json')));

export const LIMITS = {
  veilMaxAlpha: 0,
  gradeMeanAlpha: 0.35,
  gradeCoreMeanAlpha: 0.2,
  bandOpaque: 0.995,
};
const PAINTED = ['decor', 'windowFill', 'grade', 'front', 'plate'];

const failures = [];
const fail = (frame, why) => failures.push(`${frame} : ${why}`);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const layerFiles = (layers) => Object.entries(layers ?? {}).flatMap(([kind, value]) => {
  if (!value) return [];
  if (value.src) return [[kind, value]];
  return Object.entries(value).filter(([, v]) => v?.src).map(([variant, v]) => [`${kind}.${variant}`, v]);
});

async function alphaPlane(dir, layer) {
  const { data, info } = await sharp(path.join(dir, layer.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info, box: layer.box };
}

async function checkFrame(dir, frame) {
  const id = frame.frame;
  for (const kind of PAINTED) {
    const inv = frame.inventory?.[kind];
    if (!inv) continue;
    if (inv.text > 0) fail(id, `${inv.text} texte(s) dans la couche ${kind}`);
    if (inv.birds > 0) fail(id, `${inv.birds} oiseau(x) dans la couche ${kind}`);
  }
  if (!frame.inventory?.decor) fail(id, 'inventaire de la couche decor absent');
  for (const [name, layer] of [...layerFiles(frame.layers), ['window', frame.window?.mask], ['thumb', frame.thumb]]) {
    if (!layer?.src) { if (name === 'window' || name === 'thumb') fail(id, `${name} absent`); continue; }
    const file = path.join(dir, layer.src);
    if (!fs.existsSync(file)) { fail(id, `${name} : fichier ${layer.src} absent`); continue; }
    const buf = fs.readFileSync(file);
    if (buf.length !== layer.bytes || sha256(buf) !== layer.sha256) fail(id, `${name} : octets ≠ déclaration`);
  }
  if (frame.layers?.plate) {
    for (const variant of ['plain', 'message']) if (!frame.layers.plate[variant]?.src) fail(id, `plaque sans sa variante ${variant}`);
    const other = frame.plateVariant;
    if (other && other.decorDelta !== 0 && other.decorDelta !== null) fail(id, `la variante ${other.variant} de la plaque change le décor : ${other.decorDelta} px`);
  }
  if (!frame.layers?.decor?.src || !frame.window?.mask?.src) return;
  const [decor, win] = await Promise.all([alphaPlane(dir, frame.layers.decor), alphaPlane(dir, frame.window.mask)]);
  const at = (plane, x, y) => {
    const [bx, by, bw, bh] = plane.box;
    const lx = x - bx, ly = y - by;
    return lx < 0 || ly < 0 || lx >= bw || ly >= bh ? 0 : plane.data[(ly * bw + lx) * 4 + 3];
  };
  const [wx, wy, ww, wh] = frame.window.box;
  if (!(ww > 0 && wh > 0)) { fail(id, 'aucune fenêtre photo'); return; }
  let inside = 0, veiled = 0;
  for (let y = wy; y < wy + wh; y++) {
    for (let x = wx; x < wx + ww; x++) {
      if (at(win, x, y) < 128) continue;
      inside++;
      if (at(decor, x, y) / 255 > LIMITS.veilMaxAlpha) veiled++;
    }
  }
  if (veiled > 0) fail(id, `fenêtre voilée par le décor : ${veiled} px sur ${inside} au-delà de veilMaxAlpha`);
  const veil = frame.veil;
  if (!veil || !Number.isFinite(veil.meanAlpha)) fail(id, 'voile de la fenêtre non mesuré');
  else {
    if (veil.meanAlpha > LIMITS.gradeMeanAlpha) fail(id, `fenêtre trop voilée : alpha moyen du grade ${veil.meanAlpha} > ${LIMITS.gradeMeanAlpha}`);
    if (veil.coreMeanAlpha > LIMITS.gradeCoreMeanAlpha) fail(id, `cœur de fenêtre trop voilé : ${veil.coreMeanAlpha} > ${LIMITS.gradeCoreMeanAlpha}`);
  }
  const band = frame.banner;
  if (!band || !(band.opaque >= LIMITS.bandOpaque)) fail(id, `bande du bandeau non pleine (${band?.opaque})`);
  const slots = Object.entries(frame.text ?? {});
  if (slots.length === 0) fail(id, 'aucun emplacement de texte');
  for (const [key, slot] of slots) {
    if (!Number.isFinite(slot.contrast) || slot.contrast <= 0) fail(id, `emplacement ${key} sans contraste mesuré`);
  }
}

const reference = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
const expected = Object.keys(reference.frames).sort();
const index = fs.existsSync(path.join(root, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')) : null;
if (!index) failures.push(`aucun export sous ${root} (lancer node lib/export.mjs)`);
const seen = new Set();
for (const collection of index?.collections ?? []) {
  const dir = path.join(root, collection);
  const doc = JSON.parse(fs.readFileSync(path.join(dir, 'export.json'), 'utf8'));
  for (const frame of doc.frames) {
    seen.add(frame.frame);
    await checkFrame(dir, frame);
  }
}
const partial = process.argv.includes('--partial');
for (const name of expected) if (index && !partial && !seen.has(name)) failures.push(`${name} : absent de l'export`);

if (failures.length) {
  console.error(`ROUGE — ${failures.length} défaut(s) sur ${seen.size}/${expected.length} cadres :`);
  for (const line of failures.slice(0, 60)) console.error('  ' + line);
  if (failures.length > 60) console.error(`  … et ${failures.length - 60} autres`);
  process.exit(1);
}
console.log(`VERT — ${seen.size}/${expected.length} cadres : décor sans texte ni oiseau, fenêtres nettes, bande pleine, contrastes mesurés, plaques en deux variantes, octets conformes.`);
