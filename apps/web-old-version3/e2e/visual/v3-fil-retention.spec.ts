import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { ALLERS_RETOURS, NAVIGATIONS, SOURCE_DU_COMPTEUR, verdictDeFuite, type Releve } from './lib/fuites';
import { CONVERSATION_DU_LECTEUR, passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

/**
 * LA MOITIÉ DE #5266 QUE L'UNITAIRE NE PEUT PAS PROUVER — `fil-gestes-menu.
 * test.ts` (« LA POIGNÉE DE DESTRUCTION ») prouve dans jsdom que `detruit()`
 * retire les trois écouteurs de `fil-gestes.ts` ; `feuille-de-lien.test.ts`
 * prouve que `armeLaFeuilleDeLien` ne laisse jamais deux écoutes au document.
 * Ce qui restait dû, et que jsdom ne rend pas observable, est la MESURE — sur
 * un vrai navigateur, `NAVIGATIONS` allers-retours doux avec MENU ET COMPOSEUR
 * ARMÉS pour le premier scénario, et `NAVIGATIONS` allers-retours doux après
 * une FEUILLE DE LIEN ouverte puis fermée pour le second — que rien ne
 * s'accumule.
 *
 * LA FEUILLE NE S'OUVRE QU'UNE FOIS, PAR CONCEPTION : `a.partager` déclenche
 * un rechargement RÉEL (`navigateur-decision.ts` › `extraitLEchange` refuse
 * le swap dès qu'un document cible porte une surimpression `body > dialog` —
 * mesuré ci-dessous, § du second test). Un rechargement remet tout à zéro ;
 * la série ne peut donc porter que sur ce qui SUIT cette unique ouverture —
 * les navigations douces, où `armeLaFeuilleDeLien` est ré-armée et
 * re-détachée à chaque traversée du fil, `?lien` ou non (`participate.ts`).
 *
 * L'INSTRUMENT est celui de `lib/fuites.ts` (#5106 § 12.11.3), déjà éprouvé
 * par `v3-navigateur-fuites.spec.ts` sur le navigateur de zone nu : ce fichier
 * ne réinvente rien, il REJOUE la même série en armant l'état que #5266 nomme.
 * Les deux écoutes visées vivent au `document` (`prendsLaFermetureDesMenus`
 * › `pointerdown`, et `armeLaFeuilleDeLien` › `submit`) : c'est précisément
 * le périmètre que `SOURCE_DU_COMPTEUR` observe.
 */

const NAVIGABLE_DU_TEST = '/chats,/chat/,/feed';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

type FenetreAvecCompteurs = Window & {
  __temoinDeDocument?: number;
  __fuites?: { readonly ecouteurs: () => number; readonly canaux: () => number };
};

const contexteDuLecteur = async (browser: Browser): Promise<BrowserContext> => {
  const contexte = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await contexte.addCookies([
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
  ]);
  // AVANT `newPage`, comme `v3-navigateur-fuites.spec.ts` : le compteur doit
  // être en place avant le premier écouteur posé par le module de la liste.
  await contexte.addInitScript(SOURCE_DU_COMPTEUR);
  return contexte;
};

const ouvreLaListe = async (contexte: BrowserContext): Promise<Page> => {
  const page = await contexte.newPage();
  await page.goto(`${v3.base}/chats`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('main[data-participation="liste"]') !== null);
  return page;
};

const socketsOuvertes = (): number => passerelle.socket.connectes();
const compteEcouteurs = (page: Page): Promise<number> =>
  page.evaluate(() => (window as FenetreAvecCompteurs).__fuites?.ecouteurs() ?? -1);
const compteCanaux = (page: Page): Promise<number> =>
  page.evaluate(() => (window as FenetreAvecCompteurs).__fuites?.canaux() ?? -1);

/** L'ALLER — `/chats` → le fil de `CONVERSATION_DU_LECTEUR` (première ligne servie). */
const entreDansLeFil = async (page: Page): Promise<void> => {
  await page.locator('a.ligne').first().click();
  await page.waitForFunction(() => document.querySelector('main[data-participation="fil"]') !== null);
  await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 15_000 });
};

/** Le RETOUR — le lien de tête du fil, jamais le « retour à l'accueil » de la coquille persistante. */
const revientAuxChats = async (page: Page): Promise<void> => {
  await page.locator('main a.retour').click();
  await page.waitForFunction(() => document.querySelector('main[data-participation="liste"]') !== null);
  await expect.poll(socketsOuvertes, { timeout: 10_000 }).toBe(1);
};

const FIL = (): string => `${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}`;

/**
 * LE VERDICT PARTAGÉ DES DEUX SCÉNARIOS — même relecture que
 * `v3-navigateur-fuites.spec.ts` : la sentinelle anti-rechargement, l'invariant
 * de `verdictDeFuite`, et EXACTEMENT une connexion socket survivante, le
 * chevauchement d'un handshake toléré (jamais une accumulation).
 */
const verifieLaSerie = async (page: Page, serie: readonly Releve[]): Promise<void> => {
  expect(await page.evaluate(() => (window as FenetreAvecCompteurs).__temoinDeDocument)).toBe(1);

  const verdict = verdictDeFuite(serie);
  expect(verdict.vert ? '' : verdict.raison).toBe('');

  expect(passerelle.socket.connexions() - passerelle.socket.deconnexions()).toBe(1);
  expect(passerelle.socket.pointe()).toBeLessThanOrEqual(2);
};

