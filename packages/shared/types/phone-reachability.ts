/**
 * LE TÉLÉPHONE INJOIGNABLE — « mes Proches savent que mon téléphone est injoignable depuis
 * quand, et pourquoi c'est probable » (#18737, TEL-01). Même forme que la batterie (#14147).
 *
 * UN contrat, lu par la passerelle et par les trois clients. JAMAIS un message de
 * conversation : rien n'entre dans `Message`, aucun avis système.
 *
 * 1. Chaque signe de vie du téléphone SUIVI (socket ouverte, relevé de batterie, réponse à une
 *    sonde par `POST /me/device/alive`) remet son horloge à zéro ;
 * 2. sans signe de vie, le serveur SONDE le téléphone par un push silencieux
 *    (`PHONE_PROBE_PUSH_TYPE`) ; deux sondes sans réponse le rendent injoignable DEPUIS son
 *    dernier signe de vie ;
 * 3. chaque lecteur autorisé (`device.unreachable`) reçoit dans `user:<lecteur>`
 *    `phone:unreachable` ({@link PhoneReachabilityChangedEventData}), l'annonce SEULEMENT quand
 *    son canal vaut `socket` (SyncPill) ; `phone:reachable` clôt l'état ;
 * 4. `GET /relations/phone-reachability` rattrape les états servis ({@link PhoneReachabilitySnapshot}).
 *
 * Les schémas DESCENDANTS tolèrent un champ, une cause et une annonce inconnus, pour qu'un client
 * plus ancien que le serveur ne casse pas (production rétrocompatible).
 */
import { z } from 'zod';

import { PHONE_REACHABILITY_ANNOUNCEMENT_KINDS, PHONE_UNREACHABLE_CAUSES, type PhoneReachabilityErrorCode } from './phone-reachability-constants.js';

export * from './phone-reachability-constants.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i);
const instant = z.iso.datetime({ offset: true });

export const phoneReachabilityAnnouncementSchema = z.object({
  kind: z.enum(PHONE_REACHABILITY_ANNOUNCEMENT_KINDS),
  at: instant,
});
export type PhoneReachabilityAnnouncement = z.infer<typeof phoneReachabilityAnnouncementSchema>;

export const phoneReachabilityStateSchema = z.object({
  userId: objectId,
  /** Le dernier signe de vie du téléphone : « injoignable depuis 14:10 ». */
  unreachableSince: instant,
  cause: z.enum(PHONE_UNREACHABLE_CAUSES).catch('unknown' as never),
});
export type PhoneReachabilityState = {
  readonly userId: string;
  readonly unreachableSince: string;
  readonly cause: (typeof PHONE_UNREACHABLE_CAUSES)[number] | 'unknown';
};

const tolerantAnnouncement = phoneReachabilityAnnouncementSchema.optional().catch(undefined);

export const phoneReachabilityChangedEventDataSchema = z.object({
  userId: objectId,
  state: phoneReachabilityStateSchema,
  announcement: tolerantAnnouncement,
});
export type PhoneReachabilityChangedEventData = {
  readonly userId: string;
  readonly state: PhoneReachabilityState;
  readonly announcement?: PhoneReachabilityAnnouncement;
};

export const phoneReachabilityClearedEventDataSchema = z.object({
  userId: objectId,
  announcement: tolerantAnnouncement,
});
export type PhoneReachabilityClearedEventData = { readonly userId: string; readonly announcement?: PhoneReachabilityAnnouncement };

export const phoneReachabilitySnapshotSchema = z.object({ items: z.array(phoneReachabilityStateSchema) });
export type PhoneReachabilitySnapshot = { readonly items: readonly PhoneReachabilityState[] };

/** L'accusé d'un signe de vie : `tracked: false` quand l'appareil n'est pas le téléphone suivi. */
export type PhoneAliveAck =
  | { readonly success: true; readonly data: { readonly tracked: boolean } }
  | { readonly success: false; readonly error: string; readonly code: PhoneReachabilityErrorCode };

/** Réglage GLOBAL de l'émetteur (le fantôme) : partager l'injoignabilité de son téléphone. */
export const phoneReachabilityEmitterSettingsUpdateSchema = z.object({ sharingEnabled: z.boolean() }).strict();
export type PhoneReachabilityEmitterSettingsUpdate = z.infer<typeof phoneReachabilityEmitterSettingsUpdateSchema>;
export type PhoneReachabilityEmitterSettings = { readonly sharingEnabled: boolean };

/** Réglage PAR PERSONNE : `shared` est ce que JE partage à l'autre (accord donné une fois à un Proche, retrait possible même à un Sang). */
export const phoneReachabilityPersonSettingsUpdateSchema = z.object({ shared: z.boolean() }).strict();
export type PhoneReachabilityPersonSettingsUpdate = z.infer<typeof phoneReachabilityPersonSettingsUpdateSchema>;
export type PhoneReachabilityPersonSettings = {
  readonly userId: string;
  /** Ce que la loi dit MAINTENANT : l'autre reçoit-il l'injoignabilité de mon téléphone ? */
  readonly shared: boolean;
};
