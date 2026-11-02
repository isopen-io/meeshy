/**
 * Les pushes du Bring (#13936, D-3) — politique PURE, sur le modèle de
 * `call-incoming-push.ts` (qui reste intact).
 *
 * La sonnerie, deux pushes par destinataire, un par famille d'appareils :
 * - iOS (`apns`) — une ALERTE `interruption-level: time-sensitive`, la sonnerie
 *   d'appel du bundle (`Ringtone.caf`), catégorie `BRING`, expirée avec la
 *   fenêtre. Quand Apple a accordé l'entitlement Critical Alerts
 *   (`APNS_CRITICAL_ALERTS_ENABLED=true`), le niveau devient `critical` et le son
 *   critique joue au volume plein, même en silencieux.
 * - Android (`fcm`) — DATA-ONLY haute priorité, TTL = la fenêtre : un bloc
 *   `notification` serait rendu par le SYSTÈME et le service au premier plan
 *   `USAGE_ALARM` ne serait jamais levé. Les libellés voyagent dans `data`,
 *   localisés à la langue du destinataire (Prisme, cadrage).
 * Le web n'a pas de push : il sonne onglet ouvert, par la socket.
 *
 * Toute la sonnerie passe Ne pas déranger (`bypassDnd`), et la loi de livraison
 * la classe à part (`push-delivery-preferences.ts`) : ni `pushEnabled`, ni
 * `soundEnabled`, ni les heures calmes ne la gouvernent — seul le blocage par
 * personne le fait, en amont.
 *
 * L'arrêt est SILENCIEUX (background iOS, data-only FCM) : chaque appareil du
 * destinataire cesse de sonner et retire la bannière.
 */
import {
  BRING_IOS_SOUND,
  BRING_PUSH_TYPES,
  type BringPushData,
  type BringStopReason,
  type BringStoppedPushData,
} from '@meeshy/shared/types/bring';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import type { SendPushOptions } from '../PushNotificationService';

export const BRING_PUSH_CATEGORY = 'BRING';

export type BringRingPushInput = {
  readonly bringId: string;
  readonly toUserId: string;
  readonly fromUserId: string;
  readonly fromName: string;
  readonly fromAvatar: string | null;
  readonly sentAt: Date;
  readonly expiresAt: Date;
  readonly language: string | undefined;
  readonly criticalAlerts: boolean;
};

export function buildBringRingPushes(input: BringRingPushInput): SendPushOptions[] {
  const title = notificationString(input.language, 'bring.ring.title', { actor: input.fromName });
  const body = notificationString(input.language, 'bring.ring.body');
  const ttlMs = Math.max(0, input.expiresAt.getTime() - input.sentAt.getTime());
  const data: BringPushData = {
    type: BRING_PUSH_TYPES.RING,
    bringId: input.bringId,
    fromUserId: input.fromUserId,
    fromName: input.fromName,
    fromAvatar: input.fromAvatar ?? '',
    sentAt: input.sentAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    title,
    body,
    stopLabel: notificationString(input.language, 'bring.action.stop'),
  };
  const common = { userId: input.toUserId, bypassDnd: true } as const;

  return [
    {
      ...common,
      types: ['apns'],
      platforms: ['ios'],
      payload: {
        title,
        body,
        sound: BRING_IOS_SOUND,
        interruptionLevel: input.criticalAlerts ? 'critical' : 'time-sensitive',
        ...(input.criticalAlerts ? { criticalSound: { volume: 1 } } : {}),
        category: BRING_PUSH_CATEGORY,
        collapseId: `bring-${input.bringId}`,
        ttlMs,
        data,
      },
    },
    {
      ...common,
      types: ['fcm'],
      platforms: ['android'],
      payload: { title, body, dataOnlyOnAndroid: true, ttlMs, collapseId: `bring-${input.bringId}`, data },
    },
  ];
}

export function buildBringStoppedPushes(params: {
  readonly bringId: string;
  readonly toUserId: string;
  readonly reason: BringStopReason;
}): SendPushOptions[] {
  const data: BringStoppedPushData = { type: BRING_PUSH_TYPES.STOPPED, bringId: params.bringId, reason: params.reason };
  const payload = { title: '', body: '', silent: true, data };
  return [
    { userId: params.toUserId, bypassDnd: true, types: ['apns'], platforms: ['ios'], payload },
    { userId: params.toUserId, bypassDnd: true, types: ['fcm'], platforms: ['android'], payload },
  ];
}

/** Vrai quand Apple a accordé l'entitlement Critical Alerts et que l'app le porte (D-3). */
export const criticalAlertsGranted = (): boolean => process.env.APNS_CRITICAL_ALERTS_ENABLED === 'true';
