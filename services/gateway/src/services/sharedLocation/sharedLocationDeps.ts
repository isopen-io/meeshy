/**
 * Le câblage du relais du partage temporaire de position (#14109, #16980) : le magasin
 * Redis strict du processus, l'horloge, et la porte d'émission. Les routes qui changent un
 * lien ou un blocage rejouent la projection de la paire par
 * {@link refreshSharedLocationAfter} : un échec n'arrête jamais le geste, il est
 * seulement journalisé (sans charge).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../CacheStore';
import { redisSharedLocationKv, UNAVAILABLE_SHARED_LOCATION_KV, type SharedLocationKv } from './sharedLocationKv';
import {
  captureSharedLocationAccess,
  endSharedLocationOfAccount,
  refreshSharedLocationBetween,
  type SharedLocationIo,
  type SharedLocationPairAccess,
  type SharedLocationRelayDeps,
} from './sharedLocationRelay';

/**
 * Le magasin STRICT du processus, résolu à l'usage : brancher une socket n'ouvre aucune
 * connexion. Sans client Redis, chaque opération échoue — jamais de repli mémoire, qui
 * dirait « arrêté » à un seul processus pendant qu'un autre continue de diffuser.
 */
const kv = (): SharedLocationKv => {
  const client = getCacheStore().getNativeClient();
  return client ? redisSharedLocationKv(client) : UNAVAILABLE_SHARED_LOCATION_KV;
};

const lazyCache: SharedLocationRelayDeps['cache'] = {
  get: (key) => kv().get(key),
  mget: (keys) => kv().mget(keys),
  set: (key, value, ttlSeconds) => kv().set(key, value, ttlSeconds),
  del: (key) => kv().del(key),
  expire: (key, ttlSeconds) => kv().expire(key, ttlSeconds),
  claim: (keys, args) => kv().claim(keys, args),
  setIfCurrent: (keys, args) => kv().setIfCurrent(keys, args),
  advance: (keys) => kv().advance(keys),
  retiring: (key) => kv().retiring(key),
  retired: (key, session) => kv().retired(key, session),
  markSeen: (key, members, ttlSeconds) => kv().markSeen(key, members, ttlSeconds),
  seenAmong: (key, members) => kv().seenAmong(key, members),
  unmarkSeen: (key, members) => kv().unmarkSeen(key, members),
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

/**
 * Un compte désactivé, supprimé ou purgé ne partage plus (#16987) : son partage s'arrête
 * et ceux qui le voyaient reçoivent la fin. Avec `forget` (la purge), ses clés sans durée
 * de vie partent aussi. À appeler APRÈS l'écriture du compte ; un échec n'arrête jamais le
 * geste, il est journalisé (le partage échoit de lui-même à son terme, au plus 8 h).
 */
export async function endSharedLocationAfter(params: RefreshParams, accountId: string, options: { readonly forget: boolean }): Promise<void> {
  try {
    const ack = await endSharedLocationOfAccount(sharedLocationRelayDepsOf(params), accountId, options);
    if (!ack.success) params.report(new Error(`shared location of ${accountId} not ended`));
  } catch (error) {
    params.report(error);
  }
}
