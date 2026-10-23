/**
 * LA COQUE INSCRIT LE WORKER DES MÉDIAS RÉCENTS, ET LUI SEUL (#11326).
 *
 * La coque embarque son bundle et n'a pas le worker du web (`check-shell-dist`
 * le garde). Celui-ci ne précache rien : il resert l'audio et la vidéo que la
 * page a rangés ENTIERS (`lib/media/recent-media-store.ts`), plages comprises,
 * hors ligne compris. Android (`https://localhost`) l'accepte — Capacitor
 * route les requêtes du worker par son serveur local
 * (`resolveServiceWorkerRequests`, vrai par défaut) ; la WebView iOS
 * (`capacitor://`) n'a pas de service worker : l'inscription y est refusée,
 * silencieusement, et la lecture reste celle du réseau.
 */
export const SHELL_RECENT_MEDIA_WORKER_URL = '/sw-recent-media.js';

type WorkerContainer = { register(url: string, options?: { readonly scope?: string }): Promise<unknown> };

export async function registerShellRecentMediaWorker(
  container: WorkerContainer | undefined = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
): Promise<'registered' | 'unavailable' | 'refused'> {
  if (container === undefined) return 'unavailable';
  try {
    await container.register(SHELL_RECENT_MEDIA_WORKER_URL, { scope: '/' });
    return 'registered';
  } catch {
    return 'refused';
  }
}
