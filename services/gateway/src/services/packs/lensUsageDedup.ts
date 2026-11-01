/**
 * LE DÉDOUBLONNAGE DE L'USAGE D'UNE LENS — strict, sans repli (#11327, B3).
 *
 * `RedisCacheStore` retombe en SILENCE sur une `Map` mémoire PAR PROCESSUS
 * quand Redis est absent ou injoignable. C'est juste pour un cache ; c'est
 * faux pour un dédoublonnage partagé : chaque instance de passerelle y tient
 * sa propre liste des comptes vus, et une seule personne compte pour autant
 * d'appareils que la passerelle a de processus — le seuil k (20) se franchit
 * avec une poignée de comptes.
 *
 * Ce dédoublonnage parle donc au client Redis NATIF, et à lui seul : client
 * absent ou connexion pas prête ⇒ il LÈVE, et `LensPartners.recordUsage`
 * rend `counted: false` sans rien écrire. Toute erreur de Redis remonte telle
 * quelle — aucun `catch` ici.
 */
import type { CacheStore } from '../CacheStore';
import type { LensUsageDedup } from './LensPartners';

export class LensUsageDedupUnavailableError extends Error {
  constructor(status: string) {
    super(`lens usage dedup requires a ready Redis connection (status: ${status})`);
    this.name = 'LensUsageDedupUnavailableError';
  }
}

export function lensUsageDedupFrom(store: Pick<CacheStore, 'getNativeClient'>): LensUsageDedup {
  const ready = () => {
    const redis = store.getNativeClient();
    if (redis === null) throw new LensUsageDedupUnavailableError('absent');
    if (redis.status !== 'ready') throw new LensUsageDedupUnavailableError(redis.status);
    return redis;
  };
  return {
    setnx: async (key, value, ttlSeconds) => {
      const redis = ready();
      const result = ttlSeconds === undefined ? await redis.set(key, value, 'NX') : await redis.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    },
    get: async (key) => ready().get(key),
  };
}
