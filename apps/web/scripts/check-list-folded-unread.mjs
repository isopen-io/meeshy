#!/usr/bin/env node
/**
 * VÉRIFIE QU'UNE SECTION REPLIÉE DIT CE QU'ELLE CACHE (#8694).
 *
 * Les témoins `bun test` du lot prouvent la LOI (`foldedSectionUnread`) et le
 * RENDU du sticker. Aucun ne traverse le CÂBLAGE : débrancher `foldOf` dans
 * `routes/conversations.tsx`, ou lire le compte ailleurs que dans la source
 * des pastilles de rangée, les laisserait tous verts. Ce témoin le mesure dans
 * un navigateur réel, sur le `dist` construit, et chaque étape ATTEND un état
 * observable (jamais une durée) :
 *
 *  1. Épingles se replie au clic : ses rangées quittent l'écran, le bouton dit
 *     `aria-expanded="false"`, et sans non-lus aucune pastille ne s'affiche.
 *  2. EN TEMPS RÉEL, SANS DÉPLIER : épingler depuis une autre section une
 *     conversation porteuse de deux non-lus la fait entrer dans la section
 *     repliée — la pastille apparaît à côté du chevron avec son compte, et le
 *     nom lu par le lecteur d'écran le dit.
 *  3. Dépliée, la pastille d'en-tête disparaît — les rangées revenues portent
 *     déjà la leur, le compte n'est jamais dit deux fois.
 *  4. Au clavier : le bouton s'atteint, `Entrée` replie de nouveau.
 *
 * TOUTE SECTION SE REPLIE (#10103) :
 *  5. Les catégories du compte (« Travail », « Proches ») sont des sections,
 *     entre Épingles et Aujourd'hui, dans l'ordre déclaré.
 *  6. Chaque en-tête est un bouton de 44 px au moins, dont `aria-controls`
 *     désigne une liste qui EXISTE, repliée comme dépliée.
 *  7. Une section PAR DATE se replie, et le reste après un rechargement
 *     (mémoire de l'appareil) ; une CATÉGORIE se replie aussi.
 *  8. La recherche déplie le temps de chercher, puis rend la liste rangée.
 *  9. Un filtre ne déplie rien : « Non lus » garde la section repliée et son
 *     compte ne dit que ce que le filtre garde.
 * 10. Le dépliage d'un geste s'anime ; sous `prefers-reduced-motion`, non.
 */

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { revealRow } from './lib/reveal-row.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const served = await startDistServer(DIST, { serviceWorker: false });

const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const TOGGLE = '[data-sticker="pinned"] button[data-section-toggle="pinned"]';
const PINNED_ROW = 'c-amina';
const SUBJECT = 'c-deploiement';

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', locale: 'fr-FR' });
const page = await context.newPage();
await page.goto(`${served.base}/chats`, { waitUntil: 'load' });
await page.waitForSelector(`[data-row="${PINNED_ROW}"]`);

const toggleState = () =>
  page.$eval(TOGGLE, (el) => ({
    expanded: el.getAttribute('aria-expanded'),
    label: el.getAttribute('aria-label'),
    badge: el.querySelector('[data-unread]')?.getAttribute('data-unread') ?? null,
    badgeText: el.querySelector('[data-unread]')?.textContent ?? null,
    badgeBeforeChevron: (() => {
      const badge = el.querySelector('[data-unread]');
      const chevron = el.querySelector('svg');
      return badge !== null && chevron !== null && badge.compareDocumentPosition(chevron) === Node.DOCUMENT_POSITION_FOLLOWING;
    })(),
  }));

// ------------------------------------------------------------ 1. replier
check((await page.$(TOGGLE)) !== null, 'la section Épingles porte un bouton de pliage');
const open = await toggleState();
check(open.expanded === 'true' && open.badge === null, `dépliée : aria-expanded="true" et aucune pastille (${JSON.stringify(open)})`);

await page.click(TOGGLE);
await page.waitForSelector(`[data-row="${PINNED_ROW}"]`, { state: 'detached' });
const folded = await toggleState();
check(folded.expanded === 'false', 'repliée : aria-expanded="false"');
check(folded.badge === null, `repliée sans non-lus : aucune pastille (${folded.badge})`);
check(folded.label === 'Épingles, repliée', `le lecteur d'écran lit « Épingles, repliée » (${folded.label})`);

