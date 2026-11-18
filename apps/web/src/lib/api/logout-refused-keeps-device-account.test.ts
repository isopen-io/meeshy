import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { endRevokedSession, setDeviceFollower } from './account-end';
import { createAuthClient } from './auth';
import { credentialFromSession } from './client';
import { createHttpTransport } from './http';
import { createSessionStore, heldAccountOf, sessionIdentityKey, type SessionStorage, type SessionUser } from './session';
import { followDeviceSession } from './session-follow';

/**
 * LA DÉCONNEXION D'ADA NE FERME JAMAIS LA SESSION DE BOB (audit #19352, défaut ouvert par N4).
 * L'onglet périmé d'Ada se déconnecte pendant que l'appareil tient Bob. N4 pose
 * Bob dans l'onglet AVANT d'envoyer `POST /auth/logout` sous les en-têtes
 * explicites d'Ada : la requête est alors émise « sous » l'identité de Bob
 * (http.ts : credential/identity relus au départ). Si la session d'Ada est déjà
 * morte côté passerelle (401), ce 401 est lu comme le refus de la session de
 * Bob : `onUnauthorized` → `endRevokedSession` ferme Bob sur l'appareil.
 */
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const ADA: SessionUser = { id: 'u-ada', username: 'ada' };
const BOB: SessionUser = { id: 'u-bob', username: 'bob' };

function fakeStorage(): SessionStorage {
  const raw = new Map<string, string>();
  return { getItem: (k) => raw.get(k) ?? null, setItem: (k, v) => void raw.set(k, v), removeItem: (k) => void raw.delete(k) };
}

describe('la déconnexion d’Ada refusée en 401 laisse Bob ouvert sur l’appareil (audit #19352)', () => {
  beforeAll(() => setDeviceFollower(followDeviceSession));
  afterAll(() => setDeviceFollower(null));

  test('POST /auth/logout d’Ada refusé (401, sa session est déjà morte) : l’appareil garde Bob', async () => {
    const storage = fakeStorage();
    const adaTab = createSessionStore({ storage, now: () => NOW });
    adaTab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    createSessionStore({ storage, now: () => NOW }).getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });

    const erased: string[] = [];
    const sent: Array<{ readonly path: string; readonly auth: string | undefined }> = [];
    const transport = createHttpTransport({
      base: 'https://gate.test',
      credential: () => credentialFromSession(adaTab.getState().session),
      identity: () => sessionIdentityKey(adaTab.getState().session),
      onUnauthorized: () =>
        endRevokedSession(adaTab, { storage, cacheStorage: { keys: async () => [], delete: async () => true }, publications: { clear: async (id: string) => void erased.push(id) } }),
      fetchImpl: (async (url: string, init: RequestInit) => {
        sent.push({ path: url.replace('https://gate.test', ''), auth: (init.headers as Record<string, string>).Authorization });
        return new Response(JSON.stringify({ success: false, error: 'Session expirée', code: 'SESSION_EXPIRED' }), { status: 401 });
      }) as unknown as typeof fetch,
      timeoutMs: 0,
    });

    await createAuthClient({ transport, store: adaTab }).logout();

    const device = heldAccountOf(createSessionStore({ storage, now: () => NOW }).getState().deviceSession());
    expect(device?.token).toBe('jwt-bob');
    expect(erased).toEqual([]);
  });
});
