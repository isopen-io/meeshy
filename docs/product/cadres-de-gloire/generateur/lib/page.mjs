// Une page Chromium qui affiche un SVG de cadre en 1080×1920 (repère de design 540×960, deviceScaleFactor 2).
// `fonts: 'design'` charge fonts.css tel que la planche validée l'a rendu ; `fonts: 'exact'` charge les mêmes fichiers
// en déclarant la plage de graisses de chaque police variable, pour que Manrope 600, Fraunces 700 ou Caveat 600 soient
// rendues dans leur graisse et non substituées.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { show } from './layers.mjs';

export const W = 540;
export const H = 960;
export const SCALE = 2;
export const FONTS_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../fonts');

const VARIABLE_WEIGHTS = {
  'Caveat|normal': '400 700',
  'Cinzel|normal': '400 900',
  'Cormorant Garamond|normal': '300 700',
  'Fraunces|normal': '100 900',
  'Manrope|normal': '200 800',
};

export function exactFontsCss(css = fs.readFileSync(path.join(FONTS_DIR, 'fonts.css'), 'utf8')) {
  return css.replace(/font-family: '([^']+)';(\s*)font-style: (\w+);(\s*)font-weight: (\d+);/g, (all, family, s1, style, s2) => {
    const range = VARIABLE_WEIGHTS[`${family}|${style}`];
    return range ? `font-family: '${family}';${s1}font-style: ${style};${s2}font-weight: ${range};` : all;
  });
}

const cssFor = (fonts) => {
  if (fonts === 'design') return '<link rel="stylesheet" href="file://' + path.join(FONTS_DIR, 'fonts.css') + '">';
  const css = exactFontsCss().replace(/url\((f\d+\.woff2)\)/g, (_, file) => 'url(file://' + path.join(FONTS_DIR, file) + ')');
  return '<style>' + css + '</style>';
};

export async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cadres-'));
  return { page, file: path.join(tmp, 'frame.html'), dispose: async () => { await page.close(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}

export async function showSvg(handle, svg, { fonts }) {
  const html = '<!doctype html><html><head><meta charset="utf-8">' + cssFor(fonts) + '<style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>' + svg + '</body></html>';
  fs.writeFileSync(handle.file, html);
  await handle.page.goto('file://' + handle.file);
  await settle(handle);
}

// UNE CAPTURE N'ATTEND QUE CE QUI EST PEINT (#12801). `page.screenshot` prend l'image suivante, pas celle où tout est
// arrivé : une image encore en vol (la photo posée par `show` après le chargement) ou décodée en différé (Chromium peut
// peindre une grande image d'abord sans elle, puis la décoder sur un fil de rendu) sort absente d'une capture et
// présente de l'autre — deux rendus diffèrent, et la cible est déclarée instable sans que le cadre ait changé.
// Avant toute capture : les polices sont chargées, chaque <image> est décodée de façon synchrone (`decoding="sync"`)
// et a fini de charger (`__loaded`, posé par `show` avant son `href`), son octet est décodé, puis deux images passent.
export async function settle(handle) {
  await handle.page.evaluate(async () => {
    await Promise.all([...document.fonts].filter((face) => face.status === 'unloaded').map((face) => face.load().catch(() => null)));
    await document.fonts.ready;
    const images = [...document.querySelectorAll('image')];
    for (const im of images) im.setAttribute('decoding', 'sync');
    await Promise.all(images.map((im) => im.__loaded ?? null));
    const hrefs = [...new Set(images.map((im) => im.getAttribute('href') ?? im.getAttribute('xlink:href')).filter(Boolean))];
    await Promise.all(hrefs.map((href) => {
      const img = new Image();
      img.src = href;
      return img.decode().catch(() => null);
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

// La photo FIXTURE posée par `show` (lib/layers.mjs) arrive après le chargement : elle n'est rendue qu'une fois peinte.
export async function showPhoto(handle, { kinds, photo }) {
  await handle.page.evaluate(show, { kinds, photo });
  await settle(handle);
}

export const shoot = (handle) => handle.page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });

export async function pool(items, size, work) {
  const queue = [...items];
  const results = new Map();
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) results.set(item, await work(item));
  }));
  return items.map((item) => results.get(item));
}
