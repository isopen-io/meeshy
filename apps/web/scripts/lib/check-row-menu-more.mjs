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
const GROUP = 'c-deploiement';
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
  await page.waitForTimeout(300);

  // a. le favori
  await openMenuOf(page, GROUP);
  await pick(page, 'Favori');
  await pick(page, '🔥');
  const favorite = await page.$eval(`[data-row="${GROUP}"]`, (row) => row.querySelector('[data-favorite]')?.textContent ?? null);
  check(favorite === '🔥', `« Favori › 🔥 » pose l'emoji à côté du nom (${JSON.stringify(favorite)})`);
  await page.click('button:text-is("Favoris")');
  await page.waitForTimeout(120);
  const favorites = await rowIds(page);
  check(JSON.stringify(favorites) === JSON.stringify([GROUP]), `la puce « Favoris » ne rend que la conversation au favori (${JSON.stringify(favorites)})`);
  await page.click('button:text-is("Tous")');
  await page.waitForSelector(`[data-row="${DIRECT}"]`);

  // b. déplacer vers une catégorie
  await openMenuOf(page, GROUP);
  await pick(page, 'Déplacer vers…');
  await pick(page, 'Proches');
  await page.waitForTimeout(120);
  const section = await page.$eval(`[data-row="${GROUP}"]`, (row) => row.closest('[data-section]')?.getAttribute('data-section') ?? null);
  check(section === 'category:cat-proches', `« Déplacer vers… › Proches » range la ligne dans la section de la catégorie (${section})`);

  // c. renommer, puis rendre le nom d'origine
  const nameOf = () => page.$eval(`[data-row="${GROUP}"] [data-name]`, (el) => el.textContent);
  const original = await nameOf();
  for (const [typed, expected] of [
    ['  Projet X  ', 'Projet X'],
    ['', original],
  ]) {
    await openMenuOf(page, GROUP);
    await pick(page, 'Renommer');
    await page.waitForSelector('dialog[data-rename-dialog] input');
    await page.fill('dialog[data-rename-dialog] input', typed);
    await page.click('[data-rename="save"]');
    await page.waitForTimeout(120);
    const name = await nameOf();
    check(name === expected, `« Renommer » avec ${JSON.stringify(typed)} : la ligne lit « ${expected} » (${JSON.stringify(name)})`);
  }

  // d. bloquer un direct
  await openMenuOf(page, DIRECT);
  await pick(page, 'Bloquer');
  const asked = await page.waitForSelector('dialog[data-confirm-dialog="conversation-block"]', { timeout: 2000 }).then(() => true, () => false);
  check(asked, '« Bloquer » passe par la confirmation');
  await page.click('dialog[data-confirm-dialog="conversation-block"] [data-confirm="confirm"]');
  await page.waitForTimeout(200);
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
  await page.waitForTimeout(60);
  for (let i = 0; i < 15; i += 1) {
    if ((await page.evaluate(() => document.activeElement?.textContent)) === 'Favori') break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(60);
  const entered = await page.evaluate(() => ({
    menu: document.querySelector('[role="menu"]')?.getAttribute('aria-label'),
    focus: document.activeElement?.getAttribute('aria-label'),
  }));
  check(entered.menu === 'Favori' && entered.focus === 'Retour, Favori', `Flèche droite entre dans « Favori », le focus sur le retour (${JSON.stringify(entered)})`);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(60);
  const left = await page.evaluate(() => ({
    menu: document.querySelector('[role="menu"]')?.getAttribute('aria-label'),
    focus: document.activeElement?.textContent,
  }));
  check(left.menu === 'Actions de conversation' && left.focus === 'Favori', `Flèche gauche ramène au menu, le focus sur « Favori » (${JSON.stringify(left)})`);
  await page.keyboard.press('Escape');
  const closed = await page.evaluate((button) => ({ menu: document.querySelector('[role="menu"]') !== null, focus: document.activeElement?.matches(button) === true }), BUTTON);
  check(!closed.menu && closed.focus, `Échap referme et rend le focus au bouton (${JSON.stringify(closed)})`);

  await context.close();
}
