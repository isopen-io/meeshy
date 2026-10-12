// Juge un export contre la référence de fidélité du L0 (§ 8.3) : chaque cadre est RECOMPOSÉ depuis ses couches
// exportées, plus ce que l'app peindra (photo factice dans la fenêtre, blason, oiseaux et texte rendus à leurs
// positions cuites), puis comparé au rendu de référence — dont le sha256 est d'abord vérifié contre
// reference/sha256.json : la référence ne se recalcule pas, elle se retrouve. Un cadre dont Mee et Meo ont bougé (L2)
// se retrouve dans `amendments` (lib/reference.mjs --amend), décor prouvé identique.
// Hors boîtes de texte et de blason : ≥ 99,5 % des pixels à |Δ| ≤ 6 par canal, aucun bloc 16×16 à Δ moyen > 12.
// Usage : node lib/recompose.mjs [export] [--only a,b] [--jobs 3] [--sheet cadre1,cadre2,cadre3 --sheet-dir dossier]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './launch.mjs';
import { classify, show } from './layers.mjs';
import { H, openPage, pool, SCALE, shoot, showSvg, W } from './page.mjs';
import sharp from './sharp.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const EXPORT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(HERE, '../export'));
const OUT = path.resolve(arg('--out', path.join(HERE, '../out')));
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;
const JOBS = Number(arg('--jobs', '3'));
const SHEET = new Set((arg('--sheet') ?? '').split(',').filter(Boolean));
const SHEET_DIR = path.resolve(arg('--sheet-dir', path.join(EXPORT, '_planches')));
const reference = JSON.parse(fs.readFileSync(path.join(HERE, '../../reference/sha256.json'), 'utf8'));

const FW = W * SCALE;
const FH = H * SCALE;
export const TOLERANCE = { delta: 6, share: 0.995, block: 16, blockMean: 12, margin: 6 };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const decode = async (input) => (await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;

async function placed(dir, layer) {
  if (!layer?.src) return null;
  const [x, y] = layer.box;
  const png = await sharp({ create: { width: FW, height: FH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: path.join(dir, layer.src), left: x, top: y }]).png().toBuffer();
  return decode(png);
}

function over(dst, src, { mask = null, blend = 'normal' } = {}) {
  for (let i = 0; i < FW * FH; i++) {
    const p = i * 4;
    let as = src[p + 3] / 255;
    if (mask) as *= mask[p + 3] / 255;
    if (as === 0) continue;
    const ab = dst[p + 3] / 255;
    const ao = as + ab * (1 - as);
    for (let c = 0; c < 3; c++) {
      const cs = src[p + c] / 255;
      const cb = dst[p + c] / 255;
      const mixed = blend === 'screen' ? cs + cb - cs * cb : blend === 'multiply' ? cs * cb : cs;
      const co = (1 - ab) * as * cs + (1 - as) * ab * cb + as * ab * mixed;
      dst[p + c] = Math.round((co / ao) * 255);
    }
    dst[p + 3] = Math.round(ao * 255);
  }
}

function compare(a, b, excluded) {
  const premul = (buf, p, c) => (buf[p + c] * buf[p + 3]) / 255;
  const B = TOLERANCE.block;
  const blocks = new Float64Array(Math.ceil(FW / B) * Math.ceil(FH / B));
  const counts = new Uint32Array(blocks.length);
  let total = 0, ok = 0, sq = 0;
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      if (excluded(x, y)) continue;
      const p = (y * FW + x) * 4;
      const d = Math.max(...[0, 1, 2].map((c) => Math.abs(premul(a, p, c) - premul(b, p, c))), Math.abs(a[p + 3] - b[p + 3]));
      total++;
      sq += d * d;
      if (d <= TOLERANCE.delta) ok++;
      const k = Math.floor(y / B) * Math.ceil(FW / B) + Math.floor(x / B);
      blocks[k] += d;
      counts[k]++;
    }
  }
  let worst = 0;
  blocks.forEach((s, k) => { if (counts[k] >= (B * B) / 2) worst = Math.max(worst, s / counts[k]); });
  const psnr = sq === 0 ? 99 : 10 * Math.log10((255 * 255) / (sq / total));
  return { share: Math.round((ok / total) * 100000) / 100000, worstBlock: Math.round(worst * 100) / 100, psnr: Math.round(psnr * 100) / 100 };
}

