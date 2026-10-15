import type { FastifyInstance } from 'fastify';
import { enhancedLogger } from '../../utils/logger-enhanced';

/**
 * L'AGRÉGAT QUOTIDIEN des événements anonymes par empreinte d'adresse (#10483).
 *
 * La triche par rotation de jetons est ACCEPTÉE pour l'instant (règle du
 * porteur 2026-10-13) : le bannissement d'une adresse se fait à la main. Pour
 * le permettre sans garder d'IP, chaque événement anonyme admis incrémente
 * `ZINCRBY reach:anon:address-activity:<AAAA-MM-JJ> <n> <empreinte>`, clé qui
 * vit 7 jours. Un administrateur lit le haut du classement
 * (`ZREVRANGE … 0 20 WITHSCORES`, ou {@link readAddressActivity}) et rapproche
 * une empreinte d'une adresse relevée ailleurs (journal du proxy) en calculant
 * `addressFingerprintOf({ ip })` pour CE jour.
 *
 * Sans Redis (dev, tests) : une mémoire bornée par instance.
 */

export const ADDRESS_ACTIVITY_TTL_SECONDS = 7 * 24 * 60 * 60;
const MEMORY_DAYS_MAX = 8;
const MEMORY_FINGERPRINTS_MAX = 50_000;

const log = enhancedLogger.child({ module: 'addressActivity' });

export const addressActivityDay = (now: number = Date.now()): string => new Date(now).toISOString().slice(0, 10);

export const addressActivityKey = (day: string): string => `reach:anon:address-activity:${day}`;

export type AddressActivity = { readonly fingerprint: string; readonly events: number };

type ActivityRedis = {
  zincrby(key: string, increment: number, member: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  zrevrange(key: string, start: number, stop: number, withScores: 'WITHSCORES'): Promise<string[]>;
};

const memory = new WeakMap<object, Map<string, Map<string, number>>>();

const memoryDay = (owner: object, day: string): Map<string, number> => {
  const days = memory.get(owner) ?? new Map<string, Map<string, number>>();
  memory.set(owner, days);
  const existing = days.get(day);
  if (existing) return existing;
  const created = new Map<string, number>();
  days.set(day, created);
  if (days.size > MEMORY_DAYS_MAX) days.delete(days.keys().next().value as string);
  return created;
};

const redisOf = (fastify: FastifyInstance): ActivityRedis | null =>
  ((fastify as { redis?: ActivityRedis | null }).redis ?? null);

export async function recordAddressActivity(
  fastify: FastifyInstance,
  params: { readonly fingerprint: string; readonly events: number; readonly now?: number },
): Promise<void> {
  if (params.events <= 0) return;
  const day = addressActivityDay(params.now);
  const redis = redisOf(fastify);
  if (redis) {
    try {
      const key = addressActivityKey(day);
      await redis.zincrby(key, params.events, params.fingerprint);
      await redis.expire(key, ADDRESS_ACTIVITY_TTL_SECONDS);
      return;
    } catch (error) {
      log.warn('address activity: Redis unavailable, memory fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const counts = memoryDay(fastify, day);
  if (!counts.has(params.fingerprint) && counts.size >= MEMORY_FINGERPRINTS_MAX) return;
  counts.set(params.fingerprint, (counts.get(params.fingerprint) ?? 0) + params.events);
}

/** Les empreintes les plus actives d'un jour, de la plus active à la moins active. */
export async function readAddressActivity(
  fastify: FastifyInstance,
  params: { readonly day: string; readonly limit?: number },
): Promise<readonly AddressActivity[]> {
  const limit = Math.max(1, Math.min(500, params.limit ?? 50));
  const redis = redisOf(fastify);
  if (redis) {
    const flat = await redis.zrevrange(addressActivityKey(params.day), 0, limit - 1, 'WITHSCORES');
    return flat.flatMap((value, index) =>
      index % 2 === 0 ? [{ fingerprint: value, events: Number(flat[index + 1]) }] : []);
  }
  const counts = memory.get(fastify)?.get(params.day) ?? new Map<string, number>();
  return [...counts]
    .map(([fingerprint, events]) => ({ fingerprint, events }))
    .sort((a, b) => b.events - a.events)
    .slice(0, limit);
}
