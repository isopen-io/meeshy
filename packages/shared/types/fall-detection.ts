/**
 * « CHUTE DÉTECTÉE » — « si ma montre détecte une chute, mes Sangs sont prévenus tout de suite »
 * (#18748, SAN-01 du catalogue `docs/specs/cercles/etat-du-telephone.md`). Donnée de santé
 * (art. 9 RGPD) : rien n'est collecté sans l'ACCORD EXPLICITE de la personne
 * (`User.fallAlertConsentedAt`, version `FALL_CONSENT_VERSION`), jamais actif par défaut.
 *
 * 1. L'iPhone lit HealthKit (`numberOfTimesFallen`) et rapporte `POST /me/health/fall { detectedAt }` —
 *    un instant, aucune autre donnée de santé ;
 * 2. le serveur garde l'épisode en cours seul (Redis scellé, `episodeTtlMinutes`), aucun historique ;
 * 3. chaque Sang autorisé (`health.fall`) reçoit un push GÉNÉRIQUE (aucun mot de santé à l'écran
 *    verrouillé) et `fall:detected` dans `user:<lecteur>` : l'instant TRONQUÉ À LA MINUTE, la
 *    dernière position et la dernière batterie SEULEMENT s'il les reçoit déjà ;
 * 4. « Je vais bien » (`POST /me/health/fall/ok`) clôt l'épisode (`fall:cleared`, `responded`) ;
 *    l'expiration est silencieuse, le retrait de l'accord efface tout (`withdrawn`).
 *
 * Jamais un message de conversation. Les schémas DESCENDANTS tolèrent une annonce ou une raison inconnue.
 */
import { z } from 'zod';
import { inactivityLastBatterySchema, inactivityLastPositionSchema, type InactivityLastBattery, type InactivityLastPosition } from './inactivity-check.js';

export type FallDetectionConfig = {
  /** La durée de vie d'un épisode, comptée depuis la chute : rien n'est gardé au-delà. */
  readonly episodeTtlMinutes: number;
  /** Une chute rapportée plus tard que ce délai est refusée : l'alerte serait trompeuse. */
  readonly maxReportAgeMinutes: number;
  /** La dérive d'horloge tolérée vers le futur. */
  readonly maxFutureSkewMinutes: number;
  /** Une seconde chute à moins de ce délai de l'épisode en cours ne repousse rien. */
  readonly dedupeWindowMinutes: number;
  /** Au-delà de ce nombre d'épisodes sur 24 h glissantes, l'alerte est servie mais son push ne perce plus. */
  readonly maxUrgentEpisodesPerDay: number;
};

export const FALL_DETECTION_CONFIG: FallDetectionConfig = {
  episodeTtlMinutes: 360,
  maxReportAgeMinutes: 30,
  maxFutureSkewMinutes: 2,
  dedupeWindowMinutes: 10,
  maxUrgentEpisodesPerDay: 3,
};

/** La version du texte d'accord : un texte changé se reconsent (le client compare `consentVersion`). */
export const FALL_CONSENT_VERSION = '2026-11-19';

/** Sous cet âge DÉCLARÉ, l'accord est refusé (`FALL_CONSENT_MINOR`) : art. 8 RGPD, seuil français. */
export const FALL_CONSENT_MINIMUM_AGE = 15;

/**
 * Les types des pushs (aucune ligne `Notification` : rien de la chute ne survit à l'épisode). NEUTRES :
 * la charge APNs/FCM traverse Apple et Google, et rien n'y dit la santé.
 */
export const SAFETY_ALERT_PUSH_TYPE = 'safety_alert' as const;
export const SAFETY_ALERT_CLEARED_PUSH_TYPE = 'safety_alert_cleared' as const;

export const FALL_CLEARED_REASONS = ['responded', 'expired', 'withdrawn'] as const;
export type FallClearedReason = (typeof FALL_CLEARED_REASONS)[number];

const objectId = z.string().regex(/^[0-9a-f]{24}$/i);
const instant = z.iso.datetime({ offset: true });

/** Le rapport de l'iPhone : un instant, et rien d'autre. */
export const fallReportSchema = z.object({ detectedAt: instant }).strict();
export type FallReport = z.infer<typeof fallReportSchema>;

/** L'accord explicite (avec la version lue) ou son retrait. */
export const fallConsentUpdateSchema = z.union([
  z.object({ consented: z.literal(true), version: z.string().min(1).max(32) }).strict(),
  z.object({ consented: z.literal(false) }).strict(),
]);
export type FallConsentUpdate = z.infer<typeof fallConsentUpdateSchema>;
export type FallConsentSettings = { readonly consentedAt: string | null; readonly consentVersion: string | null; readonly currentVersion: string };

/** Ce que je partage à une personne (Sang : accordé par défaut une fois l'accord donné, retirable). */
export const fallPersonSettingsUpdateSchema = z.object({ shared: z.boolean() }).strict();
export type FallPersonSettings = { readonly userId: string; readonly shared: boolean };

export const fallAnnouncementSchema = z.object({ kind: z.literal('detected'), at: instant });
export type FallAnnouncement = { readonly kind: 'detected'; readonly at: string };

/** L'état servi à UN Sang : l'instant à la minute, l'expiration, et ce qui lui est déjà partagé. */
export const fallStateSchema = z.object({
  userId: objectId,
  detectedAt: instant,
  expiresAt: instant,
  lastPosition: inactivityLastPositionSchema.optional().catch(undefined),
  lastBattery: inactivityLastBatterySchema.optional().catch(undefined),
});
export type FallState = {
  readonly userId: string;
  readonly detectedAt: string;
  readonly expiresAt: string;
  readonly lastPosition?: InactivityLastPosition;
  readonly lastBattery?: InactivityLastBattery;
};

/** `fall:detected` — à un Sang, dans `user:<lecteur>`. */
export const fallDetectedEventDataSchema = z.object({ userId: objectId, state: fallStateSchema, announcement: fallAnnouncementSchema.optional().catch(undefined) });
export type FallDetectedEventData = { readonly userId: string; readonly state: FallState; readonly announcement?: FallAnnouncement };

/** `fall:cleared` — la personne a répondu, l'épisode a expiré, ou il ne vous est plus servi. */
export const fallClearedEventDataSchema = z.object({ userId: objectId, reason: z.enum(FALL_CLEARED_REASONS).catch('withdrawn') });
export type FallClearedEventData = { readonly userId: string; readonly reason: FallClearedReason };

export const fallSnapshotSchema = z.object({ items: z.array(fallStateSchema) });
export type FallSnapshot = { readonly items: readonly FallState[] };

/** L'accusé d'un rapport : `recorded: false` quand la chute appartient à l'épisode en cours. */
export type FallReportAck = { readonly recorded: boolean };
/** L'accusé de « Je vais bien » : `cleared: false` quand aucun épisode n'était en cours. */
export type FallOkAck = { readonly cleared: boolean };
