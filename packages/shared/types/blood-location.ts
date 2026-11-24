/**
 * LA POSITION DU SANG (#13937 ; spec cercles § 1.7, LOC-03/04/10/11, RG-12 à 16, RG-27).
 *
 * Derrière un drapeau serveur ÉTEINT par défaut (`GET /relations/config` → `services.bloodLocation`), entre
 * Sangs qui se sont consentis les partages « historique » et « proximité » au rituel :
 *
 * 1. `POST /me/location/blood` {@link BloodLocationPayload} range un point, scellé au repos,
 *    30 jours ; rien n'est rangé en fantôme global ;
 * 2. `GET /relations/:userId/location/history` rend l'historique de l'ÉMETTEUR à un Sang
 *    consentant ({@link BloodLocationHistory}) ; le fantôme rend la même réponse vide ;
 * 3. `DELETE /me/location/history` efface le sien ;
 * 4. `GET /me/location/consultations` ({@link BloodLocationConsultations}) : qui a lu, du seul
 *    observé, avec `excessive` quand un observateur lit trop souvent ;
 * 5. `PUT /me/location/blood-settings` ({@link BloodLocationSettingsPayload}) : fantôme global
 *    ou ciblé, rayon de proximité par personne ;
 * 6. `location:blood-proximity` ({@link BloodProximityEventData}) part aux DEUX Sangs, sans
 *    coordonnée, au plus une fois par paire toutes les 2 h ;
 * 7. `location:blood-moved` ({@link BloodMovedEventData}) part, à chaque point, aux comptes qui
 *    pourraient LIRE l'historique de l'émetteur, sans coordonnée, au plus une fois par paire et par
 *    {@link BLOOD_MOVED_SIGNAL_SECONDS} : le client relit alors la carte (#19400) ;
 * 8. la notification `blood_proximity` ({@link BLOOD_PROXIMITY_NOTIFICATION_TYPE}) double l'alerte 6
 *    en push, pour une app fermée (#20540).
 */
import { z } from 'zod';

export const BLOOD_LOCATION_HISTORY_DAYS = 30;
export const BLOOD_LOCATION_HISTORY_DEFAULT_LIMIT = 200;
export const BLOOD_LOCATION_HISTORY_MAX_LIMIT = 500;
export const BLOOD_PROXIMITY_DEFAULT_RADIUS_METERS = 500;
export const BLOOD_PROXIMITY_MIN_RADIUS_METERS = 100;
export const BLOOD_PROXIMITY_MAX_RADIUS_METERS = 5000;
/** Une position de l'autre plus vieille que cela ne dit plus rien de sa proximité présente. */
export const BLOOD_PROXIMITY_FRESH_MINUTES = 60;
/** Au-delà, dans les 24 h, d'un même observateur : le journal le signale à l'observé. */
export const BLOOD_CONSULTATION_EXCESS_PER_DAY = 20;
/** Au plus un `location:blood-moved` par paire émetteur → lecteur dans cette fenêtre (#19400). */
export const BLOOD_MOVED_SIGNAL_SECONDS = 60;

/**
 * La carte de tous mes proches (#19202) relit le dernier point de chaque Sang à chaque
 * rafraîchissement : une lecture n'écrit au journal que si aucune consultation de ce Sang
 * par ce lecteur n'y figure depuis ce délai. Une carte ouverte une heure laisse quatre lignes,
 * pas une par rafraîchissement.
 */
export const BLOOD_MAP_CONSULTATION_WINDOW_MINUTES = 15;

export const bloodLocationPayloadSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(100_000).optional(),
});
export type BloodLocationPayload = z.infer<typeof bloodLocationPayloadSchema>;

const objectId = z.string().regex(/^[0-9a-f]{24}$/i);

/** `userId` absent = le fantôme GLOBAL ; présent = ciblé (le rayon exige `userId`). */
export const bloodLocationSettingsPayloadSchema = z
  .object({
    userId: objectId.optional(),
    ghost: z.boolean().optional(),
    proximityRadiusMeters: z.number().int().finite().optional(),
  })
  .strict()
  .refine((value) => value.ghost !== undefined || value.proximityRadiusMeters !== undefined, { message: 'Aucun réglage' })
  .refine((value) => value.proximityRadiusMeters === undefined || value.userId !== undefined, { message: 'Le rayon se règle par personne' });
export type BloodLocationSettingsPayload = z.infer<typeof bloodLocationSettingsPayloadSchema>;

export type BloodLocationHistoryPoint = {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy?: number;
  readonly recordedAt: string;
};
export type BloodLocationHistory = { readonly items: readonly BloodLocationHistoryPoint[] };

