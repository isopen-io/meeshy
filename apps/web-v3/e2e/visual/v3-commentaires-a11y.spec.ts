// GATE — « 0 violation axe serious/critical » sur `/post/:id`, clair ET sombre, et le PRISME rendu.
//
// `__tests__/commentaires-porte.test.ts` juge le document servi dans jsdom ; ce fichier juge ce que
// le lecteur a sous les yeux dans un vrai navigateur — et surtout le CONTRASTE, que jsdom ne calcule
// pas : `color-contrast` y est sautée sans un mot. Sur cet écran, deux surfaces en dépendent et
// n'existent nulle part ailleurs : la LIGNE DU PRISME (de l'accent sur un plan de carte) et les
// GESTES d'un commentaire (de l'encre sourde à la taille la plus petite du document).
//
// C'est cette famille de témoin qui a trouvé, sur `/search`, une encre sourde posée sur l'accent —
// 1,03:1 — que les quatre autres gardes déclaraient conforme (leçon 478).
//
// Il vit dans le projet `pages`, comme les autres suites d'audit : c'est l'import STATIQUE de
// `lib/a11y.ts` qui le décide, jamais le serveur qu'il monte (`playwright.config.ts`, dont la liste
// se DÉRIVE de cet import).

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

const contexte = async (
  navigateur: Browser,
  schema: 'light' | 'dark',
  avecJeton = true,
): Promise<BrowserContext> => {
  const ctx = await navigateur.newContext({ colorScheme: schema });
  if (avecJeton) {
    await ctx.addCookies([{ name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base }]);
  }
  return ctx;
};

(['light', 'dark'] as const).forEach((schema) => {
  test.describe(`thème ${schema}`, () => {
    test(`0 violation axe serious/critical — la publication et son fil (${schema})`, async ({ browser }) => {
      const ctx = await contexte(browser, schema);
      const page = await ctx.newPage();

      await page.goto(`${v3.base}/post/p-revue`);
      await expect(page.locator('main.commentaires-ecran')).toBeVisible();
      await expect(page.locator('.commentaire')).toHaveCount(3);
      // La ligne du Prisme DOIT être dans la page auditée : c'est la surface la
      // plus exposée de l'écran (accent sur plan de carte).
      await expect(page.locator('.prisme summary').first()).toBeVisible();

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`/post (${schema})`, bloquantes)).toEqual([]);

      await ctx.close();
    });

    test(`0 violation axe serious/critical — l'INVITATION (${schema})`, async ({ browser }) => {
      const ctx = await contexte(browser, schema, false);
      const page = await ctx.newPage();

      await page.goto(`${v3.base}/post/p-revue`);
      await expect(page.locator('h1')).toContainText('Connectez-vous');

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`/post invitation (${schema})`, bloquantes)).toEqual([]);

      await ctx.close();
    });
  });
});

test('le Prisme est APPLIQUÉ, pas seulement annoncé — et l’original se déplie', async ({ browser }) => {
  const ctx = await contexte(browser, 'light');
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/post/p-revue`);

  // La publication : écrite en anglais, servie en français, et la ligne le DIT.
  await expect(page.locator('.publication .texte')).toHaveText(/La revue de mars est prête/);
  await expect(page.locator('.publication .texte')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('.publication .prisme summary')).toContainText('traduit de l’anglais');

  // L'original est REPLIÉ, et le déplier a un EFFET (charte règle 4) — sans une
  // ligne de JavaScript, c'est un `<details>` natif.
  const original = page.locator('.publication .prisme .original');
  await expect(original).toBeHidden();
  await page.locator('.publication .prisme summary').click();
  await expect(original).toBeVisible();
  await expect(original).toHaveText(/The March review is ready/);
  await expect(original).toHaveAttribute('lang', 'en');

  await ctx.close();
});

test('un commentaire non traduit ne porte NI lang= NI ligne de Prisme', async ({ browser }) => {
  const ctx = await contexte(browser, 'light');
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/post/p-revue`);

  // Celui de Marta est traduit à un rang INFÉRIEUR (rang 1 absent) : il porte
  // les deux. C'est le cas du cycle 120, celui sur lequel un témoin peut tomber.
  const marta = page.locator('li[data-id="k-marta"]');
  await expect(marta.locator('.texte')).toHaveAttribute('lang', 'es');
  await expect(marta.locator('.prisme summary')).toBeVisible();

  // Celui d'Ibrahim est écrit dans la langue du lecteur : annoncer une
  // traduction qui n'a pas eu lieu serait le Prisme ANNONCÉ sans être APPLIQUÉ.
  const ibrahim = page.locator('li[data-id="k-ibrahim"]');
  await expect(ibrahim.locator('.texte')).not.toHaveAttribute('lang', /./);
  await expect(ibrahim.locator('.prisme')).toHaveCount(0);

  await ctx.close();
});

test('« Modifier · Supprimer » n’est PAS dans le document du commentaire d’un autre', async ({ browser }) => {
  const ctx = await contexte(browser, 'light');
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/post/p-revue`);

  // Absents, pas cachés : `toHaveCount(0)` interroge le DOM, donc il tombe aussi
  // sur un `display:none` — ce qu'une assertion de visibilité ne ferait pas.
  await expect(page.locator('li[data-id="k-marta"]').getByText('Supprimer')).toHaveCount(0);
  await expect(page.locator('li[data-id="k-ibrahim"]').getByText('Supprimer')).toHaveCount(0);
  await expect(page.locator('li[data-id="k-moi"]').getByText('Supprimer')).toHaveCount(1);
  await expect(page.locator('li[data-id="k-moi"]').getByText('Modifier')).toHaveCount(1);

  await ctx.close();
});

test('sans session, RIEN du contenu ne part', async ({ browser }) => {
  const ctx = await contexte(browser, 'light', false);
  const page = await ctx.newPage();

  passerelle.oublie();
  await page.goto(`${v3.base}/post/p-revue`);
  await expect(page.locator('h1')).toContainText('Connectez-vous');

  // Les trois portes sont en `requiredAuth` : un appel qui serait refusé n'a pas
  // à être fait, et le contenu ne doit apparaître nulle part dans la page.
  expect(passerelle.journal.filter((appel) => appel.chemin.startsWith('/api/'))).toEqual([]);
  await expect(page.locator('body')).not.toContainText('Revue de mars');
  await expect(page.locator('a[href^="/login"]')).toBeVisible();

  await ctx.close();
});
