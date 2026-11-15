import type { LibsignalBridge } from './libsignal-bridge';

/**
 * LE SEUL CHEMIN vers le pont libsignal depuis l'application (#17114) : un
 * `import()` différé, donc un chunk et un binaire WASM téléchargés à la
 * première opération chiffrée, jamais dans la première peinture
 * (`budgets.json › on_demand_chunks.libsignal_bridge`, `dynamic_only`). Une
 * seule instanciation par onglet ; un échec (réseau coupé au téléchargement)
 * n'est pas mémorisé, l'appel suivant retente.
 */
export type LibsignalBridgeImport = () => Promise<LibsignalBridge>;

const importBridge: LibsignalBridgeImport = () => import('./libsignal-bridge').then(({ openLibsignalBridge }) => openLibsignalBridge());

export const libsignalBridgeLoader = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  const settled = new Map<'bridge', Promise<T>>();
  return () => {
    const known = settled.get('bridge');
    if (known !== undefined) return known;
    const request = load().catch((error: unknown) => {
      settled.delete('bridge');
      throw error;
    });
    settled.set('bridge', request);
    return request;
  };
};

export const loadLibsignalBridge: LibsignalBridgeImport = libsignalBridgeLoader(importBridge);
