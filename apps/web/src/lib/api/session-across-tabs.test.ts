import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { ACCOUNT_CACHE_PREFIX, createAccountCacheShelf, endRevokedSession, forgetAccountCaches, setDeviceFollower } from './account-caches';
import { watchDeliveryReceiptCredential, type DeliveryReceiptCredential } from '../notifications/delivery-receipt-credential';

import { createAuthClient } from './auth';
import type { ApiResult, HttpRequest } from './http';
import { createAppQueryClient, type StorageLike } from './query-client';
import { createSessionStore, heldAccountOf, type SessionState, type SessionStorage, type SessionStoreApi, type SessionUser } from './session';
import { endRevokedSessionWithReason, followDeviceSession, watchDeviceSession } from './session-follow';

/**
 * DEUX ONGLETS, UN APPAREIL (#19132, audit adversarial a posteriori).
 *
 * Les onglets d'un même navigateur partagent `meeshy.session` et chacun tient
 * sa session en mémoire. L'invariant du lot — « un onglet ne remplace jamais
 * le jeton plus récent d'une autre session du même compte » — tenait pour
 * `persistHeld` ; ces témoins l'éprouvent sur les AUTRES écrivains de l'entrée
 * (la fin d'une session refusée, la révocation reçue par la socket) et sur la
 * racine : un onglet qui suit l'appareil au lieu de le contredire.
 */

const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const ADA: SessionUser = { id: 'u-ada', username: 'ada', displayName: 'Ada', systemLanguage: 'fr' };
const BOB: SessionUser = { id: 'u-bob', username: 'bob' };

function fakeStorage(): SessionStorage & StorageLike & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

const openTab = (storage: SessionStorage): SessionStoreApi => createSessionStore({ storage, now: () => NOW });

const reloaded = (storage: SessionStorage): SessionState => {
  const store = openTab(storage);
  store.getState().restoreSession();
  return store.getState().session;
};

/** Le jeton du compte tenu, ou l'état quand il n'y en a pas. */
const tokenOf = (session: SessionState): string => heldAccountOf(session)?.token ?? session.status;

/** Onglet B ouvert sur T1 ; Ada se reconnecte dans l'onglet A (T2). */
function staleTabThenFreshLogin(storage: SessionStorage) {
  const staleTab = openTab(storage);
  staleTab.getState().establish({ user: ADA, token: 'jwt-ancien', sessionToken: 'sess-ancienne', expiresIn: 3600 });
  const freshTab = openTab(storage);
  freshTab.getState().establish({ user: ADA, token: 'jwt-recent', sessionToken: 'sess-recente', expiresIn: 7200 });
  return { staleTab, freshTab };
}

const noReaderCaches = { keys: async () => [], delete: async () => true };

const busterOf = (userId: string | null): string => `test:3:https://gate.test:${userId ?? 'anonymous'}`;

/** Le client de requêtes de l'onglet — c'est lui qui RANGE le cache du compte qu'un onglet quitte. */
const queryClientOf = (storage: StorageLike, tab: SessionStoreApi) => {
  const session = tab.getState().session;
  return createAppQueryClient({ storage, buster: busterOf(session.status === 'authenticated' ? session.user.id : null), busterOf, session: tab });
};

const shelvedAccounts = (storage: ReturnType<typeof fakeStorage>): readonly string[] =>
  [...storage.raw.keys()].filter((key) => key.startsWith(ACCOUNT_CACHE_PREFIX));

type Listener = (event: { readonly key?: string | null }) => void;

/** La fenêtre d'un onglet, réduite à ce que le suivi écoute. */
function fakeWindow() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
    dispatch: (type: string, event: { readonly key?: string | null } = {}) => {
      listeners.get(type)?.forEach((listener) => listener(event));
    },
  };
}

const SESSION_CHANGED = { key: 'meeshy.session' } as const;

