#!/usr/bin/env node
/**
 * AJOUTER, MODÉRER, RÉAGIR, CHOISIR CE QU'ON ENREGISTRE — LES CONTRÔLES D'UN
 * APPEL EN COURS DANS UN NAVIGATEUR RÉEL (#8433, #8438, #8439, #8437).
 *
 * Les témoins `bun test` prouvent les règles et chaque bouton avec des
 * doublures. Aucun ne prouve que, dans Chromium, sur le `dist` construit, un
 * appui part bien sur le fil de la passerelle et que ce qui revient se voit.
 * Ce gate le mesure avec le pair qui décroche (`fixtures-call-peer.ts`), qui
 * enregistre chaque contrôle reçu et sait couper mon micro ou réagir, en
 * clair et en sombre (390 × 844) :
 *
 *  1. un appel vocal se connecte ; le rail de l'appel porte « Ajouter » et
 *     « Réagir » (44 px, sans verre à eux) ;
 *  2. « Réagir » ouvre la palette des huit ; 🎉 part (`call:reaction`) et
 *     monte aussitôt chez moi ; la réaction du pair monte sous son nom ; sous
 *     `prefers-reduced-motion`, elle s'efface sur place ; Échap ferme et rend
 *     le focus à « Réagir » ;
 *  3. « Enregistrer » demande « Audio seul » ou « Audio et vidéo » ;
 *  4. « Ajouter » ouvre la liste : le pair dans l'appel, Bruno (contact
 *     accepté) à inviter ; « Inviter » part (`call:invite-participant`) et
 *     Bruno sonne AUSSITÔT ; l'appel passe en grille ;
 *  5. sur la tuile du pair, le menu de modération : « Couper le micro » part
 *     (`call:mute-participant`) ; « Retirer de l'appel » demande confirmation,
 *     Annuler ne retire personne ;
 *  6. le pair coupe mon micro : il est coupé, et « Nadia Benali a coupé votre
 *     micro » s'affiche ; je peux le rouvrir ;
 *  7. aucun verre dans un verre, aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette (`controles-*.png`).
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
const PEER_ID = 'u-fixture-call-peer';
const PEER_NAME = 'Nadia Benali';

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const appears = (page, selector, timeout = 8000) => page.waitForSelector(selector, { timeout }).then(() => true, () => false);
const gone = (page, selector, timeout = 4000) => page.waitForSelector(selector, { state: 'detached', timeout }).then(() => true, () => false);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

const ARM_PEER = () => localStorage.setItem('meeshy.fixtures.callPeer', '1');

const controlsSent = (page) => page.evaluate(() => (window.__meeshyFixtureCallPeer?.controls ?? []).map((control) => ({ event: control.event, payload: control.payload })));

const sizes = (page, selector) =>
  page.$$eval(selector, (elements) => elements.map((element) => ({ w: element.getBoundingClientRect().width, h: element.getBoundingClientRect().height, glass: element.className.includes('glass-call') })));

const nestedGlass = (page) =>
  page.evaluate(() => {
    const GLASS = '.glass-call, .glass-call-prominent';
    return [...document.querySelectorAll(GLASS)].filter((glass) => glass.parentElement?.closest(GLASS) != null).length;
  });

const openActions = async (page) => {
  const more = page.locator('[data-call-more]');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
};

const startConnectedCall = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-row] a');
  const first = await page.$eval('[data-row]', (el) => el.getAttribute('data-row'));
  await page.click(`[data-row="${first}"] a`);
  await page.waitForURL(`**/c/${first}`);
  await page.click('[data-thread-call="menu"]');
  await page.getByRole('menuitem', { name: 'Appel vocal' }).click();
  if (!(await appears(page, '[data-call-screen="connected"]', 15_000))) return false;
  return appears(page, `[data-call-screen] [aria-label*="${PEER_NAME}"], [data-call-status]`);
};

const browser = await launchChromium({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const scheme of ['light', 'dark']) {
    const label = scheme === 'light' ? 'clair' : 'sombre';
    const slug = scheme;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, locale: 'fr-FR', permissions: ['camera', 'microphone'] });
    await context.addInitScript(ARM_PEER);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    try {
      // ------------------------------------------------ 1. les actions de l'appel
      check(await startConnectedCall(page), `${label} : l'appel se connecte`);
      await until(page, () => window.__meeshyFixtureCallPeer?.callId() != null);
      await openActions(page);
      const actions = await sizes(page, '[data-call-rail="call"] [data-call-control="invite"], [data-call-rail="call"] [data-call-control="react"]');
      check(actions.length === 2, `${label} : le rail de l'appel porte « Ajouter » et « Réagir »`);
      check(actions.every((button) => button.w >= TAP_FLOOR && button.h >= TAP_FLOOR && !button.glass), `${label} : ils font ${TAP_FLOOR} et n'ont pas de verre à eux`);
      await capture(page, `controles-actions-${slug}`);

      // ------------------------------------------------ 2. réagir
      await page.click('[data-call-control="react"]');
      check(await appears(page, '[data-call-react-panel]'), `${label} : « Réagir » ouvre la palette`);
      const emojis = await sizes(page, '[data-call-react]');
      check(emojis.length === 8 && emojis.every((button) => button.w >= TAP_FLOOR && button.h >= TAP_FLOOR), `${label} : huit réactions de ${TAP_FLOOR} au moins (${emojis.length})`);
      check((await nestedGlass(page)) === 0, `${label} : aucun verre posé dans un verre, palette ouverte`);
      await page.click('[data-call-react="🎉"]');
      check(await appears(page, '[data-call-reaction="🎉"]', 1000), `${label} : ma réaction monte aussitôt`);
      check(await until(page, () => (window.__meeshyFixtureCallPeer?.controls ?? []).some((control) => control.event === 'call:reaction' && control.payload?.emoji === '🎉')), `${label} : 🎉 part sur le fil (call:reaction)`);
      await page.evaluate(() => window.__meeshyFixtureCallPeer?.react('❤️'));
      check(await appears(page, '[data-call-reaction="❤️"]'), `${label} : la réaction du pair monte`);
      check((await page.textContent('[data-call-reaction="❤️"]'))?.includes(PEER_NAME) === true, `${label} : sous le nom de qui l'a envoyée`);
      check((await page.textContent('[data-call-reactions] [role="status"]')) === `${PEER_NAME} a réagi ❤️`, `${label} : et se dit au lecteur d'écran`);
      await until(page, () => (document.querySelector('[data-call-reaction="❤️"]')?.getAnimations()[0]?.currentTime ?? 0) >= 400);
      await capture(page, `controles-reaction-${slug}`);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => window.__meeshyFixtureCallPeer?.react('👏'));
      await appears(page, '[data-call-reaction="👏"]');
      const animation = await page.$eval('[data-call-reaction="👏"]', (element) => getComputedStyle(element).animationName);
      check(animation === 'call-reaction-fade', `${label} : sous prefers-reduced-motion, elle s'efface sur place (${animation})`);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      check(await gone(page, '[data-call-reaction="🎉"]', 4000), `${label} : elle s'efface en 2,5 s`);
      await page.focus('[data-call-react="👍"]');
      await page.keyboard.press('Escape');
      check(await gone(page, '[data-call-react-panel]'), `${label} : Échap ferme la palette`);
      check(await page.evaluate(() => document.activeElement?.getAttribute('data-call-control') === 'react'), `${label} : le focus revient à « Réagir »`);
      check((await page.$('[data-call-screen="connected"]')) !== null, `${label} : sans réduire l'appel`);

      // ------------------------------------------------ 3. enregistrer
      await page.click('[data-call-record]');
      check(await appears(page, '[data-call-record-choice]'), `${label} : « Enregistrer » demande ce qu'on enregistre`);
      const kinds = await page.$$eval('[data-call-record-kind]', (buttons) => buttons.map((button) => [button.getAttribute('data-call-record-kind'), button.hasAttribute('disabled')]));
      check(JSON.stringify(kinds) === JSON.stringify([['audio', false], ['video', false]]), `${label} : « Audio seul » et « Audio et vidéo » (${JSON.stringify(kinds)})`);
      check((await page.getAttribute('[data-call-record]', 'aria-expanded')) === 'true', `${label} : « Enregistrer » dit que son choix est ouvert`);
      await capture(page, `controles-enregistrement-${slug}`);
      await page.keyboard.press('Escape');
      check(await gone(page, '[data-call-record-choice]'), `${label} : Échap ferme le choix`);

      // ------------------------------------------------ 4. ajouter
      await page.click('[data-call-control="invite"]');
      check(await appears(page, '[data-call-people-sheet]'), `${label} : « Ajouter » ouvre la liste des participants`);
      check(await appears(page, `[data-call-person="${PEER_ID}"]`), `${label} : le pair y est, dans l'appel`);
      check(await appears(page, '[data-call-invitable="u-bruno"]'), `${label} : Bruno, contact accepté, est proposé`);
      check((await page.$(`[data-call-invitable="${PEER_ID}"]`)) === null, `${label} : personne déjà dans l'appel n'est proposé`);
      await page.fill('[data-call-people-search]', 'bru');
      check((await page.$$('[data-call-invitable]')).length === 1, `${label} : la recherche filtre`);
      await capture(page, `controles-ajouter-${slug}`);
      await page.click('[data-call-invite="u-bruno"]');
      check(await appears(page, '[data-call-person="u-bruno"][data-call-person-ringing]', 1000), `${label} : Bruno sonne aussitôt`);
      check(await until(page, () => (window.__meeshyFixtureCallPeer?.controls ?? []).some((control) => control.event === 'call:invite-participant' && control.payload?.userId === 'u-bruno')), `${label} : l'invitation part (call:invite-participant)`);
      await page.keyboard.press('Escape');
      check(await gone(page, '[data-call-people-sheet]'), `${label} : Échap ferme la liste`);
      check(await appears(page, '[data-call-tile="u-bruno"][data-call-ringing]'), `${label} : l'appel passe en grille, Bruno y sonne`);

      // ------------------------------------------------ 5. modérer
      check(await appears(page, `[data-call-moderate="${PEER_ID}"]`), `${label} : la tuile du pair porte le menu de modération`);
      check((await page.$('[data-call-moderate="u-bruno"]')) === null, `${label} : une invitée qui sonne n'a pas de menu`);
      const trigger = (await sizes(page, `[data-call-moderate="${PEER_ID}"]`))[0];
      check(trigger !== undefined && trigger.w >= TAP_FLOOR && trigger.h >= TAP_FLOOR, `${label} : le menu s'ouvre d'un bouton de ${TAP_FLOOR}`);
      await page.click(`[data-call-moderate="${PEER_ID}"]`);
      check(await appears(page, '[data-call-moderation-menu]'), `${label} : le menu s'ouvre`);
      await capture(page, `controles-moderation-${slug}`);
      await page.click(`[data-call-mute="${PEER_ID}"]`);
      check(await until(page, (id) => (window.__meeshyFixtureCallPeer?.controls ?? []).some((control) => control.event === 'call:mute-participant' && control.payload?.targetUserId === id), PEER_ID), `${label} : « Couper le micro » part (call:mute-participant)`);
      await page.click(`[data-call-moderate="${PEER_ID}"]`);
      check((await page.textContent('[data-call-moderation-menu]'))?.includes('Micro coupé') === true, `${label} : son micro se dit coupé`);
      await page.click(`[data-call-remove="${PEER_ID}"]`);
      check(await appears(page, '[role="alertdialog"]'), `${label} : « Retirer de l'appel » demande confirmation`);
      await capture(page, `controles-retirer-${slug}`);
      await page.click('[data-call-remove-cancel]');
      check(await gone(page, '[role="alertdialog"]'), `${label} : Annuler ferme la confirmation`);
      check((await page.$(`[data-call-tile="${PEER_ID}"]`)) !== null, `${label} : et ne retire personne`);

      // ------------------------------------------------ 6. le pair coupe mon micro
      await openActions(page);
      check((await page.$('[data-call-screen] button[aria-label="Couper le micro"]')) !== null, `${label} : mon micro est ouvert`);
      await page.evaluate(() => window.__meeshyFixtureCallPeer?.muteMe());
      check(await appears(page, '[data-call-screen] button[aria-label="Activer le micro"]'), `${label} : le pair coupe mon micro`);
      check((await page.textContent('[data-call-control-notice="muted-by"]').catch(() => null)) === `${PEER_NAME} a coupé votre micro`, `${label} : « ${PEER_NAME} a coupé votre micro »`);
      await page.click('[data-call-screen] button[aria-label="Activer le micro"]');
      check(await appears(page, '[data-call-screen] button[aria-label="Couper le micro"]'), `${label} : je peux le rouvrir`);

      await page.click('[data-call-screen] button[aria-label="Raccrocher"]');
    } catch (error) {
      failures.push(`${label} : ${error instanceof Error ? error.message : String(error)} — erreurs de page ${JSON.stringify(errors)}`);
    }
    check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
    await context.close();
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
console.log('\n  Pendant un appel, on ajoute quelqu’un qui sonne aussitôt, on modère, on réagit, et on choisit ce qu’on enregistre.\n');
