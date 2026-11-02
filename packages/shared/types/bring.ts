/**
 * LE BRING — un son FORCÉ sur le téléphone de l'autre, pour l'urgence extrême
 * (#13936, décision porteur D-3 du 2026-10-31, #13945).
 *
 * UN contrat, lu par la passerelle et par les trois clients :
 *
 * - `GET  /api/v1/bring/:userId` → {@link BringAvailability} : le bouton existe-t-il,
 *   et combien en reste-t-il aujourd'hui ? `available: false` ⇒ le bouton DISPARAÎT
 *   (« Bring indisponible »), sans dire pourquoi.
 * - `POST /api/v1/bring/:userId` → {@link BringSent} (201) ; refus codés par
 *   {@link BRING_ERROR_CODES}.
 * - `DELETE /api/v1/bring/:bringId` → arrêt, par le destinataire (un geste) ou par
 *   l'expéditeur (annulation) ; propagé à TOUS les appareils des deux.
 * - Socket, room `user:<id>` : `bring:ring` ({@link BringRingEventData}) chez le
 *   destinataire, `bring:stopped` ({@link BringStoppedEventData}) chez les DEUX.
 * - Push : {@link BRING_PUSH_TYPES} dans `data.type`, charge {@link BringPushData}.
 * - Réglage par personne : `GET|PUT /api/v1/relations/:userId/settings`
 *   ({@link RelationPersonSettings}) — `bringBlocked: true` coupe le Bring de cette
 *   personne vers moi.
 *
 * Les règles, que les clients ne recalculent pas : ouvert dès FRIEND (niveau
 * effectif), quota PAR JOUR calendaire du destinataire et par paire orientée
 * (`RELATION_THRESHOLDS.bring.perDay`), disponible par défaut, bloquable par
 * personne, il PASSE Ne pas déranger, les heures calmes et le réglage « sons » :
 * c'est une catégorie à part, comme la sonnerie d'appel.
 *
 * Zod retire les champs inconnus : un client plus ancien lit une passerelle plus
 * récente, et chaque champ ajouté plus tard l'est en ADDITIF.
 */
import { z } from 'zod';

/** La durée pendant laquelle un Bring sonne au plus, et la vie de son push. */
export const BRING_RING_WINDOW_MS = 120_000;

/** Le son du Bring sur iOS : la sonnerie d'appel du bundle principal (30 s au plus). */
export const BRING_IOS_SOUND = 'Ringtone.caf';

export const BRING_ERROR_CODES = {
  /** Le destinataire a bloqué le Bring de l'expéditeur — 403. */
  BLOCKED: 'BRING_BLOCKED',
  /** Pas de lien d'au moins Ami, compte bloqué ou introuvable — 403, sans distinction. */
  NOT_ALLOWED: 'BRING_NOT_ALLOWED',
  /** Le quota du jour est atteint — 429. */
  QUOTA_EXCEEDED: 'BRING_QUOTA_EXCEEDED',
  /** Le Bring n'existe plus (déjà arrêté, expiré) ou n'est pas le mien — 404. */
  NOT_FOUND: 'BRING_NOT_FOUND',
  /** Le compteur du quota est injoignable : on ne sonne pas sans compter — 503. */
  UNAVAILABLE: 'BRING_UNAVAILABLE',
  /** Le service est coupé sur cette passerelle (`BRING_ENABLED`) — 403, le même pour tous. */
  DISABLED: 'BRING_DISABLED',
} as const;
export type BringErrorCode = (typeof BRING_ERROR_CODES)[keyof typeof BRING_ERROR_CODES];

/**
 * Qui a arrêté : le destinataire (un geste, ou un blocage qu'il pose) ou
 * l'expéditeur (une annulation, ou un blocage qu'il pose). Aucune raison ne dit
 * « bloqué » : un blocage n'est jamais annoncé au bloqué, il n'en reçoit RIEN. Le
 * serveur n'émet rien à l'expiration : chaque client cesse de sonner à `expiresAt`.
 */
export const BRING_STOP_REASONS = ['recipient', 'sender'] as const;
export type BringStopReason = (typeof BRING_STOP_REASONS)[number];

/** Les types de push (`data.type`) : la sonnerie, et son arrêt silencieux. */
export const BRING_PUSH_TYPES = { RING: 'bring', STOPPED: 'bring_stopped' } as const;

/**
 * `perDay` / `remainingToday` : `null` = illimité (Atome). `resetsAt` : minuit du
 * jour calendaire du DESTINATAIRE (son fuseau, UTC à défaut). Quand
 * `available` est faux, `remainingToday` vaut 0 et rien ne dit pourquoi.
 */
export const bringAvailabilitySchema = z.object({
  userId: z.string(),
  available: z.boolean(),
  perDay: z.number().int().nonnegative().nullable(),
  remainingToday: z.number().int().nonnegative().nullable(),
  resetsAt: z.string(),
});
export type BringAvailability = z.infer<typeof bringAvailabilitySchema>;

