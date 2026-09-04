import { expect, test, type Browser, type Page } from '@playwright/test';

import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

/**
 * `/links` — LA CRÉATION SANS NAVIGATION (issue #5090).
 *
 * UNE SUITE DE CHAÎNE : la sentinelle JavaScript prouve qu'aucun document n'a
 * été rechargé, le journal de la passerelle compte ce que le geste coûte, et
 * l'adresse rendue est la clé CANONIQUE (#5077) — composée par le serveur,
 * jamais par le module.
 */

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const cookiesDuLecteur = (base: string) => [
  { name: 'meeshy_session', value: 'sonde', url: base },
  { name: 'meeshy_auth', value: 'JWT.sonde', url: base },
];

const ouvreLaFeuille = async (browser: Browser): Promise<Page> => {
  const contexte = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await contexte.addCookies(cookiesDuLecteur(v3.base));
  const page = await contexte.newPage();
  const reponse = await page.goto(`${v3.base}/links?nouveau`, { waitUntil: 'domcontentloaded' });
  expect(reponse?.status()).toBe(200);
  await page.waitForFunction(() => document.querySelector('main[data-participation="liens"]') !== null);
  await page.waitForTimeout(1_200);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__sentinelle = 1;
  });
  return page;
};

const sentinelle = (page: Page): Promise<unknown> =>
  page.evaluate(() => (window as unknown as Record<string, unknown>).__sentinelle);

test.describe('la création de lien, sans navigation', () => {
  test.beforeAll(async () => {
    passerelle = await passerelleDeBouchon();
    v3 = await serveurDeLaV3(passerelle.base);
  });

  test.afterAll(async () => {
    await v3?.ferme();
    await passerelle?.ferme();
  });

  test.beforeEach(() => {
    passerelle.oublie();
  });

  test('créer échange le carnet — le lien NEUF dedans, adresse canonique, ZÉRO rechargement', async ({ browser }) => {
    const page = await ouvreLaFeuille(browser);

    await page.locator('input[name="conversation"]').fill('Le potager du quartier');
    await page.locator('input[name="nom"]').fill('Voisins du 4e');
    await page.locator('button[type="submit"]').click();

    // Le carnet frais porte le lien neuf, l'avis le dit, la feuille est partie.
    await expect(page.locator('#carnet .avis[role="status"]')).toBeVisible();
    await expect(page.locator('#carnet .adresse').first()).toContainText('/chat/mshy_');
    await expect(page.locator('dialog.nouveau-lien')).toHaveCount(0);
    // AUCUNE navigation : la sentinelle a survécu, et l'adresse a pourtant suivi.
    expect(await sentinelle(page)).toBe(1);
    await expect(page).toHaveURL(`${v3.base}/links?cree`);
    // Le coût du geste : UN POST de création au journal.
    expect(passerelle.journal.filter((a) => a.methode === 'POST' && a.chemin.includes('/api/v1/links')).length).toBe(1);
    // Et le fond redevient atteignable : l'inerte est levé avec la feuille.
    expect(await page.locator('main').getAttribute('inert')).toBeNull();
  });

  test('un refus pose la feuille SERVIE — motif dit, saisie tenue par le serveur, aucune navigation', async ({ browser }) => {
    const page = await ouvreLaFeuille(browser);

    await page.locator('input[name="nom"]').fill('Voisins');
    await page.locator('input[name="conversation"]').fill(' ');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('dialog.nouveau-lien [role="alert"]')).toBeVisible();
    await expect(page.locator('input[name="nom"]')).toHaveValue('Voisins');
    expect(await sentinelle(page)).toBe(1);
  });

  test('la passerelle injoignable laisse la feuille INTACTE, et sa voix le dit', async ({ browser }) => {
    const page = await ouvreLaFeuille(browser);
    // La saisie est COMPLÈTE — la panne mesurée ici est celle du TRANSPORT,
    // pas celle de la validation native (un champ requis vide arrête le
    // submit avant tout événement : c'est ce que la première version de ce
    // témoin a mesuré sans le vouloir — journal de bord VIDE).
    await page.locator('input[name="conversation"]').fill('Le potager du quartier');
    await page.locator('input[name="nom"]').fill('Voisins');

    // Le POST du module est coupé au NAVIGATEUR — `?` est un métacaractère de
    // glob, la route se filtre par prédicat, et seul le POST est coupé.
    await page.route(
      (url) => url.pathname === '/links',
      (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()),
    );
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('dialog.nouveau-lien .avis-feuille')).toBeVisible();
    await expect(page.locator('input[name="nom"]')).toHaveValue('Voisins');
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });
});
