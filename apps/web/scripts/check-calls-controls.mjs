#!/usr/bin/env node
/**
 * UNE CHOSE À LA FOIS — LES CONTRÔLES D'UN APPEL EN COURS DANS UN NAVIGATEUR
 * RÉEL (#8433, #8438, #8439, #8437, #8550, #8575, #8576, #8577, #8578).
 *
 * Les témoins `bun test` prouvent les règles (la machine d'état de la couche,
 * `lib/calls/call-screen-layer.ts` ; la vignette, `lib/calls/call-self-tile.ts`)
 * et chaque bouton avec des doublures. Aucun ne prouve que, dans Chromium, sur
 * le `dist` construit, un appui part bien sur le fil de la passerelle, qu'un
 * DOIGT fait défiler les rangées, ni qu'un PINCEMENT à deux doigts change la
 * taille de ma vignette. Ce gate le mesure avec le pair qui décroche
 * (`fixtures-call-peer.ts`), en clair et en sombre (390 × 844) puis au doigt
 * (320 × 568, écran tactile émulé, gestes envoyés par CDP) :
 *
 *  1. un appel vocal se connecte ; le `(…)` sort DEUX rangées titrées, au-
 *     dessus de la ligne de base, dans le cadre de la pilule ; chacune défile
 *     à l'horizontale sur une seule ligne, SANS accroche obligatoire (#8575 :
 *     elle ramenait à zéro tout débord plus petit qu'un bouton) ; la rangée de
 *     l'appel porte « Ajouter », « Réagir » et « Journal » (44 px, sans verre) ;
 *  2. « Réagir » : la palette REMPLACE les rangées (#8578), avec ‹ Retour et
 *     ✕ Fermer ; 🎉 part (`call:reaction`) et monte aussitôt ; la réaction du
 *     pair monte sous son nom ; sous `prefers-reduced-motion`, elle s'efface
 *     sur place ; ‹ rend les rangées et le focus à « Réagir » ; Échap ferme
 *     tout (repos) et rend le focus au `(…)`, sans réduire l'appel ;
 *  3. « Enregistrer » demande « Audio seul » ou « Audio et vidéo », à la place
 *     des rangées ;
 *  4. « Ajouter » ouvre la liste, à la place des rangées : le pair dans
 *     l'appel, Bruno (contact accepté) à inviter ; « Inviter » part
 *     (`call:invite-participant`) et Bruno sonne AUSSITÔT ; l'appel passe en
 *     grille ;
 *  5. sur la tuile du pair, le menu de modération : « Couper le micro » part
 *     (`call:mute-participant`) ; « Retirer de l'appel » demande confirmation,
 *     Annuler ne retire personne ;
 *  6. le pair coupe mon micro : il est coupé, et « Nadia Benali a coupé votre
 *     micro » s'affiche ; je peux le rouvrir ;
 *  7. aucun verre dans un verre, aucune erreur de page ;
 *  8. en vidéo : ma vignette en coin est à ×2, SANS capsule de zoom (#8576) ; un toucher
 *     sur la scène efface l'en-tête et la pilule, un second les rend ; rien
 *     ne s'efface tout seul, pas même un panneau ouvert (#8988) ; « Capturer » suit « Enregistrer » ; les
 *     commandes de MA caméra (Caméra · Effets · Écran et le cran du zoom,
 *     #8441, 44 px) sont une rangée
 *     en bas de ma vignette, et le (…) ne les double pas (#8626) ; toucher ma
 *     vignette met MON image en plein écran : la rangée monte en haut au
 *     centre, sous l'en-tête, la vignette du pair descend sous elle, la
 *     capsule du zoom se pose sur le bord ; un toucher les efface avec le
 *     reste ; « Effets » de la rangée entre dans le MODE : en-tête, pilule et
 *     rangée partent, le carrousel se centre en bas ; ✕ en sort ;
 *  9. au DOIGT (320 × 568) : sans geste, rien ne s'efface (#8988) ; un
 *     toucher sur la scène range les commandes, le suivant les rend — même
 *     posé là où était `(…)`, qui, rangé, n'agit pas ; un glissé fait défiler
 *     CHAQUE rangée débordante sans rien ranger (#8736), et les carrousels
 *     des deux modes (`scrollLeft` mesuré) ; un pincement à
 *     deux doigts sur ma vignette la passe à ×3, un pincement serré à ×1 ; la
 *     taille est retenue pour l'appel.
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

/* Une caméra qui OFFRE le zoom (Chrome sur Android) : la capsule n'apparaît qu'en plein écran. */
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

