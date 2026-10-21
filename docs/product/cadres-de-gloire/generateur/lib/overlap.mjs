// La règle d'empiètement (lot L2, prompt § 5.7) : Mee et Meo ne recouvrent jamais la photo.
// Usage : node lib/overlap.mjs [--out out] [--controle ../controle] [--only neon,savane-orateur-a] [--jobs 3]
//                              [--check] [--png dossier] [--mutate bird-in-window]
//   sans --check : mesure chaque cadre et RÉÉCRIT controle/empietements-<collection>.json ;
//   --check      : la GARDE de CI — mesure, n'écrit rien, sort en 1 dès qu'un cadre est hors règle ;
//   --mutate bird-in-window pose le premier oiseau de chaque cadre au centre de sa fenêtre : la garde doit rougir.
//
// Détecteur v2, par cadre (Chromium, 1080×1920, repère de design 540×960) :
//   - FENÊTRE par différence : la photo factice rendue magenta puis verte sous tout ce que le cadre peint par-dessus
//     (sauf les oiseaux) ; la photo se voit là où les deux rendus diffèrent de plus de moitié — aucune heuristique de
//     couleur, donc aucun faux positif sur un décor magenta ;
//   - OISEAUX lus par `data-layer="birds"` (lib/base.py, bird()) : le corps de l'oiseau (alpha ≥ 50 %), pas son ombre ;
//   - VISAGES : les cercles du placeholder (fill #0C0806), à leur position rendue.
// La règle elle-même vit dans lib/overlap-rule.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './launch.mjs';
import { classify, show } from './layers.mjs';
import { isSelfie, RULE, verdict } from './overlap-rule.mjs';
import { openPage, pool, shoot, showSvg } from './page.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(arg('--out', path.join(HERE, '../out')));
const CONTROLE = path.resolve(arg('--controle', path.join(HERE, '../../controle')));
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;
const JOBS = Number(arg('--jobs', '3'));
const CHECK = process.argv.includes('--check');
const PNG = arg('--png', null);
const MUTATE = arg('--mutate', null);

const SCALE = 2;

function measureInPage({ m, g, b, faces, wantPng }) {
  const load = async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const cv = new OffscreenCanvas(img.width, img.height);
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    return { data: cx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
  };
  return Promise.all([load(m), load(g), load(b)]).then(async ([M, G, B]) => {
    const { w: W, h: H } = M;
    const N = W * H;
    const win = new Uint8Array(N);
    const bird = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const p = i * 4;
      const t = (Math.abs(M.data[p] - G.data[p]) + Math.abs(M.data[p + 1] - G.data[p + 1]) + Math.abs(M.data[p + 2] - G.data[p + 2])) / (3 * 255);
      win[i] = t > 0.5 ? 1 : 0;
      bird[i] = B.data[p + 3] >= 128 ? 1 : 0;
    }
    const dist = new Int32Array(N).fill(-1);
    const queue = new Int32Array(N);
    let head = 0, tail = 0;
    for (let i = 0; i < N; i++) if (!win[i]) { dist[i] = 0; queue[tail++] = i; }
    while (head < tail) {
      const i = queue[head++];
      const x = i % W, y = (i - x) / W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && dist[j] < 0) { dist[j] = dist[i] + 1; queue[tail++] = j; }
      }
    }
    const inFace = (x, y) => faces.some(([fx, fy, fr]) => (x - fx) ** 2 + (y - fy) ** 2 <= fr * fr);
    let overlap = 0, face = 0, depth = 0, windowPx = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < N; i++) {
      if (!win[i]) continue;
      windowPx++;
      if (!bird[i]) continue;
      const x = i % W, y = (i - x) / W;
      overlap++;
      if (inFace(x, y)) face++;
      depth = Math.max(depth, dist[i]);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    let png = null;
    if (wantPng) {
      const cv = new OffscreenCanvas(W, H);
      const cx = cv.getContext('2d');
      const id = cx.createImageData(W, H);
      for (let i = 0; i < N; i++) {
        const p = i * 4;
        const shade = win[i] ? 200 : 60;
        id.data[p] = win[i] && bird[i] ? 255 : bird[i] ? 120 : shade;
        id.data[p + 1] = win[i] && bird[i] ? 0 : bird[i] ? 220 : shade;
        id.data[p + 2] = win[i] && bird[i] ? 0 : bird[i] ? 160 : shade;
        id.data[p + 3] = 255;
      }
      cx.putImageData(id, 0, 0);
      const buf = new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
      png = btoa(s);
    }
    return { overlap, face, depth, windowPx, bbox: x1 < 0 ? null : [x0, y0, x1, y1], png };
  });
}

