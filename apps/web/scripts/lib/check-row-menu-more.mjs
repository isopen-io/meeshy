/**
 * 15 — LES ENTRÉES D'iOS DU MENU D'UNE LIGNE ONT UN EFFET (#10593).
 *
 * `bun test` prouve les lois (les entrées et leurs conditions, les sous-menus,
 * l'optimiste et son retour arrière) ; il ne traverse pas le CÂBLAGE de
 * l'écran. Ce témoin, sur le `dist` construit, touche chaque entrée et lit
 * l'écran :
 *
 *  a. « Favori › 🔥 » pose l'emoji à côté du nom, et la puce « Favoris » ne
 *     rend que cette conversation ;
 *  b. « Déplacer vers… › Proches » range la ligne dans la section de la
 *     catégorie ;
 *  c. « Renommer » change le nom lu, et un champ vide rend le nom d'origine ;
 *  d. « Bloquer » sur un direct passe par la confirmation, puis la ligne part
 *     aux archives, où son menu dit « Débloquer » ;
 *  e. au clavier, la flèche vers la fin de ligne entre dans un sous-menu (le
 *     focus sur « Retour »), la flèche inverse en sort, Échap referme.
 *
 * Extrait dès sa naissance : l'hôte (`check-list-actions.mjs`) est au seuil
 * de découpage de 1000 lignes. `check` est REMIS par l'hôte.
 */
import { awaitCondition } from './await-fact.mjs';

const GROUP = 'c-deploiement';
/** Le groupe que le lecteur a créé (`READER_CREATED_GROUP_ID`, `fixtures-pagination.ts`) : le seul où il renomme (#11211). */
const CREATED_GROUP = 'c-page-04';
const DIRECT = 'c-amina';
const BUTTON = 'button[aria-label="Actions de conversation"]';

const openMenuOf = async (page, row) => {
  await page.evaluate(({ row, button }) => document.querySelector(`[data-row="${row}"] ${button}`)?.focus(), { row, button: BUTTON });
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="menu"]');
};

const pick = async (page, label) => {
  await page.click(`[role="menu"] button:text-is("${label}")`);
};

const rowIds = (page) => page.$$eval('[data-row]', (els) => els.map((el) => el.dataset.row));

