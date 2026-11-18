import { forgetCallJournal } from '../calls/call-network-journal-keys';
import { safeLocalStorage, type SafeStorage } from '../storage';

import { createAccountCacheShelf, PENDING_ACCOUNT_ENDS_KEY, purgeReaderCaches, type AccountCacheShelf, type CacheStorageLike } from './account-caches';
import { heldAccountOf, heldSessionKey, type SessionStoreApi } from './session';

/**
 * LA FIN D'UN COMPTE SUR L'APPAREIL — détachée de l'étagère
 * (`account-caches.ts`, que la première peinture porte pour le cache de
 * requêtes) : elle ne sert qu'au refus d'une session ou à la déconnexion, et se
 * charge à ce moment-là (`client.ts`). Audit #19352 : c'est ce qui paie, dans
 * le budget de la première peinture, les gardes de session ajoutées par ce lot.
 */
export type IndexedDbEraser = { readonly deleteDatabase: (name: string) => unknown };

/**
 * LES POINTS DE REPRISE DES ENVOIS DE MÉDIAS (#11311) — la base IndexedDB de
 * `tus-checkpoint.ts`, dont le nom est recopié ici plutôt qu'importé : le
 * client TUS se charge à la demande, et l'importer ferait payer un module de
 * plus avant le premier pixel. `account-query-cache.test.ts` lie les deux noms
 * (il efface `TUS_CHECKPOINT_DB_NAME`, importé du client). Un point de reprise
 * porte l'adresse d'une session ouverte par le compte : rien du compte
 * précédent ne survit à sa déconnexion (#104). Meilleur effort, silencieux.
 */
const TUS_CHECKPOINT_DB = 'meeshy-tus';

function forgetTusCheckpoints(factory: IndexedDbEraser | null): void {
  if (factory === null) return;
  try {
    factory.deleteDatabase(TUS_CHECKPOINT_DB);
  } catch {
    /* rien à effacer */
  }
}


/**
 * LA FIN D'UN COMPTE SUR L'APPAREIL (#8674) — déconnexion, session révoquée ou
 * expirée : son cache rangé part, son journal réseau d'appels (#8698) aussi,
 * les seaux du service worker et les points de reprise de ses envois de
 * médias (IndexedDB `meeshy-tus`, #11311) avec eux, et ses publications non
 * envoyées (médias et intention du studio, #13416) : une déconnexion explicite
 * vaut suppression par l'utilisateur — la règle « rien ne s'efface avant la
 * confirmation du serveur » ne vaut que pour le compte connecté.
 * Changer de compte n'appelle jamais ceci.
 */
export type PublicationsEraser = { readonly clear: (userId: string) => Promise<unknown> };

/* Chargé au geste : la fin d'un compte n'embarque pas le studio. */
const studioPublications: PublicationsEraser = {
  clear: (userId) => import('../stories/studio-outbox-records').then(({ eraseStudioOutbox }) => eraseStudioOutbox(userId)),
};

export function forgetAccountCaches({
  userId,
  storage,
  cacheStorage,
  indexedDb = typeof indexedDB === 'undefined' ? null : indexedDB,
  publications = studioPublications,
}: {
  readonly userId: string;
  readonly storage?: SafeStorage;
  readonly cacheStorage?: CacheStorageLike;
  readonly indexedDb?: IndexedDbEraser | null;
  readonly publications?: PublicationsEraser;
}): void {
  const local = storage ?? safeLocalStorage();
  createAccountCacheShelf(local).forget(userId);
  forgetCallJournal(local, userId);
  purgeReaderCaches(cacheStorage);
  forgetTusCheckpoints(indexedDb);
  try {
    void publications.clear(userId).catch(() => undefined);
  } catch {
    /* La déconnexion aboutit même si l'appareil refuse. */
  }
}

/**
 * LA FIN RESTÉE À FAIRE (audit #19352) — les comptes notés par le repli de
 * `client.ts` quand ce morceau n'a pas pu se charger : ce qu'ils laissent sur
 * l'appareil part maintenant, sauf pour le compte que l'appareil tient de
 * nouveau (il s'est reconnecté entre-temps).
 */
