/**
 * LA RÉPONSE DE `GET /api/v1/relations/:userId` — mon lien avec une personne
 * (#13998, élargie par #14910 pour gérer un lien depuis le profil).
 *
 * `userId` et `effectiveLevel` sont le contrat d'origine, toujours servis.
 * Les champs suivants sont ADDITIFS et optionnels ici : un client récent lit
 * une passerelle plus ancienne, et Zod retire les champs inconnus, donc un
 * client plus ancien lit une passerelle plus récente.
 *
 * - la vue du lien, la même que les éléments de `GET /relations`
 *   (`RelationLinkView`) : `grantedByMe`, `since`, `progress`, `eligibleFor` ;
 * - `canRaise` : puis-je demander le cran SUIVANT ? La loi partagée
 *   (`evaluateRelationRequest`) rejouée par la passerelle — cran suivant,
 *   éligibilité, aucune demande en suspens entre nous. Le cool-down (RG-08)
 *   n'y entre pas : il naît d'une baisse ou d'un refus silencieux (RG-07) et
 *   ne se dit qu'à la demande (`RELATION_COOLDOWN`) ;
 * - `raiseBlockedUntil` : réservé, toujours `null` pour la même raison. Un
 *   client qui le lit non nul et futur masque « Promouvoir ».
 *
 * Sous Connaissance (`PUBLIC`, bloqué, inconnu), la réponse ne dit que
 * l'absence de lien : une vue vide, `canRaise: false`, aucun cool-down.
 */
import { z } from 'zod';
import { RELATION_LEVELS, type RelationLinkView } from './relation.js';

export const relationLevelResponseSchema = z.object({
  userId: z.string(),
  effectiveLevel: z.enum(RELATION_LEVELS),
  grantedByMe: z.enum(RELATION_LEVELS).optional(),
  since: z.string().nullable().optional(),
  progress: z
    .object({
      activeWeeks: z.number(),
      needed: z.number().nullable(),
      missing: z.array(z.string()),
    })
    .optional(),
  eligibleFor: z.enum(['CLOSE', 'BLOOD']).nullable().optional(),
  canRaise: z.boolean().optional(),
  raiseBlockedUntil: z.string().nullable().optional(),
});

export type RelationLevelResponse = z.infer<typeof relationLevelResponseSchema>;

/** Ce que la passerelle SERT : la vue complète, et la possibilité de monter d'un cran. */
export type RelationLinkDetail = RelationLinkView & {
  readonly canRaise: boolean;
  readonly raiseBlockedUntil: string | null;
};
