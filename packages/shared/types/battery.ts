/**
 * LA BATTERIE DES PROCHES ET DES SANGS — « ils savent quand ma batterie m'empêchera de
 * répondre » (#14147). Spec : `docs/superpowers/specs/2026-11-15-batterie-proches-design.md`.
 *
 * UN contrat, lu par la passerelle et par les trois clients. JAMAIS un message de
 * conversation : rien n'entre dans `Message`, aucun avis système.
 *
 * 1. `battery:report` {@link BatteryReport} → accusé {@link BatteryReportAck} : le
 *    « téléphone » de l'émetteur (iOS, Android ; le web n'émet pas) envoie un relevé ;
 *    `tracked: false` quand l'appareil n'est pas celui qui est suivi ;
 * 2. le serveur fait avancer l'épisode (`batteryEpisodeStep`) et sert chaque lecteur
 *    autorisé (`device.battery`) dans `user:<lecteur>` : `battery:changed`
 *    ({@link BatteryChangedEventData}) porte l'état, et l'annonce SEULEMENT quand le
 *    canal du lecteur vaut `socket` (SyncPill) ; `battery:cleared` clôt l'épisode ;
 * 3. `battery:pull` (Sang, 1 toutes les 5 min par paire) → `battery:pull-requested`
 *    sur les sockets de l'émetteur, ou un push silencieux de relevé ;
 * 4. `GET /relations/battery` rattrape les états servis ({@link BatterySnapshot}).
 *
 * Les schémas MONTANTS sont stricts (un champ en trop est refusé) ; les DESCENDANTS
 * tolèrent un champ inconnu et une annonce d'un genre inconnu, pour qu'un client plus
 * ancien que le serveur ne casse pas (production rétrocompatible).
 */
import { z } from 'zod';

import {
  BATTERY_ANNOUNCEMENT_KINDS,
  BATTERY_DEVICE_LABEL_MAX,
  BATTERY_RECEIVE_MODES,
  type BatteryErrorCode,
  type BatteryReceiveMode,
} from './battery-constants.js';

export * from './battery-constants.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i);
const instant = z.iso.datetime({ offset: true });
const percent = z.number().int().min(0).max(100);
const deviceLabel = z.string().trim().min(1).max(BATTERY_DEVICE_LABEL_MAX);

export const batteryReportSchema = z
  .object({
    level: percent,
    charging: z.boolean(),
    lowPower: z.boolean(),
    measuredAt: instant,
    deviceLabel: deviceLabel.optional(),
  })
  .strict();
export type BatteryReport = z.infer<typeof batteryReportSchema>;

export const batteryPullPayloadSchema = z.object({ userId: objectId }).strict();
export type BatteryPullPayload = z.infer<typeof batteryPullPayloadSchema>;

/** À l'émetteur : relever maintenant. Qui l'a demandé n'est pas dit. */
export const batteryPullRequestedEventDataSchema = z.object({ requestedAt: instant }).strict();
export type BatteryPullRequestedEventData = z.infer<typeof batteryPullRequestedEventDataSchema>;

export const batteryAnnouncementSchema = z.object({
  kind: z.enum(BATTERY_ANNOUNCEMENT_KINDS),
  /** Le niveau au moment de l'annonce ; nul quand aucun relevé n'est connu. */
  level: percent.nullable(),
  /** Pour `threshold` seulement : le palier franchi (25, 20, 15, 10). */
  threshold: percent.optional(),
  at: instant,
});
export type BatteryAnnouncement = z.infer<typeof batteryAnnouncementSchema>;

/** Les phases SERVIES : hors épisode (`normal`), rien n'est servi et l'icône est cachée. */
export const BATTERY_SERVED_PHASES = ['low', 'critical', 'off', 'charging'] as const;
export type BatteryServedPhase = (typeof BATTERY_SERVED_PHASES)[number];

export const batteryReaderStateSchema = z.object({
  userId: objectId,
  phase: z.enum(BATTERY_SERVED_PHASES),
  level: percent,
  charging: z.boolean(),
  lowPower: z.boolean(),
  /** Calculé par le serveur depuis la pente de décharge ; absent quand il ne l'est pas. */
  estimatedMinutes: z.number().int().min(0).optional(),
  measuredAt: instant,
  deviceLabel: deviceLabel.optional(),
});
export type BatteryReaderState = z.infer<typeof batteryReaderStateSchema>;

/** Une annonce d'un genre que ce client ne connaît pas est ignorée, l'état reste lu. */
const tolerantAnnouncement = batteryAnnouncementSchema.optional().catch(undefined);

export const batteryChangedEventDataSchema = z.object({
  userId: objectId,
  state: batteryReaderStateSchema,
  announcement: tolerantAnnouncement,
});
export type BatteryChangedEventData = {
  readonly userId: string;
  readonly state: BatteryReaderState;
  readonly announcement?: BatteryAnnouncement;
};

export const batteryClearedEventDataSchema = z.object({
  userId: objectId,
  announcement: tolerantAnnouncement,
});
export type BatteryClearedEventData = { readonly userId: string; readonly announcement?: BatteryAnnouncement };

export const batterySnapshotSchema = z.object({ items: z.array(batteryReaderStateSchema) });
export type BatterySnapshot = { readonly items: readonly BatteryReaderState[] };

export type BatteryReportAck =
  | { readonly success: true; readonly data: { readonly tracked: boolean } }
  | { readonly success: false; readonly error: string; readonly code: BatteryErrorCode };

/**
 * L'accusé du relevé à la demande. `episodeOnly` le dit au demandeur : le relevé ne lui est
 * servi QUE s'il ouvre ou poursuit un épisode (`battery:changed`) ; à plus de 30 %, rien ne
 * revient — « ça va » et « pas de réponse » ne se distinguent pas, par construction. La même
 * réponse part quand l'émetteur a exclu le demandeur : la route n'est pas un oracle sur son choix.
 */
export type BatteryPullAck =
  | { readonly success: true; readonly data: { readonly requestedAt: string; readonly episodeOnly: true } }
  | { readonly success: false; readonly error: string; readonly code: BatteryErrorCode };

/** Réglage GLOBAL de l'émetteur : partager sa batterie (vrai par défaut — les Sangs la reçoivent sans confirmation). */
export const batteryEmitterSettingsUpdateSchema = z.object({ sharingEnabled: z.boolean() }).strict();
export type BatteryEmitterSettingsUpdate = z.infer<typeof batteryEmitterSettingsUpdateSchema>;
export type BatteryEmitterSettings = { readonly sharingEnabled: boolean };

/**
 * Réglages PAR PERSONNE : `shared` est ce que JE partage à l'autre (accord donné une fois
 * à un Proche, retrait possible même à un Sang) ; `receive` est ce que je veux recevoir
 * de SA batterie.
 */
export const batteryPersonSettingsUpdateSchema = z
  .object({ shared: z.boolean().optional(), receive: z.enum(BATTERY_RECEIVE_MODES).optional() })
  .strict()
  .refine((value) => value.shared !== undefined || value.receive !== undefined);
export type BatteryPersonSettingsUpdate = z.infer<typeof batteryPersonSettingsUpdateSchema>;
export type BatteryPersonSettings = {
  readonly userId: string;
  /** Ce que la loi dit MAINTENANT : l'autre reçoit-il ma batterie ? */
  readonly shared: boolean;
  readonly receive: BatteryReceiveMode;
};
