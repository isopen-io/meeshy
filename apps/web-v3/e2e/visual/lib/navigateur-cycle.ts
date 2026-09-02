import type { BrowserContext, Page } from '@playwright/test';

import { DELAI_DE_REPONSE_MS } from '../../../lib/api/passerelle';
import { BATTEMENT, INSTANT_DE_DEPART, MARGE_DE_CHARGEMENT_MS, type EntreeDeJournal, type FenetreCachee } from './lifecycle';

/**
 * CE QU'UN NAVIGATEUR SEUL PEUT FAIRE — occulter un onglet, figer son horloge,
 * lire ce qui part. `lib/lifecycle.ts` porte la LOI du gate de cycle de vie,
 * gagée sans navigateur ; ce module porte les GESTES, partagés par le
 * scénario fabriqué (`v3-lifecycle.spec.ts`) et par l'écran réel
 * (`v3-fil-invite.spec.ts`, les six cas C→H du § 6.5). Deux specs qui
 * recopieraient ces gestes divergeraient à la première borne déplacée.
 */

// Le temps machine qu'on laisse aux requêtes émises pendant la fenêtre virtuelle pour remonter au
// processus de test. Un gate qui asserte une ABSENCE ne peut pas attendre un événement : il attend
// une durée, et celle-ci n'a plus à couvrir la PÉRIODE du battement — seulement le trajet d'un
// `fetch` vers une route interceptée (quelques millisecondes).
export const DELAI_D_OBSERVATION_MS = 500;

// Le temps laissé au réseau du chargement pour retomber avant qu'on ouvre la fenêtre d'occultation.
// Sans lui, une requête de chargement encore en vol serait imputée à l'occultation — un gate rouge
// sur un comportement juste, ce qui est la pire des deux erreurs.
export const DELAI_DE_REPOS_MS = 250;

export type Journal = () => readonly EntreeDeJournal[];

export const enregistre = (contexte: BrowserContext): Journal => {
  const entrees: EntreeDeJournal[] = [];
  contexte.on('request', (requete) => {
    entrees.push({ methode: requete.method(), url: requete.url(), emiseA: Date.now() });
  });
  return () => [...entrees];
};

// L'HORLOGE EST CELLE DU CONTEXTE, PAS D'UNE PAGE — et c'est le modèle juste : deux onglets d'un
// même navigateur partagent UN temps, comme les deux onglets d'une personne réelle. `page.clock`
// délègue au contexte ; l'installer une fois par onglet la RÉINITIALISE pour tout le monde, et
// `runFor` appelé par onglet avance la même horloge autant de fois qu'il y a d'onglets (mesuré :
// 900 000 ms au lieu de 660 000, donc 3 battements par onglet là où la période n'en autorise 2 —
// un gate ROUGE sur un scénario conforme, la pire des deux erreurs).
//
// Elle s'installe AVANT toute navigation (une minuterie posée au chargement doit être créée par
// l'horloge virtuelle) et ne se FIGE qu'après : `install()` seul laisse le temps couler, ce qui est
// voulu — c'est ce qui permet aux pages de se charger — et ce qui rendrait le compte dépendant de
// la machine si on s'y arrêtait.
export const installeLHorloge = (contexte: BrowserContext): Promise<void> =>
  contexte.clock.install({ time: INSTANT_DE_DEPART });

export const figeLHorloge = (contexte: BrowserContext): Promise<void> =>
  contexte.clock.pauseAt(INSTANT_DE_DEPART + MARGE_DE_CHARGEMENT_MS);

