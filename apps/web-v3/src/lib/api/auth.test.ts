import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest } from './http';
import { createAuthClient, isPhoneConflict } from './auth';
import { createSessionStore } from './session';

/**
 * LE FLUX DE CONNEXION (#5605, T4) — transport BOUCHONNÉ (un simple
 * enregistreur d'appels), magasin RÉEL (`createSessionStore`, jamais un
 * mock : c'est son vrai comportement qui doit tenir le contrat).
 *
 * Le magasin reçoit TOUJOURS son stockage et son horloge : sans stockage
 * explicite il tomberait sur `localStorage`, dont l'ABSENCE sous `bun` est la
 * seule chose qui isole aujourd'hui ces témoins les uns des autres — une
 * isolation qui tient par accident cesse de tenir le jour où l'exécuteur
 * fournit le global.
 */

/** Horloge figée — l'échéance persistée est `now() + expiresIn × 1000`. */
const FIXED_NOW = Date.UTC(2026, 8, 7, 12, 0, 0);

function memoryStore() {
  const raw = new Map<string, string>();
  return createSessionStore({
    storage: {
      getItem: (key) => raw.get(key) ?? null,
      setItem: (key, value) => {
        raw.set(key, value);
      },
      removeItem: (key) => {
        raw.delete(key);
      },
    },
    now: () => FIXED_NOW,
  });
}

type Stub = {
  readonly transport: { request<T>(request: HttpRequest): Promise<ApiResult<T>> };
  readonly calls: HttpRequest[];
};

function stubTransport(responses: ReadonlyArray<ApiResult<unknown>>): Stub {
  const calls: HttpRequest[] = [];
  let i = 0;
  return {
    calls,
    transport: {
      request: async <T>(request: HttpRequest) => {
        calls.push(request);
        const response = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return response as ApiResult<T>;
      },
    },
  };
}

describe('login() — connexion complète (forme login.ts:206-212)', () => {
  test('⇒ magasin authenticated, jetons posés et persistés', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([
      {
        ok: true,
        data: {
          user: { id: 'u-1', username: 'ada', displayName: 'Ada' },
          token: 'jwt-1',
          sessionToken: 'sess-1',
          session: { id: 's-1' },
          expiresIn: 86400,
        },
      },
    ]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.login({ username: 'ada', password: 'secret' });

    expect(result.ok).toBe(true);
    expect(store.getState().session).toEqual({
      status: 'authenticated',
      user: { id: 'u-1', username: 'ada', displayName: 'Ada' },
      token: 'jwt-1',
      sessionToken: 'sess-1',
      expiresAt: FIXED_NOW + 86_400_000,
    });
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { username: 'ada', password: 'secret' },
    });
  });
});

describe('login() — branche second facteur (forme login.ts:145-158, rang AUTRE que le premier)', () => {
  test('⇒ pending2fa, twoFactorToken tenu, AUCUN jeton d’accès, rien persisté', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([
      {
        ok: true,
        data: {
          requires2FA: true,
          twoFactorToken: 'tok-2fa',
          user: { id: 'u-1', username: 'ada', email: 'a@x.io', firstName: 'A', lastName: 'D', displayName: 'Ada' },
          message: 'Veuillez entrer votre code',
        },
      },
    ]);
    const auth = createAuthClient({ transport, store });

    await auth.login({ username: 'ada', password: 'secret' });

    expect(store.getState().session).toEqual({
      status: 'pending2fa',
      twoFactorToken: 'tok-2fa',
      user: { id: 'u-1', username: 'ada', email: 'a@x.io', firstName: 'A', lastName: 'D', displayName: 'Ada' },
    });
  });
});

