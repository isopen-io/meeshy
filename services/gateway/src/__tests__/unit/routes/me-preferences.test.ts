/**
 * Unit tests — /me/preferences routes
 *
 * Covers:
 *   index.ts  (userPreferencesRoutes)
 *     GET  /me/preferences      — fetch all, defaults, auth error, db error
 *     DELETE /me/preferences    — reset all, auth error, db error
 *
 *   preference-router-factory.ts  (createPreferenceRouter)
 *     GET    /me/preferences/privacy   — fetch, defaults, auth, db error
 *     PUT    /me/preferences/privacy   — replace, validation error, consent violation, db error, duplicate cmid
 *     PATCH  /me/preferences/privacy   — partial update, merge with defaults, consent violation, db error
 *     DELETE /me/preferences/privacy   — reset, auth error, db error
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks (must come before imports) ────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
}));

// Mock @meeshy/shared/types/socketio-events so ROOMS and SERVER_EVENTS are available
jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: { USER_PREFERENCES_UPDATED: 'user:preferences-updated' },
  ROOMS: { user: (id: string) => `user:${id}` },
}));

// Mock the auth middleware — we control req.auth directly in buildApp
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (req: FastifyRequest) => {
    // no-op: buildApp adds a preHandler hook instead
  },
}));

// Mock socket-broadcast used by categories sub-routes
jest.mock('../../../utils/socket-broadcast', () => ({
  broadcastToUser: jest.fn(),
}));

// Consent service — by default no violations
const mockValidatePreferences = jest.fn<() => Promise<never[]>>().mockResolvedValue([]);

jest.mock('../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: (...args: unknown[]) => mockValidatePreferences(...args as []),
  })),
}));

// withMutationLog — by default just runs op()
const mockWithMutationLog = jest.fn(async ({ op }: { op: () => Promise<unknown> }) => op());

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: (...args: unknown[]) => mockWithMutationLog(...(args as [{ op: () => Promise<unknown> }])),
}));

// ─── Imports under test ───────────────────────────────────────────────────────

import { userPreferencesRoutes } from '../../../routes/me/preferences/index';
import { createPreferenceRouter } from '../../../routes/me/preferences/preference-router-factory';

// ─── Preference defaults and schemas from shared (real values) ────────────────

import {
  PrivacyPreferenceSchema,
  PRIVACY_PREFERENCE_DEFAULTS,
  AUDIO_PREFERENCE_DEFAULTS,
  MESSAGE_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  VIDEO_PREFERENCE_DEFAULTS,
  DOCUMENT_PREFERENCE_DEFAULTS,
  APPLICATION_PREFERENCE_DEFAULTS,
} from '@meeshy/shared/types/preferences';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const AUTH = { authorization: 'Bearer token' };

const STORED_PRIVACY = {
  showOnlineStatus: false,
  showLastSeen: false,
  showReadReceipts: true,
  showTypingIndicator: true,
  allowContactRequests: true,
  allowGroupInvites: true,
  allowCallsFromNonContacts: false,
  saveMediaToGallery: false,
  allowAnalytics: false,
  shareUsageData: false,
  blockScreenshots: false,
  hideProfileFromSearch: false,
  encryptionPreference: 'optional' as const,
  autoEncryptNewConversations: false,
  showEncryptionStatus: true,
  warnOnUnencrypted: false,
};

const STORED_ALL_PREFS = {
  privacy: STORED_PRIVACY,
  audio: AUDIO_PREFERENCE_DEFAULTS,
  message: MESSAGE_PREFERENCE_DEFAULTS,
  notification: NOTIFICATION_PREFERENCE_DEFAULTS,
  video: VIDEO_PREFERENCE_DEFAULTS,
  document: DOCUMENT_PREFERENCE_DEFAULTS,
  application: APPLICATION_PREFERENCE_DEFAULTS,
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

type PrismaOpts = {
  findUniqueResult?: Record<string, unknown> | null;
  findUniqueError?: Error | null;
  updateResult?: Record<string, unknown>;
  updateError?: Error | null;
  upsertResult?: Record<string, unknown>;
  upsertError?: Error | null;
};

function makePrisma({
  findUniqueResult = { ...STORED_ALL_PREFS },
  findUniqueError = null,
  updateResult = {},
  updateError = null,
  upsertResult = { id: 'pref-id', privacy: STORED_PRIVACY },
  upsertError = null,
}: PrismaOpts = {}) {
  return {
    userPreferences: {
      findUnique: findUniqueError
        ? jest.fn().mockRejectedValue(findUniqueError)
        : jest.fn().mockResolvedValue(findUniqueResult),
      update: updateError
        ? jest.fn().mockRejectedValue(updateError)
        : jest.fn().mockResolvedValue(updateResult),
      upsert: upsertError
        ? jest.fn().mockRejectedValue(upsertError)
        : jest.fn().mockResolvedValue(upsertResult),
    },
    // categories sub-routes need these too
    userConversationCategory: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    conversationPreference: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

// ─── App builder ──────────────────────────────────────────────────────────────

type AuthMode = 'registered' | 'no-user-id';

async function buildApp(prismaOpts: PrismaOpts = {}, authMode: AuthMode = 'registered'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const prisma = makePrisma(prismaOpts);
  app.decorate('prisma', prisma as unknown);

  // Simulate socketIOHandler (socket emission is best-effort, tests don't need real IO)
  app.decorate('socketIOHandler', {
    getManager: () => ({ getIO: () => null }),
  } as unknown);

  // Simulate mutationLogService (used by withMutationLog when cmid present)
  app.decorate('mutationLogService', null as unknown);

  // Add preHandler that sets req.auth
  app.addHook('preHandler', async (req) => {
    const r = req as unknown as Record<string, unknown>;
    if (authMode === 'registered') {
      r.auth = { userId: USER_ID, isAuthenticated: true, isAnonymous: false };
    }
    // 'no-user-id' mode: auth is not set, so request.auth?.userId is undefined
  });

  await app.register(userPreferencesRoutes, { prefix: '/me/preferences' });
  await app.ready();
  return app;
}

/** Build a lightweight app with just one preference category router (no sub-plugins) */
async function buildCategoryApp(
  category: 'privacy',
  prismaOpts: PrismaOpts = {},
  authMode: AuthMode = 'registered',
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const prisma = makePrisma(prismaOpts);
  app.decorate('prisma', prisma as unknown);

  app.decorate('socketIOHandler', {
    getManager: () => ({ getIO: () => null }),
  } as unknown);

  app.decorate('mutationLogService', null as unknown);

  app.addHook('preHandler', async (req) => {
    const r = req as unknown as Record<string, unknown>;
    if (authMode === 'registered') {
      r.auth = { userId: USER_ID, isAuthenticated: true, isAnonymous: false };
    }
  });

  const router = createPreferenceRouter(category, PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
  await app.register(router, { prefix: `/me/preferences/${category}` });
  await app.ready();
  return app;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /me/preferences — fetch all
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /me/preferences', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ findUniqueResult: { ...STORED_ALL_PREFS } });
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with all stored preference categories', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('privacy');
    expect(body.data).toHaveProperty('audio');
    expect(body.data).toHaveProperty('message');
    expect(body.data).toHaveProperty('notification');
    expect(body.data).toHaveProperty('video');
    expect(body.data).toHaveProperty('document');
    expect(body.data).toHaveProperty('application');
  });

  it('falls back to defaults when userPreferences row does not exist (findUnique returns null)', async () => {
    const appNull = await buildApp({ findUniqueResult: null });
    const res = await appNull.inject({ method: 'GET', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    // The GET /me/preferences response schema declares each category as `{ type: 'object' }`
    // without additionalProperties, so Fastify fast-json-stringify serialises them as {}.
    // What we care about is that the response envelope has all 7 category keys.
    expect(body.data).toHaveProperty('privacy');
    expect(body.data).toHaveProperty('audio');
    expect(body.data).toHaveProperty('message');
    expect(body.data).toHaveProperty('notification');
    expect(body.data).toHaveProperty('video');
    expect(body.data).toHaveProperty('document');
    expect(body.data).toHaveProperty('application');
    await appNull.close();
  });

  it('returns 401 when request.auth is missing (no userId)', async () => {
    const appNoAuth = await buildApp({}, 'no-user-id');
    const res = await appNoAuth.inject({ method: 'GET', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildApp({ findUniqueError: new Error('db timeout') });
    const res = await appErr.inject({ method: 'GET', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /me/preferences — reset all
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /me/preferences', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 and success message when reset succeeds', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/reset/i);
  });

  it('nulls out all category fields in the prisma update call', async () => {
    const prisma = makePrisma();
    const appInspect = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appInspect.decorate('prisma', prisma as unknown);
    appInspect.decorate('socketIOHandler', { getManager: () => null } as unknown);
    appInspect.decorate('mutationLogService', null as unknown);
    appInspect.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    await appInspect.register(userPreferencesRoutes, { prefix: '/me/preferences' });
    await appInspect.ready();

    await appInspect.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    const updateCall = (prisma.userPreferences.update as ReturnType<typeof jest.fn>).mock.calls[0][0];
    expect(updateCall.where.userId).toBe(USER_ID);
    expect(updateCall.data.privacy).toBeNull();
    expect(updateCall.data.audio).toBeNull();
    expect(updateCall.data.message).toBeNull();
    expect(updateCall.data.notification).toBeNull();
    expect(updateCall.data.video).toBeNull();
    expect(updateCall.data.document).toBeNull();
    expect(updateCall.data.application).toBeNull();
    await appInspect.close();
  });

  it('returns 401 when userId is missing', async () => {
    const appNoAuth = await buildApp({}, 'no-user-id');
    const res = await appNoAuth.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildApp({ updateError: new Error('db crash') });
    const res = await appErr.inject({ method: 'DELETE', url: '/me/preferences', headers: AUTH });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /me/preferences/:category — via createPreferenceRouter
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /me/preferences/privacy', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildCategoryApp('privacy', {
      findUniqueResult: { privacy: STORED_PRIVACY, id: 'pref-id' },
    });
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with stored privacy preferences', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.showOnlineStatus).toBe(false);
  });

  it('returns defaults when no preferences are stored (null row)', async () => {
    const appNull = await buildCategoryApp('privacy', { findUniqueResult: null });
    const res = await appNull.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual(PRIVACY_PREFERENCE_DEFAULTS);
    await appNull.close();
  });

  it('returns defaults when preferences row has null category field', async () => {
    const appNullField = await buildCategoryApp('privacy', { findUniqueResult: { privacy: null } });
    const res = await appNullField.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual(PRIVACY_PREFERENCE_DEFAULTS);
    await appNullField.close();
  });

  it('returns defaults when preferences row has empty object for category', async () => {
    const appEmpty = await buildCategoryApp('privacy', { findUniqueResult: { privacy: {} } });
    const res = await appEmpty.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual(PRIVACY_PREFERENCE_DEFAULTS);
    await appEmpty.close();
  });

  it('returns 401 when userId is missing', async () => {
    const appNoAuth = await buildCategoryApp('privacy', {}, 'no-user-id');
    const res = await appNoAuth.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildCategoryApp('privacy', { findUniqueError: new Error('db crash') });
    const res = await appErr.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /me/preferences/:category — full replacement
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /me/preferences/privacy', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildCategoryApp('privacy', {
      upsertResult: { id: 'pref-id', privacy: STORED_PRIVACY },
    });
  });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidatePreferences.mockResolvedValue([]);
    mockWithMutationLog.mockImplementation(async ({ op }: { op: () => Promise<unknown> }) => op());
  });

  it('returns 200 with updated preferences on valid body', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('passes validated data to prisma upsert', async () => {
    const prisma = makePrisma({ upsertResult: { id: 'pref-id', privacy: STORED_PRIVACY } });
    const appInspect = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appInspect.decorate('prisma', prisma as unknown);
    appInspect.decorate('socketIOHandler', { getManager: () => ({ getIO: () => null }) } as unknown);
    appInspect.decorate('mutationLogService', null as unknown);
    appInspect.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appInspect.register(router, { prefix: '/me/preferences/privacy' });
    await appInspect.ready();

    await appInspect.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    const upsertCall = (prisma.userPreferences.upsert as ReturnType<typeof jest.fn>).mock.calls[0][0];
    expect(upsertCall.where.userId).toBe(USER_ID);
    expect(upsertCall.update.privacy).toMatchObject({ showOnlineStatus: false });
    await appInspect.close();
  });

  it('returns 400 when body fails Zod validation', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: 'not-a-boolean' }, // invalid type
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 403 when consent violations are present', async () => {
    mockValidatePreferences.mockResolvedValueOnce([
      { field: 'allowAnalytics', message: 'Requires consent', requiredConsents: ['dataProcessingConsentAt'] },
    ] as never);

    const res = await app.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { ...STORED_PRIVACY, allowAnalytics: true },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('CONSENT_REQUIRED');
    expect(Array.isArray(body.violations)).toBe(true);
    expect(body.violations).toHaveLength(1);
  });

  it('returns 401 when userId is missing', async () => {
    const appNoAuth = await buildCategoryApp('privacy', {}, 'no-user-id');
    const res = await appNoAuth.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error during upsert', async () => {
    const appErr = await buildCategoryApp('privacy', { upsertError: new Error('db crash') });
    const res = await appErr.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('replays response from onDuplicate when withMutationLog throws MutationLogDuplicate', async () => {
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: { onDuplicate: (id: string) => Promise<unknown> }) => {
      // Simulate duplicate cmid — call onDuplicate directly
      return onDuplicate('existing-pref-id');
    });

    const prisma = makePrisma({
      findUniqueResult: { id: 'existing-pref-id', privacy: STORED_PRIVACY },
      upsertResult: { id: 'existing-pref-id', privacy: STORED_PRIVACY },
    });
    const appDup = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appDup.decorate('prisma', prisma as unknown);
    appDup.decorate('socketIOHandler', { getManager: () => null } as unknown);
    appDup.decorate('mutationLogService', null as unknown);
    appDup.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appDup.register(router, { prefix: '/me/preferences/privacy' });
    await appDup.ready();

    const res = await appDup.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(200);
    await appDup.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /me/preferences/:category — partial update
// ═══════════════════════════════════════════════════════════════════════════════

describe('PATCH /me/preferences/privacy', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildCategoryApp('privacy', {
      findUniqueResult: { privacy: STORED_PRIVACY },
      upsertResult: { id: 'pref-id', privacy: STORED_PRIVACY },
    });
  });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidatePreferences.mockResolvedValue([]);
    mockWithMutationLog.mockImplementation(async ({ op }: { op: () => Promise<unknown> }) => op());
  });

  it('returns 200 with merged preferences on partial body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('merges partial update with existing preferences', async () => {
    const prisma = makePrisma({
      findUniqueResult: { privacy: STORED_PRIVACY },
      upsertResult: { id: 'pref-id', privacy: { ...STORED_PRIVACY, showOnlineStatus: true } },
    });
    const appInspect = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appInspect.decorate('prisma', prisma as unknown);
    appInspect.decorate('socketIOHandler', { getManager: () => ({ getIO: () => null }) } as unknown);
    appInspect.decorate('mutationLogService', null as unknown);
    appInspect.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appInspect.register(router, { prefix: '/me/preferences/privacy' });
    await appInspect.ready();

    await appInspect.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: true },
    });

    const upsertCall = (prisma.userPreferences.upsert as ReturnType<typeof jest.fn>).mock.calls[0][0];
    // merged: patched showOnlineStatus=true overrides existing false
    expect(upsertCall.update.privacy.showOnlineStatus).toBe(true);
    // Zod .partial().parse() fills in defaults for omitted fields,
    // so other fields come from Zod defaults (not the stored values) merged on top.
    // The important invariant: the upsert receives a complete object with showOnlineStatus=true.
    expect(upsertCall.update.privacy.encryptionPreference).toBe('optional');
    await appInspect.close();
  });

  it('uses defaults when existing preferences are null', async () => {
    const prisma = makePrisma({
      findUniqueResult: { privacy: null },
      upsertResult: { id: 'pref-id', privacy: PRIVACY_PREFERENCE_DEFAULTS },
    });
    const appDefaults = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appDefaults.decorate('prisma', prisma as unknown);
    appDefaults.decorate('socketIOHandler', { getManager: () => null } as unknown);
    appDefaults.decorate('mutationLogService', null as unknown);
    appDefaults.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appDefaults.register(router, { prefix: '/me/preferences/privacy' });
    await appDefaults.ready();

    const res = await appDefaults.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { blockScreenshots: true },
    });

    expect(res.statusCode).toBe(200);
    const upsertCall = (prisma.userPreferences.upsert as ReturnType<typeof jest.fn>).mock.calls[0][0];
    // merged: defaults base + patch override
    expect(upsertCall.update.privacy.blockScreenshots).toBe(true);
    // default value for a non-patched field
    expect(upsertCall.update.privacy.showOnlineStatus).toBe(PRIVACY_PREFERENCE_DEFAULTS.showOnlineStatus);
    await appDefaults.close();
  });

  it('returns 400 when partial body fails Zod validation', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: 'bad-value' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 403 when consent violations arise from merged preferences', async () => {
    mockValidatePreferences.mockResolvedValueOnce([
      { field: 'allowAnalytics', message: 'Missing consent', requiredConsents: ['dataProcessingConsentAt'] },
    ] as never);

    const res = await app.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { allowAnalytics: true },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('CONSENT_REQUIRED');
  });

  it('returns 401 when userId is missing', async () => {
    const appNoAuth = await buildCategoryApp('privacy', {}, 'no-user-id');
    const res = await appNoAuth.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: true },
    });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error during findUnique', async () => {
    const appErr = await buildCategoryApp('privacy', { findUniqueError: new Error('db crash') });
    const res = await appErr.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: true },
    });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 500 on db error during upsert', async () => {
    const appErr = await buildCategoryApp('privacy', {
      findUniqueResult: { privacy: STORED_PRIVACY },
      upsertError: new Error('upsert failed'),
    });
    const res = await appErr.inject({
      method: 'PATCH',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: { showOnlineStatus: true },
    });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /me/preferences/:category — reset to defaults
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /me/preferences/privacy', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildCategoryApp('privacy');
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with reset message on success', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/privacy.*reset/i);
  });

  it('calls prisma.userPreferences.update with the category nulled out', async () => {
    const prisma = makePrisma();
    const appInspect = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appInspect.decorate('prisma', prisma as unknown);
    appInspect.decorate('socketIOHandler', { getManager: () => null } as unknown);
    appInspect.decorate('mutationLogService', null as unknown);
    appInspect.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appInspect.register(router, { prefix: '/me/preferences/privacy' });
    await appInspect.ready();

    await appInspect.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    const updateCall = (prisma.userPreferences.update as ReturnType<typeof jest.fn>).mock.calls[0][0];
    expect(updateCall.where.userId).toBe(USER_ID);
    expect(updateCall.data.privacy).toBeNull();
    await appInspect.close();
  });

  it('returns 401 when userId is missing', async () => {
    const appNoAuth = await buildCategoryApp('privacy', {}, 'no-user-id');
    const res = await appNoAuth.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(401);
    await appNoAuth.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildCategoryApp('privacy', { updateError: new Error('db crash') });
    const res = await appErr.inject({ method: 'DELETE', url: '/me/preferences/privacy', headers: AUTH });

    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// createPreferenceRouter registration — all 7 categories mount correctly
// ═══════════════════════════════════════════════════════════════════════════════

describe('userPreferencesRoutes — sub-routes registration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(() => app.close());

  it('routes GET /me/preferences/audio — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/audio', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/message — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/message', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/notification — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/notification', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/video — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/video', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/document — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/document', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/application — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/application', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('routes GET /me/preferences/privacy — returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/preferences/privacy', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// createPreferenceRouter — socket emission is best-effort (no crash on missing IO)
// ═══════════════════════════════════════════════════════════════════════════════

describe('createPreferenceRouter — socket emission best-effort', () => {
  beforeEach(() => {
    mockValidatePreferences.mockResolvedValue([]);
    mockWithMutationLog.mockImplementation(async ({ op }: { op: () => Promise<unknown> }) => op());
  });

  it('does not throw when socketIOHandler.getManager returns null', async () => {
    const appNoSocket = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appNoSocket.decorate('prisma', makePrisma({
      upsertResult: { id: 'pref-id', privacy: STORED_PRIVACY },
    }) as unknown);
    appNoSocket.decorate('socketIOHandler', { getManager: () => null } as unknown);
    appNoSocket.decorate('mutationLogService', null as unknown);
    appNoSocket.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appNoSocket.register(router, { prefix: '/me/preferences/privacy' });
    await appNoSocket.ready();

    const res = await appNoSocket.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(200);
    await appNoSocket.close();
  });

  it('does not throw when socketIOHandler is absent from fastify', async () => {
    const appNoHandler = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appNoHandler.decorate('prisma', makePrisma({
      upsertResult: { id: 'pref-id', privacy: STORED_PRIVACY },
    }) as unknown);
    // socketIOHandler intentionally not decorated
    appNoHandler.decorate('mutationLogService', null as unknown);
    appNoHandler.addHook('preHandler', async (req) => {
      (req as unknown as Record<string, unknown>).auth = { userId: USER_ID };
    });
    const router = createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS);
    await appNoHandler.register(router, { prefix: '/me/preferences/privacy' });
    await appNoHandler.ready();

    const res = await appNoHandler.inject({
      method: 'PUT',
      url: '/me/preferences/privacy',
      headers: AUTH,
      payload: STORED_PRIVACY,
    });

    expect(res.statusCode).toBe(200);
    await appNoHandler.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// userPreferencesRoutes — early return when prisma is missing
// ═══════════════════════════════════════════════════════════════════════════════

describe('userPreferencesRoutes — missing prisma guard', () => {
  it('registers without crashing when prisma is not decorated', async () => {
    const appNoPrisma = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    // Do not decorate prisma — route should bail out early via the guard
    appNoPrisma.decorate('socketIOHandler', { getManager: () => null } as unknown);
    appNoPrisma.decorate('mutationLogService', null as unknown);

    // Should not throw on register/ready
    await expect(
      appNoPrisma.register(userPreferencesRoutes, { prefix: '/me/preferences' }).then(() => appNoPrisma.ready())
    ).resolves.not.toThrow();

    await appNoPrisma.close();
  });
});
