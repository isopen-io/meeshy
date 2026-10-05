/**
 * Les pushes d'APPEL ENTRANT d'un callee hors premier plan — politique PURE.
 *
 * Deux pushes par callee, un par famille d'appareils :
 * - Apple — `voip` (CallKit) ; `apns` alerte pour un appareil chinois
 *   (Guideline 5, MIIT : CallKit interdit) ou sans jeton voip actif (GW6(b)).
 * - FCM — `android` et `web` (#8043). Android le reçoit DATA-ONLY (sonnerie
 *   plein écran côté client, TTL = fenêtre de sonnerie : `sendViaFCM`) ; le
 *   service worker web en fait une notification d'appel avec Répondre /
 *   Refuser. Les deux libellés voyagent DANS `data`, localisés à la langue du
 *   callee (Prisme) : un service worker ne peut charger aucun catalogue.
 *
 * Même `data` pour les deux familles, aux libellés près : un client qui
 * reçoit l'un ou l'autre parle du MÊME appel avec les mêmes clés.
 */

import { notificationString } from '@meeshy/shared/utils/notification-strings';

import type { SendPushOptions } from './PushNotificationService';

export type IncomingCallPushInput = {
  readonly calleeUserId: string;
  readonly callId: string;
  readonly conversationId: string;
  readonly callerUserId: string;
  readonly callerName: string;
  readonly callerAvatar: string | undefined;
  readonly isVideo: boolean;
  readonly language: string | undefined;
  /** JSON des serveurs ICE du callee — `data` APNs/FCM est `Record<string, string>`. */
  readonly iceServersJson: string;
  readonly isChinaDevice: boolean;
  readonly voipCapable: boolean;
};

export function buildIncomingCallPushes(input: IncomingCallPushInput): SendPushOptions[] {
  const title = notificationString(input.language, 'call.incoming.title', { actor: input.callerName });
  const body = notificationString(input.language, 'call.incoming.body', { callType: input.isVideo ? 'video' : 'audio' });
  const data = {
    type: 'call',
    callId: input.callId,
    conversationId: input.conversationId,
    callerName: input.callerName,
    callerUserId: input.callerUserId,
    callerAvatar: input.callerAvatar || '',
    isVideo: String(input.isVideo),
    iceServers: input.iceServersJson,
  };
  const common = {
    userId: input.calleeUserId,
    bypassDnd: true,
  } as const;

  return [
    {
      ...common,
      payload: {
        title,
        body,
        callId: input.callId,
        callerName: input.callerName,
        callerAvatar: input.callerAvatar,
        data,
      },
      types: input.isChinaDevice || !input.voipCapable ? ['apns'] : ['voip'],
    },
    {
      ...common,
      payload: {
        title,
        body,
        callId: input.callId,
        callerName: input.callerName,
        callerAvatar: input.callerAvatar,
        data: {
          ...data,
          answerLabel: notificationString(input.language, 'call.action.answer'),
          declineLabel: notificationString(input.language, 'call.action.decline'),
        },
      },
      types: ['fcm'],
      platforms: ['android', 'web'],
    },
  ];
}
