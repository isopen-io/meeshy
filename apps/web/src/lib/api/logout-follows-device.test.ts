import { describe, expect, test } from 'bun:test';

import { endRevokedSession, setDeviceFollower } from './account-end';

import { createAuthClient } from './auth';
import type { ApiResult, HttpRequest } from './http';
import { createSessionStore, heldAccountOf, type SessionStorage, type SessionUser } from './session';
import { followDeviceSession } from './session-follow';

const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const ADA: SessionUser = { id: 'u-ada', username: 'ada' };
const BOB: SessionUser = { id: 'u-bob', username: 'bob' };

function fakeStorage(): SessionStorage {
  const raw = new Map<string, string>();
  return { getItem: (k) => raw.get(k) ?? null, setItem: (k, v) => void raw.set(k, v), removeItem: (k) => void raw.delete(k) };
}
const okTransport = { request: async <T>(_r: HttpRequest): Promise<ApiResult<T>> => ({ ok: true, status: 200, data: { message: 'ok' } as T }) };

describe('se déconnecter d’un compte que l’appareil ne tient plus rend l’onglet au compte qu’il tient (audit #19352, N4)', () => {
  test('après « Se déconnecter » d’Ada, l’onglet suit Bob, que l’appareil tient (D-237 : l’appareil tient un compte ⇒ l’onglet le tient)', async () => {
    const storage = fakeStorage();
    const adaTab = createSessionStore({ storage, now: () => NOW });
    adaTab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    createSessionStore({ storage, now: () => NOW }).getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });

    await createAuthClient({ transport: okTransport, store: adaTab }).logout();

    expect(adaTab.getState().session.status).toBe('authenticated');
  });

  test('… et le jeton de Bob reste sur l’appareil : aucun écran de connexion ne vient poser un autre compte par-dessus', async () => {
    const storage = fakeStorage();
    const adaTab = createSessionStore({ storage, now: () => NOW });
    adaTab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    createSessionStore({ storage, now: () => NOW }).getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });

    await createAuthClient({ transport: okTransport, store: adaTab }).logout();

    const device = heldAccountOf(createSessionStore({ storage, now: () => NOW }).getState().deviceSession());
    expect(device?.token).toBe('jwt-bob');
    expect(heldAccountOf(adaTab.getState().session)?.token).toBe('jwt-bob');
  });

  test('la fin d’accès d’un invité de lien rend aussi l’onglet au compte que l’appareil tient', () => {
    setDeviceFollower(followDeviceSession);
    try {
      const storage = fakeStorage();
      const guestTab = createSessionStore({ storage, now: () => NOW });
      guestTab.getState().establishGuest({ sessionToken: 'anon-1', guest: { participantId: null, nickname: 'visiteur', conversationId: 'c-9', link: 'lnk', mayWrite: true } });
      createSessionStore({ storage, now: () => NOW }).getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });

      endRevokedSession(guestTab, { storage, cacheStorage: { keys: async () => [], delete: async () => true }, publications: { clear: async () => undefined } });

      expect(heldAccountOf(guestTab.getState().session)?.token).toBe('jwt-bob');
    } finally {
      setDeviceFollower(null);
    }
  });
});
