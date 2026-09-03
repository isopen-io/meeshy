// GATE — « 0 violation axe serious/critical » sur `/search`, clair ET sombre, dans ses DEUX états.
//
// `__tests__/recherche-porte.test.ts` juge le document servi dans jsdom ; ce fichier juge ce que le
// lecteur a sous les yeux dans un vrai navigateur — et surtout le CONTRASTE, que jsdom ne calcule
// pas : axe y saute `color-contrast` sans le dire. Sur cet écran, c'est le CHAMP qui en dépend :
// un champ de saisie dont le texte ou la bordure ne tranchent pas sur le fond est une recherche
// qu'on tape à l'aveugle.
//
// LES DEUX ÉTATS SONT AUDITÉS, et c'est le fond du témoin : l'écran VIDE (son invitation) et
// l'écran GARNI (ses deux groupes) n'ont presque aucun nœud en commun. N'auditer que le second
// laisserait l'état d'ouverture — celui que tout le monde voit en premier — sans mesure.
//
// Il vit dans le projet `pages`, comme `v3-fil-a11y.spec.ts` : c'est l'import STATIQUE de
// `lib/a11y.ts` qui le décide, jamais le serveur qu'il monte (`playwright.config.ts`, dont la
// liste se DÉRIVE désormais de cet import plutôt que de s'énumérer).

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { COOKIE_DE_JETON } from '../../lib/api/cookies';
import { violationsBloquantes, rapporteViolations } from './lib/a11y';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

const contexteDuMembre = async (navigateur: Browser, schema: 'light' | 'dark'): Promise<BrowserContext> => {
  const contexte = await navigateur.newContext({ colorScheme: schema });
  await contexte.addCookies([{ name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base }]);
  return contexte;
};

(['light', 'dark'] as const).forEach((schema) => {
  test.describe(`thème ${schema}`, () => {
    test(`0 violation axe serious/critical — la recherche VIDE (${schema})`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, schema);
      const page = await contexte.newPage();

      await page.goto(`${v3.base}/search`);
      await expect(page.locator('main.recherche-ecran')).toBeVisible();
      // L'état d'ouverture : l'invitation, pas une liste.
      await expect(page.locator('.groupe')).toHaveCount(0);

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`/search vide (${schema})`, bloquantes)).toEqual([]);

      await contexte.close();
    });

    test(`0 violation axe serious/critical — la recherche GARNIE (${schema})`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, schema);
      const page = await contexte.newPage();

      await page.goto(`${v3.base}/search?q=a`);
      await expect(page.locator('main.recherche-ecran')).toBeVisible();
      await expect(page.locator('.groupe')).toHaveCount(2);

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`/search garnie (${schema})`, bloquantes)).toEqual([]);

      await contexte.close();
    });
  });
});

test('le formulaire cherche pour de vrai, et son adresse porte la question', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, 'light');
  const page = await contexte.newPage();

  await page.goto(`${v3.base}/search`);
  passerelle.oublie();

  await page.locator('#recherche-q').fill('lagos');
  await page.locator('.chercher button[type="submit"]').click();

  // Un `GET` de formulaire : la question est dans l'ADRESSE, donc le résultat
  // est rechargeable, partageable, et le bouton « précédent » y revient.
  await expect(page).toHaveURL(`${v3.base}/search?q=lagos`);
  await expect(page.locator('.groupe')).toHaveCount(2);
  // Le champ RE-SERT le terme : sans quoi l'écran aurait oublié la question.
  await expect(page.locator('#recherche-q')).toHaveValue('lagos');

  const appels = passerelle.journal.map((appel) => appel.chemin);
  expect(appels.some((chemin) => chemin.includes('/api/v1/conversations/search?q=lagos'))).toBe(true);
  expect(appels.some((chemin) => chemin.includes('/api/v1/directory/people?q=lagos'))).toBe(true);
  expect(appels.some((chemin) => chemin.includes('/users/search'))).toBe(false);
  expect(appels.some((chemin) => chemin.includes('/auth/me'))).toBe(false);

  await contexte.close();
});

test('aucun appel tant que rien n’est demandé', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, 'light');
  const page = await contexte.newPage();

  passerelle.oublie();
  await page.goto(`${v3.base}/search`);
  await expect(page.locator('main.recherche-ecran')).toBeVisible();

  // Zéro aller-retour vers la passerelle : `q` y est requis, et la page la
  // plus rapide de la v3 est celle qui ne demande rien.
  expect(passerelle.journal.filter((appel) => appel.chemin.startsWith('/api/'))).toEqual([]);

  await contexte.close();
});
