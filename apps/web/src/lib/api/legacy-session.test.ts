import { describe, expect, test } from 'bun:test';

import { credentialFromSession } from './client';
import { createHttpTransport } from './http';
import { createSessionStore, type SessionStorage } from './session';

/**
 * PERSONNE N'EST DÉCONNECTÉ PAR LA BASCULE (#6702) — la v2 reprend la session
 * que le legacy a laissée dans le `localStorage` de `meeshy.me`.
 *
 * Forme MESURÉE de ce que le legacy persiste (`apps/web`) :
 *  - `AuthManager` (`services/auth-manager.service.ts`, clés de
 *    `constants/auth.ts`) — `meeshy_auth_token` (le JWT BRUT),
 *    `meeshy_session_token` (brut, absent d'une connexion sans session nommée),
 *    `meeshy_user_data` (l'utilisateur servi, en JSON) ;
 *  - le magasin zustand persisté `meeshy-auth` (`stores/auth-store.ts`) —
 *    `{ state: { user, authToken, sessionToken, sessionExpiry }, version: 0 }`.
 *
 * L'échéance vient du claim `exp` du JWT (`signSessionToken`,
 * `services/gateway/src/services/auth/session-jwt.ts`, `expiresIn` toujours
 * posé) — jamais de `sessionExpiry`, que le legacy ne pose qu'au
 * rafraîchissement.
 */

const FIXED_NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const EXP = Math.floor(FIXED_NOW / 1000) + 86_400;

type FakeStorage = SessionStorage & { readonly raw: Map<string, string> };

