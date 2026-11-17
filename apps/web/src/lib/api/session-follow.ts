import type { AccountCacheShelf } from './account-caches';
import { heldAccountOf, heldSessionKey, SESSION_STORAGE_KEY, type SessionState, type SessionStoreApi } from './session';

/**
 * LA SESSION SUIT L'APPAREIL (#19132, audit adversarial a posteriori).
 *
 * Les onglets d'un navigateur partagent UNE entrée, `meeshy.session`, et
 * chacun tient sa session en mémoire. Aucun ne suivait l'autre : Ada
 * reconnectée dans l'onglet A laissait l'onglet B sur l'ancien jeton, dont le
 * premier 401 effaçait l'entrée récente et les publications du compte ; Bob
 * choisi dans A laissait B parler au nom d'Ada. Chaque onglet suit désormais ce
 * que l'appareil tient — l'événement `storage`, que le navigateur émet dans
 * les AUTRES onglets à chaque écriture, et `pageshow`, pour un onglet revenu
 * du cache de navigation qui a pu en manquer.
 *
 * Ce que suivre veut dire :
 *  - l'appareil tient un COMPTE : l'onglet le tient (même compte, nouveau
 *    jeton : rien ne bouge à l'écran ; un autre compte : la bascule de
 *    l'appareil) — et l'identité anonyme lue sous ce même compte reste (#8816) ;
 *  - l'appareil ne tient plus de compte (déconnexion, mise en veille, 401
 *    ailleurs) : l'onglet quitte le sien ;
 *  - l'entrée d'un INVITÉ ne déplace personne, et l'invité d'un lien ne suit
 *    rien : sa session ne vaut que pour SA conversation.
 *
 * Chargé après la première peinture (`realtime.ts`) : rien n'en pèse sur elle.
 */

function followedSession(current: SessionState, device: SessionState): SessionState {
  if (device.status === 'guest' || (current.status === 'guest' && current.account === undefined)) return current;
  if (device.status !== 'authenticated') return heldAccountOf(current) === null ? current : { status: 'anonymous' };
  return current.status === 'guest' && current.account?.user.id === device.user.id ? { ...current, account: device } : device;
}

/**
 * L'ÉTAGÈRE EST L'AFFAIRE DE L'ONGLET QUI A AGI. Quitter un compte fait
 * ranger son cache (`query-client.ts`) ; l'onglet qui a basculé l'a déjà
 * rangé, celui qui s'est déconnecté l'a effacé. L'onglet qui SUIT ne laisse
 * donc pas d'entrée que l'autre n'a pas laissée : rien d'un compte déconnecté
 * ne revient sur l'appareil par lui.
 */
export function followDeviceSession(store: SessionStoreApi, shelf: AccountCacheShelf): void {
  const current = store.getState().session;
  const next = followedSession(current, store.getState().deviceSession());
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  const leaving = current.status === 'authenticated' ? current.user.id : null;
  const shelvedElsewhere = leaving !== null && shelf.list().includes(leaving);
  store.setState({ session: next });
  if (leaving !== null && !shelvedElsewhere) shelf.forget(leaving);
}

type DeviceEvent = { readonly key?: string | null };

export type DeviceSessionTarget = {
  addEventListener(type: string, listener: (event: DeviceEvent) => void): void;
  removeEventListener(type: string, listener: (event: DeviceEvent) => void): void;
};

/** Suit l'appareil dès la pose — un changement survenu pendant le démarrage
 * n'a émis d'événement pour personne — puis à chaque écriture de l'entrée.
 * L'étagère est REÇUE, jamais importée : ce module reste hors de la première
 * peinture sans en détacher `account-caches.ts`. */
export function watchDeviceSession(
  store: SessionStoreApi,
  options: { readonly shelf: AccountCacheShelf; readonly target?: DeviceSessionTarget },
): () => void {
  const target = options.target ?? (typeof window === 'undefined' ? undefined : window);
  const follow = (event: DeviceEvent): void => {
    if (event.key === undefined || event.key === null || event.key === SESSION_STORAGE_KEY) followDeviceSession(store, options.shelf);
  };
  target?.addEventListener('storage', follow);
  target?.addEventListener('pageshow', follow);
  followDeviceSession(store, options.shelf);
  return () => {
    target?.removeEventListener('storage', follow);
    target?.removeEventListener('pageshow', follow);
  };
}

export type SessionEndNotes = { note(reason: string): void };

/**
 * UNE RÉVOCATION SE JUGE SUR LA SESSION QU'ELLE VISE (#9613, #19132). Le motif
 * de `auth:session-revoked` est noté avant la fin, pour que l'écran de
 * connexion l'explique — mais son module se charge à la demande, et pendant ce
 * temps l'onglet a pu reprendre la session que l'appareil tient : fermer
 * celle-là la ferait payer pour la session révoquée. Le motif n'est noté que si
 * la session révoquée est encore celle de l'appareil : sinon l'onglet SUIT
 * l'appareil, ne passe par aucun écran de connexion, et un motif gardé
 * s'afficherait à contretemps. Sans motif (jeton échu), la session finit
 * aussitôt ; un module qui ne se charge pas ne la retient jamais ouverte.
 */
export function endRevokedSessionWithReason(params: {
  readonly store: SessionStoreApi;
  readonly reason: string | undefined;
  readonly load: () => Promise<SessionEndNotes>;
  readonly end: (store: SessionStoreApi) => void;
}): Promise<void> {
  const { store, reason, load, end } = params;
  if (reason === undefined) {
    end(store);
    return Promise.resolve();
  }
  const refused = heldSessionKey(store.getState().session);
  const stillHeld = (): boolean => heldSessionKey(store.getState().session) === refused;
  return load()
    .then((notes) => {
      if (stillHeld() && store.getState().holdsDeviceSession()) notes.note(reason);
    })
    .catch(() => undefined)
    .then(() => {
      if (stillHeld()) end(store);
    });
}
