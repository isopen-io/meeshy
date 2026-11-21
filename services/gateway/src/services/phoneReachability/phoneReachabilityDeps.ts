/**
 * Le câblage du relais du téléphone injoignable (#18737), sur le modèle de `battery/batteryDeps.ts` :
 * il reprend le cache, le contexte « en conversation », le téléphone suivi et sa connexion de la
 * batterie — c'est le MÊME téléphone —, et y ajoute la sonde silencieuse et la cause probable.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PHONE_PROBE_PUSH_TYPE, PHONE_REACHABILITY_NOTIFICATION_TYPE } from '@meeshy/shared/types/phone-reachability';
import { getPushNotificationService } from '../PushNotificationService';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { retractedNotificationOf, type RetractedNotification } from '../notifications/retractedNotifications';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { isViewingConversation } from '../../socketio/conversationViewingProbe';
import { batteryContextReaderOf } from '../battery/batteryContext';
import { batteryRelayDepsOf, isTrackedBatteryDeviceConnected, trackedBatterySession } from '../battery/batteryDeps';
import { readBatteryRecord } from '../battery/batteryStore';
import { phoneReachabilityPusherOf } from './phoneReachabilityPush';
import type { PhoneReachabilityPair, PhoneReachabilityRelayDeps } from './phoneReachabilityRelay';

/** La sonde SILENCIEUSE : aucun titre, aucun corps, aucun nom — seulement « réponds ». */
export async function probePhone(prisma: PrismaClient, emitterId: string, requestedAt: string): Promise<void> {
  await getPushNotificationService(prisma).sendToUser({
    userId: emitterId,
    bypassDnd: true,
    types: ['apns', 'fcm'],
    platforms: ['ios', 'android'],
    payload: { title: '', body: '', silent: true, data: { type: PHONE_PROBE_PUSH_TYPE, requestedAt } },
  });
}

type RawId = { readonly $oid?: string } | string | null | undefined;
const idOf = (value: RawId): string | null => (typeof value === 'string' ? value : value?.$oid ?? null);

export type RetractionAnnouncer = { readonly announceNotificationsRetracted: (rows: readonly RetractedNotification[]) => Promise<void> };

/**
 * Les notifications de type `type` d'un émetteur chez un lecteur : SUPPRIMÉES, puis ANNONCÉES par le
 * service de notification (`notification:deleted` sur les appareils connectés, push de révocation
 * `notification_revoked` sur les autres) — la bannière déjà affichée et la cloche s'effacent aussi.
 * Chaque ligne passe par `retractedNotificationOf`, le site unique qui lit `delivery.pushSent` : sans
 * lui, la révocation se perdrait en silence. Partagé par le téléphone injoignable et l'inactivité.
 */
export async function retractPairNotifications(
  prisma: Pick<PrismaClient, 'notification'>,
  announcer: RetractionAnnouncer | null,
  type: string,
  pairs: readonly PhoneReachabilityPair[],
): Promise<void> {
  if (pairs.length === 0) return;
  const raw = (await prisma.notification.findRaw({
    filter: { type, $or: pairs.map((pair) => ({ userId: { $oid: pair.readerId }, 'actor.id': pair.emitterId })) },
    options: { projection: { _id: 1, userId: 1, type: 1, context: 1, delivery: 1 } },
  })) as unknown as ReadonlyArray<{ readonly _id?: RawId; readonly userId?: RawId; readonly type?: unknown; readonly context?: unknown; readonly delivery?: unknown }>;
  const rows = raw.flatMap((row) => {
    const id = idOf(row._id);
    const userId = idOf(row.userId);
    return id && userId ? [retractedNotificationOf({ id, userId, type: row.type, context: row.context, delivery: row.delivery })] : [];
  });
  if (rows.length === 0) return;
  await prisma.notification.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
  await announcer?.announceNotificationsRetracted(rows).catch(() => undefined);
}

/** Les notifications d'injoignabilité d'un émetteur chez un lecteur. */
export function retractPhoneReachabilityNotifications(
  prisma: Pick<PrismaClient, 'notification'>,
  announcer: RetractionAnnouncer | null,
  pairs: readonly PhoneReachabilityPair[],
): Promise<void> {
  return retractPairNotifications(prisma, announcer, PHONE_REACHABILITY_NOTIFICATION_TYPE, pairs);
}

/**
 * Le TÉLÉPHONE suivi, et lui seul : à la différence de la batterie, un compte sans téléphone
 * reconnu n'a rien à surveiller — un ordinateur fermé n'est pas un téléphone injoignable.
 */
export async function isTrackedPhone(prisma: PrismaClient, params: { readonly userId: string; readonly sessionId: string | null; readonly now: Date }): Promise<boolean> {
  const tracked = await trackedBatterySession(prisma, params);
  return tracked !== null && tracked === params.sessionId;
}

const LOW_PHASES: ReadonlySet<string> = new Set(['critical', 'off']);

export function phoneReachabilityRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined }): PhoneReachabilityRelayDeps {
  const battery = batteryRelayDepsOf(params);
  return {
    prisma: params.prisma,
    cache: battery.cache,
    io: params.io,
    now: () => Date.now(),
    context: batteryContextReaderOf({ prisma: params.prisma, isViewing: isViewingConversation }),
    push: phoneReachabilityPusherOf({
      prisma: params.prisma,
      notifications: getSharedNotificationService() ?? null,
      replacePrevious: (pair) => retractPhoneReachabilityNotifications(params.prisma, getSharedNotificationService() ?? null, [pair]),
    }),
    probe: (emitterId) => probePhone(params.prisma, emitterId, new Date().toISOString()),
    isTrackedDevice: ({ userId, sessionId }) => isTrackedPhone(params.prisma, { userId, sessionId, now: new Date() }),
    trackedSession: (userId) => trackedBatterySession(params.prisma, { userId, now: new Date() }),
    trackedDeviceConnected: (userId) => isTrackedBatteryDeviceConnected({ prisma: params.prisma, io: params.io, userId, now: new Date() }),
    batteryLow: async (userId) => LOW_PHASES.has((await readBatteryRecord(battery.cache, userId))?.episode.phase ?? 'normal'),
    retractPushes: (pairs) => retractPhoneReachabilityNotifications(params.prisma, getSharedNotificationService() ?? null, pairs),
  };
}
