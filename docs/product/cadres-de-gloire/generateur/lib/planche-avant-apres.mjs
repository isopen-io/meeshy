// La planche de revalidation du lot L2 : pour chaque cadre dont Mee et Meo ont bougé (lib/anchors.json), le dessin
// validé (AVANT, généré avec CADRES_ANCHORS=off) à côté du dessin corrigé (APRÈS), avec l'empiètement mesuré de chacun.
// Usage : node lib/planche-avant-apres.mjs <out> <out du dessin validé> <dossier> [--avant <controle d'avant>]
//                                          [--apres ../controle] [--only neon]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './launch.mjs';
import { openPage, shoot, showSvg } from './page.mjs';
import sharp from './sharp.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const [out, design, dest] = process.argv.slice(2, 5).map((p) => path.resolve(p));
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;
const readControle = (dir) => (dir && fs.existsSync(dir)
  ? Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).map((r) => [r.file, r])))
  : {});
const before = readControle(arg('--avant') && path.resolve(arg('--avant')));
const after = readControle(path.resolve(arg('--apres', path.join(HERE, '../../controle'))));
const anchors = JSON.parse(fs.readFileSync(path.join(HERE, 'anchors.json'), 'utf8'));

const TW = 180, TH = 320, GAP = 10, PAIR_GAP = 28, LABEL = 46, PER_ROW = 4;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const label = (lines, width) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL}">${lines.map((l, i) => `<text x="4" y="${17 + i * 18}" font-family="Helvetica, Arial, sans-serif" font-size="${i ? 12 : 14}" fill="${i ? '#B9B4C8' : '#F4F1FA'}">${esc(l)}</text>`).join('')}</svg>`);
const measure = (r) => (r ? `overlap ${r.overlap} px · depth ${r.depth} px` : '');

const browser = await launch();
const handle = await openPage(browser);
const render = async (file) => {
  await showSvg(handle, fs.readFileSync(file, 'utf8'), { fonts: 'design' });
  return sharp(await shoot(handle)).resize(TW, TH).png().toBuffer();
};
fs.mkdirSync(dest, { recursive: true });
const collections = fs.readdirSync(out).filter((d) => fs.existsSync(path.join(out, d, 'manifest.json'))).filter((c) => !ONLY || ONLY.has(c)).sort();
for (const collection of collections) {
  const frames = fs.readdirSync(path.join(out, collection)).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).filter((n) => anchors[n]).sort();
  if (frames.length === 0) continue;
  const pairW = 2 * TW + GAP;
  const cellH = LABEL + TH;
  const cols = Math.min(PER_ROW, frames.length);
  const rows = Math.ceil(frames.length / PER_ROW);
  const width = GAP + cols * (pairW + PAIR_GAP) - PAIR_GAP + GAP;
  const height = 56 + rows * (cellH + PAIR_GAP);
  const composites = [{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="56"><text x="${GAP}" y="36" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="#F4F1FA">${esc(collection)} — avant / après (L2, ${frames.length} cadres)</text></svg>`), left: 0, top: 0 }];
  for (const [i, name] of frames.entries()) {
    const left = GAP + (i % PER_ROW) * (pairW + PAIR_GAP);
    const top = 56 + Math.floor(i / PER_ROW) * (cellH + PAIR_GAP);
    composites.push({ input: label([`${name} · avant`, measure(before[name])], TW), left, top });
    composites.push({ input: label(['après', measure(after[name])], TW), left: left + TW + GAP, top });
    composites.push({ input: await render(path.join(design, collection, name + '.svg')), left, top: top + LABEL });
    composites.push({ input: await render(path.join(out, collection, name + '.svg')), left: left + TW + GAP, top: top + LABEL });
  }
  await sharp({ create: { width, height, channels: 3, background: '#1E1B26' } }).composite(composites).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(dest, collection + '.jpg'));
  console.log(`  ${collection} : ${frames.length} cadres → ${path.relative(process.cwd(), path.join(dest, collection + '.jpg'))}`);
}
await handle.dispose();
await browser.close();
