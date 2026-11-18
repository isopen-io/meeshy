import { describe, expect, test } from 'bun:test';

import { createAccountCacheShelf } from './account-caches';
import { endRevokedSession, forgetPendingAccountEnds } from './account-end';
import { endRefusedSession } from './client';
import { createSessionStore, heldAccountOf, type SessionStorage, type SessionUser } from './session';
import { followDeviceSession } from './session-follow';

/**
 * LA FIN D'UNE SESSION REFUSÉE VISE LA SESSION REFUSÉE (audit #19352) — la
 * fin d'un 401 se charge à la demande ; si l'onglet suit entre-temps
 * l'appareil passé à Bob, ni le morceau chargé ni son repli ne ferment Bob,
 * et rien de ce qu'il laisse sur l'appareil n'est effacé.
 */
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const ADA: SessionUser = { id: 'u-ada', username: 'ada' };
const BOB: SessionUser = { id: 'u-bob', username: 'bob' };

function fakeStorage(): SessionStorage & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return { raw, getItem: (k) => raw.get(k) ?? null, setItem: (k, v) => void raw.set(k, v), removeItem: (k) => void raw.delete(k) };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const quietDevice = (storage: SessionStorage, erased: string[]) => ({
  storage,
  cacheStorage: { keys: async () => [], delete: async () => true },
  indexedDb: null,
  publications: { clear: async (id: string) => void erased.push(id) },
});

function setup() {
  const storage = fakeStorage();
  const tab = createSessionStore({ storage, now: () => NOW });
  tab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
  return { storage, tab };
}

function deviceSwitchesToBobAndTabFollows(storage: SessionStorage, tab: ReturnType<typeof createSessionStore>) {
  createSessionStore({ storage, now: () => NOW }).getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });
  followDeviceSession(tab, createAccountCacheShelf(storage));
}

describe('la fin chargée à la demande vise la session refusée, pas celle que l’onglet tient au chargement', () => {
  test('le morceau se charge APRÈS que l’onglet a suivi Bob : Bob reste connecté, rien de lui n’est effacé', async () => {
    const { storage, tab } = setup();
    let resolveLoad: (m: { endRevokedSession: (store: ReturnType<typeof createSessionStore>) => void }) => void = () => undefined;
    const erased: string[] = [];

    endRefusedSession(tab, { load: () => new Promise((resolve) => (resolveLoad = resolve)), storage });
    deviceSwitchesToBobAndTabFollows(storage, tab);
    expect(tab.getState().session.status === 'authenticated' && tab.getState().session.user.id).toBe('u-bob');

    resolveLoad({ endRevokedSession: (store) => endRevokedSession(store, quietDevice(storage, erased)) });
    await settle();

    expect(tab.getState().session.status).toBe('authenticated');
    expect(heldAccountOf(tab.getState().deviceSession())?.token).toBe('jwt-bob');
    expect(erased).toEqual([]);
  });

  test('le morceau ÉCHOUE après que l’onglet a suivi Bob : le repli ne ferme pas Bob et ne le note pas pour la purge', async () => {
    const { storage, tab } = setup();
    let rejectLoad: (e: Error) => void = () => undefined;

    endRefusedSession(tab, { load: () => new Promise((_resolve, reject) => (rejectLoad = reject)), storage });
    deviceSwitchesToBobAndTabFollows(storage, tab);

    rejectLoad(new Error('Failed to fetch dynamically imported module'));
    await settle();

    const erased: string[] = [];
    forgetPendingAccountEnds(tab, quietDevice(storage, erased));
    expect(tab.getState().session.status).toBe('authenticated');
    expect(heldAccountOf(tab.getState().deviceSession())?.token).toBe('jwt-bob');
    expect(erased).toEqual([]);
  });
});
