#!/usr/bin/env node
/**
 * REJOINDRE, RAPPELER, COMPOSER (#6383, #6454, #3586, #6382).
 *
 * Les témoins `bun test` du lot prouvent les LOIS : la fiche projetée depuis
 * une ligne ou une session, le plan d'un lien profond, la classification du
 * pavé, l'appel reprenable, le démarrage vers une personne. Aucun ne traverse
 * le CÂBLAGE : une route qui ne mène nulle part, un pavé dont la recherche ne
 * part jamais, un bandeau qu'un disque recouvre, une pastille « Rejoindre »
 * illisible en sombre les laissent tous verts. Ce gate les mesure dans un
 * navigateur réel, sur le `dist` construit (source fixtures), dans les DEUX
 * schémas et aux deux gabarits de la charte (390 × 844, 320 × 568) :
 *
 *  1. le pavé s'atteint depuis le journal ; au repos il INVITE, ses douze
 *     touches et ses contrôles font au moins 44 de haut ;
 *  2. un NOM trouve Amina ; un NUMÉRO composé au pavé la trouve aussi
 *     (`GET /users/phone/:phone`) ; un numéro inconnu le DIT ;
 *  3. « Appel vocal à Amina » ouvre l'écran d'appel vers elle (A7) ;
 *  4. hors ligne, le pavé le dit au lieu de chercher ;
 *  5. `/call/<id>` d'un appel FINI rend sa fiche (nom, direction, Type, Date,
 *     Durée), sans aucun numéro (D-129), et son rappel ouvre l'écran d'appel ;
 *     un identifiant inconnu se dit introuvable ;
 *  6. `/call/<id>` d'un appel VIVANT ouvre le fil de sa conversation et
 *     l'écran d'appel par-dessus ;
 *  7. un appel vivant côté serveur fait paraître « Reprendre l'appel » (lisible
 *     AA, 44 de haut, non recouvert) et la pastille « Rejoindre » de l'en-tête
 *     du fil ; chacune rejoint l'appel ;
 *  8. chaque texte mesuré tient AA ; aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { contrastOf } from './lib/contrast.mjs';

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
const WCAG_AA = 4.5;
const PHONE = '+221770000001';
const ACTIVE_KEY = 'meeshy.fixtures.active-call';
const LIVE_CALL = 'call-kwame-live';

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const textOf = (page, selector) => page.$eval(selector, (el) => (el.textContent ?? '').trim()).catch(() => null);
const heights = (page, selector) => page.$$eval(selector, (els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));

/** Le centre de l'élément retombe-t-il sur lui (aucun disque ne le vole) ? */
const hitsItself = (page, selector) =>
  page
    .$eval(selector, (el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    })
    .catch(() => false);

/** Ouvre l'écran d'appel, lit son nom, puis raccroche. */
const callScreenFor = async (page) => {
  const opened = await page.waitForSelector('[data-call-screen]', { timeout: 5000 }).then(() => true, () => false);
  const name = opened ? await page.getAttribute('[data-call-screen]', 'aria-label') : null;
  const tap = (label) =>
    page
      .locator(`[data-call-screen] button[aria-label="${label}"]`)
      .first()
      .click({ timeout: 2000 })
      .then(() => true, () => false);
  await tap('Raccrocher');
  if ((await page.$('[data-call-screen]')) !== null) await tap('Fermer');
  const gone = await page.waitForSelector('[data-call-screen]', { state: 'detached', timeout: 8000 }).then(() => true, () => false);
  return { name, gone };
};

const waitStatus = (page, status) =>
  page.waitForSelector(`[data-keypad-status="${status}"]`, { timeout: 3000 }).then(() => true, () => false);