function takePendingAccountEnds(storage: SafeStorage): readonly string[] {
  try {
    const noted = storage.getItem(PENDING_ACCOUNT_ENDS_KEY);
    storage.removeItem(PENDING_ACCOUNT_ENDS_KEY);
    return noted === null ? [] : noted.split(' ').filter((userId) => userId !== '');
  } catch {
    return [];
  }
}

export function forgetPendingAccountEnds(store: SessionStoreApi, deps: Omit<Parameters<typeof forgetAccountCaches>[0], 'userId'> = {}): void {
  const storage = deps.storage ?? safeLocalStorage();
  const held = heldAccountOf(store.getState().deviceSession())?.user.id ?? null;
  takePendingAccountEnds(storage)
    .filter((userId) => userId !== held)
    .forEach((userId) => forgetAccountCaches({ ...deps, userId, storage }));
}

/**
 * QUI SUIT L'APPAREIL (#19132) — `session-follow.ts`, chargé avec le temps
 * réel après la première peinture, s'ENREGISTRE ici (motif `typing-emit.ts`) :
 * la première peinture n'en porte que ce port. Tant qu'il ne l'a pas fait, une
 * session refusée que l'appareil ne tient plus finit sans rien effacer de ce
 * que l'appareil tient (audit #19352, S2) — la pose du suivi relit l'appareil
 * et la fait converger.
 */
export type DeviceFollower = (store: SessionStoreApi, shelf: AccountCacheShelf) => void;

let deviceFollower: DeviceFollower | null = null;

export function setDeviceFollower(next: DeviceFollower | null): void {
  deviceFollower = next;
}

/**
 * LA SESSION COURANTE EST REFUSÉE (401 sur son jeton, `auth:session-revoked`
 * du socket) — elle finit, et ce que l'appareil gardait d'elle part avec.
 * L'ordre compte : `clearSession()` fait d'abord ranger le cache du compte
 * par `query-client.ts`, que l'oubli retire aussitôt.
 *
 * SAUF QUAND L'APPAREIL TIENT DÉJÀ UNE AUTRE SESSION (#19132) : un autre
 * onglet s'est reconnecté, a changé de compte ou a fini la sienne. Le refus ne
 * dit alors rien de ce que l'appareil tient — ni son entrée, ni ce que le
 * compte y a laissé (publications du studio, reprises d'envoi, seaux du
 * service worker) ne partent : cet onglet SUIT l'appareil.
 */
export function endRevokedSession(
  store: SessionStoreApi,
  deps: { readonly storage?: SafeStorage; readonly cacheStorage?: CacheStorageLike; readonly publications?: PublicationsEraser } = {},
): void {
  const state = store.getState();
  const current = state.session;
  /* Sous une identité anonyme TENUE par un compte (#8816), le 401 a refusé
     le jeton de l'INVITÉ : c'est lui qui finit, le compte reste. */
  if (current.status === 'guest' && current.account !== undefined) {
    state.dropAnonymous(current.guest.conversationId);
    return;
  }
  const follow = (): void => deviceFollower?.(store, createAccountCacheShelf(deps.storage ?? safeLocalStorage()));
  if (current.status === 'authenticated' && !state.holdsDeviceSession()) {
    follow();
    if (heldSessionKey(store.getState().session) !== heldSessionKey(current)) return;
  }
  /* L'onglet tient toujours la session refusée — l'appareil tient un invité,
     ou le suivi n'est pas encore posé (audit #19352, S2) : elle finit, sans
     effacer une entrée qu'il ne tient pas, et ce que le compte laisse sur
     l'appareil part si l'appareil ne le tient plus. Puis l'onglet suit le
     compte que l'appareil tient, s'il en tient un (N4). */
  const userId = current.status === 'authenticated' ? current.user.id : null;
  state.clearSession();
  if (userId !== null && heldAccountOf(state.deviceSession())?.user.id !== userId) forgetAccountCaches({ userId, ...deps });
  follow();
}
