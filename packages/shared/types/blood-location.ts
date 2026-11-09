/**
 * LA POSITION DU SANG (#13937 ; spec cercles § 1.7, LOC-03/04/10/11, RG-12 à 16, RG-27).
 *
 * Derrière un drapeau serveur ÉTEINT par défaut (`GET /me/features` → `bloodLocation`), entre
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
 *    coordonnée, au plus une fois par paire toutes les 2 h.
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

export type BloodLocationFeatures = { readonly bloodLocation: boolean };
