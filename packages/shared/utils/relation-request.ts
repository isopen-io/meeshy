/**
 * LA LOI D'UNE DEMANDE DE CRAN (#13933, cercles de proximité).
 *
 * Pure : le gateway la rend après avoir chargé le niveau, la série et le cool-down ;
 * les clients la rejouent pour NE PAS PROPOSER une demande que le serveur refusera
 * (le client ne décide jamais d'un accès). Les refus se disent dans cet ordre :
 *
 * 1. `RELATION_PHASE_SKIP` — la cible n'est pas atteignable depuis le niveau effectif :
 *    le cran suivant, sauf Ami, qui se demande directement depuis Public, Communauté ou
 *    Connaissance (décision porteur du 2026-11-13, #18101) — Proche et Sang restent cran
 *    par cran (RG-03) ;
 * 2. `RELATION_COOLDOWN` — le demandeur est dans ses 30 jours (RG-08) ;
 * 3. `RELATION_NOT_ELIGIBLE` — Proche et Sang exigent leur série (RG-04) ; Connaissance
 *    et Ami n'en ont pas (« il suffit d'être Connaissance »).
 *
 * Le niveau visé illisible est refusé en amont (`RELATION_LEVEL_INVALID`, 400).
 */
import { relationRungAfter, type RelationLevel, type RelationRequestLevel } from '../types/relation.js';

export type RelationRequestRefusalCode = 'RELATION_PHASE_SKIP' | 'RELATION_COOLDOWN' | 'RELATION_NOT_ELIGIBLE';

export type RelationRequestVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: RelationRequestRefusalCode };

export type RelationRequestInput = {
  readonly targetLevel: RelationRequestLevel;
  readonly currentLevel: RelationLevel;
  readonly eligibleFor: 'CLOSE' | 'BLOOD' | null;
  readonly cooldownUntil: Date | null;
  readonly now: Date;
};

const SERIES_LEVELS: ReadonlySet<RelationRequestLevel> = new Set<RelationRequestLevel>(['CLOSE', 'BLOOD']);

const refuse = (code: RelationRequestRefusalCode): RelationRequestVerdict => ({ allowed: false, code });

/** Ami se demande directement tant qu'on est sous Ami ; tout autre cran est le suivant, ou rien. */
const BELOW_FRIEND: ReadonlySet<RelationLevel> = new Set(['PUBLIC', 'COMMUNITY', 'ACQUAINTANCE']);

const reachable = (currentLevel: RelationLevel, targetLevel: RelationRequestLevel): boolean =>
  targetLevel === 'FRIEND'
    ? BELOW_FRIEND.has(currentLevel)
    : relationRungAfter(currentLevel) === targetLevel;

export function evaluateRelationRequest(input: RelationRequestInput): RelationRequestVerdict {
  if (!reachable(input.currentLevel, input.targetLevel)) return refuse('RELATION_PHASE_SKIP');
  if (input.cooldownUntil !== null && input.cooldownUntil.getTime() > input.now.getTime()) return refuse('RELATION_COOLDOWN');
  if (SERIES_LEVELS.has(input.targetLevel) && input.eligibleFor !== input.targetLevel) return refuse('RELATION_NOT_ELIGIBLE');
  return { allowed: true };
}
