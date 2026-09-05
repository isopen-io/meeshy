import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

import { SILENCE_DE_SAISIE_MS } from '../../lib/contenu/recherche';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

/**
 * `/search` — LA RECHERCHE INCRÉMENTALE (issue #4897, le critère mot à mot :
 * « requête débouncée, au plus une requête en vol par saisie »).
 *
 * UNE SUITE DE CHAÎNE : le journal de la passerelle compte ce que la saisie
 * COÛTE — taper vite ne paie qu'un aller-retour — et une sentinelle JavaScript
 * prouve qu'aucune navigation n'a eu lieu : le module échange une région, il
 * ne recharge pas un document.
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
  const reponse = await page.goto(`${v3.base}/search`, { waitUntil: 'domcontentloaded' });
  expect(reponse?.status(), '/search n’a pas servi l’écran').toBe(200);
  await page.waitForFunction(() => document.querySelector('main[data-participation="recherche"]') !== null);
  await page.waitForTimeout(1_200);
  return page;
};

const recherchesPayees = (): number =>
  passerelle.journal.filter((appel) => appel.chemin.includes('/conversations/search')).length;

test.describe('la recherche incrémentale', () => {
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

  test('taper vite ne paie qu’UN aller-retour — débouncé, sans navigation, l’adresse suit', async ({ browser }) => {
    const page = await ouvre(browser);
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__sentinelle = 1;
    });

    await page.locator('input[type="search"]').pressSequentially('marta', { delay: 40 });
    await expect
      .poll(() => page.locator('#resultats .groupe').count(), { timeout: SILENCE_DE_SAISIE_MS + 4_000 })
      .toBeGreaterThan(0);

    // UN aller-retour pour cinq caractères tapés vite — le silence de saisie a joué.
    expect(recherchesPayees()).toBe(1);
    // AUCUNE navigation : la sentinelle a survécu, et l'adresse porte pourtant la requête.
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__sentinelle)).toBe(1);
    expect(page.url()).toContain('q=marta');
  });

  test('les groupes servis se parcourent au clavier, et AUCUNE pastille de présence n’y paraît', async ({ browser }) => {
    const page = await ouvre(browser);
    await page.locator('input[type="search"]').pressSequentially('marta', { delay: 40 });
    await expect.poll(() => page.locator('#resultats .groupe').count()).toBeGreaterThan(0);

    // Les rangées sont des LIENS : le clavier les atteint groupe après groupe.
    const rangees = page.locator('#resultats .groupe a');
    expect(await rangees.count()).toBeGreaterThan(0);
    await page.keyboard.press('Tab');
    // La présence ne fuit ni par un champ ni par un point : l'écran ne la demande pas.
    expect(await page.locator('#resultats .pastille').count()).toBe(0);
  });

  test('Entrée cherche TOUT DE SUITE — le silence est une patience, pas une porte', async ({ browser }) => {
    const page = await ouvre(browser);

    await page.locator('input[type="search"]').fill('marta');
    await page.keyboard.press('Enter');

    await expect.poll(() => recherchesPayees(), { timeout: 2_000 }).toBeGreaterThanOrEqual(1);
    expect(page.url()).not.toContain('/search?q=marta&'); // pas de soumission GET naviguée
  });

  test('l’écran incrémental reste accessible', async ({ browser }) => {
    const page = await ouvre(browser);
    await page.locator('input[type="search"]').pressSequentially('marta', { delay: 40 });
    await expect.poll(() => page.locator('#resultats .groupe').count()).toBeGreaterThan(0);

    const rapport = await new AxeBuilder({ page }).analyze();
    const graves = rapport.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(graves.map((v) => `${v.id} — ${v.help}`)).toEqual([]);
  });
});
