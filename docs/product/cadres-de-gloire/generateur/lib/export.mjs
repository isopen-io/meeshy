// L'exportateur unique (lot L1, § 5.1 et § 5.3 du prompt) : chaque cadre généré devient un jeu de couches raster
// WebP rognées à leur boîte, et un export.json BRUT qui décrit ce que l'app peindra elle-même (texte, oiseaux, blason).
// Usage : node lib/export.mjs [--generate] [--out out] [--plates out-plate] [--export export] [--only savane,neon] [--jobs 3] [--mutate <défaut>]
//   --generate régénère d'abord les SVG de chaque atelier (python3, ou $PYTHON ; poses demande numpy et Pillow), et
//              les rejoue dans les deux variantes de plaque (CADRES_PLATE=plain|message) sous out-plate/<variante>/
//   --mutate rejoue un défaut connu pour montrer export-check.mjs ROUGE :
//            text-in-decor | birds-in-decor | veil | no-contrast | one-plate
//
// Méthode, par cadre (Chromium, 1080×1920, polices aux graisses exactes) :
//   - la photo factice est remplacée par du magenta puis du vert (sondes) : là où les deux rendus diffèrent, la photo
//     se voit — c'est la FENÊTRE, sans aucune heuristique de couleur ;
//   - le décor est rendu sans photo, sans texte, sans oiseaux, sans blason, sans plaque, puis COUPÉ à la fenêtre :
//     dans la fenêtre son alpha est nul, et ce qu'il y peignait part dans `grade` (normal, ou `screen` séparément) ;
//   - les textes de décor NEUTRES (table du tri, lib/decor-sorts.mjs, #10256) sont rendus AVEC le décor : cuits dans
//     sa couche, ils quittent les emplacements de texte ; les autres restent des emplacements, traduits ou vivants ;
//   - chaque couche est rognée à sa boîte, encodée par sharp, adressée par son empreinte dans export.json ;
//   - la fenêtre part aussi en CHEMIN (`window.path`, #10254, lib/window-path.mjs) : le contour rectiligne de ce même
//     masque, que le peintre découpe sans décoder d'image et qui le rend au pixel près.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { generateAteliers, PLATE_VARIANTS as VARIANTS } from './ateliers.mjs';
import { launch } from './launch.mjs';
import { bakedSlotsOf, DECOR_TEXTS_FILE, frameIdOf, readDecorTexts } from './decor-sorts.mjs';
import { classify, isFront, markBaked, read, show } from './layers.mjs';
import { H, openPage, pool, SCALE, shoot, showSvg, W } from './page.mjs';
import sharp, { sharpVersion } from './sharp.mjs';
import { windowPath } from './window-path.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(arg('--out', path.join(HERE, '../out')));
const PLATES = path.resolve(arg('--plates', path.join(HERE, '../out-plate')));
const EXPORT = path.resolve(arg('--export', path.join(HERE, '../export')));
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;
const JOBS = Number(arg('--jobs', '3'));
const MUTATE = arg('--mutate', null);
const DECOR_TEXTS = readDecorTexts(path.resolve(arg('--decor-texts', DECOR_TEXTS_FILE)));

const FW = W * SCALE;
const FH = H * SCALE;
const BANNER = [0, 1720, FW, 200];
const CORNER = 28 * SCALE;
const THUMB = [270, 480];
const AFRICA = new Set(['savane', 'royaumes']);
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

