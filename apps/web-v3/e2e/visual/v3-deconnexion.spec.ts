// GATE — `/deconnexion` (#5095) : ON SORT ENFIN DE LA V3.
//
// `__tests__/deconnexion.test.ts` (jsdom/node) juge la porte par son API
// publique ; `__tests__/sw-zone.test.ts` juge la purge ; ce fichier juge ce
// qu'un VRAI navigateur en fait — le geste CLAVIER du critère de fin (Tab
// jusqu'au bouton, Entrée) contre la passerelle de bouchon, et que le jar ne
// porte plus ni `meeshy_auth` ni `meeshy_session` une fois sorti.
//
// Le bouchon copie `POST /api/v1/auth/logout`
// (`services/gateway/src/routes/auth/login.ts:350`) — voir
// `e2e/visual/lib/bouchon-compte.ts`.

import { expect, test } from '@playwright/test';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { ESPACE } from '../../lib/contenu/espace';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { porteInvitee } from './lib/porte-invitee';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

/**
 * LE PÉRIMÈTRE NAVIGABLE DU DÉPLOIEMENT — celui du compose de staging
 * (`docker-compose.staging.yml:340`), et non l'absence de périmètre. Sans lui
 * le navigateur de zone n'est même pas servi, et ce gate mesurait une chaîne
 * que personne ne parcourt : c'est ainsi que « Mon espace » a pu rester INERTE
 * sur `/chats` avec deux tests verts.
 */
const NAVIGABLE_DU_TEST = '/chats,/chat/,/feed';

/** Les portées du travailleur, telles que le compose de staging les pose. */
const PORTEES_DU_TEST = '/l/,/chats,/chat/';

const porte = porteInvitee({ passerelle: () => passerelle, v3: () => v3 });

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  v3 = await serveurDeLaV3(passerelle.base, {
    V3_NAVIGABLE: NAVIGABLE_DU_TEST,
    V3_SW_PORTEES: PORTEES_DU_TEST,
  });
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test('Tab jusqu’au bouton, Entrée — atterrit sur / et le jar ne porte plus le jeton ni la session', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/chats?espace`);
  await expect(page.locator('dialog.espace')).toBeVisible();

  const bouton = page.getByRole('button', { name: ESPACE.deconnecter });
  await bouton.focus();
  await expect(bouton).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(`${v3.base}/`);

  const jar = await ctx.cookies();
  expect(jar.find((c) => c.name === COOKIE_DE_JETON)).toBeUndefined();
  expect(jar.find((c) => c.name === COOKIE_DE_SESSION)).toBeUndefined();

  await ctx.close();
});

test('le clic seul marche aussi — même geste, souris', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/?espace`);
  await page.getByRole('button', { name: ESPACE.deconnecter }).click();

  await expect(page).toHaveURL(`${v3.base}/`);
  const jar = await ctx.cookies();
  expect(jar.find((c) => c.name === COOKIE_DE_SESSION)).toBeUndefined();

  await ctx.close();
});

/**
 * LE CHEMIN RÉEL DU LECTEUR — « Mon espace » depuis `/chats`, sous le
 * navigateur de zone (#5106). Les deux tests ci-dessus ouvrent `?espace` par
 * l'ADRESSE ; personne n'y arrive comme cela. Mesuré le 2026-09-05 sur la
 * livraison : le clic posait `/chats?espace` et ne montrait AUCUN dialogue —
 * l'échange de zone ne porte que `<main>`, et la surimpression vit hors de lui
 * (`app/enveloppe/vue.ts:198`). Le contrôle de sortie était donc INJOIGNABLE
 * là où le porteur le cherche.
 */
test('depuis /chats, « Mon espace » ouvre le dialogue et la sortie SORT — sous le navigateur de zone', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/chats`);
  await page.locator('a[href="/chats?espace"]').first().click();

  await expect(page.locator('dialog.espace')).toBeVisible();
  const bouton = page.getByRole('button', { name: ESPACE.deconnecter });
  await expect(bouton).toBeVisible();
  await bouton.click();

  await expect(page).toHaveURL(`${v3.base}/`);
  const jar = await ctx.cookies();
  expect(jar.find((c) => c.name === COOKIE_DE_JETON)).toBeUndefined();
  expect(jar.find((c) => c.name === COOKIE_DE_SESSION)).toBeUndefined();

  await ctx.close();
});

/**
 * LE CRITÈRE 3, DE BOUT EN BOUT — « plus aucune entrée d'API au namespace v3 ».
 *
 * `__tests__/sw-zone.test.ts` prouve que le travailleur purge à RÉCEPTION du
 * signal ; `__tests__/deconnexion-navigateur.test.ts` prouve que le module le
 * POSTE. Deux moitiés qui partagent une constante ne prouvent pas la CHAÎNE :
 * il fallait un vrai navigateur, un vrai worker enregistré, un vrai
 * Cache Storage.
 *
 * LE CHEMIN EST CELUI DU DÉPÔT, PAS UN CHEMIN COMMODE. Mesuré le 2026-09-05 :
 * `/chats` n'enregistre AUCUN travailleur — seul le FIL sert
 * `SCRIPT_DU_TRAVAILLEUR` (`app/connecte/fil-vue.ts:641`). Le worker de zone
 * naît donc à la porte INVITÉE, et ses caches survivent à tout ce qui suit :
 * ce sont EUX que la sortie doit emporter. Le scénario est réel — on ouvre un
 * lien reçu, puis on se connecte, puis on se déconnecte sur un appareil
 * partagé.
 */
test('à la sortie, plus AUCUN cache du namespace v3 ne reste dans le navigateur', async ({
  browser,
}) => {
  const ctx = await porte.contexteDeLInvite(browser, { viewport: { width: 390, height: 844 } });

  // 1. La porte invitée : elle SEULE enregistre le travailleur de zone.
  const page = await porte.ouvre(ctx);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.reload();
  await page.waitForFunction(async () =>
    (await caches.keys()).some((nom) => nom.startsWith('meeshy-v3-sw-')),
  );
  const avant = (await page.evaluate(() => caches.keys())).filter((n) =>
    n.startsWith('meeshy-v3-sw-'),
  );
  expect(avant.length).toBeGreaterThan(0);

  // 2. Le même navigateur porte maintenant une session de MEMBRE.
  await ctx.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);

  // 3. Il sort — et le travailleur emporte SES caches, ceux du lien compris.
  await page.goto(`${v3.base}/chats?espace`);
  await page.getByRole('button', { name: ESPACE.deconnecter }).click();
  await expect(page).toHaveURL(`${v3.base}/`);

  await expect
    .poll(async () => (await page.evaluate(() => caches.keys())).filter((n) => n.startsWith('meeshy-v3-sw-')).length)
    .toBe(0);

  await ctx.close();
});