/**
 * LE TEMPS DE PAGE N'AVANCE JAMAIS D'UN SEUL SAUT AU-DELÀ D'UN DÉLAI D'ABANDON.
 *
 * `runFor` fait battre TOUTES les minuteries dues (`fastForward` n'en
 * réveillerait qu'une) — mais il fait aussi courir, en temps de PAGE, le délai
 * d'abandon que chaque appel à la passerelle pose sur lui-même
 * (`AbortSignal.timeout(DELAI_DE_REPONSE_MS)`, `lib/api/passerelle.ts`) :
 * mesuré, un `fetch` émis par une minuterie AU MILIEU d'un `runFor(5 min)`
 * est abandonné (`TimeoutError: signal timed out`) avant que sa réponse RÉELLE,
 * partie quelques millisecondes plus tard, n'arrive — le préflight atteint le
 * serveur, jamais la requête. C'est ainsi que le battement du cas F (la place
 * fermée en base) restait `status -1` dans la trace et que le bandeau ne
 * venait jamais, trois courses sur trois ; le même saut avait déjà fait
 * clignoter le cas E (#4836). Le sujet n'est pas le module — un délai de six
 * secondes est juste en production — mais le harnais, qui comprimait six
 * minutes de temps de page en six millisecondes réelles.
 *
 * D'où la forme : l'avance se fait par PAS d'une demi-échéance, et entre deux
 * pas le réel reprend la main dès qu'une requête est partie — le temps que la
 * passerelle de bouchon, dans ce processus, réponde. Une avance sans requête
 * ne coûte que ses aller-retours CDP.
 */
export const PAS_D_AVANCE_MS = DELAI_DE_REPONSE_MS / 2;

/** Le réel laissé à une requête émise pendant un pas — quelques aller-retours locaux, préflight compris. */
export const REPOS_D_IO_MS = 50;

const reel = (ms: number): Promise<void> => new Promise((resoud) => setTimeout(resoud, ms));

export const avance = async (contexte: BrowserContext, dureeMs: number): Promise<void> => {
  let parties = 0;
  const compte = (): void => {
    parties += 1;
  };
  contexte.on('request', compte);
  try {
    for (let restant = dureeMs; restant > 0; restant -= PAS_D_AVANCE_MS) {
      await contexte.clock.runFor(Math.min(PAS_D_AVANCE_MS, restant));
      // L'événement `request` remonte de façon asynchrone : un tour réel suffit à le voir.
      await reel(5);
      if (parties === 0) continue;
      parties = 0;
      await reel(REPOS_D_IO_MS);
    }
  } finally {
    contexte.off('request', compte);
  }
};

export const avanceDeLaFenetreDeRecette = (contexte: BrowserContext): Promise<void> =>
  avance(contexte, BATTEMENT.fenetreDeRecetteMs);

// `visibilitychange` ne s'émule pas par une option de contexte : Playwright n'expose aucun réglage
// de visibilité de document. On pose donc l'état que le navigateur poserait, puis on émet
// l'événement — et on le REND au retour, sinon toute la suite du test lit un onglet caché.
export const occulte = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

export const revele = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

// La borne GAUCHE est stampée AVANT l'aller-retour d'`evaluate`, jamais après. Le choix n'est pas
// neutre : l'événement `request` remonte au processus de test de façon asynchrone, et une requête
// partie du gestionnaire `visibilitychange` peut arriver avant que la promesse d'`evaluate` ne se
// résolve. Stamper après ferait donc RATER la fuite — un faux vert. Stamper avant peut, au pire,
// imputer à l'occultation une requête partie quelques millisecondes plus tôt : un faux rouge, que
// le repos du chargement rend improbable. Entre les deux erreurs, un gate se ferme du côté du
// lecteur. L'onglet reste caché la FENÊTRE DE RECETTE ENTIÈRE — les 10 minutes que le § 8.5 et le
// cas C du § 6.5 nomment — et non les 500 ms qu'un temps machine pouvait payer. `pendant` laisse
// l'appelant faire ARRIVER quelque chose pendant l'absence (un message qu'un autre a écrit).
export const bascule = async (
  contexte: BrowserContext,
  page: Page,
  pendant: () => void | Promise<void> = () => undefined,
): Promise<FenetreCachee> => {
  const debut = Date.now();
  await occulte(page);
  await pendant();
  await avanceDeLaFenetreDeRecette(contexte);
  await page.waitForTimeout(DELAI_D_OBSERVATION_MS);
  const fin = Date.now();
  await revele(page);
  await page.waitForTimeout(DELAI_D_OBSERVATION_MS);
  return { debut, fin };
};
