// Fige la référence de fidélité (lot L0) : rend chaque SVG d'une génération en PNG 1080×1920 (polices telles que la
// planche validée les a chargées), écrit reference/sha256.json et un WebP SANS PERTE par collection.
// Usage : node lib/reference.mjs <out> <reference> --commit <sha> [--keep <dossier des PNG>] [--jobs 3]
//         node lib/reference.mjs <out> <reference> --amend l2 --design <out du dessin validé> [--jobs 3]
// --amend l2 n'écrase JAMAIS la référence : il ajoute à sha256.json, sous `amendments.l2`, le rendu des seuls cadres
// dont Mee et Meo ont bougé (lib/anchors.json), avec la preuve que rien d'autre n'a bougé — `decorDelta`, les pixels
// qui diffèrent entre le dessin validé (`--design`, généré avec CADRES_ANCHORS=off) et le dessin corrigé, oiseaux,
// ce qui les suit (data-follows-bird) et texte vivant masqués (le titre en dégradé sur chemin courbe de poses-ruban
// ne se rend pas deux fois à l'identique dans Chromium). recompose.mjs juge alors ces cadres contre l'amendement.
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
const amend = arg('--amend');
const design = arg('--design') && path.resolve(arg('--design'));
if (!commit && !amend) throw new Error('--commit <sha> : la génération rendue doit nommer son commit.');
if (amend && !design) throw new Error('--amend demande --design <out du dessin validé> (CADRES_ANCHORS=off).');

export const SAMPLES = { moments: 'moments-meesh-100', tresor: 'tresor-reserve-a', poses: 'poses-ruban' };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const collections = fs.readdirSync(out).filter((d) => fs.statSync(path.join(out, d)).isDirectory()).sort();
const frames = collections.flatMap((c) => fs.readdirSync(path.join(out, c)).filter((f) => f.endsWith('.svg')).sort().map((f) => ({ collection: c, name: f.slice(0, -4) })));
if (amend) {
  const doc = JSON.parse(fs.readFileSync(path.join(reference, 'sha256.json'), 'utf8'));
  const anchors = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'anchors.json'), 'utf8'));
  const browser = await launch();
  const pages = await Promise.all(Array.from({ length: jobs }, () => openPage(browser)));
  const free = [...pages];
  const hideBirds = () => document.querySelectorAll('[data-layer="birds"], [data-follows-bird], text').forEach((el) => { el.style.display = 'none'; });
  const rows = await pool(frames.filter(({ name }) => anchors[name]), jobs, async ({ collection, name }) => {
    const handle = free.pop();
    try {
      const svg = fs.readFileSync(path.join(out, collection, name + '.svg'));
      await showSvg(handle, svg.toString('utf8'), { fonts: 'design' });
      const png = await shoot(handle);
      await handle.page.evaluate(hideBirds);
      const moved = await sharp(await shoot(handle)).raw().toBuffer();
      await showSvg(handle, fs.readFileSync(path.join(design, collection, name + '.svg'), 'utf8'), { fonts: 'design' });
      const designPng = await shoot(handle);
      await handle.page.evaluate(hideBirds);
      const kept = await sharp(await shoot(handle)).raw().toBuffer();
      let decorDelta = 0;
      for (let i = 0; i < moved.length; i += 4) if (moved.readUInt32LE(i) !== kept.readUInt32LE(i)) decorDelta++;
      return [name, { collection, svg: sha256(svg), png: sha256(png), designPng: sha256(designPng) === doc.frames[name]?.png, anchors: anchors[name], decorDelta }];
    } finally {
      free.push(handle);
    }
  });
  doc.amendments = { ...(doc.amendments ?? {}), [amend]: {
    note: 'Lot L2 (#10153) : Mee et Meo déplacés hors de la photo (lib/anchors.json). Le décor ne bouge pas (decorDelta = 0 ; seule la lueur posée sous un oiseau le suit). En attente de la revalidation du porteur (#9963) ; vider lib/anchors.json rend la référence L0.',
    chromium: browser.version(),
    count: rows.length,
    frames: Object.fromEntries(rows),
  } };
  fs.writeFileSync(path.join(reference, 'sha256.json'), JSON.stringify(doc, null, 2) + '\n');
  await Promise.all(pages.map((p) => p.dispose()));
  await browser.close();
  const touched = rows.filter(([, r]) => r.decorDelta > 0);
  console.log(`amendement ${amend} : ${rows.length} cadres ; dessin validé retrouvé à l'octet : ${rows.filter(([, r]) => r.designPng).length}/${rows.length} ; décor identique hors oiseaux : ${rows.length - touched.length}/${rows.length}`);
  for (const [name, r] of touched) console.log(`  ${name} : ${r.decorDelta} px hors oiseaux`);
  process.exit(rows.every(([, r]) => r.designPng && r.decorDelta === 0) ? 0 : 1);
}

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
