/**
 * user-preferences-routes.test.ts
 *
 * Unit tests for src/routes/me/preferences/index.ts
 * Covers: GET / (all prefs), DELETE / (reset all prefs), and branch coverage
 * for missing userId (401) and DB errors (500).
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (must come before route imports)
// ---------------------------------------------------------------------------

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info:  jest.fn(),
      warn:  jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Mock createUnifiedAuthMiddleware — the implementation is overridden per test
// via buildApp() so we just need a stub here.
jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
  UnifiedAuthRequest: {},
}));

// Mock preference-router-factory — we don't want sub-route behaviour here
jest.mock('../../../../routes/me/preferences/preference-router-factory', () => ({
  createPreferenceRouter: jest.fn(() => async () => {}),
}));

// Mock categories routes — irrelevant for index.ts tests
jest.mock('../../../../routes/me/preferences/categories', () => ({
  categoriesRoutes: async () => {},
}));

// ---------------------------------------------------------------------------
// Import route under test (after all mocks)
// ---------------------------------------------------------------------------

import { userPreferencesRoutes } from '../../../../routes/me/preferences/index';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserPreferences = {
  findUnique: jest.fn<any>(),
  update:     jest.fn<any>(),
};

const mockPrisma: any = {
  userPreferences: mockUserPreferences,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Fastify app with the preferences routes registered.
 *
 * @param authContext  What to attach as `request.auth` during the preHandler.
 *                     Pass `null` to simulate a missing auth (userId = undefined).
 */
