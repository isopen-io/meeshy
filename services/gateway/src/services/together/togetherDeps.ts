/**
 * Le câblage du relais de la séance « ensemble » (#17012) : le cache partagé du processus,
 * l'horloge, la porte d'émission. Les routes qui changent un lien ou un blocage rejugent la
 * séance de la paire par {@link rejudgeTogetherAfter} : un échec n'arrête jamais le geste,
 * il est seulement journalisé (sans charge).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../CacheStore';
import type { Redis } from 'ioredis';
import { claimPairThroughCache, extendPairThroughCache, type PairClaim, type PairExtend } from './togetherStore';
import { rejudgeTogetherBetween, type TogetherIo, type TogetherRelayDeps } from './togetherRelay';

/** Le cache du processus, résolu à l'usage : brancher une socket n'ouvre aucune connexion. */
const lazyCache: TogetherRelayDeps['cache'] = {
  get: (key) => getCacheStore().get(key),
  set: (key, value, ttlSeconds) => getCacheStore().set(key, value, ttlSeconds),
  del: (key) => getCacheStore().del(key),
};

/** Le client Redis natif PRÊT ; `null` sans Redis configuré ; LÈVE quand Redis est configuré mais mort. */
const readyClient = (): Redis | null => {
  const client = getCacheStore().getNativeClient();
  if (client) {
    if (client.status !== 'ready') throw new Error('together: Redis non prêt');
    return client;
  }
  if (process.env.REDIS_URL) throw new Error('together: Redis attendu pour l\'index de paire');
  return null;
};

/**
 * La prise de l'index de paire : `SET … EX … GET` du client Redis natif — atomique, et rend la
 * valeur remplacée. `CacheStore` bascule en mémoire locale quand Redis échoue (et garde un
 * client mort après abandon), ce qui ne vaut rien entre instances : ici l'écriture ÉCHOUE
 * (l'invitation rend « indisponible »). Sans Redis configuré (développement, test), un seul
 * processus : la prise passe par le cache.
 */
const claimPair: PairClaim = async (pairKey, sessionId, ttlSeconds) => {
  const client = readyClient();
  return client ? client.set(pairKey, sessionId, 'EX', ttlSeconds, 'GET') : claimPairThroughCache(lazyCache)(pairKey, sessionId, ttlSeconds);
};

const EXTEND_IF_MINE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) end return 0`;

/** Prolonge l'index de paire seulement s'il désigne encore la séance : un script Lua, donc atomique. */
const extendPair: PairExtend = async (pairKey, sessionId, ttlSeconds) => {
  const client = readyClient();
  if (!client) return extendPairThroughCache(lazyCache)(pairKey, sessionId, ttlSeconds);
  await client.eval(EXTEND_IF_MINE, 1, pairKey, sessionId, String(ttlSeconds));
};

export function togetherRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: TogetherIo | undefined }): TogetherRelayDeps {
  return { prisma: params.prisma, cache: lazyCache, io: params.io, now: () => Date.now(), claimPair, extendPair };
}

export async function rejudgeTogetherAfter(
  params: { readonly prisma: PrismaClient; readonly io: TogetherIo | undefined; readonly report: (error: unknown) => void },
  pair: { readonly userA: string; readonly userB: string },
): Promise<void> {
  try {
    await rejudgeTogetherBetween(togetherRelayDepsOf(params), pair);
  } catch (error) {
    params.report(error);
  }
}
