import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { porteInvitee } from './lib/porte-invitee';
import {
  CONVERSATION_DU_LECTEUR,
  INVITE,
  PAIR_HISPANOPHONE,
  passerelleDeBouchon,
  RACINE_V3,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * LE PROFIL D'UN PARTICIPANT (§ 12.10.3) — sur la chaîne RÉELLE : le serveur de
 * la v3 tel que `next build` l'a émis, et la passerelle de bouchon qui MIME
 * `GET /directory/people/:handle?expand=relation`, `POST /conversations`,
 * `POST /directory/friend-requests` et `PUT /directory/blocks/:userId`
 * (chacune nommée dans `lib/bouchon-compte.ts`).
 *
 * Marta Ruiz (`u3`) écrit le message `m3` de la conversation « Équipe Lagos » :
 * son avatar et son nom y ouvrent son profil, aux TROIS adresses.
 *
 * SANS JAVASCRIPT, UN CLIC SUR UN `<a href>` DÉCLENCHE UNE NAVIGATION QUE
 * `.click()` SEUL N'ATTEND PAS : chaque clic qui doit changer l'adresse est
 * donc apparié à `page.waitForURL(...)` dans le MÊME `Promise.all`, comme le
 * reste de la suite (`v3-fil-invite.spec.ts`) — jamais un `page.url()` lu
 * juste après un `.click()` nu.
 */

const DOSSIER_DES_RENDUS = process.env.RENDUS_DIR ?? join(RACINE_V3, 'test-results', 'rendus');

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const FIL = (): string => `${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}`;

const contexteDuMembre = async (navigateur: Browser, options: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> => {
  const contexte = await navigateur.newContext(options);
  await contexte.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  return contexte;
};

/**
 * Clique, et ATTEND la navigation qu'un `<a href>` déclenche sans JavaScript.
 *
 * `position` sert UNIQUEMENT au voile : plein écran (`inset:0`), il est
 * RECOUVERT par la feuille basse (`dialog.profil`, ancrée en bas) sur 90 % de
 * sa hauteur — exactement ce que la charte demande (« ce qui flotte se
 * distingue par un PLAN »). Un clic au CENTRE (le défaut de Playwright)
 * atteint donc le panneau, pas le voile ; le geste réel, lui, touche la
 * bande EXPOSÉE au-dessus de la feuille — reproduite ici en ciblant son coin.
 */
const cliqueEtNavigue = async (
  page: Page,
  selecteur: string,
  attendu: (url: URL) => boolean,
  position?: { readonly x: number; readonly y: number },
): Promise<void> => {
  await Promise.all([page.waitForURL(attendu, { timeout: 15_000 }), page.locator(selecteur).click({ position })]);
};

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test.beforeEach(() => {
  passerelle.oublie();
});

test.describe('depuis /chats/:cle — sans JavaScript', () => {
  test("cliquer l'avatar navigue vers ?profil=<handle>, le fil reste, un dialog s'ouvre — zéro requête de script", async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(FIL(), { waitUntil: 'load' });

    const avatar = page.locator('li[data-id="m3"] a.avatar-lien');
    await expect(avatar).toHaveAttribute('href', `/chats/${CONVERSATION_DU_LECTEUR.id}?profil=${PAIR_HISPANOPHONE.id}`);
    await cliqueEtNavigue(page, 'li[data-id="m3"] a.avatar-lien', (u) => u.searchParams.get('profil') === PAIR_HISPANOPHONE.id);

    // Le fil reste — même document, aucun second écran.
    await expect(page.locator('li[data-id="m3"]')).toBeVisible();
    const dialogue = page.locator('dialog.profil');
    await expect(dialogue).toBeVisible();
    await expect(dialogue).toHaveAttribute('open', '');
    await expect(dialogue.locator('h2')).toHaveText('Marta Ruiz');
    await expect(dialogue.locator('.pseudo')).toHaveText('@marta');

    // Zéro requête de script : aucun fichier .js n'a été demandé.
    const requetesJs = passerelle.journal.filter((appel) => appel.chemin.endsWith('.js'));
    expect(requetesJs).toEqual([]);
    await contexte.close();
  });

  test('le NOM ouvre la MÊME surimpression', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(FIL(), { waitUntil: 'load' });

    await cliqueEtNavigue(page, 'li[data-id="m3"] a.nom-lien', (u) => u.searchParams.get('profil') === PAIR_HISPANOPHONE.id);
    await expect(page.locator('dialog.profil h2')).toHaveText('Marta Ruiz');
    await contexte.close();
  });

  test('la croix, le voile et la poignée rendent /chats/:cle SANS ?profil= — trois chemins, un seul effet', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    const adresseAvecProfil = `${FIL()}?profil=${PAIR_HISPANOPHONE.id}`;
    const sansProfil = (u: URL): boolean => u.search === '';

    await page.goto(adresseAvecProfil, { waitUntil: 'load' });
    await expect(page.locator('dialog.profil')).toBeVisible();
    await cliqueEtNavigue(page, 'dialog.profil .fermer', sansProfil);
    await expect(page.locator('dialog.profil')).toHaveCount(0);

    await page.goto(adresseAvecProfil, { waitUntil: 'load' });
    // Le voile recouvre l'écran ENTIER, mais la feuille basse (`dialog.profil`)
    // le RECOUVRE à son tour sur 90 % de sa hauteur : la bande EXPOSÉE, celle
    // qu'un doigt atteint réellement, est au-dessus d'elle.
    await cliqueEtNavigue(page, 'a.voile', sansProfil, { x: 8, y: 8 });

    await page.goto(adresseAvecProfil, { waitUntil: 'load' });
    await cliqueEtNavigue(page, 'dialog.profil .poignee', sansProfil);
    await contexte.close();
  });

  test('le fil est INERTE derrière la surimpression, et déclaré modal', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${FIL()}?profil=${PAIR_HISPANOPHONE.id}`, { waitUntil: 'load' });
    await expect(page.locator('main#main-content')).toHaveAttribute('inert', '');
    await expect(page.locator('dialog.profil')).toHaveAttribute('aria-modal', 'true');
    await contexte.close();
  });

  test('charge SANS isOnline — zéro pastille de présence dans le DOM', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${FIL()}?profil=${PAIR_HISPANOPHONE.id}`, { waitUntil: 'load' });
    expect(await page.locator('dialog.profil .presence, dialog.profil [data-online]').count()).toBe(0);
    await contexte.close();
  });

  test('dit la langue DEPUIS LE FIL — jamais une langue du profil', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${FIL()}?profil=${PAIR_HISPANOPHONE.id}`, { waitUntil: 'load' });
    // Le dernier message de Marta (m3) est en espagnol.
    await expect(page.locator('dialog.profil .infos li').first()).toContainText('Español');
    await contexte.close();
  });

  test('« Écrire » ouvre le tête-à-tête — POST /conversations, puis 303', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${FIL()}?profil=${PAIR_HISPANOPHONE.id}`, { waitUntil: 'load' });

    await cliqueEtNavigue(page, 'dialog.profil form button:has-text("Écrire")', (u) => u.pathname === '/chats/c-neuve-marta');
    expect(passerelle.journal.some((a) => a.methode === 'POST' && a.chemin === '/api/v1/conversations')).toBe(true);
    await contexte.close();
  });

  test('« Ajouter en ami » poste POST /directory/friend-requests, revient sur le profil', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${FIL()}?profil=${PAIR_HISPANOPHONE.id}`, { waitUntil: 'load' });

    await cliqueEtNavigue(page, 'dialog.profil form button:has-text("Ajouter en ami")', (u) => u.searchParams.get('profil') === PAIR_HISPANOPHONE.id);
    expect(passerelle.journal.some((a) => a.methode === 'POST' && a.chemin === '/api/v1/directory/friend-requests')).toBe(true);
    await expect(page.locator('dialog.profil')).toBeVisible();
    await contexte.close();
  });

  test('« Bloquer » demande confirmation SANS confirm(), puis PUT /directory/blocks/:userId', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${FIL()}?profil=${PAIR_HISPANOPHONE.id}`, { waitUntil: 'load' });

    await cliqueEtNavigue(page, 'dialog.profil a.action.grave', (u) => u.searchParams.get('confirmer') === 'bloquer');
    await expect(page.locator('dialog.profil .confirmation')).toBeVisible();

    await cliqueEtNavigue(page, 'dialog.profil .confirmation button', (u) => u.search === '');
    expect(passerelle.journal.some((a) => a.methode === 'PUT' && a.chemin === `/api/v1/directory/blocks/${PAIR_HISPANOPHONE.id}`)).toBe(true);
    await contexte.close();
  });
});

