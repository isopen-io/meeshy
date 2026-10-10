// Détecte les empiètements de Mee et Meo sur la fenêtre photo d'un cadre (et sur les visages du placeholder).
// Usage : node overlap.mjs <dossier> [--only nom1,nom2] [--png]
// Sortie : <dossier>/overlap.json  [{file, overlap, face, depth, bbox}] ; --png écrit <dossier>/.overlap/<nom>.png
// Méthode : trois rendus du même SVG dans Chromium —
//   A  tel quel ; D  sans les oiseaux ; B  sans les oiseaux, la photo remplacée par du magenta pur.
//   fenêtre = pixels magenta de B ; oiseau = |A − D| ; visages = cercles du placeholder (fill #0C0806).
import { launch } from './launch.mjs';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const dir = path.resolve(process.argv[2]);
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;
const wantPng = process.argv.includes('--png');
const fontsCss = 'file://' + path.resolve(path.dirname(new URL(import.meta.url).pathname), '../fonts/fonts.css');
const birdHashes = fs.readdirSync(path.resolve(HERE, '../mee')).filter((f) => f.endsWith('.png'))
  .map((f) => fs.readFileSync(path.resolve(HERE, '../mee', f)).toString('base64').slice(0, 400));
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort().filter((f) => !only || only.has(f.replace('.svg', '')));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
const results = [];
if (wantPng) fs.mkdirSync(path.join(dir, '.overlap'), { recursive: true });
for (const file of files) {
  const svg = fs.readFileSync(path.join(dir, file), 'utf8');
  const html = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="' + fontsCss + '"><style>html,body{margin:0;background:#000}svg{display:block}</style></head><body>' + svg + '</body></html>';
  const tmp = path.join(dir, '.overlap.html');
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  const shot = async () => (await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 540, height: 960 } })).toString('base64');
  const faces = await page.evaluate((hashes) => {
    const imgs = [...document.querySelectorAll('image')];
    imgs.forEach((im) => {
      const href = im.getAttribute('href') || im.getAttribute('xlink:href') || '';
      const b64 = href.startsWith('data:image/png;base64,') ? href.slice(22, 422) : '';
      const embossed = im.closest('[filter*="emb"]');
      if (b64 && hashes.includes(b64) && !embossed) im.setAttribute('data-bird', '1');
    });
    return [...document.querySelectorAll('circle[fill="#0C0806"]')].map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy'), +c.getAttribute('r')]);
  }, birdHashes);
  const A = await shot();
  await page.evaluate(() => document.querySelectorAll('[data-bird]').forEach((im) => im.setAttribute('visibility', 'hidden')));
  const D = await shot();
  await page.evaluate(() => {
    document.querySelectorAll('[fill*="ph-bg"]').forEach((el) => el.setAttribute('fill', '#FF00FF'));
    document.querySelectorAll('[fill*="ph-halo"], [filter*="ph-bokeh"]').forEach((el) => el.setAttribute('visibility', 'hidden'));
    document.querySelectorAll('circle[fill="#0C0806"]').forEach((c) => c.parentNode.setAttribute('visibility', 'hidden'));
  });
  const B = await shot();
  const r = await page.evaluate(async ({ A, D, B, faces, wantPng }) => {
    const load = async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = new OffscreenCanvas(540, 960); const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
      return cx.getImageData(0, 0, 540, 960).data;
    };
    const [a, d, b] = await Promise.all([load(A), load(D), load(B)]);
    const W = 540, H = 960;
    const win = new Uint8Array(W * H), bird = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const R = b[i * 4], G = b[i * 4 + 1], Bl = b[i * 4 + 2];
      win[i] = R > 150 && Bl > 150 && G < 120 && R - G > 70 && Bl - G > 70 ? 1 : 0;
      const diff = Math.abs(a[i * 4] - d[i * 4]) + Math.abs(a[i * 4 + 1] - d[i * 4 + 1]) + Math.abs(a[i * 4 + 2] - d[i * 4 + 2]);
      bird[i] = diff > 90 ? 1 : 0;
    }
    let overlap = 0, face = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    const inFace = (x, y) => faces.some(([fx, fy, fr]) => (x - fx) ** 2 + (y - fy) ** 2 <= fr * fr);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (win[i] && bird[i]) {
        overlap++; if (inFace(x, y)) face++;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
    // profondeur : plus grande distance (en px) d'un pixel d'empiètement au bord de la fenêtre, estimée par érosion
    let depth = 0;
    if (overlap) {
      let cur = win.slice();
      for (let k = 1; k <= 120; k++) {
        const next = new Uint8Array(W * H); let any = false;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (cur[i] && cur[i - 1] && cur[i + 1] && cur[i - W] && cur[i + W]) { next[i] = 1; if (bird[i]) any = true; }
        }
        if (!any) break; depth = k; cur = next;
      }
    }
    let png = null;
    if (wantPng) {
      const cv = new OffscreenCanvas(W, H); const cx = cv.getContext('2d'); const id = cx.createImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        const o = i * 4;
        id.data[o] = a[o]; id.data[o + 1] = a[o + 1]; id.data[o + 2] = a[o + 2]; id.data[o + 3] = 255;
        if (win[i] && !bird[i]) { id.data[o] = (a[o] + 255) >> 1; id.data[o + 2] = (a[o + 2] + 255) >> 1; }
        if (win[i] && bird[i]) { id.data[o] = 255; id.data[o + 1] = 0; id.data[o + 2] = 0; }
      }
      cx.putImageData(id, 0, 0);
      const blob = await cv.convertToBlob({ type: 'image/png' });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
      png = btoa(s);
    }
    return { overlap, face, depth, bbox: overlap ? [x0, y0, x1, y1] : null, windowPx: win.reduce((s, v) => s + v, 0), png };
  }, { A, D, B, faces, wantPng });
  if (r.png) fs.writeFileSync(path.join(dir, '.overlap', file.replace('.svg', '.png')), Buffer.from(r.png, 'base64'));
  results.push({ file: file.replace('.svg', ''), overlap: r.overlap, face: r.face, depth: r.depth, bbox: r.bbox, windowPx: r.windowPx });
}
fs.rmSync(path.join(dir, '.overlap.html'), { force: true });
const prev = fs.existsSync(path.join(dir, 'overlap.json')) && only ? JSON.parse(fs.readFileSync(path.join(dir, 'overlap.json'), 'utf8')) : [];
const merged = [...prev.filter((p) => !results.some((r) => r.file === p.file)), ...results].sort((x, y) => x.file.localeCompare(y.file));
fs.writeFileSync(path.join(dir, 'overlap.json'), JSON.stringify(merged, null, 1));
await browser.close();
for (const r of results) console.log(`${r.overlap > 0 ? (r.face ? 'FACE' : 'EMP ') : 'ok  '} ${r.file} overlap=${r.overlap} face=${r.face} depth=${r.depth} win=${r.windowPx} bbox=${JSON.stringify(r.bbox)}`);
