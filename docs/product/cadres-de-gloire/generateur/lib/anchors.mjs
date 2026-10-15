// Calcule les ancres corrigées de Mee et Meo (lot L2) : pour chaque cadre hors règle, chaque oiseau qui recouvre la
// photo est déplacé du MOINS possible — vers l'extérieur de la fenêtre, éventuellement un peu réduit — jusqu'à ne plus
// la recouvrir, sans sortir de la carte et sans couvrir davantage le texte de la plaque ni le blason. Le résultat est
// écrit dans lib/anchors.json, que lib/base.py applique à l'enregistrement de chaque SVG ; le décor ne bouge pas.
// Usage : node lib/anchors.mjs [--out out] [--only neon,savane-orateur-a] [--jobs 3] [--dry]
// Outil de dessin, local : il demande sharp (lib/sharp.mjs). La garde, elle, est lib/overlap.mjs --check.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './launch.mjs';
import { classify, read, show } from './layers.mjs';
import { isSelfie, RULE } from './overlap-rule.mjs';
import { H, openPage, pool, SCALE, shoot, showSvg, W } from './page.mjs';
import sharp from './sharp.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(arg('--out', path.join(HERE, '../out')));
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;
const JOBS = Number(arg('--jobs', '3'));
const DRY = process.argv.includes('--dry');
const ANCHORS = path.join(HERE, 'anchors.json');

const FW = W * SCALE;
const FH = H * SCALE;
// Cible par oiseau, en pixels de l'image finale : sous la règle (250 px de design pour le cadre, 6 de profondeur) avec
// une marge, pour que deux oiseaux corrigés tiennent ensemble.
const TARGET = { overlap: 100 * SCALE * SCALE, depth: 4 * SCALE };
const MARGIN = 6 * SCALE;
const SCALES = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58];
const STEP = 2;
const MAX_SHIFT = 160;
// Le texte de la plaque et le blason se lisent par leurs BOÎTES, plus larges que les glyphes : un oiseau peut en
// effleurer le bord (3 % de son corps), jamais le couvrir.
const CLEAR_SLACK = 0.03;
// Réduire un oiseau coûte plus que le déplacer : 6 % de taille pèsent autant que 24 px de déplacement.
const SHRINK_COST = 400;
// Une marge sous la règle : la garde de CI tourne sur le Chromium de Linux, dont l'antialiasing diffère d'un pixel.
const HEADROOM = { overlap: 50, depth: 1 };

const decode = async (png) => (await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;

function distanceToOutside(win) {
  const dist = new Int32Array(FW * FH).fill(-1);
  const queue = new Int32Array(FW * FH);
  let head = 0, tail = 0;
  for (let i = 0; i < FW * FH; i++) if (!win[i]) { dist[i] = 0; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++];
    const x = i % FW, y = (i - x) / FW;
    for (const j of [x > 0 ? i - 1 : -1, x < FW - 1 ? i + 1 : -1, y > 0 ? i - FW : -1, y < FH - 1 ? i + FW : -1]) {
      if (j >= 0 && dist[j] < 0) { dist[j] = dist[i] + 1; queue[tail++] = j; }
    }
  }
  return dist;
}

// Les pixels opaques d'un oiseau, relatifs à son centre : un déplacement ou une échelle se calcule sans rien rendre.
function bodyOf(raw, [cx, cy]) {
  const points = [];
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (raw[(y * FW + x) * 4 + 3] >= 128) points.push(x - cx, y - cy);
  return Int32Array.from(points);
}

function score(body, [cx, cy], { dx, dy, scale }, { win, dist, clear }) {
  let overlap = 0, depth = 0, outside = 0, covered = 0;
  const seen = new Set();
  for (let k = 0; k < body.length; k += 2) {
    const x = Math.round(cx + dx + body[k] * scale);
    const y = Math.round(cy + dy + body[k + 1] * scale);
    const key = y * FW + x;
    if (seen.has(key)) continue;
    seen.add(key);
    if (x < MARGIN || y < MARGIN || x >= FW - MARGIN || y >= FH - MARGIN) { outside++; continue; }
    if (win[key]) { overlap++; depth = Math.max(depth, dist[key]); }
    if (clear[key]) covered++;
  }
  return { overlap, depth, outside, covered };
}

