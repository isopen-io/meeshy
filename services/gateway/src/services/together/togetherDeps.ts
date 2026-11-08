/**
 * Le câblage du relais de la séance « ensemble » (#17012) : le cache partagé du processus,
 * l'horloge, la porte d'émission. Les routes qui changent un lien ou un blocage rejugent la
 * séance de la paire par {@link rejudgeTogetherAfter} : un échec n'arrête jamais le geste,
 * il est seulement journalisé (sans charge).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../CacheStore';
import { claimPairThroughCache, type PairClaim } from './togetherStore';
import { rejudgeTogetherBetween, type TogetherIo, type TogetherRelayDeps } from './togetherRelay';

/** Le cache du processus, résolu à l'usage : brancher une socket n'ouvre aucune connexion. */
const lazyCache: TogetherRelayDeps['cache'] = {
  get: (key) => getCacheStore().get(key),
  set: (key, value, ttlSeconds) => getCacheStore().set(key, value, ttlSeconds),
  del: (key) => getCacheStore().del(key),
};

/**
 * La prise de l'index de paire : `SET … EX … GET` du client Redis natif — atomique, et rend la
 * valeur remplacée. `CacheStore` bascule en mémoire locale quand Redis échoue, ce qui ne vaut
 * rien entre instances : ici l'écriture ÉCHOUE (l'invitation rend « indisponible »). Sans
 * Redis configuré (développement, test), un seul processus : la prise passe par le cache.
 */
const claimPair: PairClaim = async (pairKey, sessionId, ttlSeconds) => {
  const client = getCacheStore().getNativeClient();
  if (client) return client.set(pairKey, sessionId, 'EX', ttlSeconds, 'GET');
  if (process.env.REDIS_URL) throw new Error('together: Redis attendu pour la prise de paire');
  return claimPairThroughCache(lazyCache)(pairKey, sessionId, ttlSeconds);
};

export function togetherRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: TogetherIo | undefined }): TogetherRelayDeps {
  return { prisma: params.prisma, cache: lazyCache, io: params.io, now: () => Date.now(), claimPair };
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
