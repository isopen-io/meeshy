// GATE — « 0 violation axe serious/critical » sur `/feed`, clair ET sombre — et les
// TROIS gestes du critère de fin (#5031) : le rail scrollable AU CLAVIER, une
// traduction cliquée qui CHANGE le texte lu, aimer/reposter câblés et OPTIMISTES.
//
// `__tests__/social-vue.test.ts` juge le document servi dans jsdom — la STRUCTURE
// (les deux radios, l'état `hidden` du repost, `aria-pressed`) ; ce fichier juge ce
// qu'un vrai navigateur en FAIT : le CONTRASTE (que jsdom ne calcule pas), l'EFFET
// du CSS pur `input:checked+.texte` (que jsdom n'applique pas non plus — la même
// raison que `commentaires-a11y` teste `<details>` ici et pas en jsdom), et le
// module de participation compilé (`lib/realtime/feed.ts` → `.rt/feed.<hash>.js`).

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
  const ctx = await navigateur.newContext({ colorScheme: options.schema ?? 'light', javaScriptEnabled: options.javaScriptEnabled ?? true });
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

// LES QUATRE COLONNES DE THÈME du § 9.6 (critère de fin de #5031, matrice.json)
// — deux mesurent la préférence de l'OS, deux la mettent EN CONTRADICTION avec
// le choix stocké : c'est la seule façon d'attraper une jumelle entre la
// classe posée par le script anti-flash et un `@media (prefers-color-scheme)`
// qui l'ignorerait. Reprend tel quel le mécanisme de `v3-fil-riche.spec.ts`
// (`COLONNES_DE_THEME`, `contexteDuMembre`) — une route CONNECTÉE l'a déjà,
// `/feed` en est une aussi.
COLONNES_DE_THEME.forEach((theme) => {
  test(`0 violation axe serious/critical — /feed (${theme.id})`, async ({ browser }) => {
    const ctx = await contexte(browser, { schema: theme.colorScheme, stockage: theme.stockage });
    const page = await ctx.newPage();

    await page.goto(`${v3.base}/feed`);
    await expect(page.locator('main.fil-social')).toBeVisible();
    await expect(page.locator('.post')).toHaveCount(2);
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));
    // Le rail ET le groupe de langues doivent être DANS la page auditée — ce
    // sont les deux surfaces les plus exposées de l'écran.
    await expect(page.locator('.rail a').first()).toBeVisible();
    await expect(page.locator('.prisme-multi').first()).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`/feed (${theme.id})`, bloquantes)).toEqual([]);

    await ctx.close();
  });
});

test('le rail de stories est scrollable AU CLAVIER — chaque story est un lien atteignable par Tab', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();
  await page.goto(`${v3.base}/feed`);

  const liens = page.locator('.rail a');
  await expect(liens).toHaveCount(4);

  // Chaque lien du rail est INDIVIDUELLEMENT focusable — le test à faire à un
  // couloir qui défile : Tab l'atteint, sans onClick ni gestion de focus écrite
  // à la main.
  for (let rang = 0; rang < 4; rang += 1) {
    await liens.nth(rang).focus();
    await expect(liens.nth(rang)).toBeFocused();
  }
});

test('le SAUT DE RAIL atteint les publications sans tabuler tout le couloir', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();
  await page.goto(`${v3.base}/feed`);

  const saut = page.locator('a.saut');
  await expect(saut).toHaveAttribute('href', '#publications');
  await saut.focus();
  await expect(saut).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('#publications')).toBeFocused();
});

test('l’anneau distingue les stories NON VUES des stories déjà vues (cible/feed.png)', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();
  await page.goto(`${v3.base}/feed`);

  const nonVue = page.locator('.rail .cercle[data-vu="0"]').first();
  const vue = page.locator('.rail .cercle[data-vu="1"]').first();
  await expect(nonVue).toBeVisible();
  await expect(vue).toBeVisible();

  const [couleurNonVue, couleurVue] = await Promise.all([
    nonVue.evaluate((el) => getComputedStyle(el).borderColor),
    vue.evaluate((el) => getComputedStyle(el).borderColor),
  ]);
  expect(couleurNonVue).not.toBe(couleurVue);
});

