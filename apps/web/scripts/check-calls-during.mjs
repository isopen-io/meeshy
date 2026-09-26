#!/usr/bin/env node
/**
 * CONTINUER À DISCUTER PENDANT L'APPEL (#8046, lot 4 — D5, D9, D10).
 *
 * Les témoins `bun test` du lot prouvent les LOIS : la géométrie de la bulle,
 * le choix d'un périphérique, l'image dans l'image, le remplacement d'une
 * piste. Aucun ne prouve le critère de fin de l'issue — « pendant un appel,
 * on ouvre une autre conversation et on écrit sans couper l'appel » : une
 * couche d'appel qui recouvre le champ d'écriture, une bulle qui disparaît à
 * la navigation, une feuille qui ne se ferme pas au clavier les laissent tous
 * verts. Ce gate les mesure dans un navigateur réel (faux micro et fausse
 * caméra de Chromium), sur le `dist` construit (source fixtures, dont le
 * socket ACCUSE désormais les appels : l'appel reste vivant, il sonne), dans
 * les DEUX schémas et aux deux gabarits (390 × 844, 320 × 568) :
 *
 *  1. un appel vidéo lancé depuis le fil d'une conversation reste VIVANT ;
 *  2. l'en-tête ouvre les périphériques : caméra et micro listés, chaque
 *     choix est un radio de 44 de haut, le focus entre dans la feuille,
 *     Échap la ferme SANS réduire l'appel, et le choix est RETENU sur
 *     l'appareil (`meeshy.call.devices.v1`) ;
 *  3. réduire → la pastille ; « Réduire en bulle » → la bulle, qui porte la
 *     vidéo et trois commandes de 44 ;
 *  4. on revient à la liste, on ouvre une AUTRE conversation : la bulle
 *     survit à la navigation, ne recouvre ni le champ d'écriture ni
 *     « Envoyer », et un message part pendant l'appel ;
 *  5. la bulle se déplace au doigt (clipsée à gauche) et au clavier
 *     (flèche droite), et sa place est retenue ;
 *  6. toucher la bulle rend l'écran d'appel en UN geste ; raccrocher le ferme ;
 *  7. l'image dans l'image, quand le navigateur la sait : le bouton ouvre la
 *     fenêtre (Document PiP) ou l'image d'une vidéo ;
 *  8. aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const TAP_FLOOR = 44;
const DEVICES_KEY = 'meeshy.call.devices.v1';
const BUBBLE_KEY = 'meeshy.call.bubble.v1';
const SENT = 'Je t’écris pendant l’appel';
const WRITE_TO = 'c-deploiement';

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const appears = (page, selector, timeout = 5000) => page.waitForSelector(selector, { timeout }).then(() => true, () => false);
const heights = (page, selector) => page.$$eval(selector, (els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);

/** Le centre de l'élément retombe-t-il sur lui (aucune couche d'appel ne le vole) ? */
const hitsItself = (page, selector) =>
  page
    .$eval(selector, (el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    })
    .catch(() => false);

