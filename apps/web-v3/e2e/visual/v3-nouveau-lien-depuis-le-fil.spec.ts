// GATE — « 0 violation axe serious/critical » sur `/chats/:cle?lien`, clair
// ET sombre, et la CHAÎNE ENTIÈRE — depuis le fil, taper « Partager », créer
// un lien, revenir SUR LE FIL avec le lien créé annoncé (#5034).
//
// `__tests__/nouveau-lien-depuis-le-fil.test.ts` juge le document servi et la
// charge envoyée dans jsdom. Ce fichier juge ce qu'un VRAI navigateur en
// fait : le contraste (que jsdom ne calcule pas), la surimpression réellement
// au-dessus du fil, et la chaîne SANS JavaScript comme AVEC.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON } from '../../lib/api/cookies';
import { NOUVEAU_LIEN } from '../../lib/contenu/liens';
import { violationsBloquantes, rapporteViolations } from './lib/a11y';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { CONVERSATION_DU_LECTEUR, passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';
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

test.afterEach(() => {
  passerelle.carnet.remets();
  passerelle.oublie();
});

const FIL = (): string => `${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}`;

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

const dernierePostee = () =>
  [...passerelle.journal].reverse().find((appel) => appel.methode === 'POST' && appel.chemin === '/api/v1/links');

COLONNES_DE_THEME.forEach((theme) => {
  test(`0 violation axe serious/critical — /chats/:cle?lien (${theme.id})`, async ({ browser }) => {
    const ctx = await contexte(browser, { schema: theme.colorScheme, stockage: theme.stockage });
    const page = await ctx.newPage();

    await page.goto(`${FIL()}?lien`, { waitUntil: 'load' });
    await expect(page.locator('dialog.nouveau-lien')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`/chats/:cle?lien (${theme.id})`, bloquantes)).toEqual([]);
    // Aucune cible sous 44 px — la cible RÉELLE d'une case/radio est son
    // `<label class="coche">`, qui l'enveloppe pleine largeur (charte § 12.5) ;
    // les boutons et liens sont mesurés tels quels.
    const cibles = await page.locator('dialog.nouveau-lien button, dialog.nouveau-lien label.coche, dialog.nouveau-lien > a, dialog.nouveau-lien .fermer').all();
    for (const cible of cibles) {
      const boite = await cible.boundingBox();
      if (boite === null) continue;
      expect(boite.height, await cible.evaluate((n) => n.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(44);
    }

    await ctx.close();
  });
});

test.describe('sans JavaScript — un <form>, un PRG, à la même adresse', () => {
  test('« Partager » ouvre la feuille à ?lien, avec la conversation déjà choisie', async ({ browser }) => {
    const ctx = await contexte(browser, { javaScriptEnabled: false });
    const page = await ctx.newPage();

    await page.goto(FIL(), { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: NOUVEAU_LIEN.depuisLeFil }).click();

    await expect(page).toHaveURL(`${FIL()}?lien`);
    await expect(page.locator('dialog.nouveau-lien')).toBeVisible();
    await expect(page.locator('input[name="conversation"]')).toHaveAttribute('type', 'hidden');
    await expect(page.locator('#l-conversation')).toHaveCount(0);

    await ctx.close();
  });

  test('soumettre un nom + une échéance POSTe conversationId=<cle>, revient SUR LE FIL, annonce le lien créé', async ({ browser }) => {
    const ctx = await contexte(browser, { javaScriptEnabled: false });
    const page = await ctx.newPage();

    await page.goto(`${FIL()}?lien`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[name="nom"]').fill('Voisins de Lagos');
    await page.getByRole('radio', { name: NOUVEAU_LIEN.jour }).check();
    await page.getByRole('checkbox', { name: NOUVEAU_LIEN.historique }).check();
    await page.getByRole('button', { name: NOUVEAU_LIEN.creer }).click();

    await expect(page).toHaveURL(new RegExp(`^${FIL()}\\?cree=`));
    await expect(page.locator('dialog.nouveau-lien')).toHaveCount(0);
    await expect(page.locator('#lien-cree')).toContainText(NOUVEAU_LIEN.cree);

    const poste = dernierePostee();
    expect(poste?.chemin).toBe('/api/v1/links');
    const corps = JSON.parse(poste?.corps ?? '{}') as Record<string, unknown>;
    expect(corps.conversationId).toBe(CONVERSATION_DU_LECTEUR.id);
    expect(corps.newConversation).toBeUndefined();
    expect(corps.allowViewHistory).toBe(true);
    expect(typeof corps.expiresAt).toBe('string');

    await ctx.close();
  });

  test('refus 400 du bouchon ⇒ la feuille est RE-SERVIE SUR LE FIL, la saisie tenue', async ({ browser }) => {
    passerelle.carnet.refuseLaProchaineCreation('Cette conversation est terminée', 400);
    const ctx = await contexte(browser, { javaScriptEnabled: false });
    const page = await ctx.newPage();

    await page.goto(`${FIL()}?lien`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[name="nom"]').fill('Voisins de Lagos');
    await page.getByRole('button', { name: NOUVEAU_LIEN.creer }).click();

    await expect(page.locator('main.fil-ecran')).toBeVisible();
    await expect(page.locator('dialog.nouveau-lien')).toBeVisible();
    await expect(page.locator('dialog.nouveau-lien [role="alert"]')).toContainText('Cette conversation est terminée');
    await expect(page.locator('input[name="nom"]')).toHaveValue('Voisins de Lagos');

    await ctx.close();
  });

});

test.describe('avec JavaScript — fetch, aucun rechargement', () => {
  test('la même chaîne, sans navigation : succès', async ({ browser }) => {
    const ctx = await contexte(browser);
    const page = await ctx.newPage();

    await page.goto(FIL(), { waitUntil: 'load' });
    await page.getByRole('link', { name: NOUVEAU_LIEN.depuisLeFil }).click();
    await expect(page.locator('dialog.nouveau-lien')).toBeVisible();

    await page.locator('input[name="nom"]').fill('Voisins de Lagos');
    await page.getByRole('button', { name: NOUVEAU_LIEN.creer }).click();

    await expect(page.locator('dialog.nouveau-lien')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('#lien-cree')).toContainText(NOUVEAU_LIEN.cree);
    await expect(page).toHaveURL(new RegExp(`^${FIL()}\\?cree=`));

    const poste = dernierePostee();
    expect((JSON.parse(poste?.corps ?? '{}') as Record<string, unknown>).conversationId).toBe(CONVERSATION_DU_LECTEUR.id);

    await ctx.close();
  });
});
