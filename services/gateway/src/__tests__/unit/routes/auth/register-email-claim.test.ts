/**
 * `POST /register` devant une adresse déjà détenue (#8214) — ce que le FIL porte.
 *
 * Contrat partagé avec les clients (#8216) :
 * - sans revendication : `409 EMAIL_TAKEN` + `emailOwner` masqué ;
 * - `claimEmail: true` : `200 { status: 'verification-required',
 *   accountCreated: true, email }` — l'adresse REVENDIQUÉE, jamais l'adresse
 *   d'attente du compte —, AUCUNE session, même avec un numéro.
 *
 * Les témoins passent par `app.inject` sur la VRAIE déclaration de réponse : un
 * champ non déclaré serait retiré à la sérialisation, en silence.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const mockPendingForEmail = jest.fn(async (_p: unknown, _email: string) => ({ pendingSessionToken: 'attente-par-adresse' }));
const mockPendingForAccount = jest.fn(async (_p: unknown, _id: string) => ({ pendingSessionToken: 'attente-du-revendiquant' }));
jest.mock('../../../../services/auth/email-verification-watch', () => ({
  pendingSessionTokenFor: (...a: [unknown, string]) => mockPendingForEmail(...a),
  pendingSessionTokenForAccount: (...a: [unknown, string]) => mockPendingForAccount(...a),
}));
const mockAnnonce = jest.fn();
jest.mock('../../../../services/notifications/contact-joined', () => ({
  scheduleContactJoinedAnnouncement: (...a: unknown[]) => mockAnnonce(...a),
}));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
const doubleDeLimiteur = () => ({
  middleware: jest.fn(() => async () => {}),
  refund: jest.fn(async (_key: string) => {}),
  keyFor: jest.fn(() => 'ip:test'),
});
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createRegisterRateLimiter: jest.fn(() => doubleDeLimiteur()),
  createAuthGlobalRateLimiter: jest.fn(() => doubleDeLimiteur()),
}));
jest.mock('../../../../services/GeoIPService', () => ({
  getRequestContext: jest.fn(async () => ({ ip: '127.0.0.1', userAgent: 'ua', deviceInfo: { type: 'desktop' }, geoData: { country: 'FR' } })),
  lookupGeoIp: jest.fn(async () => null),
  isPrivateIp: jest.fn(() => true),
}));
jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas: { register: {} },
  validateSchema: jest.fn((_s: unknown, data: Record<string, unknown>) => ({ ...data })),
}));
const mockCreateSession = jest.fn(async () => ({ id: 'session' }));
jest.mock('../../../../services/SessionService', () => ({
  createSession: (...a: unknown[]) => (mockCreateSession as jest.Mock<any>)(...a),
  generateSessionToken: jest.fn(() => 'session-token'),
}));

import { registerRegistrationRoutes } from '../../../../routes/auth/register';
import { RegistrationRefusal } from '../../../../services/auth/registration-refusal';

const REVENDIQUANT = {
  id: '507f1f77bcf86cd799439022',
  username: 'marie_vraie',
  email: 'claim-0a1b2c@claiming.meeshy.invalid',
  firstName: 'Marie',
  lastName: 'Martin',
  displayName: 'Marie Martin',
  phoneNumber: null as string | null,
  role: 'USER',
  isActive: false,
  systemLanguage: 'fr',
};

async function monter(register: jest.Mock<any>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = { user: { findFirst: jest.fn(async () => null) } };
  app.decorate('prisma', prisma);
  registerRegistrationRoutes({
    fastify: app,
    authService: {
      register,
      generateToken: jest.fn(() => 'jwt'),
      getUserPermissions: jest.fn(() => []),
    },
    phoneTransferService: { getTransferDataByToken: jest.fn(async () => ({ valid: false })) },
    redis: null,
    prisma,
  } as never);
  await app.ready();
  return app;
}

const inscrire = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/register', payload });

beforeEach(() => jest.clearAllMocks());

describe('adresse détenue — le 409 porte le détenteur masqué', () => {
  it('EMAIL_TAKEN, champ `email`, et `emailOwner` survit à la sérialisation', async () => {
    const refus = new RegistrationRefusal('EMAIL_TAKEN', 'Email déjà utilisé', {
      emailOwner: { maskedDisplayName: 'M**e D**t', maskedUsername: 'm******e', avatar: 'https://cdn.example/a.png' },
    });
    const app = await monter(jest.fn<any>().mockRejectedValue(refus));

    const res = await inscrire(app, { email: 'marie@example.com' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      code: 'EMAIL_TAKEN',
      field: 'email',
      emailOwner: { maskedDisplayName: 'M**e D**t', maskedUsername: 'm******e', avatar: 'https://cdn.example/a.png' },
    });
    await app.close();
  });

  it('un USERNAME_TAKEN ne porte aucun `emailOwner`', async () => {
    const app = await monter(jest.fn<any>().mockRejectedValue(new RegistrationRefusal('USERNAME_TAKEN', 'pris', { suggestions: ['a1'] })));

    const res = await inscrire(app, { email: 'x@example.com', username: 'pris' });

    expect(res.json()).not.toHaveProperty('emailOwner');
    await app.close();
  });
});

describe('« ce n’est pas moi » — `claimEmail: true`', () => {
  const revendique = (extra: Partial<typeof REVENDIQUANT> = {}) =>
    jest.fn<any>().mockResolvedValue({ user: { ...REVENDIQUANT, ...extra }, claimedEmail: 'marie@example.com' });

  it('transmet la revendication au service', async () => {
    const register = revendique();
    const app = await monter(register);

    await inscrire(app, { email: 'marie@example.com', claimEmail: true });

    expect(register).toHaveBeenCalledWith(expect.objectContaining({ claimEmail: true }), expect.anything(), expect.anything());
    await app.close();
  });

  it('rend « vérification requise » avec l’adresse REVENDIQUÉE, jamais l’adresse d’attente', async () => {
    const app = await monter(revendique());

    const res = await inscrire(app, { email: 'marie@example.com', claimEmail: true });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { status: 'verification-required', accountCreated: true, email: 'marie@example.com', pendingSessionToken: 'attente-du-revendiquant' },
    });
    expect(res.body).not.toContain('claiming.meeshy.invalid');
    await app.close();
  });

  it('l’attente se lie au compte REVENDIQUANT, jamais au détenteur de l’adresse', async () => {
    const app = await monter(revendique());

    await inscrire(app, { email: 'marie@example.com', claimEmail: true });

    expect(mockPendingForAccount).toHaveBeenCalledWith(expect.anything(), REVENDIQUANT.id);
    expect(mockPendingForEmail).not.toHaveBeenCalled();
    await app.close();
  });

  it('même AVEC un numéro : aucune session, aucun jeton', async () => {
    const app = await monter(revendique({ phoneNumber: '+33612345678' }));

    const res = await inscrire(app, { email: 'marie@example.com', phoneNumber: '0612345678', claimEmail: true });

    expect(res.json().data).not.toHaveProperty('token');
    expect(res.json().data.status).toBe('verification-required');
    expect(mockCreateSession).not.toHaveBeenCalled();
    await app.close();
  });

  it('n’annonce aucune arrivée avant la preuve', async () => {
    const app = await monter(revendique({ phoneNumber: '+33612345678' }));

    await inscrire(app, { email: 'marie@example.com', claimEmail: true });

    expect(mockAnnonce).not.toHaveBeenCalled();
    await app.close();
  });
});
