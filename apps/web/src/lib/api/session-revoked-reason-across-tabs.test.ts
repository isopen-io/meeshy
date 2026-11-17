import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createAccountCacheShelf, endRevokedSession, setDeviceFollower } from './account-caches';
import { createSessionStore, type SessionStorage, type SessionUser } from './session';
import { endRevokedSessionWithReason, followDeviceSession, watchDeviceSession } from './session-follow';

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

describe('une session révoquée tenue par deux onglets dit son motif dans chacun (audit #19352, N1)', () => {
  beforeAll(() => setDeviceFollower(followDeviceSession));
  afterAll(() => setDeviceFollower(null));

  test('l’onglet qui traite l’événement en second finit sur l’écran de connexion : il doit dire pourquoi', async () => {
    const storage = fakeStorage();
    const tabA = createSessionStore({ storage, now: () => NOW });
    tabA.getState().establish({ user: ADA, token: 'jwt', sessionToken: 'sess', expiresIn: 3600 });
    const tabB = createSessionStore({ storage, now: () => NOW });
    tabB.getState().restoreSession();
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });
    const notedA: string[] = [];
    const notedB: string[] = [];
    const end = (store: Parameters<typeof endRevokedSession>[0]) =>
      endRevokedSession(store, { storage, cacheStorage: noReaderCaches, publications: { clear: async () => undefined } });

    await endRevokedSessionWithReason({ store: tabA, reason: 'password_changed', load: async () => ({ note: (r: string) => void notedA.push(r) }), end });
    await endRevokedSessionWithReason({ store: tabB, reason: 'password_changed', load: async () => ({ note: (r: string) => void notedB.push(r) }), end });

    expect(tabA.getState().session.status).toBe('anonymous');
    expect(tabB.getState().session.status).toBe('anonymous');
    expect(notedA).toEqual(['password_changed']);
    expect(notedB).toEqual(['password_changed']);
  });

  test('même course, l’événement storage arrive dans B avant que son module de motif ne se charge', async () => {
    const storage = fakeStorage();
    const tabA = createSessionStore({ storage, now: () => NOW });
    tabA.getState().establish({ user: ADA, token: 'jwt', sessionToken: 'sess', expiresIn: 3600 });
    const tabB = createSessionStore({ storage, now: () => NOW });
    tabB.getState().restoreSession();
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });
    const notedB: string[] = [];
    const end = (store: Parameters<typeof endRevokedSession>[0]) =>
      endRevokedSession(store, { storage, cacheStorage: noReaderCaches, publications: { clear: async () => undefined } });

    const pendingB = endRevokedSessionWithReason({
      store: tabB,
      reason: 'admin_revoke',
      load: async () => {
        await endRevokedSessionWithReason({ store: tabA, reason: 'admin_revoke', load: async () => ({ note: () => undefined }), end });
        windowB.dispatch('storage', { key: 'meeshy.session' });
        return { note: (r: string) => void notedB.push(r) };
      },
      end,
    });
    await pendingB;

    expect(tabB.getState().session.status).toBe('anonymous');
    expect(notedB).toEqual(['admin_revoke']);
  });
});
