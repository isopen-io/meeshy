/**
 * LE PUSH DU TÉLÉPHONE INJOIGNABLE (#18737) — une notification dédiée (`device_unreachable`),
 * jamais un message de conversation. Le titre est CADRÉ dans la langue du lecteur
 * (`utils/recipient-language.ts`) ; le corps dit depuis combien de minutes le téléphone ne
 * donne plus signe de vie et la cause probable — l'heure exacte, qui dépend du fuseau du lecteur,
 * est rendue par l'app depuis l'état. Le pipeline existant décide du reste (préférence
 * `deviceUnreachableEnabled`, blocage, sourdine).
 *
 * AUCUN HISTORIQUE : chaque annonce RETIRE d'abord la précédente de la même paire (`replacePrevious`),
 * si bien qu'un lecteur garde au plus une ligne par émetteur ; elle expire avec l'état, le push la
 * remplace sur l'appareil (`collapseId` commun), et elle se retire chez qui perd l'accès.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PHONE_REACHABILITY_CONFIG } from '@meeshy/shared/types/phone-reachability';
import type { DeviceUnreachableNotificationMetadata } from '@meeshy/shared/types/notification';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import type { NotificationService } from '../notifications/NotificationService';
import type { PhoneReachabilityPair, PhoneReachabilityPush, PhoneReachabilityPusher } from './phoneReachabilityRelay';

export type PhoneReachabilityPushDb = Pick<PrismaClient, 'user'>;
export type PhoneReachabilityNotifier = Pick<NotificationService, 'createNotification'>;

type Emitter = { readonly id: string; readonly username: string; readonly displayName: string | null; readonly avatar: string | null };

const MINUTE_MS = 60_000;

const silentMinutes = (push: PhoneReachabilityPush): number =>
  push.state ? Math.max(0, Math.round((Date.parse(push.announcement.at) - Date.parse(push.state.unreachableSince)) / MINUTE_MS)) : 0;

function bodyOf(lang: string, push: PhoneReachabilityPush): string {
  if (push.announcement.kind === 'reachable') return notificationString(lang, 'unreachable.reachableBody');
  const key = push.state?.cause === 'battery' ? 'unreachable.batteryBody' : 'unreachable.sinceBody';
  return notificationString(lang, key, { count: silentMinutes(push) });
}

const causeOf = (push: PhoneReachabilityPush): Pick<DeviceUnreachableNotificationMetadata, 'cause'> =>
  push.state && push.state.cause !== 'unknown' ? { cause: push.state.cause } : {};

export function phoneReachabilityPusherOf(params: {
  readonly prisma: PhoneReachabilityPushDb;
  readonly notifications: PhoneReachabilityNotifier | null;
  /** Retire la notification précédente de la paire : un lecteur ne garde jamais l'historique des pannes. */
  readonly replacePrevious?: (pair: PhoneReachabilityPair) => Promise<void>;
  readonly now?: () => number;
}): PhoneReachabilityPusher {
  const now = params.now ?? Date.now;
  return async (push) => {
    if (params.notifications === null) return false;
    const [reader, emitter] = await Promise.all([
      params.prisma.user.findUnique({ where: { id: push.readerId }, select: { id: true, ...RECIPIENT_LANG_SELECT } }),
      params.prisma.user.findUnique({ where: { id: push.emitterId }, select: { id: true, username: true, displayName: true, avatar: true } }) as Promise<Emitter | null>,
    ]);
    if (reader === null || emitter === null) return false;
    const lang = recipientLanguage(reader, 'fr');
    const name = emitter.displayName?.trim() || emitter.username;
    const unreachable = push.announcement.kind === 'unreachable';
    const metadata: DeviceUnreachableNotificationMetadata = {
      action: 'view_profile',
      userId: emitter.id,
      reachabilityKind: push.announcement.kind,
      ...(unreachable ? causeOf(push) : {}),
    };
    await params.replacePrevious?.({ emitterId: emitter.id, readerId: push.readerId }).catch(() => undefined);
    const created = await params.notifications.createNotification({
      userId: push.readerId,
      type: 'device_unreachable',
      priority: unreachable ? 'high' : 'normal',
      lang,
      title: `${name} ${notificationString(lang, unreachable ? 'unreachable.action' : 'unreachable.reachableAction')}`,
      content: bodyOf(lang, push),
      actor: { id: emitter.id, username: emitter.username, displayName: name, avatar: emitter.avatar },
      context: {},
      metadata,
      collapseId: `unreachable-${emitter.id}`,
      expiresAt: new Date(now() + PHONE_REACHABILITY_CONFIG.stateTtlSeconds * 1000),
    });
    return created !== null && created !== undefined;
  };
}