function candidates(direction) {
  const [ux, uy] = direction;
  const dirs = [[ux, 0], [0, uy], [ux, uy], [ux, uy / 2], [ux / 2, uy], [ux, -uy / 2], [-ux / 2, uy], [0, -uy], [-ux, 0]].map(([a, b]) => {
    const n = Math.hypot(a, b) || 1;
    return [a / n, b / n];
  });
  const list = [];
  for (let d = 0; d <= MAX_SHIFT; d += STEP) {
    for (const scale of SCALES) {
      for (const [a, b] of d === 0 ? [[0, 0]] : dirs) list.push({ dx: a * d * SCALE, dy: b * d * SCALE, scale, cost: d + SHRINK_COST * (1 - scale) });
    }
  }
  return list.sort((p, q) => p.cost - q.cost);
}

async function solve(handle, { collection, name, layout }) {
  if (isSelfie(layout)) return { name, fixes: [], note: 'selfie' };
  const svg = fs.readFileSync(path.join(OUT, collection, name + '.svg'), 'utf8');
  await showSvg(handle, svg, { fonts: 'design' });
  const { page } = handle;
  const { order } = await page.evaluate(classify);
  const cover = Object.keys(order).filter((k) => !['photo', 'photo-bg', 'birds'].includes(k));
  const render = async (kinds, probe = null) => {
    await page.evaluate(show, { kinds, probe });
    return decode(await shoot(handle));
  };
  const m = await render(cover, '#FF00FF');
  const g = await render(cover, '#00FF00');
  const win = new Uint8Array(FW * FH);
  let wx = 0, wy = 0, wn = 0;
  for (let i = 0; i < FW * FH; i++) {
    const p = i * 4;
    const t = (Math.abs(m[p] - g[p]) + Math.abs(m[p + 1] - g[p + 1]) + Math.abs(m[p + 2] - g[p + 2])) / (3 * 255);
    if (t > 0.5) { win[i] = 1; wx += i % FW; wy += Math.floor(i / FW); wn++; }
  }
  const dist = distanceToOutside(win);
  await page.evaluate(show, { kinds: Object.keys(order) });
  const dom = await page.evaluate(read);
  const clear = new Uint8Array(FW * FH);
  const boxes = [...Object.values(dom.texts).filter((t) => !t.slot.startsWith('decor.')).map((t) => t.bbox), ...(dom.crest ? [dom.crest.box] : [])];
  for (const [bx, by, bw, bh] of boxes) for (let y = Math.max(0, by); y < Math.min(FH, by + bh); y++) for (let x = Math.max(0, bx); x < Math.min(FW, bx + bw); x++) clear[y * FW + x] = 1;
  const indices = await page.evaluate(() => [...document.querySelectorAll('[data-layer="birds"][data-bird]')].map((el) => Number(el.getAttribute('data-bird'))));
  const fixes = [];
  const birds = [];
  for (const [n, bird] of dom.birds.entries()) {
    const index = indices[n];
    await page.evaluate(show, { kinds: ['birds'] });
    await page.evaluate((keep) => {
      document.querySelectorAll('[data-layer="birds"][data-bird]').forEach((el) => {
        if (Number(el.getAttribute('data-bird')) !== keep) el.style.display = 'none';
      });
    }, index);
    const raw = await decode(await shoot(handle));
    const center = [bird.box[0] + bird.box[2] / 2, bird.box[1] + bird.box[3] / 2];
    const body = bodyOf(raw, center);
    birds.push({ index, center, body, start: score(body, center, { dx: 0, dy: 0, scale: 1 }, { win, dist, clear }) });
  }
  const total = birds.reduce((acc, b) => ({ overlap: acc.overlap + b.start.overlap, depth: Math.max(acc.depth, b.start.depth) }), { overlap: 0, depth: 0 });
  const inRule = total.overlap <= (RULE.overlap - HEADROOM.overlap) * SCALE * SCALE && total.depth <= (RULE.depth - HEADROOM.depth) * SCALE;
  for (const { index, center, body, start } of inRule ? [] : birds) {
    const ctx = { win, dist, clear };
    if (start.overlap <= TARGET.overlap && start.depth <= TARGET.depth) continue;
    const direction = [Math.sign(center[0] - wx / wn) || 1, Math.sign(center[1] - wy / wn) || 1];
    const found = candidates(direction).find((c) => {
      const s = score(body, center, c, ctx);
      return s.overlap <= TARGET.overlap && s.depth <= TARGET.depth && s.outside <= start.outside && s.covered <= start.covered + CLEAR_SLACK * body.length / 2;
    });
    if (!found) {
      fixes.push({ bird: index, unsolved: true, overlap: Math.round(start.overlap / 4), depth: Math.round(start.depth / 2) });
      continue;
    }
    const r = (v) => Math.round(v * 10) / 10;
    fixes.push({ bird: index, dx: r(found.dx / SCALE), dy: r(found.dy / SCALE), scale: found.scale });
  }
  return { name, fixes };
}

