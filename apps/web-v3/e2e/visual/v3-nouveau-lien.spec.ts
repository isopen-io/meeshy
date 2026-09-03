// GATE — « 0 violation axe serious/critical » sur `/links?nouveau`, clair ET
// sombre, et le geste qui décide si l'écran EXISTE : créer un lien le CRÉE, et
// les champs de la feuille se retrouvent dedans (#5071).
//
// `__tests__/nouveau-lien.test.ts` juge le document servi et la charge envoyée
// dans jsdom. Ce fichier juge ce qu'un VRAI navigateur en fait : le contraste
// (que jsdom ne calcule pas), la surimpression réellement au-dessus du carnet,
// et surtout la CHAÎNE ENTIÈRE — soumettre, être redirigé, retrouver le lien
// dans la liste. Un formulaire dont on ne vérifie que la charge peut poster
// dans le vide.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON } from '../../lib/api/cookies';
import { violationsBloquantes, rapporteViolations } from './lib/a11y';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';
import { COLONNES_DE_THEME } from './lib/verdict-axe';

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
  options: { readonly schema?: 'light' | 'dark'; readonly stockage?: 'light' | 'dark' | null; readonly javaScriptEnabled?: boolean } = {},
): Promise<BrowserContext> => {
  const ctx = await navigateur.newContext({
    colorScheme: options.schema ?? 'light',
    javaScriptEnabled: options.javaScriptEnabled ?? true,
  });
  await ctx.addCookies([{ name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base }]);
  if (options.stockage !== undefined && options.stockage !== null) {
    await ctx.addInitScript(
      ([cle, valeur]) => {
        try {
          window.localStorage.setItem(cle, valeur);
        } catch {
          /* le script anti-flash retombe sur la préférence système */
        }
      },
      [THEME_STORAGE_KEY, options.stockage] as const,
    );
  }
  return ctx;
};

COLONNES_DE_THEME.forEach((theme) => {
  test(`0 violation axe serious/critical — /links?nouveau (${theme.id})`, async ({ browser }) => {
    const ctx = await contexte(browser, { schema: theme.colorScheme, stockage: theme.stockage });
    const page = await ctx.newPage();

    await page.goto(`${v3.base}/links?nouveau`);
    await expect(page.locator('dialog.nouveau-lien')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`/links?nouveau (${theme.id})`, bloquantes)).toEqual([]);

    await ctx.close();
  });
});

/**
 * LE TÉMOIN QUI DÉCIDE SI LA FEUILLE EXISTE. Sans lui, on aurait un formulaire
 * parfaitement accessible qui poste dans le vide — et ni axe ni jsdom ne le
 * diraient.
 */
test('créer un lien le CRÉE, et il apparaît dans le carnet', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/links`);
  await page.getByRole('link', { name: 'Nouveau lien' }).click();

  await expect(page).toHaveURL(`${v3.base}/links?nouveau`);
  await page.locator('input[name="conversation"]').fill('Le potager du quartier');
  await page.locator('input[name="nom"]').fill('Voisins');
  await page.locator('input[value="jour"]').check();
  await page.locator('input[name="capacite"]').fill('12');
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(`${v3.base}/links?cree`);
  await expect(page.locator('[role="status"]')).toBeVisible();
  // LE LIEN EST DANS LE CARNET : c'est la preuve que la création a eu lieu, et
  // non seulement que la passerelle a répondu 201.
  await expect(page.locator('.liens')).toContainText('mshy_cree_1');
  await expect(page.locator('dialog.nouveau-lien')).toHaveCount(0);

  await ctx.close();
});

test('la feuille marche ENTIÈRE sans JavaScript', async ({ browser }) => {
  const ctx = await contexte(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/links?nouveau`);
  await expect(page.locator('dialog.nouveau-lien')).toBeVisible();

  await page.locator('input[name="conversation"]').fill('Sans une ligne de script');
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(`${v3.base}/links?cree`);
  await expect(page.locator('.liens')).toContainText('mshy_cree_1');

  await ctx.close();
});

/**
 * TROIS CHEMINS DE FERMETURE, et sans JavaScript ce sont trois liens. Une
 * feuille qu'on ne peut pas fermer est un cul-de-sac — le lecteur n'a plus que
 * le bouton « précédent » du navigateur, et il ne le sait pas.
 */
test('la croix ferme la feuille sans JavaScript, et le carnet revient', async ({ browser }) => {
  const ctx = await contexte(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/links?nouveau`);
  await page.getByRole('link', { name: 'Fermer' }).first().click();

  await expect(page).toHaveURL(`${v3.base}/links`);
  await expect(page.locator('dialog.nouveau-lien')).toHaveCount(0);

  await ctx.close();
});

/** Avec le module, `plein-ecran.ts` l'élève en modale — donc Échap la ferme. */
test('Échap ferme la feuille quand le module est là', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/links?nouveau`);
  await expect(page.locator('dialog.nouveau-lien')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page).toHaveURL(`${v3.base}/links`);

  await ctx.close();
});

/**
 * UN REFUS RE-SERT LA FEUILLE AVEC LA SAISIE. Perdre le nom d'une conversation
 * parce qu'un champ a déplu est le défaut le plus cher d'un formulaire.
 */
test('un refus de la passerelle garde la saisie et dit le motif', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/links?nouveau`);
  // Le nom du lien est rempli, la conversation NON : la porte refuse avant même
  // d'appeler la passerelle, et c'est le cas que le lecteur rencontre le plus.
  await page.locator('input[name="nom"]').fill('Voisins');
  await page.locator('input[name="conversation"]').fill(' ');
  await page.locator('button[type="submit"]').click();

  await expect(page.locator('[role="alert"]')).toBeVisible();
  await expect(page.locator('input[name="nom"]')).toHaveValue('Voisins');

  await ctx.close();
});