describe('W1 — le 401 de l’onglet resté sur l’ancien jeton ne ferme que sa propre session (#19132)', () => {
  /* Le temps réel enregistre le suivi au chargement (`realtime.ts`) : ces témoins le posent de même. */
  beforeAll(() => setDeviceFollower(followDeviceSession));
  afterAll(() => setDeviceFollower(null));

  test('un 401 (jeton ancien échu ou révoqué) dans l’onglet B n’efface pas la session RÉCENTE de l’onglet A', () => {
    const storage = fakeStorage();
    const { staleTab, freshTab } = staleTabThenFreshLogin(storage);

    endRevokedSession(staleTab, { storage, cacheStorage: noReaderCaches, publications: { clear: async () => undefined } });

    expect(tokenOf(freshTab.getState().session)).toBe('jwt-recent');
    expect(tokenOf(reloaded(storage))).toBe('jwt-recent');
  });

  test('… et la boîte d’envoi du studio du compte, que l’onglet A utilise, n’est pas effacée', () => {
    const storage = fakeStorage();
    const { staleTab } = staleTabThenFreshLogin(storage);
    const erased: string[] = [];

    endRevokedSession(staleTab, {
      storage,
      cacheStorage: noReaderCaches,
      publications: { clear: async (userId: string) => void erased.push(userId) },
    });

    expect(erased).toEqual([]);
  });

  test('l’onglet B reprend la session que l’appareil tient : il reste dans le compte, son cache avec lui', () => {
    const storage = fakeStorage();
    const { staleTab } = staleTabThenFreshLogin(storage);
    const client = queryClientOf(storage, staleTab);
    client.setQueryData(['conversations'], [{ id: 'c-1', title: 'liste d’Ada' }]);

    endRevokedSession(staleTab, { storage, cacheStorage: noReaderCaches });

    expect(staleTab.getState().session.status).toBe('authenticated');
    expect(tokenOf(staleTab.getState().session)).toBe('jwt-recent');
    expect(client.getQueryData(['conversations'])).toEqual([{ id: 'c-1', title: 'liste d’Ada' }]);
  });

  test('la session que l’appareil tient encore finit partout, et le compte part avec elle', () => {
    const storage = fakeStorage();
    const tab = openTab(storage);
    tab.getState().establish({ user: ADA, token: 'jwt-seul', sessionToken: 'sess-seule', expiresIn: 3600 });
    const erased: string[] = [];

    endRevokedSession(tab, { storage, cacheStorage: noReaderCaches, publications: { clear: async (userId: string) => void erased.push(userId) } });

    expect(tab.getState().session.status).toBe('anonymous');
    expect(reloaded(storage).status).toBe('anonymous');
    expect(erased).toEqual(['u-ada']);
  });

  test('la session ÉCHUE que l’appareil tient encore finit partout elle aussi, et le compte part avec elle', () => {
    const storage = fakeStorage();
    const clock = { now: NOW };
    const tab = createSessionStore({ storage, now: () => clock.now });
    tab.getState().establish({ user: ADA, token: 'jwt-seul', sessionToken: 'sess-seule', expiresIn: 3600 });
    clock.now = NOW + 3_600_001;
    const erased: string[] = [];

    endRevokedSession(tab, { storage, cacheStorage: noReaderCaches, publications: { clear: async (userId: string) => void erased.push(userId) } });

    expect(tab.getState().session.status).toBe('anonymous');
    expect(storage.raw.has('meeshy.session')).toBe(false);
    expect(erased).toEqual(['u-ada']);
  });

  test('l’onglet B, dont l’onglet A a déconnecté le compte, ne laisse pas le cache de ce compte sur l’étagère', () => {
    const storage = fakeStorage();
    const tabA = openTab(storage);
    tabA.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const tabB = openTab(storage);
    tabB.getState().restoreSession();
    const clientB = queryClientOf(storage, tabB);
    clientB.setQueryData(['conversations'], [{ id: 'c-1', title: 'secret d’Ada' }]);
    tabA.getState().clearSession();
    forgetAccountCaches({ userId: 'u-ada', storage, cacheStorage: noReaderCaches, indexedDb: null, publications: { clear: async () => undefined } });

    endRevokedSession(tabB, { storage, cacheStorage: noReaderCaches });

    expect(tabB.getState().session.status).toBe('anonymous');
    expect(shelvedAccounts(storage)).toEqual([]);
    expect([...storage.raw.values()].join('\n')).not.toContain('secret d’Ada');
  });
});

