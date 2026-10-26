/**
 * #13100 — le verrou d'un fichier d'origine pendant son scellement, partagé
 * par tous les processus qui scellent (passerelle, balayage, migration) :
 * `SET NX PX` sur Redis, relâché par compare-et-supprime. Un verrou orphelin
 * (processus tué) expire seul ; le balayage reprend alors la pièce.
 */
import { createHash, randomUUID } from 'crypto';
import type { SealLock } from './sealAttachmentFiles';

export const SEAL_LOCK_TTL_MS = 10 * 60 * 1000;

const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

type LockClient = {
  set(key: string, value: string, px: 'PX', ttl: number, nx: 'NX'): Promise<string | null>;
  eval(script: string, keys: number, key: string, token: string): Promise<unknown>;
};

export const sealLockKey = (filePath: string): string =>
  `at-rest:seal-lock:${createHash('sha256').update(filePath, 'utf8').digest('hex').slice(0, 32)}`;

export function redisSealLock(client: LockClient, ttlMs: number = SEAL_LOCK_TTL_MS): SealLock {
  return async (filePath) => {
    const key = sealLockKey(filePath);
    const token = randomUUID();
    const acquired = await client.set(key, token, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') return 'busy';
    return { release: async () => { await client.eval(RELEASE, 1, key, token); } };
  };
}
