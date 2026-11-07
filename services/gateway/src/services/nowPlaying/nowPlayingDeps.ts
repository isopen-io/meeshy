/**
 * Le câblage du relais de l'écoute (#13934, #16686) : le cache partagé du processus,
 * l'horloge, et la porte d'émission. Les routes qui changent un lien, un consentement
 * ou un blocage rejouent la projection de la paire par {@link refreshNowPlayingAfter} :
 * un échec n'arrête jamais le geste, il est seulement journalisé (sans charge).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../CacheStore';
import { refreshNowPlayingBetween, type NowPlayingIo, type NowPlayingRelayDeps } from './nowPlayingRelay';

export function nowPlayingRelayDepsOf(params: { readonly prisma: PrismaClient; readonly io: NowPlayingIo | undefined }): NowPlayingRelayDeps {
  return { prisma: params.prisma, cache: getCacheStore(), io: params.io, now: () => Date.now() };
}

export async function refreshNowPlayingAfter(
  params: { readonly prisma: PrismaClient; readonly io: NowPlayingIo | undefined; readonly report: (error: unknown) => void },
  pair: { readonly userA: string; readonly userB: string; readonly mode: 'raise' | 'cut' },
): Promise<void> {
  try {
    await refreshNowPlayingBetween(nowPlayingRelayDepsOf(params), pair);
  } catch (error) {
    params.report(error);
  }
}
