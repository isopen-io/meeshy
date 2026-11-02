/**
 * Quota journalier d'envoi (#11266) — un compteur d'octets par auteur et par
 * jour UTC, `uploads:bytes:{userId}:{jour}`, sur Redis pour que toutes les
 * instances de la passerelle le partagent (passerelle sans état, #9232).
 *
 * Le quota est une garde d'ABUS, pas une condition d'envoi : Redis absent ou
 * en panne, le compte se replie en mémoire (par processus, borné) et aucun
 * envoi n'est refusé faute de réponse. L'auteur d'un invité est son
 * `Participant.id`, jamais son jeton de session.
 *
 * Vérifié AVANT le premier octet (TUS `onUploadCreate`, multipart avant
 * écriture), compté APRÈS un envoi réussi : un envoi abandonné n'entame rien.
 * Deux envois parallèles peuvent dépasser le quota d'au plus un fichier, que
 * le plafond par fichier borne déjà.
 */
import type { DailyUploadQuotas, UploaderRole } from '@meeshy/shared/types/upload-limits';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'UploadQuota' });

const DAY_MS = 24 * 60 * 60 * 1000;
const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;
const MEMORY_COUNTERS_MAX = 50_000;

export type UploadQuotaRedis = {
  get(key: string): Promise<string | null>;
  incrby(key: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
};

export type UploadQuotaVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly usedBytes: number; readonly quotaBytes: number; readonly retryAfterSeconds: number };

export type UploadQuota = {
  check(params: { readonly userId: string; readonly role: UploaderRole; readonly incomingBytes: number; readonly now?: number }): Promise<UploadQuotaVerdict>;
  record(params: { readonly userId: string; readonly bytes: number; readonly now?: number }): Promise<void>;
};

/**
 * Pour qui écrit les octets LUI-MÊME, sans attendre qu'un client les envoie
 * (copie de média sœur, #14305) : `check` puis `record` laisse toutes les
 * requêtes concurrentes lire le même compteur. `reserve` compte d'abord, d'un
 * seul `INCRBY`, et retire aussitôt ce qui dépasse ; `release` rend ce qu'une
 * écriture n'a finalement pas pris.
 */
export type ReservingUploadQuota = UploadQuota & {
  reserve(params: { readonly userId: string; readonly role: UploaderRole; readonly bytes: number; readonly now?: number }): Promise<UploadQuotaVerdict>;
  release(params: { readonly userId: string; readonly bytes: number; readonly now?: number }): Promise<void>;
};

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function uploadQuotaKey(userId: string, now: number = Date.now()): string {
  return `uploads:bytes:${userId}:${utcDay(now)}`;
}

function secondsUntilNextUtcDay(now: number): number {
  return Math.max(1, Math.ceil((DAY_MS - (now % DAY_MS)) / 1000));
}

function memoryCounters() {
  const counters = new Map<string, number>();
  return {
    read: (key: string): number => counters.get(key) ?? 0,
    add: (key: string, bytes: number): void => {
      if (!counters.has(key) && counters.size >= MEMORY_COUNTERS_MAX) {
        counters.delete(counters.keys().next().value as string);
      }
      counters.set(key, (counters.get(key) ?? 0) + bytes);
    },
  };
}

function warnFallback(operation: string, error: unknown): void {
  logger.warn(`upload quota: Redis ${operation} failed, memory fallback`, {
    error: error instanceof Error ? error.message : String(error),
  });
}

export function createUploadQuota(params: { readonly redis: UploadQuotaRedis | null; readonly quotas: DailyUploadQuotas }): ReservingUploadQuota {
  const { redis, quotas } = params;
  const memory = memoryCounters();

  const usedBytes = async (key: string): Promise<number> => {
    if (!redis) return memory.read(key);
    try {
      const raw = await redis.get(key);
      return Math.max(Number(raw ?? 0) || 0, memory.read(key));
    } catch (error) {
      warnFallback('read', error);
      return memory.read(key);
    }
  };

  const add = async (key: string, bytes: number): Promise<number> => {
    if (!redis) {
      memory.add(key, bytes);
      return memory.read(key);
    }
    try {
      const total = await redis.incrby(key, bytes);
      await redis.expire(key, COUNTER_TTL_SECONDS);
      return total;
    } catch (error) {
      warnFallback('reserve', error);
      memory.add(key, bytes);
      return memory.read(key);
    }
  };

  return {
    async reserve({ userId, role, bytes, now = Date.now() }) {
      const amount = Math.max(0, bytes);
      const quotaBytes = quotas[role];
      const key = uploadQuotaKey(userId, now);
      const total = await add(key, amount);
      if (total <= quotaBytes) return { allowed: true };
      await add(key, -amount);
      return { allowed: false, usedBytes: total - amount, quotaBytes, retryAfterSeconds: secondsUntilNextUtcDay(now) };
    },

    async release({ userId, bytes, now = Date.now() }) {
      if (!(bytes > 0)) return;
      await add(uploadQuotaKey(userId, now), -bytes);
    },

    async check({ userId, role, incomingBytes, now = Date.now() }) {
      const quotaBytes = quotas[role];
      const used = await usedBytes(uploadQuotaKey(userId, now));
      if (used + Math.max(0, incomingBytes) <= quotaBytes) return { allowed: true };
      return { allowed: false, usedBytes: used, quotaBytes, retryAfterSeconds: secondsUntilNextUtcDay(now) };
    },

    async record({ userId, bytes, now = Date.now() }) {
      if (!(bytes > 0)) return;
      const key = uploadQuotaKey(userId, now);
      if (!redis) {
        memory.add(key, bytes);
        return;
      }
      try {
        await redis.incrby(key, bytes);
        await redis.expire(key, COUNTER_TTL_SECONDS);
      } catch (error) {
        warnFallback('write', error);
        memory.add(key, bytes);
      }
    },
  };
}
