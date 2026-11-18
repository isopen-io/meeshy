import { describe, expect, test } from 'bun:test';

import { endRevokedSession, forgetPendingAccountEnds } from './account-end';
import { endRefusedSession } from './client';
import { createSessionStore, heldAccountOf, type SessionStorage, type SessionUser } from './session';

/**
 * UN 401 FERME LA SESSION MÊME QUAND LE MORCEAU DE FIN NE SE CHARGE PAS (audit
 * #19352, défaut ouvert par 149c042890). La fin d'une session refusée se charge
 * à la demande (`account-end.ts`) ; réseau instable ou version changée en
 * route, le chargement échoue : la session refusée restait tenue, et rien de ce
 * que le compte laisse sur l'appareil n'était effacé. Le repli la ferme tout de
 * suite et note le compte, dont la purge se fait au prochain chargement.
 */
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const ADA: SessionUser = { id: 'u-ada', username: 'ada' };
const BOB: SessionUser = { id: 'u-bob', username: 'bob' };

function fakeStorage(): SessionStorage & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return { raw, getItem: (k) => raw.get(k) ?? null, setItem: (k, v) => void raw.set(k, v), removeItem: (k) => void raw.delete(k) };
}

const unloadable = (): Promise<never> => Promise.reject(new Error('Failed to fetch dynamically imported module'));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const quietDevice = (storage: SessionStorage, erased: string[]) => ({
  storage,
  cacheStorage: { keys: async () => [], delete: async () => true },
  indexedDb: null,
  publications: { clear: async (id: string) => void erased.push(id) },
});

describe('la fin d’une session refusée ne dépend pas du chargement de son morceau', () => {
  test('le morceau ne se charge pas : la session finit tout de suite, et le compte est purgé au prochain chargement', async () => {
    const storage = fakeStorage();
    const tab = createSessionStore({ storage, now: () => NOW });
    tab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });

    endRefusedSession(tab, { load: unloadable, storage });
    await settle();

    expect(tab.getState().session.status).toBe('anonymous');
    expect(heldAccountOf(tab.getState().deviceSession())).toBeNull();

    const erased: string[] = [];
    forgetPendingAccountEnds(tab, quietDevice(storage, erased));
    forgetPendingAccountEnds(tab, quietDevice(storage, erased));
    expect(erased).toEqual(['u-ada']);
  });

  test('l’appareil tient un autre compte : le repli ne touche ni son entrée ni ce qu’il y a laissé', async () => {
    const storage = fakeStorage();
    const tab = createSessionStore({ storage, now: () => NOW });
    tab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    createSessionStore({ storage, now: () => NOW }).getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });

    endRefusedSession(tab, { load: unloadable, storage });
    await settle();

    expect(tab.getState().session.status).toBe('anonymous');
    expect(heldAccountOf(tab.getState().deviceSession())?.token).toBe('jwt-bob');
    const erased: string[] = [];
    forgetPendingAccountEnds(tab, quietDevice(storage, erased));
    expect(erased).toEqual([]);
  });

  test('le compte noté s’est reconnecté avant la purge : rien de ce qu’il tient ne part', async () => {
    const storage = fakeStorage();
    const tab = createSessionStore({ storage, now: () => NOW });
    tab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    endRefusedSession(tab, { load: unloadable, storage });
    await settle();
    tab.getState().establish({ user: ADA, token: 'jwt-ada-2', sessionToken: 'sess-ada-2', expiresIn: 3600 });

    const erased: string[] = [];
    forgetPendingAccountEnds(tab, quietDevice(storage, erased));
    expect(erased).toEqual([]);
  });

  test('le morceau se charge : c’est lui qui finit la session (témoin de contrôle)', async () => {
    const storage = fakeStorage();
    const tab = createSessionStore({ storage, now: () => NOW });
    tab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const ended: unknown[] = [];

    endRefusedSession(tab, { load: async () => ({ endRevokedSession: (store) => (ended.push(store), endRevokedSession(store, quietDevice(storage, []))) }), storage });
    await settle();

    expect(ended).toEqual([tab]);
    expect(tab.getState().session.status).toBe('anonymous');
  });
});