describe('W1 — avant que le temps réel n’ait posé le suivi (#19132)', () => {
  test('la session refusée que l’appareil ne tient plus attend, sans rien effacer ; la pose du suivi la fait converger', () => {
    const storage = fakeStorage();
    const { staleTab } = staleTabThenFreshLogin(storage);
    const erased: string[] = [];

    endRevokedSession(staleTab, { storage, cacheStorage: noReaderCaches, publications: { clear: async (userId: string) => void erased.push(userId) } });

    expect(erased).toEqual([]);
    expect(tokenOf(reloaded(storage))).toBe('jwt-recent');
    expect(tokenOf(staleTab.getState().session)).toBe('jwt-ancien');

    watchDeviceSession(staleTab, { target: fakeWindow(), shelf: createAccountCacheShelf(storage) });

    expect(tokenOf(staleTab.getState().session)).toBe('jwt-recent');
  });
});

describe('W1, la racine — chaque onglet suit la session que l’appareil tient (#19132)', () => {
  test('Ada se reconnecte dans l’onglet A : l’onglet B passe au jeton récent sans quitter le compte, son cache avec lui', () => {
    const storage = fakeStorage();
    const tabB = openTab(storage);
    tabB.getState().establish({ user: ADA, token: 'jwt-ancien', sessionToken: 'sess-ancienne', expiresIn: 3600 });
    const clientB = queryClientOf(storage, tabB);
    clientB.setQueryData(['conversations'], [{ id: 'c-1', title: 'liste d’Ada' }]);
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    openTab(storage).getState().establish({ user: ADA, token: 'jwt-recent', sessionToken: 'sess-recente', expiresIn: 7200 });
    windowB.dispatch('storage', SESSION_CHANGED);

    expect(tokenOf(tabB.getState().session)).toBe('jwt-recent');
    expect(clientB.getQueryData(['conversations'])).toEqual([{ id: 'c-1', title: 'liste d’Ada' }]);
  });

  test('une langue changée dans l’onglet A arrive dans l’onglet B', () => {
    const storage = fakeStorage();
    const tabA = openTab(storage);
    tabA.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const tabB = openTab(storage);
    tabB.getState().restoreSession();
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    tabA.getState().updateUser({ systemLanguage: 'en' });
    windowB.dispatch('storage', SESSION_CHANGED);

    const session = tabB.getState().session;
    expect(session.status === 'authenticated' ? session.user.systemLanguage : undefined).toBe('en');
  });

  test('Ada se déconnecte dans l’onglet A : l’onglet B quitte le compte et ne remet pas son cache sur l’étagère', () => {
    const storage = fakeStorage();
    const tabA = openTab(storage);
    tabA.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const tabB = openTab(storage);
    tabB.getState().restoreSession();
    const clientB = queryClientOf(storage, tabB);
    clientB.setQueryData(['conversations'], [{ id: 'c-1', title: 'secret d’Ada' }]);
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    tabA.getState().clearSession();
    forgetAccountCaches({ userId: 'u-ada', storage, cacheStorage: noReaderCaches, indexedDb: null, publications: { clear: async () => undefined } });
    windowB.dispatch('storage', SESSION_CHANGED);

    expect(tabB.getState().session.status).toBe('anonymous');
    expect(shelvedAccounts(storage)).toEqual([]);
    expect([...storage.raw.values()].join('\n')).not.toContain('secret d’Ada');
  });

  test('l’onglet A passe à Bob : l’onglet B suit Bob, et le cache d’Ada rangé par l’onglet A reste rangé', () => {
    const storage = fakeStorage();
    const tabA = openTab(storage);
    tabA.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const clientA = queryClientOf(storage, tabA);
    clientA.setQueryData(['conversations'], [{ id: 'c-1', title: 'liste d’Ada' }]);
    const tabB = openTab(storage);
    tabB.getState().restoreSession();
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    tabA.getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });
    windowB.dispatch('storage', SESSION_CHANGED);

    expect(tokenOf(tabB.getState().session)).toBe('jwt-bob');
    expect(shelvedAccounts(storage)).toEqual([`${ACCOUNT_CACHE_PREFIX}u-ada`]);
  });

  test('l’onglet B qui lit une conversation en anonyme garde son identité anonyme quand le compte change de jeton ailleurs', () => {
    const storage = fakeStorage();
    const tabB = openTab(storage);
    tabB.getState().establish({ user: ADA, token: 'jwt-ancien', sessionToken: 'sess-ancienne', expiresIn: 3600 });
    tabB.getState().adoptAnonymous({
      sessionToken: 'anon-1',
      guest: { participantId: 'p-1', nickname: 'Masque', conversationId: 'c-1', link: 'lien-1', mayWrite: true },
    });
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    openTab(storage).getState().establish({ user: ADA, token: 'jwt-recent', sessionToken: 'sess-recente', expiresIn: 7200 });
    windowB.dispatch('storage', SESSION_CHANGED);

    const session = tabB.getState().session;
    expect(session.status).toBe('guest');
    expect(session.status === 'guest' ? session.sessionToken : undefined).toBe('anon-1');
    expect(tokenOf(session)).toBe('jwt-recent');
  });

  test('l’invité d’un lien ne suit pas l’appareil : un compte ouvert ailleurs ne lui retire pas sa conversation', () => {
    const storage = fakeStorage();
    const tabB = openTab(storage);
    tabB.getState().establishGuest({
      sessionToken: 'anon-1',
      guest: { participantId: 'p-1', nickname: 'Invité', conversationId: 'c-1', link: 'lien-1', mayWrite: true },
    });
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    openTab(storage).getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    windowB.dispatch('storage', SESSION_CHANGED);

    const session = tabB.getState().session;
    expect(session.status === 'guest' ? session.sessionToken : session.status).toBe('anon-1');
  });

  test('une entrée d’invité posée ailleurs ne déconnecte pas l’onglet qui tient le compte', () => {
    const storage = fakeStorage();
    const tabB = openTab(storage);
    tabB.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    openTab(storage).getState().establishGuest({
      sessionToken: 'anon-1',
      guest: { participantId: 'p-1', nickname: 'Invité', conversationId: 'c-1', link: 'lien-1', mayWrite: true },
    });
    windowB.dispatch('storage', SESSION_CHANGED);

    expect(tokenOf(tabB.getState().session)).toBe('jwt-ada');
  });

  test('revenu du cache de navigation (pageshow), l’onglet relit l’appareil : il a pu manquer un changement', () => {
    const storage = fakeStorage();
    const tabB = openTab(storage);
    tabB.getState().establish({ user: ADA, token: 'jwt-ancien', sessionToken: 'sess-ancienne', expiresIn: 3600 });
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    openTab(storage).getState().establish({ user: ADA, token: 'jwt-recent', sessionToken: 'sess-recente', expiresIn: 7200 });
    windowB.dispatch('pageshow');

    expect(tokenOf(tabB.getState().session)).toBe('jwt-recent');
  });

  test('une écriture d’une autre clé ne touche pas la session de l’onglet', () => {
    const storage = fakeStorage();
    const tabB = openTab(storage);
    tabB.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const held = tabB.getState().session;
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    storage.setItem('meeshy.session', 'pas du JSON');
    windowB.dispatch('storage', { key: 'meeshy.draft.u_u-ada.c-1' });

    expect(tabB.getState().session).toBe(held);
  });

  test('le désabonnement rendu arrête le suivi', () => {
    const storage = fakeStorage();
    const tabB = openTab(storage);
    tabB.getState().establish({ user: ADA, token: 'jwt-ancien', sessionToken: 'sess-ancienne', expiresIn: 3600 });
    const windowB = fakeWindow();
    const stop = watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    stop();
    openTab(storage).getState().establish({ user: ADA, token: 'jwt-recent', sessionToken: 'sess-recente', expiresIn: 7200 });
    windowB.dispatch('storage', SESSION_CHANGED);

    expect(tokenOf(tabB.getState().session)).toBe('jwt-ancien');
  });

  test('posé, le suivi relit aussitôt l’appareil : un changement survenu pendant le démarrage n’est pas perdu', () => {
    const storage = fakeStorage();
    const tabB = openTab(storage);
    tabB.getState().establish({ user: ADA, token: 'jwt-ancien', sessionToken: 'sess-ancienne', expiresIn: 3600 });
    openTab(storage).getState().establish({ user: ADA, token: 'jwt-recent', sessionToken: 'sess-recente', expiresIn: 7200 });

    watchDeviceSession(tabB, { target: fakeWindow(), shelf: createAccountCacheShelf(storage) });

    expect(tokenOf(tabB.getState().session)).toBe('jwt-recent');
  });
});

