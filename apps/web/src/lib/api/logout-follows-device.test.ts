import { describe, expect, test } from 'bun:test';

import { createAccountVault } from './accounts';
import { createAuthClient } from './auth';
import type { ApiResult, HttpRequest } from './http';
import { createSessionStore, heldAccountOf, type SessionStorage, type SessionUser } from './session';

const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const ADA: SessionUser = { id: 'u-ada', username: 'ada' };
const BOB: SessionUser = { id: 'u-bob', username: 'bob' };
const CAROL: SessionUser = { id: 'u-carol', username: 'carol' };

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

  test('… sinon, se connecter depuis l’écran de connexion qui suit pose Carol par-dessus Bob, dont le jeton quitte l’appareil sans être rangé', async () => {
    const storage = fakeStorage();
    const vault = createAccountVault({ storage, now: () => NOW });
    const adaTab = createSessionStore({ storage, now: () => NOW });
    adaTab.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const bobTab = createSessionStore({ storage, now: () => NOW });
    bobTab.getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });
    vault.noteActive(BOB);

    await createAuthClient({ transport: okTransport, store: adaTab }).logout();
    adaTab.getState().establish({ user: CAROL, token: 'jwt-carol', sessionToken: 'sess-carol', expiresIn: 3600 });

    const device = heldAccountOf(createSessionStore({ storage, now: () => NOW }).getState().deviceSession());
    const bobKept = vault.list().find((a) => a.user.id === BOB.id)?.session?.token ?? null;
    expect(device?.user.id === BOB.id || bobKept === 'jwt-bob').toBe(true);
  });
});