test.describe('depuis /chat/:lien (invité) — sans JavaScript', () => {
  const porte = porteInvitee({ passerelle: () => passerelle, v3: () => v3 });

  test.beforeEach(() => {
    passerelle.placesActives.add(INVITE.session);
    passerelle.lien.actif = true;
    passerelle.place.reinitialise();
  });

  test('un invité anonyme voit le profil, sans AUCUNE des trois actions', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(porte.adresse, { waitUntil: 'load' });

    await cliqueEtNavigue(page, 'li[data-id="m3"] a.avatar-lien', (u) => u.searchParams.get('profil') === PAIR_HISPANOPHONE.id);
    await expect(page.locator('dialog.profil h2')).toHaveText('Marta Ruiz');
    expect(await page.locator('dialog.profil form').count()).toBe(0);
    expect(await page.locator('dialog.profil .action.primaire').count()).toBe(0);

    await cliqueEtNavigue(page, 'dialog.profil .fermer', (u) => u.search === '');
    await contexte.close();
  });
});

test.describe('depuis /chats (la liste) — sans JavaScript', () => {
  test("l'avatar du tête-à-tête ouvre le profil de Marta, et la croix rend /chats", async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/chats`, { waitUntil: 'load' });

    const avatar = page.locator('a.avatar-lien');
    await expect(avatar).toHaveAttribute('href', `/chats?profil=${PAIR_HISPANOPHONE.id}`);
    await cliqueEtNavigue(page, 'a.avatar-lien', (u) => u.pathname === '/chats' && u.searchParams.get('profil') === PAIR_HISPANOPHONE.id);

    await expect(page.locator('dialog.profil h2')).toHaveText('Marta Ruiz');
    // La conversation en commun, retrouvée LOCALEMENT.
    await expect(page.locator('dialog.profil .infos')).toContainText('Marta Ruiz');

    await cliqueEtNavigue(page, 'dialog.profil .fermer', (u) => u.pathname === '/chats' && u.search === '');
    await expect(page.locator('div.enveloppe')).not.toHaveAttribute('inert', '');
    await contexte.close();
  });
});

test.describe('avec JavaScript — Échap ferme le panneau, jamais comme seul chemin', () => {
  test('Échap ferme le profil et rend le fil', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await contexte.newPage();
    await page.goto(`${FIL()}?profil=${PAIR_HISPANOPHONE.id}`, { waitUntil: 'load' });

    await expect
      .poll(() => page.evaluate(() => document.querySelector('dialog.profil')?.matches(':modal') ?? false), { timeout: 15_000 })
      .toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForURL((url) => url.search === '', { timeout: 15_000 });
    await expect(page.locator('li[data-id="m3"]')).toBeVisible();
    await contexte.close();
  });
});

test.describe('les rendus que le rapport regarde', () => {
  test('capture 390×844 du panneau ouvert — clair et sombre', async ({ browser }) => {
    mkdirSync(DOSSIER_DES_RENDUS, { recursive: true });
    for (const schema of ['light', 'dark'] as const) {
      const contexte = await contexteDuMembre(browser, { colorScheme: schema, viewport: { width: 390, height: 844 } });
      const page = await contexte.newPage();
      await page.goto(`${FIL()}?profil=${PAIR_HISPANOPHONE.id}`, { waitUntil: 'load' });
      await expect(page.locator('dialog.profil')).toBeVisible();
      await page.screenshot({ path: join(DOSSIER_DES_RENDUS, `profilMembre-${schema}.png`) });
      await contexte.close();
    }
  });
});
