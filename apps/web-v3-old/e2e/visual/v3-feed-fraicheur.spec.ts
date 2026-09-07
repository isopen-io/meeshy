// GATE — LA FRAÎCHEUR DE `/feed` AU RETOUR (#5031, § 11 question 13).
//
// LA QUESTION 13 DEMANDAIT : socket dédié, `GET /sync`, ou instantané assumé ?
// Aucune des trois. Un socket coûte 12 849 o gzip — plus que le module entier —
// pour une connexion PERMANENTE sur l'écran que la directive du porteur destine
// à la 3G rurale. `GET /sync` ne sert PAS les publications (ses collections sont
// `conversations`, `messages`, `reactions`, `participants`). L'instantané assumé
// laisse un fil vieux d'une heure.
//
// La quatrième voie est le RETOUR : quand le lecteur revient après une absence,
// le document `/feed` est redemandé et ses publications échangées. Coût mesuré :
// +1 674 o gzip, soit 7,7 fois moins qu'un socket, pour le cas dominant.
//
// CE QUE CE FICHIER PROUVE, ET QU'AUCUN TÉMOIN DE NŒUD NE PEUT DIRE : que le
// module DIFFÉRÉ voit l'absence, la MESURE, et n'échange la liste que sous les
// deux conditions — l'absence longue, et le lecteur EN TÊTE. La seconde est la
// plus importante : remplacer la liste sous quelqu'un qui a défilé lui arrache
// ce qu'il lit.
//
// La publication neuve est posée ENTRE les deux lectures, comme un ami la
// posterait pendant qu'on regarde ailleurs. Un témoin qui rechargerait un fil
// INCHANGÉ passerait aussi bien avec un module qui ne rafraîchit rien.

import { expect, test, type Browser, type Page } from '@playwright/test';

import { COOKIE_DE_JETON } from '../../lib/api/cookies';
import { SEUIL_DE_RATTRAPAGE_MS } from '../../lib/realtime/reconnect-policy';
import { avance, figeLHorloge, installeLHorloge, occulte, revele } from './lib/navigateur-cycle';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

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

test.beforeEach(() => {
  passerelle.filSocial.remets();
  passerelle.oublie();
});

const NEUVE = 'Une publication posée pendant qu’on regardait ailleurs.';

/** L'absence dépasse LARGEMENT le seuil partagé — on juge la règle, pas sa borne. */
const ABSENCE_MS = SEUIL_DE_RATTRAPAGE_MS * 4;

/**
 * Combien de lignes portent la publication neuve — 0 ou 1. On COMPTE plutôt
 * qu'on n'assère un texte sur la liste : `#publications li` désigne plusieurs
 * nœuds, et un `not.toContainText` sur un locator multiple est une erreur de
 * mode strict, jamais un verdict.
 */
const lignesNeuves = (page: Page) => page.locator('#publications li', { hasText: NEUVE });

const ouvreLeFil = async (browser: Browser): Promise<Page> => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base }]);
  await installeLHorloge(ctx);
  const page = await ctx.newPage();
  const reponse = await page.goto(`${v3.base}/feed`, { waitUntil: 'domcontentloaded' });
  expect(reponse?.status(), '/feed n’a pas servi le fil').toBe(200);
  // Le module arrive APRÈS le premier pixel : on l'attend par son EFFET.
  await page.waitForFunction(() => document.querySelector('main[data-participation="feed"]') !== null);
  await page.waitForTimeout(1_200);
  await figeLHorloge(ctx);
  return page;
};

/** L'onglet part, le temps passe, l'onglet revient — la séquence exacte du cas dominant. */
const partEtRevient = async (page: Page, dureeMs: number): Promise<void> => {
  const ctx = page.context();
  await occulte(page);
  await avance(ctx, dureeMs);
  await revele(page);
  await page.waitForTimeout(600);
};

test('au retour après une absence, le fil se rafraîchit — en tête, sans socket', async ({ browser }) => {
  const page = await ouvreLeFil(browser);

  await expect(lignesNeuves(page)).toHaveCount(0);
  passerelle.filSocial.publie(NEUVE);

  await partEtRevient(page, ABSENCE_MS);

  await expect(page.locator('#publications li').first()).toContainText(NEUVE);

  await page.context().close();
});

/**
 * LE TÉMOIN LE PLUS IMPORTANT — celui qui garde ce que le module REFUSE de
 * faire. Une personne qui a défilé a CHOISI un endroit ; lui réécrire la liste
 * sous le doigt fait sauter la lecture et ressemble à un bogue. Le fil reste
 * donc périmé, délibérément, et il n'y a pas d'affordance « nouvelles
 * publications » — ce serait une UI et une copie que la cible ne dessine pas.
 */
test('mais JAMAIS sous un lecteur qui a défilé — la liste ne s’arrache pas', async ({ browser }) => {
  const page = await ouvreLeFil(browser);

  await page.evaluate(() => {
    document.body.style.minHeight = '4000px';
    window.scrollTo(0, 1200);
  });
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  passerelle.filSocial.publie(NEUVE);
  await partEtRevient(page, ABSENCE_MS);

  await expect(lignesNeuves(page)).toHaveCount(0);

  await page.context().close();
});

/**
 * UN ALLER-RETOUR COURT NE RAFRAÎCHIT RIEN. Le seuil est celui du rattrapage
 * des deux surfaces à socket : un fil qui clignoterait pour trois secondes
 * d'absence serait une nuisance, pas une fraîcheur.
 */
test('une absence de trois secondes ne déclenche rien', async ({ browser }) => {
  const page = await ouvreLeFil(browser);

  passerelle.filSocial.publie(NEUVE);
  await partEtRevient(page, 3_000);

  await expect(lignesNeuves(page)).toHaveCount(0);

  await page.context().close();
});

/**
 * LA RÉGION `aria-live` SURVIT AU RAFRAÎCHISSEMENT, et ce n'est pas un détail
 * de forme : une région `aria-live` REMPLACÉE n'est plus surveillée par le
 * lecteur d'écran — le navigateur ne suit que celles qui existaient quand il a
 * construit l'arbre. L'échanger rendrait muette chaque confirmation de geste
 * suivante, et rien à l'écran ne le montrerait.
 */
test('le journal des gestes n’est pas remplacé — une région aria-live échangée devient muette', async ({
  browser,
}) => {
  const page = await ouvreLeFil(browser);
  await page.evaluate(() => {
    const journal = document.querySelector('#journal-des-gestes');
    if (journal !== null) (journal as HTMLElement).dataset.marque = 'origine';
  });

  passerelle.filSocial.publie(NEUVE);
  await partEtRevient(page, ABSENCE_MS);

  await expect(page.locator('#publications li').first()).toContainText(NEUVE);
  expect(
    await page.evaluate(() => document.querySelector<HTMLElement>('#journal-des-gestes')?.dataset.marque),
    'la région annonceuse a été remplacée',
  ).toBe('origine');

  await page.context().close();
});
