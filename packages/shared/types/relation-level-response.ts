/**
 * LA RÉPONSE DE `GET /api/v1/relations/:userId` — le niveau EFFECTIF du lien du
 * lecteur avec une personne, et rien de plus (#13998, cercles de proximité).
 *
 * Forme MINIMALE et ADDITIVE : `grantedByMe`, `since`, `progress` et
 * `eligibleFor` viendront avec #13938 sans casser ce contrat. Zod retire les
 * champs inconnus, donc un client plus ancien lit une passerelle plus récente.
 *
 * `effectiveLevel` est le niveau du lien tel que la loi unique le sert
 * (`niveauEffectif`) ; `PUBLIC` dit aussi « bloqué » et « inconnu » — c'est
 * voulu, la réponse ne doit rien apprendre de plus que l'absence de lien.
 */
import { z } from 'zod';
import { RELATION_LEVELS } from './relation.js';

export const relationLevelResponseSchema = z.object({
  userId: z.string(),
  effectiveLevel: z.enum(RELATION_LEVELS),
});

export type RelationLevelResponse = z.infer<typeof relationLevelResponseSchema>;
