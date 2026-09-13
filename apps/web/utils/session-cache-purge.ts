/**
 * Purge du stockage navigateur PROPRE AU COMPTE, à la déconnexion (#3743).
 *
 * `AuthManager.clearAllSessions()` ne vidait que le localStorage, les
 * cookies et le sessionStorage. Trois autres magasins survivaient à la
 * déconnexion, tous partagés à l'échelle de l'ORIGINE (donc entre comptes
 * sur le même navigateur) :
 *
 * - le Cache Storage du service worker — repli HORS LIGNE des réponses
 *   `/api/*`, sans en-tête `Vary` (voir `public/sw.js` § 2, qui documente ce
 *   trou depuis son écriture : « Fermer ce trou demande une purge du cache
 *   API à la déconnexion — autre lot. Ne pas supposer que c'est déjà fait ») ;
 * - le cache React Query persistant en IndexedDB
 *   (`lib/react-query/persister.ts`), qui réhydrate le prochain compte avec
 *   les conversations et messages du précédent avant que le réseau ne
 *   réponde ;
 * - les clés de chiffrement E2EE en IndexedDB
 *   (`indexeddb-key-storage-adapter.ts`) — `clearAll()` y existe déjà,
 *   commenté « for logout », mais n'était appelé nulle part.
 *
 * Ce module est le site unique qui les purge tous, sur
 * `AuthManager.registerOnClear` — le même point d'extension que
 * `stores/auth-store.ts` utilise déjà pour réinitialiser son état réactif.
 */
import type { QueryClient } from '@tanstack/react-query';
import { authManager } from '@/services/auth-manager.service';
import { indexedDBKeyStorageAdapter } from '@/lib/encryption/adapters/indexeddb-key-storage-adapter';
import { indexedDbPersister } from '@/lib/react-query/persister';
import { purgeOwnedCacheStorage } from '@/utils/service-worker';
import { logger } from '@/utils/logger';

/**
 * Vide, au mieux effort et en parallèle, le Cache Storage, le cache React
 * Query persistant et les clés de chiffrement E2EE.
 *
 * Chaque purge est indépendante : l'échec de l'une (IndexedDB indisponible
 * en navigation privée, par exemple) ne doit ni bloquer ni faire échouer les
 * autres — la déconnexion elle-même (`clearAllSessions`) ne doit jamais être
 * retardée ni interrompue par un magasin best-effort.
 */
export async function purgeAccountScopedBrowserStorage(): Promise<void> {
  const results = await Promise.allSettled([
    purgeOwnedCacheStorage(),
    indexedDBKeyStorageAdapter.clearAll(),
    indexedDbPersister.removeClient(),
  ]);

  results.forEach((result) => {
    if (result.status === 'rejected') {
      logger.warn('[session-cache-purge]', 'one purge step failed', { error: result.reason });
    }
  });
}

let registered = false;
let courant: QueryClient | null = null;

/**
 * Câble la purge ci-dessus, plus le vidage du cache React Query EN MÉMOIRE
 * (`queryClient.clear()`), sur `AuthManager.registerOnClear`.
 *
 * Appelé une fois depuis `QueryProvider` — seul détenteur du `QueryClient`.
 * Idempotent : un second appel (remount) n'enregistre pas un second callback,
 * ce qui aurait purgé deux fois sans risque de correction mais aurait rendu
 * `registerOnClear` en O(n) callbacks au fil des remounts.
 *
 * **Le verrou garde le CALLBACK, jamais le client (#6158).** `QueryProvider`
 * crée son client par `useState(() => createQueryClient())` : un démontage
 * suivi d'un remontage en fabrique un NEUF. Un verrou qui capture le premier
 * client dans la fermeture viderait alors un client MORT pendant que le client
 * VIVANT garde en mémoire les conversations du compte précédent — le défaut
 * exact que ce module existe pour fermer, réintroduit par sa propre garde
 * d'idempotence.
 *
 * La référence est donc remise à CHAQUE appel et le callback lit la dernière —
 * `registered` ne gouverne que l'enregistrement. Dimension 1 : une purge de
 * confidentialité se conçoit fail-closed, et « ce remontage n'arrive pas en
 * production » n'est pas une garde, c'est un pari sur le montage d'un arbre
 * React.
 */
export function registerAccountScopedCachePurge(queryClient: QueryClient): void {
  courant = queryClient;
  if (registered) return;
  registered = true;

  authManager.registerOnClear(() => {
    courant?.clear();
    void purgeAccountScopedBrowserStorage();
  });
}