export type BloodLocationConsultation = { readonly observerId: string; readonly consultedAt: string };
export type BloodLocationConsultations = {
  readonly items: readonly BloodLocationConsultation[];
  readonly excessive: boolean;
  readonly excessiveObserverIds: readonly string[];
};

/** « X est près de toi » : l'identité et une distance par palier, jamais une coordonnée. */
export type BloodProximityEventData = {
  readonly userId: string;
  readonly distanceMeters: 100 | 250 | 500 | 1000 | 2500 | 5000;
};

/**
 * L'ALERTE POUSSÉE quand un Sang s'approche (#20540) : la même alerte que
 * `location:blood-proximity`, sous les mêmes gardes, mais persistée et poussée (APNs/FCM) pour
 * atteindre une app fermée. Titre et corps sont composés par le serveur dans la langue de cadrage
 * du destinataire (« Lina est tout près » / « À 500 m — touche pour vous voir tous les deux sur la
 * carte ») : la distance, le PALIER de l'alerte socket, vit au corps seul, que `showPreview` masque.
 *
 * Contrat client : au toucher du push ou du bandeau in-app, OUVRIR LA CARTE de `userId` (l'autre
 * Sang) centrée sur les deux — jamais une conversation, jamais un profil.
 */
export const BLOOD_PROXIMITY_NOTIFICATION_TYPE = 'blood_proximity' as const;

/**
 * Les clés propres à ce type dans `data` du push, en plus des clés communes (`notificationId`…) :
 * `type` vaut {@link BLOOD_PROXIMITY_NOTIFICATION_TYPE}, `userId` est l'autre Sang. Aucune
 * coordonnée, ni distance : la distance n'est que dans le corps, qui suit `showPreview`.
 */
export const BLOOD_PROXIMITY_PUSH_DATA_KEYS = ['type', 'userId'] as const;
export type BloodProximityPushData = {
  readonly type: typeof BLOOD_PROXIMITY_NOTIFICATION_TYPE;
  readonly userId: string;
};

/**
 * La distance d'une notification se range arrondie à 50 m près, et jamais sous 50 m. La passerelle
 * lui remet le PALIER de l'alerte socket (100…5000, multiples de 50) : l'arrondi ne l'affine jamais.
 */
export const BLOOD_PROXIMITY_NOTIFICATION_ROUNDING_METERS = 50;

/**
 * Les métadonnées de la ligne `Notification` (servies in-app sur `notification:new`) : l'autre Sang
 * et la distance arrondie — rien d'autre ne se range.
 */
export function bloodProximityNotificationMetadata(input: { readonly userId: string; readonly distanceMeters: number }): {
  readonly action: 'view_profile';
  readonly userId: string;
  readonly distanceMeters: number;
} {
  const step = BLOOD_PROXIMITY_NOTIFICATION_ROUNDING_METERS;
  return {
    action: 'view_profile',
    userId: input.userId,
    distanceMeters: Math.max(step, Math.round(input.distanceMeters / step) * step),
  };
}

/**
 * « La position continue de X a bougé » (#19400) : l'identité et l'heure du point, JAMAIS une
 * coordonnée. Le lecteur relit la carte (`GET /relations/locations?include=blood`) ou l'historique ;
 * la lecture reste la seule porte des coordonnées et du journal des consultations. Un ancien client
 * l'ignore et garde sa relecture.
 */
export type BloodMovedEventData = {
  readonly userId: string;
  readonly at: string;
};

/**
 * La RELECTURE de mes réglages (#19452). `GET /me/location/blood-settings?userId=` rend, pour SOI,
 * le fantôme global, le fantôme ciblé sur `userId` et le rayon réglé pour lui (défaut
 * {@link BLOOD_PROXIMITY_DEFAULT_RADIUS_METERS}, borné). Seules les lignes dont le lecteur est
 * propriétaire sont lues : ce que l'autre a réglé pour lui ne part jamais.
 */
export const bloodLocationSettingsQuerySchema = z.object({ userId: objectId });
export type BloodLocationSettingsQuery = z.infer<typeof bloodLocationSettingsQuerySchema>;

export type BloodLocationSettingsReading = {
  readonly userId: string;
  readonly ghost: boolean;
  readonly ghostFor: boolean;
  readonly proximityRadiusMeters: number;
};

/**
 * `GET /me/location/ghost` (#19452), hors drapeau Sang : l'état de MON fantôme global, même forme
 * que la réponse du `PUT /me/location/ghost` ; `ghostAt` est la date d'entrée, nulle hors fantôme.
 */
export type LocationGhostReading = { readonly ghost: boolean; readonly ghostAt: string | null };
