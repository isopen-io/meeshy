// GATE — « 0 violation axe serious/critical » sur `/chats?nouvelle`, clair ET
// sombre, et les deux gestes du critère de fin (#5072) : ouvrir la feuille,
// soumettre, atterrir DANS le fil créé.
//
// `__tests__/nouvelle-conversation.test.ts` juge le document servi et la charge
// envoyée dans jsdom. Ce fichier juge ce qu'un vrai navigateur en fait : le
// contraste, la surimpression réellement au-dessus de la liste, la chaîne
// entière — et la seule chose qui distingue cette feuille de celle des liens,
// Échap, que seul le module servi sur `/chats` rend possible.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
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

/**
 * TOUT SE VISE DANS LA FEUILLE, jamais dans la page. `/chats` porte DÉJÀ trois
 * boutons de soumission par ligne de liste (les gestes de la § 12.10.4) : un
 * `button[type="submit"]` nu en trouve huit, et Playwright refuse — à juste
 * titre. C'est la contrepartie d'une surimpression servie DANS la page qu'elle
 * recouvre : elle en partage le document, donc les sélecteurs.
 */
const feuille = (page: import('@playwright/test').Page) => page.locator('dialog.nouvelle-conv');

const contexte = async (
  navigateur: Browser,
  options: { readonly schema?: 'light' | 'dark'; readonly stockage?: 'light' | 'dark' | null; readonly javaScriptEnabled?: boolean } = {},
): Promise<BrowserContext> => {
  const ctx = await navigateur.newContext({
    colorScheme: options.schema ?? 'light',
    javaScriptEnabled: options.javaScriptEnabled ?? true,
  });
  await ctx.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
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
  test(`0 violation axe serious/critical — /chats?nouvelle (${theme.id})`, async ({ browser }) => {
    const ctx = await contexte(browser, { schema: theme.colorScheme, stockage: theme.stockage });
    const page = await ctx.newPage();

    await page.goto(`${v3.base}/chats?nouvelle`);
    await expect(page.locator('dialog.nouvelle-conv')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`/chats?nouvelle (${theme.id})`, bloquantes)).toEqual([]);

    await ctx.close();
  });
});

/**
 * LE CRITÈRE DE FIN, COMPTÉ EN GESTES : ouvrir la feuille (1), soumettre (2).
 * Et la destination est le FIL, pas la liste — le lecteur voulait parler.
 */
test('deux gestes, et le lecteur atterrit DANS la conversation créée', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/chats`);
  await page.getByRole('link', { name: 'Nouvelle conversation' }).click();
  await expect(page).toHaveURL(`${v3.base}/chats?nouvelle`);

  await feuille(page).locator('input[name="nom"]').fill('Le potager du quartier');
  await feuille(page).locator('button[type="submit"]').click();

  await expect(page).toHaveURL(`${v3.base}/chats/c-neuve-groupe`);

  await ctx.close();
});

test('la feuille marche ENTIÈRE sans JavaScript', async ({ browser }) => {
  const ctx = await contexte(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/chats?nouvelle`);
  await expect(page.locator('dialog.nouvelle-conv')).toBeVisible();

  await feuille(page).locator('input[name="nom"]').fill('Sans une ligne de script');
  await feuille(page).locator('button[type="submit"]').click();

  await expect(page).toHaveURL(`${v3.base}/chats/c-neuve-groupe`);

  await ctx.close();
});

test('la croix ferme la feuille sans JavaScript, et la liste revient', async ({ browser }) => {
  const ctx = await contexte(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/chats?nouvelle`);
  await feuille(page).locator('a.fermer').click();

  await expect(page).toHaveURL(`${v3.base}/chats`);
  await expect(page.locator('dialog.nouvelle-conv')).toHaveCount(0);

  await ctx.close();
});

/**
 * ÉCHAP FERME ICI, ET PAS SUR `/links` — la seule différence entre les deux
 * feuilles, et elle n'est pas un choix de design : `/chats` sert déjà son
 * module de participation (le temps réel de la liste), donc `plein-ecran.ts` y
 * court et l'élévation est GRATUITE. Ce témoin garde ce fait ; son jumeau sur
 * `/links` garde l'inverse.
 */
test('Échap ferme la feuille — le module de la liste l’élève en modale', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/chats?nouvelle`);
  await expect(feuille(page)).toBeVisible();

  // ON ATTEND L'ÉLÉVATION, ON NE LA SUPPOSE PAS. Le module est DIFFÉRÉ jusqu'à
  // après le premier pixel puis l'inactivité (`app/connecte/chargeur.ts`) :
  // presser Échap à l'arrivée du document mesurerait le SOCLE, qui ne prétend
  // pas fermer à Échap. `:modal` est vrai du seul dialogue ouvert par
  // `showModal()` — c'est la signature exacte de ce que le module ajoute, et
  // rien d'autre ne la produit.
  await expect
    .poll(async () => page.evaluate(() => document.querySelector('dialog.nouvelle-conv')?.matches(':modal') ?? false), {
      timeout: 10_000,
    })
    .toBe(true);

  await page.keyboard.press('Escape');

  await expect(page).toHaveURL(`${v3.base}/chats`);

  await ctx.close();
});

/** Un refus garde la saisie : perdre un nom parce qu'un champ a déplu est cher. */
test('un refus garde la saisie et dit le motif', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/chats?nouvelle`);
  await feuille(page).locator('input[name="description"]').fill('Entre voisins');
  await feuille(page).locator('input[name="nom"]').fill(' ');
  await feuille(page).locator('button[type="submit"]').click();

  await expect(feuille(page).locator('[role="alert"]')).toBeVisible();
  await expect(feuille(page).locator('input[name="description"]')).toHaveValue('Entre voisins');

  await ctx.close();
});
