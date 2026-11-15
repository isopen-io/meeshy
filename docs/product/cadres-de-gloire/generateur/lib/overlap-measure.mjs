// Le détecteur d'empiètement DANS la page (lot L2, #10153 ; mises en page, #10277) : la fenêtre photo d'un cadre,
// ses visages, et ce que chaque jeu d'oiseaux en recouvre. Partagé par la garde (lib/overlap.mjs) et l'export
// (lib/export.mjs), pour qu'un verdict écrit soit toujours celui que la garde re-mesure.
//
// Détecteur v2, par cadre (Chromium, 1080×1920, repère de design 540×960) :
//   - FENÊTRE par différence : la photo factice rendue magenta puis verte sous tout ce que le cadre peint par-dessus
//     (sauf les oiseaux) ; la photo se voit là où les deux rendus diffèrent de plus de moitié — aucune heuristique de
//     couleur, donc aucun faux positif sur un décor magenta ;
//   - OISEAUX lus par `data-layer="birds"` (lib/base.py, bird()) : le corps de l'oiseau (alpha ≥ 50 %), pas son ombre ;
//     une mise en page générée REMPLACE les oiseaux dessinés par les siens, posés comme bird() les pose ;
//   - VISAGES : les cercles du placeholder (fill #0C0806), à leur position rendue.
import fs from 'node:fs';
import path from 'node:path';
import { artRect } from './bird-layouts.mjs';
import { classify, read, show } from './layers.mjs';
import { H, SCALE, shoot, showSvg, W } from './page.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const MEE = path.join(HERE, '../mee');
const FW = W * SCALE;
const FH = H * SCALE;

/** Les poses de Mee et Meo du générateur : leur image (data URI) et sa taille, lue dans l'en-tête PNG. */
export function loadPoses(dir = MEE) {
  return new Map(fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((file) => {
    const buf = fs.readFileSync(path.join(dir, file));
    return [file.slice(0, -4), { uri: 'data:image/png;base64,' + buf.toString('base64'), size: [buf.readUInt32BE(16), buf.readUInt32BE(20)] }];
  }));
}

function measureInPage({ m, g, b, faces }) {
  const load = async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const cv = new OffscreenCanvas(img.width, img.height);
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    return { data: cx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
  };
  return Promise.all([load(m), load(g), load(b)]).then(([M, G, B]) => {
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
    const shade = new Uint8Array(N);
    for (let i = 0; i < N; i++) shade[i] = (win[i] ? 1 : 0) | (bird[i] ? 2 : 0);
    let s = '';
    for (let i = 0; i < N; i += 8192) s += String.fromCharCode(...shade.subarray(i, i + 8192));
    return { overlap, face, depth, windowPx, bbox: x1 < 0 ? null : [x0, y0, x1, y1], shade: btoa(s) };
  });
}

// Remplace les oiseaux du cadre par `anchors` (centre et largeur en pixels de l'image finale), posés comme lib/base.py
// bird() les pose — la même image, la même boîte carrée, `xMidYMid meet`.
function setBirds({ anchors }) {
  const root = document.querySelector('g[data-layer="root"]');
  document.querySelectorAll('[data-layer="birds"]').forEach((el) => el.remove());
  const NS = 'http://www.w3.org/2000/svg';
  anchors.forEach(({ pose, uri, center: [cx, cy], size, rotate, flip }, index) => {
    const g = document.createElementNS(NS, 'g');
    const s = size / 2;
    g.setAttribute('data-layer', 'birds');
    g.setAttribute('data-bird', String(index));
    g.setAttribute('data-pose', pose);
    g.setAttribute('data-k', 'birds');
    g.setAttribute('transform', `translate(${cx / 2} ${cy / 2}) rotate(${rotate})` + (flip ? ' scale(-1 1)' : ''));
    const image = document.createElementNS(NS, 'image');
    image.setAttribute('href', uri);
    image.setAttribute('x', String(-s / 2));
    image.setAttribute('y', String(-s / 2));
    image.setAttribute('width', String(s));
    image.setAttribute('height', String(s));
    image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    image.setAttribute('data-k', 'birds');
    g.appendChild(image);
    root.appendChild(g);
  });
  return Promise.all([...root.querySelectorAll('[data-layer="birds"] image')].map((im) => im.decode?.().catch(() => null)));
}

const b64 = async (handle) => (await shoot(handle)).toString('base64');

/** Un oiseau du DOM (lib/layers.mjs read()) devenu ancre déclarée : sans son image, avec le rectangle de son dessin. */
export const declaredAnchor = (poses) => ({ href, ...bird }) => ({ ...bird, art: artRect(poses.get(bird.pose)?.size ?? [1, 1]) });

/** Une ancre déclarée (boîte carrée) redevenue une pose à injecter : centre et largeur en pixels de l'image finale. */
export const injectable = ({ pose, box: [x, y, w], rotate, flip }) => ({ pose, center: [x + w / 2, y + w / 2], size: w, rotate, flip });

/**
 * Ouvre un cadre et rend une fois ce qui ne dépend pas des oiseaux : la fenêtre (sondes magenta et verte), les visages,
 * le DOM lu (oiseaux dessinés, textes, blason). `mutate` rejoue un défaut connu avant toute mesure.
 */
