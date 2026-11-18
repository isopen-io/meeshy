import { describe, expect, test } from 'bun:test';

import { endRevokedSession, setDeviceFollower } from './account-end';
import { endRefusedSession } from './client';
import { createSessionStore, heldAccountOf, type GuestIdentity, type SessionStorage, type SessionUser } from './session';
import { followDeviceSession } from './session-follow';

/**
 * L'INVITÉ D'UN LIEN SANS COMPTE FINIT AVANT LA NAVIGATION (audit #19352, 4e tour). `endGuestAccess` navigue aussitôt
 * après `end` vers la page du lien, qui se rend avant la fin chargée à la demande : la session refusée y est déjà
 * partie, et le morceau, à son arrivée, ne fait plus que suivre l'appareil — sans jamais fermer une session ouverte
 * entre-temps.
 */
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const BOB: SessionUser = { id: 'u-bob', username: 'bob' };
const GASTON: GuestIdentity = { participantId: 'p-1', nickname: 'Gaston', conversationId: 'c-1', link: 'mshy_lien', mayWrite: true };

function fakeStorage(): SessionStorage {
  const raw = new Map<string, string>();
  return { getItem: (k) => raw.get(k) ?? null, setItem: (k, v) => void raw.set(k, v), removeItem: (k) => void raw.delete(k) };
}

type AccountEnd = { readonly endRevokedSession: typeof endRevokedSession };

function guestTab() {
  const storage = fakeStorage();
  const tab = createSessionStore({ storage, now: () => NOW });
  tab.getState().establishGuest({ sessionToken: 'gst-1', guest: GASTON });
  let arrive: (module: AccountEnd) => void = () => undefined;
  const load = () => new Promise<AccountEnd>((resolve) => (arrive = resolve));
  const erased: string[] = [];
  const quietEnd: AccountEnd = {
    endRevokedSession: (store) =>
      endRevokedSession(store, { storage, cacheStorage: { keys: async () => [], delete: async () => true }, publications: { clear: async (id: string) => void erased.push(id) } }),
  };
  return { storage, tab, load, erased, arrive: () => arrive(quietEnd) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('l’invité d’un lien sans compte finit sur-le-champ, et le morceau ne fait plus que suivre l’appareil', () => {
  test('avant que le morceau n’arrive, la session de l’invité et son entrée sur l’appareil sont déjà parties', () => {
    const { storage, tab, load } = guestTab();

    endRefusedSession(tab, { load, storage });

    expect(tab.getState().session.status).toBe('anonymous');
    expect(tab.getState().deviceSession().status).toBe('anonymous');
  });

  test('l’appareil tient le compte de Bob : son entrée reste, et l’onglet le suit à l’arrivée du morceau', async () => {
    setDeviceFollower(followDeviceSession);
    try {
      const { storage, tab, load, erased, arrive } = guestTab();
      createSessionStore({ storage, now: () => NOW }).getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });

      endRefusedSession(tab, { load, storage });
      expect(tab.getState().session.status).toBe('anonymous');
      expect(heldAccountOf(tab.getState().deviceSession())?.token).toBe('jwt-bob');

      arrive();
      await settle();

      expect(heldAccountOf(tab.getState().session)?.token).toBe('jwt-bob');
      expect(erased).toEqual([]);
    } finally {
      setDeviceFollower(null);
    }
  });

  test('une session d’invité rouverte avant l’arrivée du morceau n’est pas fermée par lui', async () => {
    const { storage, tab, load, arrive } = guestTab();

    endRefusedSession(tab, { load, storage });
    tab.getState().establishGuest({ sessionToken: 'gst-2', guest: GASTON });
    arrive();
    await settle();

    const session = tab.getState().session;
    expect(session.status === 'guest' ? session.sessionToken : null).toBe('gst-2');
    expect(tab.getState().deviceSession().status).toBe('guest');
  });
});
