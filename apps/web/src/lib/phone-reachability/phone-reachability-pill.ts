import { PHONE_REACHABILITY_NOTIFICATION_TYPE, type PhoneReachabilityAnnouncementKind } from '@meeshy/shared/types/phone-reachability-constants';

import type { NotificationRecord } from '@/lib/notifications/record';
import { pillAnnouncementStore, type PillAnnouncementStoreApi, type PillAnnouncementTone } from '@/lib/view/sync-pill-announcements';

/**
 * **LE TÉLÉPHONE INJOIGNABLE SUR LA PASTILLE** (#18737, TEL-01) — deux portes, une seule file, comme la batterie
 * (`battery-pill.ts`, #14147) :
 *
 * - l'annonce que la socket sert quand le canal du lecteur est `socket` (`phone:unreachable` / `phone:reachable`) ;
 * - la notification `device_unreachable` (canal `push`) reçue onglet OUVERT : la bannière in-app la remet ICI.
 *
 * Une clé par personne : l'annonce de la même personne remplace celle qui attend. La pastille ne range rien :
 * l'annonce défile, disparaît, et revient au prochain événement. Module LÉGER, sans catalogue.
 */

export const phoneReachabilityPillTone = (kind: PhoneReachabilityAnnouncementKind): PillAnnouncementTone => (kind === 'unreachable' ? 'alert' : 'good');

const keyOf = (userId: string): string => `phone:${userId}`;

export function announcePhoneReachabilityOnPill({
  store = pillAnnouncementStore,
  userId,
  text,
  kind,
  now,
}: {
  readonly store?: PillAnnouncementStoreApi;
  readonly userId: string;
  readonly text: string;
  readonly kind: PhoneReachabilityAnnouncementKind;
  readonly now: number;
}): void {
  store.getState().announce({
    id: `${keyOf(userId)}:${kind}:${now}`,
    key: keyOf(userId),
    text,
    tone: phoneReachabilityPillTone(kind),
    icon: { kind: 'phone', reachable: kind === 'reachable' },
    at: now,
  });
}

/** `true` : la notification était un téléphone injoignable, et la pastille la dit ; la bannière se tait. */
export function announcePhoneReachabilityNotification(
  notification: NotificationRecord,
  { store = pillAnnouncementStore, now = Date.now() }: { readonly store?: PillAnnouncementStoreApi; readonly now?: number } = {},
): boolean {
  if (notification.type !== PHONE_REACHABILITY_NOTIFICATION_TYPE || notification.state.isRead) return false;
  const kind: PhoneReachabilityAnnouncementKind = notification.metadata.reachabilityKind === 'reachable' ? 'reachable' : 'unreachable';
  const text = [notification.title, notification.content].filter((part): part is string => part !== null && part.trim() !== '').join(' · ');
  if (text === '') return false;
  announcePhoneReachabilityOnPill({ store, userId: notification.actor?.id ?? notification.id, text, kind, now });
  return true;
}
