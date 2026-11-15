/**
 * Le câblage du relais de la batterie (#14147), sur le modèle de `nowPlayingDeps.ts` : le cache
 * partagé du processus résolu à l'usage, l'horloge, la porte d'émission, le contexte « en
 * conversation », le push dédié, le téléphone suivi et le réveil silencieux du relevé.
 * Les routes qui changent un lien, un consentement ou un blocage rejouent la projection de la
 * paire par {@link refreshBatteryAfter} — batterie ET téléphone injoignable (#18737) : un échec
 * n'arrête jamais le geste.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { BATTERY_NOTIFICATION_TYPE, BATTERY_PULL_PUSH_TYPE } from '@meeshy/shared/types/battery';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { getCacheStore } from '../CacheStore';
import { getPushNotificationService } from '../PushNotificationService';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { isViewingConversation } from '../../socketio/conversationViewingProbe';
import { SOCKET_SESSION_ID } from '../../socketio/disconnectSession';
import { batteryContextReaderOf } from './batteryContext';
import { batteryPusherOf } from './batteryPush';
import type { BatteryPullDeps } from './batteryPull';
import { captureBatteryAccess, refreshBatteryBetween, type BatteryPairAccess, type BatteryPushPair, type BatteryRelayDeps } from './batteryRelay';
import type { BatteryCache } from './batteryStore';
import { phoneReachabilityRelayDepsOf } from '../phoneReachability/phoneReachabilityDeps';
import { capturePhoneReachabilityAccess, refreshPhoneReachabilityBetween } from '../phoneReachability/phoneReachabilityRelay';

/** Sans Redis (développement, panne), l'ensemble des émetteurs surveillés vit dans le processus. */
const localSets = new Map<string, Set<string>>();

type SetClient = { sadd(key: string, member: string): Promise<unknown>; srem(key: string, member: string): Promise<unknown>; smembers(key: string): Promise<string[]> };

const nativeSets = (): SetClient | null => {
  const store = getCacheStore() as Partial<ReturnType<typeof getCacheStore>>;
  return typeof store.getNativeClient === 'function' ? store.getNativeClient() : null;
};

const lazyCache: BatteryCache = {
  get: (key) => getCacheStore().get(key),
  set: (key, value, ttlSeconds) => getCacheStore().set(key, value, ttlSeconds),
  del: (key) => getCacheStore().del(key),
  setnx: (key, value, ttlSeconds) => getCacheStore().setnx(key, value, ttlSeconds),
  addMember: async (key, member) => {
    const redis = nativeSets();
    if (redis === null) localSets.set(key, new Set([...(localSets.get(key) ?? []), member]));
    else await redis.sadd(key, member);
  },
  removeMember: async (key, member) => {
    const redis = nativeSets();
    if (redis === null) localSets.get(key)?.delete(member);
    else await redis.srem(key, member);
  },
  members: async (key) => {
    const redis = nativeSets();
    return redis === null ? [...(localSets.get(key) ?? [])] : redis.smembers(key);
  },
};

const MOBILE_PLATFORMS: ReadonlySet<string> = new Set(['ios', 'android']);
const RECENT_SESSIONS = 20;

type SessionShape = { readonly id: string; readonly deviceType: string | null; readonly platform: string | null; readonly deviceModel: string | null };

/**
 * Une session de TÉLÉPHONE (spec § 6) : `deviceType` mobile, ou une plateforme native sans type
 * lu — jamais une tablette. L'app iOS déclare `ios` et la passerelle en déduit `mobile` pour un
 * iPad aussi : son modèle (`iPad…`) le trahit.
 */
export const isPhoneSession = (session: Omit<SessionShape, 'id'>): boolean => {
  if (session.deviceType === 'tablet' || session.deviceModel?.startsWith('iPad')) return false;
  return session.deviceType === 'mobile' || (session.platform !== null && MOBILE_PLATFORMS.has(session.platform));
};

