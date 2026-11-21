/**
 * Le câblage du relais du partage temporaire de position (#14109, #16980) : le magasin
 * Redis strict du processus, l'horloge, et la porte d'émission. Les routes qui changent un
 * lien ou un blocage rejouent la projection de la paire par
 * {@link refreshSharedLocationAfter} : un échec n'arrête jamais le geste, il est
 * seulement journalisé (sans charge).
 */
import { refreshInactivityServedAfter } from '../inactivityCheck/inactivityDeps';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../CacheStore';
import { getPushNotificationService } from '../PushNotificationService';
import { buildLocationShareEndedPush } from '../notifications/liveActivityApns';
import { purgeSharedLocationLiveActivityTokens, sharedLocationEndPusherOf, type SharedLocationEndPush } from './sharedLocationLiveActivity';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { sharedLocationNoticesOf } from './sharedLocationNotices';
import type { SharedLocationRequestDeps } from './sharedLocationRequest';
import type { LocationGhostState } from '@meeshy/shared/types/shared-location';
import { setLocationGhost } from './locationGhost';
import { exportSharedLocationEnds, type SharedLocationEnd } from './sharedLocationEnds';
import { lazySharedLocationCache as lazyCache } from './sharedLocationLazyCache';
import { refreshBatteryForReaders } from '../battery/batteryDeps';
import { enhancedLogger } from '../../utils/logger-enhanced';
import {
  captureSharedLocationAccess,
  endSharedLocationOfAccount,
  refreshSharedLocationBetween,
  type SharedLocationIo,
  type SharedLocationPairAccess,
  type SharedLocationRelayDeps,
} from './sharedLocationRelay';

const logger = enhancedLogger.child({ module: 'SharedLocationDeps' });

/** Un rejeu de batterie raté se journalise sans charge ; la batterie se recale au relevé suivant. */
const reportBattery = (error: unknown): void => logger.warn('[shared-location] battery not refreshed', { error: error instanceof Error ? error.message : 'unknown' });

/** Le service de notification est résolu à l'usage : le registre peut se remplir après le câblage des sockets. */
export const noticesParams = (prisma: PrismaClient) => ({
  prisma,
  notifications: getSharedNotificationService() ?? null,
  claim: (key: string, ttlSeconds: number) => getCacheStore().setnx(key, '1', ttlSeconds),
  release: (key: string) => getCacheStore().del(key),
});

const endLogger = enhancedLogger.child({ module: 'SharedLocationEndPush' });

/** Les deux poussées de fin (#19463), par le service de push du processus ; un échec est rendu, jamais levé. */
const endPushOf = (prisma: PrismaClient): SharedLocationEndPush => ({
  silent: async (readerId, data) => {
    await getPushNotificationService(prisma).sendToUser(buildLocationShareEndedPush(readerId, data));
  },
  liveActivityEnd: async (target, state) => {
    await getPushNotificationService(prisma).sendLiveActivityEnd(target, state);
  },
});

/**
 * Le câblage du relais : chaque fin servie part aussi hors de l'app (#19463), sans être
 * attendue — la poussée ne retarde ni ne fait échouer l'arrêt ; sa panne est journalisée sans charge.
 */
export function sharedLocationRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: SharedLocationIo | undefined }): SharedLocationRelayDeps {
  const now = (): number => Date.now();
  return {
    prisma: params.prisma,
    cache: lazyCache,
    io: params.io,
    now,
    ended: sharedLocationEndPusherOf({
      cache: lazyCache,
      push: endPushOf(params.prisma),
      now,
      report: (error) => endLogger.warn('shared location end push failed', { error: error instanceof Error ? error.message : 'unknown' }),
    }),
    notifyStarted: (notices) => sharedLocationNoticesOf(noticesParams(params.prisma)).started(notices),
    refreshBattery: (emitterId, readerIds) => refreshBatteryForReaders({ ...params, report: reportBattery }, emitterId, readerIds),
  };
}