/** Un panneau : dans le cadre de la pilule, et SEUL — les rangées sont parties (#8578). */
const replacesRows = (page, selector) =>
  page.evaluate((target) => {
    const panel = document.querySelector(target);
    const pill = panel?.closest('[data-call-control-pill]');
    if (panel == null || pill == null) return false;
    const a = panel.getBoundingClientRect();
    const b = pill.getBoundingClientRect();
    return a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1 && document.querySelector('[data-call-row]') === null;
  }, selector);

const panelFrame = async (page, label) => {
  const back = await sizes(page, '[data-panel-back]');
  const close = await sizes(page, '[data-panel-close]');
  check(back.length === 1 && close.length === 1 && [...back, ...close].every((button) => button.w >= TAP_FLOOR && button.h >= TAP_FLOOR), `${label} : ‹ Retour et ✕ Fermer, ${TAP_FLOOR} au moins`);
};

const focused = (page, selector) => page.evaluate((target) => document.activeElement?.matches(target) === true, selector);

const openActions = async (page) => {
  await appears(page, '[data-call-chrome="shown"]');
  const more = page.locator('[data-call-more]');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  await appears(page, '[data-call-actions]');
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

const startVideo = async (page) => {
  if (!(await startConnectedCall(page))) return false;
  await openActions(page);
  await page.click('button[aria-label="Activer la caméra"]');
  return appears(page, '[data-call-self-tile]');
};

/** Visible = rendu, et ni lui ni un ancêtre n'est transparent ou invisible. */
const visibility = (page, selectors) =>
  page.evaluate((list) =>
    list.map((selector) => {
      const element = document.querySelector(selector);
      if (element === null) return [selector, 'absent'];
      const chain = [];
      for (let node = element; node !== null; node = node.parentElement) chain.push(node);
      const hidden = chain.some((node) => {
        const style = getComputedStyle(node);
        return style.opacity === '0' || style.visibility === 'hidden';
      });
      return [selector, hidden ? 'effacé' : 'visible'];
    }),
  selectors);

/** Attend que chaque sélecteur soit effacé (opacité 0 atteinte, transition finie) — ou rende l'état lu. */
const fadedAll = async (page, selectors) => {
  const done = await until(
    page,
    (list) =>
      list.every((selector) => {
        const element = document.querySelector(selector);
        if (element === null) return false;
        for (let node = element; node !== null; node = node.parentElement) if (getComputedStyle(node).opacity === '0') return true;
        return false;
      }),
    selectors,
    2000,
  );
  return { done, seen: await visibility(page, selectors) };
};

/** Le focus rendu par une fermeture se pose après le rendu : on l'attend avant de toucher la scène. */
const focusSettled = (page, selector) => until(page, (target) => document.activeElement?.matches(target) === true, selector, 2000);

const tapStage = async (page, shown) => {
  const { width, height } = page.viewportSize();
  await page.mouse.click(width * 0.3, height * 0.55);
  return appears(page, `[data-call-chrome="${shown ? 'shown' : 'hidden'}"]`, 2000);
};

/* ------------------------------------------------ les gestes au doigt (CDP) */

const touch = (cdp, type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, id) => ({ x: point.x, y: point.y, id, radiusX: 4, radiusY: 4, force: 1 })) });

/** Un doigt glisse de `from` à `to`, en `steps` mouvements. */
const drag = async (cdp, from, to, steps = 14) => {
  await touch(cdp, 'touchStart', [from]);
  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    await touch(cdp, 'touchMove', [{ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }]);
  }
  await touch(cdp, 'touchEnd', []);
};