function birdIntoWindow() {
  const bird = document.querySelector('[data-layer="birds"]');
  const photo = document.querySelector('[data-layer="photo"]');
  if (!bird || !photo) return;
  const r = photo.getBoundingClientRect();
  const b = bird.getBoundingClientRect();
  const dx = r.x + r.width / 2 - (b.x + b.width / 2);
  const dy = r.y + r.height / 2 - (b.y + b.height / 2);
  bird.setAttribute('transform', `translate(${dx} ${dy}) ${bird.getAttribute('transform') ?? ''}`);
}

async function measure(handle, { collection, name, layout }) {
  const svg = fs.readFileSync(path.join(OUT, collection, name + '.svg'), 'utf8');
  await showSvg(handle, svg, { fonts: 'design' });
  const { page } = handle;
  if (MUTATE === 'bird-in-window') await page.evaluate(birdIntoWindow);
  const { order } = await page.evaluate(classify);
  const cover = Object.keys(order).filter((k) => !['photo', 'photo-bg', 'birds'].includes(k));
  const shot = async (kinds, probe = null) => {
    await page.evaluate(show, { kinds, probe });
    return (await shoot(handle)).toString('base64');
  };
  const m = await shot(cover, '#FF00FF');
  const g = await shot(cover, '#00FF00');
  const b = await shot(['birds']);
  await page.evaluate(show, { kinds: Object.keys(order) });
  const faces = await page.evaluate((s) => [...document.querySelectorAll('[data-layer="photo"] circle[fill="#0C0806"]')].map((c) => {
    const r = c.getBoundingClientRect();
    return [(r.x + r.width / 2) * s, (r.y + r.height / 2) * s, (r.width / 2) * s];
  }), SCALE);
  const raw = await page.evaluate(measureInPage, { m, g, b, faces, wantPng: Boolean(PNG) });
  if (raw.png) {
    fs.mkdirSync(path.join(PNG, collection), { recursive: true });
    fs.writeFileSync(path.join(PNG, collection, name + '.png'), Buffer.from(raw.png, 'base64'));
  }
  const selfie = isSelfie(layout);
  const row = {
    file: name,
    overlap: Math.round(raw.overlap / SCALE ** 2),
    face: Math.ceil(raw.face / SCALE ** 2),
    depth: Math.round(raw.depth / SCALE),
    bbox: raw.bbox ? raw.bbox.map((v) => Math.round(v / SCALE)) : null,
    windowPx: Math.round(raw.windowPx / SCALE ** 2),
    layout: selfie ? 'selfie' : (layout ?? '').split(/[ :(,]/)[0] || null,
  };
  return { collection, row: { ...row, verdict: verdict({ ...row, selfie }) } };
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
    return await measure(handle, job);
  } finally {
    free.push(handle);
  }
});
await Promise.all(handles.map((h) => h.dispose()));
await browser.close();

if (!CHECK) {
  fs.mkdirSync(CONTROLE, { recursive: true });
  for (const collection of collections) {
    const mine = results.filter((r) => r.collection === collection).map((r) => r.row);
    if (mine.length === 0) continue;
    const file = path.join(CONTROLE, `empietements-${collection}.json`);
    const kept = ONLY && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).filter((p) => !mine.some((r) => r.file === p.file)) : [];
    fs.writeFileSync(file, JSON.stringify([...kept, ...mine].sort((x, y) => x.file.localeCompare(y.file)), null, 1) + '\n');
  }
}
const out = results.filter((r) => r.row.verdict !== 'ok');
for (const { row } of out) console.error(`  ${row.verdict === 'face' ? 'VISAGE' : 'HORS RÈGLE'} ${row.file} overlap=${row.overlap} depth=${row.depth} face=${row.face} bbox=${JSON.stringify(row.bbox)}`);
const faces = out.filter((r) => r.row.verdict === 'face').length;
const summary = `${results.length - out.length}/${results.length} cadres dans la règle (overlap ≤ ${RULE.overlap} px, depth ≤ ${RULE.depth} px, face = 0) ; ${out.length} hors règle dont ${faces} visage(s) touché(s)`;
if (out.length) {
  console.error(`ROUGE — ${summary}`);
  process.exit(CHECK ? 1 : 0);
}
console.log(`VERT — ${summary}`);
