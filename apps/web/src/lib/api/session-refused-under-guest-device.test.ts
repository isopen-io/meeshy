import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createAccountCacheShelf } from './account-caches';
import { endRevokedSession, forgetAccountCaches, setDeviceFollower } from './account-end';
import { createSessionStore, type SessionStorage, type SessionUser } from './session';
import { followDeviceSession, watchDeviceSession } from './session-follow';

const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const ADA: SessionUser = { id: 'u-ada', username: 'ada' };

function fakeStorage(): SessionStorage {
  const raw = new Map<string, string>();
  return { getItem: (k) => raw.get(k) ?? null, setItem: (k, v) => void raw.set(k, v), removeItem: (k) => void raw.delete(k) };
}
type Listener = (event: { readonly key?: string | null }) => void;
function fakeWindow() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: (t: string, l: Listener) => void listeners.set(t, (listeners.get(t) ?? new Set()).add(l)),
    removeEventListener: (t: string, l: Listener) => void listeners.get(t)?.delete(l),
    dispatch: (t: string, e: { readonly key?: string | null } = {}) => listeners.get(t)?.forEach((l) => l(e)),
  };
}
const noReaderCaches = { keys: async () => [], delete: async () => true };
const GUEST = { participantId: null, nickname: 'visiteur', conversationId: 'c-9', link: 'lnk', mayWrite: true } as const;

describe('un compte refusé quitte l’onglet même quand l’appareil tient un invité (audit #19352, S2)', () => {
  beforeAll(() => setDeviceFollower(followDeviceSession));
  afterAll(() => setDeviceFollower(null));

  test('Ada se déconnecte dans A, un visiteur rejoint un lien en invité ; B revient du cache de navigation : son 401 doit le sortir du compte', () => {
    const storage = fakeStorage();
    const tabA = createSessionStore({ storage, now: () => NOW });
    tabA.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const tabB = createSessionStore({ storage, now: () => NOW });
    tabB.getState().restoreSession();
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    tabA.getState().clearSession();
    forgetAccountCaches({ userId: 'u-ada', storage, cacheStorage: noReaderCaches, indexedDb: null, publications: { clear: async () => undefined } });
    tabA.getState().adoptAnonymous({ sessionToken: 'anon-visiteur', guest: GUEST });

    windowB.dispatch('pageshow');
    const erased: string[] = [];
    endRevokedSession(tabB, { storage, cacheStorage: noReaderCaches, publications: { clear: async (id: string) => void erased.push(id) } });
    endRevokedSession(tabB, { storage, cacheStorage: noReaderCaches, publications: { clear: async (id: string) => void erased.push(id) } });

    expect(tabB.getState().session.status).toBe('anonymous');
  });
});