/**
 * La demande de prolonger ou de refaire un partage (#19204) : le plafond est un `SET NX EX` du
 * cache partagé (son repli mémoire, en panne, garde le plafond dans le processus) ; la
 * notification passe par le service résolu à l'usage.
 */
export function sharedLocationRequestDepsOf(params: { readonly prisma: PrismaClient; readonly io: SharedLocationIo | undefined }): SharedLocationRequestDeps {
  return {
    prisma: params.prisma,
    io: params.io,
    now: () => Date.now(),
    claim: (key, ttlSeconds) => getCacheStore().setnx(key, '1', ttlSeconds),
    notify: (notice) => sharedLocationNoticesOf(noticesParams(params.prisma)).requested(notice),
  };
}

type RefreshParams = { readonly prisma: PrismaClient; readonly io: SharedLocationIo | undefined; readonly report: (error: unknown) => void };

/**
 * À appeler AVANT une baisse ou un blocage ; le résultat se passe ensuite à
 * {@link refreshSharedLocationAfter} (`before`). Une lecture ratée rend une capture
 * vide : rien ne sera effacé, jamais un effacement vers qui ne voyait rien.
 */
export async function captureSharedLocationBefore(params: RefreshParams, pair: { readonly userA: string; readonly userB: string }): Promise<SharedLocationPairAccess> {
  try {
    return await captureSharedLocationAccess(sharedLocationRelayDepsOf(params), pair);
  } catch (error) {
    params.report(error);
    return new Map();
  }
}

export async function refreshSharedLocationAfter(
  params: RefreshParams,
  pair: { readonly userA: string; readonly userB: string; readonly before?: SharedLocationPairAccess },
): Promise<void> {
  try {
    await refreshSharedLocationBetween(sharedLocationRelayDepsOf(params), pair);
  } catch (error) {
    params.report(error);
  }
}

/**
 * Un compte désactivé, supprimé ou purgé ne partage plus (#16987) : son partage s'arrête
 * et ceux qui le voyaient reçoivent la fin. Avec `forget` (la purge), ses clés sans durée
 * de vie partent aussi. À appeler APRÈS l'écriture du compte ; un échec n'arrête jamais le
 * geste, il est journalisé (le partage échoit de lui-même à son terme, au plus 8 h). La purge
 * efface aussi les jetons d'Activité en direct que le compte tenait comme lecteur (#19463).
 */
export async function endSharedLocationAfter(params: RefreshParams, accountId: string, options: { readonly forget: boolean }): Promise<void> {
  try {
    const ack = await endSharedLocationOfAccount(sharedLocationRelayDepsOf(params), accountId, options);
    if (!ack.success) params.report(new Error(`shared location of ${accountId} not ended`));
    if (ack.success && options.forget) await purgeSharedLocationLiveActivityTokens(lazyCache, accountId);
  } catch (error) {
    params.report(error);
  }
}

/**
 * L'export RGPD (#19202) : les fins de mes partages récents, gardées un jour. Le magasin en
 * panne rend une liste vide et le signale : l'export ne s'arrête pas pour une donnée éphémère.
 */
export async function exportSharedLocationEndsOf(userId: string, report: (error: unknown) => void): Promise<readonly SharedLocationEnd[]> {
  try {
    return await exportSharedLocationEnds(lazyCache, userId, Date.now());
  } catch (error) {
    report(error);
    return [];
  }
}

/**
 * Règle le fantôme global (#19203) et y fait suivre le partage temporaire en cours. La sortie
 * est fail-closed et lève si le partage ne peut pas être retenu ; l'entrée et la batterie ne
 * lèvent jamais après l'écriture du compte (`setLocationGhost`).
 */
export async function setLocationGhostAfter(params: RefreshParams, userId: string, ghost: boolean): Promise<LocationGhostState> {
  const state = await setLocationGhost({ db: params.prisma, relay: sharedLocationRelayDepsOf(params), report: params.report }, userId, ghost);
  // #18738 — la dernière position servie dans une alerte d'inactivité suit le fantôme.
  await refreshInactivityServedAfter(params, userId);
  return state;
}