const collections = fs.readdirSync(OUT).filter((d) => fs.existsSync(path.join(OUT, d, 'manifest.json'))).sort();
const jobs = collections.flatMap((collection) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, collection, 'manifest.json'), 'utf8'));
  const layouts = new Map(manifest.map((e) => [e.file.replace(/\.jpg$/, ''), e.layout]));
  return fs.readdirSync(path.join(OUT, collection)).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort()
    .filter((name) => !ONLY || ONLY.has(collection) || ONLY.has(name))
    .map((name) => ({ collection, name, layout: layouts.get(name) ?? null }));
});
const browser = await launch();
const handles = await Promise.all(Array.from({ length: JOBS }, () => openPage(browser)));
const free = [...handles];
const results = await pool(jobs, JOBS, async (job) => {
  const handle = free.pop();
  try {
    return await solve(handle, job);
  } finally {
    free.push(handle);
  }
});
await Promise.all(handles.map((h) => h.dispose()));
await browser.close();

const current = JSON.parse(fs.readFileSync(ANCHORS, 'utf8'));
const next = { ...current };
// Le calcul part du SVG DÉJÀ corrigé : une correction nouvelle se COMPOSE avec l'ancienne (les déplacements du
// centre s'ajoutent, les échelles se multiplient) — relancer l'outil affine, il ne remet jamais à zéro.
const r1 = (v) => Math.round(v * 10) / 10;
const compose = (old, add) => old
  ? { bird: old.bird, dx: r1(old.dx + add.dx), dy: r1(old.dy + add.dy), scale: Math.round(old.scale * add.scale * 1000) / 1000 }
  : add;
for (const { name, fixes } of results) {
  const solved = fixes.filter((f) => !f.unsolved);
  const before = current[name] ?? [];
  const merged = [...before.filter((f) => !solved.some((s) => s.bird === f.bird)), ...solved.map((s) => compose(before.find((f) => f.bird === s.bird), s))]
    .sort((a, b) => a.bird - b.bird);
  if (merged.length) next[name] = merged;
}
const unsolved = results.flatMap(({ name, fixes }) => fixes.filter((f) => f.unsolved).map((f) => `${name} oiseau ${f.bird} (overlap ${f.overlap}, depth ${f.depth})`));
const moved = results.filter(({ fixes }) => fixes.some((f) => !f.unsolved));
if (!DRY) fs.writeFileSync(ANCHORS, JSON.stringify(Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n');
console.log(`ancres : ${moved.length} cadre(s) corrigé(s) sur ${results.length}${DRY ? ' (--dry : rien d\'écrit)' : ' → lib/anchors.json'}`);
for (const { name, fixes } of moved) console.log(`  ${name} : ${fixes.filter((f) => !f.unsolved).map((f) => `#${f.bird} (${f.dx}, ${f.dy}) ×${f.scale}`).join(' ; ')}`);
for (const line of unsolved) console.log(`  NON RÉSOLU ${line}`);