describe('W1 — la révocation reçue par la socket se juge sur la session qu’elle vise (#19132)', () => {
  test('la session reprise ailleurs pendant le chargement du motif n’est pas fermée, et aucun motif n’est noté', async () => {
    const storage = fakeStorage();
    const tabB = openTab(storage);
    tabB.getState().establish({ user: ADA, token: 'jwt-ancien', sessionToken: 'sess-ancienne', expiresIn: 3600 });
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });
    const noted: string[] = [];
    const ended: SessionStoreApi[] = [];

    const done = endRevokedSessionWithReason({
      store: tabB,
      reason: 'user_revoke',
      load: async () => {
        openTab(storage).getState().establish({ user: ADA, token: 'jwt-recent', sessionToken: 'sess-recente', expiresIn: 7200 });
        windowB.dispatch('storage', SESSION_CHANGED);
        return { note: (reason: string) => void noted.push(reason) };
      },
      end: (store) => void ended.push(store),
    });
    await done;

    expect(tokenOf(tabB.getState().session)).toBe('jwt-recent');
    expect(ended).toEqual([]);
    expect(noted).toEqual([]);
  });

  test('la session toujours tenue est fermée, son motif noté d’abord', async () => {
    const tab = openTab(fakeStorage());
    tab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const order: string[] = [];

    await endRevokedSessionWithReason({
      store: tab,
      reason: 'user_revoke',
      load: async () => ({ note: (reason: string) => void order.push(`noté:${reason}`) }),
      end: () => void order.push('fermée'),
    });

    expect(order).toEqual(['noté:user_revoke', 'fermée']);
  });

  test('sans motif (jeton échu), la session finit aussitôt, sans rien charger', () => {
    const tab = openTab(fakeStorage());
    tab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const ended: SessionStoreApi[] = [];

    void endRevokedSessionWithReason({
      store: tab,
      reason: undefined,
      load: () => Promise.reject(new Error('rien ne se charge')),
      end: (store) => void ended.push(store),
    });

    expect(ended).toEqual([tab]);
  });

  test('un module de motif qui ne se charge pas ne retient jamais la session ouverte', async () => {
    const tab = openTab(fakeStorage());
    tab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const ended: SessionStoreApi[] = [];

    await endRevokedSessionWithReason({
      store: tab,
      reason: 'admin_revoke',
      load: () => Promise.reject(new Error('hors ligne')),
      end: (store) => void ended.push(store),
    });

    expect(ended).toEqual([tab]);
  });
});