/**
 * La session du téléphone SUIVI d'un compte : sa session de téléphone vivante la plus récemment
 * active ; `null` quand le compte n'a aucun téléphone reconnu.
 */
export async function trackedBatterySession(
  prisma: Pick<PrismaClient, 'userSession'>,
  params: { readonly userId: string; readonly now: Date },
): Promise<string | null> {
  const recent = (await prisma.userSession.findMany({
    where: { userId: params.userId, isValid: true, expiresAt: { gt: params.now } },
    orderBy: { lastActivityAt: 'desc' },
    select: { id: true, deviceType: true, platform: true, deviceModel: true },
    take: RECENT_SESSIONS,
  })) as readonly SessionShape[];
  return recent.find(isPhoneSession)?.id ?? null;
}

/**
 * Le téléphone SUIVI relève-t-il ? Un compte sans téléphone reconnu relève depuis l'appareil
 * qu'il a ; une autre session face à un téléphone suivi ne relève pas (une tablette ne fait pas
 * croire à une batterie à plat).
 */
export async function isTrackedBatteryDevice(
  prisma: Pick<PrismaClient, 'userSession'>,
  params: { readonly userId: string; readonly sessionId: string | null; readonly now: Date },
): Promise<boolean> {
  const tracked = await trackedBatterySession(prisma, params);
  return tracked === null || tracked === params.sessionId;
}

type SessionSocket = { readonly data?: unknown };
type RoomReader = { in(room: string): { fetchSockets(): Promise<readonly SessionSocket[]> } };

const roomReaderOf = (io: ServerEmitIO | undefined): RoomReader | null =>
  io !== undefined && typeof (io as Partial<RoomReader>).in === 'function' ? (io as unknown as RoomReader) : null;

/**
 * La session du téléphone suivi a-t-elle une socket OUVERTE, sur n'importe quelle passerelle de
 * la flotte ? Une connexion vivante est un signe de vie : un téléphone allumé n'est pas éteint.
 */
export async function isTrackedBatteryDeviceConnected(
  params: { readonly prisma: Pick<PrismaClient, 'userSession'>; readonly io: ServerEmitIO | undefined; readonly userId: string; readonly now: Date },
): Promise<boolean> {
  const rooms = roomReaderOf(params.io);
  if (rooms === null) return false;
  const tracked = await trackedBatterySession(params.prisma, params);
  const sockets = await rooms.in(ROOMS.user(params.userId)).fetchSockets();
  return sockets.some((socket) => tracked === null || (socket.data as Record<string, unknown> | undefined)?.[SOCKET_SESSION_ID] === tracked);
}

/**
 * Les notifications de batterie d'un émetteur chez un lecteur qui ne le voit plus : retirées
 * (un retrait de consentement, un blocage, une baisse ou un départ ne laissent aucune trace de
 * niveau). Elles expirent de toute façon en 24 h.
 */
export async function retractBatteryNotifications(prisma: Pick<PrismaClient, '$runCommandRaw'>, pairs: readonly BatteryPushPair[]): Promise<void> {
  if (pairs.length === 0) return;
  await prisma.$runCommandRaw({
    delete: 'Notification',
    deletes: [{
      q: { type: BATTERY_NOTIFICATION_TYPE, $or: pairs.map((pair) => ({ userId: { $oid: pair.readerId }, 'actor.id': pair.emitterId })) },
      limit: 0,
    }],
  });
}

export function batteryRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined }): BatteryRelayDeps {
  return {
    prisma: params.prisma,
    cache: lazyCache,
    io: params.io,
    now: () => Date.now(),
    context: batteryContextReaderOf({ prisma: params.prisma, isViewing: isViewingConversation }),
    push: batteryPusherOf({ prisma: params.prisma, notifications: getSharedNotificationService() ?? null }),
    isTrackedDevice: ({ userId, sessionId }) => isTrackedBatteryDevice(params.prisma, { userId, sessionId, now: new Date() }),
    trackedDeviceConnected: (userId) => isTrackedBatteryDeviceConnected({ prisma: params.prisma, io: params.io, userId, now: new Date() }),
    retractPushes: (pairs) => retractBatteryNotifications(params.prisma, pairs),
  };
}

