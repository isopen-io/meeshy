import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

import { FENETRE_REVERSIBLE_MS } from '../../lib/contenu/liste';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

/**
 * `/contacts` — LES DEUX GESTES D'UNE DEMANDE, OPTIMISTES (issue #4921).
 *
 * UNE SUITE DE CHAÎNE : l'écran n'existe que si une passerelle répond, et ce
 * qui est mesuré ici — l'acceptation instantanée, le refus RÉVERSIBLE et sa
 * fenêtre, le chemin sans JavaScript — passe par elle. Le journal de la
 * passerelle est le témoin des envois : un geste optimiste se voit à l'écran
 * AVANT d'apparaître au journal, et un refus annulé n'y apparaît JAMAIS.
 */

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const cookiesDuLecteur = (base: string) => [
  { name: 'meeshy_session', value: 'sonde', url: base },
  { name: 'meeshy_auth', value: 'JWT.sonde', url: base },
];

const ouvre = async (browser: Browser, javaScriptEnabled = true): Promise<Page> => {
  const contexte = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled });
  await contexte.addCookies(cookiesDuLecteur(v3.base));
  const page = await contexte.newPage();
  const reponse = await page.goto(`${v3.base}/contacts`, { waitUntil: 'domcontentloaded' });
  expect(reponse?.status(), '/contacts n’a pas servi le carnet').toBe(200);
  return page;
};

const attendsLeModule = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => document.querySelector('main[data-participation="contacts"]') !== null);
  await page.waitForTimeout(1_200);
};

const reponses = (): number =>
  passerelle.journal.filter(
    (appel) => appel.methode === 'PATCH' && appel.chemin.includes('/directory/friend-requests/'),
  ).length;

test.describe('les gestes du carnet, optimistes', () => {
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

  test('accepter est INSTANTANÉ — l’état se peint, le PATCH part, aucune navigation', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);
    const adresse = page.url();

    const ligne = page.locator('li[data-demande="fr-sara"]');
    await ligne.locator('button[value="accepter"]').click();

    await expect(ligne.locator('.etat-du-geste')).toHaveText('Demande acceptée');
    await expect(ligne.locator('.gestes')).toBeHidden();
    await expect(page.locator('#journal-des-gestes')).toContainText('Demande acceptée');
    await expect.poll(reponses).toBe(1);
    expect(page.url()).toBe(adresse);
  });

  test('refuser est RÉVERSIBLE — la ligne part, « Annuler » la rend, et RIEN n’est parti', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);

    const ligne = page.locator('li[data-demande="fr-sara"]');
    await ligne.locator('button[value="refuser"]').click();

    await expect(ligne).toBeHidden();
    const annuler = page.locator('#journal-des-gestes button');
    await expect(annuler).toBeFocused();

    await annuler.click();

    await expect(ligne).toBeVisible();
    // Le focus REVIENT au contrôle d'où le geste était parti (WCAG 2.4.3).
    await expect(ligne.locator('button[value="refuser"]')).toBeFocused();
    // La fenêtre a été annulée : la passerelle n'a JAMAIS entendu parler du refus.
    await page.waitForTimeout(FENETRE_REVERSIBLE_MS + 500);
    expect(reponses()).toBe(0);
  });

  test('un refus NON annulé part à la fermeture de sa fenêtre — une seule fois', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);

    await page.locator('li[data-demande="fr-sara"] button[value="refuser"]').click();
    await expect(page.locator('li[data-demande="fr-sara"]')).toBeHidden();
    expect(reponses()).toBe(0);

    await page.waitForTimeout(FENETRE_REVERSIBLE_MS + 500);
    await expect.poll(reponses).toBe(1);
  });

  test('sans JavaScript, accepter reste un Post/Redirect/Get qui marche', async ({ browser }) => {
    const page = await ouvre(browser, false);

    await page.locator('li[data-demande="fr-sara"] button[value="accepter"]').click();
    await page.waitForURL(/acceptee/);

    expect(reponses()).toBeGreaterThanOrEqual(1);
  });

  test('l’écran après un geste optimiste reste accessible', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);
    await page.locator('li[data-demande="fr-sara"] button[value="accepter"]').click();
    await expect(page.locator('li[data-demande="fr-sara"] .etat-du-geste')).toBeVisible();

    const rapport = await new AxeBuilder({ page }).analyze();
    const graves = rapport.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(graves.map((v) => `${v.id} — ${v.help}`)).toEqual([]);
  });
});
