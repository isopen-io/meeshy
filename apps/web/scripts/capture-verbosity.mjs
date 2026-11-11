#!/usr/bin/env node
/**
 * LES MOTS VISIBLES DE CHAQUE VUE (#17587, épure #17584).
 *
 * Ouvre le `dist` (source fixtures) à 390 × 844, l'horloge figée comme
 * `capture.mjs`, pour chaque vue de `verbosity-views.json` ; attend que l'écran
 * soit peint et que le compte se soit STABILISÉ (deux relevés égaux à
 * 250 ms d'écart, `lib/settle-value.mjs` — jamais un délai fixe suivi d'une
 * lecture) ; reprise tant qu'il rend 0 mot ; compte les mots des nœuds texte
 * VISIBLES — au total et dans le premier écran — et capture la vue dans
 * `render/verbosity/`. Le relevé part dans `render/verbosity-measure.json`, que
 * `check-verbosity.mjs` confronte aux budgets.
 *
 * Un texte `sr-only` (la note d'un (i) replié) n'est pas compté : il n'est pas
 * VU. Une vue qui ne se peint pas en fixtures est rangée « non couverte », avec
 * sa raison — jamais omise.
 *
 * `--write-budgets` réécrit `verbosity-budgets.json` depuis le relevé : c'est
 * ainsi qu'on ABAISSE un budget après une épure. Les relèvements motivés
 * (`releves`) inscrits à la main y sont gardés tels quels.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { waitForValueSettled } from './lib/settle-value.mjs';
import { budgetsFromMeasure } from './lib/verbosity-budgets.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const DIST = `${ROOT}dist/`;
const OUTPUT = `${ROOT}render/verbosity/`;
const INSTANT = new Date('2026-09-07T10:00:00Z');
const ATTEMPTS = 4;
const { viewport, views } = JSON.parse(readFileSync(`${ROOT}verbosity-views.json`, 'utf8'));

mkdirSync(OUTPUT, { recursive: true });

const countVisibleWords = (screenHeight) => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let total = 0;
  let firstScreen = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent.trim();
    const element = node.parentElement;
    if (text === '' || element === null) continue;
    if (element.closest('[data-player-banner]') !== null) continue;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (box.width < 2 || box.height < 2 || style.visibility === 'hidden' || style.opacity === '0') continue;
    const words = text.split(/\s+/).length;
    total += words;
    if (box.top < screenHeight && box.bottom > 0) firstScreen += words;
  }
  return { total, firstScreen };
};

const served = await startDistServer(DIST, { serviceWorker: false });
const browser = await launchChromium();
const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'light', locale: 'fr-FR' });

const measureView = async ({ name, path }) => {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${served.base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.innerText.trim().split(/\s+/).length > 12, null, { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    const counted = await waitForValueSettled(page, countVisibleWords, viewport.height, { stepMs: 250, attempts: 40, pret: (value) => value.total > 0 });
    if (counted !== undefined) await page.screenshot({ path: `${OUTPUT}${name}.png` });
    await page.close();
    if (counted !== undefined) return { counted };
  }
  return { reason: `0 mot visible après ${ATTEMPTS} essais sur ${path}` };
};

const measured = { views: {}, uncovered: {} };
for (const view of views) {
  if (view.uncovered !== undefined) {
    measured.uncovered[view.name] = view.uncovered;
    console.log(`  non couverte  ${view.name} — ${view.uncovered}`);
    continue;
  }
  const { counted, reason } = await measureView(view);
  if (counted === undefined) {
    measured.uncovered[view.name] = reason;
    console.log(`  non couverte  ${view.name} — ${reason}`);
    continue;
  }
  measured.views[view.name] = counted;
  console.log(`  ${String(counted.total).padStart(5)} mots · ${String(counted.firstScreen).padStart(4)} au premier écran  ${view.name}`);
}

await context.close();
await browser.close();
served.close();

const result = budgetsFromMeasure(measured);
writeFileSync(`${ROOT}render/verbosity-measure.json`, `${JSON.stringify(result, null, 2)}\n`);
if (process.argv.includes('--write-budgets')) {
  const current = JSON.parse(readFileSync(`${ROOT}verbosity-budgets.json`, 'utf8'));
  writeFileSync(`${ROOT}verbosity-budgets.json`, `${JSON.stringify(budgetsFromMeasure(measured, current), null, 2)}\n`);
}
console.log(`\n  relevé : render/verbosity-measure.json · captures : render/verbosity/`);