test('cliquer une traduction CHANGE le texte lu — y compris la variante à plusieurs langues (défaut du cycle 123)', async ({
  browser,
}) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();
  await page.goto(`${v3.base}/feed`);

  const post = page.locator('article[data-post="p-revue"]');
  // Élu par le Prisme au chargement : le français.
  await expect(post.locator('.prisme-multi .texte').first()).toBeVisible();
  await expect(post.locator('.prisme-multi .texte').first()).toContainText('La revue de mars est prête');
  await expect(post.locator('.prisme-multi .texte').nth(1)).toBeHidden();

  // Cliquer le LABEL de l'original (l'anglais) — un vrai clic utilisateur, pas
  // une bascule programmatique de l'attribut `checked`.
  await post.locator('.prisme-multi .langues label').nth(1).click();

  // L'EFFET : le texte affiché a changé, sans qu'aucun JavaScript n'ait tourné
  // — c'est le sélecteur CSS `input:checked+.texte` qui fait le travail.
  await expect(post.locator('.prisme-multi .texte').nth(1)).toBeVisible();
  await expect(post.locator('.prisme-multi .texte').nth(1)).toContainText('The March review is ready');
  await expect(post.locator('.prisme-multi .texte').first()).toBeHidden();

  await ctx.close();
});

test('aimer est câblé, OPTIMISTE puis confirmé', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();
  await page.goto(`${v3.base}/feed`);

  const bouton = page.locator('article[data-post="p-revue"] .geste-aime button');
  await expect(bouton).toHaveAttribute('aria-pressed', 'false');
  await expect(bouton.locator('.valeur')).toHaveText('128');

  const avant = passerelle.journal.length;
  await bouton.click();

  // OPTIMISTE : l'état change tout de suite, sans attendre la réponse réseau —
  // Playwright n'attend ici que le DOM, jamais une requête.
  await expect(bouton).toHaveAttribute('aria-pressed', 'true');
  await expect(bouton.locator('.valeur')).toHaveText('129');

  // CONFIRMÉ : la passerelle a bien reçu le geste.
  await expect
    .poll(() => passerelle.journal.slice(avant).some((appel) => appel.methode === 'POST' && appel.chemin.includes('/p-revue/like')))
    .toBe(true);

  await ctx.close();
});

test('reposter est câblé, OPTIMISTE, et devient un ÉTAT — plus un bouton (aucune route ne défait un repost)', async ({
  browser,
}) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();
  await page.goto(`${v3.base}/feed`);

  const article = page.locator('article[data-post="p-revue"]');
  const formulaire = article.locator('.geste-reposter');
  const etat = article.locator('.geste-reposte');

  await expect(formulaire).toBeVisible();
  await expect(etat).toBeHidden();

  const avant = passerelle.journal.length;
  await formulaire.locator('button').click();

  await expect(etat).toBeVisible();
  await expect(etat.locator('.valeur')).toHaveText('5');
  await expect(formulaire).toBeHidden();

  await expect
    .poll(() => passerelle.journal.slice(avant).some((appel) => appel.methode === 'POST' && appel.chemin.includes('/p-revue/repost')))
    .toBe(true);

  await ctx.close();
});

test('le chemin SANS JavaScript marche : aimer recharge la page et confirme dans la bannière', async ({ browser }) => {
  const ctx = await contexte(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`${v3.base}/feed`);

  await page.locator('article[data-post="p-revue"] .geste-aime button').click();
  await page.waitForURL(/\/feed\?fait=aime#post-p-revue$/);

  await expect(page.locator('#journal-des-gestes')).toContainText('Vous aimez cette publication.');

  await ctx.close();
});

// L'ANCRE `#post-<id>` accompagne CHAQUE redirection après un geste — pas
// seulement le PREMIER post, où le défaut ne se voyait pas (le fil n'ayant
// pas bougé, un rechargement en haut de page ATTERRIT par hasard sur la
// bonne carte). `p-glossaire` est le SECOND — et dernier — post du bouchon :
// aimer celui-là prouve que la place du lecteur survit au rechargement.
test('aimer une publication du BAS de la liste, sans JavaScript, la garde à l’écran après le rechargement', async ({
  browser,
}) => {
  const ctx = await contexte(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`${v3.base}/feed`);

  const article = page.locator('article[data-post="p-glossaire"]');
  await article.locator('.geste-aime button').click();
  await page.waitForURL(/\/feed\?fait=aime-retire#post-p-glossaire$/);

  // L'ANCRE a fait défiler la page jusqu'à la carte — elle est dans le
  // viewport, pas seulement présente dans le document.
  await expect(article).toBeInViewport();

  await ctx.close();
});
