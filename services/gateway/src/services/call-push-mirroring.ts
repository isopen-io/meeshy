/**
 * Politique PURE des pushes silencieux d'appel (stop-ring multi-device).
 *
 * Deux pushes background partagent cette politique :
 * - `call_cancel` — l'appel s'est terminé missed/rejected : les membres
 *   jamais joints doivent cesser de sonner même socket mort (backgrounded).
 * - `call_answered_elsewhere` — un device du callee a répondu : ses AUTRES
 *   devices doivent cesser de sonner même si leur WebSocket n'est jamais
 *   monté (réveil VoIP push sans socket).
 *
 * Cross-platform par construction (audit appels 2026-07-11 #2) :
 * apns+fcm / ios+android+web — le hardcode `['ios']` historique laissait un
 * Android backgrounded sonner dans le vide. Le web y est depuis #8043 : un
 * onglet fermé montre la notification d'appel du service worker
 * (`apps/web/public/sw-push.js`), que ces deux pushes retirent.
 */

export type CallSilentPushType = 'call_cancel' | 'call_answered_elsewhere';

export const CALL_SILENT_PUSH_TYPES: ReadonlyArray<'apns' | 'fcm'> = ['apns', 'fcm'];
export const CALL_SILENT_PUSH_PLATFORMS: ReadonlyArray<'ios' | 'android' | 'web'> = ['ios', 'android', 'web'];

export type CallSilentPush = {
  userId: string;
  payload: {
    title: '';
    body: '';
    silent: true;
    data: { type: CallSilentPushType; callId: string };
  };
  types: Array<'apns' | 'fcm'>;
  platforms: Array<'ios' | 'android' | 'web'>;
  bypassDnd: true;
};

export function buildCallSilentPush(params: {
  userId: string;
  type: CallSilentPushType;
  callId: string;
}): CallSilentPush {
  return {
    userId: params.userId,
    payload: {
      title: '',
      body: '',
      silent: true,
      data: { type: params.type, callId: params.callId },
    },
    types: [...CALL_SILENT_PUSH_TYPES],
    platforms: [...CALL_SILENT_PUSH_PLATFORMS],
    bypassDnd: true,
  };
}

/**
 * Prédicat du mirror `call_answered_elsewhere` : uniquement la PREMIÈRE
 * answer d'un callee (jamais l'answer de renégociation de l'initiateur ni
 * un upgrade vidéo ultérieur). Fonction pure pour être appliquée à
 * l'IDENTIQUE dans les deux branches du relais d'answer — sockets de
 * l'appelant présents OU absents (audit #3 : l'early return
 * TARGET_NOT_FOUND sautait le push et laissait les autres devices sonner).
 */
export function shouldMirrorAnsweredElsewhere(params: {
  signalType: string;
  answererUserId: string;
  initiatorId: string;
  alreadyAnswered: boolean;
}): boolean {
  return (
    params.signalType === 'answer' &&
    params.answererUserId !== params.initiatorId &&
    !params.alreadyAnswered
  );
}
