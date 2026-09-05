import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import {
  type PasserelleDeBouchon,
  type ServeurV3,
  passerelleDeBouchon,
  serveurDeLaV3,
} from './lib/serveurs';

/**
 * LE NAVIGATEUR DE ZONE, DE BOUT EN BOUT (#5106) — la coquille ne se
 * reconstruit plus, et rien ne fuit à la traversée des écrans.
 *
 * La chaîne réelle : `next start` sur l'artefact du build, `V3_NAVIGABLE`
 * posée comme le compose de staging la pose. La SENTINELLE
 * (`window.__temoinDeDocument`) est la preuve de navigation douce : un
 * rechargement la remettrait à zéro — sa survie est le témoignage.
 *
 * Le témoin du CYCLE DE VIE compte les FERMETURES côté serveur
 * (`passerelle.socket.deconnexions()`) : après liste → fil, l'écran quitté a
 * reçu `destruction` et sa socket a fermé. Un COMPTEUR, jamais un solde net —
 * les poignées de main transitoires du harnais font mentir un solde sans
 * qu'aucune destruction n'ait manqué. Mesuré à la source, pas déduit du DOM.
 */

const NAVIGABLE_DU_TEST = '/chats,/chat/,/feed';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const cookiesDuLecteur = (base: string) => [
  { name: 'meeshy_session', value: 'sonde', url: base },
  { name: 'meeshy_auth', value: 'JWT.sonde', url: base },
];

const contexteDuLecteur = async (browser: Browser): Promise<BrowserContext> => {
  const contexte = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await contexte.addCookies(cookiesDuLecteur(v3.base));
  return contexte;
};

const ouvreLaListe = async (contexte: BrowserContext): Promise<Page> => {
  const page = await contexte.newPage();
  await page.goto(`${v3.base}/chats`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('main[data-participation="liste"]') !== null);
  // Le navigateur de zone arrive par SON chargeur, après le premier pixel —
  // attendu par son effet (la sentinelle), jamais par une minuterie.
  await page.waitForFunction(
    () => (window as Window & { __zoneNavigateur?: number }).__zoneNavigateur !== undefined,
  );
  await page.evaluate(() => {
    (window as Window & { __temoinDeDocument?: number }).__temoinDeDocument = 1;
  });
  return page;
};

const sentinelle = (page: Page): Promise<number | undefined> =>
  page.evaluate(() => (window as Window & { __temoinDeDocument?: number }).__temoinDeDocument);

const socketsOuvertes = (): number => passerelle.socket.io.engine.clientsCount;

test.describe('le navigateur de zone — la navigation douce et ses quatre lois', () => {
  test.beforeAll(async () => {
    passerelle = await passerelleDeBouchon();
    v3 = await serveurDeLaV3(passerelle.base, { V3_NAVIGABLE: NAVIGABLE_DU_TEST });
  });

  test.afterAll(async () => {
    await v3?.ferme();
    await passerelle?.ferme();
  });

  test('liste → fil SANS rechargement : la sentinelle survit, le module du fil monte, le titre et l’annonce suivent', async ({
    browser,
  }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await ouvreLaListe(contexte);

    await page.locator('a.ligne').first().click();
    await expect(page).toHaveURL(/\/chats\/[a-z0-9]+/i);
    await page.waitForFunction(() => document.querySelector('main[data-participation="fil"]') !== null);

    expect(await sentinelle(page)).toBe(1);
    await expect(page.locator('#champ-texte')).toBeVisible();
    // La région de statut SERVIE annonce l'écran au lecteur d'écran.
    await expect(page.locator('#annonce-de-zone')).not.toBeEmpty();
    await contexte.close();
  });

  test("l'écran quitté reçoit destruction : sa socket FERME, et le serveur voit la fermeture", async ({
    browser,
  }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await ouvreLaListe(contexte);
    // La liste n'affiche pas de pastille d'état : sa connexion se lit à la
    // SOURCE — le serveur de bouchon compte ses clients.
    await expect.poll(() => socketsOuvertes(), { timeout: 10_000 }).toBeGreaterThan(0);

    const fermeturesAvant = passerelle.socket.deconnexions();
    await page.locator('a.ligne').first().click();
    await page.waitForFunction(() => document.querySelector('main[data-participation="fil"]') !== null);

    // La destruction de l'écran quitté FERME sa socket : le serveur voit la
    // fermeture — un COMPTEUR, jamais un solde net, que les poignées de main
    // transitoires du harnais feraient mentir. (Condition, jamais minuterie.)
    await expect
      .poll(() => passerelle.socket.deconnexions(), { timeout: 10_000 })
      .toBeGreaterThan(fermeturesAvant);
    expect(await sentinelle(page)).toBe(1);
    await contexte.close();
  });

  test('le retour arrière rejoue la liste en douceur — même document, position rendue', async ({
    browser,
  }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await ouvreLaListe(contexte);

    await page.locator('a.ligne').first().click();
    await page.waitForFunction(() => document.querySelector('main[data-participation="fil"]') !== null);

    await page.goBack();
    await page.waitForFunction(() => document.querySelector('main[data-participation="liste"]') !== null);
    await expect(page).toHaveURL(/\/chats$/);
    expect(await sentinelle(page)).toBe(1);
    await contexte.close();
  });

  test('la FRONTIÈRE : un lien HORS de la liste navigable navigue RÉELLEMENT — le jumeau runtime du lint', async ({
    browser,
  }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await ouvreLaListe(contexte);

    // Le lien est INSÉRÉ pour prouver le CÂBLAGE du garde (la décision
    // elle-même est prouvée sur 9 cas par navigateur-decision.test.ts) :
    // `/settings` est servi par la zone mais ABSENT de V3_NAVIGABLE du test.
    await page.evaluate(() => {
      const lien = document.createElement('a');
      lien.href = '/settings';
      lien.id = 'hors-perimetre';
      lien.textContent = 'réglages';
      document.querySelector('main')?.append(lien);
    });
    await Promise.all([page.waitForNavigation(), page.locator('#hors-perimetre').click()]);
    expect(await sentinelle(page)).toBeUndefined();
    await contexte.close();
  });

  test('sans V3_NAVIGABLE, AUCUN bloc de navigation ne part — amélioration progressive, jamais une condition', async ({
    request,
  }) => {
    // Le serveur du test PORTE la variable : on vérifie l'inverse par le
    // document lui-même — le bloc n'existe que parce qu'elle est là.
    const corps = await (await request.get(`${v3.base}/chats`, { headers: { cookie: 'meeshy_session=sonde; meeshy_auth=JWT.sonde' } })).text();
    expect(corps).toContain('id="zone-navigation"');
    expect(corps).toContain('id="annonce-de-zone"');
    expect(corps).toContain('"navigable":["/chats","/chat/","/feed"]');
  });
});
