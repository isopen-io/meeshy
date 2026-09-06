import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { ALLERS_RETOURS, NAVIGATIONS, SOURCE_DU_COMPTEUR, verdictDeFuite, type Releve } from './lib/fuites';
import {
  passerelleDeBouchon,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * LA PREUVE QUE L'ÉTAGE 3 NE FUIT PAS (#5106, § 12.11.3 points 4 et 6 ; § 12.12,
 * la restante « rétention mémoire non mesurée »). `v3-navigateur.spec.ts` prouve
 * les GESTES de la navigation douce (sentinelle, fermeture d'UNE socket, retour
 * arrière, frontière) sur une poignée de traversées ; cette spec DÉDIÉE (§ 9
 * Q2 de la spécification) prouve l'INVARIANT sur les 20 navigations de `NAVIGATIONS` :
 * rien ne croît, et UNE seule connexion survit.
 *
 * Spec DÉDIÉE plutôt qu'un ajout au fichier voisin — boucle longue, script
 * d'initialisation propre, timeout propre ; l'autre garde son récit en
 * témoins courts.
 */

const NAVIGABLE_DU_TEST = '/chats,/chat/,/feed';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const cookiesDuLecteur = (base: string) => [
  { name: 'meeshy_session', value: 'sonde', url: base },
  { name: 'meeshy_auth', value: 'JWT.sonde', url: base },
];

type FenetreAvecCompteurs = Window & {
  __zoneNavigateur?: number;
  __temoinDeDocument?: number;
  __fuites?: { readonly ecouteurs: () => number; readonly canaux: () => number };
};

const contexteDuLecteur = async (browser: Browser): Promise<BrowserContext> => {
  const contexte = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await contexte.addCookies(cookiesDuLecteur(v3.base));
  // AVANT `newPage` : le script d'initialisation doit être en place avant le
  // premier octet de JavaScript de la page, sans quoi les tout premiers
  // écouteurs (le navigateur de zone, armé au chargement du module) échapperaient
  // au compte.
  await contexte.addInitScript(SOURCE_DU_COMPTEUR);
  return contexte;
};

const ouvreLaListe = async (contexte: BrowserContext): Promise<Page> => {
  const page = await contexte.newPage();
  await page.goto(`${v3.base}/chats`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('main[data-participation="liste"]') !== null);
  // Le navigateur de zone arrive par SON chargeur, après le premier pixel.
  await page.waitForFunction(() => (window as FenetreAvecCompteurs).__zoneNavigateur !== undefined);
  return page;
};

const socketsOuvertes = (): number => passerelle.socket.connectes();
// `-1` est DÉLIBÉRÉ et REFUSÉ : `verdictDeFuite` rougit sur tout relevé à moins
// d'UN écouteur ou à un compte de canaux négatif (« inertie du compteur »). Sans
// cette garde, un `addInitScript` non installé rendrait une série PLATE de `-1`,
// et la moitié « listeners » du critère de fin sortirait verte sans rien mesurer.
const compteEcouteurs = (page: Page): Promise<number> =>
  page.evaluate(() => (window as FenetreAvecCompteurs).__fuites?.ecouteurs() ?? -1);
const compteCanaux = (page: Page): Promise<number> =>
  page.evaluate(() => (window as FenetreAvecCompteurs).__fuites?.canaux() ?? -1);

test.describe('le navigateur de zone ne fuit ni listener ni socket', () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    passerelle = await passerelleDeBouchon();
    v3 = await serveurDeLaV3(passerelle.base, { V3_NAVIGABLE: NAVIGABLE_DU_TEST });
  });

  test.afterAll(async () => {
    await v3?.ferme();
    await passerelle?.ferme();
  });

  test(`${NAVIGATIONS} navigations /chats → fil → /chats : rien ne croît, une seule connexion survit`, async ({
    browser,
  }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await ouvreLaListe(contexte);

    // La socket de la LISTE s'ouvre au premier pixel du module — condition,
    // jamais une minuterie.
    await expect.poll(socketsOuvertes, { timeout: 10_000 }).toBe(1);
    await page.evaluate(() => {
      (window as FenetreAvecCompteurs).__temoinDeDocument = 1;
    });

    const serie: Releve[] = [];

    for (let allerRetour = 0; allerRetour < ALLERS_RETOURS; allerRetour += 1) {
      // ALLER — /chats/:cle. Le chevauchement d'un handshake est LÉGITIME ici
      // (§ 9 Q1 : l'ancienne socket qui ferme et la neuve qui s'ouvre peuvent
      // se croiser) — c'est pourquoi l'invariant « UNE seule » se lit au
      // RETOUR, jamais à l'aller : Témoin B (`pointe() <= 2`, en fin de test)
      // couvre ce chevauchement.
      await page.locator('a.ligne').first().click();
      await page.waitForFunction(() => document.querySelector('main[data-participation="fil"]') !== null);

      // RETOUR — le lien de tête DU FIL (`fil-vue.ts:253`, `main a.retour`
      // pour ne jamais confondre avec le « Retour à l'accueil » de la
      // coquille persistante, hors de `<main>`, que le swap ne touche pas).
      await page.locator('main a.retour').click();
      await page.waitForFunction(() => document.querySelector('main[data-participation="liste"]') !== null);
      // LE COMPTE DE SOCKETS OUVERTES NE CROÎT PAS DE FAÇON MONOTONE, à CHAQUE
      // pas — pas seulement à la fin de la séquence.
      await expect.poll(socketsOuvertes, { timeout: 10_000 }).toBe(1);

      serie.push({
        ecouteurs: await compteEcouteurs(page),
        canaux: await compteCanaux(page),
        socketsOuvertes: socketsOuvertes(),
      });
    }

    // LA GARDE ANTI-VERT-PAR-RECHARGEMENT : un rechargement aurait remis à
    // zéro `__temoinDeDocument` ET tous les compteurs du script d'init,
    // fabriquant un faux plat. Sa survie prouve que les 20 navigations de
    // `NAVIGATIONS` ont bien été DOUCES.
    expect(await page.evaluate(() => (window as FenetreAvecCompteurs).__temoinDeDocument)).toBe(1);

    const verdict = verdictDeFuite(serie);
    expect(verdict.vert ? '' : verdict.raison).toBe('');

    // UNE SEULE CONNEXION SURVIT : il ne reste EXACTEMENT que celle de l'écran
    // courant — jamais un total absolu (§ 9 Q1 de la spécification : cette
    // forme reste vraie le jour où les deux écrans partageront un socket).
    expect(passerelle.socket.connexions() - passerelle.socket.deconnexions()).toBe(1);

    // LE POINT 6, DANS SA FORME OPPOSABLE AUJOURD'HUI : l'ancienne socket qui
    // se ferme et la neuve qui s'ouvre peuvent chevaucher le temps d'un
    // handshake (2), jamais s'accumuler (3+). La forme FORTE — jamais fermée
    // quand les deux écrans partagent un socket authentifié — est un chantier
    // de production distinct (§ 9 Q1) ; ces assertions resteront vertes ce
    // jour-là.
    expect(passerelle.socket.pointe()).toBeLessThanOrEqual(2);

    await contexte.close();
  });
});
