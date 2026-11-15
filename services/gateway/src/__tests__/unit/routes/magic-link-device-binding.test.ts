/**
 * #10872 — les routes du lien magique : l'EMPREINTE d'appareil part avec la
 * demande, le secret et le oui avec la validation, et la branche « confirmez
 * le compte » sort entière, sans session.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mock dependencies BEFORE importing the route file ───────────────────────

const mockRequestMagicLink = jest.fn() as jest.Mock<any>;
const mockValidateMagicLink = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/auth/email-verification-watch', () => ({
  pendingSessionTokenFor: jest.fn(async () => ({ pendingSessionToken: 'attente-opaque' })),
}));
jest.mock('../../../services/MagicLinkService', () => ({
  MagicLinkService: jest.fn().mockImplementation(() => ({
    requestMagicLink: (...args: unknown[]) => mockRequestMagicLink(...args),
    validateMagicLink: (...args: unknown[]) => mockValidateMagicLink(...args),
  })),
}));

const mockStartAccountFromEmail = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/AuthService', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    startAccountFromEmail: (...args: unknown[]) => mockStartAccountFromEmail(...args),
  })),
}));
jest.mock('../../../utils/secrets', () => ({ getJwtSecret: () => 'secret' }));

const mockGetCacheStore = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: (...args: unknown[]) => mockGetCacheStore(...args),
}));

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({})),
}));

const mockGetRequestContext = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/GeoIPService', () => ({
  GeoIPService: jest.fn().mockImplementation(() => ({})),
  getRequestContext: (...args: unknown[]) => mockGetRequestContext(...args),
}));

const mockInitSessionService = jest.fn() as jest.Mock<any>;
const mockMarkSessionTrusted = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/SessionService', () => ({
  initSessionService: (...args: unknown[]) => mockInitSessionService(...args),
  markSessionTrusted: (...args: unknown[]) => mockMarkSessionTrusted(...args),
}));

const mockLoggerChild = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => mockLoggerChild,
  },
}));

const mockLegacyRecord = jest.fn(async (_entry: unknown) => {});
jest.mock('../../../services/auth/legacy-link-client', () => ({
  ...jest.requireActual<typeof import('../../../services/auth/legacy-link-client')>('../../../services/auth/legacy-link-client'),
  getLegacyLinkLoginCounter: () => ({ record: mockLegacyRecord }),
}));

// ─── Import route under test ──────────────────────────────────────────────────

import { magicLinkRoutes } from '../../../routes/magic-link';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeRequestContext = () => ({
  ip: '127.0.0.1',
  userAgent: 'TestAgent/1.0',
  geoData: null,
  deviceInfo: null,
});

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-abc-123',
  username: 'testuser',
  email: 'test@example.com',
  ...overrides,
});

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-xyz-789',
  deviceType: 'desktop',
  browserName: 'Chrome',
  osName: 'Linux',
  location: 'Paris, FR',
  isMobile: false,
  isTrusted: false,
  createdAt: new Date('2026-01-01T09:00:00Z'),
  ...overrides,
});

const makeValidateResult = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  user: makeUser(),
  token: 'jwt-token-abc',
  sessionToken: 'session-token-xyz',
  session: makeSession(),
  rememberDevice: false,
  ...overrides,
});

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        strict: false,
        keywords: ['example'],
      },
    },
  });

  (app as any).decorate('prisma', {});

  mockGetCacheStore.mockReturnValue({});

  await app.register(magicLinkRoutes, { prefix: '' });
  await app.ready();
  return app;
}

const EMPREINTE = 'ab'.repeat(32);
const SECRET = 'c2VjcmV0LWRlLWNldC1hcHBhcmVpbC0zMi1vY3RldHM';

describe('#10872 — lien magique lié à l’appareil', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue(makeRequestContext());
    mockStartAccountFromEmail.mockResolvedValue({ kind: 'verification-required', accountCreated: false, email: 'x@example.com' });
  });

  it('la demande attache l’empreinte de l’appareil (normalisée en minuscules)', async () => {
    await app.inject({ method: 'POST', url: '/magic-link/request', payload: { email: 'x@example.com', linkDeviceHash: EMPREINTE.toUpperCase() } });

    expect(mockStartAccountFromEmail).toHaveBeenCalledWith(expect.objectContaining({ linkDeviceHash: EMPREINTE }), expect.anything());
  });

  it('une demande sans empreinte (ancien client) passe, lien non lié', async () => {
    const response = await app.inject({ method: 'POST', url: '/magic-link/request', payload: { email: 'x@example.com' } });

    expect(response.statusCode).toBe(200);
    expect(mockStartAccountFromEmail).toHaveBeenCalledWith(expect.objectContaining({ linkDeviceHash: null }), expect.anything());
  });

  it('une empreinte mal formée : 400, rien n’est envoyé', async () => {
    const response = await app.inject({ method: 'POST', url: '/magic-link/request', payload: { email: 'x@example.com', linkDeviceHash: 'zz' } });

    expect(response.statusCode).toBe(400);
    expect(mockStartAccountFromEmail).not.toHaveBeenCalled();
  });

  it('la validation remet le secret et le oui au service', async () => {
    mockValidateMagicLink.mockResolvedValue(makeValidateResult());

    await app.inject({ method: 'POST', url: '/magic-link/validate', payload: { token: 'tok', linkDeviceSecret: SECRET, confirm: true } });

    expect(mockValidateMagicLink).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok', linkDeviceSecret: SECRET, confirmed: true }));
  });

  it('sans le oui : 200 `requiresConfirmation` + le compte, ni session ni jeton', async () => {
    const account = { id: 'user-abc-123', username: 'testuser', displayName: 'Test', avatar: null };
    mockValidateMagicLink.mockResolvedValue({ success: false, requiresConfirmation: true, account, intent: 'sign-in', maskedEmail: 'te....r@e*****om', error: 'Confirm.' });

    const response = await app.inject({ method: 'POST', url: '/magic-link/validate', payload: { token: 'tok' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: { requiresConfirmation: true, account, intent: 'sign-in', maskedEmail: 'te....r@e*****om' } });
    expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    expect(mockValidateMagicLink).toHaveBeenCalledWith(expect.objectContaining({ linkDeviceSecret: undefined, confirmed: false }));
  });

  it('un secret mal formé : 400', async () => {
    const response = await app.inject({ method: 'POST', url: '/magic-link/validate', payload: { token: 'tok', linkDeviceSecret: 'court' } });

    expect(response.statusCode).toBe(400);
    expect(mockValidateMagicLink).not.toHaveBeenCalled();
  });

  describe('#10878 — la transition mesurée', () => {
    const iosAnnonce = (version: string) => ({
      'x-meeshy-platform': 'ios',
      'x-meeshy-version': version,
      'x-app-platform': 'ios',
      'x-app-version': version,
    });

    it('ancien client iOS (1.1.3) : oui implicite au service, passage compté', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult());

      await app.inject({ method: 'POST', url: '/magic-link/validate', payload: { token: 'tok' }, headers: iosAnnonce('1.1.3') });

      expect(mockValidateMagicLink).toHaveBeenCalledWith(expect.objectContaining({ confirmed: true }));
      expect(mockLegacyRecord).toHaveBeenCalledWith({ route: 'magic-link-validate', client: { platform: 'ios', version: '1.1.3' } });
    });

    it('ancien client iOS, jeton INVALIDE : rien de compté', async () => {
      mockValidateMagicLink.mockResolvedValue({ success: false, error: 'Invalid or expired magic link' });

      const response = await app.inject({ method: 'POST', url: '/magic-link/validate', payload: { token: 'bidon' }, headers: iosAnnonce('1.1.3') });

      expect(response.statusCode).toBe(400);
      expect(mockLegacyRecord).not.toHaveBeenCalled();
    });

    it('iOS 1.1.3 qui déclare link-device-binding : confirmation demandée', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult());

      await app.inject({ method: 'POST', url: '/magic-link/validate', payload: { token: 'tok' }, headers: { ...iosAnnonce('1.1.3'), 'x-meeshy-capabilities': 'link-device-binding' } });

      expect(mockValidateMagicLink).toHaveBeenCalledWith(expect.objectContaining({ confirmed: false }));
      expect(mockLegacyRecord).not.toHaveBeenCalled();
    });

    it('nouveau client iOS (1.1.4) : confirmation demandée, rien de compté', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult());

      await app.inject({ method: 'POST', url: '/magic-link/validate', payload: { token: 'tok' }, headers: iosAnnonce('1.1.4') });

      expect(mockValidateMagicLink).toHaveBeenCalledWith(expect.objectContaining({ confirmed: false }));
      expect(mockLegacyRecord).not.toHaveBeenCalled();
    });

    it('client inconnu : confirmation demandée (fail-closed), rien de compté', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult());

      await app.inject({ method: 'POST', url: '/magic-link/validate', payload: { token: 'tok' } });

      expect(mockValidateMagicLink).toHaveBeenCalledWith(expect.objectContaining({ confirmed: false }));
      expect(mockLegacyRecord).not.toHaveBeenCalled();
    });
  });
});