// Une couche posée sur le décor se lit DANS la scène où Chromium la peint, pas seule : un filtre en linearRGB
// (l'ombre portée d'une plaque) quantifie les sombres sur 8 bits, et la trame de ce tramage dépend de ce qui est peint
// autour (texte compris) — rendue seule, une plaque presque noire diffère de 13 niveaux de la référence sur des bandes
// entières. Sa couleur se résout donc depuis la scène complète `full` et la même scène sans elle `without`, son alpha
// restant celui du rendu seul : c = (full − (1 − a)·without) / a. Là où une couche peinte AU-DESSUS (texte, oiseaux,
// avant-plan) couvre le pixel, ou là où le fond n'est pas plein, la scène ne dit rien de la couche : le rendu seul reste.
function inScene(alone, full, without, above) {
  const out = Buffer.from(alone);
  for (let i = 0; i < FW * FH; i++) {
    const p = i * 4;
    const a = alone[p + 3];
    if (a === 0 || above[p + 3] !== 0 || without[p + 3] !== 255 || full[p + 3] !== 255) continue;
    const k = a / 255;
    for (let c = 0; c < 3; c++) out[p + c] = Math.max(0, Math.min(255, Math.round((full[p + c] - (1 - k) * without[p + c]) / k)));
  }
  return out;
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

function stackOf(order, runs) {
  const anchored = Object.keys(order)
    .filter((k) => k === 'crest' || k === 'plate' || k === 'birds' || isFront(k))
    .sort((a, b) => order[a] - order[b]);
  const grades = runs.map((_, n) => `grade:${n}`);
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

const frontKinds = (order) => Object.keys(order).filter(isFront).sort((a, b) => order[a] - order[b]);
const sceneOf = (order, runs, baked = []) => ['photo', 'photo-bg', 'backdrop', ...runs.map((r) => r.kind), ...baked, ...frontKinds(order), 'crest', 'plate', 'birds', 'text'];

async function plateInScene(render, order, scene) {
  const full = await render(scene);
  const alone = await render(['plate']);
  const without = await render(scene.filter((k) => k !== 'plate'));
  const above = await render(['text', ...scene.filter((k) => k !== 'text' && order[k] > order.plate)]);
  return { inventory: alone.inventory, raw: inScene(alone.raw, full.raw, without.raw, above.raw) };
}

const PLATE_SLOTS = (slot) => ['kicker', 'title', 'message', 'date'].includes(slot) || slot.startsWith('plate.');

// L'AUTRE variante de la plaque (§ 5.1, #10252) : l'atelier rejoué avec CADRES_PLATE (lib/base.py) l'a dessinée
// dans out-plate/<variante>/ ; on la lit dans SA scène, on vérifie que son décor est celui du cadre au pixel près
// (`decorDelta`), et on garde la géométrie de ses emplacements (le message déplace la date).
async function otherPlate(handle, render, { collection, name, variant, decor, baked }) {
  const file = path.join(PLATES, variant, collection, name + '.svg');
  if (!fs.existsSync(file)) return { variant, missing: true };
  await showSvg(handle, fs.readFileSync(file, 'utf8'), { fonts: 'exact' });
  const { order, runs } = await handle.page.evaluate(classify);
  if (order.plate === undefined) return { variant, missing: true };
  if (baked.length) await handle.page.evaluate(markBaked, baked);
  const BAKED = baked.length ? ['baked'] : [];
  const own = await render(['backdrop', ...runs.map((r) => r.kind), ...BAKED]);
  let decorDelta = 0;
  for (let i = 0; i < own.raw.length; i += 4) if (own.raw.readUInt32LE(i) !== decor.readUInt32LE(i)) decorDelta++;
  const plate = await plateInScene(render, order, sceneOf(order, runs, BAKED));
  const dom = await handle.page.evaluate(read);
  const text = Object.fromEntries(slotsOf(dom.texts.filter((t) => !baked.includes(t.slot))).filter((s) => PLATE_SLOTS(s.slot)).map((s) => {
    const { index, slot, ...main } = s.main;
    return [slot, { ...main, effects: s.effects }];
  }));
  return { variant, plate, decorDelta, text };
}

async function exportFrame(handle, { collection, name, message }) {
  const dir = path.join(EXPORT, collection, name);
  fs.mkdirSync(dir, { recursive: true });
  const svg = fs.readFileSync(path.join(OUT, collection, name + '.svg'), 'utf8');
  await showSvg(handle, svg, { fonts: 'exact' });
  const { page } = handle;
  const { order, runs } = await page.evaluate(classify);
  const DECOR_KINDS = runs.map((r) => r.kind);
  const dom = await page.evaluate(read);
  const render = async (kinds, extra = {}) => {
    const inventory = await page.evaluate(show, { kinds, ...extra });
    return { inventory, raw: await decode(await shoot(handle)) };
  };
  const has = (k) => order[k] !== undefined;
  const samples = new Map(slotsOf(dom.texts).map((s) => [s.slot, s.main.text]));
  const baked = bakedSlotsOf(DECOR_TEXTS, frameIdOf(collection, name), samples);
  if (baked.length) await page.evaluate(markBaked, baked);
  const BAKED = baked.length ? ['baked'] : [];
  const cleanKinds = [...DECOR_KINDS, ...BAKED];
  const decorKinds = [...cleanKinds, ...(MUTATE === 'text-in-decor' ? ['text'] : []), ...(MUTATE === 'birds-in-decor' ? ['birds'] : [])];

  const probeM = await render(DECOR_KINDS, { probe: '#FF00FF' });
  const probeG = await render(DECOR_KINDS, { probe: '#00FF00' });
  const t = transmission(probeM.raw, probeG.raw);
  const winMask = new Uint8Array(FW * FH);
  for (let i = 0; i < FW * FH; i++) winMask[i] = t[i] > 0.02 ? 1 : 0;

  const decorRaw = await render(['backdrop', ...decorKinds]);
  const grades = [];
  for (const run of runs) grades.push({ ...run, shot: await render([run.kind]) });
  const fill = await render(['photo-bg', 'backdrop']);
  const FRONT_KINDS = frontKinds(order);
  const fronts = [];
  for (const kind of FRONT_KINDS) fronts.push({ rank: kind.slice('front:'.length), shot: await render([kind]) });
  const notext = await render(['photo', 'photo-bg', 'backdrop', ...cleanKinds, ...FRONT_KINDS, 'crest', 'plate', 'birds']);
  const plate = has('plate') ? await plateInScene(render, order, sceneOf(order, runs, BAKED)) : null;
  const decorClean = decorKinds.length === cleanKinds.length ? decorRaw.raw : (await render(['backdrop', ...cleanKinds])).raw;
  const bakedShot = baked.length ? (await render(['baked'])).raw : null;

  const slots = slotsOf(dom.texts.filter((t) => !baked.includes(t.slot)));
  const flat = slots.map((s, i) => ({ index: s.main.index, color: `rgb(${flatColor(i).join(',')})` }));
  const masks = await render([], { flatSlots: flat });

  const winBuf = Buffer.alloc(FW * FH * 4);
  for (let i = 0; i < FW * FH; i++) if (winMask[i]) winBuf.writeUInt32LE(0xffffffff, i * 4);
  const windowFile = await encode(dir, 'window', winBuf, { lossless: true });
  const decorBuf = MUTATE === 'veil' ? decorRaw.raw : cut(decorRaw.raw, winMask, false);
  const gradeBufs = grades.map((g) => ({ ...g, buf: cut(g.shot.raw, winMask, true) }));
  const gradeLayers = [];
  for (const [n, g] of gradeBufs.entries()) {
    const file = await encode(dir, `grade-${n}`, g.buf);
    gradeLayers.push(file ? { ...file, blend: g.blend } : null);
  }
  const front = {};
  for (const f of fronts) front[f.rank] = await encode(dir, `front-${f.rank}`, f.shot.raw);
  const frontRaw = fronts.reduce((acc, f) => {
    for (let i = 3; i < acc.length; i += 4) acc[i] = Math.max(acc[i], f.shot.raw[i]);
    return acc;
  }, Buffer.alloc(FW * FH * 4));

  const native = message ? 'message' : 'plain';
  const nativeFile = plate ? await encode(dir, `plate-${native}`, plate.raw) : null;
  const other = nativeFile && MUTATE !== 'one-plate'
    ? await otherPlate(handle, render, { collection, name, variant: VARIANTS.find((v) => v !== native), decor: decorClean, baked })
    : null;
  const plates = nativeFile ? { [native]: nativeFile } : null;
  if (other?.plate) plates[other.variant] = await encode(dir, `plate-${other.variant}`, other.plate.raw);

  const layers = {
    decor: await encode(dir, 'decor', decorBuf, { quality: QUALITY.decor }),
    windowFill: await encode(dir, 'window-fill', cut(fill.raw, winMask, true)),
    grade: gradeLayers,
    front,
    plate: plates,
  };
  const thumbBuf = await sharp(notext.raw, { raw: { width: FW, height: FH, channels: 4 } }).resize(THUMB[0], THUMB[1], { kernel: 'lanczos3' }).webp({ quality: QUALITY.thumb, alphaQuality: 100, effort: 6 }).toBuffer();
  fs.writeFileSync(path.join(dir, 'thumb.webp'), thumbBuf);

  const text = Object.fromEntries(slots.map((s, i) => {
    const measured = MUTATE === 'no-contrast' ? null : contrastOf(masks.raw, flatColor(i), notext.raw, s.main);
    const { index, slot, ...main } = s.main;
    return [s.slot, { ...main, effects: s.effects, contrast: measured?.contrast ?? null, contrastMin: measured?.contrastMin ?? null, glyphPixels: measured?.glyphPixels ?? 0 }];
  }));
  const veilLayers = [...gradeBufs.filter((g) => g.blend === 'normal').map((g) => g.buf), ...fronts.map((f) => f.shot.raw)];
  const window = {
    box: windowFile?.box ?? [0, 0, 0, 0],
    path: windowPath({ data: winMask, width: FW, height: FH, origin: [0, 0] }),
    area: winMask.reduce((a, v) => a + v, 0),
    mask: windowFile,
    veilMaxAlpha: 0,
  };
  const birds = dom.birds.map(({ href, ...b }) => b);
  return {
    frame: name,
    size: [FW, FH],
    motifs: [...new Set([...(AFRICA.has(collection) ? ['afrique'] : []), ...dom.motifs])].sort(),
    message: Boolean(message),
    stack: stackOf(order, runs).filter((step) => !step.startsWith('grade:') || gradeLayers[Number(step.slice(6))]),
    window,
    veil: veilOf({ box: window.box, mask: winMask }, veilLayers),
    banner: bandOf(decorBuf, frontRaw),
    layers,
    thumb: { src: name + '/thumb.webp', size: THUMB, bytes: thumbBuf.length, sha256: sha256(thumbBuf) },
    crest: dom.crest,
    birds,
    art: dom.art,
    text,
    baked: baked.map((slot) => ({ slot, sample: samples.get(slot) })),
    bakedInWindow: bakedShot ? winMask.reduce((n, inside, i) => n + (inside && bakedShot[i * 4 + 3] > 0 ? 1 : 0), 0) : 0,
    plateVariant: other ? { variant: other.variant, missing: Boolean(other.missing), decorDelta: other.decorDelta ?? null, text: other.text ?? null } : null,
    inventory: {
      decor: decorRaw.inventory,
      windowFill: fill.inventory,
      grade: { text: grades.reduce((a, g) => a + g.shot.inventory.text, 0), birds: grades.reduce((a, g) => a + g.shot.inventory.birds, 0) },
      front: { text: fronts.reduce((a, f) => a + f.shot.inventory.text, 0), birds: fronts.reduce((a, f) => a + f.shot.inventory.birds, 0) },
      plate: { text: (plate?.inventory.text ?? 0) + (other?.plate?.inventory.text ?? 0), birds: (plate?.inventory.birds ?? 0) + (other?.plate?.inventory.birds ?? 0) },
    },
  };
}

const bytesOf = (frame) => {
  const files = [frame.window.mask, frame.thumb, frame.layers.decor, frame.layers.windowFill, ...Object.values(frame.layers.grade), ...Object.values(frame.layers.front), ...Object.values(frame.layers.plate ?? {})].filter(Boolean);
  return files.reduce((acc, f) => acc + f.bytes, 0);
};

if (process.argv.includes('--generate')) generateAteliers({ out: OUT, plates: PLATES });
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
