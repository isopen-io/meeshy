/**
 * Le câblage du relais de la batterie (#14147), sur le modèle de `nowPlayingDeps.ts` : le cache
 * partagé du processus résolu à l'usage, l'horloge, la porte d'émission, le contexte « en
 * conversation », le push dédié, le téléphone suivi et le réveil silencieux du relevé.
 * Les routes qui changent un lien, un consentement ou un blocage rejouent la projection de la
 * paire par {@link refreshBatteryAfter} : un échec n'arrête jamais le geste.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { BATTERY_PULL_PUSH_TYPE } from '@meeshy/shared/types/battery';
import { getCacheStore } from '../CacheStore';
import { getPushNotificationService } from '../PushNotificationService';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { isViewingConversation } from '../../socketio/conversationViewingProbe';
import { batteryContextReaderOf } from './batteryContext';
import { batteryPusherOf } from './batteryPush';
import type { BatteryPullDeps } from './batteryPull';
import { captureBatteryAccess, refreshBatteryBetween, type BatteryPairAccess, type BatteryRelayDeps } from './batteryRelay';
import type { BatteryCache } from './batteryStore';

const lazyCache: BatteryCache = {
  get: (key) => getCacheStore().get(key),
  set: (key, value, ttlSeconds) => getCacheStore().set(key, value, ttlSeconds),
  del: (key) => getCacheStore().del(key),
  setnx: (key, value, ttlSeconds) => getCacheStore().setnx(key, value, ttlSeconds),
  keys: (pattern) => getCacheStore().keys(pattern),
};

const MOBILE_PLATFORMS = ['ios', 'android'];

/**
 * Le téléphone SUIVI d'un compte : sa session mobile vivante la plus récemment active. Un compte
 * sans session mobile reconnue relève depuis l'appareil qu'il a ; une session inconnue face à un
 * téléphone suivi ne relève pas (une tablette ne fait pas croire à une batterie à plat).
 */
export async function isTrackedBatteryDevice(
  prisma: Pick<PrismaClient, 'userSession'>,
  params: { readonly userId: string; readonly sessionId: string | null; readonly now: Date },
): Promise<boolean> {
  const tracked = await prisma.userSession.findFirst({
    where: {
      userId: params.userId,
      isValid: true,
      expiresAt: { gt: params.now },
      OR: [{ deviceType: 'mobile' }, { platform: { in: MOBILE_PLATFORMS } }],
    },
    orderBy: { lastActivityAt: 'desc' },
    select: { id: true },
  });
  if (tracked === null) return true;
  return tracked.id === params.sessionId;
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

type RefreshParams = { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined; readonly report: (error: unknown) => void };

/** À appeler AVANT une baisse, un blocage ou un retrait ; une lecture ratée rend une capture vide. */
export async function captureBatteryBefore(params: RefreshParams, pair: { readonly userA: string; readonly userB: string }): Promise<BatteryPairAccess> {
  try {
    return await captureBatteryAccess(batteryRelayDepsOf(params), pair);
  } catch (error) {
    params.report(error);
    return new Map();
  }
}

export async function refreshBatteryAfter(
  params: RefreshParams,
  pair: { readonly userA: string; readonly userB: string; readonly before?: BatteryPairAccess },
): Promise<void> {
  try {
    await refreshBatteryBetween(batteryRelayDepsOf(params), pair);
  } catch (error) {
    params.report(error);
  }
}
