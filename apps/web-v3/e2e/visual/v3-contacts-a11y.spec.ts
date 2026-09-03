// GATE — « 0 violation axe serious/critical » sur `/contacts`, clair ET sombre, et la PRÉSENCE
// telle que la loi la sert.
//
// `__tests__/contacts-porte.test.ts` juge le document servi dans jsdom ; ce fichier juge ce que le
// lecteur a sous les yeux dans un vrai navigateur — et surtout le CONTRASTE, que jsdom ne calcule
// pas : axe y saute `color-contrast` sans le dire. C'est la seule règle qui pouvait attraper une
// pastille de présence illisible sur son fond, et une pastille illisible est une information
// perdue pour tout le monde, pas seulement pour qui voit mal.
//
// L'ÉCRAN N'A AUCUN MODULE CLIENT — il est servi entier par son gestionnaire de route. Ce que ce
// témoin ajoute au jsdom est donc la MISE EN PAGE et les COULEURS CALCULÉES, pas un état vivant.
//
// Il vit dans le projet `pages`, comme `v3-fil-a11y.spec.ts` et pour la même raison : il importe
// `lib/a11y.ts` STATIQUEMENT. Ce qui décide n'est pas le serveur — il monte sa propre passerelle de
// bouchon, comme les suites de `chaines` — mais cet import : le mêler aux suites de vitals réseau
// casse la résolution de `mesure-reseau.mjs` et fait tomber sept témoins de plafond qui n'ont pas
// changé (`playwright.config.ts`). La première version de cet en-tête affirmait le contraire, deux
// lignes au-dessus de l'import qui la démentait ; la CI l'a dit avant tout relecteur.

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
    test(`0 violation axe serious/critical — les contacts (${schema})`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, schema);
      const page = await contexte.newPage();

      await page.goto(`${v3.base}/contacts`);
      await expect(page.locator('main.contacts-ecran')).toBeVisible();
      await expect(page.locator('li.contact')).toHaveCount(3);

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`/contacts (${schema})`, bloquantes)).toEqual([]);

      await contexte.close();
    });
  });
});

test('la présence est celle que la passerelle SERT — jamais celle que le client déduit', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, 'light');
  const page = await contexte.newPage();

  await page.goto(`${v3.base}/contacts`);
  await expect(page.locator('main.contacts-ecran')).toBeVisible();

  // Le bouchon sert la présence comme la loi l'impose : masquée sur les DEUX demandes en
  // attente (leurs parties ne sont pas des amis acceptés), servie sur le contact établi.
  // Une seule pastille doit donc paraître, et sur la bonne ligne.
  await expect(page.locator('li.contact .pastille')).toHaveCount(1);
  await expect(page.locator('li[data-sorte="contact"] .pastille.en-ligne')).toBeVisible();
  await expect(page.locator('li[data-sorte="recue"] .pastille')).toHaveCount(0);
  await expect(page.locator('li[data-sorte="envoyee"] .pastille')).toHaveCount(0);

  await contexte.close();
});

test('« Accepter » a un effet, et « En attente » n’est pas un bouton', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, 'light');
  const page = await contexte.newPage();

  await page.goto(`${v3.base}/contacts`);
  await expect(page.locator('main.contacts-ecran')).toBeVisible();

  // Une demande ENVOYÉE ne se répond pas par son auteur : la ligne porte un constat, pas un
  // contrôle — la loi 4 lue à l'envers (un contrôle qui ne peut rien faire n'est pas rendu).
  await expect(page.locator('li[data-sorte="envoyee"] button')).toHaveCount(0);
  await expect(page.locator('li[data-sorte="envoyee"] .etat')).toHaveText('En attente');

  await page.locator('li[data-sorte="recue"] button[value="accepter"]').click();

  // Post/Redirect/Get : l'adresse porte le compte rendu, et l'écran le DIT.
  await expect(page).toHaveURL(`${v3.base}/contacts?acceptee`);
  await expect(page.locator('.avis[role="status"]')).toHaveText(/Demande acceptée/);

  const patch = passerelle.journal.filter((appel) => appel.methode === 'PATCH');
  expect(patch).toHaveLength(1);
  expect(patch[0]?.chemin).toContain('/api/v1/directory/friend-requests/fr-sara');
  expect(patch[0]?.corps).toBe(JSON.stringify({ action: 'accept' }));

  await contexte.close();
});
