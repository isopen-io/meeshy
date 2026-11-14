/**
 * Le câblage de la position du Sang (#13937) : la base, l'horloge, la porte d'émission, et la
 * cadence d'alerte d'une paire — un `SET NX EX` sur le client Redis NATIF, sans le repli mémoire
 * de `CacheStore` (qui dirait « première alerte » à chaque instance). Sans Redis, ou en panne,
 * le geste LÈVE et l'alerte ne part pas. Le compteur d'évaluations par compte et par heure est un
 * `INCRBY` + `EXPIRE NX` sur le même client, strict lui aussi.
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
    countProximityEvaluations: async (key, by, ttlSeconds) => {
      const client = getCacheStore().getNativeClient();
      if (!client) throw new Error('blood proximity evaluation counter unavailable');
      const replies = await client.multi().incrby(key, by).expire(key, ttlSeconds, 'NX').exec();
      const [error, total] = replies?.[0] ?? [new Error('blood proximity evaluation counter: no reply'), null];
      if (error || typeof total !== 'number') throw error ?? new Error('blood proximity evaluation counter: unexpected reply');
      return total;
    },
  };
}
