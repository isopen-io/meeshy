/**
 * Le câblage du relais du partage temporaire de position (#14109, #16980) : le cache
 * partagé du processus, l'horloge, et la porte d'émission. Les routes qui changent un
 * lien ou un blocage rejouent la projection de la paire par
 * {@link refreshSharedLocationAfter} : un échec n'arrête jamais le geste, il est
 * seulement journalisé (sans charge).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../CacheStore';
import {
  captureSharedLocationAccess,
  refreshSharedLocationBetween,
  type SharedLocationIo,
  type SharedLocationPairAccess,
  type SharedLocationRelayDeps,
} from './sharedLocationRelay';

/** Le cache du processus, résolu à l'usage : brancher une socket n'ouvre aucune connexion. */
const lazyCache: SharedLocationRelayDeps['cache'] = {
  get: (key) => getCacheStore().get(key),
  set: (key, value, ttlSeconds) => getCacheStore().set(key, value, ttlSeconds),
  del: (key) => getCacheStore().del(key),
};

export function sharedLocationRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: SharedLocationIo | undefined }): SharedLocationRelayDeps {
  return { prisma: params.prisma, cache: lazyCache, io: params.io, now: () => Date.now() };
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
