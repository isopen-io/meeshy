/**
 * LES NOMS DE CACHE DU SERVICE WORKER, DÉCLARÉS UNE FOIS (#6936).
 *
 * Le Cache Storage vit à l'échelle de l'ORIGINE, pas du worker : `caches.keys()`
 * rend AUSSI ce qu'un autre script y a écrit. Toute purge de l'application doit
 * donc nommer ce qu'elle POSSÈDE, et rien d'autre — c'est la frontière de
 * propriété que le legacy documentait déjà (`LEGACY_CACHE_NAMESPACE`,
 * `apps/web/utils/service-worker.ts`).
 *
 * Trois lecteurs partagent ce module, plutôt que trois copies du littéral :
 *  - `vite.config.ts` (§ VitePWA `runtimeCaching`), qui CRÉE ces seaux ;
 *  - `lib/api/query-client.ts`, qui les purge au changement d'identité (D-6) ;
 *  - `lib/app-update/service-worker.ts`, qui les purge à la mise à jour.
 */

/** Les seaux d'exécution déclarés par `runtimeCaching` — ceux qui portent de la donnée de lecteur. */
export const SW_RUNTIME_CACHES = {
  /** Les réponses `/api/**` en NetworkFirst — 200 entrées, sept jours. */
  api: 'api',
  /** Les images en CacheFirst — 120 entrées, trente jours. */
  medias: 'medias',
} as const;

export const SW_RUNTIME_CACHE_NAMES: readonly string[] = Object.values(SW_RUNTIME_CACHES);

/**
 * LE NAMESPACE DU LEGACY, dont la v2 a HÉRITÉ la responsabilité (#6702) : son
 * worker ne s'exécutera plus jamais, donc plus rien d'autre n'effacera ce qu'il
 * a laissé. `public/sw-legacy-purge.js` le purge à l'activation ; ce littéral
 * est son JUMEAU côté page — un script classique chargé par `importScripts` ne
 * peut pas importer ce module.
 */
export const LEGACY_CACHE_NAMESPACE = 'meeshy-cache-';

/**
 * LE PRÉCACHE DE WORKBOX N'APPARTIENT PAS À CETTE PURGE, et c'est une décision
 * MESURÉE, pas un oubli.
 *
 * Son nom (`workbox-precache-v2-<origine>`) ne porte pas la version : le worker
 * EN ATTENTE y a déjà écrit les entrées de la version NEUVE à son installation,
 * et son activation supprime celles qui ne sont plus au manifeste
 * (`PrecacheController.activate`, workbox-precaching). Le détruire depuis la
 * page ferait donc partir la version neuve avec l'ancienne — et Workbox ne
 * RÉPARE un précache manquant que sous intégrité SRI
 * (`PrecacheStrategy._handleFetch`, « It's only "safe" to repair the cache if
 * we're using SRI ») : hors ligne serait cassé jusqu'à la prochaine
 * installation de worker, pour un gain nul.
 */
export const WORKBOX_PRECACHE_PREFIX = 'workbox-precache';

/**
 * Ce cache appartient-il à l'application — donc une purge de mise à jour ou de
 * changement d'identité doit-elle l'effacer ?
 */
export function isAppOwnedCache(name: string): boolean {
  return SW_RUNTIME_CACHE_NAMES.includes(name) || name.startsWith(LEGACY_CACHE_NAMESPACE);
}
