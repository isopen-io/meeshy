#!/usr/bin/env node
/**
 * LA LISTE VIRTUALISÉE NE SE FIGE PAS SOUS « ANIMATIONS RÉDUITES » (#12885).
 *
 * La règle 32 (`styles/app.css`) ramène toute transition à 0,01 ms sous
 * `prefers-reduced-motion: reduce`, et la propriété par défaut est `all` : un
 * changement de hauteur devient une transition dont la valeur reste celle de
 * DÉPART jusqu'à l'image suivante. La fenêtre de rangées
 * (`lib/view/use-row-windows.ts`) mesure ses ancres dans un effet de mise en
 * page, juste après avoir remplacé des rangées par une cale : elle lisait une
 * cale de 0 px au lieu de 168, le défileur compensait la hauteur perdue, la
 * passe suivante remontait les rangées, et la boucle ne rendait plus jamais la
 * main — un saut à 1002 px, ou le focus d'une rangée hors champ, figeait
 * l'onglet.
 *
 * Le témoin balaie la liste en sauts instantanés sous « animations réduites » :
 * à chaque position, la page doit répondre et le défilement doit rester là où
 * on l'a posé. Une cale qui ment sur sa hauteur fait dériver l'un ou figer
 * l'autre.
 */
import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { reportFailures } from './lib/ci-annotation.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const STEP_PX = 6;
const FROZEN_AFTER_MS = 5_000;

const served = await startDistServer(DIST, { serviceWorker: false });
const browser = await launchChromium();
const failures = [];
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

for (const reducedMotion of ['reduce', 'no-preference']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', locale: 'fr-FR', reducedMotion });
  const page = await context.newPage();
  await page.goto(`${served.base}/chats`, { waitUntil: 'load' });
  await page.waitForSelector('[data-row-gap]', { state: 'attached' });

  const sweep = page.evaluate(async (step) => {
    const frame = document.getElementById('contenu');
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    /* Toutes les pages d'abord : une page qui arrive pendant le balayage peut
       ranger une conversation AU-DESSUS de l'écran, et l'ancrage de
       défilement la compense à raison — ce n'est pas la dérive cherchée. */
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let stable = 0, rounds = 0, height = -1; stable < 3 && rounds < 60; rounds += 1) {
      frame.scrollTop = frame.scrollHeight;
      await pause(250);
      stable = frame.scrollHeight === height ? stable + 1 : 0;
      height = frame.scrollHeight;
    }
    frame.scrollTop = 0;
    await settle();
    const drifts = [];
    const end = frame.scrollHeight - frame.clientHeight;
    /* Une conversation qui arrive se range parfois au-dessus de l'écran, et
       la hauteur de la liste grandit d'autant : la compensation est juste.
       Une cale qui ment, elle, rend sa hauteur à l'image suivante — la liste
       garde la même hauteur et le défilement a bougé quand même. */
    for (let top = 0; top <= end; top += step) {
      const height = frame.scrollHeight;
      frame.scrollTop = top;
      await settle();
      if (Math.abs(frame.scrollTop - top) > 1 && frame.scrollHeight === height) drifts.push({ asked: top, got: frame.scrollTop });
    }
    return { end, drifts: drifts.slice(0, 5), driftCount: drifts.length };
  }, STEP_PX);
  const result = await Promise.race([sweep, new Promise((resolve) => setTimeout(() => resolve(null), 120_000))]);
  const label = reducedMotion === 'reduce' ? 'animations réduites' : 'animations';
  check(result !== null, `${label} : le balayage de la liste se termine`);
  if (result !== null) {
    check(result.end > 0, `${label} : la liste défile (${result.end} px)`);
    check(result.driftCount === 0, `${label} : chaque saut reste là où on l'a posé (${result.driftCount} dérive(s) ${JSON.stringify(result.drifts)})`);
  }

  const responsive = await Promise.race([
    page.evaluate(() => {
      const row = document.querySelector('#contenu [data-row] a[href^="/c/"]:not([aria-hidden])');
      const last = [...document.querySelectorAll('#contenu [data-row] a[href^="/c/"]:not([aria-hidden])')].at(-1);
      document.getElementById('contenu').scrollTop = 0;
      (last ?? row)?.focus();
      return new Promise((resolve) => requestAnimationFrame(() => resolve(document.activeElement === (last ?? row))));
    }),
    new Promise((resolve) => setTimeout(() => resolve(null), FROZEN_AFTER_MS)),
  ]);
  check(responsive === true, `${label} : le focus d'une rangée hors champ rend la main (${responsive === null ? 'page figée' : responsive})`);
  await context.close();
}

await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`\n  ${failures.length} constat(s) en défaut :`);
  reportFailures({ gate: 'check-list-window-reduced-motion', failures, bullet: '·' });
  process.exit(1);
}
console.log('\n  check-list-window-reduced-motion : VERT.');
process.exit(0);