/** Le réveil SILENCIEUX : aucun titre, aucun corps, aucun nom — seulement « relève maintenant ». */
export async function wakeForBatteryPull(prisma: PrismaClient, emitterId: string, requestedAt: string): Promise<void> {
  await getPushNotificationService(prisma).sendToUser({
    userId: emitterId,
    bypassDnd: true,
    types: ['apns', 'fcm'],
    platforms: ['ios', 'android'],
    payload: { title: '', body: '', silent: true, data: { type: BATTERY_PULL_PUSH_TYPE, requestedAt } },
  });
}

export function batteryPullDepsOf(params: { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined }): BatteryPullDeps {
  return {
    prisma: params.prisma,
    cache: lazyCache,
    io: params.io,
    now: () => Date.now(),
    wake: (emitterId, requestedAt) => wakeForBatteryPull(params.prisma, emitterId, requestedAt),
  };
}

/**
 * Les relais de l'ÉTAT DU TÉLÉPHONE d'un compte — batterie (#14147) et injoignabilité (#18737) —
 * pour les gestes qui les rejouent ensemble (fin d'un rôle d'équipe, `revokeTeamSharesOf`).
 */
export function deviceStateRelaysOf(params: { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined }) {
  return { battery: batteryRelayDepsOf(params), phoneReachability: phoneReachabilityRelayDepsOf(params) };
}

type RefreshParams = { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined; readonly report: (error: unknown) => void };

/**
 * Ce que la paire voit de l'ÉTAT DU TÉLÉPHONE de l'autre, AVANT un changement : la batterie, et
 * l'injoignabilité du téléphone (#18737), dont les clés portent le préfixe `phone:`. Les routes qui
 * changent un lien, un consentement ou un blocage n'appellent qu'un couple capture / rafraîchissement.
 */
const PHONE_PREFIX = 'phone:';

/** À appeler AVANT une baisse, un blocage ou un retrait ; une lecture ratée rend une capture vide. */
export async function captureBatteryBefore(params: RefreshParams, pair: { readonly userA: string; readonly userB: string }): Promise<BatteryPairAccess> {
  const [battery, phone] = await Promise.all([
    captureBatteryAccess(batteryRelayDepsOf(params), pair).catch((error: unknown) => {
      params.report(error);
      return new Map<string, boolean>();
    }),
    capturePhoneReachabilityAccess(phoneReachabilityRelayDepsOf(params), pair)
      .catch((error: unknown) => {
        params.report(error);
        return new Map<string, boolean>();
      }),
  ]);
  return new Map([...battery, ...[...phone].map(([key, seen]) => [`${PHONE_PREFIX}${key}`, seen] as const)]);
}

export async function refreshBatteryAfter(
  params: RefreshParams,
  pair: { readonly userA: string; readonly userB: string; readonly before?: BatteryPairAccess },
): Promise<void> {
  const before = pair.before ?? new Map<string, boolean>();
  const battery = new Map([...before].filter(([key]) => !key.startsWith(PHONE_PREFIX)));
  const phone = new Map([...before].filter(([key]) => key.startsWith(PHONE_PREFIX)).map(([key, seen]) => [key.slice(PHONE_PREFIX.length), seen] as const));
  try {
    await refreshBatteryBetween(batteryRelayDepsOf(params), { userA: pair.userA, userB: pair.userB, before: battery });
  } catch (error) {
    params.report(error);
  }
  try {
    await refreshPhoneReachabilityBetween(phoneReachabilityRelayDepsOf(params), { userA: pair.userA, userB: pair.userB, before: phone });
  } catch (error) {
    params.report(error);
  }
}
