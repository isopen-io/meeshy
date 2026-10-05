import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest } from './http';
import { createAuthClient, isPhoneConflict, isVerificationRequired } from './auth';
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

  /**
   * SANS NUMÉRO, L'INSCRIPTION N'OUVRE AUCUNE SESSION (#8055) — la passerelle
   * rend la forme de la connexion d'un e-mail inconnu (#8033) : le compte
   * existe, le code et le lien sont partis, et c'est le code qui ouvrira la
   * session. Le magasin reste `anonymous`.
   */
  test('200 verification-required (#8055) ⇒ magasin INCHANGÉ (anonymous), résultat rendu tel quel', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([
      { ok: true, data: { status: 'verification-required', accountCreated: true, email: 'nova@x.io' } },
    ]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.register({ displayName: 'Nova', email: 'nova@x.io', password: 'un-mot-de-passe-solide' });

    expect(store.getState().session).toEqual({ status: 'anonymous' });
    expect(result.ok && isVerificationRequired(result.data)).toBe(true);
    expect(result.ok && isPhoneConflict(result.data)).toBe(false);
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

/**
 * LE LIEN MAGIQUE ET LE MOT DE PASSE OUBLIÉ (#5816, T3a-c) — miroir
 * `MagicLinkView.swift` / `MeeshyForgotPasswordView.swift`, § 3 de la
 * spécification.
 */
describe('requestMagicLink() — POST /auth/magic-link/request (routes/magic-link.ts:45-118)', () => {
  test('corps { email } SEUL ; le magasin reste anonymous ; le résultat est rendu SANS être avalé', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([{ ok: true, data: { expiresInSeconds: 600 }, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.requestMagicLink({ email: 'ada@x.io' });

    expect(calls[0]).toEqual({ method: 'POST', path: '/api/v1/auth/magic-link/request', body: { email: 'ada@x.io' } });
    expect(result).toEqual({ ok: true, data: { expiresInSeconds: 600 }, status: 200 });
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });

  test('rememberDevice n’est envoyé que s’il est fourni (même règle que login)', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([{ ok: true, data: { expiresInSeconds: 600 }, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    await auth.requestMagicLink({ email: 'ada@x.io', rememberDevice: true });

    expect(calls[0]?.body).toEqual({ email: 'ada@x.io', rememberDevice: true });
  });

  test('un échec (débit dépassé) laisse aussi le magasin anonymous, résultat rendu tel quel', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([{ ok: true, data: {}, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.requestMagicLink({ email: 'ada@x.io' });

    expect(result).toEqual({ ok: true, data: {}, status: 200 });
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });
});

describe('validateMagicLink() — POST /auth/magic-link/validate (routes/magic-link.ts:150-330)', () => {
  test('(a) 200 session ⇒ magasin authenticated, token/sessionToken/expiresAt et persisté', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([
      {
        ok: true,
        data: {
          user: { id: 'u-1', username: 'ada', displayName: 'Ada' },
          token: 'jwt-ml',
          sessionToken: 'sess-ml',
          session: { id: 's-ml', isTrusted: false },
          expiresIn: 86_400,
        },
        status: 200,
      },
    ]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.validateMagicLink('tok-abc');

    expect(calls[0]).toEqual({ method: 'POST', path: '/api/v1/auth/magic-link/validate', body: { token: 'tok-abc' } });
    expect(result.ok).toBe(true);
    expect(store.getState().session).toEqual({
      status: 'authenticated',
      user: { id: 'u-1', username: 'ada', displayName: 'Ada' },
      token: 'jwt-ml',
      sessionToken: 'sess-ml',
      expiresAt: FIXED_NOW + 86_400_000,
    });
  });

  test('(b) 200 requires2FA ⇒ magasin pending2fa, AUCUN jeton', async () => {
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
        status: 200,
      },
    ]);
    const auth = createAuthClient({ transport, store });

    await auth.validateMagicLink('tok-abc');

    expect(store.getState().session).toEqual({
      status: 'pending2fa',
      twoFactorToken: 'tok-2fa',
      user: { id: 'u-1', username: 'ada', email: 'a@x.io', firstName: 'A', lastName: 'D', displayName: 'Ada' },
    });
  });

  test('(c) 400 ⇒ magasin INCHANGÉ', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([{ ok: false, status: 400, error: 'This link has expired. Please request a new one.' }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.validateMagicLink('tok-expired');

    expect(result.ok).toBe(false);
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });

  test('(d) magasin déjà authenticated (autre compte) ⇒ clearSession() AVANT la requête', async () => {
    const store = memoryStore();
    store
      .getState()
      .establish({ user: { id: 'u-old', username: 'old' }, token: 'jwt-old', sessionToken: 'sess-old', expiresIn: 86_400 });

    const seenSessionStatusAtCallTime: string[] = [];
    const transport = {
      request: async <T>(_request: HttpRequest) => {
        seenSessionStatusAtCallTime.push(store.getState().session.status);
        return {
          ok: true,
          data: {
            user: { id: 'u-new', username: 'new' },
            token: 'jwt-new',
            sessionToken: 'sess-new',
            session: { id: 's-new' },
            expiresIn: 86_400,
          },
          status: 200,
        } as ApiResult<T>;
      },
    };
    const auth = createAuthClient({ transport, store });

    await auth.validateMagicLink('tok-new');

    expect(seenSessionStatusAtCallTime).toEqual(['anonymous']);
    const session = store.getState().session;
    expect(session.status).toBe('authenticated');
    expect(session.status === 'authenticated' && session.user).toEqual({ id: 'u-new', username: 'new' });
  });
});

describe('forgotPassword() — POST /auth/forgot-password (password-reset.ts:110-215)', () => {
  test('corps { email } vers /api/v1/auth/forgot-password ; magasin intact', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([{ ok: true, data: undefined, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.forgotPassword('ada@x.io');

    expect(calls[0]).toEqual({ method: 'POST', path: '/api/v1/auth/forgot-password', body: { email: 'ada@x.io' } });
    expect(result.ok).toBe(true);
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });

  test('200 avec data:undefined rend ok:true (forme nominale du serveur, § 3.3)', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([{ ok: true, data: undefined, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.forgotPassword('ada@x.io');

    expect(result).toEqual({ ok: true, data: undefined, status: 200 });
  });
});

describe('verifyEmail() — POST /auth/verify-email (magic-link.ts:307-364, AuthSchemas.verifyEmail)', () => {
  test('corps { email, code } — AUCUN `token` (ce chemin est le code à 6 chiffres, jamais le lien) ; magasin intact', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([{ ok: true, data: { message: 'Email vérifié' }, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.verifyEmail({ email: 'ada@x.io', code: '123456' });

    expect(calls[0]).toEqual({ method: 'POST', path: '/api/v1/auth/verify-email', body: { email: 'ada@x.io', code: '123456' } });
    expect(result).toEqual({ ok: true, data: { message: 'Email vérifié' }, status: 200 });
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });

  test('un code déjà vérifié rend `alreadyVerified` + `verifiedAt` SANS erreur (magic-link.ts:349-354)', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([
      { ok: true, data: { message: 'déjà vérifiée', alreadyVerified: true, verifiedAt: '2026-09-01T00:00:00.000Z' }, status: 200 },
    ]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.verifyEmail({ email: 'ada@x.io', code: '123456' });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.alreadyVerified).toBe(true);
  });

  test('code faux ⇒ échec transmis TEL QUEL, jamais avalé', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([{ ok: false, status: 400, error: 'Invalid or expired verification code' }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.verifyEmail({ email: 'ada@x.io', code: '000000' });

    expect(result).toEqual({ ok: false, status: 400, error: 'Invalid or expired verification code' });
  });
});

/**
 * UN E-MAIL INCONNU À LA CONNEXION DEVIENT UN COMPTE (#8034, contrat #8033) —
 * `login` rend 200 `{ status: 'verification-required', accountCreated, email }`,
 * SANS jeton : le magasin reste anonyme, la reprise est à l'écran (le code).
 */
describe('login() — email inconnu ⇒ `verification-required` (#8034)', () => {
  test('⇒ AUCUNE session, le résultat est rendu tel quel et reconnu par `isVerificationRequired`', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([
      { ok: true, data: { status: 'verification-required', accountCreated: true, email: 'neuf@x.io' }, status: 200 },
    ]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.login({ username: 'neuf@x.io', password: 'secret-1' });

    expect(store.getState().session).toEqual({ status: 'anonymous' });
    expect(result.ok && isVerificationRequired(result.data)).toBe(true);
    expect(result.ok && isVerificationRequired(result.data) ? result.data.email : null).toBe('neuf@x.io');
  });

  test('une connexion ordinaire n’est PAS une vérification requise', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([
      { ok: true, data: { user: { id: 'u-1', username: 'ada', displayName: 'Ada' }, token: 'jwt-1', sessionToken: 'sess-1', expiresIn: 60 } },
    ]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.login({ username: 'ada', password: 'secret' });

    expect(result.ok && isVerificationRequired(result.data)).toBe(false);
    expect(store.getState().session.status).toBe('authenticated');
  });
});

describe('verifyEmail() — la vérification OUVRE la session (#8034, contrat #8033)', () => {
  const sessionData = {
    verified: true,
    token: 'jwt-v',
    sessionToken: 'sess-v',
    user: { id: 'u-9', username: 'neuf', displayName: 'Neuf' },
  };

  test('{ email, token } (le lien de l’e-mail) ⇒ corps exact, session établie, 24 h par défaut sans `expiresIn`', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([{ ok: true, data: sessionData, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    await auth.verifyEmail({ email: 'neuf@x.io', token: 'tok-123' });

    expect(calls[0]).toEqual({ method: 'POST', path: '/api/v1/auth/verify-email', body: { email: 'neuf@x.io', token: 'tok-123' } });
    const session = store.getState().session;
    expect(session.status).toBe('authenticated');
    expect(session.status === 'authenticated' ? [session.token, session.sessionToken, session.user.id, session.expiresAt] : null).toEqual([
      'jwt-v',
      'sess-v',
      'u-9',
      FIXED_NOW + 24 * 60 * 60 * 1000,
    ]);
  });

  test('{ email, code, password } ⇒ le mot de passe voyage avec le CODE, et `expiresIn` servi est respecté', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([{ ok: true, data: { ...sessionData, expiresIn: 60 }, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    await auth.verifyEmail({ email: 'neuf@x.io', code: '123456', password: 'secret-1' });

    expect(calls[0]?.body).toEqual({ email: 'neuf@x.io', code: '123456', password: 'secret-1' });
    const session = store.getState().session;
    expect(session.status === 'authenticated' ? session.expiresAt : null).toBe(FIXED_NOW + 60_000);
  });

  test('un mot de passe VIDE n’est jamais envoyé', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([{ ok: true, data: { message: 'ok' }, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    await auth.verifyEmail({ email: 'neuf@x.io', code: '123456', password: '' });

    expect(calls[0]?.body).toEqual({ email: 'neuf@x.io', code: '123456' });
  });

  test('une réponse SANS session (ancienne passerelle) laisse le magasin intact', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([{ ok: true, data: { message: 'Email vérifié' }, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    await auth.verifyEmail({ email: 'ada@x.io', token: 'tok' });

    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });

  test('un échec n’écrit rien', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([{ ok: false, status: 400, error: 'Invalid' }]);
    const auth = createAuthClient({ transport, store });

    await auth.verifyEmail({ email: 'ada@x.io', token: 'tok' });

    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });
});

describe('resendVerification() — POST /auth/resend-verification (magic-link.ts:377-416)', () => {
  test('corps { email } ; toujours 200 générique, même garde de non-révélation que forgotPassword', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([{ ok: true, data: { message: 'Si un compte existe…' }, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.resendVerification('ada@x.io');

    expect(calls[0]).toEqual({ method: 'POST', path: '/api/v1/auth/resend-verification', body: { email: 'ada@x.io' } });
    expect(result.ok).toBe(true);
  });
});

describe('verifyResetToken() — GET /auth/reset-password/verify-token (password-reset.ts:341-401)', () => {
  test('jeton dans la query string, jamais dans le corps (méthode GET)', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([{ ok: true, data: { valid: true, requires2FA: false }, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.verifyResetToken('abc123');

    expect(calls[0]).toEqual({ method: 'GET', path: '/api/v1/auth/reset-password/verify-token?token=abc123' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.valid).toBe(true);
  });

  test('un jeton EXPIRÉ rend `valid:false` — pas une erreur HTTP (§ description de la route)', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([{ ok: true, data: { valid: false }, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.verifyResetToken('perime');

    expect(result.ok && result.data.valid).toBe(false);
  });
});

describe('resetPassword() — POST /auth/reset-password (password-reset.ts:221-...)', () => {
  test('corps { token, newPassword, confirmPassword } ; AUCUNE écriture de session — un reset ne connecte personne', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([{ ok: true, data: { message: 'Mot de passe réinitialisé' }, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.resetPassword({ token: 'abc123', newPassword: 'Sup3r!Secret', confirmPassword: 'Sup3r!Secret' });

    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/v1/auth/reset-password',
      body: { token: 'abc123', newPassword: 'Sup3r!Secret', confirmPassword: 'Sup3r!Secret' },
    });
    expect(result.ok).toBe(true);
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });

  test('`twoFactorCode` omis quand absent — jamais envoyé `undefined` (même discipline que `rememberDevice`)', async () => {
    const store = memoryStore();
    const { transport, calls } = stubTransport([{ ok: true, data: { message: 'ok' }, status: 200 }]);
    const auth = createAuthClient({ transport, store });

    await auth.resetPassword({ token: 't', newPassword: 'Sup3r!Secret', confirmPassword: 'Sup3r!Secret' });

    expect('twoFactorCode' in (calls[0]!.body as Record<string, unknown>)).toBe(false);
  });

  test('jeton invalide/expiré ⇒ 400 transmis tel quel', async () => {
    const store = memoryStore();
    const { transport } = stubTransport([{ ok: false, status: 400, error: 'Invalid or expired reset token' }]);
    const auth = createAuthClient({ transport, store });

    const result = await auth.resetPassword({ token: 'perime', newPassword: 'Sup3r!Secret', confirmPassword: 'Sup3r!Secret' });

    expect(result).toEqual({ ok: false, status: 400, error: 'Invalid or expired reset token' });
  });
});
