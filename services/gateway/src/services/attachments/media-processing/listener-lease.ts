/**
 * Une seule passerelle prévient (#11264, audit S9 point 7).
 *
 * Chaque instance de la passerelle reçoit TOUS les événements de la file
 * (`QueueEvents`) : sans arbitrage, N instances émettraient N fois à chaque
 * lecteur et écriraient N fois dans la file hors ligne. Un bail Redis court
 * (`SET NX EX`, par le `CacheStore` de la passerelle) élit l'instance qui
 * prévient ; si elle tombe, le bail expire
 * et une autre le prend. Une erreur Redis rend « pas le bail » : mieux vaut
 * qu'un rendu se voie au prochain chargement que N fois.
 */
export const MEDIA_LISTENER_LEASE_KEY = 'meeshy:media-ready-listener:lease';
export const MEDIA_LISTENER_LEASE_TTL_SECONDS = 30;
const RECHECK_MS = 5000;

export type LeaseClient = {
  setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  expire(key: string, seconds: number): Promise<boolean>;
};

export function listenerLease(
  client: () => Promise<LeaseClient>,
  instanceId: string,
  now: () => number = Date.now
): { holds(): Promise<boolean> } {
  let last: { readonly at: number; readonly held: boolean } | null = null;

  const refresh = async (): Promise<boolean> => {
    try {
      const redis = await client();
      if (await redis.setnx(MEDIA_LISTENER_LEASE_KEY, instanceId, MEDIA_LISTENER_LEASE_TTL_SECONDS)) return true;
      if ((await redis.get(MEDIA_LISTENER_LEASE_KEY)) !== instanceId) return false;
      await redis.expire(MEDIA_LISTENER_LEASE_KEY, MEDIA_LISTENER_LEASE_TTL_SECONDS);
      return true;
    } catch {
      return false;
    }
  };

  return {
    holds: async () => {
      if (last && now() - last.at < RECHECK_MS) return last.held;
      const held = await refresh();
      last = { at: now(), held };
      return held;
    },
  };
}
