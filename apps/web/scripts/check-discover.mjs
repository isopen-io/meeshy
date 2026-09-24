#!/usr/bin/env node
/**
 * DÉCOUVRIR DES PERSONNES SE LIT, SE MANIPULE ET S'ATTEINT (#6363, #6321).
 *
 * Les témoins `bun test` du lot prouvent les LOIS : la projection des charges
 * (aucune présence ne passe), les trois paniers, l'ordre de résolution d'une
 * relation, les gestes optimistes avec retour arrière et leur idempotence, ce
 * que chaque ligne annonce. Aucun ne traverse le CÂBLAGE ni la FEUILLE DE STYLE
 * — un disque flottant sur l'onglet « Demandes », une capsule illisible en
 * sombre, un compte d'onglet qui ne baisse qu'au retour du réseau, une
 * recherche qui ne voit pas la demande qu'on vient d'envoyer les laissent tous
 * verts. Ce gate les mesure dans un navigateur réel, sur le `dist` construit
 * (source fixtures : trois demandes reçues, une envoyée, un contact, un bloqué),
 * dans les DEUX schémas et aux deux gabarits de la charte (390 × 844, 320 × 568) :
 *
 *  1. `/discover` rend la découverte — plus l'écran d'attente — sous le titre
 *     « Découvrir », trois onglets dans l'ordre d'iOS, « Découvrir » choisi ;
 *  2. AU REPOS, chaque contrôle et chaque texte visible retombe sur lui-même à
 *     son centre (`elementFromPoint`) — aucun disque flottant n'en vole un — et
 *     chaque contrôle fait au moins 44 de haut ;
 *  2 bis. le tablist des onglets répond aux flèches, Début et Fin (#6422) —
 *     ArrowRight/ArrowLeft déplacent le focus ET la sélection, et un seul
 *     onglet reste dans l'ordre de tabulation ;
 *  3. la recherche rend chaque relation par SON geste (Accepter/Refuser, En
 *     attente, Contact, Bloqué, Ajouter), et « Ajouter » passe « En attente » au
 *     geste, en moins de 300 ms ;
 *  4. l'onglet « Demandes » porte le compte des reçues et l'annonce ; refuser et
 *     accepter retirent la ligne ET font baisser le compte au geste ; la personne
 *     acceptée devient « Contact » dans la recherche (une seule source) ;
 *  5. « Envoyées » (`?demandes=sent`) montre la demande envoyée à l'étape 3, et
 *     « Annuler » la retire ;
 *  6. « Bloqués » : « Débloquer » ouvre une confirmation ; « Annuler » la ferme
 *     sans rien changer, confirmer retire la personne et dessine l'état vide ;
 *  7. inviter par e-mail refuse une adresse invalide sous le champ, puis confirme
 *     l'envoi ;
 *  8. chaque texte tient AA dans les deux schémas — capsules et pastille
 *     d'onglet comprises ;
 *  9. AUCUN point de présence n'est peint, dans aucun état ;
 * 10. hors ligne, les demandes restent lisibles et le disent ; la pastille de
 *     synchronisation ne recouvre aucun onglet du barreau (#6401) ; aucune
 *     erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { contrastOf } from './lib/contrast.mjs';
import { syncPillOverlap } from './lib/sync-pill-clearance.mjs';
import { reachAtRest, resumeExclusions } from './lib/reach-at-rest.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
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
const INSTANT_MS = 300;

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const textOf = (page, selector) => page.$eval(selector, (el) => (el.textContent ?? '').trim()).catch(() => null);
const attrOf = (page, selector, name) => page.getAttribute(selector, name).catch(() => null);
const ids = (page, selector, attribute) => page.$$eval(selector, (els, a) => els.map((el) => el.getAttribute(a)), attribute);
const presenceDots = (page) => page.$$eval('[data-presence]', (els) => els.length);

/**
 * LE RELEVÉ AU REPOS vit dans `lib/reach-at-rest.mjs`, SITE UNIQUE depuis #7040.
 *
 * Ce fichier en portait une copie, comme six autres gates. Toutes ouvraient sur
 * un `visible()` qui RENVOYAIT UN TABLEAU VIDE pour un élément dont le centre
 * sortait du viewport : un contrôle hors cadre ne cassait rien, n'apparaissait
 * nulle part, et le gate restait vert avec un contrôle de moins. Un tel élément
 * est désormais MESURÉ et rendu `ok: false` — et ce qui est légitimement hors
 * cadre (écrêté par un conteneur, déclaré `inert`/`aria-hidden`) s'écarte sous
 * une raison ÉCRITE, comptée par `resumeExclusions()`.
 */

