/**
 * #13100 — le verrou d'un fichier d'origine pendant son scellement, partagé
 * par tous les processus qui scellent (passerelle, balayage, migration) :
 * `SET NX PX` sur Redis, relâché par compare-et-supprime. Un verrou orphelin
 * (processus tué) expire seul ; le balayage reprend alors la pièce.
 */
import { createHash, randomUUID } from 'crypto';
import type { FileSealLock as SealLock } from './atRestFiles';

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
 * et les autres instances. Redis configuré mais injoignable vaut « occupé » —
 * signalé, la pièce reste en clair et le balayage la reprendra — jamais un
 * verrou local qu'une autre instance ne verrait pas. Le verrou du processus
 * ne sert que sans Redis configuré du tout : un seul processus scelle.
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
      return 'busy';
    }
    try {
      return await redisSealLock(client)(filePath);
    } catch (error) {
      deps.onUnavailable(error);
      return 'busy';
    }
  };
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