export async function openFrame(handle, { svg, fonts = 'design', mutate = null }) {
  await showSvg(handle, svg, { fonts });
  const { page } = handle;
  if (mutate) await page.evaluate(mutate);
  const { order } = await page.evaluate(classify);
  const cover = Object.keys(order).filter((k) => !['photo', 'photo-bg', 'birds'].includes(k));
  await page.evaluate(show, { kinds: cover, probe: '#FF00FF' });
  const m = await b64(handle);
  await page.evaluate(show, { kinds: cover, probe: '#00FF00' });
  const g = await b64(handle);
  await page.evaluate(show, { kinds: Object.keys(order) });
  const faces = await page.evaluate((s) => [...document.querySelectorAll('[data-layer="photo"] circle[fill="#0C0806"]')].map((c) => {
    const r = c.getBoundingClientRect();
    return [(r.x + r.width / 2) * s, (r.y + r.height / 2) * s, (r.width / 2) * s];
  }), SCALE);
  const dom = await page.evaluate(read);
  const tied = await page.evaluate(() => document.querySelector('[data-follows-bird]') !== null);
  return { m, g, faces, dom, tied };
}

/** Ce que les oiseaux AFFICHÉS recouvrent de la photo, à l'échelle de design : { overlap, depth, face } et le reste. */
export async function measureBirds(handle, frame) {
  await handle.page.evaluate(show, { kinds: ['birds'] });
  const b = await b64(handle);
  const raw = await handle.page.evaluate(measureInPage, { m: frame.m, g: frame.g, b, faces: frame.faces });
  return {
    overlap: Math.round(raw.overlap / SCALE ** 2),
    face: Math.ceil(raw.face / SCALE ** 2),
    depth: Math.round(raw.depth / SCALE),
    bbox: raw.bbox ? raw.bbox.map((v) => Math.round(v / SCALE)) : null,
    windowPx: Math.round(raw.windowPx / SCALE ** 2),
    shade: Buffer.from(raw.shade, 'base64'),
  };
}

/** Pose `anchors` à la place des oiseaux du cadre, et rend le DOM lu de ces oiseaux. */
export async function placeBirds(handle, anchors, poses) {
  const withImages = anchors.map((a) => ({ ...a, uri: poses.get(a.pose)?.uri ?? '' }));
  await handle.page.evaluate(setBirds, { anchors: withImages });
  return (await handle.page.evaluate(read)).birds;
}

/**
 * Le CORPS d'un oiseau seul (pixels opaques relatifs à son centre, `[x0, y0, …]`, un pixel sur `stride` dans chaque
 * axe) et la scène où le chercher : fenêtre, profondeur, textes et blason, visages — pour placer sans rien rendre.
 */
export async function bodyOf(handle, anchor, poses, { stride = 2 } = {}) {
  await placeBirds(handle, [anchor], poses);
  await handle.page.evaluate(show, { kinds: ['birds'] });
  const alpha = await handle.page.evaluate(async (png) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + png;
    await img.decode();
    const cv = new OffscreenCanvas(img.width, img.height);
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, img.width, img.height).data;
    const out = new Uint8Array(img.width * img.height);
    for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
    let s = '';
    for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode(...out.subarray(i, i + 8192));
    return btoa(s);
  }, await b64(handle));
  const opaque = Buffer.from(alpha, 'base64');
  const [cx, cy] = anchor.center;
  const points = [];
  for (let y = 0; y < FH; y += stride) for (let x = 0; x < FW; x += stride) if (opaque[y * FW + x]) points.push(x - cx, y - cy);
  return Int32Array.from(points);
}

/** La scène de recherche d'un cadre : la fenêtre et sa profondeur depuis une mesure, les boîtes à ne pas couvrir. */
export function searchScene(frame, measured) {
  const N = FW * FH;
  const win = new Uint8Array(N);
  for (let i = 0; i < N; i++) win[i] = measured.shade[i] & 1;
  const dist = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (let i = 0; i < N; i++) if (!win[i]) { dist[i] = 0; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++];
    const x = i % FW, y = (i - x) / FW;
    for (const j of [x > 0 ? i - 1 : -1, x < FW - 1 ? i + 1 : -1, y > 0 ? i - FW : -1, y < FH - 1 ? i + FW : -1]) {
      if (j >= 0 && dist[j] < 0) { dist[j] = dist[i] + 1; queue[tail++] = j; }
    }
  }
  const clear = new Uint8Array(N);
  const boxes = [...frame.dom.texts.filter((t) => !t.slot.startsWith('decor.')).map((t) => t.bbox), ...(frame.dom.crest ? [frame.dom.crest.box] : [])];
  for (const [bx, by, bw, bh] of boxes) for (let y = Math.max(0, by); y < Math.min(FH, by + bh); y++) for (let x = Math.max(0, bx); x < Math.min(FW, bx + bw); x++) clear[y * FW + x] = 1;
  return { win, dist, clear, width: FW, height: FH, margin: 6 * SCALE, faces: frame.faces };
}