function fakeStorage(seed: Readonly<Record<string, string>> = {}): FakeStorage {
  const raw = new Map(Object.entries(seed));
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

const segment = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const legacyJwt = (claims: Readonly<Record<string, unknown>>): string =>
  `${segment({ alg: 'HS256', typ: 'JWT' })}.${segment(claims)}.c2lnbmF0dXJl`;

/** L'utilisateur tel que `formatUserResponse` le sert et que le legacy le
 * garde — dont les champs qui ne doivent JAMAIS entrer dans `meeshy.session`. */
const LEGACY_USER = {
  id: '64b7f0c2a1e4d5f6a7b8c9d0',
  username: 'awa',
  firstName: 'Awa',
  lastName: 'Diallo',
  displayName: 'Awa Diallo',
  avatar: null,
  email: 'awa@example.io',
  phoneNumber: '+221770000000',
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'wo',
  customDestinationLanguage: null,
  lastLoginIp: '203.0.113.7',
};

/** `avatar: null` n'est pas recopié : `SessionUser` déclare un avatar `string`,
 * et une clé absente dit « pas d'avatar » aussi bien, sans mentir sur le type. */
const PROJECTED_USER = {
  id: LEGACY_USER.id,
  username: 'awa',
  displayName: 'Awa Diallo',
  systemLanguage: 'fr',
  regionalLanguage: 'wo',
  customDestinationLanguage: null,
};

type Legacy = { readonly token: string; readonly sessionToken: string | null; readonly user: unknown };

const tokenFor = (options: { readonly userId?: string; readonly exp?: number } = {}): string =>
  legacyJwt({ userId: options.userId ?? LEGACY_USER.id, username: 'awa', role: 'USER', iat: EXP - 86_400, exp: options.exp ?? EXP });

const LEGACY: Legacy = { token: tokenFor(), sessionToken: 'sess-legacy', user: LEGACY_USER };

const authManagerSeed = (legacy: Legacy = LEGACY): Record<string, string> => ({
  meeshy_auth_token: legacy.token,
  ...(legacy.sessionToken === null ? {} : { meeshy_session_token: legacy.sessionToken }),
  meeshy_user_data: JSON.stringify(legacy.user),
});

const zustandSeed = (legacy: Legacy = LEGACY): Record<string, string> => ({
  'meeshy-auth': JSON.stringify({
    state: { user: legacy.user, authToken: legacy.token, sessionToken: legacy.sessionToken, sessionExpiry: null },
    version: 0,
  }),
});

function restoredFrom(storage: FakeStorage) {
  const store = createSessionStore({ storage, now: () => FIXED_NOW });
  store.getState().restoreSession();
  return store;
}

const adopted = (legacy: Legacy = LEGACY, exp: number = EXP) => ({
  status: 'authenticated',
  user: PROJECTED_USER,
  token: legacy.token,
  sessionToken: legacy.sessionToken ?? '',
  expiresAt: exp * 1000,
});

describe('restoreSession — la session du legacy est reprise', () => {
  test('celle d’AuthManager : jeton repris, utilisateur projeté, `meeshy.session` écrite', () => {
    const storage = fakeStorage(authManagerSeed());

    expect(restoredFrom(storage).getState().session).toEqual(adopted());
    expect(JSON.parse(storage.raw.get('meeshy.session') ?? 'null')).toEqual({
      token: LEGACY.token,
      sessionToken: 'sess-legacy',
      user: PROJECTED_USER,
      expiresAt: EXP * 1000,
    });
  });

  test('celle du magasin zustand `meeshy-auth` suffit aussi', () => {
    expect(restoredFrom(fakeStorage(zustandSeed())).getState().session).toEqual(adopted());
  });

  test('rien de ce qui ne doit pas voyager n’entre dans `meeshy.session`', () => {
    const storage = fakeStorage(authManagerSeed());
    restoredFrom(storage);

    const written = storage.raw.get('meeshy.session') ?? '';
    for (const secret of ['awa@example.io', '+221770000000', '203.0.113.7', 'USER']) {
      expect({ secret, written: written.includes(secret) }).toEqual({ secret, written: false });
    }
  });

  test('les clés du legacy restent intactes — un retour arrière du déploiement ne déconnecte personne', () => {
    const seed = { ...authManagerSeed(), ...zustandSeed() };
    const storage = fakeStorage(seed);
    restoredFrom(storage);

    for (const [key, value] of Object.entries(seed)) expect(storage.raw.get(key)).toBe(value);
  });

  test('deux sources : le jeton qui dure le plus longtemps l’emporte', () => {
    const older: Legacy = { ...LEGACY, token: tokenFor({ exp: EXP - 3_600 }) };
    const newer: Legacy = { ...LEGACY, token: tokenFor({ exp: EXP + 3_600 }), sessionToken: 'sess-rafraichie' };
    const storage = fakeStorage({ ...authManagerSeed(older), ...zustandSeed(newer) });

    expect(restoredFrom(storage).getState().session).toEqual(adopted(newer, EXP + 3_600));
  });

  test('sans session nommée, le jeton est repris avec un `sessionToken` vide — le socket s’authentifie au JWT seul', () => {
    const legacy: Legacy = { ...LEGACY, sessionToken: null };

    expect(restoredFrom(fakeStorage(authManagerSeed(legacy))).getState().session).toEqual(adopted(legacy));
  });

  test('le jeton n’est recopié nulle part ailleurs que dans `meeshy.session`', () => {
    const seed = authManagerSeed();
    const storage = fakeStorage(seed);
    restoredFrom(storage);

    const copies = [...storage.raw.entries()].filter(
      ([key, value]) => !(key in seed) && key !== 'meeshy.session' && value.includes(LEGACY.token),
    );
    expect(copies).toEqual([]);
  });
});

describe('restoreSession — ce qui n’est pas repris', () => {
  test('`meeshy.session` déjà là : la session du legacy est ignorée', () => {
    const v2 = { token: 'jwt-v2', sessionToken: 'sess-v2', user: { id: 'u-v2', username: 'bo' }, expiresAt: FIXED_NOW + 3_600_000 };
    const storage = fakeStorage({ 'meeshy.session': JSON.stringify(v2), ...authManagerSeed() });

    expect(restoredFrom(storage).getState().session).toEqual({ status: 'authenticated', ...v2 });
    expect(JSON.parse(storage.raw.get('meeshy.session') ?? 'null')).toEqual(v2);
  });

  test('une charge illisible ne crée aucune session et ne lève rien', () => {
    const cases: ReadonlyArray<readonly [string, Record<string, string>]> = [
      ['fiche utilisateur non JSON', { ...authManagerSeed(), meeshy_user_data: '{ pas du json' }],
      ['magasin zustand non JSON', { 'meeshy-auth': '{ pas du json' }],
      ['magasin zustand sans état', { 'meeshy-auth': JSON.stringify({ version: 0 }) }],
      ['jeton qui n’est pas un JWT', authManagerSeed({ ...LEGACY, token: 'pas-un-jwt' })],
      ['charge du JWT indécodable', authManagerSeed({ ...LEGACY, token: 'aGVhZGVy.%%%.c2ln' })],
      ['JWT sans échéance', authManagerSeed({ ...LEGACY, token: legacyJwt({ userId: LEGACY_USER.id }) })],
      ['utilisateur sans identifiant', authManagerSeed({ ...LEGACY, user: { username: 'awa' } })],
      ['utilisateur qui n’est pas un objet', authManagerSeed({ ...LEGACY, user: 'awa' })],
    ];

    for (const [name, seed] of cases) {
      const storage = fakeStorage(seed);
      const store = createSessionStore({ storage, now: () => FIXED_NOW });

      expect(() => store.getState().restoreSession()).not.toThrow();
      expect({ name, session: store.getState().session }).toEqual({ name, session: { status: 'anonymous' } });
      expect({ name, persisted: storage.raw.has('meeshy.session') }).toEqual({ name, persisted: false });
    }
  });

  test('un jeton périmé n’est pas repris', () => {
    const storage = fakeStorage(authManagerSeed({ ...LEGACY, token: tokenFor({ exp: Math.floor(FIXED_NOW / 1000) }) }));

    expect(restoredFrom(storage).getState().session).toEqual({ status: 'anonymous' });
  });

  test('un jeton émis pour un AUTRE compte que la fiche n’est pas repris', () => {
    const storage = fakeStorage(authManagerSeed({ ...LEGACY, token: tokenFor({ userId: '64b7f0c2a1e4d5f6a7b8ffff' }) }));

    expect(restoredFrom(storage).getState().session).toEqual({ status: 'anonymous' });
  });
});

describe('après la reprise — un refus ou une déconnexion TIENT', () => {
  test('un jeton refusé (401) ramène à l’état déconnecté, et n’est pas repris au démarrage suivant', async () => {
    const storage = fakeStorage(authManagerSeed());
    const store = restoredFrom(storage);
    expect(store.getState().session.status).toBe('authenticated');

    const transport = createHttpTransport({
      base: 'https://gate.meeshy.me',
      credential: () => credentialFromSession(store.getState().session),
      onUnauthorized: () => store.getState().clearSession(),
      fetchImpl: (async () =>
        new Response(JSON.stringify({ success: false, error: 'Invalid JWT token' }), { status: 401 })) as typeof fetch,
      timeoutMs: 0,
    });
    await transport.request({ method: 'GET', path: '/api/v1/auth/me' });

    expect(store.getState().session).toEqual({ status: 'anonymous' });
    expect(restoredFrom(storage).getState().session).toEqual({ status: 'anonymous' });
  });

  test('une déconnexion après la reprise tient au démarrage suivant', () => {
    const storage = fakeStorage(authManagerSeed());
    restoredFrom(storage).getState().clearSession();

    expect(restoredFrom(storage).getState().session).toEqual({ status: 'anonymous' });
  });

  test('une NOUVELLE connexion au legacy, après coup, est reprise', () => {
    const storage = fakeStorage(authManagerSeed());
    restoredFrom(storage).getState().clearSession();

    const renewed: Legacy = { ...LEGACY, token: tokenFor({ exp: EXP + 7_200 }) };
    storage.setItem('meeshy_auth_token', renewed.token);

    expect(restoredFrom(storage).getState().session).toEqual(adopted(renewed, EXP + 7_200));
  });
});
