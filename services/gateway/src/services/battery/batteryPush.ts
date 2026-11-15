/**
 * LE PUSH DE LA BATTERIE (#14147, spec § 4) — une notification dédiée (`device_battery`),
 * jamais un message de conversation. Le titre est CADRÉ dans la langue du lecteur
 * (`utils/recipient-language.ts`), le corps tient en un niveau : rien d'autre ne voyage.
 * Le pipeline existant décide du reste (préférence `deviceBatteryEnabled`, blocage, sourdine).
 *
 * AUCUN HISTORIQUE (spec § 3) : la ligne `Notification` expire avec l'état (24 h), le niveau
 * n'est que dans son corps, et elle se retire chez qui perd l'accès (`retractBatteryNotifications`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { BATTERY_CONFIG, type BatteryAnnouncement } from '@meeshy/shared/types/battery';
import type { DeviceBatteryNotificationMetadata } from '@meeshy/shared/types/notification';
import { notificationString, type NotificationStringKey } from '@meeshy/shared/utils/notification-strings';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import type { NotificationService } from '../notifications/NotificationService';
import type { BatteryPush, BatteryPusher } from './batteryRelay';

type PushedKind = DeviceBatteryNotificationMetadata['batteryKind'];

const PUSHED_KIND: Partial<Record<BatteryAnnouncement['kind'], PushedKind>> = {
  critical: 'critical',
  'critical-drop': 'critical',
  'probably-off': 'probably-off',
  'back-on': 'back-on',
  charging: 'charging',
  recharged: 'recharged',
};

const ACTION_KEY: Record<PushedKind, NotificationStringKey> = {
  critical: 'battery.criticalAction',
  'probably-off': 'battery.probablyOffAction',
  'back-on': 'battery.backOnAction',
  charging: 'battery.chargingAction',
  recharged: 'battery.rechargedAction',
};

export type BatteryPushDb = Pick<PrismaClient, 'user'>;
export type BatteryNotifier = Pick<NotificationService, 'createNotification'>;

type Emitter = { readonly id: string; readonly username: string; readonly displayName: string | null; readonly avatar: string | null };

function bodyOf(lang: string, kind: PushedKind, level: number | null): string {
  if (level === null) return notificationString(lang, ACTION_KEY[kind]);
  return notificationString(lang, kind === 'probably-off' ? 'battery.offBody' : 'battery.levelBody', { count: level });
}

export function batteryPusherOf(params: {
  readonly prisma: BatteryPushDb;
  readonly notifications: BatteryNotifier | null;
  readonly now?: () => number;
}): BatteryPusher {
  const now = params.now ?? Date.now;
  return async (push: BatteryPush) => {
    const kind = PUSHED_KIND[push.announcement.kind];
    if (kind === undefined || params.notifications === null) return false;
    const [reader, emitter] = await Promise.all([
      params.prisma.user.findUnique({ where: { id: push.readerId }, select: { id: true, ...RECIPIENT_LANG_SELECT } }),
      params.prisma.user.findUnique({ where: { id: push.emitterId }, select: { id: true, username: true, displayName: true, avatar: true } }) as Promise<Emitter | null>,
    ]);
    if (reader === null || emitter === null) return false;
    const lang = recipientLanguage(reader, 'fr');
    const name = emitter.displayName?.trim() || emitter.username;
    const metadata: DeviceBatteryNotificationMetadata = {
      action: 'view_profile',
      userId: emitter.id,
      batteryKind: kind,
    };
    const created = await params.notifications.createNotification({
      userId: push.readerId,
      type: 'device_battery',
      priority: kind === 'critical' || kind === 'probably-off' ? 'high' : 'normal',
      lang,
      title: `${name} ${notificationString(lang, ACTION_KEY[kind])}`,
      content: bodyOf(lang, kind, push.announcement.level),
      actor: { id: emitter.id, username: emitter.username, displayName: name, avatar: emitter.avatar },
      context: {},
      metadata,
      collapseId: `battery-${emitter.id}`,
      expiresAt: new Date(now() + BATTERY_CONFIG.stateTtlSeconds * 1000),
    });
    return created !== null && created !== undefined;
  };
}
