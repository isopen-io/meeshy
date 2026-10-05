/**
 * `POST /auth/verify-email` OUVRE LA SESSION (#8033).
 *
 * Contrat : `{ email, code }` ou `{ email, token }` (+ `password` optionnel,
 * avec le CODE seulement) ⇒ `{ verified: true, token, sessionToken, user }` —
 * la même forme que `POST /login`. Un compte à second facteur reçoit le défi,
 * jamais la session. La route est limitée en débit : le code n'a que six
 * chiffres.
 *
 * Les schémas de requête sont les RÉELS : c'est Ajv qui refuse un mot de passe
 * accompagné du seul lien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async () => {},
  findTrustedSession: jest.fn(),
}));
jest.mock('../../../../services/GeoIPService', () => ({
  getRequestContext: jest.fn(async () => ({ ip: '203.0.113.7', userAgent: 'test', deviceInfo: null, geoData: null })),
}));
const mockCreateSession = jest.fn(async (_args: unknown) => ({
  id: 'session-neuve',
  deviceType: 'desktop',
  browserName: null,
  osName: null,
  location: null,
  isMobile: false,
  isTrusted: false,
  createdAt: new Date(),
}));
jest.mock('../../../../services/SessionService', () => ({
  createSession: mockCreateSession,
  generateSessionToken: jest.fn(() => 'session-token-neuf'),
}));

import { registerMagicLinkRoutes } from '../../../../routes/auth/magic-link';

const UTILISATEUR = {
  id: '507f1f77bcf86cd799439011',
  username: 'marie',
  email: 'marie@example.com',
  firstName: 'Marie',
  lastName: '',
  displayName: 'Marie',
  role: 'USER',
  isActive: true,
};

type Preuve = Record<string, unknown>;

const succes = (extra: Preuve = {}) => ({
  success: true,
  userId: UTILISATEUR.id,
  verifiedAt: new Date('2026-09-26T10:00:00Z'),
  alreadyVerified: false,
  passwordSet: false,
  secondFactor: 'absent',
  ...extra,
});

const construire = async (options: { verifyEmail?: (p: Preuve) => Promise<unknown>; user?: unknown } = {}) => {
  const verifyEmail = jest.fn(options.verifyEmail ?? (async () => succes()));
  const userUpdate = jest.fn(async () => ({}));
  const authService = {
    verifyEmail,
    getUserById: jest.fn(async () => (options.user === undefined ? UTILISATEUR : options.user)),
    generateToken: jest.fn((_user: unknown, _sid: string) => 'jwt-neuf'),
    getUserPermissions: jest.fn(() => []),
  };
  const app = Fastify({ logger: false });
  app.decorate('authenticate', async () => {});
  app.decorate('prisma', { user: { update: userUpdate } });
  registerMagicLinkRoutes({
    fastify: app,
    authService,
    prisma: app.prisma,
    redis: null,
    phoneTransferService: {},
    smsService: {},
    cacheStore: {},
  } as never);
  await app.ready();
  return { app, verifyEmail, authService, userUpdate };
};

const verifier = (app: Awaited<ReturnType<typeof construire>>['app'], payload: Preuve) =>
  app.inject({ method: 'POST', url: '/verify-email', payload });

const envAvant = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.RATE_LIMIT_DISABLED;
});
afterEach(() => {
  process.env = { ...envAvant };
});

describe('la preuve ouvre la session', () => {
  it.each([
    ['le code', { email: 'marie@example.com', code: '123456' }],
    ['le lien', { email: 'marie@example.com', token: 'jeton-brut' }],
  ])('par %s : verified, token, sessionToken, user — la forme de /login', async (_cas, payload) => {
    const { app, authService } = await construire();
    const res = await verifier(app, payload);
    const data = res.json().data;

    expect(res.statusCode).toBe(200);
    expect(data).toMatchObject({ verified: true, token: 'jwt-neuf', sessionToken: 'session-token-neuf', expiresIn: 86400 });
    expect(data.user).toMatchObject({ id: UTILISATEUR.id, email: 'marie@example.com' });
    expect(data.session).toMatchObject({ id: 'session-neuve' });
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ userId: UTILISATEUR.id, token: 'session-token-neuf' }));
    expect(authService.generateToken).toHaveBeenCalledWith(UTILISATEUR, 'session-neuve');
    await app.close();
  });

  it('un code de CONNEXION (adresse déjà vérifiée) ouvre aussi la session', async () => {
    const { app } = await construire({ verifyEmail: async () => succes({ alreadyVerified: true }) });
    const res = await verifier(app, { email: 'marie@example.com', code: '123456' });

    expect(res.json().data).toMatchObject({ verified: true, alreadyVerified: true, token: 'jwt-neuf' });
    await app.close();
  });
});

describe('aucune session sans preuve', () => {
  it('preuve refusée : 400, aucune session', async () => {
    const { app } = await construire({
      verifyEmail: async () => ({ success: false, reason: 'invalid', error: 'Code de vérification invalide.' }),
    });
    const res = await verifier(app, { email: 'marie@example.com', code: '000000' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'INVALID_VERIFICATION' });
    expect(mockCreateSession).not.toHaveBeenCalled();
    await app.close();
  });

  it('compte devenu inactif entre la preuve et la session : 400, aucune session', async () => {
    const { app } = await construire({ user: null });
    const res = await verifier(app, { email: 'marie@example.com', code: '123456' });

    expect(res.statusCode).toBe(400);
    expect(mockCreateSession).not.toHaveBeenCalled();
    await app.close();
  });

  it('compte à second facteur : le défi, jamais la session', async () => {
    const { app, userUpdate } = await construire({ verifyEmail: async () => succes({ secondFactor: 'required' }) });
    const res = await verifier(app, { email: 'marie@example.com', code: '123456' });
    const data = res.json().data;

    expect(res.statusCode).toBe(200);
    expect(data).toMatchObject({ verified: true, requires2FA: true });
    expect(typeof data.twoFactorToken).toBe('string');
    expect(data).not.toHaveProperty('token');
    expect(data).not.toHaveProperty('sessionToken');
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalled();
    await app.close();
  });

  it('second facteur INDÉTERMINÉ : refus, aucune session', async () => {
    const { app } = await construire({ verifyEmail: async () => succes({ secondFactor: 'indeterminate' }) });
    const res = await verifier(app, { email: 'marie@example.com', code: '123456' });

    expect(res.statusCode).toBe(500);
    expect(mockCreateSession).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('le mot de passe optionnel', () => {
  it('voyage avec le code jusqu’au service', async () => {
    const { app, verifyEmail } = await construire({ verifyEmail: async () => succes({ passwordSet: true }) });
    const res = await verifier(app, { email: 'marie@example.com', code: '123456', password: 'Tr0mb0ne-Violet-42' });

    expect(res.statusCode).toBe(200);
    expect(verifyEmail).toHaveBeenCalledWith(expect.objectContaining({ code: '123456', password: 'Tr0mb0ne-Violet-42' }));
    expect(res.json().data.passwordSet).toBe(true);
    await app.close();
  });

  it('trop faible : 400 AVANT de consommer le code', async () => {
    const { app, verifyEmail } = await construire();
    const res = await verifier(app, { email: 'marie@example.com', code: '123456', password: 'azerty' });

    expect(res.statusCode).toBe(400);
    expect(verifyEmail).not.toHaveBeenCalled();
    await app.close();
  });

  // Le contrat dit « pris en compte UNIQUEMENT avec le code ». La branche
  // « lien » du schéma est `additionalProperties: false`, et Fastify retire
  // (`removeAdditional`) ce qu'elle ne déclare pas : le mot de passe n'atteint
  // jamais le service — ignoré, jamais appliqué.
  it('avec le seul lien : ignoré — il n’atteint jamais le service', async () => {
    const { app, verifyEmail } = await construire();
    const res = await verifier(app, { email: 'marie@example.com', token: 'jeton-brut', password: 'Tr0mb0ne-Violet-42' });

    expect(res.statusCode).toBe(200);
    expect(verifyEmail).toHaveBeenCalledWith(expect.objectContaining({ token: 'jeton-brut', password: undefined }));
    await app.close();
  });
});

describe('le débit est limité — le code n’a que six chiffres', () => {
  it('par adresse : au-delà de 5 essais en 15 minutes, 429', async () => {
    const { app } = await construire({
      verifyEmail: async () => ({ success: false, reason: 'invalid', error: 'Code de vérification invalide.' }),
    });
    const statuts: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuts.push((await verifier(app, { email: 'cible@example.com', code: String(100000 + i) })).statusCode);
    }

    expect(statuts.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuts[5]).toBe(429);
    await app.close();
  });

  it('par IP : au-delà de 20 essais en 15 minutes, même en tournant les adresses', async () => {
    const { app } = await construire({
      verifyEmail: async () => ({ success: false, reason: 'invalid', error: 'Code de vérification invalide.' }),
    });
    let dernier = 0;
    for (let i = 0; i < 21; i += 1) {
      dernier = (await verifier(app, { email: `c${i}@example.com`, code: '123456' })).statusCode;
    }

    expect(dernier).toBe(429);
    await app.close();
  });
});