async function judge(handle, { collection, frame }) {
  const dir = path.join(EXPORT, collection);
  const svg = fs.readFileSync(path.join(OUT, collection, frame.frame + '.svg'), 'utf8');
  await showSvg(handle, svg, { fonts: 'design' });
  const refPng = await shoot(handle);
  const amended = Object.values(reference.amendments ?? {}).map((a) => a.frames?.[frame.frame]).filter(Boolean).at(-1);
  const expected = amended?.png ?? reference.frames[frame.frame]?.png;
  const { page } = handle;
  await page.evaluate(classify);
  const render = async (kinds) => {
    await page.evaluate(show, { kinds });
    return decode(await shoot(handle));
  };
  const photo = await render(['backdrop', 'photo-bg', 'photo']);
  const live = { crest: await render(['crest']), birds: await render(['birds']), text: await render(['text']) };
  const L = frame.layers;
  const files = {
    window: await placed(dir, frame.window.mask),
    decor: await placed(dir, L.decor),
    ...Object.fromEntries(await Promise.all((L.grade ?? []).map(async (layer, n) => [`grade:${n}`, await placed(dir, layer)]))),
    ...Object.fromEntries(await Promise.all(Object.entries(L.front ?? {}).map(async ([rank, layer]) => [`front:${rank}`, await placed(dir, layer)]))),
    plate: await placed(dir, L.plate?.[frame.message ? 'message' : 'plain']),
  };
  const canvas = Buffer.alloc(FW * FH * 4);
  for (const step of frame.stack) {
    if (step === 'photo') over(canvas, photo, { mask: files.window });
    else if (step.startsWith('grade:')) files[step] && over(canvas, files[step], { blend: L.grade[Number(step.slice(6))]?.blend });
    else if (live[step]) over(canvas, live[step]);
    else if (files[step]) over(canvas, files[step]);
  }
  const ref = await decode(refPng);
  const boxes = [...Object.values(frame.text).map((t) => t.bbox), ...(frame.crest ? [frame.crest.box] : [])];
  const m = TOLERANCE.margin;
  const excluded = (x, y) => boxes.some(([bx, by, bw, bh]) => x >= bx - m && x < bx + bw + m && y >= by - m && y < by + bh + m);
  const score = compare(canvas, ref, excluded);
  if (SHEET.has(frame.frame)) {
    fs.mkdirSync(SHEET_DIR, { recursive: true });
    const gap = Buffer.alloc(FW * FH * 4);
    for (let i = 0; i < FW * FH; i++) {
      const p = i * 4;
      const d = Math.max(...[0, 1, 2].map((c) => Math.abs((canvas[p + c] * canvas[p + 3] - ref[p + c] * ref[p + 3]) / 255)), Math.abs(canvas[p + 3] - ref[p + 3]));
      const out = excluded(i % FW, Math.floor(i / FW));
      gap.writeUInt32BE(out ? 0x30303080 : d > TOLERANCE.delta ? 0xff2020ff : ((ref[p] >> 2) << 24) | ((ref[p + 1] >> 2) << 16) | ((ref[p + 2] >> 2) << 8) | 0xff, p);
    }
    const tiles = [['decor', files.decor], ['fenêtre', files.window], ['grade', Object.entries(files).find(([k, v]) => k.startsWith('grade:') && v)?.[1]], ['avant', Object.entries(files).find(([k, v]) => k.startsWith('front:') && v)?.[1]], ['plaque', files.plate], ['recomposé', canvas], ['référence', ref], ['écart', gap]];
    const tw = 360, th = 640, pad = 12;
    const composites = await Promise.all(tiles.map(async ([, buf], i) => ({
      input: await sharp(buf ?? Buffer.alloc(FW * FH * 4), { raw: { width: FW, height: FH, channels: 4 } }).resize(tw, th).png().toBuffer(),
      left: pad + i * (tw + pad), top: pad,
    })));
    await sharp({ create: { width: pad + tiles.length * (tw + pad), height: th + 2 * pad, channels: 4, background: '#2a2733' } })
      .composite(composites).jpeg({ quality: 82 }).toFile(path.join(SHEET_DIR, frame.frame + '.jpg'));
  }
  return { frame: frame.frame, referenceSha: sha256(refPng) === expected, ...score, pass: score.share >= TOLERANCE.share && score.worstBlock <= TOLERANCE.blockMean };
}

const index = JSON.parse(fs.readFileSync(path.join(EXPORT, 'index.json'), 'utf8'));
const jobs = index.collections.flatMap((collection) => JSON.parse(fs.readFileSync(path.join(EXPORT, collection, 'export.json'), 'utf8')).frames
  .filter((frame) => !ONLY || ONLY.has(frame.frame) || ONLY.has(collection)).map((frame) => ({ collection, frame })));
const browser = await launch();
const handles = await Promise.all(Array.from({ length: JOBS }, () => openPage(browser)));
const free = [...handles];
const rows = await pool(jobs, JOBS, async (job) => {
  const handle = free.pop();
  try {
    return await judge(handle, job);
  } finally {
    free.push(handle);
  }
});
await Promise.all(handles.map((h) => h.dispose()));
await browser.close();
const failing = rows.filter((r) => !r.pass || !r.referenceSha);
fs.writeFileSync(path.join(EXPORT, 'fidelity.json'), JSON.stringify({ tolerance: TOLERANCE, frames: rows }, null, 2) + '\n');
const shares = rows.map((r) => r.share).sort((a, b) => a - b);
const psnrs = rows.map((r) => r.psnr).sort((a, b) => a - b);
console.log(`recomposition : ${rows.length - failing.length}/${rows.length} cadres dans la tolérance ; part minimale ${shares[0]}, médiane ${shares[Math.floor(shares.length / 2)]} ; PSNR minimal ${psnrs[0]} dB, médian ${psnrs[Math.floor(psnrs.length / 2)]} dB ; référence retrouvée à l'octet : ${rows.filter((r) => r.referenceSha).length}/${rows.length}`);
for (const r of failing) console.log(`  ${r.frame} : part ${r.share}, pire bloc ${r.worstBlock}${r.referenceSha ? '' : ', RÉFÉRENCE ≠ sha256.json'}`);
process.exit(failing.length ? 1 : 0);