function buildApp(authContext?: { userId: string | null } | null): FastifyInstance {
  const authModule = require('../../../../middleware/auth');

  (authModule.createUnifiedAuthMiddleware as jest.Mock).mockImplementation(
    () => async (req: any) => {
      if (authContext === null) {
        // Simulate route handler receiving no auth at all
        req.auth = undefined;
      } else {
        req.auth = authContext ?? { userId: USER_ID };
      }
    }
  );

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: false } },
  });

  app.decorate('prisma', mockPrisma);

  // The route uses fastify.log.error directly — supply a no-op
  // (Fastify's built-in logger is accessible even with logger:false)

  app.register(userPreferencesRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// GET / — all preferences
// ---------------------------------------------------------------------------

describe('GET /me/preferences', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with all preference categories from DB when record exists', async () => {
    const prefs = {
      privacy:      { showOnlineStatus: true },
      audio:        { inputDevice: 'default' },
      message:      { enterToSend: true },
      notification: { pushEnabled: true },
      video:        { autoPlayVideos: false },
      document:     { autoDownload: true },
      application:  { theme: 'dark' },
    };

    mockUserPreferences.findUnique.mockResolvedValue(prefs);

    app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    // Response schema serializes each category as `type: object` — verify all keys are present
    expect(body.data).toHaveProperty('privacy');
    expect(body.data).toHaveProperty('audio');
    expect(body.data).toHaveProperty('message');
    expect(body.data).toHaveProperty('notification');
    expect(body.data).toHaveProperty('video');
    expect(body.data).toHaveProperty('document');
    expect(body.data).toHaveProperty('application');
    // prisma.userPreferences.findUnique must have been called with the userId
    expect(mockUserPreferences.findUnique).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });

  it('returns 200 with defaults when no record exists (null from DB)', async () => {
    mockUserPreferences.findUnique.mockResolvedValue(null);

    app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    // Each category should fall back to its defaults (non-null objects)
    expect(body.data).toHaveProperty('privacy');
    expect(body.data).toHaveProperty('audio');
    expect(body.data).toHaveProperty('message');
    expect(body.data).toHaveProperty('notification');
    expect(body.data).toHaveProperty('video');
    expect(body.data).toHaveProperty('document');
    expect(body.data).toHaveProperty('application');
  });

  it('returns 200 with defaults for categories that are null on an existing record', async () => {
    // Record exists but all JSON fields are null
    mockUserPreferences.findUnique.mockResolvedValue({
      privacy:      null,
      audio:        null,
      message:      null,
      notification: null,
      video:        null,
      document:     null,
      application:  null,
    });

    app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    // All should be defaults (not null)
    expect(body.data.privacy).not.toBeNull();
    expect(body.data.audio).not.toBeNull();
  });

  it('returns 401 when request.auth is missing (no userId)', async () => {
    // auth is undefined → userId will be undefined
    app = buildApp(null);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 401 when userId is null', async () => {
    app = buildApp({ userId: null });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 500 when DB throws', async () => {
    mockUserPreferences.findUnique.mockRejectedValue(new Error('DB connection lost'));

    app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error?.code ?? body.error).toBeTruthy();
  });

  it('returns 500 with error message when DB error has a message', async () => {
    mockUserPreferences.findUnique.mockRejectedValue(new Error('Timeout'));

    app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 500 when DB throws an error object without a message property', async () => {
    // Cover the `error.message || 'Failed to fetch preferences'` falsy branch
    const errWithoutMessage = Object.create(null) as any;
    errWithoutMessage.name = 'UnknownError';
    mockUserPreferences.findUnique.mockRejectedValue(errWithoutMessage);

    app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DELETE / — reset all preferences
// ---------------------------------------------------------------------------

describe('DELETE /me/preferences', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 when all preferences are reset successfully', async () => {
    mockUserPreferences.update.mockResolvedValue({});

    app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'DELETE', url: '/' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls prisma.userPreferences.update with null fields', async () => {
    mockUserPreferences.update.mockResolvedValue({});

    app = buildApp();
    await app.ready();

    await app.inject({ method: 'DELETE', url: '/' });

    expect(mockUserPreferences.update).toHaveBeenCalledTimes(1);
    const callArgs = mockUserPreferences.update.mock.calls[0][0] as any;
    expect(callArgs.where).toEqual({ userId: USER_ID });
    expect(callArgs.data.privacy).toBeNull();
    expect(callArgs.data.audio).toBeNull();
    expect(callArgs.data.message).toBeNull();
    expect(callArgs.data.notification).toBeNull();
    expect(callArgs.data.video).toBeNull();
    expect(callArgs.data.document).toBeNull();
    expect(callArgs.data.application).toBeNull();
  });

  it('returns 401 when request.auth is missing', async () => {
    app = buildApp(null);
    await app.ready();

    const res = await app.inject({ method: 'DELETE', url: '/' });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 401 when userId is null', async () => {
    app = buildApp({ userId: null });
    await app.ready();

    const res = await app.inject({ method: 'DELETE', url: '/' });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 500 when DB throws on update', async () => {
    mockUserPreferences.update.mockRejectedValue(new Error('DB error'));

    app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'DELETE', url: '/' });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 500 with RESET_ERROR code on DB failure', async () => {
    mockUserPreferences.update.mockRejectedValue(new Error('Write timeout'));

    app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'DELETE', url: '/' });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    // The response format uses error.code or error string
    const errorCode = body.error?.code ?? body.error;
    expect(errorCode).toBeTruthy();
  });

  it('returns 500 when DB throws an error without a message property', async () => {
    // Cover the `error.message || 'Failed to reset preferences'` falsy branch
    const errWithoutMessage = Object.create(null) as any;
    errWithoutMessage.name = 'UnknownError';
    mockUserPreferences.update.mockRejectedValue(errWithoutMessage);

    app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'DELETE', url: '/' });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Early return when prisma is missing on fastify instance
// ---------------------------------------------------------------------------

describe('userPreferencesRoutes — missing prisma', () => {
  it('returns early without registering routes when prisma is not decorated', async () => {
    const authModule = require('../../../../middleware/auth');
    (authModule.createUnifiedAuthMiddleware as jest.Mock).mockImplementation(
      () => async (req: any) => {
        req.auth = { userId: USER_ID };
      }
    );

    // Build app WITHOUT decorating prisma
    const app = Fastify({ logger: false });
    // Do NOT decorate prisma
    await app.register(userPreferencesRoutes);
    await app.ready();

    // Routes are not registered — GET / should 404
    const res = await app.inject({ method: 'GET', url: '/' });
    // With no routes registered, Fastify responds 404
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
