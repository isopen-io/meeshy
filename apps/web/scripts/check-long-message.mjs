#!/usr/bin/env node
/**
 * VÉRIFIE LE MESSAGE LONG DANS UN VRAI NAVIGATEUR (#8147) — un contrôle
 * existe s'il a un EFFET, et un verre existe s'il FLOUTE.
 *
 * Directive porteur 2026-09-26 : « le message long qui doit avoir “Lire la
 * suite” affiche toujours moins de sa moitié », « il faut les déplier juste
 * et non plus ouvrir un sheet », « lorsqu'on déplie un message long, il faut
 * appliquer l'effet focal », « le Focal est un bloc de verre sur lequel le
 * message vient grossir », « par défaut Script ».
 *
 * CE QU'IL MESURE, sur `/c/c-message-long` (corpus hors liste,
 * `fixtures-long-message.ts`) :
 *
 * 1. Le fil s'ouvre en SCRIPT ; le message long n'en montre que l'extrait
 *    (moins de la moitié des caractères) suivi de « … » et du bouton
 *    « Lire la suite » (`aria-expanded="false"`, cible ≥ 44 px).
 * 2. Toucher DÉPLIE sur place : le texte intégral est rendu, le bouton dit
 *    « Réduire » (`aria-expanded="true"`), AUCUNE feuille ni dialogue ne
 *    s'ouvre, l'adresse ne bouge pas.
 * 3. L'effet Focal : un bloc de verre SOUS le message (`backdrop-filter`
 *    calculé, rayon 18 px), la loupe (`scale` > 1), les voisins atténués
 *    (opacité calculée 0,62), un seul message déplié à la fois.
 * 4. Le message traduit se tronque sur le texte SERVI (français), jamais sur
 *    l'original anglais.
 * 5. « Réduire » replie : extrait, verre et atténuation s'en vont.
 * 6. `prefers-reduced-motion: reduce` : aucune loupe.
 * 7. En FOCAL (choisi), l'élue du défilement pose le même verre.
 * 8. Clair et sombre capturés (outil Read, hors de ce script).
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { pageÀInstantFigé } from './lib/instant.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const CAPTURES = join(APP, '..', '..', '.cache', 'web-v2-workflow', 'rendus');
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;
await mkdir(CAPTURES, { recursive: true });

const failures = [];
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return ok;
};

const CONVERSATION = 'c-message-long';
const MODE_KEY = `meeshy.reading-mode.u_u-viewer.${CONVERSATION}`;

const setScheme = (context, scheme) =>
  context.addInitScript((s) => {
    try {
      localStorage.setItem('meeshy.scheme', s);
    } catch {
      /* navigation privée : le schéma tient pour la page seule. */
    }
  }, scheme);

const setMode = (context, mode) =>
  context.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* navigation privée */
      }
    },
    { key: MODE_KEY, value: mode },
  );

const browser = await launchChromium();

