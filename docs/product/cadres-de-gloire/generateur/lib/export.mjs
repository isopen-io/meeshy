// L'exportateur unique (lot L1, § 5.1 et § 5.3 du prompt) : chaque cadre généré devient un jeu de couches raster
// WebP rognées à leur boîte, et un export.json BRUT qui décrit ce que l'app peindra elle-même (texte, oiseaux, blason).
// Usage : node lib/export.mjs [--generate] [--out out] [--export export] [--only savane,neon] [--jobs 3] [--mutate <défaut>]
//   --generate régénère d'abord les SVG de chaque atelier (python3, ou $PYTHON ; poses demande numpy et Pillow)
//   --mutate rejoue un défaut connu pour montrer export-check.mjs ROUGE : text-in-decor | birds-in-decor | veil | no-contrast
//
// Méthode, par cadre (Chromium, 1080×1920, polices aux graisses exactes) :
//   - la photo factice est remplacée par du magenta puis du vert (sondes) : là où les deux rendus diffèrent, la photo
//     se voit — c'est la FENÊTRE, sans aucune heuristique de couleur ;
//   - le décor est rendu sans photo, sans texte, sans oiseaux, sans blason, sans plaque, puis COUPÉ à la fenêtre :
//     dans la fenêtre son alpha est nul, et ce qu'il y peignait part dans `grade` (normal, ou `screen` séparément) ;
//   - chaque couche est rognée à sa boîte, encodée par sharp, adressée par son empreinte dans export.json.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './launch.mjs';
import { BLENDS, classify, read, show } from './layers.mjs';
import { H, openPage, pool, SCALE, shoot, showSvg, W } from './page.mjs';
import sharp, { sharpVersion } from './sharp.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(arg('--out', path.join(HERE, '../out')));
const EXPORT = path.resolve(arg('--export', path.join(HERE, '../export')));
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;
const JOBS = Number(arg('--jobs', '3'));
const MUTATE = arg('--mutate', null);