// ------------------------------------------- 2. en temps réel, sans déplier
check(await revealRow(page, SUBJECT), `la liste amène « ${SUBJECT} » à l'écran`);
await page.evaluate(
  (row) => document.querySelector(`[data-row="${row}"] button[aria-label="Actions de conversation"]`)?.focus(),
  SUBJECT,
);
await page.keyboard.press('Enter');
await page.waitForSelector('[role="menu"]');
await page.click('[role="menu"] [role="menuitem"]:text-is("Épingler")');
await page.waitForSelector(`[data-row="${SUBJECT}"]`, { state: 'detached' });
await page.waitForSelector(`${TOGGLE} [data-unread]`);
const grown = await toggleState();
check(grown.badge === '2' && grown.badgeText === '2', `la conversation épinglée entre dans la section repliée : pastille « 2 » (${JSON.stringify(grown)})`);
check(grown.badgeBeforeChevron, 'la pastille est À CÔTÉ du chevron, avant lui');
check(
  grown.label === 'Épingles, repliée, 2 messages non lus',
  `le lecteur d'écran lit « Épingles, repliée, 2 messages non lus » (${grown.label})`,
);

// ------------------------------------------------------------ 3. déplier
await page.click(TOGGLE);
await page.waitForSelector(`[data-row="${SUBJECT}"]`);
const reopened = await toggleState();
check(reopened.expanded === 'true' && reopened.badge === null, `dépliée : la pastille d'en-tête disparaît (${JSON.stringify(reopened)})`);
check((await page.$(`[data-row="${PINNED_ROW}"]`)) !== null, 'dépliée : les rangées épinglées reviennent');

// ------------------------------------------------------------ 4. clavier
await page.focus(TOGGLE);
await page.keyboard.press('Enter');
await page.waitForSelector(`[data-row="${SUBJECT}"]`, { state: 'detached' });
check((await toggleState()).expanded === 'false', 'au clavier, Entrée replie la section');

// ------------------------------------------- 5. les catégories du compte
await page.click(TOGGLE);
await page.waitForSelector(`[data-row="${SUBJECT}"]`);
const order = await page.$$eval('[data-sticker]', (els) => els.map((el) => el.getAttribute('data-sticker')));
const at = (id) => order.indexOf(id);
check(
  at('category:cat-travail') > at('pinned') && at('category:cat-proches') > at('category:cat-travail') && at('lentille.today') > at('category:cat-proches'),
  `les catégories viennent après Épingles et avant Aujourd'hui, dans l'ordre déclaré (${order.join(' → ')})`,
);
const travailLabel = await page.$eval('[data-sticker="category:cat-travail"] button', (el) => el.textContent?.trim());
check(travailLabel === 'Travail', `la section porte le nom de la catégorie (${travailLabel})`);
check((await page.$('[data-section="category:cat-travail"] [data-row="c-annonces"]')) !== null, 'c-annonces est rangée dans « Travail »');

// ------------------------------------------- 6. un vrai bouton, partout
const toggles = await page.$$eval('[data-section-toggle]', (els) =>
  els.map((el) => ({
    id: el.getAttribute('data-section-toggle'),
    height: el.getBoundingClientRect().height,
    controls: el.getAttribute('aria-controls'),
    controlled: document.getElementById(el.getAttribute('aria-controls') ?? '') !== null,
    expanded: el.getAttribute('aria-expanded'),
  })),
);
check(toggles.length === order.length, `chaque section a son bouton (${toggles.length} boutons pour ${order.length} sections)`);
check(toggles.every((t) => t.height >= 44), `chaque bouton fait au moins 44 px (${toggles.map((t) => `${t.id}:${t.height}`).join(', ')})`);
check(toggles.every((t) => t.controlled), 'chaque aria-controls désigne une liste qui existe');

