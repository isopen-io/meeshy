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
 *    {@link BLOOD_MOVED_SIGNAL_SECONDS} : le client relit alors la carte (#19400).
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
