import { BATTERY_ANNOUNCEMENT_KINDS, BATTERY_NOTIFICATION_TYPE, type BatteryAnnouncementKind } from '@meeshy/shared/types/battery-constants';

import type { NotificationRecord } from '@/lib/notifications/record';
import { pillAnnouncementStore, type PillAnnouncementStoreApi, type PillAnnouncementTone } from '@/lib/view/sync-pill-announcements';

/**
 * **LA BATTERIE SUR LA PASTILLE** (#14147) — deux portes, une seule file :
 *
 * - l'annonce que la socket sert quand le canal du lecteur est `socket` (`battery:changed` / `battery:cleared`) ;
 * - la notification `device_battery` (canal `push`) reçue onglet OUVERT : le service worker se tait devant un
 *   onglet visible (D-11), la bannière in-app la remet ICI, à sa place — jamais les deux pour un même palier.
 *
 * Une clé par personne : une annonce de la même personne remplace celle qui attend. Module LÉGER : la bannière
 * in-app (chunk temps réel) l'importe, sans catalogue.
 */

export const batteryPillTone = (kind: BatteryAnnouncementKind): PillAnnouncementTone => {
  if (kind === 'critical' || kind === 'critical-drop' || kind === 'probably-off') return 'alert';
  if (kind === 'low' || kind === 'threshold') return 'warn';
  return 'good';
};

const keyOf = (userId: string): string => `battery:${userId}`;

export function announceBatteryOnPill({
  store = pillAnnouncementStore,
  userId,
  text,
  kind,
  level,
  charging,
  now,
}: {
  readonly store?: PillAnnouncementStoreApi;
  readonly userId: string;
  readonly text: string;
  readonly kind: BatteryAnnouncementKind;
  readonly level: number | null;
  readonly charging: boolean;
  readonly now: number;
}): void {
  store.getState().announce({
    id: `${keyOf(userId)}:${kind}:${now}`,
    key: keyOf(userId),
    text,
    tone: batteryPillTone(kind),
    icon: { kind: 'battery', level: kind === 'probably-off' ? null : level, charging },
    at: now,
  });
}

/** `true` : la notification était une batterie, et la pastille la dit ; la bannière se tait. */
export function announceBatteryNotification(
  notification: NotificationRecord,
  { store = pillAnnouncementStore, now = Date.now() }: { readonly store?: PillAnnouncementStoreApi; readonly now?: number } = {},
): boolean {
  if (notification.type !== BATTERY_NOTIFICATION_TYPE || notification.state.isRead) return false;
  const kind = BATTERY_ANNOUNCEMENT_KINDS.find((candidate) => candidate === notification.metadata.batteryKind) ?? 'critical';
  const text = [notification.title, notification.content].filter((part): part is string => part !== null && part.trim() !== '').join(' · ');
  if (text === '') return false;
  announceBatteryOnPill({
    store,
    userId: notification.actor?.id ?? notification.id,
    text,
    kind,
    level: null,
    charging: kind === 'charging',
    now,
  });
  return true;
}
