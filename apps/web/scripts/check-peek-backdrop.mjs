#!/usr/bin/env node
/**
 * L'EN-TÊTE DE L'APERÇU RESTE LISIBLE SUR UN FOND PHOTO (#12633).
 *
 * La carte d'aperçu d'une conversation tenue se peint désormais sur le fond
 * choisi par le lecteur (`ConversationBackdrop`, `conversation-peek-card.tsx`).
 * Le témoin `bun test` mesure le contraste par le CALCUL, depuis les jetons ;
 * celui-ci le mesure dans un MOTEUR RÉEL, sur les PIXELS rendus, avec les
 * feuilles du dépôt (`@meeshy/design-tokens/ios.css`, `conversation-peek.css`) :
 *
 *  1. le fond peint passe DEVANT la surface de la carte et DERRIÈRE son
 *     contenu — un pixel du corps vaut la photo, pas la carte (`isolation`) ;
 *  2. l'en-tête tient AA (4,5:1) pour le titre ET la ligne secondaire, sur une
 *     photo noire puis blanche sans voile, en schéma clair puis sombre ;
 *  3. tant que la couche rend Signature (photo en route), la carte garde SA
 *     surface — un pixel du corps vaut la carte.
 *
 * Aucune construction n'est requise : un harnais statique monte la carte telle
 * que le composant la rend. La lecture des pixels passe par Chromium lui-même
 * (canevas), sans dépendance de décodage.
 */
import { readFileSync } from 'node:fs';

import { launchChromium, reportOpenPages } from './lib/browser.mjs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const TOKENS = read('../../../packages/design-tokens/ios.css');
const PEEK = read('../src/styles/conversation-peek.css').replace(/@import[^;]+;/g, '');

const BRIDGE = `
:root { --color-ios-card: var(--ios-surface-card); --color-ios-ink: var(--ios-ink); --color-ios-ink-3: var(--ios-ink-3); --color-edge: transparent; --shadow-cast: none; }
html, body { margin: 0; background: #7f7f7f; font-family: sans-serif; }
.conversation-peek-card { width: 320px; height: 220px; margin: 20px; }
`;

const harness = ({ scheme, photo, ready }) => `<!doctype html>
<html class="${scheme === 'light' ? 'light' : ''}"><head><meta charset="utf-8"><style>${TOKENS}${BRIDGE}${PEEK}</style></head>
<body>
  <div class="conversation-peek-card" data-peek-card data-peek-backdrop="photo" style="--accent: #6366F1">
    ${
      ready
        ? `<div class="thread-backdrop" data-appearance="photo" aria-hidden="true">
             <div class="thread-backdrop-photo" style="background-color: ${photo}"></div>
             <div class="thread-backdrop-veil" style="background-color: rgba(0, 0, 0, 0)"></div>
           </div>`
        : '<div class="thread-backdrop" aria-hidden="true"></div>'
    }
    <div data-peek-header class="conversation-peek-header">
      <div style="width: 36px; height: 36px"></div>
      <div style="display: flex; flex-direction: column; flex: 1">
        <span data-title style="color: var(--color-ios-ink); font-weight: 800">Équipe Lyon</span>
        <span data-secondary style="color: var(--color-ios-ink-3); font-size: 12px">4 membres</span>
      </div>
    </div>
    <div class="conversation-peek-body"></div>
  </div>
</body></html>`;

const parseColor = (text) => {
  const rgb = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(text);
  if (rgb !== null) return { rgb: [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255], alpha: rgb[4] === undefined ? 1 : Number(rgb[4]) };
  const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(text);
  if (srgb !== null) return { rgb: [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])], alpha: srgb[4] === undefined ? 1 : Number(srgb[4]) };
  throw new Error(`couleur illisible : ${text}`);
};

const over = ({ rgb, alpha }, bottom) => rgb.map((channel, index) => channel * alpha + bottom[index] * (1 - alpha));
const luminance = (rgb) => {
  const linear = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

async function pixelsOf(page, points) {
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  return page.evaluate(
    async ({ data, at }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return at.map(({ x, y }) => [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)].map((c) => c / 255));
    },
    { data: png, at: points },
  );
}

const close = (a, b) => a.every((channel, index) => Math.abs(channel - b[index]) <= 2 / 255);
const failures = [];
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
  for (const scheme of ['dark', 'light']) {
    for (const photo of ['#000000', '#ffffff']) {
      for (const ready of [true, false]) {
        await page.setContent(harness({ scheme, photo, ready }));
        const geometry = await page.evaluate(() => {
          const header = document.querySelector('[data-peek-header]').getBoundingClientRect();
          const body = document.querySelector('.conversation-peek-body').getBoundingClientRect();
          const card = getComputedStyle(document.querySelector('[data-peek-card]')).backgroundColor;
          const title = getComputedStyle(document.querySelector('[data-title]')).color;
          const secondary = getComputedStyle(document.querySelector('[data-secondary]')).color;
          return { header: { x: header.right - 6, y: header.top + header.height / 2 }, body: { x: body.left + body.width / 2, y: body.top + body.height / 2 }, card, title, secondary };
        });
        const [headerPixel, bodyPixel] = await pixelsOf(page, [geometry.header, geometry.body]);
        const label = `${scheme} · photo ${photo} · ${ready ? 'prête' : 'en route'}`;
        const cardRgb = parseColor(geometry.card).rgb;
        const expectedBody = ready ? parseColor(`rgb(${photo === '#000000' ? '0, 0, 0' : '255, 255, 255'})`).rgb : cardRgb;
        if (!close(bodyPixel, expectedBody)) failures.push(`${label} : le corps vaut ${bodyPixel.map((c) => Math.round(c * 255))}, attendu ${expectedBody.map((c) => Math.round(c * 255))}`);
        for (const [name, text] of [['titre', geometry.title], ['ligne secondaire', geometry.secondary]]) {
          const ratio = contrast(over(parseColor(text), headerPixel), headerPixel);
          console.log(`  ${label} · ${name} : ${ratio.toFixed(2)}:1`);
          if (ratio < 4.5) failures.push(`${label} : ${name} à ${ratio.toFixed(2)}:1, sous AA (4,5:1)`);
        }
      }
    }
  }
} catch (error) {
  reportOpenPages();
  throw error;
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`✗ check-peek-backdrop : ${failures.length} défaut(s)\n${failures.map((line) => `  - ${line}`).join('\n')}`);
  process.exit(1);
}
console.log('✓ check-peek-backdrop : le fond peint passe sous le contenu, l’en-tête tient AA sur toute photo, clair et sombre');
