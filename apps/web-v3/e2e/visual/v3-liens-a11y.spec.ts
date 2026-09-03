// GATE — « 0 violation axe serious/critical » sur `/links`, clair ET sombre, et le compte SERVI.
//
// `__tests__/liens-porte.test.ts` juge le document servi dans jsdom ; ce fichier juge ce que le
// lecteur a sous les yeux dans un vrai navigateur — et surtout le CONTRASTE, que jsdom ne calcule
// pas : axe y saute `color-contrast` sans le dire. C'est la seule règle qui pouvait attraper une
// ligne FERMÉE devenue illisible sur son fond en sourdine, et une ligne illisible est un lien
// qu'on croit perdu.
//
// L'ÉCRAN N'A AUCUN MODULE CLIENT. Ce que ce témoin ajoute au jsdom est la mise en page et les
// couleurs calculées, pas un état vivant.
//
// Il vit dans le projet `chaines` : il monte sa propre passerelle de bouchon et n'importe rien de
// `lib/a11y.ts` statiquement (`playwright.config.ts`).

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
    test(`0 violation axe serious/critical — les liens (${schema})`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, schema);
      const page = await contexte.newPage();

      await page.goto(`${v3.base}/links`);
      await expect(page.locator('main.liens-ecran')).toBeVisible();
      // Un lien ouvert ET un lien fermé : l'audit doit voir les deux teintes.
      await expect(page.locator('.lien')).toHaveCount(2);
      await expect(page.locator('.lien.ferme')).toHaveCount(1);

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`/links (${schema})`, bloquantes)).toEqual([]);

      await contexte.close();
    });
  });
});

test('le compte des actifs vient du SERVEUR, jamais de la page', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, 'light');
  const page = await contexte.newPage();

  await page.goto(`${v3.base}/links`);

  // Le bouchon sert dix-sept actifs pour DEUX lignes — un chiffre qu'aucun
  // décompte local ne pourrait produire. C'est ce qui distingue un compteur
  // servi d'un compteur recalculé, et un `filter().length` afficherait « 1 ».
  await expect(page.locator('.fil-tete .sous')).toHaveText('17 liens actifs');

  await contexte.close();
});

test('un seul appel, et l’adresse publique n’est pas la destination de la ligne', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, 'light');
  const page = await contexte.newPage();

  passerelle.oublie();
  await page.goto(`${v3.base}/links`);
  await expect(page.locator('main.liens-ecran')).toBeVisible();

  const appels = passerelle.journal.map((appel) => appel.chemin);
  expect(appels.filter((chemin) => chemin.includes('/api/v1/links'))).toHaveLength(1);
  expect(appels.some((chemin) => chemin.includes('/auth/me'))).toBe(false);
  expect(appels.some((chemin) => chemin.includes('/api/v1/conversations'))).toBe(false);

  // Le TEXTE est la porte de l'invité — ce que le lecteur colle ailleurs ;
  // la LIGNE mène à sa propre conversation.
  await expect(page.locator('.lien .adresse').first()).toContainText('/chat/');
  await expect(page.locator('a.lien').first()).toHaveAttribute('href', /^\/chats\//);

  // Le lien FERMÉ du bouchon n'a pas de conversation étendue : sa ligne n'est
  // donc pas cliquable du tout, plutôt qu'un lien mort (charte règle 7).
  await expect(page.locator('li.lien.ferme')).toBeVisible();

  await contexte.close();
});