const expectReach = (label, where, rest, minimum) => {
  const blocked = rest.controls.filter((c) => !c.ok);
  const stolen = rest.texts.filter((t) => !t.ok);
  const small = rest.controls.filter((c) => c.hauteur < TAP_FLOOR);
  check(rest.controls.length >= minimum, `${label} : ${where} — au moins ${minimum} contrôles mesurés au repos (${rest.controls.length}, ${resumeExclusions(rest)})`);
  check(blocked.length === 0, `${label} : ${where} — aucun contrôle volé à son centre — ${JSON.stringify(blocked)}`);
  check(rest.texts.length >= 1 && stolen.length === 0, `${label} : ${where} — aucun texte volé à son centre (${rest.texts.length}) — ${JSON.stringify(stolen)}`);
  check(small.length === 0, `${label} : ${where} — chaque contrôle fait au moins ${TAP_FLOOR} de haut — ${JSON.stringify(small)}`);
};

/** Tape une recherche et attend que les résultats portent `userId`. */
const searchFor = async (page, query, userId) => {
  await page.fill('[data-discover-search]', query);
  return page.waitForSelector(`[data-person="${userId}"]`, { timeout: 3000 }).then(() => true, () => false);
};

const relationshipOf = (page, userId) => attrOf(page, `[data-person="${userId}"]`, 'data-relationship');

const DISCOVER_RUNG = '[role="menuitem"][href="/discover"]';

/** Ouvre l'échelle, lit le barreau « Découvrir » une fois la cascade jouée (#6321), puis la referme. */
const discoverRung = async (page) => {
  await page.click('[data-floating-menu]');
  await page.waitForSelector(DISCOVER_RUNG);
  /* La cascade des barreaux : 320 ms plus 40 ms par rang. */
  await page.waitForTimeout(700);
  const state = await page.evaluate((selector) => {
    const rung = document.querySelector(selector);
    const badge = rung?.querySelector('[data-badge-pose="rung"]') ?? null;
    const r = rung?.getBoundingClientRect();
    const hit = r === undefined ? null : document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      count: badge?.getAttribute('data-unread') ?? null,
      text: badge?.textContent ?? null,
      label: rung?.getAttribute('aria-label') ?? null,
      reachable: hit !== null && rung !== null && (hit === rung || rung.contains(hit)),
    };
  }, DISCOVER_RUNG);
  const ink = state.count === null ? null : await contrastOf(page, `${DISCOVER_RUNG} [data-badge-pose="rung"]`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('[role="menu"]') === null);
  return { ...state, ink };
};

const within = (page, predicate, arg, ms) =>
  page.waitForFunction(predicate, arg, { timeout: ms, polling: 16 }).then(() => true, () => false);

/**
 * UN DOUBLE TAP RÉEL (#6417) — deux clics au MÊME point, à 120 ms. Un geste
 * optimiste REMPLACE ce qu'il touche : le second clic tombe sur la ligne qui
 * remonte ou le bouton qui a pris la place. `page.dblclick` n'attrape rien, il
 * enchaîne ses deux clics avant le rendu. La porte (`tap-gate.ts`) retient
 * 350 ms ; `TAP_SETTLE_MS` laisse passer la fenêtre avant le geste VOULU suivant.
 */