test.describe('rétention mémoire du fil et de la feuille de lien (#5266, § 12.11 étage 3)', () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    passerelle = await passerelleDeBouchon();
    v3 = await serveurDeLaV3(passerelle.base, { V3_NAVIGABLE: NAVIGABLE_DU_TEST });
  });

  test.afterAll(async () => {
    await v3?.ferme();
    await passerelle?.ferme();
  });

  test(`${NAVIGATIONS} navigations douces, menu de ligne ouvert et composeur armé à chaque aller : rien ne croît`, async ({ browser }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await ouvreLaListe(contexte);
    await expect.poll(socketsOuvertes, { timeout: 10_000 }).toBe(1);
    await page.evaluate(() => {
      (window as FenetreAvecCompteurs).__temoinDeDocument = 1;
    });

    const serie: Releve[] = [];

    for (let allerRetour = 0; allerRetour < ALLERS_RETOURS; allerRetour += 1) {
      await entreDansLeFil(page);

      // LE MENU S'OUVRE (pose l'écoute `pointerdown` de fermeture-hors-clic sur
      // le document si elle ne l'était pas déjà), PUIS « Répondre » ARME le
      // composeur SANS naviguer (`fil-gestes.ts` › `prendsLeMenu`) — l'état
      // que #5266 nomme, laissé actif jusqu'au retour.
      const menu = page.locator('li[data-id="m1"] details.actions');
      await menu.locator('summary').click();
      await menu.locator('button[name="repondre"]').click();
      await expect(page.locator('#contexte-du-composeur')).toBeVisible();

      await revientAuxChats(page);

      serie.push({
        ecouteurs: await compteEcouteurs(page),
        canaux: await compteCanaux(page),
        socketsOuvertes: socketsOuvertes(),
      });
    }

    await verifieLaSerie(page, serie);
    await contexte.close();
  });

  /**
   * OUVRIR LA FEUILLE N'EST PAS UNE NAVIGATION DOUCE, PAR CONCEPTION — MESURÉ,
   * pas supposé. `navigateur-decision.ts` › `extraitLEchange` refuse le swap
   * dès que le document CIBLE porte une surimpression (`body > dialog`,
   * `porteUneSurimpression`) : « mieux vaut un rechargement qu'un écran
   * composé à moitié ». `dialog.nouveau-lien` EST une telle surimpression
   * (`feuille-de-lien.ts` : « la feuille vit HORS de `<main>` »). Un
   * relevé direct (`page.on('load')`) confirme qu'`a.partager` déclenche
   * EXACTEMENT un `load` — jamais un `fetch` du navigateur de zone.
   *
   * La série de #5266 ne peut donc pas « ouvrir puis fermer la feuille à
   * chaque aller » sans faire de chaque aller un rechargement — ce qui ne
   * mesurerait RIEN (un rechargement remet tout à zéro par construction). Le
   * scénario fidèle à l'architecture, et celui qui expose le risque RÉEL
   * (`armeLaFeuilleDeLien`, appelée à CHAQUE montage du fil — `?lien` ou non,
   * `participate.ts:818` — DÉTACHE la précédente avant de poser la sienne) :
   * UNE feuille ouverte par un rechargement direct sur `?lien`, refermée par
   * Échap (client, sans rechargement), puis `NAVIGATIONS` navigations douces
   * qui ré-arment et re-détachent ce même écouteur de document à chaque
   * traversée. Si le détachement de `destruction` (`participate.ts:738`)
   * avait un trou, c'est CETTE boucle qui le ferait croître.
   */
  test(`la feuille de lien ouverte une fois puis fermée, suivie de ${NAVIGATIONS} navigations douces : rien ne croît`, async ({ browser }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await contexte.newPage();

    // LE SEUL RECHARGEMENT DU TEST — la feuille arrive déjà ouverte (SSR),
    // comme un lecteur qui suit un lien externe vers `?lien` le vivrait.
    await page.goto(`${FIL()}?lien`, { waitUntil: 'load' });
    await expect(page.locator('dialog.nouveau-lien')).toBeVisible();
    await page.waitForFunction(() => document.querySelector('dialog.nouveau-lien')?.matches(':modal') === true);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.nouveau-lien')).toHaveCount(0);
    await expect(page).toHaveURL(FIL());

    // LA SÉRIE COMMENCE ICI — après l'unique rechargement, sur le fil qu'il a laissé.
    await expect.poll(socketsOuvertes, { timeout: 10_000 }).toBe(1);
    await page.evaluate(() => {
      (window as FenetreAvecCompteurs).__temoinDeDocument = 1;
    });

    const serie: Releve[] = [];

    for (let allerRetour = 0; allerRetour < ALLERS_RETOURS; allerRetour += 1) {
      await revientAuxChats(page);
      await entreDansLeFil(page);

      serie.push({
        ecouteurs: await compteEcouteurs(page),
        canaux: await compteCanaux(page),
        socketsOuvertes: socketsOuvertes(),
      });
    }

    await verifieLaSerie(page, serie);
    await contexte.close();
  });
});
