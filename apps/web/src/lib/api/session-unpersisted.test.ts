import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createAccountCacheShelf, endRevokedSession, setDeviceFollower } from './account-caches';
import { createSessionStore, type SessionStorage, type SessionUser } from './session';
import { followDeviceSession, watchDeviceSession } from './session-follow';

const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const ADA: SessionUser = { id: 'u-ada', username: 'ada' };

/** Un stockage plein : l'écriture de l'entrée de session lève (QuotaExceededError). */
function fullStorage(): SessionStorage {
  const raw = new Map<string, string>();
  return {
    getItem: (k) => raw.get(k) ?? null,
    setItem: (k, v) => {
      if (k === 'meeshy.session') throw new Error('QuotaExceededError');
      raw.set(k, v);
    },
    removeItem: (k) => void raw.delete(k),
  };
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

describe('une session que l’appareil n’a pas pu écrire tient pour l’onglet (audit #19352, Q1)', () => {
  beforeAll(() => setDeviceFollower(followDeviceSession));
  afterAll(() => setDeviceFollower(null));

  test('l’onglet connecté dont l’entrée n’a pas pu s’écrire reste connecté au retour du cache de navigation', () => {
    const storage = fullStorage();
    const tab = createSessionStore({ storage, now: () => NOW });
    tab.getState().establish({ user: ADA, token: 'jwt', sessionToken: 'sess', expiresIn: 3600 });
    const win = fakeWindow();
    watchDeviceSession(tab, { target: win, shelf: createAccountCacheShelf(storage) });

    win.dispatch('pageshow');

    expect(tab.getState().session.status).toBe('authenticated');
  });

  test('… et quand sa session est vraiment refusée, ce que le compte laisse sur l’appareil part', () => {
    const storage = fullStorage();
    const tab = createSessionStore({ storage, now: () => NOW });
    tab.getState().establish({ user: ADA, token: 'jwt', sessionToken: 'sess', expiresIn: 3600 });
    const erased: string[] = [];

    endRevokedSession(tab, { storage, cacheStorage: noReaderCaches, publications: { clear: async (id: string) => void erased.push(id) } });

    expect(tab.getState().session.status).toBe('anonymous');
    expect(erased).toEqual(['u-ada']);
  });
});
