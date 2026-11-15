/**
 * LES FRAGMENTS D'ÉTOILE (#10011, décision du porteur du 2026-10-10, 3e et dernière précision).
 *
 * Le seul fragment du Jeu. Un objet de COLLECTION : on le trouve, on le compte. Son usage n'est pas décidé
 * (#10053) ; d'ici là il ne se convertit en rien — ni en points, ni en Meesh, ni en argent — et aucune frappe
 * ne passe par lui.
 *
 * ## On n'en trouve qu'un à la fois
 *
 *  - le coffre du jour : une chance sur six (`dailyChest().fragment`, `CHEST_ODDS.fragment`) ;
 *  - la saison : les étapes 5, 15, 25 et 35 (`seasonStepReward`, `kind: 'fragment'`, `amount: 1`).
 *
 * ## Le total se LIT, il ne s'incrémente pas
 *
 *     collectés = #{ journées dont le coffre a donné un fragment } + #{ étapes de saison à fragment réclamées }
 *
 * Chaque source est déjà gravée de façon idempotente (le coffre une fois par jour, une étape une fois par
 * saison) : une réclamation rejouée ne compte jamais deux fois, et l'existant d'avant ce total est compté
 * tel quel. Le serveur est la seule source du total ; aucun client ne l'écrit.
 */

import { seasonStepReward } from './season.js';

const sanitize = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

/** Les étapes réclamées d'UNE saison qui donnent un fragment d'étoile — une étape rejouée ne compte qu'une fois. */
export const seasonStarFragments = (claimedSteps: readonly number[]): number =>
  new Set(claimedSteps.filter((step) => seasonStepReward(step)?.kind === 'fragment')).size;

/** Le total collecté par un compte, toutes sources confondues. */
export const starFragmentsCollected = (params: {
  /** Le nombre de journées dont le coffre ouvert a donné un fragment d'étoile. */
  readonly chestDays: number;
  /** Les étapes réclamées de chaque saison du compte. */
  readonly seasons: readonly (readonly number[])[];
}): number => sanitize(params.chestDays) + params.seasons.reduce((sum, steps) => sum + seasonStarFragments(steps), 0);
