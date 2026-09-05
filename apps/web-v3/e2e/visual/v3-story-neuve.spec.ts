// GATE — `/stories/new` (#5033) : publier une story, et l'asymétrie de ses deux
// contrôles.
//
// `__tests__/story-neuve.test.ts` juge le document servi et le corps envoyé.
// Ce fichier juge ce qu'un vrai navigateur en fait, et il porte les deux choses
// qu'aucun témoin de nœud ne peut dire : la CHAÎNE (l'onglet « Story » du
// composer mène ici, et publier revient avec sa confirmation) et l'audience
// lue sur le corps que la PASSERELLE a reçu — une confidentialité se vérifie
// sur la charge, jamais sur le `<select>` rendu.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { HEURES_DE_VIE_D_UNE_STORY, STORY_NEUVE } from '../../lib/contenu/story-neuve';
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
  options: { readonly schema?: 'light' | 'dark'; readonly stockage?: 'light' | 'dark' | null } = {},
): Promise<BrowserContext> => {
  const ctx = await navigateur.newContext({
    colorScheme: options.schema ?? 'light',
    viewport: { width: 390, height: 844 },
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

const derniereRecue = (): Record<string, unknown> | undefined =>
  passerelle.publicationsRecues[passerelle.publicationsRecues.length - 1];

/**
 * LA CHAÎNE — l'onglet « Story » du composer est la seule porte que la planche
 * dessine (`:870` puis l'onglet de format). Sans lui, `/stories/new` serait
 * servi sans qu'aucun lien n'y mène (leçon 507).
 */
test('le composer mène à la story, et publier la fait partir', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer`);
  await page.getByRole('link', { name: 'Story' }).click();
  await expect(page).toHaveURL(`${v3.base}/stories/new`);

  await page.locator('#s-texte').fill('Les coulisses de la revue de mars.');
  await page.getByRole('button', { name: STORY_NEUVE.publier }).click();

  await expect(page).toHaveURL(`${v3.base}/stories/new?publie=1`);
  await expect(page.getByRole('status')).toContainText(STORY_NEUVE.publie);

  expect(derniereRecue()).toMatchObject({
    type: 'STORY',
    content: 'Les coulisses de la revue de mars.',
    visibility: 'FRIENDS',
  });

  await ctx.close();
});

/**
 * L'AUDIENCE MUTE CE QUI PART — et le DÉFAUT est « Contacts », pas « Public ».
 * Reprendre le défaut du composer aurait ouvert au monde entier ce que le
 * service ferme aux contacts, sans qu'aucun message ne le dise.
 */
test('publier en « Moi seul » envoie PRIVATE, et le défaut reste Contacts', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/stories/new`);
  await expect(page.locator('#s-audience')).toHaveValue('FRIENDS');

  await page.locator('#s-texte').fill('Pour moi seulement.');
  await page.locator('#s-audience').selectOption('PRIVATE');
  await page.getByRole('button', { name: STORY_NEUVE.publier }).click();

  await expect(page).toHaveURL(/publie=1/);
  expect(derniereRecue()).toMatchObject({ visibility: 'PRIVATE' });

  await ctx.close();
});

/**
 * L'EXPIRATION EST DITE ET N'EST PAS UN CONTRÔLE. Aucune capacité serveur : un
 * champ ici serait un réglage qui ne règle rien. Le témoin vérifie les DEUX —
 * la valeur annoncée (20 h, celle de la passerelle) et l'absence de contrôle —,
 * parce que retirer la ligne cacherait un fait qui gouverne ce qu'on publie.
 */
test('l’expiration est annoncée à 20 h, et ne se règle pas', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/stories/new`);

  await expect(page.locator('main')).toContainText(`${STORY_NEUVE.expiration} ${HEURES_DE_VIE_D_UNE_STORY} h`);
  await expect(page.locator('main')).not.toContainText('24 h');
  expect(await page.locator('select, input[type="number"], input[type="date"]').count()).toBe(1);

  await ctx.close();
});

test('publier le vide se refuse à l’écran, sans rien envoyer', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();
  const avant = passerelle.publicationsRecues.length;

  await page.goto(`${v3.base}/stories/new`);
  await page.getByRole('button', { name: STORY_NEUVE.publier }).click();

  await expect(page.getByRole('alert')).toContainText(STORY_NEUVE.vide);
  expect(passerelle.publicationsRecues.length, 'rien ne doit partir').toBe(avant);

  await ctx.close();
});

COLONNES_DE_THEME.forEach((theme) => {
  test(`0 violation axe serious/critical — /stories/new (${theme.id})`, async ({ browser }) => {
    const ctx = await contexte(browser, { schema: theme.colorScheme, stockage: theme.stockage });
    const page = await ctx.newPage();

    await page.goto(`${v3.base}/stories/new`);
    await expect(page.locator('.composer')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`/stories/new (${theme.id})`, bloquantes)).toEqual([]);

    await ctx.close();
  });
});
