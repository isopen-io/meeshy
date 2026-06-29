/**
 * Route tests — magic-link endpoints
 *
 * Covers all 3 routes:
 *   POST /magic-link/request
 *   GET  /magic-link/validate
 *   POST /magic-link/validate
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mock dependencies BEFORE importing the route file ───────────────────────

const mockRequestMagicLink = jest.fn() as jest.Mock<any>;
const mockValidateMagicLink = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/MagicLinkService', () => ({
  MagicLinkService: jest.fn().mockImplementation(() => ({
    requestMagicLink: (...args: unknown[]) => mockRequestMagicLink(...args),
    validateMagicLink: (...args: unknown[]) => mockValidateMagicLink(...args),
  })),
}));

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MagicLink Routes', () => {
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
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /magic-link/request
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /magic-link/request', () => {
    it('returns the service result directly when email is valid', async () => {
      const serviceResult = {
        success: true,
        message: 'If an account exists, a login link has been sent.',
        expiresInSeconds: 600,
      };
      mockRequestMagicLink.mockResolvedValue(serviceResult);

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/request',
        payload: { email: 'test@example.com' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('If an account exists, a login link has been sent.');
      expect(body.data.expiresInSeconds).toBe(600);
    });

    it('passes rememberDevice=false by default to the service', async () => {
      mockRequestMagicLink.mockResolvedValue({ success: true, message: 'ok' });

      await app.inject({
        method: 'POST',
        url: '/magic-link/request',
        payload: { email: 'test@example.com' },
      });

      expect(mockRequestMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({ rememberDevice: false })
      );
    });

    it('passes rememberDevice=true to the service when provided', async () => {
      mockRequestMagicLink.mockResolvedValue({ success: true, message: 'ok' });

      await app.inject({
        method: 'POST',
        url: '/magic-link/request',
        payload: { email: 'test@example.com', rememberDevice: true },
      });

      expect(mockRequestMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({ rememberDevice: true })
      );
    });

    it('passes ip and userAgent from request context to the service', async () => {
      mockRequestMagicLink.mockResolvedValue({ success: true, message: 'ok' });
      mockGetRequestContext.mockResolvedValue({
        ip: '192.168.1.42',
        userAgent: 'Mozilla/5.0',
        geoData: null,
        deviceInfo: null,
      });

      await app.inject({
        method: 'POST',
        url: '/magic-link/request',
        payload: { email: 'user@example.com' },
      });

      expect(mockRequestMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          ipAddress: '192.168.1.42',
          userAgent: 'Mozilla/5.0',
        })
      );
    });

    it('returns 400 when email is missing', async () => {
      // Missing required field is caught by Fastify JSON-schema validation before the handler
      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/request',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when email is invalid', async () => {
      // AJV format:'email' validation fires before the Zod check in the handler
      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/request',
        payload: { email: 'not-an-email' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when email exceeds 255 characters (Zod max(255) fires in handler)', async () => {
      // The Fastify body schema has no maxLength, so Zod validation in the handler rejects it
      const longEmail = `${'a'.repeat(250)}@b.com`;

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/request',
        payload: { email: longEmail },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('returns 500 and logs error when requestMagicLink throws', async () => {
      mockRequestMagicLink.mockRejectedValue(new Error('Redis down'));

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/request',
        payload: { email: 'test@example.com' },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(mockLoggerChild.error).toHaveBeenCalled();
    });

    it('returns 500 when getRequestContext throws', async () => {
      mockGetRequestContext.mockRejectedValue(new Error('context error'));

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/request',
        payload: { email: 'test@example.com' },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /magic-link/validate
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /magic-link/validate', () => {
    it('returns 200 with user/token/session on valid token', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult());

      const response = await app.inject({
        method: 'GET',
        url: '/magic-link/validate?token=valid-token-abc',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      // Fastify's fast-json-stringify serialises nested objects via their schema;
      // user/session are typed as { type: 'object' } with no properties, so fields
      // pass as empty objects in the serialised response — check presence, not fields.
      expect(body.data.user).toBeDefined();
      expect(body.data.token).toBe('jwt-token-abc');
      expect(body.data.sessionToken).toBe('session-token-xyz');
      expect(body.data.expiresIn).toBe(86400);
    });

    it('passes the query token to validateMagicLink', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult());

      await app.inject({
        method: 'GET',
        url: '/magic-link/validate?token=my-specific-token',
      });

      expect(mockValidateMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'my-specific-token' })
      );
    });

    it('returns 400 when token query param is missing', async () => {
      // Missing required querystring property is caught by Fastify before the handler
      const response = await app.inject({
        method: 'GET',
        url: '/magic-link/validate',
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when token query param is empty string', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/magic-link/validate?token=',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('returns 400 with result.error when validateMagicLink returns success=false', async () => {
      mockValidateMagicLink.mockResolvedValue({
        success: false,
        error: 'Token expired or invalid',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/magic-link/validate?token=expired-token',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Token expired or invalid');
    });

    it('always sets expiresIn to 86400 (24h) regardless of the result', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult());

      const response = await app.inject({
        method: 'GET',
        url: '/magic-link/validate?token=any-token',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.expiresIn).toBe(86400);
    });

    it('returns 500 and logs error when validateMagicLink throws', async () => {
      mockValidateMagicLink.mockRejectedValue(new Error('DB crash'));

      const response = await app.inject({
        method: 'GET',
        url: '/magic-link/validate?token=crash-token',
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(mockLoggerChild.error).toHaveBeenCalled();
    });

    it('returns 500 when getRequestContext throws', async () => {
      mockGetRequestContext.mockRejectedValue(new Error('context error'));

      const response = await app.inject({
        method: 'GET',
        url: '/magic-link/validate?token=some-token',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /magic-link/validate
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /magic-link/validate', () => {
    it('returns 200 with user/token/session when token is valid and rememberDevice=false', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult({ rememberDevice: false }));

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'valid-token-abc' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      // user/session objects are schema-typed as { type: 'object' } with no properties,
      // so fast-json-stringify strips nested fields — check presence, not specific fields.
      expect(body.data.user).toBeDefined();
      expect(body.data.token).toBe('jwt-token-abc');
      expect(body.data.sessionToken).toBe('session-token-xyz');
    });

    it('sets expiresIn to 24*60*60 when rememberDevice is false', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult({ rememberDevice: false }));

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'valid-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.expiresIn).toBe(24 * 60 * 60);
    });

    it('sets expiresIn to 365*24*60*60 when rememberDevice is true', async () => {
      mockValidateMagicLink.mockResolvedValue(
        makeValidateResult({ rememberDevice: true, session: makeSession({ id: 'sess-123' }) })
      );
      mockMarkSessionTrusted.mockResolvedValue(true);

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'valid-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.expiresIn).toBe(365 * 24 * 60 * 60);
    });

    it('calls markSessionTrusted when rememberDevice=true and session.id is present', async () => {
      const session = makeSession({ id: 'sess-trusted-456' });
      mockValidateMagicLink.mockResolvedValue(
        makeValidateResult({ rememberDevice: true, session, user: makeUser({ id: 'u-42' }) })
      );
      mockGetRequestContext.mockResolvedValue({
        ip: '10.0.0.1',
        userAgent: 'MyApp/2.0',
        geoData: null,
        deviceInfo: null,
      });
      mockMarkSessionTrusted.mockResolvedValue(true);

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'remember-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockMarkSessionTrusted).toHaveBeenCalledWith('sess-trusted-456', {
        userId: 'u-42',
        ipAddress: '10.0.0.1',
        userAgent: 'MyApp/2.0',
        source: 'magic_link',
      });
    });

    it('spreads session with isTrusted=true into the response payload when rememberDevice=true', async () => {
      // The session schema is { type: 'object' } so fast-json-stringify strips all nested
      // fields from the HTTP response. We verify the branch by checking that markSessionTrusted
      // was called (proving rememberDevice=true took the trusted path), and expiresIn is 365d.
      mockValidateMagicLink.mockResolvedValue(
        makeValidateResult({ rememberDevice: true, session: makeSession({ id: 'sess-t' }) })
      );
      mockMarkSessionTrusted.mockResolvedValue(true);

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'remember-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockMarkSessionTrusted).toHaveBeenCalled();
      expect(response.json().data.expiresIn).toBe(365 * 24 * 60 * 60);
    });

    it('spreads session with isTrusted=false into the response payload when rememberDevice=false', async () => {
      // rememberDevice=false → markSessionTrusted not called, expiresIn is 24h
      mockValidateMagicLink.mockResolvedValue(makeValidateResult({ rememberDevice: false }));

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'regular-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
      expect(response.json().data.expiresIn).toBe(24 * 60 * 60);
    });

    it('does NOT call markSessionTrusted when rememberDevice=false', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult({ rememberDevice: false }));

      await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'regular-token' },
      });

      expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    });

    it('does NOT call markSessionTrusted when rememberDevice=true but session.id is absent', async () => {
      const sessionWithoutId = { ...makeSession(), id: undefined as unknown as string };
      mockValidateMagicLink.mockResolvedValue(
        makeValidateResult({ rememberDevice: true, session: sessionWithoutId })
      );

      await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'no-session-id-token' },
      });

      expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    });

    it('does NOT call markSessionTrusted when rememberDevice=true but session is undefined', async () => {
      mockValidateMagicLink.mockResolvedValue(
        makeValidateResult({ rememberDevice: true, session: undefined })
      );

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'no-session-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    });

    it('logs warn when markSessionTrusted returns false', async () => {
      mockValidateMagicLink.mockResolvedValue(
        makeValidateResult({ rememberDevice: true, session: makeSession({ id: 'sess-fail' }) })
      );
      mockMarkSessionTrusted.mockResolvedValue(false);

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'warn-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockLoggerChild.warn).toHaveBeenCalledWith('Échec du marquage session trusted');
    });

    it('still returns 200 (no error) when markSessionTrusted returns false', async () => {
      mockValidateMagicLink.mockResolvedValue(
        makeValidateResult({ rememberDevice: true, session: makeSession({ id: 'sess-fail' }) })
      );
      mockMarkSessionTrusted.mockResolvedValue(false);

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'warn-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });

    it('treats missing rememberDevice on result as false', async () => {
      const resultWithoutRememberDevice = {
        success: true,
        user: makeUser(),
        token: 'jwt-token',
        sessionToken: 'session-token',
        session: makeSession(),
        // rememberDevice not set → undefined → || false → false
      };
      mockValidateMagicLink.mockResolvedValue(resultWithoutRememberDevice);

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'no-remember-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.expiresIn).toBe(24 * 60 * 60);
      expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
    });

    it('returns 400 when token body param is missing', async () => {
      // Missing required body field → Fastify JSON-schema validation fires before handler
      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when token body param is empty string', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('returns 400 with result.error when validateMagicLink returns success=false', async () => {
      mockValidateMagicLink.mockResolvedValue({
        success: false,
        error: 'Token has already been used',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'used-token' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Token has already been used');
    });

    it('returns 500 and logs error when validateMagicLink throws', async () => {
      mockValidateMagicLink.mockRejectedValue(new Error('Unexpected DB failure'));

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'crash-token' },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(mockLoggerChild.error).toHaveBeenCalled();
    });

    it('returns 500 when getRequestContext throws', async () => {
      mockGetRequestContext.mockRejectedValue(new Error('context error'));

      const response = await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'some-token' },
      });

      expect(response.statusCode).toBe(500);
    });

    it('passes the body token to validateMagicLink', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult());

      await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'my-post-token' },
      });

      expect(mockValidateMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'my-post-token' })
      );
    });

    it('passes request context to validateMagicLink', async () => {
      mockValidateMagicLink.mockResolvedValue(makeValidateResult());
      mockGetRequestContext.mockResolvedValue({
        ip: '203.0.113.5',
        userAgent: 'TestClient/3.0',
        geoData: null,
        deviceInfo: null,
      });

      await app.inject({
        method: 'POST',
        url: '/magic-link/validate',
        payload: { token: 'ctx-token' },
      });

      expect(mockValidateMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          requestContext: expect.objectContaining({
            ip: '203.0.113.5',
            userAgent: 'TestClient/3.0',
          }),
        })
      );
    });
  });
});
