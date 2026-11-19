/**
 * « EN APPEL » — « mes Sangs voient que je suis en appel, sans savoir avec qui » (#18753, ACT-01
 * du catalogue `docs/specs/cercles/etat-du-telephone.md`). Même forme que la batterie (#14147).
 *
 * 1. Le téléphone SUIVI rapporte `POST /me/device/call { active }` quand il voit un appel commencer
 *    ou finir (`CXCallObserver` sur iOS, le mode audio sur Android) — appels du téléphone et de
 *    Meeshy confondus, et JAMAIS l'interlocuteur ;
 * 2. chaque Sang autorisé (`device.call`) reçoit dans `user:<lecteur>` `phone-call:started` avec
 *    l'état, l'annonce seulement quand il est « en conversation » avec l'émetteur (SyncPill) ;
 *    `phone-call:ended` clôt l'état. Aucun push : être en appel n'est pas une alerte ;
 * 3. le début servi est arrondi à `servedSinceStepMinutes` : deux personnes vues « en appel
 *    depuis 14:02:13 » trahiraient qu'elles se parlent ;
 * 4. l'état porte `expiresAt` : un téléphone qui ne rapporte jamais la fin (app suspendue, tuée)
 *    ne laisse pas un « en appel » éternel — le client le cache passé ce délai.
 *
 * Jamais un message de conversation. Les schémas DESCENDANTS tolèrent une annonce inconnue.
 */
import { z } from 'zod';

export const PHONE_CALL_ANNOUNCEMENT_KINDS = ['started', 'ended'] as const;
export type PhoneCallAnnouncementKind = (typeof PHONE_CALL_ANNOUNCEMENT_KINDS)[number];

export type PhoneCallConfig = {
  /** Sans rappel du téléphone depuis ce délai, l'état n'est plus servi (et un rappel ouvre un appel neuf). */
  readonly reportTtlMinutes: number;
  /** Le pas d'arrondi du début servi. */
  readonly servedSinceStepMinutes: number;
};

export const PHONE_CALL_CONFIG: PhoneCallConfig = {
  reportTtlMinutes: 180,
  servedSinceStepMinutes: 5,
};

const objectId = z.string().regex(/^[0-9a-f]{24}$/i);
const instant = z.iso.datetime({ offset: true });

/** Le rapport du téléphone suivi : un booléen, et rien d'autre — aucun numéro, aucun nom, aucune durée. */
export const phoneCallReportSchema = z.object({ active: z.boolean() }).strict();
export type PhoneCallReport = z.infer<typeof phoneCallReportSchema>;

export const phoneCallAnnouncementSchema = z.object({ kind: z.enum(PHONE_CALL_ANNOUNCEMENT_KINDS), at: instant });
export type PhoneCallAnnouncement = { readonly kind: PhoneCallAnnouncementKind; readonly at: string };

export const phoneCallStateSchema = z.object({ userId: objectId, since: instant, expiresAt: instant });
export type PhoneCallState = { readonly userId: string; readonly since: string; readonly expiresAt: string };

const tolerantAnnouncement = phoneCallAnnouncementSchema.optional().catch(undefined);

/** `phone-call:started` — à un Sang, dans `user:<lecteur>`. */
export const phoneCallStartedEventDataSchema = z.object({ userId: objectId, state: phoneCallStateSchema, announcement: tolerantAnnouncement });
export type PhoneCallStartedEventData = { readonly userId: string; readonly state: PhoneCallState; readonly announcement?: PhoneCallAnnouncement };

/** `phone-call:ended` — l'appel est fini, ou ne vous est plus servi : l'état disparaît. */
export const phoneCallEndedEventDataSchema = z.object({ userId: objectId, announcement: tolerantAnnouncement });
export type PhoneCallEndedEventData = { readonly userId: string; readonly announcement?: PhoneCallAnnouncement };

export const phoneCallSnapshotSchema = z.object({ items: z.array(phoneCallStateSchema) });
export type PhoneCallSnapshot = { readonly items: readonly PhoneCallState[] };

/** L'accusé d'un rapport : `tracked: false` quand l'appareil n'est pas le téléphone suivi. */
export type PhoneCallAck = { readonly tracked: boolean };

/** Réglage GLOBAL de l'émetteur : partager « en appel » (coupé = le fantôme, collecte comprise). */
export const phoneCallEmitterSettingsUpdateSchema = z.object({ sharingEnabled: z.boolean() }).strict();
export type PhoneCallEmitterSettings = { readonly sharingEnabled: boolean };

/** Réglage PAR PERSONNE : ce que je partage à l'autre (Sang : accordé par défaut, retirable). */
export const phoneCallPersonSettingsUpdateSchema = z.object({ shared: z.boolean() }).strict();
export type PhoneCallPersonSettings = { readonly userId: string; readonly shared: boolean };