const openThread = async (context) => {
  const page = await pageÀInstantFigé(context);
  await page.goto(`${BASE}/c/${CONVERSATION}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-row="lm-2"]');
  await page.waitForTimeout(300);
  return page;
};

const rowState = (page, id) =>
  page.$eval(`[data-row="${id}"]`, (row) => {
    const stage = row.querySelector('[data-unfold-stage]');
    const content = row.querySelector('.unfold-content');
    const glass = row.querySelector('[data-unfold-glass]');
    const toggle = row.querySelector('button[data-long-message-toggle]');
    const text = row.querySelector('[data-rich-text]')?.textContent ?? '';
    const glassStyle = glass === null ? null : getComputedStyle(glass);
    const toggleBox = toggle?.getBoundingClientRect();
    return {
      text,
      mode: row.querySelector('[data-reading-mode]')?.getAttribute('data-reading-mode') ?? 'bubbles',
      unfolded: stage?.hasAttribute('data-unfolded') ?? false,
      opacity: stage === null ? null : Number(getComputedStyle(stage).opacity),
      transform: content === null ? '' : content.style.transform,
      glass:
        glassStyle === null
          ? null
          : { backdrop: glassStyle.backdropFilter || glassStyle.webkitBackdropFilter, radius: glassStyle.borderTopLeftRadius },
      toggle: toggle === null ? null : { label: toggle.textContent, expanded: toggle.getAttribute('aria-expanded'), height: toggleBox?.height ?? 0 },
    };
  });

const press = async (page, id) => {
  await page.locator(`[data-row="${id}"] button[data-long-message-toggle]`).click();
  await page.waitForTimeout(450);
};

for (const scheme of ['dark', 'light']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await setScheme(context, scheme);
  const page = await openThread(context);
  const url = page.url();

  const folded = await rowState(page, 'lm-2');
  const fullLength = await page.evaluate(() => {
    const row = document.querySelector('[data-row="lm-2"]');
    return (row?.getAttribute('aria-label') ?? '').length;
  });
  expect(folded.mode === 'script', `[${scheme}] le fil s'ouvre en SCRIPT (lu « ${folded.mode} »)`);
  expect(folded.text.endsWith('…'), `[${scheme}] l'extrait finit par « … »`);
  expect(
    folded.text.length * 2 < fullLength,
    `[${scheme}] l'extrait montre moins de la moitié du message (${folded.text.length} / ~${fullLength})`,
  );
  expect(
    folded.toggle?.label === 'Lire la suite' && folded.toggle.expanded === 'false',
    `[${scheme}] « Lire la suite », aria-expanded=false (${JSON.stringify(folded.toggle)})`,
  );
  expect((folded.toggle?.height ?? 0) >= 44, `[${scheme}] la cible du bouton fait au moins 44 px (${folded.toggle?.height})`);
  expect(folded.glass === null && !folded.unfolded, `[${scheme}] replié : aucun verre`);
  await page.screenshot({ path: join(CAPTURES, `long-message-script-folded-${scheme}.png`) });

  await press(page, 'lm-2');
  const open = await rowState(page, 'lm-2');
  const neighbour = await rowState(page, 'lm-3');
  expect(open.text.length > folded.text.length * 3, `[${scheme}] déplié : le texte intégral est rendu (${open.text.length})`);
  expect(
    open.toggle?.label === 'Réduire' && open.toggle.expanded === 'true',
    `[${scheme}] « Réduire », aria-expanded=true (${JSON.stringify(open.toggle)})`,
  );
  expect((await page.locator('[role="dialog"]').count()) === 0 && page.url() === url, `[${scheme}] aucune feuille, l'adresse ne bouge pas`);
  expect(
    open.glass !== null && /blur\(/.test(open.glass.backdrop) && open.glass.radius === '18px',
    `[${scheme}] le message déplié repose sur un bloc de VERRE flouté, rayon 18 (${JSON.stringify(open.glass)})`,
  );
  expect(/scale\(1\.0\d*\)/.test(open.transform), `[${scheme}] la loupe grossit le message déplié (${open.transform})`);
  expect(Math.abs((neighbour.opacity ?? 1) - 0.62) < 0.01, `[${scheme}] les voisins s'atténuent à 0,62 (${neighbour.opacity})`);
  expect(open.opacity === 1, `[${scheme}] le message déplié reste pleinement opaque`);
  await page.screenshot({ path: join(CAPTURES, `long-message-script-unfolded-${scheme}.png`) });

  await page.locator('[data-row="lm-4"]').scrollIntoViewIfNeeded();
  const translated = await rowState(page, 'lm-4');
  expect(
    translated.text.startsWith('Petit récapitulatif') && !translated.text.includes('Quick recap'),
    `[${scheme}] l'extrait du message traduit porte sur le texte SERVI (« ${translated.text.slice(0, 40)} »)`,
  );
  await press(page, 'lm-4');
  const second = await rowState(page, 'lm-4');
  const first = await rowState(page, 'lm-2');
  expect(second.unfolded && !first.unfolded, `[${scheme}] un seul message déplié à la fois`);
  expect(second.text.includes('jeu de cotes partagé'), `[${scheme}] le dépliage traduit rend la fin de la traduction`);

  await press(page, 'lm-4');
  const refolded = await rowState(page, 'lm-4');
  const calmed = await rowState(page, 'lm-3');
  expect(!refolded.unfolded && refolded.glass === null && refolded.text.endsWith('…'), `[${scheme}] « Réduire » replie`);
  expect(calmed.opacity === 1, `[${scheme}] replié, les voisins retrouvent leur opacité (${calmed.opacity})`);
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'fr-FR' });
  await setScheme(context, 'dark');
  const page = await openThread(context);
  await press(page, 'lm-2');
  const open = await rowState(page, 'lm-2');
  expect(open.unfolded && open.transform === '', `mouvement réduit : déplié sans loupe (${open.transform || 'aucune'})`);
  await context.close();
}

for (const scheme of ['dark', 'light']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await setScheme(context, scheme);
  await setMode(context, 'focal');
  const page = await openThread(context);
  const state = await rowState(page, 'lm-2');
  expect(state.mode === 'focal', `[${scheme}] Focal choisi, la rangée est Focal`);
  await press(page, 'lm-2');
  const open = await rowState(page, 'lm-2');
  expect(open.glass !== null && open.unfolded, `[${scheme}] en Focal aussi, le message déplié repose sur le verre`);
  await page.screenshot({ path: join(CAPTURES, `long-message-focal-unfolded-${scheme}.png`) });
  await context.close();
}

await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`\n  ${failures.length} défaut(s) du message long.\n`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log(`\n  Le message long tient : extrait au quart, dépliage en place, verre Focal. Captures dans ${CAPTURES}.\n`);
