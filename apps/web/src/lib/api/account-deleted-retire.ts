import { pendingRetirements, retireDeletedAccountLater, type MarkStorage, type RetireDeps } from './account-deleted';
import { heldAccountOf, sessionStore, type SessionStoreApi } from './session';

/**
 * Le compte nommé quitte l'appareil. Si c'est le compte TENU (effectif, ou
 * derrière l'identité anonyme qu'il lit, #8816), sa session finit d'abord ;
 * un autre compte ouvert entre-temps reste ouvert.
 */
export function endDeletedAccount({
  accountId,
  store,
  retire,
}: {
  readonly accountId: string;
  readonly store: SessionStoreApi;
  readonly retire: (accountId: string) => void;
}): void {
  if (heldAccountOf(store.getState().session)?.user.id === accountId) store.getState().clearSession();
  retire(accountId);
}

/** Le geste de l'application : le coffre réel, chargé au signal (le socle n'embarque ni le coffre ni le carnet). */
export async function retireDeletedAccount(accountId: string): Promise<void> {
  const { accountVault } = await import('./device-accounts');
  endDeletedAccount({ accountId, store: sessionStore, retire: (id) => accountVault.forget(id) });
}

const browserMarks = (): MarkStorage | null => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

/** Au démarrage : rejoue les retraits notés qu'un chargement raté a laissés. */
export async function replayPendingRetirements(deps: RetireDeps = {}): Promise<void> {
  const storage = deps.storage === undefined ? browserMarks() : deps.storage;
  for (const accountId of pendingRetirements(storage)) await retireDeletedAccountLater(accountId, { ...deps, storage });
}

function browserKeys(): readonly string[] {
  try {
    const storage = globalThis.localStorage;
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null);
  } catch {
    return [];
  }
}

/**
 * APRÈS LA PREMIÈRE PEINTURE (`main.tsx`, audit #10237) : les retraits notés
 * qu'un chargement raté a laissés se rejouent, puis les carnets des comptes
 * que l'appareil ne connaît plus partent (`sweepOrphanNotebooks`). Le carnet
 * ne se charge que si le navigateur sait lister ses bases.
 */
export async function tidyDeviceAfterBoot(): Promise<void> {
  await replayPendingRetirements();
  const factory = typeof indexedDB === 'undefined' ? undefined : indexedDB;
  if (factory === undefined || typeof factory.databases !== 'function') return;
  const { sweepOrphanNotebooks } = await import('../game-photo/notebook-legacy');
  await sweepOrphanNotebooks({
    factory,
    storage: { keys: browserKeys, getItem: (key) => globalThis.localStorage.getItem(key) },
    current: heldAccountOf(sessionStore.getState().session)?.user.id ?? null,
  });
}
