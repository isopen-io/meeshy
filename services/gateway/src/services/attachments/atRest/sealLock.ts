/**
 * #13100 — le verrou d'un fichier d'origine pendant son scellement, partagé
 * par tous les processus qui scellent (passerelle, balayage, migration) :
 * `SET NX PX` sur Redis, relâché par compare-et-supprime. Un verrou orphelin
 * (processus tué) expire seul ; le balayage reprend alors la pièce.
 */
import { createHash, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { enhancedLogger } from '../../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'sealLock' });
import type { FileSealLock as SealLock } from './atRestFiles';

/** Redis configuré mais injoignable : ni « libre » ni « occupé » — l'appelant décide (fail-closed). */
export class SealLockUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('seal lock unavailable');
    this.name = 'SealLockUnavailableError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Le client Redis DU VERROU, distinct de celui de `CacheStore` (qui cesse de
 * se reconnecter après 3 tentatives) : il se reconnecte sans jamais
 * abandonner, à intervalle borné, pour que le scellement reprenne dès le
 * retour de Redis, sans redémarrer la passerelle. Aucune commande n'attend
 * une connexion absente (`enableOfflineQueue: false`).
 */
export function reconnectingLockClient(url: string): Redis {
  const client = new Redis(url, {
    retryStrategy: (times: number) => Math.min(times * 500, 5_000),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  // Une ligne par panne, pas par tentative : le passage en erreur, puis le retour.
  const state = { down: false };
  client.on('error', (error: Error) => {
    if (state.down) return;
    state.down = true;
    logger.error('client Redis du verrou de scellement injoignable : scellements différés au balayage', undefined, {
      code: 'SERVER_AT_REST_SEAL_LOCK_UNAVAILABLE',
      reason: error.name,
    });
  });
  client.on('ready', () => {
    if (state.down) logger.info('client Redis du verrou de scellement revenu');
    state.down = false;
  });
  return client;
}

export const SEAL_LOCK_TTL_MS = 10 * 60 * 1000;

const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

type LockClient = {
  set(key: string, value: string, px: 'PX', ttl: number, nx: 'NX'): Promise<string | null>;
  eval(script: string, keys: number, key: string, token: string): Promise<unknown>;
};

export const sealLockKey = (filePath: string): string =>
  `at-rest:seal-lock:${createHash('sha256').update(filePath, 'utf8').digest('hex').slice(0, 32)}`;

const held = new Set<string>();

/** Le verrou d'un seul processus : celui d'une passerelle SANS Redis configuré. */
export const processSealLock: SealLock = async (filePath) => {
  if (held.has(filePath)) return 'busy';
  held.add(filePath);
  return { release: async () => { held.delete(filePath); } };
};

/**
 * Le verrou de la passerelle, FAIL-CLOSED : Redis, partagé avec la migration
 * et les autres instances. Redis configuré mais injoignable LÈVE
 * `SealLockUnavailableError` — le scellement le tient pour occupé
 * (`acquireSealLock` : la pièce reste au balayage), une piste ne l'attend pas —
 * jamais un verrou local qu'une autre instance ne verrait pas. Le verrou du
 * processus ne sert que sans Redis configuré du tout : un seul processus scelle.
 */
export function gatewaySealLockOf(deps: {
  readonly redis: () => LockClient | null;
  readonly configured: () => boolean;
  readonly onUnavailable: (error: unknown) => void;
}): SealLock {
  return async (filePath) => {
    if (!deps.configured()) return processSealLock(filePath);
    const client = deps.redis();
    if (!client) {
      deps.onUnavailable(new Error('redis-client-absent'));
      throw new SealLockUnavailableError();
    }
    try {
      return await redisSealLock(client)(filePath);
    } catch (error) {
      deps.onUnavailable(error);
      throw new SealLockUnavailableError(error);
    }
  };
}

const deferral: { since: Date | null } = { since: null };

/** Depuis quand un verrou injoignable a laissé des pièces au balayage (le plus ancien instant), ou `null`. */
export const sealingDeferredSince = (): Date | null => deferral.since;
export function noteSealingDeferred(now: Date = new Date()): void {
  deferral.since = deferral.since ?? now;
}
/** Le balayage a rattrapé tout ce qui avait été différé jusqu'à `upTo`. */
export function clearSealingDeferred(upTo: Date): void {
  if (deferral.since && deferral.since <= upTo) deferral.since = null;
}

export function redisSealLock(client: LockClient, ttlMs: number = SEAL_LOCK_TTL_MS): SealLock {
  return async (filePath) => {
    const key = sealLockKey(filePath);
    const token = randomUUID();
    const acquired = await client.set(key, token, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') return 'busy';
    return { release: async () => { await client.eval(RELEASE, 1, key, token); } };
  };
}
