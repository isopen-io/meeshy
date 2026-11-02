import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * LE MOTEUR LIBSIGNAL EST-IL PRÊT SUR CE NAVIGATEUR ? (#14592) — fail-closed.
 *
 * Le web n'offre le chiffrement de bout en bout à la création que lorsque le
 * moteur (WASM) s'est réellement chargé ici : avant, pendant, ou après un échec,
 * le choix reste grisé (« bientôt sur le web ») et Serveur part. Ce module est
 * léger (aucune dépendance de la pile) : l'écran de création l'importe, et ne
 * charge le moteur par `import()` qu'à la demande.
 */
export type EngineReadiness = 'unknown' | 'loading' | 'ready' | 'failed';

type BrowserEnvironment = {
  readonly WebAssembly?: { readonly instantiate?: unknown } | undefined;
  readonly indexedDB?: unknown;
  readonly crypto?: { readonly subtle?: unknown } | undefined;
  readonly isSecureContext?: boolean | undefined;
};

/** WebAssembly (libsignal), IndexedDB (coffre), WebCrypto (clé de scellement non extractible) et un contexte sûr. */
export function browserCanRunEndToEnd(environment: BrowserEnvironment = globalThis as BrowserEnvironment): boolean {
  return (
    typeof environment.WebAssembly?.instantiate === 'function' &&
    environment.indexedDB !== undefined &&
    environment.indexedDB !== null &&
    environment.crypto?.subtle !== undefined &&
    environment.isSecureContext !== false
  );
}

export function createEngineReadiness(params: { readonly capable: () => boolean; readonly load: () => Promise<unknown> }) {
  const store: StoreApi<EngineReadiness> = createStore<EngineReadiness>(() => 'unknown');
  let pending: Promise<void> | null = null;
  const ensure = (): Promise<void> => {
    pending ??= (async () => {
      if (!params.capable()) {
        store.setState('failed', true);
        return;
      }
      store.setState('loading', true);
      try {
        await params.load();
        store.setState('ready', true);
      } catch {
        store.setState('failed', true);
      }
    })();
    return pending;
  };
  return { store, ensure };
}

/** L'instance de l'application : le moteur se charge par `import()`, jamais dans la première peinture. */
export const engineReadiness = createEngineReadiness({
  capable: () => browserCanRunEndToEnd(),
  load: async () => (await import('./libsignal-engine')).loadLibsignalEngine(),
});