/**
 * LE SUIVI EST BRANCHÉ. `realtime.ts` n'est importé par aucun témoin (ses
 * abonnements de module toucheraient les singletons de toute la suite) : on
 * lit sa source, motif `served-profile-session.test.ts`.
 */
describe('W1 — le suivi de l’appareil est branché dans l’application (#19132)', () => {
  const source = readFileSync(new URL('./realtime.ts', import.meta.url), 'utf8');

  test('realtime.ts pose le suivi sur la session de l’application, et l’enregistre pour les sessions refusées, en instructions de premier niveau', () => {
    const lines = source.split('\n');
    expect(lines).toContain('watchDeviceSession(sessionStore, { shelf: createAccountCacheShelf(safeLocalStorage()) });');
    expect(lines).toContain('setDeviceFollower(followDeviceSession);');
  });

  test('la révocation reçue par la socket est jugée sur la session qu’elle vise, jamais fermée après coup sans regarder', () => {
    expect(source).toContain('void endRevokedSessionWithReason({');
    expect(source).not.toContain('.finally(() => endRevokedSession(sessionStore))');
  });
});

/**
 * SE DÉCONNECTER, C'EST DÉCONNECTER LE COMPTE DE L'APPAREIL (W2). Dans l'onglet
 * resté sur l'ancienne session, la déconnexion fermait T1 côté serveur puis
 * purgeait l'entrée qui portait T2 : l'onglet A restait connecté en mémoire,
 * et T2 restait ouverte côté serveur sans que rien sur l'appareil ne la
 * tienne. Le témoin d'attaque de l'audit exigeait que T2 survive au
 * rechargement ; le correctif du constat la ferme AUSSI, côté serveur, et son
 * entrée part : rien de ce compte ne reste ouvert, ni ici ni là-bas.
 */
