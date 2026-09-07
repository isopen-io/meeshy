// GATE — « 0 violation axe serious/critical » sur les SIX écrans de réglages,
// clair ET sombre, et les trois gestes qui décident si ces écrans EXISTENT :
// choisir un thème CHANGE l'apparence, enregistrer un profil CHANGE la fiche,
// retirer un appareil le RETIRE.
//
// `__tests__/reglages.test.ts` et `__tests__/reglages-porte.test.ts` jugent le
// document servi et les décisions de la porte dans jsdom. Ce fichier juge ce
// qu'un VRAI navigateur en fait — et il porte seul le témoin qui compte pour ce
// lot : le thème est appliqué par le script inline de la tête, à partir d'un
// COOKIE que le formulaire vient de poser. jsdom ne rejoue ni la navigation, ni
// le POST, ni la classe recalculée au document suivant ; le contraste, il ne le
// calcule pas non plus.
//
// LES SIX ÉCRANS SONT AUDITÉS SANS JAVASCRIPT AUSSI. C'est la promesse de la
// zone : ces écrans n'ont pas une ligne de JS de page, et un formulaire qui
// n'aurait d'effet qu'avec JS serait un contrôle qui ment aux connexions
// rurales que la v3 vise.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON } from '../../lib/api/cookies';
import { violationsBloquantes, rapporteViolations } from './lib/a11y';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { MOT_DE_PASSE_DU_BOUCHON } from './lib/bouchon-compte';
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
  options: {
    readonly schema?: 'light' | 'dark';
    readonly stockage?: 'light' | 'dark' | null;
    readonly javaScriptEnabled?: boolean;
  } = {},
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
          /* le script anti-flash retombe sur la préférence système, la colonne le dira */
        }
      },
      [THEME_STORAGE_KEY, options.stockage] as const,
    );
  }
  return ctx;
};

const ECRANS = [
  { chemin: '/settings', repere: 'a[href="/settings/profile"]' },
  { chemin: '/settings/profile', repere: '.rangs' },
  { chemin: '/settings/profile/edit', repere: 'select[name="systemLanguage"]' },
  { chemin: '/settings/application', repere: 'fieldset.choix' },
  { chemin: '/settings/security', repere: 'button.retirer' },
  { chemin: '/settings/security/password', repere: 'input[name="nouveau"]' },
] as const;

COLONNES_DE_THEME.forEach((theme) => {
  ECRANS.forEach(({ chemin, repere }) => {
    test(`0 violation axe serious/critical — ${chemin} (${theme.id})`, async ({ browser }) => {
      const ctx = await contexte(browser, { schema: theme.colorScheme, stockage: theme.stockage });
      const page = await ctx.newPage();

      await page.goto(`${v3.base}${chemin}`);
      await expect(page.locator('main.reglages')).toBeVisible();
      await expect(page.locator(repere).first()).toBeVisible();
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`${chemin} (${theme.id})`, bloquantes)).toEqual([]);

      await ctx.close();
    });
  });
});

/**
 * LE TÉMOIN QUI DÉCIDE SI `/settings/application` EXISTE. Sans lui, on aurait
 * un groupe de radios parfaitement accessible qui ne change rien — c'est-à-dire
 * ce que la charte règle 7 interdit, et que ni jsdom ni axe n'attraperaient.
 */
test('choisir un thème CHANGE l’apparence, sans une ligne de JavaScript de page', async ({ browser }) => {
  const ctx = await contexte(browser, { schema: 'dark' });
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/settings/application`);
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.locator('input[value="clair"]').check();
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(`${v3.base}/settings/application?applique`);
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect(page.locator('input[value="clair"]')).toBeChecked();

  // ET IL SUIT LE LECTEUR D'UN ÉCRAN À L'AUTRE : un thème qui ne vaudrait que
  // sur la page où on l'a choisi ne serait pas un réglage.
  await page.goto(`${v3.base}/settings`);
  await expect(page.locator('html')).toHaveClass(/\blight\b/);

  // « Comme mon système » REVIENT au système, il n'écrit pas une troisième valeur.
  await page.goto(`${v3.base}/settings/application`);
  await page.locator('input[value="systeme"]').check();
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await ctx.close();
});

test('le thème choisi tient AUSSI sans JavaScript sur le document suivant', async ({ browser }) => {
  const ctx = await contexte(browser, { schema: 'dark', javaScriptEnabled: false });
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/settings/application`);
  await page.locator('input[value="clair"]').check();
  await page.locator('button[type="submit"]').click();

  // SANS JS, LA CLASSE RESTE CELLE DU SERVEUR (`dark`) — le script anti-flash ne
  // court pas. Ce que le témoin garde est que le CHOIX est bien ENREGISTRÉ et
  // RELU : la radio revient cochée, donc le cookie est posé et la porte le lit.
  await expect(page).toHaveURL(`${v3.base}/settings/application?applique`);
  await expect(page.locator('input[value="clair"]')).toBeChecked();

  await ctx.close();
});

test('enregistrer un profil CHANGE la fiche', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/settings/profile/edit`);
  await page.locator('input[name="nomAffiche"]').fill('Amina Diallo');
  await page.locator('textarea[name="bio"]').fill('Je lis en français.');
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(`${v3.base}/settings/profile/edit?enregistre`);
  await expect(page.locator('[role="status"]')).toBeVisible();

  await page.goto(`${v3.base}/settings/profile`);
  await expect(page.locator('main.reglages')).toContainText('Amina Diallo');
  await expect(page.locator('main.reglages')).toContainText('Je lis en français.');

  await ctx.close();
});

test('retirer un appareil le retire — et la liste le dit', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/settings/security`);
  await expect(page.locator('button.retirer')).toHaveCount(2);

  await page.locator('button.retirer').first().click();

  await expect(page).toHaveURL(`${v3.base}/settings/security?retire`);
  await expect(page.locator('button.retirer')).toHaveCount(1);
  await expect(page.locator('[role="status"]')).toBeVisible();

  await ctx.close();
});

/**
 * UN REFUS DE LA PASSERELLE EST RENDU TEL QUEL, et le formulaire reste
 * utilisable. Le motif — « Current password is incorrect » — vient de la
 * passerelle : le recomposer côté client créerait une seconde vérité.
 */
test('un mot de passe refusé le dit, et ne repose pas ce qui a été tapé', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/settings/security/password`);
  await page.locator('input[name="actuel"]').fill('ce-n-est-pas-le-bon');
  await page.locator('input[name="nouveau"]').fill('un-nouveau-mot-de-passe');
  await page.locator('button[type="submit"]').click();

  await expect(page.locator('[role="alert"]')).toContainText('Current password is incorrect');
  await expect(page.locator('input[name="actuel"]')).toHaveValue('');
  await expect(page.locator('input[name="nouveau"]')).toHaveValue('');

  await page.locator('input[name="actuel"]').fill(MOT_DE_PASSE_DU_BOUCHON);
  await page.locator('input[name="nouveau"]').fill('un-nouveau-mot-de-passe');
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(`${v3.base}/settings/security/password?change`);
  await expect(page.locator('[role="status"]')).toBeVisible();

  await ctx.close();
});
