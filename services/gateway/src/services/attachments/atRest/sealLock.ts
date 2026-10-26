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

/** Le verrou d'un seul processus : le repli de la passerelle quand Redis ne répond pas. */
export const processSealLock: SealLock = async (filePath) => {
  if (held.has(filePath)) return 'busy';
  held.add(filePath);
  return { release: async () => { held.delete(filePath); } };
};

/**
 * Le verrou de la passerelle : Redis, partagé avec la migration et les autres
 * instances ; Redis absent ou injoignable, le verrou du processus — le
 * scellement continue plutôt que de laisser des pièces en clair sans limite
 * de durée. La migration, elle, n'a pas ce repli (verrou injoignable = occupé).
 */
export function resilientSealLock(redis: () => LockClient | null, onUnavailable: (error: unknown) => void): SealLock {
  return async (filePath) => {
    const client = redis();
    if (!client) return processSealLock(filePath);
    try {
      return await redisSealLock(client)(filePath);
    } catch (error) {
      onUnavailable(error);
      return processSealLock(filePath);
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
