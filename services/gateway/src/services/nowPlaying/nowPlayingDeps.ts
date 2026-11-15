/**
 * Le câblage du relais de l'écoute (#13934, #16686) : le cache partagé du processus,
 * l'horloge, et la porte d'émission. Les routes qui changent un lien, un consentement
 * ou un blocage rejouent la projection de la paire par {@link refreshNowPlayingAfter} :
 * un échec n'arrête jamais le geste, il est seulement journalisé (sans charge).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../CacheStore';
import {
  captureNowPlayingAccess,
  refreshNowPlayingBetween,
  type NowPlayingIo,
  type NowPlayingPairAccess,
  type NowPlayingRelayDeps,
} from './nowPlayingRelay';

/** Le cache du processus, résolu à l'usage : brancher une socket n'ouvre aucune connexion. */
const lazyCache: NowPlayingRelayDeps['cache'] = {
  get: (key) => getCacheStore().get(key),
  set: (key, value, ttlSeconds) => getCacheStore().set(key, value, ttlSeconds),
  del: (key) => getCacheStore().del(key),
};

export function nowPlayingRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: NowPlayingIo | undefined }): NowPlayingRelayDeps {
  return { prisma: params.prisma, cache: lazyCache, io: params.io, now: () => Date.now() };
}

type RefreshParams = { readonly prisma: PrismaClient; readonly io: NowPlayingIo | undefined; readonly report: (error: unknown) => void };

/**
 * À appeler AVANT une baisse, un blocage ou un retrait ; le résultat se passe ensuite à
 * {@link refreshNowPlayingAfter} (`before`). Une lecture ratée rend une capture vide :
 * rien ne sera effacé, jamais un effacement vers qui ne voyait rien.
 */
export async function captureNowPlayingBefore(params: RefreshParams, pair: { readonly userA: string; readonly userB: string }): Promise<NowPlayingPairAccess> {
  try {
    return await captureNowPlayingAccess(nowPlayingRelayDepsOf(params), pair);
  } catch (error) {
    params.report(error);
    return new Map();
  }
}

export async function refreshNowPlayingAfter(
  params: RefreshParams,
  pair: { readonly userA: string; readonly userB: string; readonly before?: NowPlayingPairAccess },
): Promise<void> {
  try {
    await refreshNowPlayingBetween(nowPlayingRelayDepsOf(params), pair);
  } catch (error) {
    params.report(error);
  }
}
