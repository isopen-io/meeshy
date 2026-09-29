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
 */

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

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
await page.goto(`${served.base}/`, { waitUntil: 'load' });
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

await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`\n  ${failures.length} constat(s) en défaut :`);
  for (const e of failures) console.error(`    · ${e}`);
  process.exit(1);
}
console.log('\n  Une section repliée porte le compte de ce qu’elle cache, à jour sans la déplier.\n');