const browser = await launchChromium();
try {
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of [
      [390, 844],
      [320, 568],
    ]) {
      const label = `${scheme === 'light' ? 'clair' : 'sombre'} ${width}×${height}`;
      const slug = `${scheme}-${width}x${height}`;
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // ------------------------------------------------ 1. le pavé, depuis le journal
      await page.goto(`${BASE}/calls`, { waitUntil: 'load' });
      await page.waitForSelector('[data-call]');
      await page.click('[data-calls-keypad]');
      await page.waitForURL('**/calls/keypad');
      check(await waitStatus(page, 'idle'), `${label} : le pavé s'ouvre depuis le journal et invite à composer`);
      check((await textOf(page, 'header h1')) === 'Clavier', `${label} : le titre du pavé`);
      const keys = await heights(page, '[data-keypad-key]');
      check(keys.length === 12 && keys.every((h) => h >= TAP_FLOOR), `${label} : douze touches d'au moins ${TAP_FLOOR} (${JSON.stringify(keys)})`);
      const field = await heights(page, '[data-keypad-input], [data-keypad-back]');
      check(field.every((h) => h >= TAP_FLOOR), `${label} : le champ et le retour font au moins ${TAP_FLOOR} (${JSON.stringify(field)})`);
      const lastKey = await page.$$eval('[data-keypad-key]', (els) => els.at(-1)?.getAttribute('data-keypad-key'));
      check(await hitsItself(page, `[data-keypad-key="${lastKey}"]`), `${label} : la dernière touche n'est recouverte par rien`);
      await capture(page, `pave-${slug}`);

      // ------------------------------------------------ 2. un nom, un numéro, aucun
      await page.fill('[data-keypad-input]', 'Amin');
      const byName = await page.waitForSelector('[data-keypad-result="u-amina"]', { timeout: 3000 }).then(() => true, () => false);
      check(byName, `${label} : un NOM trouve Amina`);
      check((await page.getAttribute('[data-keypad-result="u-amina"] a', 'href')) === '/u/amina.diallo', `${label} : un résultat mène à la fiche de la personne`);
      await page.fill('[data-keypad-input]', '');
      for (const digit of PHONE) await page.click(`[data-keypad-key="${digit}"]`);
      check((await page.inputValue('[data-keypad-input]')) === PHONE, `${label} : le pavé compose le numéro touche par touche`);
      const byPhone = await page.waitForSelector('[data-keypad-result="u-amina"]', { timeout: 3000 }).then(() => true, () => false);
      check(byPhone, `${label} : un NUMÉRO trouve Amina`);
      const inks = {
        nom: await contrastOf(page, '[data-keypad-result="u-amina"] .text-body'),
        pseudo: await contrastOf(page, '[data-keypad-result="u-amina"] .text-caption'),
        saisie: await contrastOf(page, '[data-keypad-input]'),
      };
      const calls = await heights(page, '[data-keypad-call]');
      check(calls.length === 2 && calls.every((h) => h >= TAP_FLOOR), `${label} : les deux boutons d'appel font au moins ${TAP_FLOOR} (${JSON.stringify(calls)})`);
      await capture(page, `pave-numero-${slug}`);
      await page.click('[data-keypad-delete]');
      await page.fill('[data-keypad-input]', '+221999');
      check(await waitStatus(page, 'none'), `${label} : un numéro inconnu se dit « Aucun contact trouvé »`);
      inks['aucun'] = await contrastOf(page, '[data-keypad-status="none"] .text-caption');

      // ------------------------------------------------ 3. appeler un résultat
      await page.fill('[data-keypad-input]', 'Amina');
      await page.waitForSelector('[data-keypad-result="u-amina"]');
      await page.click('[data-keypad-result="u-amina"] [data-keypad-call="audio"]');
      const fromKeypad = await callScreenFor(page);
      check(fromKeypad.name === 'Appel avec Amina Diallo' && fromKeypad.gone, `${label} : « Appel vocal à Amina » ouvre l'écran d'appel vers elle (${JSON.stringify(fromKeypad)})`);

      // ------------------------------------------------ 4. hors ligne
      await context.setOffline(true);
      await page.fill('[data-keypad-input]', 'Fatou');
      check(await waitStatus(page, 'offline'), `${label} : hors ligne, le pavé le dit au lieu de chercher`);
      inks['hors ligne'] = await contrastOf(page, '[data-keypad-status="offline"] .text-caption');
      await context.setOffline(false);

      // ------------------------------------------------ 5. la fiche d'un appel fini
      await page.goto(`${BASE}/call/call-amina-manque`, { waitUntil: 'load' });
      const detail = await page.waitForSelector('[data-call-detail]', { timeout: 5000 }).then(() => true, () => false);
      check(detail && (await textOf(page, '[data-call-detail-name]')) === 'Amina Diallo', `${label} : /call/<id> rend la fiche de l'appel, à froid`);
      check((await page.getAttribute('[data-call-detail-status]', 'data-call-detail-status')) === 'missed', `${label} : la fiche dit « Manqué »`);
      const rows = await page.$$eval('[data-call-detail-row]', (els) => els.map((el) => el.getAttribute('data-call-detail-row')));
      check(['type', 'date'].every((row) => rows.includes(row)), `${label} : Type et Date sont lus (${JSON.stringify(rows)})`);
      const body = (await page.textContent('[data-call-detail]')) ?? '';
      check(!/\+\d{6,}|tel:/.test(body) && (await page.$('[data-call-detail] a[href^="tel:"]')) === null, `${label} : la fiche ne montre aucun numéro (D-129)`);
      inks['fiche nom'] = await contrastOf(page, '[data-call-detail-name]');
      inks['fiche direction'] = await contrastOf(page, '[data-call-detail-status]');
      inks['fiche libellé'] = await contrastOf(page, '[data-call-detail-row="type"] dt');
      inks['fiche valeur'] = await contrastOf(page, '[data-call-detail-row="type"] dd');
      const redial = await heights(page, '[data-call-detail-redial], [data-call-detail-open], [data-call-detail-back]');
      check(redial.every((h) => h >= TAP_FLOOR), `${label} : les contrôles de la fiche font au moins ${TAP_FLOOR} (${JSON.stringify(redial)})`);
      await capture(page, `fiche-appel-${slug}`);
      await page.click('[data-call-detail-redial="video"]');
      const fromDetail = await callScreenFor(page);
      check(fromDetail.name === 'Appel avec Amina Diallo' && fromDetail.gone, `${label} : le rappel de la fiche ouvre l'écran d'appel (${JSON.stringify(fromDetail)})`);
      await page.goto(`${BASE}/call/inconnu`, { waitUntil: 'load' });
      check(
        await page.waitForSelector('[data-call-detail-state="not-found"]', { timeout: 5000 }).then(() => true, () => false),
        `${label} : un appel inconnu se dit introuvable`,
      );

      // ------------------------------------------------ 6. le lien profond d'un appel vivant
      await page.goto(`${BASE}/call/${LIVE_CALL}`, { waitUntil: 'load' });
      const joinedUrl = await page.waitForURL('**/c/c-kwame', { timeout: 5000 }).then(() => true, () => false);
      const joined = await callScreenFor(page);
      check(joinedUrl && joined.name === 'Appel avec Kwame Mensah', `${label} : /call/<vivant> ouvre le fil de Kwame et l'écran d'appel (${JSON.stringify(joined)})`);

      const faibles = Object.entries(inks).filter(([, ratio]) => ratio === null || ratio < WCAG_AA);
      check(faibles.length === 0, `${label} : chaque texte du pavé et de la fiche tient AA — ${JSON.stringify(inks)}`);
      check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
      await context.close();

      // ------------------------------------------------ 7. un appel vivant côté serveur
      const live = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      await live.addInitScript(
        ([key, id]) => {
          try {
            localStorage.setItem(key, id);
          } catch {}
        },
        [ACTIVE_KEY, LIVE_CALL],
      );
      const livePage = await live.newPage();
      livePage.setDefaultTimeout(10_000);
      const liveErrors = [];
      livePage.on('pageerror', (error) => liveErrors.push(error.message));
      await livePage.goto(`${BASE}/`, { waitUntil: 'load' });
      const banner = await livePage.waitForSelector(`[data-call-resume="${LIVE_CALL}"]`, { timeout: 5000 }).then(() => true, () => false);
      check(banner, `${label} : un appel vivant fait paraître « Reprendre l'appel »`);
      check(
        (await livePage.getAttribute('[data-call-resume]', 'aria-label')) === 'Reprendre l’appel avec Kwame Mensah',
        `${label} : le bandeau se nomme avec la personne (${await livePage.getAttribute('[data-call-resume]', 'aria-label').catch(() => null)})`,
      );
      const bannerH = await heights(livePage, '[data-call-resume]');
      check(bannerH.every((h) => h >= TAP_FLOOR) && (await hitsItself(livePage, '[data-call-resume]')), `${label} : le bandeau fait au moins ${TAP_FLOOR} et rien ne le recouvre (${JSON.stringify(bannerH)})`);
      const liveInks = {
        bandeau: await contrastOf(livePage, '[data-call-resume-title]'),
        'bandeau nom': await contrastOf(livePage, '[data-call-resume-name]'),
      };
      await capture(livePage, `reprendre-${slug}`);
      await livePage.click('[data-call-resume]');
      const resumed = await callScreenFor(livePage);
      check(resumed.name === 'Appel avec Kwame Mensah', `${label} : « Reprendre » rejoint l'appel de Kwame (${JSON.stringify(resumed)})`);

      await livePage.goto(`${BASE}/c/c-kwame`, { waitUntil: 'load' });
      const pill = await livePage.waitForSelector('[data-thread-call="join"]', { timeout: 5000 }).then(() => true, () => false);
      check(pill, `${label} : l'en-tête du fil porte « Rejoindre »`);
      check((await livePage.$('[data-call-resume]')) === null, `${label} : dans le fil de l'appel, la bannière se tait et ne recouvre pas la pastille`);
      check((await livePage.getAttribute('[data-thread-call="join"]', 'aria-label')) === 'Rejoindre l’appel en cours', `${label} : la pastille se nomme`);
      const pillH = await heights(livePage, '[data-thread-call="join"]');
      check(pillH.every((h) => h >= TAP_FLOOR), `${label} : la pastille fait au moins ${TAP_FLOOR} (${JSON.stringify(pillH)})`);
      liveInks['pastille'] = await contrastOf(livePage, '[data-thread-call="join"] span');
      await capture(livePage, `rejoindre-fil-${slug}`);
      await livePage.click('[data-thread-call="join"]');
      const fromPill = await callScreenFor(livePage);
      check(fromPill.name === 'Appel avec Kwame Mensah', `${label} : « Rejoindre » rejoint l'appel (${JSON.stringify(fromPill)})`);

      const liveFaibles = Object.entries(liveInks).filter(([, ratio]) => ratio === null || ratio < WCAG_AA);
      check(liveFaibles.length === 0, `${label} : le bandeau et la pastille tiennent AA — ${JSON.stringify(liveInks)}`);
      check(liveErrors.length === 0, `${label} : aucune erreur de page, appel vivant — ${JSON.stringify(liveErrors)}`);
      await live.close();
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
console.log('\n  Le pavé compose, la fiche se lit, l’appel vivant se rejoint et se reprend.\n');
