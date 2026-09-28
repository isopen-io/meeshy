#!/usr/bin/env node
/**
 * AJOUTER, MODÉRER, RÉAGIR, CHOISIR CE QU'ON ENREGISTRE — LES CONTRÔLES D'UN
 * APPEL EN COURS DANS UN NAVIGATEUR RÉEL (#8433, #8438, #8439, #8437, #8550).
 *
 * Les témoins `bun test` prouvent les règles et chaque bouton avec des
 * doublures. Aucun ne prouve que, dans Chromium, sur le `dist` construit, un
 * appui part bien sur le fil de la passerelle et que ce qui revient se voit.
 * Ce gate le mesure avec le pair qui décroche (`fixtures-call-peer.ts`), qui
 * enregistre chaque contrôle reçu et sait couper mon micro ou réagir, en
 * clair et en sombre (390 × 844) :
 *
 *  1. un appel vocal se connecte ; sous le `(…)`, les familles s'EMPILENT au-
 *     dessus de la ligne de base, dans le cadre de la pilule, une rangée
 *     titrée par famille qui DÉFILE À L'HORIZONTALE (overflow-x, accroche,
 *     jamais de retour à la ligne) ; la rangée de l'appel porte « Ajouter » et
 *     « Réagir » (44 px, sans verre à eux) ;
 *  2. « Réagir » ouvre la palette des huit DANS le cadre de la pilule, au-
 *     dessus des rangées — ni voile, ni feuille ; 🎉 part (`call:reaction`) et
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
 *  7. aucun verre dans un verre, aucune erreur de page ;
 *  8. en vidéo (caméra qui offre le zoom), un toucher sur la scène efface
 *     TOUT : l'en-tête, la pilule, la capsule du zoom ; un second les rend.
 *     « Capturer » a rejoint la rangée de l'appel.
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

/* Une caméra qui OFFRE le zoom (Chrome sur Android) : la capsule se montre, et le toucher doit l'effacer. */
const ARM_PEER_AND_ZOOM = () => {
  localStorage.setItem('meeshy.fixtures.callPeer', '1');
  const capabilities = MediaStreamTrack.prototype.getCapabilities;
  const settings = MediaStreamTrack.prototype.getSettings;
  MediaStreamTrack.prototype.getCapabilities = function getCapabilities() {
    const base = capabilities.call(this);
    return this.kind === 'video' ? { ...base, zoom: { min: 1, max: 4, step: 0.1 } } : base;
  };
  MediaStreamTrack.prototype.getSettings = function getSettings() {
    const base = settings.call(this);
    return this.kind === 'video' ? { ...base, zoom: 1 } : base;
  };
};

const controlsSent = (page) => page.evaluate(() => (window.__meeshyFixtureCallPeer?.controls ?? []).map((control) => ({ event: control.event, payload: control.payload })));

const sizes = (page, selector) =>
  page.$$eval(selector, (elements) => elements.map((element) => ({ w: element.getBoundingClientRect().width, h: element.getBoundingClientRect().height, glass: element.className.includes('glass-call') })));

const nestedGlass = (page) =>
  page.evaluate(() => {
    const GLASS = '.glass-call, .glass-call-prominent';
    return [...document.querySelectorAll(GLASS)].filter((glass) => glass.parentElement?.closest(GLASS) != null).length;
  });

/** Chaque rangée : sa légende, son défilement horizontal, ses boutons sur UNE ligne, au-dessus de la ligne de base. */
const rowsOf = (page) =>
  page.evaluate(() => {
    const more = document.querySelector('[data-call-more]')?.getBoundingClientRect();
    const pill = document.querySelector('[data-call-control-pill]')?.getBoundingClientRect();
    return [...document.querySelectorAll('[data-call-row]')].map((row) => {
      const scroller = row.querySelector('[data-call-row-scroll]');
      const style = scroller === null ? null : getComputedStyle(scroller);
      const box = row.getBoundingClientRect();
      const tops = [...(scroller?.children ?? [])].map((child) => Math.round(child.getBoundingClientRect().top));
      return {
        side: row.getAttribute('data-call-row'),
        title: row.querySelector('[data-call-row-title]')?.textContent ?? '',
        role: scroller?.getAttribute('role'),
        overflowX: style?.overflowX,
        snap: style?.scrollSnapType ?? '',
        wrap: style?.flexWrap,
        oneLine: new Set(tops).size <= 1,
        above: more !== undefined && box.bottom <= more.top + 1,
        inside: pill !== undefined && box.left >= pill.left - 1 && box.right <= pill.right + 1 && box.top >= pill.top - 1,
      };
    });
  });

