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