describe('completeTwoFactor() — POST /auth/login/2fa (login.ts:232-241)', () => {
  test('compose { twoFactorToken, code } EXACTEMENT — pas de rememberDevice', async () => {
    const store = memoryStore();
    const { transport: loginTransport } = stubTransport([
      {
        ok: true,
        data: { requires2FA: true, twoFactorToken: 'tok-2fa', user: { id: 'u-1', username: 'ada' }, message: 'm' },
      },
    ]);
    await createAuthClient({ transport: loginTransport, store }).login({ username: 'ada', password: 'secret' });

    const { transport, calls } = stubTransport([
      {
        ok: true,
        data: {
          user: { id: 'u-1', username: 'ada' },
          token: 'jwt-2',
          sessionToken: 'sess-2',
          expiresIn: 86400,
          usedBackupCode: false,
        },
      },
    ]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.completeTwoFactor('123456');

    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/v1/auth/login/2fa',
      body: { twoFactorToken: 'tok-2fa', code: '123456' },
    });
    expect(result.ok).toBe(true);
    expect(store.getState().session.status).toBe('authenticated');
  });

  test('aucune connexion 2FA en attente ⇒ échec immédiat, transport jamais appelé', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.completeTwoFactor('000000');

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('login() — refus (login.ts:133)', () => {
  test('401 ⇒ magasin reste anonymous, l’échec est rendu à l’appelant', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([
      { ok: false, status: 401, error: 'Identifiants invalides', code: 'INVALID_CREDENTIALS' },
    ]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.login({ username: 'ada', password: 'faux' });

    expect(result).toEqual({ ok: false, status: 401, error: 'Identifiants invalides', code: 'INVALID_CREDENTIALS' });
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });
});

describe('register() — POST /auth/register (#5555, T2)', () => {
  test('200 succès (register.ts:383-388) ⇒ magasin authenticated, session persistée avec échéance', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([
      {
        ok: true,
        data: { user: { id: 'u-9', username: 'nova', displayName: 'Nova' }, token: 'jwt-9', sessionToken: 'sess-9', expiresIn: 86400 },
      },
    ]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.register({ displayName: 'Nova', email: 'nova@x.io', password: 'un-mot-de-passe-solide' });

    expect(result.ok).toBe(true);
    expect(store.getState().session).toEqual({
      status: 'authenticated',
      user: { id: 'u-9', username: 'nova', displayName: 'Nova' },
      token: 'jwt-9',
      sessionToken: 'sess-9',
      expiresAt: FIXED_NOW + 86_400_000,
    });
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: { displayName: 'Nova', email: 'nova@x.io', password: 'un-mot-de-passe-solide' },
    });
  });

  test('200 phoneOwnershipConflict (register.ts:301-331) ⇒ magasin INCHANGÉ (anonymous), résultat rendu tel quel', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([
      {
        ok: true,
        data: {
          phoneOwnershipConflict: true,
          phoneOwnerInfo: {
            maskedDisplayName: 'N***',
            maskedUsername: 'n***a',
            maskedEmail: 'n***@x.io',
            avatar: null,
            phoneNumber: '0612345678',
            phoneCountryCode: 'FR',
          },
          pendingRegistration: { email: 'nova@x.io' },
        },
      },
    ]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.register({ displayName: 'Nova', email: 'nova@x.io', password: 'un-mot-de-passe-solide', phoneNumber: '0612345678', phoneCountryCode: 'FR' });

    expect(result.ok).toBe(true);
    expect(store.getState().session).toEqual({ status: 'anonymous' });
    expect(result.ok && isPhoneConflict(result.data)).toBe(true);
  });

  test('échec (409 EMAIL_TAKEN) ⇒ rien d’écrit, le champ voyage jusqu’à l’appelant', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([
      { ok: false, status: 409, error: 'Adresse déjà utilisée', code: 'EMAIL_TAKEN', field: 'email' },
    ]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.register({ displayName: 'Nova', email: 'nova@x.io', password: 'un-mot-de-passe-solide' });

    expect(result).toEqual({ ok: false, status: 409, error: 'Adresse déjà utilisée', code: 'EMAIL_TAKEN', field: 'email' });
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });
});

describe('logout() — wipe D’ABORD (miroir SessionSnapshotStore.wipe(), login.ts:355-386)', () => {
  test('le magasin est déjà anonymous quand le transport est appelé ; X-Session-Token porté explicitement', async () => {
    const store = memoryStore();
    store
      .getState()
      .establish({ user: { id: 'u-1', username: 'ada' }, token: 'jwt-1', sessionToken: 'sess-1', expiresIn: 86_400 });

    const seenSessionStatusAtCallTime: string[] = [];
    const calls: HttpRequest[] = [];
    const transport = {
      request: async <T>(request: HttpRequest) => {
        seenSessionStatusAtCallTime.push(store.getState().session.status);
        calls.push(request);
        return { ok: true, data: { message: 'Déconnexion réussie' } } as ApiResult<T>;
      },
    };
    const auth = createAuthClient({ transport, store });

    await auth.logout();

    expect(seenSessionStatusAtCallTime).toEqual(['anonymous']);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.path).toBe('/api/v1/auth/logout');
    expect(calls[0]?.headers).toEqual({ Authorization: 'Bearer jwt-1', 'X-Session-Token': 'sess-1' });
  });

  test('un transport qui rejette ne réauthentifie PAS — un déconnecté localement le reste', async () => {
    const store = memoryStore();
    store
      .getState()
      .establish({ user: { id: 'u-1', username: 'ada' }, token: 'jwt-1', sessionToken: 'sess-1', expiresIn: 86_400 });
    const transport = {
      request: async <T>(_request: HttpRequest) =>
        ({ ok: false, status: 0, error: 'panne réseau' }) as ApiResult<T>,
    };
    const auth = createAuthClient({ transport, store });

    const result = await auth.logout();

    expect(result.ok).toBe(false);
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });
});