describe('W2 — se déconnecter dans l’onglet resté sur l’ancienne session déconnecte le compte de l’appareil (#19132)', () => {
  function recordingTransport() {
    const sent: Array<Readonly<Record<string, string>> | undefined> = [];
    return {
      sent,
      transport: {
        request: async <T>(request: HttpRequest): Promise<ApiResult<T>> => {
          sent.push(request.headers);
          return { ok: true, status: 200, data: { message: 'ok' } as T };
        },
      },
    };
  }

  test('la session ancienne ET la session récente du compte sont fermées côté serveur, et aucune ne reste sur l’appareil', async () => {
    const storage = fakeStorage();
    const { staleTab } = staleTabThenFreshLogin(storage);
    const { sent, transport } = recordingTransport();

    await createAuthClient({ transport, store: staleTab }).logout();

    expect(sent).toEqual([
      { Authorization: 'Bearer jwt-ancien', 'X-Session-Token': 'sess-ancienne' },
      { Authorization: 'Bearer jwt-recent', 'X-Session-Token': 'sess-recente' },
    ]);
    expect(reloaded(storage).status).toBe('anonymous');
  });

  test('l’onglet A, qui tenait la session récente, quitte le compte avec l’appareil', async () => {
    const storage = fakeStorage();
    const { staleTab, freshTab } = staleTabThenFreshLogin(storage);
    const windowA = fakeWindow();
    watchDeviceSession(freshTab, { target: windowA, shelf: createAccountCacheShelf(storage) });

    await createAuthClient({ transport: recordingTransport().transport, store: staleTab }).logout();
    windowA.dispatch('storage', SESSION_CHANGED);

    expect(freshTab.getState().session.status).toBe('anonymous');
  });

  test('un AUTRE compte ouvert ailleurs n’est ni fermé ni effacé : on ne se déconnecte que du compte qu’on voit', async () => {
    const storage = fakeStorage();
    const adaTab = openTab(storage);
    adaTab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    openTab(storage).getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });
    const { sent, transport } = recordingTransport();

    await createAuthClient({ transport, store: adaTab }).logout();

    expect(sent).toEqual([{ Authorization: 'Bearer jwt-ada', 'X-Session-Token': 'sess-ada' }]);
    expect(tokenOf(reloaded(storage))).toBe('jwt-bob');
  });
});

