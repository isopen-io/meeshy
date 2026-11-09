/**
 * Le câblage de la position du Sang (#13937) : la base, l'horloge, la porte d'émission, et la
 * cadence d'alerte d'une paire — un `SET NX EX` sur le client Redis NATIF, sans le repli mémoire
 * de `CacheStore` (qui dirait « première alerte » à chaque instance). Sans Redis, ou en panne,
 * le geste LÈVE et l'alerte ne part pas.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCacheStore } from '../CacheStore';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { bloodLocationEnabledFor } from './bloodLocationFlag';
import type { BloodLocationDeps } from './bloodLocationTypes';

export function bloodLocationDepsOf(params: {
  readonly prisma: PrismaClient;
  readonly io: ServerEmitIO | undefined;
  readonly report?: (error: unknown) => void;
}): BloodLocationDeps {
  return {
    prisma: params.prisma,
    io: params.io,
    now: () => Date.now(),
    enabledFor: (userId) => bloodLocationEnabledFor(userId),
    report: params.report,
    claimProximityCooldown: async (pairKey, ttlSeconds) => {
      const client = getCacheStore().getNativeClient();
      if (!client) throw new Error('blood proximity cooldown store unavailable');
      return (await client.set(pairKey, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
    },
  };
}