const FW = W * SCALE;
const FH = H * SCALE;
const BANNER = [0, 1720, FW, 200];
const CORNER = 28 * SCALE;
const THUMB = [270, 480];
const AFRICA = new Set(['savane', 'royaumes']);
const GRADES = [{ kind: 'decor', name: 'normal', blend: 'normal' }, ...BLENDS.map((b) => ({ kind: `decor-${b}`, name: b, blend: b })), { kind: 'decor-late', name: 'over', blend: 'normal' }];
const DECOR_KINDS = GRADES.map((g) => g.kind);
const gradeStep = (g) => (g.name === 'normal' ? 'grade' : `grade:${g.name}`);
const QUALITY = { decor: Number(arg('--quality', '82')), layer: Number(arg('--quality', '82')), thumb: 80 };
const LOSSLESS = process.argv.includes('--lossless');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const decode = async (png) => (await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;

function transmission(m, g) {
  const t = new Float32Array(FW * FH);
  for (let i = 0; i < FW * FH; i++) {
    const p = i * 4;
    t[i] = (Math.abs(m[p] - g[p]) + Math.abs(m[p + 1] - g[p + 1]) + Math.abs(m[p + 2] - g[p + 2])) / (3 * 255);
  }
  return t;
}

const cut = (buf, win, inside) => {
  const out = Buffer.from(buf);
  for (let i = 0; i < FW * FH; i++) {
    if ((win[i] === 1) !== inside) out.writeUInt32LE(0, i * 4);
  }
  return out;
};

function bbox(buf) {
  let x0 = FW, y0 = FH, x1 = -1, y1 = -1;
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      if (buf[(y * FW + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

async function encode(dir, name, buf, { quality = QUALITY.layer, lossless = false } = {}) {
  const box = bbox(buf);
  if (!box) return null;
  const [left, top, width, height] = box;
  const webp = await sharp(buf, { raw: { width: FW, height: FH, channels: 4 } })
    .extract({ left, top, width, height })
    .webp(lossless || LOSSLESS ? { lossless: true, effort: 6 } : { quality, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
  fs.writeFileSync(path.join(dir, name + '.webp'), webp);
  return { src: path.basename(dir) + '/' + name + '.webp', box, bytes: webp.length, sha256: sha256(webp) };
}

const luminance = (r, g, b) => {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const rgbOf = (css) => {
  const m = /rgba?\(([^)]+)\)/.exec(css ?? '');
  if (m) return m[1].split(',').slice(0, 3).map((v) => Number.parseFloat(v));
  const h = /^#([0-9a-f]{6})/i.exec(css ?? '');
  return h ? [0, 2, 4].map((i) => Number.parseInt(h[1].slice(i, i + 2), 16)) : null;
};
const fillColors = (fill) => (fill?.solid ? [rgbOf(fill.solid)] : (fill?.stops ?? []).map((s) => rgbOf(s.color))).filter(Boolean);
const flatColor = (i) => [20 + (i % 8) * 30, 20 + Math.floor(i / 8) * 30, 200];

function contrastOf(mask, color, bg, main) {
  const colors = fillColors(main.fill);
  if (colors.length === 0) return null;
  const op = main.opacity;
  const ratios = [];
  const [bx, by, bw, bh] = main.bbox;
  const x0 = Math.max(0, bx - 8), x1 = Math.min(FW, bx + bw + 8), y0 = Math.max(0, by - 8), y1 = Math.min(FH, by + bh + 8);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const p = (y * FW + x) * 4;
    if (mask[p + 3] !== 255 || mask[p] !== color[0] || mask[p + 1] !== color[1] || mask[p + 2] !== color[2]) continue;
    const a = bg[p + 3] / 255;
    const back = [bg[p] * a, bg[p + 1] * a, bg[p + 2] * a];
    const lb = luminance(...back);
    const worst = Math.min(...colors.map((c) => {
      const lt = luminance(...c.map((v, k) => v * op + back[k] * (1 - op)));
      return (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05);
    }));
    ratios.push(worst);
  }
  if (ratios.length === 0) return null;
  ratios.sort((x, y) => x - y);
  return { contrast: Math.round(ratios[Math.floor(ratios.length * 0.05)] * 100) / 100, contrastMin: Math.round(ratios[0] * 100) / 100, glyphPixels: ratios.length };
}

function slotsOf(texts) {
  const groups = new Map();
  texts.forEach((t) => groups.set(t.slot, [...(groups.get(t.slot) ?? []), t]));
  return [...groups.entries()].map(([slot, members]) => {
    const plain = members.filter((t) => !t.filter && t.opacity >= 0.5);
    const main = (plain.length ? plain : members).at(-1);
    const effects = members.filter((t) => t !== main).map((t) => ({
      dx: Math.round((t.matrix[4] + t.x - main.matrix[4] - main.x) * 100) / 100,
      dy: Math.round((t.matrix[5] + t.baseline - main.matrix[5] - main.baseline) * 100) / 100,
      fill: t.fill, stroke: t.stroke, opacity: t.opacity, filter: t.filter, under: t.index < main.index,
    }));
    return { slot, main, effects };
  });
}

function stackOf(order) {
  const anchored = [['crest', 'crest'], ['plate', 'plate'], ['front-under', 'front:under-birds'], ['birds', 'birds'], ['front-over', 'front:over-birds']]
    .filter(([k]) => order[k] !== undefined)
    .sort(([a], [b]) => order[a] - order[b])
    .map(([, name]) => name);
  const grades = GRADES.filter((g) => order[g.kind] !== undefined).sort((a, b) => order[a.kind] - order[b.kind]).map(gradeStep);
  return ['photo', ...grades, 'decor', ...anchored, 'text'];
}

function veilOf(win, layers) {
  let n = 0, sum = 0, core = 0, coreSum = 0;
  const box = win.box;
  const [cx0, cy0, cx1, cy1] = [box[0] + box[2] * 0.2, box[1] + box[3] * 0.2, box[0] + box[2] * 0.8, box[1] + box[3] * 0.8];
  for (let y = box[1]; y < box[1] + box[3]; y++) {
    for (let x = box[0]; x < box[0] + box[2]; x++) {
      const i = y * FW + x;
      if (win.mask[i] !== 1) continue;
      const clear = layers.reduce((acc, buf) => acc * (1 - buf[i * 4 + 3] / 255), 1);
      n++;
      sum += 1 - clear;
      if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) {
        core++;
        coreSum += 1 - clear;
      }
    }
  }
  const r = (v) => Math.round(v * 1000) / 1000;
  return { meanAlpha: n ? r(sum / n) : null, coreMeanAlpha: core ? r(coreSum / core) : null };
}

function bandOf(decor, front) {
  const [bx, by, bw, bh] = BANNER;
  let total = 0, opaque = 0;
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      const inCorner = y >= FH - CORNER && (x < CORNER || x >= FW - CORNER);
      if (inCorner) continue;
      const i = (y * FW + x) * 4 + 3;
      total++;
      if (Math.max(decor[i], front[i]) === 255) opaque++;
    }
  }
  return { box: BANNER, opaque: Math.round((opaque / total) * 10000) / 10000 };
}

async function exportFrame(handle, { collection, name, message }) {
  const dir = path.join(EXPORT, collection, name);
  fs.mkdirSync(dir, { recursive: true });
  const svg = fs.readFileSync(path.join(OUT, collection, name + '.svg'), 'utf8');
  await showSvg(handle, svg, { fonts: 'exact' });
  const { page } = handle;
  const { order } = await page.evaluate(classify);
  const dom = await page.evaluate(read);
  const render = async (kinds, extra = {}) => {
    const inventory = await page.evaluate(show, { kinds, ...extra });
    return { inventory, raw: await decode(await shoot(handle)) };
  };
  const has = (k) => order[k] !== undefined;
  const decorKinds = [...DECOR_KINDS, ...(MUTATE === 'text-in-decor' ? ['text'] : []), ...(MUTATE === 'birds-in-decor' ? ['birds'] : [])];

  const full = await render(['photo', 'photo-bg', 'backdrop', ...DECOR_KINDS, 'front-under', 'front-over', 'crest', 'plate', 'birds', 'text']);
  const probeM = await render(DECOR_KINDS, { probe: '#FF00FF' });
  const probeG = await render(DECOR_KINDS, { probe: '#00FF00' });
  const t = transmission(probeM.raw, probeG.raw);
  const winMask = new Uint8Array(FW * FH);
  for (let i = 0; i < FW * FH; i++) winMask[i] = t[i] > 0.02 ? 1 : 0;

  const decorRaw = await render(['backdrop', ...decorKinds]);
  const grades = [];
  for (const g of GRADES.filter((x) => has(x.kind))) grades.push({ ...g, shot: await render([g.kind]) });
  const fill = await render(['photo-bg', 'backdrop']);
  const frontU = has('front-under') ? await render(['front-under']) : null;
  const frontO = has('front-over') ? await render(['front-over']) : null;
  const plate = has('plate') ? await render(['plate']) : null;
  const notext = await render(['photo', 'photo-bg', 'backdrop', ...DECOR_KINDS, 'front-under', 'front-over', 'crest', 'plate', 'birds']);

  const slots = slotsOf(dom.texts);
  const flat = slots.map((s, i) => ({ index: s.main.index, color: `rgb(${flatColor(i).join(',')})` }));
  const masks = await render([], { flatSlots: flat });

  const winBuf = Buffer.alloc(FW * FH * 4);
  for (let i = 0; i < FW * FH; i++) if (winMask[i]) winBuf.writeUInt32LE(0xffffffff, i * 4);
  const windowFile = await encode(dir, 'window', winBuf, { lossless: true });
  const decorBuf = MUTATE === 'veil' ? decorRaw.raw : cut(decorRaw.raw, winMask, false);
  const gradeBufs = grades.map((g) => ({ ...g, buf: cut(g.shot.raw, winMask, true) }));
  const gradeLayers = {};
  for (const g of gradeBufs) {
    const file = await encode(dir, g.name === 'normal' ? 'grade' : `grade-${g.name}`, g.buf);
    if (file) gradeLayers[g.name] = { ...file, blend: g.blend };
  }
  const empty = Buffer.alloc(FW * FH * 4);

  const layers = {
    decor: await encode(dir, 'decor', decorBuf, { quality: QUALITY.decor }),
    windowFill: await encode(dir, 'window-fill', cut(fill.raw, winMask, true)),
    grade: gradeLayers,
    front: {
      'under-birds': frontU ? await encode(dir, 'front-under-birds', frontU.raw) : null,
      'over-birds': frontO ? await encode(dir, 'front-over-birds', frontO.raw) : null,
    },
    plate: plate ? { [message ? 'message' : 'plain']: await encode(dir, message ? 'plate-message' : 'plate-plain', plate.raw) } : null,
  };
  const thumbBuf = await sharp(full.raw, { raw: { width: FW, height: FH, channels: 4 } }).resize(THUMB[0], THUMB[1], { kernel: 'lanczos3' }).webp({ quality: QUALITY.thumb, alphaQuality: 100, effort: 6 }).toBuffer();
  fs.writeFileSync(path.join(dir, 'thumb.webp'), thumbBuf);

  const text = Object.fromEntries(slots.map((s, i) => {
    const measured = MUTATE === 'no-contrast' ? null : contrastOf(masks.raw, flatColor(i), notext.raw, s.main);
    const { index, slot, ...main } = s.main;
    return [s.slot, { ...main, effects: s.effects, contrast: measured?.contrast ?? null, contrastMin: measured?.contrastMin ?? null, glyphPixels: measured?.glyphPixels ?? 0 }];
  }));
  const veilLayers = [...gradeBufs.filter((g) => g.blend === 'normal').map((g) => g.buf), frontU?.raw ?? empty, frontO?.raw ?? empty];
  const window = { box: windowFile?.box ?? [0, 0, 0, 0], area: winMask.reduce((a, v) => a + v, 0), mask: windowFile, veilMaxAlpha: 0 };
  const birds = dom.birds.map(({ href, ...b }) => b);
  return {
    frame: name,
    size: [FW, FH],
    motifs: [...new Set([...(AFRICA.has(collection) ? ['afrique'] : []), ...dom.motifs])].sort(),
    message: Boolean(message),
    stack: stackOf(order),
    window,
    veil: veilOf({ box: window.box, mask: winMask }, veilLayers),
    banner: bandOf(decorBuf, frontU?.raw ?? empty),
    layers,
    thumb: { src: name + '/thumb.webp', size: THUMB, bytes: thumbBuf.length, sha256: sha256(thumbBuf) },
    crest: dom.crest,
    birds,
    text,
    inventory: {
      decor: decorRaw.inventory,
      windowFill: fill.inventory,
      grade: { text: grades.reduce((a, g) => a + g.shot.inventory.text, 0), birds: grades.reduce((a, g) => a + g.shot.inventory.birds, 0) },
      front: { text: (frontU?.inventory.text ?? 0) + (frontO?.inventory.text ?? 0), birds: (frontU?.inventory.birds ?? 0) + (frontO?.inventory.birds ?? 0) },
      plate: plate?.inventory ?? { text: 0, birds: 0 },
    },
  };
}

const bytesOf = (frame) => {
  const files = [frame.window.mask, frame.thumb, frame.layers.decor, frame.layers.windowFill, ...Object.values(frame.layers.grade), ...Object.values(frame.layers.front), ...Object.values(frame.layers.plate ?? {})].filter(Boolean);
  return files.reduce((acc, f) => acc + f.bytes, 0);
};

if (process.argv.includes('--generate')) {
  const ateliers = path.join(HERE, '../ateliers');
  for (const atelier of fs.readdirSync(ateliers).filter((d) => fs.existsSync(path.join(ateliers, d, 'gen.py'))).sort()) {
    fs.rmSync(path.join(OUT, atelier), { recursive: true, force: true });
    execFileSync(process.env.PYTHON ?? 'python3', ['-B', 'gen.py'], { cwd: path.join(ateliers, atelier), stdio: ['ignore', 'ignore', 'inherit'] });
  }
}
const collections = fs.readdirSync(OUT).filter((d) => fs.statSync(path.join(OUT, d)).isDirectory() && (!ONLY || ONLY.has(d) || [...ONLY].some((o) => o.startsWith(d + '-')))).sort();
const jobs = collections.flatMap((collection) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, collection, 'manifest.json'), 'utf8'));
  const messages = new Map(manifest.map((m) => [m.file.replace(/\.jpg$/, ''), m.message]));
  return fs.readdirSync(path.join(OUT, collection)).filter((f) => f.endsWith('.svg') && (!ONLY || ONLY.has(collection) || ONLY.has(f.slice(0, -4)))).sort().map((f) => ({ collection, name: f.slice(0, -4), message: messages.get(f.slice(0, -4)) ?? null }));
});
fs.rmSync(EXPORT, { recursive: true, force: true });
const browser = await launch();
const handles = await Promise.all(Array.from({ length: JOBS }, () => openPage(browser)));
const free = [...handles];
let done = 0;
const frames = await pool(jobs, JOBS, async (job) => {
  const handle = free.pop();
  try {
    const frame = await exportFrame(handle, job);
    done++;
    if (done % 20 === 0) console.log(`  ${done}/${jobs.length}`);
    return { collection: job.collection, frame };
  } finally {
    free.push(handle);
  }
});
const index = { generator: 'docs/product/cadres-de-gloire/generateur', chromium: browser.version(), sharp: sharpVersion().sharp, libwebp: sharpVersion().webp, size: [FW, FH], mutate: MUTATE, collections: [], weights: {} };
for (const collection of collections) {
  const mine = frames.filter((f) => f.collection === collection).map((f) => f.frame);
  fs.writeFileSync(path.join(EXPORT, collection, 'export.json'), JSON.stringify({ collection, frames: mine }, null, 2) + '\n');
  index.collections.push(collection);
  index.weights[collection] = { frames: mine.length, bytes: mine.reduce((a, f) => a + bytesOf(f), 0), decorBytes: mine.reduce((a, f) => a + (f.layers.decor?.bytes ?? 0), 0) };
}
fs.writeFileSync(path.join(EXPORT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
await Promise.all(handles.map((h) => h.dispose()));
await browser.close();
console.log(`export : ${frames.length} cadres, ${collections.length} collections → ${path.relative(process.cwd(), EXPORT) || '.'}`);
for (const [c, w] of Object.entries(index.weights)) console.log(`  ${c.padEnd(9)} ${String(w.frames).padStart(3)} cadres  ${(w.bytes / 1024).toFixed(0).padStart(6)} Ko  (décor ${(w.decorBytes / 1024).toFixed(0)} Ko)`);
