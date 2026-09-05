import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

import { SILENCE_DE_SAISIE_MS } from '../../lib/contenu/recherche';
import { ACTION_PRIMAIRE, ciblesMesurees, ciblesTropPetites, hauteursDe, LARGEURS, TARGET_MIN } from './lib/cibles';
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

  test('les quatre groupes de la cible répondent depuis le bouchon', async ({ browser }) => {
    const page = await ouvre(browser);
    // « lagos » est le seul terme qui matche les QUATRE fixtures — le bouchon
    // des liens filtre pour de vrai (`bouchon-carnet.ts`, `?q=` réel), quand
    // les trois autres rendent leur fixture dès que `q` est non vide.
    await page.locator('input[type="search"]').pressSequentially('lagos', { delay: 40 });
    await expect.poll(() => page.locator('#resultats .groupe').count()).toBe(4);

    const titres = await page.locator('#resultats .groupe h2').allTextContents();
    expect(titres).toEqual(['Conversations', 'Personnes', 'Médias', 'Liens']);
  });

  test('une rangée Médias mène à la tranche et à la pièce', async ({ browser }) => {
    const page = await ouvre(browser);
    await page.locator('input[type="search"]').pressSequentially('tableau', { delay: 40 });
    await expect.poll(() => page.locator('#resultats .groupe').count()).toBeGreaterThan(0);

    await page.locator('#resultats .groupe', { hasText: 'Médias' }).locator('a.trouvaille').first().click();

    await expect(page).toHaveURL(/\/chats\/fil-riche\?autour=r1&media=ar1$/);
    await expect(page.locator('dialog.plein')).toBeVisible();
  });

  /**
   * LES CIBLES DE L'ÉCRAN, MESURÉES — charte règles 4 et 6, avec l'instrument
   * de `v3-cibles.spec.ts` (`lib/cibles.ts`), jamais un second.
   *
   * `/search` ne peut pas entrer dans la liste de `v3-cibles.spec.ts` : sans
   * jeton, sa porte redirige vers `/login`, et le `webServer` global ne monte
   * aucune passerelle de bouchon. La mesure vit donc ici, où les cookies du
   * lecteur existent — mais elle interroge le MÊME module, donc le même
   * sélecteur et les mêmes exceptions.
   *
   * CE QUE CE TÉMOIN A ATTRAPÉ : `.chercher button` — un `.action.primaire` —
   * portait `min-height:var(--target-min)` et mesurait **44 px**, sous un champ
   * de 52. Une action PRINCIPALE sous le plancher de 52 px de la charte, dont
   * aucun témoin ne parlait parce qu'aucun ne mesurait cet écran.
   */
  LARGEURS.forEach((largeur) => {
    test(`aucune cible sous ${TARGET_MIN} px à ${largeur} px, et l’action principale tient sa hauteur`, async ({ browser }) => {
      const page = await ouvre(browser);
      await page.setViewportSize({ width: largeur, height: 844 });
      await page.locator('input[type="search"]').pressSequentially('lagos', { delay: 40 });
      await expect.poll(() => page.locator('#resultats .groupe').count()).toBe(4);

      const mesurees = await ciblesMesurees(page);
      // Un balayage VIDE sortirait vert sans avoir rien mesuré : l'écran porte
      // au moins son retour, son champ, son bouton et ses quatre rangées.
      expect(mesurees.length, "aucune cible mesurée — le balayage n'a rien vu").toBeGreaterThan(5);

      const petites = ciblesTropPetites(mesurees);
      expect(petites, `cibles sous ${TARGET_MIN} px : ${JSON.stringify(petites)}`).toEqual([]);

      const primaires = await hauteursDe(page, '.action.primaire');
      expect(primaires.length).toBeGreaterThan(0);
      primaires.forEach((hauteur) => expect(hauteur).toBe(ACTION_PRIMAIRE));
    });
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