/**
 * LE CRÉDENTIAL DU SERVICE WORKER EST CELUI DE L'APPAREIL (W5). L'entrée
 * IndexedDB `meeshy-push` est UNE pour l'origine ; chaque onglet la
 * réécrivait depuis SA session : l'onglet resté sur T1 y remettait T1 à la
 * moindre édition de profil (et `null` à son 401), et les accusés de remise du
 * worker partaient avec un jeton révoqué, ou plus du tout.
 */
describe('W5 — le crédential du service worker est celui que l’appareil tient (#19132)', () => {
  function sharedCredential() {
    const shared: { value: DeliveryReceiptCredential | null } = { value: null };
    return { shared, write: async (read: () => DeliveryReceiptCredential) => void (shared.value = read()) };
  }

  test('l’onglet au jeton ancien qui édite son profil ne réécrit pas son jeton par-dessus le récent', () => {
    const storage = fakeStorage();
    const { staleTab, freshTab } = staleTabThenFreshLogin(storage);
    const { shared, write } = sharedCredential();
    watchDeliveryReceiptCredential({ sessionStore: staleTab, write });
    watchDeliveryReceiptCredential({ sessionStore: freshTab, write });

    staleTab.getState().updateUser({ systemLanguage: 'en' });

    expect(shared.value?.credential).toEqual({ kind: 'registered', token: 'jwt-recent' });
  });

  test('le 401 de l’onglet au jeton ancien ne retire pas le crédential de l’onglet récent', () => {
    const storage = fakeStorage();
    const { staleTab, freshTab } = staleTabThenFreshLogin(storage);
    const { shared, write } = sharedCredential();
    watchDeliveryReceiptCredential({ sessionStore: freshTab, write });
    watchDeliveryReceiptCredential({ sessionStore: staleTab, write });
    freshTab.getState().updateUser({ displayName: 'Ada L.' });

    endRevokedSession(staleTab, { storage, cacheStorage: noReaderCaches, publications: { clear: async () => undefined } });

    expect(shared.value?.credential).toEqual({ kind: 'registered', token: 'jwt-recent' });
  });

  test('il est relu au moment où il s’écrit : une écriture retardée porte la session que l’appareil tient alors', () => {
    const storage = fakeStorage();
    const tab = openTab(storage);
    tab.getState().establish({ user: ADA, token: 'jwt-ancien', sessionToken: 'sess-ancienne', expiresIn: 3600 });
    const pending: Array<() => DeliveryReceiptCredential> = [];
    watchDeliveryReceiptCredential({ sessionStore: tab, write: async (read) => void pending.push(read) });

    openTab(storage).getState().establish({ user: ADA, token: 'jwt-recent', sessionToken: 'sess-recente', expiresIn: 7200 });

    expect(pending[0]?.().credential).toEqual({ kind: 'registered', token: 'jwt-recent' });
  });

  test('l’appareil déconnecté ne laisse aucun crédential au worker, même à l’onglet qui ne l’a pas encore suivi', () => {
    const storage = fakeStorage();
    const tabA = openTab(storage);
    tabA.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const tabB = openTab(storage);
    tabB.getState().restoreSession();
    const { shared, write } = sharedCredential();
    watchDeliveryReceiptCredential({ sessionStore: tabA, write });
    watchDeliveryReceiptCredential({ sessionStore: tabB, write });

    tabA.getState().clearSession();
    tabB.getState().updateUser({ displayName: 'Ada L.' });

    expect(shared.value?.credential).toBeNull();
  });
});