const browser = await launchChromium({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of [
      [390, 844],
      [320, 568],
    ]) {
      const label = `${scheme === 'light' ? 'clair' : 'sombre'} ${width}×${height}`;
      const slug = `${scheme}-${width}x${height}`;
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR', permissions: ['camera', 'microphone'] });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // ------------------------------------------------ 1. un appel vivant, lancé du fil
      await page.goto(`${BASE}/`, { waitUntil: 'load' });
      await page.waitForSelector('[data-row] a');
      const rows = await page.$$eval('[data-row]', (els) => els.map((el) => el.getAttribute('data-row')));
      const caller = rows.find((id) => id !== WRITE_TO) ?? rows[0];
      await page.click(`[data-row="${caller}"] a`);
      await page.waitForURL(`**/c/${caller}`);
      await page.click('[data-thread-call="menu"]');
      await page.getByRole('menuitem', { name: 'Appel vidéo' }).click();
      const opened = await appears(page, '[data-call-screen="outgoing"]');
      await page.waitForTimeout(800);
      check(opened && (await page.$('[data-call-screen="outgoing"]')) !== null, `${label} : l'appel vidéo lancé reste vivant (il sonne)`);

      // ------------------------------------------------ 2. les périphériques
      const toolH = await heights(page, '[data-call-devices-open], [data-call-pip]');
      check(toolH.length >= 1 && toolH.every((h) => h >= TAP_FLOOR), `${label} : les outils de l'en-tête font au moins ${TAP_FLOOR} (${JSON.stringify(toolH)})`);
      await page.click('[data-call-devices-open]');
      const sheet = await appears(page, '[data-call-devices] [role="dialog"]');
      await page.waitForSelector('[data-call-devices-group="microphone"] [role="radio"]:nth-child(2)', { timeout: 5000 }).catch(() => null);
      const groups = await page.$$eval('[data-call-devices-group]', (els) => els.map((el) => el.getAttribute('data-call-devices-group')));
      check(sheet && groups.includes('camera') && groups.includes('microphone'), `${label} : la feuille liste la caméra et le micro (${JSON.stringify(groups)})`);
      const optionH = await heights(page, '[data-call-device-option]');
      check(optionH.length >= 4 && optionH.every((h) => h >= TAP_FLOOR), `${label} : chaque choix fait au moins ${TAP_FLOOR} (${JSON.stringify(optionH)})`);
      check(await page.evaluate(() => document.querySelector('[data-call-devices]')?.contains(document.activeElement) === true), `${label} : le focus entre dans la feuille`);
      const mic = page.locator('[data-call-devices-group="microphone"] [role="radio"]').nth(1);
      const micId = ((await mic.getAttribute('data-call-device-option')) ?? '').replace(/^microphone:/, '');
      await mic.click();
      const micChecked = await page
        .waitForFunction((id) => document.querySelector(`[data-call-device-option="microphone:${CSS.escape(id)}"]`)?.getAttribute('aria-checked') === 'true', micId, { timeout: 5000 })
        .then(() => true, () => false);
      check(micChecked && (await stored(page, DEVICES_KEY))?.microphone === micId, `${label} : le micro choisi est coché et retenu sur l'appareil`);
      const cam = page.locator('[data-call-devices-group="camera"] [role="radio"]').nth(1);
      const camId = ((await cam.getAttribute('data-call-device-option')) ?? '').replace(/^camera:/, '');
      await cam.click();
      const camKept = await page.waitForFunction((id) => JSON.parse(localStorage.getItem('meeshy.call.devices.v1') ?? '{}').camera === id, camId, { timeout: 5000 }).then(() => true, () => false);
      check(camKept, `${label} : la caméra choisie est retenue`);
      if (groups.includes('speaker')) {
        const speaker = page.locator('[data-call-devices-group="speaker"] [role="radio"]').nth(1);
        const speakerId = ((await speaker.getAttribute('data-call-device-option')) ?? '').replace(/^speaker:/, '');
        await speaker.click();
        const speakerKept = await page.waitForFunction((id) => JSON.parse(localStorage.getItem('meeshy.call.devices.v1') ?? '{}').speaker === id, speakerId, { timeout: 3000 }).then(() => true, () => false);
        check(speakerKept && (await speaker.getAttribute('aria-checked')) === 'true', `${label} : la sortie audio choisie (setSinkId) est cochée et retenue`);
      }
      await capture(page, `peripheriques-${slug}`);
      await page.keyboard.press('Escape');
      const closed = await page.waitForSelector('[data-call-devices]', { state: 'detached', timeout: 3000 }).then(() => true, () => false);
      check(closed && (await page.$('[data-call-screen]')) !== null, `${label} : Échap ferme la feuille sans réduire l'appel`);

      // ------------------------------------------------ 3. pastille puis bulle
      await page.click('[data-call-screen] button[aria-label="Réduire l’appel"]');
      check(await appears(page, '[data-call-pill-bar]'), `${label} : réduire l'appel rend la pastille`);
      const pillH = await heights(page, '[data-call-pill-bar] button');
      check(pillH.every((h) => h >= TAP_FLOOR), `${label} : les commandes de la pastille font au moins ${TAP_FLOOR} (${JSON.stringify(pillH)})`);
      await page.click('[data-call-pill-collapse]');
      check(await appears(page, '[data-call-bubble]'), `${label} : « Réduire en bulle » rend la bulle`);
      check((await page.$('[data-call-bubble] video')) !== null, `${label} : la bulle porte la vidéo`);
      const bubbleH = await heights(page, '[data-call-bubble] [data-call-bubble-control]');
      check(bubbleH.length >= 2 && bubbleH.every((h) => h >= TAP_FLOOR), `${label} : les commandes de la bulle font au moins ${TAP_FLOOR} (${JSON.stringify(bubbleH)})`);

      // ------------------------------------------------ 4. naviguer et écrire sous la bulle
      await page.goBack();
      await page.waitForSelector(`[data-row="${WRITE_TO}"] a`);
      await page.click(`[data-row="${WRITE_TO}"] a`);
      await page.waitForURL(`**/c/${WRITE_TO}`);
      await page.waitForSelector('[data-composer] textarea');
      check((await page.$('[data-call-bubble]')) !== null, `${label} : la bulle survit à la navigation`);
      check(await hitsItself(page, '[data-composer] textarea'), `${label} : la bulle ne recouvre pas le champ d'écriture`);
      await page.fill('[data-composer] textarea', SENT);
      check(await hitsItself(page, '[data-composer] button[aria-label="Envoyer"]'), `${label} : la bulle ne recouvre pas « Envoyer »`);
      await page.click('[data-composer] button[aria-label="Envoyer"]');
      const sent = await page
        .waitForFunction((text) => [...document.querySelectorAll('[data-message]')].some((el) => (el.textContent ?? '').includes(text)), SENT, { timeout: 5000 })
        .then(() => true, () => false);
      check(sent, `${label} : un message part pendant l'appel`);
      check((await page.$('[data-call-bubble]')) !== null, `${label} : l'appel continue après l'envoi`);
      await capture(page, `bulle-fil-${slug}`);

      // ------------------------------------------------ 5. déplacer la bulle
      const box = await page.locator('[data-call-bubble-body]').boundingBox();
      if (box !== null) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(40, box.y + box.height / 2 + 30, { steps: 8 });
        await page.mouse.up();
      }
      const left = await page.waitForSelector('[data-call-bubble="left"]', { timeout: 3000 }).then(() => true, () => false);
      check(left && (await stored(page, BUBBLE_KEY))?.edge === 'left', `${label} : lâchée à gauche, la bulle s'y clipse et y reste`);
      check((await page.$('[data-call-bubble]')) !== null && (await page.$('[data-call-screen]')) === null, `${label} : déplacer la bulle ne rouvre pas l'écran d'appel`);
      await page.focus('[data-call-bubble-body]');
      await page.keyboard.press('ArrowRight');
      check(await appears(page, '[data-call-bubble="right"]', 3000), `${label} : la flèche droite ramène la bulle à droite`);

      // ------------------------------------------------ 6. revenir en un geste, raccrocher
      await page.click('[data-call-bubble-body]');
      check(await appears(page, '[data-call-screen]'), `${label} : toucher la bulle rend l'écran d'appel`);

      // ------------------------------------------------ 7. l'image dans l'image
      const pipButton = await page.$('[data-call-pip]');
      const support = await page.evaluate(() => ('documentPictureInPicture' in window ? 'document' : document.pictureInPictureEnabled ? 'video' : 'none'));
      if (support === 'none') {
        check(pipButton === null, `${label} : sans image dans l'image, aucun bouton ne la promet`);
      } else {
        check(pipButton !== null, `${label} : l'image dans l'image est offerte (${support})`);
        await pipButton?.click();
        const floating = await page
          .waitForFunction(() => (window.documentPictureInPicture?.window ?? null) !== null || document.pictureInPictureElement !== null, null, { timeout: 3000 })
          .then(() => true, () => false);
        check(floating, `${label} : le bouton ouvre l'image dans l'image (${support})`);
        if (support === 'document') {
          const drawn = await page
            .waitForFunction(() => window.documentPictureInPicture?.window?.document.querySelector('[data-call-pip-window] button[aria-label="Raccrocher"]') != null, null, { timeout: 3000 })
            .then(() => true, () => false);
          check(drawn, `${label} : la fenêtre flottante porte l'appel et ses commandes`);
        }
      }

      await page.click('[data-call-screen] button[aria-label="Raccrocher"]');
      if ((await page.$('[data-call-screen]')) !== null) await page.click('[data-call-screen] button[aria-label="Fermer"]').catch(() => undefined);
      const gone = await page.waitForSelector('[data-call-screen]', { state: 'detached', timeout: 8000 }).then(() => true, () => false);
      check(gone && (await page.$('[data-call-bubble]')) === null, `${label} : raccrocher ferme l'appel et la bulle`);
      check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log('\n  Pendant l’appel, on navigue, on écrit, on déplace la bulle et on revient en un geste.\n');
