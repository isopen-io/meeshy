import type { NotificationRecord } from './record';

/**
 * « RAPPELER » DEPUIS LA CLOCHE (A6, C12, lot 3 des appels) — ce qu'une
 * notification d'appel manqué ou refusé permet de relancer. Elle porte la
 * conversation (`context.conversationId`), le type (`metadata.callType`,
 * `CallNotificationMetadata`) et l'appelant (`actor`) : la ligne rappelle en un
 * tap, sans passer par le fil. Un appel ENTRANT (`incoming_call`) ne se
 * rappelle pas — il sonne, et c'est l'écran d'appel qui y répond.
 */

const CALL_BACK_TYPES = new Set(['missed_call', 'CALL_MISSED', 'call_declined']);

export type NotificationCallBack = {
  readonly conversationId: string;
  readonly media: 'audio' | 'video';
  readonly title: string;
  readonly avatar: string | null;
  readonly isGroup: boolean;
};

export function notificationCallBack(notification: NotificationRecord): NotificationCallBack | null {
  const conversationId = notification.context.conversationId;
  if (!CALL_BACK_TYPES.has(notification.type) || conversationId === undefined) return null;
  const type = notification.context.conversationType;
  const isGroup = type !== undefined && type !== 'direct';
  const actorName = notification.actor?.displayName ?? notification.actor?.username ?? '';
  const title = (isGroup ? notification.context.conversationTitle : undefined) ?? actorName;
  return {
    conversationId,
    media: notification.metadata.callType === 'video' ? 'video' : 'audio',
    title,
    avatar: isGroup ? null : (notification.actor?.avatar ?? null),
    isGroup,
  };
}
