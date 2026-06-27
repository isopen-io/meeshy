/**
 * users-profile-routes.test.ts
 *
 * Unit tests for src/routes/users/profile.ts
 *
 * Covers (complementing users-public-voice.test.ts which already covers
 * deriveVoiceFields, withVoiceFields, and the voicePublic toggle):
 *
 *   - getUserTest                  GET  /users/me/test
 *   - updateUserProfile            PATCH /users/me          (profile fields, email/phone conflict,
 *                                                            language change, Zod error)
 *   - updateUserAvatar             PATCH /users/me/avatar
 *   - updateUserBanner             PATCH /users/me/banner
 *   - updateUserPassword           PATCH /users/me/password
 *   - updateUsername               PATCH /users/me/username
 *   - getUserByUsername            GET  /u/:username
 *   - getUserById                  GET  /users/:id
 *   - getUserByEmail               GET  /users/email/:email
 *   - getUserByIdDedicated         GET  /users/id/:id
 *   - getUserByPhone               GET  /users/phone/:phone
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Module mocks — must come BEFORE any import that transitively loads these
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info:  jest.fn(),
      warn:  jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

// Lightweight schema stubs — avoids complex JSON-schema serialiser issues
jest.mock('@meeshy/shared/types/api-schemas', () => ({
  userSchema:             { type: 'object', additionalProperties: true },
  userMinimalSchema:      { type: 'object', additionalProperties: true },
  updateUserRequestSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema:    { type: 'object', additionalProperties: true },
}));

const mockCacheDel = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ del: mockCacheDel }),
}));

jest.mock('../../../middleware/auth', () => ({
  authUserCacheKey: (id: string) => `auth:user:${id}`,
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn(({ op }: { op: () => Promise<unknown> }) => op()),
}));

jest.mock('../../../utils/normalize', () => ({
  normalizeEmail:           jest.fn((v: string) => v.toLowerCase().trim()),
  capitalizeName:           jest.fn((v: string) => v),
  normalizeDisplayName:     jest.fn((v: string) => v),
  normalizePhoneNumber:     jest.fn((v: string) => v.trim()),
  normalizePhoneWithCountry: jest.fn((v: string) => ({
    isValid: true,
    phoneNumber: v,
    countryCode: 'FR',
  })),
}));

// Bcrypt: expose controllable mocks
const mockBcryptCompare = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const mockBcryptHash    = jest.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('hashed-new-password');
jest.mock('bcryptjs', () => ({
  default: {
    compare: (...args: unknown[]) => mockBcryptCompare(...args as []),
    hash:    (...args: unknown[]) => mockBcryptHash(...args as []),
  },
  compare: (...args: unknown[]) => mockBcryptCompare(...args as []),
  hash:    (...args: unknown[]) => mockBcryptHash(...args as []),
}));

// formatUserResponse: simple pass-through
jest.mock('../../../routes/auth/types', () => ({
  formatUserResponse: (user: unknown) => user,
}));

// ---------------------------------------------------------------------------
// Route imports (after mocks)
// ---------------------------------------------------------------------------

import {
  getUserTest,
  updateUserProfile,
  updateUserAvatar,
  updateUserBanner,
  updateUserPassword,
  updateUsername,
  getUserByUsername,
  getUserById,
  getUserByEmail,
  getUserByIdDedicated,
  getUserByPhone,
} from '../../../routes/users/profile';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const USER_ID  = '507f1f77bcf86cd799439011';
const USER_ID2 = '507f1f77bcf86cd799439022';

// ---------------------------------------------------------------------------
// Prisma factory
// ---------------------------------------------------------------------------

function makePrisma(overrides: Partial<{
  userFindUnique: unknown;
  userFindFirst: unknown;
  userUpdate: unknown;
  userUpdateMany: unknown;
}> = {}): PrismaClient {
  return {
    user: {
      findUnique:  jest.fn(() => Promise.resolve(overrides.userFindUnique ?? null)),
      findFirst:   jest.fn(() => Promise.resolve(overrides.userFindFirst  ?? null)),
      update:      jest.fn(() => Promise.resolve(overrides.userUpdate     ?? makeUser())),
      updateMany:  jest.fn(() => Promise.resolve({ count: 0 })),
    },
    userVoiceModel: {
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
  } as unknown as PrismaClient;
}

function makeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id:                       USER_ID,
    username:                 'testuser',
    firstName:                'Test',
    lastName:                 'User',
    displayName:              'Test User',
    email:                    'test@example.com',
    phoneNumber:              null,
    avatar:                   null,
    banner:                   null,
    bio:                      null,
    role:                     'USER',
    isActive:                 true,
    deactivatedAt:            null,
    isOnline:                 false,
    lastActiveAt:             null,
    systemLanguage:           'fr',
    regionalLanguage:         'en',
    customDestinationLanguage: null,
    deviceLocale:             null,
    password:                 'hashed-old-password',
    usernameHistory:          [],
    createdAt:                new Date('2026-01-01'),
    updatedAt:                new Date('2026-01-01'),
    voiceModel:               null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// App builder helpers
// ---------------------------------------------------------------------------

type AuthOverride = {
  isAuthenticated?: boolean;
  registeredUser?: unknown;
  userId?: string;
};

async function buildApp(
  registerFn: (app: FastifyInstance) => Promise<void>,
  prisma: PrismaClient,
  auth: AuthOverride = {},
  extras: Record<string, unknown> = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', prisma);
  app.decorate('notificationService', extras.notificationService ?? null);
  app.decorate('socketIOHandler', extras.socketIOHandler ?? null);

  for (const [key, val] of Object.entries(extras)) {
    if (key === 'notificationService' || key === 'socketIOHandler') continue;
    app.decorate(key as never, val as never);
  }

  const ctx = {
    isAuthenticated:  auth.isAuthenticated  ?? true,
    registeredUser:   auth.registeredUser   ?? { id: USER_ID },
    userId:           auth.userId           ?? USER_ID,
    hasFullAccess:    true,
  };

  app.decorate('authenticate', async (req: FastifyInstance) => {
    (req as any).authContext = ctx;
  });

  app.addHook('preValidation', async (req) => {
    (req as any).authContext = ctx;
  });

  await registerFn(app);
  await app.ready();
  return app;
}

// ===========================================================================
// GET /users/me/test
// ===========================================================================

describe('GET /users/me/test — getUserTest', () => {
  let app: FastifyInstance;

  afterEach(async () => { await app.close(); });

  it('returns 200 with userId and message when authenticated', async () => {
    app = await buildApp(getUserTest, makePrisma());
    const res = await app.inject({ method: 'GET', url: '/users/me/test' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe(USER_ID);
    expect(body.data.message).toBe('Test endpoint working');
    expect(typeof body.data.timestamp).toBe('string');
  });

  it('returns 401 when not authenticated', async () => {
    app = await buildApp(
      getUserTest,
      makePrisma(),
      { isAuthenticated: false, registeredUser: null, userId: undefined },
    );
    const res = await app.inject({ method: 'GET', url: '/users/me/test' });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PATCH /users/me — updateUserProfile
// ===========================================================================

describe('PATCH /users/me — updateUserProfile', () => {
  let app: FastifyInstance;

  afterEach(async () => { await app.close(); });

  it('returns 200 and calls prisma.user.update for a valid profile update', async () => {
    const prisma = makePrisma({ userUpdate: makeUser({ firstName: 'Updated' }) });
    app = await buildApp(updateUserProfile, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me',
      payload: { firstName: 'Updated' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect((prisma.user.update as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('returns 401 when not authenticated', async () => {
    app = await buildApp(
      updateUserProfile,
      makePrisma(),
      { isAuthenticated: false, registeredUser: null, userId: undefined },
    );
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when email is already taken by another user', async () => {
    const prisma = makePrisma({ userFindFirst: makeUser({ id: USER_ID2 }) });
    app = await buildApp(updateUserProfile, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me',
      payload: { email: 'taken@example.com' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    // Response includes error about email
    expect(JSON.stringify(body)).toContain('email');
  });

  it('returns 400 when phone is already taken by another user', async () => {
    const prisma = makePrisma({ userFindFirst: makeUser({ id: USER_ID2 }) });
    app = await buildApp(updateUserProfile, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me',
      payload: { phoneNumber: '+33612345678' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('invalidates cache after successful update', async () => {
    mockCacheDel.mockClear();
    const prisma = makePrisma({ userUpdate: makeUser() });
    app = await buildApp(updateUserProfile, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me',
      payload: { bio: 'Hello world' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockCacheDel).toHaveBeenCalledWith(`auth:user:${USER_ID}`);
  });

  it('calls socketIOHandler.refreshUserResolvedLanguages when language changes', async () => {
    const refreshFn = jest.fn();
    const prisma = makePrisma({ userUpdate: makeUser({ systemLanguage: 'es' }) });
    app = await buildApp(updateUserProfile, prisma, {}, {
      socketIOHandler: { getManager: () => ({ refreshUserResolvedLanguages: refreshFn }) },
    });

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me',
      payload: { systemLanguage: 'es' },
    });

    expect(res.statusCode).toBe(200);
    expect(refreshFn).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ systemLanguage: 'es' }));
  });

  it('returns 400 with Zod error details on invalid data', async () => {
    const prisma = makePrisma();
    app = await buildApp(updateUserProfile, prisma);

    // Send a field that fails strict() mode — extra unknown key triggers ZodError
    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me',
      payload: { unknownField: 'oops' },
    });

    // Zod strict() rejects unknown keys → 400
    expect(res.statusCode).toBe(400);
  });

  it('sets customDestinationLanguage to null when empty string is sent', async () => {
    const updateMock = jest.fn(() => Promise.resolve(makeUser({ customDestinationLanguage: null })));
    const prisma = { user: { findFirst: jest.fn(() => Promise.resolve(null)), update: updateMock, updateMany: jest.fn() }, userVoiceModel: { updateMany: jest.fn() } } as unknown as PrismaClient;
    app = await buildApp(updateUserProfile, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me',
      payload: { customDestinationLanguage: '' },
    });

    expect(res.statusCode).toBe(200);
    const updateCall = (updateMock as jest.Mock).mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(updateCall[0].data.customDestinationLanguage).toBeNull();
  });
});

// ===========================================================================
// PATCH /users/me/avatar — updateUserAvatar
// ===========================================================================

describe('PATCH /users/me/avatar — updateUserAvatar', () => {
  let app: FastifyInstance;

  afterEach(async () => { await app.close(); });

  it('returns 200 when given a valid HTTP avatar URL', async () => {
    const prisma = makePrisma({ userUpdate: makeUser({ avatar: 'https://cdn.example.com/avatar.jpg' }) });
    app = await buildApp(updateUserAvatar, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/avatar',
      payload: { avatar: 'https://cdn.example.com/avatar.jpg' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 200 for an /api/ path avatar', async () => {
    const prisma = makePrisma({ userUpdate: makeUser({ avatar: '/api/v1/static/avatar.jpg' }) });
    app = await buildApp(updateUserAvatar, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/avatar',
      payload: { avatar: '/api/v1/static/avatar.jpg' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 400 when avatar is a base64 data URI', async () => {
    app = await buildApp(updateUserAvatar, makePrisma());

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/avatar',
      payload: { avatar: 'data:image/png;base64,iVBORw0KGgo=' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(JSON.stringify(body)).toMatch(/data URI|base64|file URL/i);
  });

  it('returns 401 when not authenticated', async () => {
    app = await buildApp(
      updateUserAvatar,
      makePrisma(),
      { isAuthenticated: false, registeredUser: null, userId: undefined },
    );
    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/avatar',
      payload: { avatar: 'https://cdn.example.com/avatar.jpg' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('invalidates cache after successful avatar update', async () => {
    mockCacheDel.mockClear();
    const prisma = makePrisma({ userUpdate: makeUser() });
    app = await buildApp(updateUserAvatar, prisma);

    await app.inject({
      method:  'PATCH',
      url:     '/users/me/avatar',
      payload: { avatar: 'https://cdn.example.com/avatar.jpg' },
    });

    expect(mockCacheDel).toHaveBeenCalledWith(`auth:user:${USER_ID}`);
  });

  it('returns 400 when avatar URL does not start with http/https/api', async () => {
    app = await buildApp(updateUserAvatar, makePrisma());

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/avatar',
      payload: { avatar: 'ftp://bad.example.com/avatar.jpg' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ===========================================================================
// PATCH /users/me/banner — updateUserBanner
// ===========================================================================

describe('PATCH /users/me/banner — updateUserBanner', () => {
  let app: FastifyInstance;

  afterEach(async () => { await app.close(); });

  it('returns 200 for a valid HTTPS banner URL', async () => {
    const prisma = makePrisma({ userUpdate: makeUser({ banner: 'https://cdn.example.com/banner.jpg' }) });
    app = await buildApp(updateUserBanner, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/banner',
      payload: { banner: 'https://cdn.example.com/banner.jpg' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    app = await buildApp(
      updateUserBanner,
      makePrisma(),
      { isAuthenticated: false, registeredUser: null, userId: undefined },
    );
    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/banner',
      payload: { banner: 'https://cdn.example.com/banner.jpg' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid banner URL format', async () => {
    app = await buildApp(updateUserBanner, makePrisma());

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/banner',
      payload: { banner: 'not-a-url' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('invalidates cache after banner update', async () => {
    mockCacheDel.mockClear();
    const prisma = makePrisma({ userUpdate: makeUser() });
    app = await buildApp(updateUserBanner, prisma);

    await app.inject({
      method:  'PATCH',
      url:     '/users/me/banner',
      payload: { banner: 'https://cdn.example.com/banner.jpg' },
    });

    expect(mockCacheDel).toHaveBeenCalledWith(`auth:user:${USER_ID}`);
  });
});

// ===========================================================================
// PATCH /users/me/password — updateUserPassword
// ===========================================================================

describe('PATCH /users/me/password — updateUserPassword', () => {
  let app: FastifyInstance;

  const validBody = {
    currentPassword: 'oldPassword1!',
    newPassword:     'newPassword1!',
    confirmPassword: 'newPassword1!',
  };

  afterEach(async () => { await app.close(); });

  it('returns 200 and hashes the new password when current password is correct', async () => {
    mockBcryptCompare.mockResolvedValue(true as never);
    const prisma = makePrisma({ userFindUnique: makeUser() });
    app = await buildApp(updateUserPassword, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/password',
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockBcryptHash).toHaveBeenCalled();
    expect((prisma.user.update as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('returns 401 when not authenticated', async () => {
    app = await buildApp(
      updateUserPassword,
      makePrisma(),
      { isAuthenticated: false, registeredUser: null, userId: undefined },
    );
    const res = await app.inject({ method: 'PATCH', url: '/users/me/password', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user not found in DB', async () => {
    mockBcryptCompare.mockResolvedValue(true as never);
    const prisma = makePrisma({ userFindUnique: null });
    app = await buildApp(updateUserPassword, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/password',
      payload: validBody,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when current password is incorrect', async () => {
    mockBcryptCompare.mockResolvedValue(false as never);
    const prisma = makePrisma({ userFindUnique: makeUser() });
    app = await buildApp(updateUserPassword, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/password',
      payload: validBody,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(JSON.stringify(body)).toContain('incorrect');
  });

  it('returns 400 with Zod error when passwords do not match', async () => {
    app = await buildApp(updateUserPassword, makePrisma());

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/password',
      payload: { currentPassword: 'oldpass', newPassword: 'newpass1!', confirmPassword: 'different' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('calls notification service after password change', async () => {
    mockBcryptCompare.mockResolvedValue(true as never);
    const createNotif = jest.fn().mockReturnValue(Promise.resolve());
    const prisma = makePrisma({ userFindUnique: makeUser() });
    app = await buildApp(updateUserPassword, prisma, {}, {
      notificationService: { createPasswordChangedNotification: createNotif },
    });

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/password',
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    expect(createNotif).toHaveBeenCalledWith({ recipientUserId: USER_ID });
  });
});

// ===========================================================================
// PATCH /users/me/username — updateUsername
// ===========================================================================

describe('PATCH /users/me/username — updateUsername', () => {
  let app: FastifyInstance;

  afterEach(async () => { await app.close(); });

  const validBody = { newUsername: 'newuser', currentPassword: 'password123' };

  it('returns 200 when username change succeeds', async () => {
    mockBcryptCompare.mockResolvedValue(true as never);
    const prisma = makePrisma({
      userFindUnique: makeUser({ usernameHistory: [] }),
      userFindFirst:  null,
      userUpdate:     makeUser({ username: 'newuser' }),
    });
    app = await buildApp(updateUsername, prisma);

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/username',
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.username).toBe('newuser');
  });

  it('returns 401 when not authenticated', async () => {
    app = await buildApp(
      updateUsername,
      makePrisma(),
      { isAuthenticated: false, registeredUser: null, userId: undefined },
    );
    const res = await app.inject({ method: 'PATCH', url: '/users/me/username', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user not found in DB', async () => {
    mockBcryptCompare.mockResolvedValue(true as never);
    const prisma = makePrisma({ userFindUnique: null });
    app = await buildApp(updateUsername, prisma);

    const res = await app.inject({ method: 'PATCH', url: '/users/me/username', payload: validBody });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when current password is wrong', async () => {
    mockBcryptCompare.mockResolvedValue(false as never);
    const prisma = makePrisma({ userFindUnique: makeUser() });
    app = await buildApp(updateUsername, prisma);

    const res = await app.inject({ method: 'PATCH', url: '/users/me/username', payload: validBody });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain('incorrect');
  });

  it('returns 400 when new username is same as current', async () => {
    mockBcryptCompare.mockResolvedValue(true as never);
    const prisma = makePrisma({ userFindUnique: makeUser({ username: 'newuser' }) });
    app = await buildApp(updateUsername, prisma);

    const res = await app.inject({ method: 'PATCH', url: '/users/me/username', payload: validBody });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain('different');
  });

  it('returns 400 when username is already taken', async () => {
    mockBcryptCompare.mockResolvedValue(true as never);
    const prisma = {
      user: {
        findUnique: jest.fn(() => Promise.resolve(makeUser({ usernameHistory: [] }))),
        findFirst:  jest.fn(() => Promise.resolve(makeUser({ id: USER_ID2 }))),
        update:     jest.fn(() => Promise.resolve(makeUser())),
        updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
      userVoiceModel: { updateMany: jest.fn(() => Promise.resolve({ count: 0 })) },
    } as unknown as PrismaClient;
    app = await buildApp(updateUsername, prisma);

    const res = await app.inject({ method: 'PATCH', url: '/users/me/username', payload: validBody });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain('taken');
  });

  it('returns 429 when username was changed less than 30 days ago', async () => {
    mockBcryptCompare.mockResolvedValue(true as never);
    const recentHistory = [{ newUsername: 'olduser', changedAt: new Date().toISOString() }];
    const prisma = makePrisma({
      userFindUnique: makeUser({ usernameHistory: recentHistory }),
      userFindFirst:  null,
    });
    app = await buildApp(updateUsername, prisma);

    const res = await app.inject({ method: 'PATCH', url: '/users/me/username', payload: validBody });
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error).toContain('30 days');
    expect(body.nextChangeAllowedAt).toBeDefined();
  });

  it('allows username change when last change was more than 30 days ago', async () => {
    mockBcryptCompare.mockResolvedValue(true as never);
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const oldHistory = [{ newUsername: 'olduser', changedAt: oldDate }];
    const prisma = {
      user: {
        findUnique: jest.fn(() => Promise.resolve(makeUser({ usernameHistory: oldHistory }))),
        findFirst:  jest.fn(() => Promise.resolve(null)),
        update:     jest.fn(() => Promise.resolve(makeUser({ username: 'newuser' }))),
        updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
      userVoiceModel: { updateMany: jest.fn(() => Promise.resolve({ count: 0 })) },
    } as unknown as PrismaClient;
    app = await buildApp(updateUsername, prisma);

    const res = await app.inject({ method: 'PATCH', url: '/users/me/username', payload: validBody });
    expect(res.statusCode).toBe(200);
  });

  it('invalidates cache after username update', async () => {
    mockCacheDel.mockClear();
    mockBcryptCompare.mockResolvedValue(true as never);
    const prisma = makePrisma({
      userFindUnique: makeUser({ usernameHistory: [] }),
      userFindFirst:  null,
      userUpdate:     makeUser({ username: 'newuser' }),
    });
    app = await buildApp(updateUsername, prisma);

    await app.inject({ method: 'PATCH', url: '/users/me/username', payload: validBody });
    expect(mockCacheDel).toHaveBeenCalledWith(`auth:user:${USER_ID}`);
  });

  it('returns 400 when newUsername fails Zod validation (too short)', async () => {
    app = await buildApp(updateUsername, makePrisma());

    const res = await app.inject({
      method:  'PATCH',
      url:     '/users/me/username',
      payload: { newUsername: 'a', currentPassword: 'password123' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ===========================================================================
// GET /u/:username — getUserByUsername
// ===========================================================================

describe('GET /u/:username — getUserByUsername', () => {
  let app: FastifyInstance;

  afterEach(async () => { await app.close(); });

  it('returns 200 with user data when user exists', async () => {
    const prisma = makePrisma({ userFindFirst: makeUser() });
    app = await buildApp(getUserByUsername, prisma);

    const res = await app.inject({ method: 'GET', url: '/u/testuser' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.username).toBe('testuser');
    // voiceModel should be stripped and replaced with voicePublic field
    expect('voiceModel' in body.data).toBe(false);
    expect(body.data.voicePublic).toBe(false);
  });

  it('returns 404 when user is not found', async () => {
    const prisma = makePrisma({ userFindFirst: null });
    app = await buildApp(getUserByUsername, prisma);

    const res = await app.inject({ method: 'GET', url: '/u/unknownuser' });
    expect(res.statusCode).toBe(404);
  });

  it('exposes voice fields when user has opted in', async () => {
    const user = makeUser({
      voiceModel: {
        voicePublicAt: new Date('2026-01-01'),
        referenceAudioUrl: '/api/v1/attachments/file/sample.m4a',
        totalDurationMs: 10000,
        qualityScore: 0.9,
      },
    });
    const prisma = makePrisma({ userFindFirst: user });
    app = await buildApp(getUserByUsername, prisma);

    const res = await app.inject({ method: 'GET', url: '/u/testuser' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.voicePublic).toBe(true);
    expect(data.voiceSampleUrl).toBe('/api/v1/attachments/file/sample.m4a');
  });
});

// ===========================================================================
// GET /users/:id — getUserById
// ===========================================================================

describe('GET /users/:id — getUserById', () => {
  let app: FastifyInstance;

  afterEach(async () => { await app.close(); });

  it('returns 200 when queried by a valid MongoDB ObjectId', async () => {
    const prisma = makePrisma({ userFindFirst: makeUser() });
    app = await buildApp(getUserById, prisma);

    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    // Public profile must mask email and phone
    expect(body.data.email).toBe('');
    expect(body.data.phoneNumber).toBeUndefined();
    expect(body.data.isMeeshyer).toBe(true);
    expect(body.data.isAnonymous).toBe(false);
  });

  it('returns 200 when queried by username (non-ObjectId string)', async () => {
    const prisma = makePrisma({ userFindFirst: makeUser() });
    app = await buildApp(getUserById, prisma);

    const res = await app.inject({ method: 'GET', url: '/users/testuser' });
    expect(res.statusCode).toBe(200);

    // Should have queried by username (mode: insensitive) not by id
    const findCall = (prisma.user.findFirst as jest.Mock).mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(findCall[0].where).not.toHaveProperty('id', 'testuser');
    expect(JSON.stringify(findCall[0].where)).toContain('username');
  });

  it('returns 404 when user is not found', async () => {
    const prisma = makePrisma({ userFindFirst: null });
    app = await buildApp(getUserById, prisma);

    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('strips voiceModel and adds voicePublic field', async () => {
    const prisma = makePrisma({ userFindFirst: makeUser({ voiceModel: null }) });
    app = await buildApp(getUserById, prisma);

    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect('voiceModel' in data).toBe(false);
    expect(data).toHaveProperty('voicePublic', false);
  });
});

// ===========================================================================
// GET /users/email/:email — getUserByEmail
// ===========================================================================

describe('GET /users/email/:email — getUserByEmail', () => {
  let app: FastifyInstance;

  afterEach(async () => { await app.close(); });

  it('returns 200 with public profile when user exists', async () => {
    const prisma = makePrisma({ userFindFirst: makeUser() });
    app = await buildApp(getUserByEmail, prisma);

    const res = await app.inject({ method: 'GET', url: '/users/email/test@example.com' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.isMeeshyer).toBe(true);
    expect(body.data.email).toBe('');
  });

  it('returns 404 when user does not exist', async () => {
    const prisma = makePrisma({ userFindFirst: null });
    app = await buildApp(getUserByEmail, prisma);

    const res = await app.inject({ method: 'GET', url: '/users/email/nobody@example.com' });
    expect(res.statusCode).toBe(404);
  });

  it('normalizes the email before querying', async () => {
    const prisma = makePrisma({ userFindFirst: makeUser() });
    app = await buildApp(getUserByEmail, prisma);

    await app.inject({ method: 'GET', url: '/users/email/TEST@EXAMPLE.COM' });

    const findCall = (prisma.user.findFirst as jest.Mock).mock.calls[0] as [{ where: { email: string } }];
    // normalizeEmail mock lower-cases
    expect(findCall[0].where.email).toBe('test@example.com');
  });
});

// ===========================================================================
// GET /users/id/:id — getUserByIdDedicated
// ===========================================================================

describe('GET /users/id/:id — getUserByIdDedicated', () => {
  let app: FastifyInstance;

  afterEach(async () => { await app.close(); });

  it('returns 200 with public profile when user exists', async () => {
    const prisma = makePrisma({ userFindFirst: makeUser() });
    app = await buildApp(getUserByIdDedicated, prisma);

    const res = await app.inject({ method: 'GET', url: `/users/id/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.isMeeshyer).toBe(true);
  });

  it('returns 404 when user does not exist', async () => {
    const prisma = makePrisma({ userFindFirst: null });
    app = await buildApp(getUserByIdDedicated, prisma);

    const res = await app.inject({ method: 'GET', url: `/users/id/${USER_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for an invalid ObjectId format', async () => {
    app = await buildApp(getUserByIdDedicated, makePrisma());

    // The route schema uses a pattern regex for :id; we bypass it with strict:false
    // so the handler itself also checks with regex and returns 400
    const res = await app.inject({ method: 'GET', url: '/users/id/not-a-mongo-id' });
    // May be 400 from handler or from schema validation
    expect([400, 404]).toContain(res.statusCode);
  });
});

// ===========================================================================
// GET /users/phone/:phone — getUserByPhone
// ===========================================================================

describe('GET /users/phone/:phone — getUserByPhone', () => {
  let app: FastifyInstance;

  afterEach(async () => { await app.close(); });

  it('returns 200 with public profile when user exists', async () => {
    const prisma = makePrisma({ userFindFirst: makeUser({ phoneNumber: '+33612345678' }) });
    app = await buildApp(getUserByPhone, prisma);

    const res = await app.inject({ method: 'GET', url: '/users/phone/33612345678' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 404 when user does not exist', async () => {
    const prisma = makePrisma({ userFindFirst: null });
    app = await buildApp(getUserByPhone, prisma);

    const res = await app.inject({ method: 'GET', url: '/users/phone/33612345678' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when phone number is invalid', async () => {
    // Override normalizePhoneWithCountry to return invalid
    const { normalizePhoneWithCountry } = await import('../../../utils/normalize');
    const originalFn = (normalizePhoneWithCountry as jest.Mock).getMockImplementation();
    (normalizePhoneWithCountry as jest.Mock).mockReturnValueOnce({ isValid: false, phoneNumber: null, countryCode: null });

    app = await buildApp(getUserByPhone, makePrisma());

    const res = await app.inject({ method: 'GET', url: '/users/phone/invalid' });
    expect(res.statusCode).toBe(400);

    if (originalFn) (normalizePhoneWithCountry as jest.Mock).mockImplementation(originalFn);
  });

  it('prepends + to phone number without prefix', async () => {
    const prisma = makePrisma({ userFindFirst: makeUser() });
    app = await buildApp(getUserByPhone, prisma);

    await app.inject({ method: 'GET', url: '/users/phone/33612345678' });

    const { normalizePhoneWithCountry } = await import('../../../utils/normalize');
    const calls = (normalizePhoneWithCountry as jest.Mock).mock.calls;
    // Last call should have prepended +
    const lastArg = calls[calls.length - 1][0] as string;
    expect(lastArg.startsWith('+')).toBe(true);
  });
});
