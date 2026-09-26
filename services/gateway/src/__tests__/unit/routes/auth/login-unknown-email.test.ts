/**
 * `POST /login` AVEC UNE ADRESSE SANS COMPTE (#8033).
 *
 * Contrat : un EMAIL valide inconnu ⇒ 200 `{ status: "verification-required",
 * accountCreated, email }`, sans session ni jeton ; un identifiant qui n'est
 * pas un email ⇒ 401 inchangé ; un compte existant au mot de passe faux ⇒ 401
 * inchangé. Le mot de passe tapé ne quitte jamais la route vers la création.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../../services/auth/email-verification-watch', () => ({
  pendingSessionTokenFor: jest.fn(async () => ({ pendingSessionToken: 'attente-opaque' })),
}));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../utils/rate-limiter.js', () => {
  const passe = () => ({ middleware: jest.fn(() => async () => {}) });
  return { createLoginRateLimiter: passe, createAuthGlobalRateLimiter: passe, createTwoFactorLoginRateLimiter: passe };
});
jest.mock('../../../../services/GeoIPService', () => ({
  getRequestContext: jest.fn(async () => ({ ip: '203.0.113.7', userAgent: 'test', deviceInfo: null, geoData: null })),
}));
jest.mock('../../../../services/SessionService', () => ({
  markSessionTrusted: jest.fn(),
  invalidateAllSessions: jest.fn(),
}));

import { registerLoginRoutes } from '../../../../routes/auth/login';
import { PasswordNotSetError, ActivationRequiresEmailProofError } from '../../../../errors/custom-errors';

type Outcome =
  | { kind: 'verification-required'; accountCreated: boolean; email: string }
  | { kind: 'existing-account' }
  | { kind: 'unavailable' }
  | { kind: 'rate-limited' };

const construire = async (options: { authenticate?: () => Promise<unknown>; outcome?: Outcome }) => {
  const startAccountFromEmail = jest.fn(async () => options.outcome ?? { kind: 'existing-account' });
  const authService = {
    authenticate: jest.fn(options.authenticate ?? (async () => null)),
    startAccountFromEmail,
    generateToken: jest.fn(() => 'jwt'),
    getUserPermissions: jest.fn(() => []),
  };
  const app = Fastify({ logger: false });
  app.decorate('authenticate', async () => {});
  app.setErrorHandler((error: { statusCode?: number; code?: string; message: string }, _req, reply) => {
    reply.status(error.statusCode ?? 500).send({ success: false, code: error.code, error: error.message });
  });
  registerLoginRoutes({
    fastify: app,
    authService,
    redis: null,
    prisma: null,
    phoneTransferService: {},
    smsService: {},
    cacheStore: {},
    afterResponse: (task: () => Promise<void>) => void task(),
  } as never);
  await app.ready();
  return { app, startAccountFromEmail };
};

const connecter = (app: Awaited<ReturnType<typeof construire>>['app'], username: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/login', payload: { username, password: 'mot-de-passe-tape' }, headers });

describe('adresse valide sans compte', () => {
  it('rend 200 « vérification requise », sans jeton ni session', async () => {
    const { app } = await construire({
      outcome: { kind: 'verification-required', accountCreated: true, email: 'nouvelle@example.com' },
    });
    const res = await connecter(app, 'Nouvelle@Example.com');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { status: 'verification-required', accountCreated: true, email: 'nouvelle@example.com', pendingSessionToken: 'attente-opaque' },
    });
    await app.close();
  });

  it("ne transmet PAS le mot de passe tapé à la création, mais la porte et la locale", async () => {
    const { app, startAccountFromEmail } = await construire({
      outcome: { kind: 'verification-required', accountCreated: true, email: 'nouvelle@example.com' },
    });
    await connecter(app, 'nouvelle@example.com', { 'x-device-locale': 'es-ES' });
    const [entree] = startAccountFromEmail.mock.calls[0] as unknown as [Record<string, unknown>];

    expect(entree).toMatchObject({ email: 'nouvelle@example.com', door: 'password-login', deviceLocale: 'es-ES' });
    expect(JSON.stringify(startAccountFromEmail.mock.calls)).not.toContain('mot-de-passe-tape');
    await app.close();
  });

  it('rend 429 quand le débit de création est épuisé', async () => {
    const { app } = await construire({ outcome: { kind: 'rate-limited' } });
    const res = await connecter(app, 'nouvelle@example.com');

    expect(res.statusCode).toBe(429);
    expect(res.json().success).toBe(false);
    await app.close();
  });
});

describe('ce qui ne change pas', () => {
  it("un identifiant qui n'est pas un email reste 401 INVALID_CREDENTIALS, sans création", async () => {
    const { app, startAccountFromEmail } = await construire({});
    const res = await connecter(app, 'alice');

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_CREDENTIALS');
    expect(startAccountFromEmail).not.toHaveBeenCalled();
    await app.close();
  });

  it('un compte existant au mot de passe faux reste 401', async () => {
    const { app } = await construire({ outcome: { kind: 'existing-account' } });
    const res = await connecter(app, 'alice@example.com');

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_CREDENTIALS');
    await app.close();
  });

  it('une adresse portée par un compte supprimé reste 401', async () => {
    const { app } = await construire({ outcome: { kind: 'unavailable' } });
    const res = await connecter(app, 'partie@example.com');

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('compte sans mot de passe', () => {
  it('jamais vérifié : « vérification requise », accountCreated false', async () => {
    const { app } = await construire({
      authenticate: async () => {
        throw new PasswordNotSetError();
      },
      outcome: { kind: 'verification-required', accountCreated: false, email: 'attente@example.com' },
    });
    const res = await connecter(app, 'attente@example.com');

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ status: 'verification-required', accountCreated: false, email: 'attente@example.com', pendingSessionToken: 'attente-opaque' });
    await app.close();
  });

  it('déjà vérifié : le refus PASSWORD_NOT_SET est rendu tel quel', async () => {
    const { app } = await construire({
      authenticate: async () => {
        throw new PasswordNotSetError();
      },
      outcome: { kind: 'existing-account' },
    });
    const res = await connecter(app, 'verifie@example.com');

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('PASSWORD_NOT_SET');
    await app.close();
  });
});

describe('bon mot de passe, compte NON vérifié et SANS numéro (#8055)', () => {
  const refus = async () => {
    throw new ActivationRequiresEmailProofError('lena@example.com');
  };

  it('rend « vérification requise » (accountCreated false), sans jeton ni session', async () => {
    const { app } = await construire({
      authenticate: refus,
      outcome: { kind: 'verification-required', accountCreated: false, email: 'lena@example.com' },
    });
    const res = await connecter(app, 'lena');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { status: 'verification-required', accountCreated: false, email: 'lena@example.com', pendingSessionToken: 'attente-opaque' },
    });
    await app.close();
  });

  it("renvoie le code à l'adresse DU COMPTE, par la porte du mot de passe prouvé — quel que soit l'identifiant tapé", async () => {
    const { app, startAccountFromEmail } = await construire({
      authenticate: refus,
      outcome: { kind: 'verification-required', accountCreated: false, email: 'lena@example.com' },
    });
    await connecter(app, 'lena');
    const [entree] = startAccountFromEmail.mock.calls[0] as unknown as [Record<string, unknown>];

    expect(entree).toMatchObject({ email: 'lena@example.com', door: 'proven-password' });
    expect(JSON.stringify(startAccountFromEmail.mock.calls)).not.toContain('mot-de-passe-tape');
    await app.close();
  });

  it('sans renvoi possible (compte vérifié entre-temps), reste un 401 — jamais une session', async () => {
    const { app } = await construire({ authenticate: refus, outcome: { kind: 'existing-account' } });
    const res = await connecter(app, 'lena');

    expect(res.statusCode).toBe(401);
    expect(res.json().token).toBeUndefined();
    await app.close();
  });
});
