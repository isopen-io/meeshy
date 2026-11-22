/**
 * Les RÉGLAGES PAR PERSONNE que JE pose pour l'autre — `GET|PUT
 * /api/v1/relations/:userId/settings` (spec cercles § 4).
 *
 * Deux familles :
 * - des préférences de RÉCEPTION, actives par défaut (#14407) : `bringBlocked`
 *   (#13936) coupe le Bring de cette personne vers moi, `talkieBlocked` (#13935) la
 *   réception directe de son talkie (sa voix arrive alors en message vocal), `togetherBlocked`
 *   (#17023) ses invitations à regarder ou écouter ensemble, `bloodLocationMuted` (#19454) sa
 *   position continue de Sang (son point sur ma carte, l'alerte de proximité de la paire) — sans
 *   toucher à SON consentement ;
 * - les partages consentis au rituel du Sang (#14401) : ils s'accordent au rituel (ou, entre
 *   deux comptes de l'équipe, ici même, sans lien : #16642), et se RETIRENT ici, un par un,
 *   sans quitter le Sang (RGPD art. 7(3)) ;
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

/**
 * DE SANG À SANG RIEN NE SE COUPE (#20361) : une écriture qui COUPE un partage ou une réception
 * envers un Sang pour qui j'ai donné l'accord au palier répond 409 avec ce code. Pour restreindre,
 * on redescend la personne à Proche. Un ancien client ne lit pas le code : il garde son retour
 * arrière optimiste, comme sur toute erreur.
 */
export const RELATION_BLOOD_LOCKED_CODE = 'RELATION_BLOOD_LOCKED' as const;

/**
 * Ce que les GET de réglages par personne servent EN PLUS (#20361) — optionnels, absents d'un
 * ancien serveur : `lockedByLevel` = au Sang, après mon accord au palier, ces interrupteurs
 * n'existent plus (l'interface les retire, elle ne les grise pas) ; `bloodBundleAccepted` = j'ai
 * accepté la liste du Sang à sa version courante (sinon la carte de confirmation, #20367).
 */
export const relationBloodLockFieldsSchema = z.object({
  lockedByLevel: z.boolean().optional(),
  bloodBundleAccepted: z.boolean().optional(),
});
export type RelationBloodLockFields = z.infer<typeof relationBloodLockFieldsSchema>;

export const relationPersonSettingsSchema = z.object({
  userId: z.string(),
  bringBlocked: z.boolean(),
  talkieBlocked: z.boolean(),
  /** Absent d'un serveur antérieur à #17023 : lu `false`. */
  togetherBlocked: z.boolean().optional(),
  /** Absent d'un serveur antérieur à #19454 : lu `false`. */
  bloodLocationMuted: z.boolean().optional(),
  /** Absent d'un serveur antérieur à #16686 : lu `false`. */
  listeningCategoryShared: z.boolean().optional(),
  listeningTitleShared: z.boolean(),
  locationShared: z.boolean(),
  locationHistoryShared: z.boolean(),
  proximityShared: z.boolean(),
  lockedByLevel: z.boolean().optional(),
  bloodBundleAccepted: z.boolean().optional(),
});
export type RelationPersonSettings = z.infer<typeof relationPersonSettingsSchema>;

/**
 * Un réglage au moins. `bringBlocked`, `talkieBlocked`, `togetherBlocked` et `bloodLocationMuted` se posent dans les deux sens ;
 * un partage du rituel se RETIRE toujours (`false`), et ne s'accorde (`true`) hors du rituel
 * qu'entre deux comptes de l'équipe, sans lien (#16642) : le corps l'accepte, la passerelle
 * le juge par la loi d'accès et refuse (400) toute autre paire.
 */
export const relationPersonSettingsUpdateSchema = z
  .object({
    bringBlocked: z.boolean().optional(),
    talkieBlocked: z.boolean().optional(),
    togetherBlocked: z.boolean().optional(),
    bloodLocationMuted: z.boolean().optional(),
    listeningCategoryShared: z.boolean().optional(),
    listeningTitleShared: z.boolean().optional(),
    locationShared: z.boolean().optional(),
    locationHistoryShared: z.boolean().optional(),
    proximityShared: z.boolean().optional(),
  })
  .strict()
  .refine((update) => Object.keys(update).length > 0, { message: 'Aucun réglage' });
