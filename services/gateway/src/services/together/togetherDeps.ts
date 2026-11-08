/**
 * Le câblage du relais de la séance « ensemble » (#17012) : le cache partagé du processus,
 * l'horloge, la porte d'émission. Les routes qui changent un lien ou un blocage rejugent la
 * séance de la paire par {@link rejudgeTogetherAfter} : un échec n'arrête jamais le geste,
 * il est seulement journalisé (sans charge).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../CacheStore';
import { rejudgeTogetherBetween, type TogetherIo, type TogetherRelayDeps } from './togetherRelay';

/** Le cache du processus, résolu à l'usage : brancher une socket n'ouvre aucune connexion. */
const lazyCache: TogetherRelayDeps['cache'] = {
  get: (key) => getCacheStore().get(key),
  set: (key, value, ttlSeconds) => getCacheStore().set(key, value, ttlSeconds),
  del: (key) => getCacheStore().del(key),
};

export function togetherRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: TogetherIo | undefined }): TogetherRelayDeps {
  return { prisma: params.prisma, cache: lazyCache, io: params.io, now: () => Date.now() };
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