// ------------------------------------------- 7. par date, et après rechargement
const TODAY = '[data-section-toggle="lentille.today"]';
const todayRow = await page.$eval('[data-section="lentille.today"] [data-row]', (el) => ({
  id: el.getAttribute('data-row'),
  name: el.querySelector('[data-name]')?.textContent?.trim() ?? '',
}));
const TODAY_ROW = `[data-row="${todayRow.id}"]`;
await page.click(TODAY);
await page.waitForSelector(TODAY_ROW, { state: 'detached' });
check(await page.$eval(TODAY, (el) => document.getElementById(el.getAttribute('aria-controls') ?? '')?.hidden === true), 'repliée, la liste commandée reste là, masquée');
await page.reload({ waitUntil: 'load' });
await page.waitForSelector(`[data-row="${PINNED_ROW}"]`);
check((await page.$eval(TODAY, (el) => el.getAttribute('aria-expanded'))) === 'false', "Aujourd'hui revient REPLIÉE après rechargement (mémoire de l'appareil)");
check((await page.$(TODAY_ROW)) === null, 'repliée après rechargement : ses rangées ne sont pas montées');
const CATEGORY = '[data-section-toggle="category:cat-travail"]';
await page.click(CATEGORY);
await page.waitForSelector('[data-row="c-annonces"]', { state: 'detached' });
check((await page.$eval(CATEGORY, (el) => el.getAttribute('aria-expanded'))) === 'false', 'une catégorie se replie aussi');

// ------------------------------------------- 8. la recherche déplie le temps de chercher
const SEARCH = 'input[type="search"]';
await page.fill(SEARCH, todayRow.name);
await page.waitForSelector(TODAY_ROW);
check((await page.$('[data-section-toggle]')) === null, `pendant la recherche (« ${todayRow.name} »), la rangée repliée se montre et aucun en-tête ne se replie`);
await page.fill(SEARCH, '');
await page.waitForSelector(TODAY_ROW, { state: 'detached' });
check((await page.$eval(TODAY, (el) => el.getAttribute('aria-expanded'))) === 'false', 'recherche effacée : la liste revient telle qu’on l’avait rangée');

// ------------------------------------------- 9. un filtre ne déplie rien
await page.click('nav[aria-label="Filtres"] button:text-is("Non lus")');
await page.waitForSelector(`${TODAY} [data-unread]`);
const unreadFiltered = await page.$eval(TODAY, (el) => ({ expanded: el.getAttribute('aria-expanded'), badge: el.querySelector('[data-unread]')?.getAttribute('data-unread') }));
check(unreadFiltered.expanded === 'false' && Number(unreadFiltered.badge) > 0, `« Non lus » garde Aujourd'hui repliée, son compte à côté du chevron (${JSON.stringify(unreadFiltered)})`);
await page.click('nav[aria-label="Filtres"] button:text-is("Tous")');

// ------------------------------------------- 10. l'animation, et le mouvement réduit
await page.click(TODAY);
await page.waitForSelector(TODAY_ROW);
const animation = await page.$eval(TODAY, (el) => getComputedStyle(document.getElementById(el.getAttribute('aria-controls') ?? '')).animationName);
check(animation === 'lens-section-unfold', `déplier d'un geste anime la liste (${animation})`);
await page.click(CATEGORY);
await page.evaluate(() => localStorage.removeItem('meeshy.lens.folded-sections'));

const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', locale: 'fr-FR', reducedMotion: 'reduce' });
const quiet = await reduced.newPage();
await quiet.goto(`${served.base}/chats`, { waitUntil: 'load' });
await quiet.waitForSelector(TODAY_ROW);
await quiet.click(TODAY);
await quiet.waitForSelector(TODAY_ROW, { state: 'detached' });
await quiet.click(TODAY);
await quiet.waitForSelector(TODAY_ROW);
const still = await quiet.$eval(TODAY, (el) => getComputedStyle(document.getElementById(el.getAttribute('aria-controls') ?? '')).animationName);
check(still === 'none', `sous prefers-reduced-motion, le dépliage ne s'anime pas (${still})`);
await reduced.close();

await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`\n  ${failures.length} constat(s) en défaut :`);
  for (const e of failures) console.error(`    · ${e}`);
  process.exit(1);
}
console.log('\n  Toute section se replie, et repliée elle porte le compte de ce qu’elle cache, à jour sans la déplier.\n');
