#!/usr/bin/env node
/**
 * LE FOND PEINT DE L'APERÇU PASSE SOUS SON CONTENU (#12633, #17243).
 *
 * La carte d'aperçu d'une conversation tenue se peint désormais sur le fond
 * choisi par le lecteur (`ConversationBackdrop`, `conversation-peek-card.tsx`).
 * Le témoin `bun test` mesure le contraste par le CALCUL, depuis les jetons ;
 * celui-ci le mesure dans un MOTEUR RÉEL, sur les PIXELS rendus, avec les
 * feuilles du dépôt (`@meeshy/design-tokens/ios.css`, `conversation-peek.css`) :
 *
 *  1. le fond peint passe DEVANT la surface de la carte et DERRIÈRE son
 *     contenu — un pixel du corps vaut la photo, pas la carte (`isolation`) ;
 *  2. tant que la couche rend Signature (photo en route), la carte garde SA
 *     surface — un pixel du corps vaut la carte.
 *
 * La carte n'a plus d'en-tête (consigne porteur, #17243 : on sait déjà ce
 * qu'on tient) : le contraste du titre et de la ligne secondaire, que ce gate
 * mesurait, n'a plus d'objet.
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
          const body = document.querySelector('.conversation-peek-body').getBoundingClientRect();
          const card = getComputedStyle(document.querySelector('[data-peek-card]')).backgroundColor;
          return { body: { x: body.left + body.width / 2, y: body.top + body.height / 2 }, card };
        });
        const [bodyPixel] = await pixelsOf(page, [geometry.body]);
        const label = `${scheme} · photo ${photo} · ${ready ? 'prête' : 'en route'}`;
        const cardRgb = parseColor(geometry.card).rgb;
        const expectedBody = ready ? parseColor(`rgb(${photo === '#000000' ? '0, 0, 0' : '255, 255, 255'})`).rgb : cardRgb;
        console.log(`  ${label} · corps : ${bodyPixel.map((c) => Math.round(c * 255))}`);
        if (!close(bodyPixel, expectedBody)) failures.push(`${label} : le corps vaut ${bodyPixel.map((c) => Math.round(c * 255))}, attendu ${expectedBody.map((c) => Math.round(c * 255))}`);
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
console.log('✓ check-peek-backdrop : le fond peint passe sous le contenu, la carte garde sa surface tant qu’il n’est pas prêt, clair et sombre');
