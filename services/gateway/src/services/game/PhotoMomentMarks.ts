/**
 * LES COMPTES « À ÉVALUER » (#10175, L19 — § 5.16.4) : les écritures du jeu y marquent un compte, le job des
 * étapes franchies app fermée les vide par lots. Un ENSEMBLE : un compte marqué cent fois s'évalue une fois.
 *
 * Sur Redis, `SADD` / `SPOP <n>` sur une seule clé — jamais `KEYS`, qui bloque le serveur à l'échelle. Sans
 * Redis (développement, panne), un ensemble en mémoire du processus : une marque perdue au redémarrage se
 * retrouve à la prochaine écriture du jeu, et la détection est idempotente.
 */

import type { Redis } from 'ioredis';
import { getCacheStore } from '../CacheStore';

export const PHOTO_MOMENT_MARKS_KEY = 'game:photo:to-evaluate';

export type PhotoMomentMarks = {
  mark(userId: string): Promise<void>;
  /** Retire et rend au plus `max` comptes marqués. */
  drain(max: number): Promise<string[]>;
};

export function memoryPhotoMomentMarks(): PhotoMomentMarks {
  const marked = new Set<string>();
  return {
    mark: async (userId) => void marked.add(userId),
    drain: async (max) => {
      const out = [...marked].slice(0, Math.max(0, max));
      for (const userId of out) marked.delete(userId);
      return out;
    },
  };
}

type SetClient = Pick<Redis, 'sadd' | 'spop'>;

export function redisPhotoMomentMarks(native: () => SetClient | null): PhotoMomentMarks {
  const fallback = memoryPhotoMomentMarks();
  return {
    mark: async (userId) => {
      const redis = native();
      if (redis === null) return fallback.mark(userId);
      await redis.sadd(PHOTO_MOMENT_MARKS_KEY, userId);
    },
    drain: async (max) => {
      const redis = native();
      const local = await fallback.drain(max);
      if (redis === null || max - local.length <= 0) return local;
      const popped = await redis.spop(PHOTO_MOMENT_MARKS_KEY, max - local.length);
      return [...local, ...(Array.isArray(popped) ? popped : [])];
    },
  };
}

let shared: PhotoMomentMarks | null = null;

/** L'ensemble du processus, sur le Redis du `CacheStore` quand il répond. */
export const getPhotoMomentMarks = (): PhotoMomentMarks => {
  shared ??= redisPhotoMomentMarks(() => getCacheStore().getNativeClient());
  return shared;
};