export const bringSentSchema = z.object({
  bringId: z.string(),
  toUserId: z.string(),
  sentAt: z.string(),
  expiresAt: z.string(),
  perDay: z.number().int().nonnegative().nullable(),
  remainingToday: z.number().int().nonnegative().nullable(),
});
export type BringSent = z.infer<typeof bringSentSchema>;

export const bringRingEventSchema = z.object({
  bringId: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  sentAt: z.string(),
  expiresAt: z.string(),
});
export type BringRingEventData = z.infer<typeof bringRingEventSchema>;

export const bringStoppedEventSchema = z.object({
  bringId: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  reason: z.enum(BRING_STOP_REASONS),
  stoppedAt: z.string(),
});
export type BringStoppedEventData = z.infer<typeof bringStoppedEventSchema>;

/**
 * Les partages que J'AI consentis à l'autre au rituel du Sang (`RelationFeatureSetting`,
 * #14401). Ils s'accordent au rituel seulement, et se RETIRENT ici, un par un, sans
 * quitter le Sang (RGPD art. 7(3)).
 */
export const RELATION_RITUAL_SHARES = ['listeningTitleShared', 'locationShared', 'locationHistoryShared', 'proximityShared'] as const;
export type RelationRitualShare = (typeof RELATION_RITUAL_SHARES)[number];

/** La date de retrait de chaque partage (`RelationFeatureSetting`, #14401) : la trace du consentement survit au retrait. */
export const RELATION_RITUAL_SHARE_WITHDRAWN_AT = {
  listeningTitleShared: 'listeningTitleWithdrawnAt',
  locationShared: 'locationWithdrawnAt',
  locationHistoryShared: 'locationHistoryWithdrawnAt',
  proximityShared: 'proximityWithdrawnAt',
} as const satisfies Record<RelationRitualShare, string>;

/** Les réglages par personne que JE pose pour l'autre (`/relations/:userId/settings`). */
export const relationPersonSettingsSchema = z.object({
  userId: z.string(),
  bringBlocked: z.boolean(),
  listeningTitleShared: z.boolean(),
  locationShared: z.boolean(),
  locationHistoryShared: z.boolean(),
  proximityShared: z.boolean(),
});
export type RelationPersonSettings = z.infer<typeof relationPersonSettingsSchema>;

/**
 * Un réglage au moins. `bringBlocked` se pose dans les deux sens ; un partage du rituel
 * ne se règle qu'à `false` (le retrait) : l'accorder hors du rituel est refusé.
 */
export const relationPersonSettingsUpdateSchema = z
  .object({
    bringBlocked: z.boolean().optional(),
    listeningTitleShared: z.literal(false).optional(),
    locationShared: z.literal(false).optional(),
    locationHistoryShared: z.literal(false).optional(),
    proximityShared: z.literal(false).optional(),
  })
  .strict()
  .refine((update) => Object.keys(update).length > 0);
export type RelationPersonSettingsUpdate = z.infer<typeof relationPersonSettingsUpdateSchema>;

/**
 * Le `data` des pushes du Bring (APNs et FCM : `Record<string, string>`).
 *
 * - `bring` — iOS : alerte `interruption-level: time-sensitive` (ou `critical` quand
 *   l'entitlement est accordé), son {@link BRING_IOS_SOUND}, catégorie `BRING`, expirée
 *   à `expiresAt`. Android : DATA-ONLY haute priorité, TTL = la fenêtre — le client
 *   lève son service au premier plan sur le flux `USAGE_ALARM` ; `title`, `body` et
 *   `stopLabel` voyagent dans `data`, localisés à la langue du destinataire.
 * - `bring_stopped` — iOS : alerte `passive` (ni son ni écran) qui REMPLACE la bannière par
 *   son `apns-collapse-id: bring-<id>`, même app tuée ; Android : data-only. Chaque appareil
 *   du destinataire cesse de sonner et retire la bannière `bringId`.
 */
export const bringPushDataSchema = z.object({
  type: z.literal(BRING_PUSH_TYPES.RING),
  bringId: z.string(),
  fromUserId: z.string(),
  fromName: z.string(),
  fromAvatar: z.string(),
  sentAt: z.string(),
  expiresAt: z.string(),
  title: z.string(),
  body: z.string(),
  stopLabel: z.string(),
});
export type BringPushData = z.infer<typeof bringPushDataSchema>;

export const bringStoppedPushDataSchema = z.object({
  type: z.literal(BRING_PUSH_TYPES.STOPPED),
  bringId: z.string(),
  reason: z.enum(BRING_STOP_REASONS),
});
export type BringStoppedPushData = z.infer<typeof bringStoppedPushDataSchema>;
