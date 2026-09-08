#!/usr/bin/env node
/**
 * Capture les ecrans du POC aux deux schemas, a la largeur de reference
 * (390 x 844 — l'iPhone que les cibles montrent), pour qu'on JUGE le rendu au
 * lieu de le supposer. Les captures vont dans `render/`, non versionnees.
 */
import { launchChromium } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUTPUT = new URL('../render/', import.meta.url).pathname;
mkdirSync(OUTPUT, { recursive: true });

/**
 * L'INSTANT DE REFERENCE des captures.
 *
 * Les fixtures sont ancrees sur `Date.now()` pour que le fil se lise toujours
 * comme aujourd'hui (sinon il affiche « Hier » le lendemain). Mais alors deux
 * captures du MEME code different par leurs horodatages, et comparer un rendu
 * avant/apres devient impossible. On fige donc l'horloge de la page : les
 * fixtures restent relatives, et le resultat redevient reproductible.
 */
const INSTANT = new Date('2026-09-07T10:00:00Z');

const SCREENS = [
  { name: 'list', path: '/' },
  { name: 'thread', path: '/c/c-equipe' },
  { name: 'thread-live', path: '/c/c-amina' },
  { name: 'login', path: '/login' },
  { name: 'signup', path: '/signup' },
];

const browser = await launchChromium();
for (const scheme of ['dark', 'light']) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme === 'light' ? 'light' : 'dark',
  });
  for (const screen of SCREENS) {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const file = `${OUTPUT}${screen.name}.${scheme}.png`;
    await page.screenshot({ path: file });
    console.log(`  ${screen.name} · ${scheme}`);
    await page.close();
  }
  await context.close();
}

/**
 * LA SCÈNE DU FIL (#5648) — quatre captures dynamiques sur
 * `/c/c-salon-riviere`, comparées à `targets/thread.focal.scene.*`,
 * `thread.focal.timestamps.*`, `thread.script.*`. `page.clock.setFixedTime`
 * ne fige QUE `Date` (les libellés « Aujourd'hui »/l'heure) — `performance.now()`
 * continue de tourner en temps réel, c'est ce que la scène lit
 * (`reading-mode/scene.ts`), donc le geste de défilement ci-dessous produit
 * un armement et une élection réels.
 */
for (const scheme of ['dark', 'light']) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme === 'light' ? 'light' : 'dark',
  });

  // thread-focal-rest — au repos, avant tout geste.
  {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUTPUT}thread-focal-rest.${scheme}.png` });
    console.log(`  thread-focal-rest · ${scheme}`);
    await page.close();
  }

  // thread-focal-scene — après 4,2 s de `wheel` soutenu (< 4,5 s d'aplatissement).
  {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.locator('main').hover();
    for (let i = 0; i < 42; i += 1) {
      await page.mouse.wheel(0, -40);
      await page.waitForTimeout(100);
    }
    await page.screenshot({ path: `${OUTPUT}thread-focal-scene.${scheme}.png` });
    console.log(`  thread-focal-scene · ${scheme}`);
    await page.close();
  }

  // thread-focal-reveal — 200 ms après le dernier `wheel` (heure/coches révélées).
  {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.locator('main').hover();
    await page.mouse.wheel(0, -40);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUTPUT}thread-focal-reveal.${scheme}.png` });
    console.log(`  thread-focal-reveal · ${scheme}`);
    await page.close();
  }

  // thread-script — le mode Script, densité uniforme, zéro élection.
  {
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}/c/c-salon-riviere`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Mode de lecture/ }).click();
    await page.waitForTimeout(150);
    await page.getByRole('menuitemradio', { name: /Script/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUTPUT}thread-script.${scheme}.png` });
    console.log(`  thread-script · ${scheme}`);
    await page.close();
  }

  await context.close();
}

await browser.close();
