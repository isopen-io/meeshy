/**
 * #10872 — `POST /auth/verify-email` par LIEN : le secret de l'appareil et le
 * oui de l'utilisateur voyagent jusqu'au service ; la branche « confirmez le
 * compte » n'ouvre AUCUNE session et sort ENTIÈRE à travers le schéma réel.
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
const sessionNeuve = (adoptBy?: Date) => ({
  id: 'session-neuve',
  deviceType: 'desktop',
  browserName: null,
  osName: null,
  location: null,
  isMobile: false,
  isTrusted: false,
  createdAt: new Date(),
  adoptBy,
});
const mockCreateSession = jest.fn(async (_args: unknown) => sessionNeuve());
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

const SECRET = 'c2VjcmV0LWRlLWNldC1hcHBhcmVpbC0zMi1vY3RldHM';
const COMPTE = { id: UTILISATEUR.id, username: 'marie', displayName: 'Marie', avatar: null };
const confirmation = async () => ({ success: false, reason: 'confirmation-required', error: 'Confirmez.', account: COMPTE });

describe('#10872 — la confirmation du compte cible', () => {
  it('lien ouvert ailleurs : 200 `requiresConfirmation` + le compte, ni session ni jeton', async () => {
    const { app, authService } = await construire({ verifyEmail: confirmation });
    const res = await verifier(app, { email: 'marie@example.com', token: 'jeton-brut' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { requiresConfirmation: true, account: COMPTE } });
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(authService.generateToken).not.toHaveBeenCalled();
    await app.close();
  });

  it('le secret et le oui voyagent jusqu’au service', async () => {
    const { app, verifyEmail } = await construire();
    await verifier(app, { email: 'marie@example.com', token: 'jeton-brut', linkDeviceSecret: SECRET, confirm: true });

    expect(verifyEmail).toHaveBeenCalledWith(expect.objectContaining({ token: 'jeton-brut', linkDeviceSecret: SECRET, confirmed: true }));
    await app.close();
  });

  it('sans eux : le service reçoit « pas de secret, pas de oui »', async () => {
    const { app, verifyEmail } = await construire();
    await verifier(app, { email: 'marie@example.com', token: 'jeton-brut' });

    expect(verifyEmail).toHaveBeenCalledWith(expect.objectContaining({ linkDeviceSecret: undefined, confirmed: false }));
    await app.close();
  });

  it('un secret mal formé : 400, le service n’est pas appelé', async () => {
    const { app, verifyEmail } = await construire();
    const res = await verifier(app, { email: 'marie@example.com', token: 'jeton-brut', linkDeviceSecret: 'court' });

    expect(res.statusCode).toBe(400);
    expect(verifyEmail).not.toHaveBeenCalled();
    await app.close();
  });

  it('avec le CODE : secret et oui sont ignorés — ils n’atteignent jamais le service', async () => {
    const { app, verifyEmail } = await construire();
    await verifier(app, { email: 'marie@example.com', code: '123456', linkDeviceSecret: SECRET, confirm: true });

    expect(verifyEmail).toHaveBeenCalledWith(expect.objectContaining({ code: '123456', linkDeviceSecret: undefined, confirmed: false }));
    await app.close();
  });
});