/** Deux doigts, écartés de `fromGap` à `toGap` autour de `center`. */
const pinch = async (cdp, center, fromGap, toGap, steps = 12) => {
  const at = (gap) => [
    { x: center.x - gap / 2, y: center.y },
    { x: center.x + gap / 2, y: center.y },
  ];
  await touch(cdp, 'touchStart', at(fromGap));
  for (let step = 1; step <= steps; step += 1) await touch(cdp, 'touchMove', at(fromGap + ((toGap - fromGap) * step) / steps));
  await touch(cdp, 'touchEnd', []);
};

/**
 * Glisse chaque piste qui déborde, de droite à gauche, et rend son `scrollLeft` avant/après.
 *
 * Le glissé ne dépasse pas ce que la piste peut défiler (#8619) : un doigt qui
 * tire au-delà du bout lance l'élasticité de Chromium sur macOS, et la fin de
 * cette animation TERMINE le défilement alors en cours — celui de la piste
 * suivante, glissée une seconde plus tard (mesuré : `ClearCurrentlyScrollingNode`
 * en plein glissé, 7 glissés sur 10 perdus après la rangée de 54 px tirée de
 * 296 px, 0 sur 10 sans elle). Chaque invariant ne dépend ainsi que de sa piste.
 */
const dragEach = async (page, cdp, selector) => {
  const count = await page.locator(selector).count();
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const track = page.locator(selector).nth(index);
    const box = await track.boundingBox();
    const room = await track.evaluate((element) => element.scrollWidth - element.clientWidth);
    if (box === null || room <= 1) {
      results.push({ index, room, moved: null });
      continue;
    }
    await track.evaluate((element) => void (element.scrollLeft = 0));
    const y = box.y + box.height / 2;
    const start = box.x + box.width - 12;
    const span = Math.min(box.width - 24, room * 0.8);
    await drag(cdp, { x: start, y }, { x: start - span, y });
    const moved = await track
      .evaluate((element) => new Promise((resolve) => {
        const started = performance.now();
        const read = () => (element.scrollLeft > 4 || performance.now() - started > 1500 ? resolve(Math.round(element.scrollLeft)) : requestAnimationFrame(read));
        read();
      }))
      .catch(() => 0);
    results.push({ index, room: Math.round(room), moved });
  }
  return results;
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
      check((await page.getAttribute('[data-call-screen]', 'data-call-layer')) === 'menu', `${label} : le (…) passe l'écran au menu`);
      const rows = await rowsOf(page);
      check(JSON.stringify(rows.map((row) => row.side)) === JSON.stringify(['mine', 'call']) && rows.every((row) => row.title.length > 0), `${label} : deux rangées titrées, « ${rows.map((row) => row.title).join(' » puis « ')} »`);
      check(rows.every((row) => row.role === 'toolbar' && row.overflowX === 'auto' && !row.snap.includes('mandatory') && row.wrap === 'nowrap' && row.oneLine), `${label} : chaque rangée défile à l'horizontale, sur une seule ligne, sans accroche obligatoire (${JSON.stringify(rows.map((row) => [row.overflowX, row.snap, row.wrap, row.oneLine]))})`);
      check(rows.every((row) => row.above && row.inside), `${label} : elles s'empilent au-dessus de la ligne de base, dans le cadre de la pilule`);
      const actions = await sizes(page, '[data-call-row="call"] [data-call-control="invite"], [data-call-row="call"] [data-call-control="react"], [data-call-row="call"] [data-call-control="journal"]');
      check(actions.length === 3, `${label} : la rangée de l'appel porte « Ajouter », « Réagir » et « Journal »`);
      check((await page.$('[data-call-control="capture"]')) === null, `${label} : en audio, pas de « Capturer »`);
      check(actions.every((button) => button.w >= TAP_FLOOR && button.h >= TAP_FLOOR && !button.glass), `${label} : ils font ${TAP_FLOOR} et n'ont pas de verre à eux`);
      await capture(page, `controles-actions-${slug}`);

      // ------------------------------------------------ 2. réagir
      await page.click('[data-call-control="react"]');
      check(await appears(page, '[data-call-react-panel]'), `${label} : « Réagir » ouvre la palette`);
      check((await page.getAttribute('[data-call-screen]', 'data-call-layer')) === 'panel', `${label} : l'écran passe au panneau`);
      check(await replacesRows(page, '[data-call-react-panel]'), `${label} : la palette REMPLACE les rangées, dans le cadre de la pilule`);
      await panelFrame(page, label);
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
      await page.click('[data-panel-back]');
      check(await gone(page, '[data-call-react-panel]'), `${label} : ‹ ferme la palette`);
      check(await appears(page, '[data-call-row="call"]'), `${label} : ‹ rend les rangées`);
      check(await until(page, () => document.activeElement?.getAttribute('data-call-control') === 'react'), `${label} : le focus revient à « Réagir »`);
      await page.click('[data-call-control="react"]');
      await appears(page, '[data-call-react-panel]');
      await page.focus('[data-call-react="👍"]');
      await page.keyboard.press('Escape');
      check(await gone(page, '[data-call-react-panel]'), `${label} : Échap ferme la palette`);
      check((await page.getAttribute('[data-call-screen]', 'data-call-layer')) === 'idle' && (await page.$('[data-call-row]')) === null, `${label} : Échap ferme TOUT — l'écran revient au repos`);
      check(await until(page, () => document.activeElement?.hasAttribute('data-call-more') === true), `${label} : le focus revient au (…)`);
      check((await page.$('[data-call-screen="connected"]')) !== null, `${label} : sans réduire l'appel`);

      // ------------------------------------------------ 3. enregistrer
      await openActions(page);
      await page.click('[data-call-record]');
      check(await appears(page, '[data-call-record-choice]'), `${label} : « Enregistrer » demande ce qu'on enregistre`);
      check(await replacesRows(page, '[data-call-record-choice]'), `${label} : à la place des rangées, dans le cadre de la pilule`);
      const kinds = await page.$$eval('[data-call-record-kind]', (buttons) => buttons.map((button) => [button.getAttribute('data-call-record-kind'), button.hasAttribute('disabled')]));
      check(JSON.stringify(kinds) === JSON.stringify([['audio', false], ['video', false]]), `${label} : « Audio seul » et « Audio et vidéo » (${JSON.stringify(kinds)})`);
      await capture(page, `controles-enregistrement-${slug}`);
      await page.keyboard.press('Escape');
      check(await gone(page, '[data-call-record-choice]'), `${label} : Échap ferme le choix`);
      check((await page.$('[data-call-screen="connected"]')) !== null, `${label} : Échap ferme le choix sans réduire l'appel`);

      // ------------------------------------------------ 4. ajouter
      await openActions(page);
      await page.click('[data-call-control="invite"]');
      check(await appears(page, '[data-call-people-sheet]'), `${label} : « Ajouter » ouvre la liste des participants`);
      check(await replacesRows(page, '[data-call-people-sheet]'), `${label} : à la place des rangées, dans le cadre de la pilule`);
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

  // ------------------------------------------------ 8. en vidéo : la vignette, le toucher, mon image en plein écran
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', locale: 'fr-FR', permissions: ['camera', 'microphone'] });
    await context.addInitScript(ARM_PEER_AND_ZOOM);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      check(await startVideo(page), 'vidéo : l’appel se connecte, la caméra s’allume, ma vignette apparaît');
      check((await page.getAttribute('[data-call-corner]', 'data-call-self-tile')) === '2', 'vidéo : ma vignette est à ×2 par défaut');
      const corner = await page.locator('[data-call-corner]').boundingBox();
      check(corner !== null && Math.round(corner.width) === 112 && Math.round(corner.height) === 160, `vidéo : ×2 mesure 112 × 160 (${corner && [Math.round(corner.width), Math.round(corner.height)]})`);
      check((await page.$('[data-call-zoom]')) === null, 'vidéo : aucune capsule de zoom sur la vignette en coin');
      const tileRows = await page.$eval('[data-call-corner-frame]', (frame) => {
        const tile = frame.querySelector('[data-call-corner]')?.getBoundingClientRect();
        const read = (group) => {
          const row = frame.querySelector(`[data-call-self-row="${group}"] [data-call-self-controls="tile"]`);
          if (row === null || tile === undefined) return null;
          const box = row.getBoundingClientRect();
          const buttons = [...row.querySelectorAll('[data-call-self-control]')];
          return {
            orientation: row.getAttribute('aria-orientation'),
            actions: buttons.map((button) => button.getAttribute('data-call-self-control')),
            sizes: buttons.map((button) => Math.round(Math.min(button.getBoundingClientRect().width, button.getBoundingClientRect().height))),
            above: box.bottom <= tile.top,
            below: box.top >= tile.bottom,
            onScreen: box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight,
          };
        };
        return { effects: read('effects'), camera: read('camera') };
      });
      const { effects: aboveRow, camera: belowRow } = tileRows;
      check(aboveRow !== null && belowRow !== null && aboveRow.orientation === 'horizontal' && belowRow.orientation === 'horizontal', `vignette : les commandes de ma caméra sont AUTOUR de ma vignette, en deux rangées (#8747) (${JSON.stringify(tileRows)})`);
      check(aboveRow !== null && JSON.stringify(aboveRow.actions) === JSON.stringify(['effects', 'screen']) && aboveRow.above, `vignette : Effets · Écran au-dessus d’elle (${JSON.stringify(aboveRow)})`);
      check(belowRow !== null && JSON.stringify(belowRow.actions.filter((action) => action !== 'flip')) === JSON.stringify(['camera', 'zoom']) && belowRow.below, `vignette : (Retourner) · Caméra · cran du zoom (#8441) en dessous d’elle (${JSON.stringify(belowRow)})`);
      check([aboveRow, belowRow].every((row) => row !== null && row.sizes.every((size) => size >= TAP_FLOOR) && row.onScreen), `vignette : ${TAP_FLOOR} px chacun, hors de ma vignette, à l’écran (${JSON.stringify(tileRows)})`);
      check((await page.$('[data-call-row="mine"]')) === null && (await page.locator('[data-call-control="camera"]').count()) === 1, 'vignette : le (…) ne double pas les commandes de ma caméra');
      await capture(page, 'controles-vignette-rangee-dark');
      const labels = await page.$$eval('[data-call-row="call"] [data-call-row-scroll] button', (buttons) => buttons.map((button) => button.getAttribute('data-call-control') ?? button.getAttribute('aria-label')));
      const record = labels.findIndex((name) => /Enregistrer/.test(name ?? ''));
      check(record >= 0 && labels[record + 1] === 'capture', `vidéo : « Capturer » suit « Enregistrer » dans la rangée de l’appel (${labels.join(' · ')})`);
      await capture(page, 'controles-rangees-video-dark');

      await page.click('[data-call-control="react"]');
      await appears(page, '[data-call-react-panel]');
      check(!(await appears(page, '[data-call-chrome="hidden"]', 5200)), 'vidéo : rien ne s’efface tout seul, pas même un panneau ouvert (#8988)');
      await page.click('[data-panel-close]');
      check(await gone(page, '[data-call-react-panel]'), 'vidéo : ✕ ferme le panneau');

      await focusSettled(page, '[data-call-more]');
      check(await tapStage(page, false), 'vidéo : un toucher sur la scène efface les commandes');
      const faded = await fadedAll(page, ['[data-call-header]', '[data-call-controls]', '[data-call-self-row="effects"] [data-call-self-controls="tile"]', '[data-call-self-row="camera"] [data-call-self-controls="tile"]']);
      check(faded.done, `vidéo : l’en-tête, la pilule et la rangée de ma vignette s’effacent (${JSON.stringify(faded.seen)})`);
      await capture(page, 'controles-toucher-efface-dark');
      check(await tapStage(page, true), 'vidéo : un second toucher rend tout');
      check(await tapStage(page, false), 'vidéo : un clic sur la scène les range à nouveau');
      check(await until(page, () => !document.querySelector('[data-call-screen]')?.contains(document.activeElement)), 'vidéo : le clic sur la scène, qui n’est pas focalisable, emporte le focus HORS de l’écran d’appel');
      await page.keyboard.press('Shift');
      check(await appears(page, '[data-call-chrome="shown"]', 2000), 'vidéo : rangées, une touche les rend — même pressée hors de l’écran d’appel (#8988)');

      await page.click('[data-call-corner]');
      check(await appears(page, '[data-call-self-controls="top"]'), 'plein écran : toucher ma vignette met mon image en plein écran, ses commandes en haut au centre');
      const top = await page.$eval('[data-call-self-controls="top"]', (element) => {
        const box = element.getBoundingClientRect();
        const header = document.querySelector('[data-call-header]')?.getBoundingClientRect();
        const corner = document.querySelector('[data-call-corner-frame]')?.getBoundingClientRect();
        return {
          role: element.getAttribute('role'),
          orientation: element.getAttribute('aria-orientation'),
          actions: [...element.querySelectorAll('[data-call-self-control]')].map((button) => button.getAttribute('data-call-self-control')),
          sizes: [...element.querySelectorAll('[data-call-self-control]')].map((button) => Math.round(Math.min(button.getBoundingClientRect().width, button.getBoundingClientRect().height))),
          center: box.left + box.width / 2,
          top: box.top,
          belowHeader: header === undefined || box.top >= header.bottom,
          clearOfCorner: corner === undefined || corner.top >= box.bottom,
        };
      });
      const order = top.actions.filter((action) => action !== 'flip');
      check(top.role === 'toolbar' && top.orientation === 'horizontal', `plein écran : une barre d’outils horizontale (${top.role}, ${top.orientation})`);
      check(JSON.stringify(order) === JSON.stringify(['camera', 'effects', 'screen']) && (top.actions[0] === 'flip' || !top.actions.includes('flip')), `plein écran : (Retourner) · Caméra · Effets · Écran (${top.actions.join(' · ')})`);
      check(top.sizes.every((size) => size >= TAP_FLOOR) && Math.abs(top.center - 195) <= 2 && top.top < 160 && top.belowHeader, `plein écran : ${TAP_FLOOR} px chacun, en haut au centre, sous l’en-tête (${JSON.stringify(top)})`);
      check(top.clearOfCorner, 'plein écran : la vignette du pair descend sous la rangée, sans la couvrir');
      check((await page.$('[data-call-self-controls="tile"]')) === null, 'plein écran : la rangée a quitté la vignette (un seul endroit)');
      check(await appears(page, '[data-call-zoom]'), 'plein écran : la capsule du zoom apparaît sur le bord');
      await page.focus('[data-call-self-control="camera"]');
      await page.keyboard.press('ArrowRight');
      check(await focused(page, '[data-call-self-control="effects"]'), 'plein écran : → passe au bouton suivant de la rangée');
      await capture(page, 'controles-plein-ecran-dark');
      check(await tapStage(page, false), 'plein écran : un toucher efface tout');
      const railFaded = await fadedAll(page, ['[data-call-self-controls="top"]', '[data-call-zoom]', '[data-call-header]']);
      check(railFaded.done, `plein écran : la rangée et la capsule s’effacent avec le reste (${JSON.stringify(railFaded.seen)})`);
      check(
        await until(page, () => ['[data-call-self-controls-holder]', '[data-call-self-column]'].every((selector) => document.querySelector(selector) !== null && getComputedStyle(document.querySelector(selector)).visibility === 'hidden'), undefined, 2000),
        'plein écran : rangées d’un toucher, elles ne captent plus le toucher une fois leur fondu fini (invisibles, #8735)',
      );
      check(await tapStage(page, true), 'plein écran : un second toucher les rend');

      await page.click('[data-call-self-control="effects"]');
      check(await appears(page, '[data-call-mode="effects"]'), 'mode : « Effets » de la rangée entre dans le mode Effets');
      check((await page.getAttribute('[data-call-screen]', 'data-call-layer')) === 'mode', 'mode : l’écran passe au mode');
      const modeChrome = await page.evaluate(() => ['[data-call-header]', '[data-call-control-pill]', '[data-call-self-controls]', '[data-call-zoom]'].filter((selector) => document.querySelector(selector) !== null));
      check(modeChrome.length === 0, `mode : en-tête, pilule, rangée de ma caméra et zoom partent (${JSON.stringify(modeChrome)})`);
      const carousel = await page.$eval('[data-call-mode-carousel]', (element) => {
        const box = element.getBoundingClientRect();
        return { center: box.left + box.width / 2, bottom: box.bottom };
      });
      check(Math.abs(carousel.center - 195) <= 2 && carousel.bottom > 844 * 0.6, `mode : le carrousel se centre en bas (${Math.round(carousel.center)}, ${Math.round(carousel.bottom)})`);
      check(!(await appears(page, '[data-call-chrome="hidden"]', 5200)), 'mode : rien ne s’efface tout seul pendant qu’on choisit');
      await page.click('[data-call-mode-quit]');
      check(await gone(page, '[data-call-mode]'), 'mode : ✕ en sort');
      check((await page.getAttribute('[data-call-screen]', 'data-call-layer')) === 'idle' && (await page.$('[data-call-control-pill]')) !== null, 'mode : l’écran revient au repos, la pilule revient');
      check(await until(page, () => document.activeElement?.hasAttribute('data-call-more') === true), 'mode : le focus revient au (…)');

      await openActions(page);
      await page.click('[data-call-screen] button[aria-label="Raccrocher"]');
    } catch (error) {
      failures.push(`vidéo : ${error instanceof Error ? error.message : String(error)} — erreurs de page ${JSON.stringify(errors)}`);
    }
    check(errors.length === 0, `vidéo : aucune erreur de page — ${JSON.stringify(errors)}`);
    await context.close();
  }

  // ------------------------------------------------ 9. au doigt : glisser les rangées, pincer la vignette
  {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, colorScheme: 'dark', locale: 'fr-FR', permissions: ['camera', 'microphone'] });
    await context.addInitScript(ARM_PEER);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    try {
      check(await startVideo(page), 'doigt : l’appel vidéo se connecte à 320 × 568');
      check(!(await appears(page, '[data-call-chrome="hidden"]', 5200)), 'doigt : sans geste, rien ne s’efface — les commandes restent (#8988)');
      await page.tap('[data-call-more]');
      check(await until(page, () => document.querySelector('[data-call-screen]')?.getAttribute('data-call-layer') === 'idle'), 'doigt : (…) replie les actions');
      const more = await page.locator('[data-call-more]').boundingBox();
      const { width: narrow, height: tall } = page.viewportSize();
      await page.touchscreen.tap(narrow * 0.3, tall * 0.45);
      check(await appears(page, '[data-call-chrome="hidden"]', 2000), 'doigt : un toucher sur la scène range les commandes (#8988)');
      check(await until(page, () => getComputedStyle(document.querySelector('[data-call-controls]')).visibility === 'hidden', undefined, 2000), 'doigt : rangées, les commandes ne captent plus le doigt une fois leur fondu fini (#8735)');
      await page.touchscreen.tap(more.x + more.width / 2, more.y + more.height / 2);
      const layerAfter = await page.getAttribute('[data-call-screen]', 'data-call-layer');
      check((await appears(page, '[data-call-chrome="shown"]', 2000)) && layerAfter === 'idle', `doigt : le toucher suivant les rend — même posé là où était (…), qui, rangé, n’agit pas (#8988 — ${layerAfter})`);
      await openActions(page);
      const rows = await dragEach(page, cdp, '[data-call-row] [data-call-row-scroll]');
      const overflowing = rows.filter((row) => row.moved !== null);
      check(overflowing.length >= 1, `doigt : au moins une rangée déborde à 320 (${JSON.stringify(rows)})`);
      check(overflowing.every((row) => row.moved > 4), `doigt : un glissé fait défiler CHAQUE rangée qui déborde (${JSON.stringify(rows)})`);
      check((await page.getAttribute('[data-call-screen]', 'data-call-chrome')) === 'shown', 'doigt : faire défiler les rangées ne les range pas (#8736)');
      await capture(page, 'controles-doigt-rangees-dark-320x568');

      await page.click('[data-call-control="effects"]');
      check(await appears(page, '[data-call-mode="effects"]'), 'doigt : le mode Effets s’ouvre');
      const effects = await dragEach(page, cdp, '[data-call-mode-carousel] [data-call-row-scroll]');
      check(effects.length === 1 && effects[0].moved !== null && effects[0].moved > 4, `doigt : un glissé fait défiler le carrousel des effets (${JSON.stringify(effects)})`);
      await page.click('[data-call-mode-quit]');
      await gone(page, '[data-call-mode]');

      await openActions(page);
      await page.click('[data-call-control="capture"]');
      check(await appears(page, '[data-call-mode="montage"]'), 'doigt : le mode Montage s’ouvre');
      const montage = await dragEach(page, cdp, '[data-call-mode-carousel] [data-call-row-scroll]');
      check(montage.length === 1 && montage[0].moved !== null && montage[0].moved > 4, `doigt : un glissé fait défiler le carrousel des montages (${JSON.stringify(montage)})`);
      await page.click('[data-call-mode-quit]');
      await gone(page, '[data-call-mode]');

      const tile = async () => ({ scale: await page.getAttribute('[data-call-corner]', 'data-call-self-tile'), box: await page.locator('[data-call-corner]').boundingBox() });
      const before = await tile();
      check(before.scale === '2', `pincer : ma vignette part de ×2 (${before.scale})`);
      const centerOf = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
      await pinch(cdp, centerOf(before.box), 30, 110);
      check(await until(page, () => document.querySelector('[data-call-corner]')?.getAttribute('data-call-self-tile') === '3'), 'pincer : deux doigts qui s’écartent la passent à ×3');
      const grown = await until(page, () => {
        const box = document.querySelector('[data-call-corner]')?.getBoundingClientRect();
        return box !== undefined && Math.round(box.width) === 144 && Math.round(box.height) === 206;
      });
      const bigger = await tile();
      check(grown, `pincer : ×3 tient dans 320 × 568 — 144 × 206 (${bigger.box && [Math.round(bigger.box.width), Math.round(bigger.box.height)]})`);
      check((await page.getAttribute('[data-call-screen]', 'data-call-layer')) !== 'mode' && (await page.$('[data-call-self-controls="top"]')) === null, 'pincer : un pincement n’est pas un toucher — mon image reste en coin');
      check((await page.textContent('[data-call-self-tile-status]'))?.length > 0, `pincer : la taille se dit au lecteur d’écran (« ${await page.textContent('[data-call-self-tile-status]')} »)`);
      await capture(page, 'controles-vignette-x3-dark-320x568');
      await page.click('[data-call-corner]');
      await appears(page, '[data-call-self-controls="top"]');
      await page.click('[data-call-corner]');
      check(await until(page, () => document.querySelector('[data-call-corner]')?.getAttribute('data-call-self-tile') === '3'), 'pincer : la taille est retenue pour l’appel (plein écran puis retour)');
      const again = await tile();
      await pinch(cdp, centerOf(again.box), 140, 30);
      check(await until(page, () => document.querySelector('[data-call-corner]')?.getAttribute('data-call-self-tile') === '1'), 'pincer : deux doigts qui se serrent fort la passent à ×1');

      await openActions(page);
      await page.click('[data-call-screen] button[aria-label="Raccrocher"]');
    } catch (error) {
      failures.push(`doigt : ${error instanceof Error ? error.message : String(error)} — erreurs de page ${JSON.stringify(errors)}`);
    }
    check(errors.length === 0, `doigt : aucune erreur de page — ${JSON.stringify(errors)}`);
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
console.log('\n  Pendant un appel, une chose à la fois : les rangées défilent au doigt, un panneau les remplace, un mode libère l’écran ; ma vignette se pince et porte les commandes de ma caméra, qui montent en haut au centre quand mon image remplit l’écran ; on ajoute, on modère, on réagit, on choisit ce qu’on enregistre.\n');
