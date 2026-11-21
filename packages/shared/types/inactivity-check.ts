/**
 * LA VÉRIFICATION D'INACTIVITÉ — « si mon téléphone reste inactif trop longtemps et que je ne
 * réponds pas, mes Sangs sont prévenus » (#18738, TEL-02). Sur le socle du téléphone injoignable
 * (#18737) : le même téléphone suivi, la même matrice, le même relais par lecteur.
 *
 * 1. L'ACTIVITÉ est celle de la PERSONNE : l'app ouverte sur le téléphone suivi (sa socket), ou sa
 *    réponse « Je vais bien » — jamais une sonde silencieuse ni un relevé de batterie d'arrière-plan ;
 * 2. après le délai choisi sans activité, le téléphone reçoit un push VISIBLE « Tout va bien ? »
 *    (`WELLNESS_CHECK_NOTIFICATION_TYPE`), auquel répondent l'action « Je vais bien »
 *    (`POST /me/wellness/ok`) ou toute activité ;
 * 3. sans réponse dans `answerWindowMinutes`, les Sangs (`safety.inactivity`) reçoivent
 *    `INACTIVITY_ALERT_NOTIFICATION_TYPE`, avec la dernière position et la dernière batterie
 *    SEULEMENT si elles leur sont déjà partagées ;
 * 4. la première activité qui suit annonce le retour aux mêmes Sangs.
 *
 * Jamais un message de conversation.
 */
import { z } from 'zod';

export const INACTIVITY_DELAY_HOURS = [6, 12, 24] as const;
export type InactivityDelayHours = (typeof INACTIVITY_DELAY_HOURS)[number];

export type InactivityCheckConfig = {
  readonly defaultDelayHours: InactivityDelayHours;
  /** Le temps laissé pour répondre à « Tout va bien ? » avant de prévenir les Sangs. */
  readonly answerWindowMinutes: number;
  /** Durée de vie de l'état en Redis : aucun historique au-delà. */
  readonly stateTtlSeconds: number;
};

export const INACTIVITY_CHECK_CONFIG: InactivityCheckConfig = {
  defaultDelayHours: 12,
  answerWindowMinutes: 30,
  stateTtlSeconds: 259_200,
};

/** La question posée au téléphone : une notification visible, adressée à soi. */
export const WELLNESS_CHECK_NOTIFICATION_TYPE = 'wellness_check' as const;
/** L'alerte et le retour, poussés aux Sangs. */
export const INACTIVITY_ALERT_NOTIFICATION_TYPE = 'inactivity_alert' as const;

export const INACTIVITY_ANNOUNCEMENT_KINDS = ['alert', 'responded'] as const;
export type InactivityAnnouncementKind = (typeof INACTIVITY_ANNOUNCEMENT_KINDS)[number];

export type InactivityAnnouncement = {
  readonly kind: InactivityAnnouncementKind;
  /** La dernière activité connue du téléphone : « n'a pas répondu depuis 8:00 ». */
  readonly inactiveSince: string;
  readonly at: string;
};

/** Le délai choisi, ou `null` : la vérification est coupée pour tous. */
export const inactivityCheckSettingsUpdateSchema = z
  .object({ delayHours: z.union([z.literal(6), z.literal(12), z.literal(24), z.null()]) })
  .strict();
export type InactivityCheckSettingsUpdate = z.infer<typeof inactivityCheckSettingsUpdateSchema>;
export type InactivityCheckSettings = { readonly delayHours: InactivityDelayHours | null };

/** Ce que je partage à une personne (Sang : accordé par défaut, retirable). */
export const inactivityCheckPersonSettingsUpdateSchema = z.object({ shared: z.boolean() }).strict();
export type InactivityCheckPersonSettings = { readonly userId: string; readonly shared: boolean };

const objectId = z.string().regex(/^[0-9a-f]{24}$/i);
const instant = z.iso.datetime({ offset: true });

/** La dernière position, SEULEMENT quand le Sang la reçoit déjà (`location.history`, #13937). */
export const inactivityLastPositionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
  recordedAt: instant,
});
export type InactivityLastPosition = z.infer<typeof inactivityLastPositionSchema>;

/** La dernière batterie, SEULEMENT quand le Sang la reçoit déjà (`device.battery`, #14147). */
export const inactivityLastBatterySchema = z.object({ level: z.number().int().min(0).max(100), measuredAt: instant });
export type InactivityLastBattery = z.infer<typeof inactivityLastBatterySchema>;

/**
 * L'état servi à UN Sang pendant l'alerte : depuis quand le téléphone ne montre plus d'activité, et
 * ce qui lui est déjà partagé par ailleurs. Une position ou une batterie illisible se tait, l'état reste lu.
 */
export const inactivityAlertStateSchema = z.object({
  userId: objectId,
  inactiveSince: instant,
  alertedAt: instant,
  lastPosition: inactivityLastPositionSchema.optional().catch(undefined),
  lastBattery: inactivityLastBatterySchema.optional().catch(undefined),
});
export type InactivityAlertState = {
  readonly userId: string;
  readonly inactiveSince: string;
  readonly alertedAt: string;
  readonly lastPosition?: InactivityLastPosition;
  readonly lastBattery?: InactivityLastBattery;
};

export const inactivityAnnouncementSchema = z.object({
  kind: z.enum(INACTIVITY_ANNOUNCEMENT_KINDS),
  inactiveSince: instant,
  at: instant,
});

const tolerantAnnouncement = inactivityAnnouncementSchema.optional().catch(undefined);

/** `inactivity:alert` — à un Sang, dans `user:<lecteur>`. */
export const inactivityAlertEventDataSchema = z.object({ userId: objectId, state: inactivityAlertStateSchema, announcement: tolerantAnnouncement });
export type InactivityAlertEventData = { readonly userId: string; readonly state: InactivityAlertState; readonly announcement?: InactivityAnnouncement };

/** `inactivity:cleared` — la personne a répondu, ou l'alerte ne vous est plus servie. */
export const inactivityClearedEventDataSchema = z.object({ userId: objectId, announcement: tolerantAnnouncement });
export type InactivityClearedEventData = { readonly userId: string; readonly announcement?: InactivityAnnouncement };

export const inactivitySnapshotSchema = z.object({ items: z.array(inactivityAlertStateSchema) });
export type InactivitySnapshot = { readonly items: readonly InactivityAlertState[] };

/** L'accusé de « Je vais bien » : `tracked: false` quand l'appareil n'est pas le téléphone suivi. */
export type WellnessOkAck = { readonly tracked: boolean };
