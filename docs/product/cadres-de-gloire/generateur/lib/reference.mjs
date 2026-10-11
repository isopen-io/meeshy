// Fige la référence de fidélité (lot L0) : rend chaque SVG d'une génération en PNG 1080×1920 (polices telles que la
// planche validée les a chargées), écrit reference/sha256.json et un WebP SANS PERTE par collection.
// Usage : node lib/reference.mjs <out> <reference> --commit <sha> [--keep <dossier des PNG>] [--jobs 3]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './launch.mjs';
import { openPage, pool, shoot, showSvg } from './page.mjs';
import sharp, { sharpVersion } from './sharp.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const out = path.resolve(process.argv[2]);
const reference = path.resolve(process.argv[3]);
const commit = arg('--commit');
const keep = arg('--keep') && path.resolve(arg('--keep'));
const jobs = Number(arg('--jobs', '3'));
if (!commit) throw new Error('--commit <sha> : la génération rendue doit nommer son commit.');

export const SAMPLES = { moments: 'moments-meesh-100', tresor: 'tresor-reserve-a', poses: 'poses-ruban' };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const collections = fs.readdirSync(out).filter((d) => fs.statSync(path.join(out, d)).isDirectory()).sort();
const frames = collections.flatMap((c) => fs.readdirSync(path.join(out, c)).filter((f) => f.endsWith('.svg')).sort().map((f) => ({ collection: c, name: f.slice(0, -4) })));
const browser = await launch();
const pages = await Promise.all(Array.from({ length: jobs }, () => openPage(browser)));
const free = [...pages];
fs.mkdirSync(path.join(reference, 'samples'), { recursive: true });
if (keep) fs.mkdirSync(keep, { recursive: true });

const rows = await pool(frames, jobs, async ({ collection, name }) => {
  const handle = free.pop();
  try {
    const svg = fs.readFileSync(path.join(out, collection, name + '.svg'));
    await showSvg(handle, svg.toString('utf8'), { fonts: 'design' });
    const png = await shoot(handle);
    if (keep) fs.writeFileSync(path.join(keep, name + '.png'), png);
    const sample = (SAMPLES[collection] ?? `${collection}-ambassadeur-1`) === name;
    if (sample) await sharp(png).webp({ lossless: true, effort: 6 }).toFile(path.join(reference, 'samples', name + '.webp'));
    return [name, { collection, svg: sha256(svg), png: sha256(png), sample }];
  } finally {
    free.push(handle);
  }
});

const doc = {
  note: 'Référence de fidélité du lot L0 (#9963) : la génération du commit ci-dessous, rendue par Chromium en 1080×1920, polices de fonts.css. Le générateur refactoré (L1) se juge contre elle, jamais contre lui-même.',
  commit,
  chromium: browser.version(),
  sharp: sharpVersion().sharp,
  libwebp: sharpVersion().webp,
  size: [1080, 1920],
  count: rows.length,
  frames: Object.fromEntries(rows),
};
fs.writeFileSync(path.join(reference, 'sha256.json'), JSON.stringify(doc, null, 2) + '\n');
await Promise.all(pages.map((p) => p.dispose()));
await browser.close();
console.log('référence', rows.length, 'cadres,', rows.filter(([, r]) => r.sample).length, 'échantillons');
