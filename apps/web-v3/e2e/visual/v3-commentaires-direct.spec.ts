import { expect, test, type Browser, type Page } from '@playwright/test';

import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

/**
 * `/post/:id` — ÉCRIRE UN COMMENTAIRE, SANS NAVIGATION (issue #5091, 2ᵉ tranche).
 *
 * UNE SUITE DE CHAÎNE : la sentinelle JavaScript prouve qu'aucun document n'a
 * été rechargé, le journal de la passerelle compte le coût du geste (UN POST),
 * et le bouchon ÉCRIT — la liste re-servie porte le commentaire neuf, comme la
 * base le ferait.
 */

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const cookiesDuLecteur = (base: string) => [
  { name: 'meeshy_session', value: 'sonde', url: base },
  { name: 'meeshy_auth', value: 'JWT.sonde', url: base },
];

const ouvre = async (browser: Browser): Promise<Page> => {
  const contexte = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await contexte.addCookies(cookiesDuLecteur(v3.base));
  const page = await contexte.newPage();
  const reponse = await page.goto(`${v3.base}/post/p1`, { waitUntil: 'domcontentloaded' });
  expect(reponse?.status()).toBe(200);
  await page.waitForFunction(() => document.querySelector('main[data-participation="commentaires"]') !== null);
  await page.waitForTimeout(1_200);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__sentinelle = 1;
  });
  return page;
};

const posts = (): number =>
  passerelle.journal.filter((a) => a.methode === 'POST' && a.chemin.includes('/comments')).length;

test.describe('écrire un commentaire, sans navigation', () => {
  test.beforeAll(async () => {
    passerelle = await passerelleDeBouchon();
    v3 = await serveurDeLaV3(passerelle.base);
  });

  test.afterAll(async () => {
    await v3?.ferme();
    await passerelle?.ferme();
  });

  test.beforeEach(() => {
    passerelle.filDeCommentaires.remets();
    passerelle.oublie();
  });

  test('publier échange le fil — commentaire NEUF dedans, champ vidé, ZÉRO rechargement', async ({ browser }) => {
    const page = await ouvre(browser);

    await page.locator('textarea[name="contenu"]').fill('Très bel endroit, on y retourne ?');
    await page.locator('form.ecrire button[type="submit"]').click();

    await expect(page.locator('#fil-des-commentaires .avis[role="status"]')).toBeVisible();
    await expect(page.locator('ul.commentaires')).toContainText('Très bel endroit, on y retourne ?');
    await expect(page.locator('textarea[name="contenu"]')).toHaveValue('');
    await expect(page.locator('textarea[name="contenu"]')).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__sentinelle)).toBe(1);
    await expect(page).toHaveURL(`${v3.base}/post/p1?commente`);
    expect(posts()).toBe(1);
  });

  test('le transport coupé laisse la saisie INTACTE, et la voix du geste le dit', async ({ browser }) => {
    const page = await ouvre(browser);
    await page.locator('textarea[name="contenu"]').fill('Un texte précieux');

    await page.route(
      (url) => url.pathname === '/post/p1',
      (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()),
    );
    await page.locator('form.ecrire button[type="submit"]').click();

    await expect(page.locator('form.ecrire .voix-du-geste')).toBeVisible();
    await expect(page.locator('textarea[name="contenu"]')).toHaveValue('Un texte précieux');
    await expect(page.locator('form.ecrire button[type="submit"]')).toBeEnabled();
    expect(posts()).toBe(0);
  });
});