const insidePill = (page, selector) =>
  page.evaluate((target) => {
    const panel = document.querySelector(target);
    const pill = panel?.closest('[data-call-control-pill]');
    if (panel == null || pill == null) return false;
    const a = panel.getBoundingClientRect();
    const b = pill.getBoundingClientRect();
    const rows = document.querySelector('[data-call-row]')?.getBoundingClientRect();
    return a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1 && (rows === undefined || a.bottom <= rows.top + 1);
  }, selector);

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
      const rows = await rowsOf(page);
      check(JSON.stringify(rows.map((row) => row.side)) === JSON.stringify(['mine', 'call']) && rows.every((row) => row.title.length > 0), `${label} : deux rangées titrées, « ${rows.map((row) => row.title).join(' » puis « ')} »`);
      check(rows.every((row) => row.role === 'toolbar' && row.overflowX === 'auto' && row.snap.includes('x') && row.wrap === 'nowrap' && row.oneLine), `${label} : chaque rangée défile à l'horizontale, accrochée, sur une seule ligne (${JSON.stringify(rows.map((row) => [row.overflowX, row.snap, row.wrap, row.oneLine]))})`);
      check(rows.every((row) => row.above && row.inside), `${label} : elles s'empilent au-dessus de la ligne de base, dans le cadre de la pilule`);
      const actions = await sizes(page, '[data-call-row="call"] [data-call-control="invite"], [data-call-row="call"] [data-call-control="react"]');
      check(actions.length === 2, `${label} : la rangée de l'appel porte « Ajouter » et « Réagir »`);
      check((await page.$('[data-call-control="capture"]')) === null, `${label} : en audio, pas de « Capturer »`);
      check(actions.every((button) => button.w >= TAP_FLOOR && button.h >= TAP_FLOOR && !button.glass), `${label} : ils font ${TAP_FLOOR} et n'ont pas de verre à eux`);
      await capture(page, `controles-actions-${slug}`);

      // ------------------------------------------------ 2. réagir
      await page.click('[data-call-control="react"]');
      check(await appears(page, '[data-call-react-panel]'), `${label} : « Réagir » ouvre la palette`);
      check(await insidePill(page, '[data-call-react-panel]'), `${label} : la palette s'ouvre DANS le cadre de la pilule, au-dessus des rangées`);
      check((await page.$eval('[data-call-react-panel] [data-call-row-scroll]', (row) => getComputedStyle(row).overflowX)) === 'auto', `${label} : ses réactions défilent à l'horizontale`);
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
      check(await insidePill(page, '[data-call-record-choice]'), `${label} : dans le cadre de la pilule`);
      const kinds = await page.$$eval('[data-call-record-kind]', (buttons) => buttons.map((button) => [button.getAttribute('data-call-record-kind'), button.hasAttribute('disabled')]));
      check(JSON.stringify(kinds) === JSON.stringify([['audio', false], ['video', false]]), `${label} : « Audio seul » et « Audio et vidéo » (${JSON.stringify(kinds)})`);
      check((await page.getAttribute('[data-call-record]', 'aria-expanded')) === 'true', `${label} : « Enregistrer » dit que son choix est ouvert`);
      await capture(page, `controles-enregistrement-${slug}`);
      await page.keyboard.press('Escape');
      check(await gone(page, '[data-call-record-choice]'), `${label} : Échap ferme le choix`);

      // ------------------------------------------------ 4. ajouter
      await page.click('[data-call-control="invite"]');
      check(await appears(page, '[data-call-people-sheet]'), `${label} : « Ajouter » ouvre la liste des participants`);
      check(await insidePill(page, '[data-call-people-sheet]'), `${label} : dans le cadre de la pilule`);
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

  // ------------------------------------------------ 8. en vidéo, un toucher efface TOUT
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', locale: 'fr-FR', permissions: ['camera', 'microphone'] });
  await context.addInitScript(ARM_PEER_AND_ZOOM);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    check(await startConnectedCall(page), 'vidéo : l’appel se connecte');
    await openActions(page);
    await page.click('button[aria-label="Activer la caméra"]');
    check(await appears(page, '[data-call-zoom]'), 'vidéo : la caméra s’allume et la capsule du zoom apparaît');
    const labels = await page.$$eval('[data-call-row="call"] [data-call-row-scroll] button', (buttons) => buttons.map((button) => button.getAttribute('data-call-control') ?? button.getAttribute('aria-label')));
    const record = labels.findIndex((name) => /Enregistrer/.test(name ?? ''));
    check(record >= 0 && labels[record + 1] === 'capture', `vidéo : « Capturer » suit « Enregistrer » dans la rangée de l’appel (${labels.join(' · ')})`);
    await capture(page, 'controles-rangees-video-dark');
    const tapStage = async () => {
      const { width, height } = page.viewportSize();
      await page.mouse.click(width * 0.3, height * 0.55);
      await page.waitForTimeout(450);
    };
    await tapStage();
    check(await appears(page, '[data-call-chrome="hidden"]', 2000), 'vidéo : un toucher sur la scène efface les commandes');
    const faded = await page.evaluate(() =>
      ['[data-call-header]', '[data-call-controls]', '[data-call-zoom]'].map((selector) => {
        const element = document.querySelector(selector);
        if (element === null) return [selector, 'absent'];
        const hidden = [element, ...ancestors(element)].some((node) => getComputedStyle(node).opacity === '0');
        return [selector, hidden ? 'effacé' : 'visible'];
        function ancestors(node) {
          const list = [];
          for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) list.push(parent);
          return list;
        }
      }),
    );
    check(faded.every(([, state]) => state === 'effacé'), `vidéo : l’en-tête, la pilule ET la capsule du zoom s’effacent (${JSON.stringify(faded)})`);
    check((await page.$eval('[data-call-zoom]', (zoom) => getComputedStyle(zoom).pointerEvents)) === 'none', 'vidéo : la capsule effacée ne capte plus le toucher');
    await capture(page, 'controles-toucher-efface-dark');
    await tapStage();
    check(await appears(page, '[data-call-chrome="shown"]', 2000), 'vidéo : un second toucher rend tout');
    check((await page.$eval('[data-call-zoom]', (zoom) => getComputedStyle(zoom).opacity)) === '1', 'vidéo : la capsule revient avec le reste');
    await page.click('[data-call-screen] button[aria-label="Raccrocher"]');
  } catch (error) {
    failures.push(`vidéo : ${error instanceof Error ? error.message : String(error)} — erreurs de page ${JSON.stringify(errors)}`);
  }
  check(errors.length === 0, `vidéo : aucune erreur de page — ${JSON.stringify(errors)}`);
  await context.close();
} finally {
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log('\n  Pendant un appel, les options s’empilent en rangées qui défilent, chaque sous-menu s’ouvre dans le cadre, un toucher efface tout ; on ajoute, on modère, on réagit, on choisit ce qu’on enregistre.\n');