const TAP_SETTLE_MS = 400;
const doubleTap = async (page, selector) => {
  const point = await page.$eval(selector, (el) => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(120);
  await page.mouse.click(point.x, point.y);
};

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

      // ------------------------------------------------ 1. la découverte, et plus l'écran d'attente
      await page.goto(`${BASE}/discover`, { waitUntil: 'load' });
      await page.waitForSelector('[data-discover-tab]');
      const menus = await page.waitForSelector('.floating-menus', { timeout: 8000 }).then(() => true, () => false);
      await page.waitForSelector('[data-discover-tab-count]');
      await page.waitForTimeout(300);
      check(menus, `${label} : les disques flottants sont posés — l'atteignabilité se mesure contre eux`);
      check((await page.$('text=Cet écran arrive bientôt.')) === null, `${label} : l'écran d'attente a disparu`);
      check((await textOf(page, 'header h1')) === 'Découvrir', `${label} : le titre de l'écran`);
      const tabs = await ids(page, '[data-discover-tab]', 'data-discover-tab');
      check(JSON.stringify(tabs) === JSON.stringify(['discover', 'requests', 'blocked']), `${label} : trois onglets dans l'ordre d'iOS (${JSON.stringify(tabs)})`);
      check((await attrOf(page, '[data-discover-tab="discover"]', 'aria-selected')) === 'true', `${label} : « Découvrir » est l'onglet du premier rendu`);
      check((await presenceDots(page)) === 0, `${label} : aucun point de présence au premier rendu`);
      await capture(page, `decouvrir-${slug}`);

      // ------------------------------------------------ 1 bis. le barreau « Découvrir » porte les demandes reçues (#6321)
      const rungAtStart = await discoverRung(page);
      check(
        rungAtStart.count === '3' && rungAtStart.text === '3' && rungAtStart.label === 'Découvrir, 3 demandes reçues',
        `${label} : le barreau « Découvrir » porte « 3 » et l'annonce (${JSON.stringify(rungAtStart)})`,
      );
      check(rungAtStart.reachable, `${label} : la pastille ne vole pas le centre du barreau`);
      check(rungAtStart.ink !== null && rungAtStart.ink >= WCAG_AA, `${label} : le chiffre du barreau « Découvrir » tient AA (${rungAtStart.ink})`);

      // ------------------------------------------------ 2. atteignabilité au repos
      expectReach(
        label,
        'Découvrir',
        await reachAtRest(page, {
          controls: 'header a, [data-discover-tab], [data-discover-invite-email], [data-discover-invite-send], [data-discover-search]',
          texts: 'header h1, [data-discover-tab-title], [data-discover-invite] label',
        }),
        6,
      );

      // ------------------------------------------------ 2 bis. les flèches du tablist (#6422)
      await page.focus('[data-discover-tab="discover"]');
      await page.keyboard.press('ArrowRight');
      const afterRight = await page.evaluate(() => document.activeElement?.getAttribute('data-discover-tab') ?? null);
      check(afterRight === 'requests', `${label} : ArrowRight avance le focus sur « Demandes » (${afterRight})`);
      check((await attrOf(page, '[data-discover-tab="requests"]', 'aria-selected')) === 'true', `${label} : ArrowRight sélectionne l'onglet, pas seulement son focus`);
      await page.keyboard.press('End');
      const afterEnd = await page.evaluate(() => document.activeElement?.getAttribute('data-discover-tab') ?? null);
      check(afterEnd === 'blocked', `${label} : End va au dernier onglet (${afterEnd})`);
      await page.keyboard.press('Home');
      const afterHome = await page.evaluate(() => document.activeElement?.getAttribute('data-discover-tab') ?? null);
      check(afterHome === 'discover', `${label} : Home revient au premier onglet (${afterHome})`);
      const tabIndices = await page.$$eval('[data-discover-tab]', (els) => els.map((el) => el.tabIndex));
      check(JSON.stringify(tabIndices) === JSON.stringify([0, -1, -1]), `${label} : un seul onglet — le sélectionné — reste dans l'ordre de tabulation (${JSON.stringify(tabIndices)})`);

      // ------------------------------------------------ 3. la recherche rend chaque relation par son geste
      const relations = {};
      for (const [query, id] of [
        ['amina', 'u-amina'],
        ['chloé', 'u-chloe'],
        ['bruno', 'u-bruno'],
        ['yann', 'u-yann'],
        ['léa', 'u-lea'],
      ]) {
        relations[id] = (await searchFor(page, query, id)) ? await relationshipOf(page, id) : null;
      }
      check(
        JSON.stringify(relations) === JSON.stringify({ 'u-amina': 'pendingReceived', 'u-chloe': 'pendingSent', 'u-bruno': 'friend', 'u-yann': 'blocked', 'u-lea': 'none' }),
        `${label} : chaque relation a SON geste dans la recherche — ${JSON.stringify(relations)}`,
      );
      check((await attrOf(page, '[data-person="u-lea"] [data-connection="none"]', 'aria-label')) === 'Ajouter Léa Martin', `${label} : « Ajouter » nomme la personne`);
      check((await presenceDots(page)) === 0, `${label} : la recherche ne peint aucun point de présence`);
      const addInk = await contrastOf(page, '[data-person="u-lea"] [data-connection="none"] span');
      await doubleTap(page, '[data-person="u-lea"] [data-connection="none"]');
      const addedInstantly = await within(page, () => document.querySelector('[data-person="u-lea"]')?.getAttribute('data-relationship') === 'pendingSent', null, INSTANT_MS);
      check(addedInstantly, `${label} : « Ajouter » passe « En attente » au geste (< ${INSTANT_MS} ms)`);
      await page.waitForTimeout(TAP_SETTLE_MS);
      check((await relationshipOf(page, 'u-lea')) === 'pendingSent', `${label} : le second tap d'un double tap n'annule pas la demande qu'il vient d'envoyer (#6417)`);
      await searchFor(page, 'bruno', 'u-bruno');
      const friendInk = await contrastOf(page, '[data-person="u-bruno"] [data-connection="friend"]');
      await searchFor(page, 'yann', 'u-yann');
      const blockedInk = await contrastOf(page, '[data-person="u-yann"] [data-connection="blocked"]');
      await capture(page, `decouvrir-recherche-${slug}`);

      // ------------------------------------------------ 7. inviter par e-mail
      await page.fill('[data-discover-invite-email]', 'pas-une-adresse');
      await page.click('[data-discover-invite-send]');
      check((await page.waitForSelector('[data-discover-invite-feedback="invalid"][role="alert"]', { timeout: 2000 }).then(() => true, () => false)), `${label} : une adresse invalide est refusée sous le champ`);
      await page.fill('[data-discover-invite-email]', 'ada@example.org');
      await page.click('[data-discover-invite-send]');
      check((await page.waitForSelector('[data-discover-invite-feedback="sent"]', { timeout: 3000 }).then(() => true, () => false)), `${label} : l'invitation part et le dit`);
      const inviteInk = await contrastOf(page, '[data-discover-invite-feedback="sent"]');

      // ------------------------------------------------ 4. « Demandes » : le compte, et les gestes au tap
      check((await attrOf(page, '[data-discover-tab="requests"]', 'aria-label')) === 'Demandes, 3 reçues', `${label} : l'onglet « Demandes » annonce ses trois reçues`);
      const tabBadgeInk = await contrastOf(page, '[data-discover-tab-count]');
      await page.click('[data-discover-tab="requests"]');
      await page.waitForSelector('[data-request-list="received"]');
      check(new URL(page.url()).search === '?onglet=requests', `${label} : l'onglet vit dans l'adresse (${new URL(page.url()).search})`);
      const received = await ids(page, '[data-request-list="received"] [data-request]', 'data-request');
      check(JSON.stringify(received) === JSON.stringify(['fx-fr-amina', 'fx-fr-kwame', 'fx-fr-fatou']), `${label} : les trois demandes reçues, dans l'ordre servi (${JSON.stringify(received)})`);
      await page.waitForTimeout(200);
      expectReach(
        label,
        'Demandes',
        await reachAtRest(page, {
          controls: 'header a, [data-discover-tab], [data-request-filter], #contenu [data-request] button',
          texts: 'header h1, [data-request] [data-person-name], [data-request] [data-request-message]',
        }),
        8,
      );
      const inks = {
        'onglet actif': await contrastOf(page, '[data-discover-tab="requests"] [data-discover-tab-title]'),
        'onglet libre': await contrastOf(page, '[data-discover-tab="blocked"] [data-discover-tab-title]'),
        'pastille d’onglet': tabBadgeInk,
        'filtre choisi': await contrastOf(page, '[data-request-filter="received"] span'),
        'filtre libre': await contrastOf(page, '[data-request-filter="sent"] span'),
        nom: await contrastOf(page, '[data-request="fx-fr-amina"] [data-person-name]'),
        identifiant: await contrastOf(page, '[data-request="fx-fr-amina"] [data-person-handle]'),
        message: await contrastOf(page, '[data-request="fx-fr-amina"] [data-request-message]'),
        heure: await contrastOf(page, '[data-request="fx-fr-amina"] time'),
        'Ajouter': addInk,
        Contact: friendInk,
        'Bloqué': blockedInk,
        invitation: inviteInk,
      };
      await capture(page, `decouvrir-demandes-${slug}`);

      await doubleTap(page, '[data-request="fx-fr-kwame"] [data-request-reject]');
      const rejected = await within(
        page,
        () => document.querySelector('[data-request="fx-fr-kwame"]') === null && document.querySelector('[data-discover-tab-count]')?.getAttribute('data-discover-tab-count') === '2',
        null,
        INSTANT_MS,
      );
      check(rejected, `${label} : refuser retire la ligne ET fait baisser le compte à 2 au geste (< ${INSTANT_MS} ms)`);
      await page.waitForTimeout(TAP_SETTLE_MS);
      const afterDoubleTap = await ids(page, '[data-request-list="received"] [data-request]', 'data-request');
      check(
        JSON.stringify(afterDoubleTap) === JSON.stringify(['fx-fr-amina', 'fx-fr-fatou']),
        `${label} : le second tap d'un double tap ne refuse pas la demande qui remonte sous le doigt (${JSON.stringify(afterDoubleTap)})`,
      );
      await page.click('[data-request="fx-fr-amina"] [data-request-accept]');
      const acceptedTap = await within(
        page,
        () => document.querySelector('[data-request="fx-fr-amina"]') === null && document.querySelector('[data-discover-tab-count]')?.getAttribute('data-discover-tab-count') === '1',
        null,
        INSTANT_MS,
      );
      check(acceptedTap, `${label} : accepter retire la ligne ET fait baisser le compte à 1 au geste (< ${INSTANT_MS} ms)`);
      const rungAfter = await discoverRung(page);
      check(
        rungAfter.count === '1' && rungAfter.label === 'Découvrir, 1 demande reçue',
        `${label} : le barreau « Découvrir » a suivi les deux gestes — « 1 » (${JSON.stringify(rungAfter)})`,
      );
      await page.waitForSelector('[data-discover-announce]:not(:empty)', { timeout: 2000 }).catch(() => null);
      check(((await textOf(page, '[data-discover-announce]')) ?? '').length > 0, `${label} : le geste s'annonce (« ${await textOf(page, '[data-discover-announce]')} »)`);

      // ------------------------------------------------ 5. « Envoyées »
      await page.click('[data-request-filter="sent"]');
      await page.waitForSelector('[data-request-list="sent"]');
      check(new URL(page.url()).searchParams.get('demandes') === 'sent', `${label} : le filtre vit dans l'adresse (${new URL(page.url()).search})`);
      const sent = await ids(page, '[data-request-list="sent"] [data-request]', 'data-request');
      check(sent.includes('fx-fr-chloe') && sent.some((id) => id !== null && id.includes('u-lea')), `${label} : « Envoyées » porte Chloé et la demande envoyée à Léa depuis la recherche (${JSON.stringify(sent)})`);
      const cancelInk = await contrastOf(page, '[data-request="fx-fr-chloe"] [data-request-cancel] span');
      const pendingInk = await contrastOf(page, '[data-request="fx-fr-chloe"] [data-connection="pendingSent"]');
      await page.click('[data-request="fx-fr-chloe"] [data-request-cancel]');
      check(await within(page, () => document.querySelector('[data-request="fx-fr-chloe"]') === null, null, INSTANT_MS), `${label} : « Annuler » retire la demande envoyée au geste`);

      // ------------------------------------------------ 4 bis. une seule source : Amina est désormais un contact
      await page.click('[data-discover-tab="discover"]');
      const amina = (await searchFor(page, 'amina', 'u-amina')) ? await relationshipOf(page, 'u-amina') : null;
      check(amina === 'friend', `${label} : la personne acceptée est « Contact » dans la recherche (${amina})`);

      // ------------------------------------------------ 6. « Bloqués »
      await page.click('[data-discover-tab="blocked"]');
      await page.waitForSelector('[data-blocked="u-yann"]');
      const unblockInk = await contrastOf(page, '[data-blocked="u-yann"] [data-unblock] span');
      await page.click('[data-blocked="u-yann"] [data-unblock]');
      const dialogOpen = await page.waitForSelector('dialog[data-unblock-confirm][open]', { timeout: 2000 }).then(() => true, () => false);
      check(dialogOpen, `${label} : « Débloquer » ouvre une confirmation modale`);
      await capture(page, `decouvrir-debloquer-${slug}`);
      await page.click('[data-unblock-cancel]');
      await page.waitForSelector('dialog[data-unblock-confirm]', { state: 'detached', timeout: 2000 }).catch(() => null);
      check((await page.$('[data-blocked="u-yann"]')) !== null, `${label} : « Annuler » ferme la confirmation sans débloquer`);
      await page.click('[data-blocked="u-yann"] [data-unblock]');
      await page.click('[data-unblock-confirm-action]');
      check(await within(page, () => document.querySelector('[data-blocked="u-yann"]') === null, null, INSTANT_MS), `${label} : confirmer retire la personne au geste`);
      check((await page.waitForSelector('[data-discover-empty="blocked"]', { timeout: 2000 }).then(() => true, () => false)), `${label} : la liste vide se dessine`);
      const emptyInk = await contrastOf(page, '[data-discover-empty="blocked"] p');

      // ------------------------------------------------ 8. contraste AA
      const allInks = { ...inks, 'En attente': pendingInk, Annuler: cancelInk, 'Débloquer': unblockInk, 'état vide': emptyInk };
      const faibles = Object.entries(allInks).filter(([, ratio]) => ratio === null || ratio < WCAG_AA);
      check(faibles.length === 0, `${label} : chaque texte de la découverte tient AA — ${JSON.stringify(allInks)}`);

      // ------------------------------------------------ 10. hors ligne
      await page.click('[data-discover-tab="requests"]');
      await page.waitForSelector('[data-request-list="received"]');
      await context.setOffline(true);
      await page.waitForSelector('[data-discover-offline]');
      check((await ids(page, '[data-request-list="received"] [data-request]', 'data-request')).length === 1, `${label} : hors ligne, les demandes restent lisibles et le disent`);
      await page.click('[data-request="fx-fr-fatou"] [data-request-reject]');
      await page.waitForTimeout(150);
      check((await page.$('[data-request="fx-fr-fatou"]')) !== null, `${label} : hors ligne, un geste ne retire rien — rien ne part`);

      // -------------------------------- 10 bis. la pastille ne recouvre pas le barreau (#6401)
      await page.waitForSelector('.sync-pill');
      const discoverOverlap = await syncPillOverlap(page, ['[data-discover-tab]']);
      check(discoverOverlap.pill !== null, `${label} : hors ligne, la pastille de synchronisation est posée`);
      check(
        discoverOverlap.covers.length === 0,
        `${label} : hors ligne, la pastille ne recouvre aucun onglet du barreau — ${JSON.stringify(discoverOverlap.covers)}`,
      );

      await capture(page, `decouvrir-hors-ligne-${slug}`);
      await context.setOffline(false);

      check((await presenceDots(page)) === 0, `${label} : aucun point de présence, dans aucun état`);
      check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
      await context.close();

      // ------------------------------------------------ 11. hors ligne à cache FROID (#6419)
      /* La coupure telle que l'application la VOIT (`navigator.onLine`,
         événement `offline`), comme une coque qui garde ses fichiers : le
         chunk se charge, la requête des bloqués est MISE EN PAUSE. */
      const cold = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      const coldPage = await cold.newPage();
      coldPage.setDefaultTimeout(10_000);
      const coldErrors = [];
      coldPage.on('pageerror', (error) => coldErrors.push(error.message));
      await coldPage.goto(`${BASE}/`, { waitUntil: 'load' });
      await coldPage.waitForSelector('[data-floating-menu]');
      const setNetwork = (online) =>
        coldPage.evaluate((value) => {
          Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => value });
          window.dispatchEvent(new Event(value ? 'online' : 'offline'));
        }, online);
      await setNetwork(false);
      await coldPage.click('[data-floating-menu]');
      await coldPage.click(DISCOVER_RUNG);
      await coldPage.waitForSelector('[data-discover-tab="blocked"]');
      await coldPage.click('[data-discover-tab="blocked"]');
      const saysOffline = await coldPage.waitForSelector('[data-discover-blocked] [data-discover-offline]', { timeout: 3000 }).then(() => true, () => false);
      const coldState = await coldPage.evaluate(() => ({
        squelette: document.querySelector('[data-discover-skeleton]') !== null,
        occupe: document.getElementById('contenu')?.getAttribute('aria-busy') ?? null,
      }));
      check(saysOffline && !coldState.squelette && coldState.occupe === null, `${label} : à cache froid hors ligne, « Bloqués » dit la coupure — ni squelette, ni aria-busy (${JSON.stringify(coldState)})`);
      const coldCopy = (await coldPage.textContent('[data-discover-blocked] [data-discover-offline]').catch(() => null)) ?? '';
      check(
        coldCopy.includes('La liste se chargera dès le retour du réseau.') && !coldCopy.includes('dernier chargement'),
        `${label} : à cache froid, l'annonce ne promet aucune liste déjà chargée (« ${coldCopy} »)`,
      );
      await capture(coldPage, `decouvrir-hors-ligne-froid-${slug}`);
      await setNetwork(true);
      const resumed = await coldPage.waitForSelector('[data-blocked="u-yann"]', { timeout: 5000 }).then(() => true, () => false);
      check(resumed, `${label} : au retour du réseau, les bloqués se chargent seuls`);
      check(coldErrors.length === 0, `${label} : aucune erreur de page à cache froid — ${JSON.stringify(coldErrors)}`);
      await cold.close();
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
console.log('\n  La découverte de personnes se lit, se manipule, s’atteint et tient AA.\n');