export async function checkRowMenuMore({ browser, base, check }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', locale: 'fr-FR' });
  const page = await context.newPage();
  await page.goto(`${base}/chats`, { waitUntil: 'load' });
  await page.waitForSelector(`[data-row="${GROUP}"] [data-name]`);

  // a. le favori
  await openMenuOf(page, GROUP);
  await pick(page, 'Favori');
  await pick(page, '🔥');
  await awaitCondition(page, (row) => document.querySelector(`[data-row="${row}"] [data-favorite]`) !== null, GROUP);
  const favorite = await page.$eval(`[data-row="${GROUP}"]`, (row) => row.querySelector('[data-favorite]')?.textContent ?? null);
  check(favorite === '🔥', `« Favori › 🔥 » pose l'emoji à côté du nom (${JSON.stringify(favorite)})`);
  await page.click('button:text-is("Favoris")');
  await awaitCondition(page, () => document.querySelectorAll('[data-row]').length === 1);
  const favorites = await rowIds(page);
  check(JSON.stringify(favorites) === JSON.stringify([GROUP]), `la puce « Favoris » ne rend que la conversation au favori (${JSON.stringify(favorites)})`);
  await page.click('button:text-is("Tous")');
  await page.waitForSelector(`[data-row="${DIRECT}"]`);

  // b. déplacer vers une catégorie
  await openMenuOf(page, GROUP);
  await pick(page, 'Déplacer vers…');
  await pick(page, 'Proches');
  await awaitCondition(page, (row) => document.querySelector(`[data-row="${row}"]`)?.closest('[data-section]')?.getAttribute('data-section') === 'category:cat-proches', GROUP);
  const section = await page.$eval(`[data-row="${GROUP}"]`, (row) => row.closest('[data-section]')?.getAttribute('data-section') ?? null);
  check(section === 'category:cat-proches', `« Déplacer vers… › Proches » range la ligne dans la section de la catégorie (${section})`);

  // c. un membre ne renomme pas, il quitte (#11211) ; le créateur renomme, puis rend le nom d'origine
  await openMenuOf(page, GROUP);
  const memberLabels = await page.$$eval('[role="menu"] button', (els) => els.map((el) => el.textContent));
  check(
    !memberLabels.includes('Renommer') && memberLabels.includes('Quitter'),
    `un simple membre de « ${GROUP} » n'a pas « Renommer », il a « Quitter » (${JSON.stringify(memberLabels)})`,
  );
  await page.keyboard.press('Escape');
  const nameOf = () => page.$eval(`[data-row="${CREATED_GROUP}"] [data-name]`, (el) => el.textContent);
  const original = await nameOf();
  for (const [typed, expected] of [
    ['  Projet X  ', 'Projet X'],
    ['', original],
  ]) {
    await openMenuOf(page, CREATED_GROUP);
    await pick(page, 'Renommer');
    await page.waitForSelector('dialog[data-rename-dialog] input');
    await page.fill('dialog[data-rename-dialog] input', typed);
    await page.click('[data-rename="save"]');
    await awaitCondition(page, ({ row, name }) => document.querySelector(`[data-row="${row}"] [data-name]`)?.textContent === name, { row: CREATED_GROUP, name: expected });
    const name = await nameOf();
    check(name === expected, `« Renommer » avec ${JSON.stringify(typed)} : la ligne lit « ${expected} » (${JSON.stringify(name)})`);
  }

  // d. bloquer un direct
  await openMenuOf(page, DIRECT);
  await pick(page, 'Bloquer');
  const asked = await page.waitForSelector('dialog[data-confirm-dialog="conversation-block"]', { timeout: 2000 }).then(() => true, () => false);
  check(asked, '« Bloquer » passe par la confirmation');
  await page.click('dialog[data-confirm-dialog="conversation-block"] [data-confirm="confirm"]');
  await awaitCondition(page, (row) => document.querySelector(`[data-row="${row}"]`) === null, DIRECT);
  const afterBlock = await rowIds(page);
  check(!afterBlock.includes(DIRECT), `bloqué, le direct quitte la liste pour les archives (${JSON.stringify(afterBlock)})`);
  await page.click('button:text-is("Archivées")');
  await page.waitForSelector(`[data-row="${DIRECT}"]`);
  await openMenuOf(page, DIRECT);
  const unblock = await page.$$eval('[role="menu"] button', (els) => els.map((el) => el.textContent));
  check(unblock.includes('Débloquer') && !unblock.includes('Bloquer'), `aux archives, son menu dit « Débloquer » (${JSON.stringify(unblock)})`);
  await page.keyboard.press('Escape');
  await page.click('button:text-is("Tous")');

  // e. le clavier entre et sort d'un sous-menu
  await openMenuOf(page, GROUP);
  await awaitCondition(page, () => document.querySelector('[role="menu"]')?.contains(document.activeElement) === true);
  for (let i = 0; i < 15; i += 1) {
    if ((await page.evaluate(() => document.activeElement?.textContent)) === 'Favori') break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('ArrowRight');
  await awaitCondition(page, () => document.activeElement?.getAttribute('aria-label') === 'Retour, Favori');
  const entered = await page.evaluate(() => ({
    menu: document.querySelector('[role="menu"]')?.getAttribute('aria-label'),
    focus: document.activeElement?.getAttribute('aria-label'),
  }));
  check(entered.menu === 'Favori' && entered.focus === 'Retour, Favori', `Flèche droite entre dans « Favori », le focus sur le retour (${JSON.stringify(entered)})`);
  await page.keyboard.press('ArrowLeft');
  await awaitCondition(page, () => document.activeElement?.textContent === 'Favori');
  const left = await page.evaluate(() => ({
    menu: document.querySelector('[role="menu"]')?.getAttribute('aria-label'),
    focus: document.activeElement?.textContent,
  }));
  check(left.menu === 'Actions de conversation' && left.focus === 'Favori', `Flèche gauche ramène au menu, le focus sur « Favori » (${JSON.stringify(left)})`);
  await page.keyboard.press('Escape');
  const closed = await page.evaluate((button) => ({ menu: document.querySelector('[role="menu"]') !== null, focus: document.activeElement?.matches(button) === true }), BUTTON);
  check(!closed.menu && closed.focus, `Échap referme et rend le focus au bouton (${JSON.stringify(closed)})`);

  // f. tenir la ligne ouvre l'aperçu au-dessus des actions (#11211) — sans `contextmenu`, comme Safari iOS
  const rowBox = await page.$eval(`[data-row="${GROUP}"] [data-name]`, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(rowBox.x, rowBox.y);
  await page.mouse.down();
  await page.waitForSelector('[data-conversation-peek] [data-peek-card]', { timeout: 4000 });
  await page.mouse.up();
  const peek = await page.evaluate(() => {
    const card = document.querySelector('[data-conversation-peek] [data-peek-card]');
    const style = card === null ? null : getComputedStyle(card);
    const box = card?.getBoundingClientRect();
    return {
      dialog: (card?.closest('[role="dialog"][aria-modal="true"]')?.querySelector('[role="menu"]') ?? null) !== null,
      transform: style?.transform ?? null,
      filter: style?.filter ?? null,
      rows: card?.querySelectorAll('[data-peek-row]').length ?? 0,
      left: box?.left ?? -1,
      right: box === undefined ? -1 : window.innerWidth - box.right,
      width: box?.width ?? 0,
      menu: document.querySelector('[data-conversation-peek] [role="menu"]') !== null,
      path: location.pathname,
    };
  });
  check(
    peek.dialog === true && peek.menu && peek.transform === 'none' && peek.filter === 'none' && peek.width <= 340 && peek.left >= 16 && peek.right >= 16 && peek.path === '/chats',
    `tenir « ${GROUP} » ouvre l'aperçu net (ni transform ni filtre), dans une couche modale qui porte ses actions, 340 px au plus et 16 px des bords, au-dessus de ses actions, sans ouvrir le fil (${JSON.stringify(peek)})`,
  );
  await page.keyboard.press('Escape');
  const peekClosed = await page.evaluate((button) => ({ peek: document.querySelector('[data-conversation-peek]') !== null, focus: document.activeElement?.matches(button) === true }), BUTTON);
  check(!peekClosed.peek && peekClosed.focus, `Échap referme l'aperçu et rend le focus au bouton ⋮ (${JSON.stringify(peekClosed)})`);

  await context.close();
}
