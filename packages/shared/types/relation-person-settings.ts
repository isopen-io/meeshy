/**
 * Les RÉGLAGES PAR PERSONNE que JE pose pour l'autre — `GET|PUT
 * /api/v1/relations/:userId/settings` (spec cercles § 4).
 *
 * Deux familles :
 * - des préférences de RÉCEPTION, actives par défaut (#14407) : `bringBlocked`
 *   (#13936) coupe le Bring de cette personne vers moi, `talkieBlocked` (#13935) la
 *   réception directe de son talkie (sa voix arrive alors en message vocal) ;
 * - les partages consentis au rituel du Sang (#14401) : ils s'accordent au rituel
 *   seulement, et se RETIRENT ici, un par un, sans quitter le Sang (RGPD art. 7(3)) ;
 * - la catégorie de mon écoute (#13934, #16686) : un consentement de l'ÉMETTEUR,
 *   refusé par défaut (#14407), qui s'ACCORDE et se retire ici, personne par personne,
 *   dès Proche (`listeningCategoryShared`).
 *
 * L'écriture est PARTIELLE (au moins un réglage) et STRICTE : un réglage inconnu
 * est refusé, jamais ignoré — un client ne doit pas croire avoir réglé ce que le
 * serveur ne tient pas.
 */
import { z } from 'zod';

export const RELATION_RITUAL_SHARES = ['listeningTitleShared', 'locationShared', 'locationHistoryShared', 'proximityShared'] as const;
export type RelationRitualShare = (typeof RELATION_RITUAL_SHARES)[number];

/** La date de retrait de chaque partage (`RelationFeatureSetting`, #14401) : la trace du consentement survit au retrait. */
export const RELATION_RITUAL_SHARE_WITHDRAWN_AT = {
  listeningTitleShared: 'listeningTitleWithdrawnAt',
  locationShared: 'locationWithdrawnAt',
  locationHistoryShared: 'locationHistoryWithdrawnAt',
  proximityShared: 'proximityWithdrawnAt',
} as const satisfies Record<RelationRitualShare, string>;

export const relationPersonSettingsSchema = z.object({
  userId: z.string(),
  bringBlocked: z.boolean(),
  talkieBlocked: z.boolean(),
  /** Absent d'un serveur antérieur à #16686 : lu `false`. */
  listeningCategoryShared: z.boolean().optional(),
  listeningTitleShared: z.boolean(),
  locationShared: z.boolean(),
  locationHistoryShared: z.boolean(),
  proximityShared: z.boolean(),
});
export type RelationPersonSettings = z.infer<typeof relationPersonSettingsSchema>;

/**
 * Un réglage au moins. `bringBlocked` et `talkieBlocked` se posent dans les deux sens ;
 * un partage du rituel ne se règle qu'à `false` (le retrait) : l'accorder hors du
 * rituel est refusé.
 */
export const relationPersonSettingsUpdateSchema = z
  .object({
    bringBlocked: z.boolean().optional(),
    talkieBlocked: z.boolean().optional(),
    listeningCategoryShared: z.boolean().optional(),
    listeningTitleShared: z.literal(false).optional(),
    locationShared: z.literal(false).optional(),
    locationHistoryShared: z.literal(false).optional(),
    proximityShared: z.literal(false).optional(),
  })
  .strict()
  .refine((update) => Object.keys(update).length > 0, { message: 'Aucun réglage' });
export type RelationPersonSettingsUpdate = z.infer<typeof relationPersonSettingsUpdateSchema>;
