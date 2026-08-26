/**
 * Serialization-path tests for PATCH /users/me/avatar and PATCH /users/me/banner.
 *
 * profile.test.ts mocks BOTH filters on the response path
 * (`@meeshy/shared/types/api-schemas` → `userSchema: {}` and
 * `routes/auth/types` → `formatUserResponse` as a passthrough spread), so its
 * `toHaveProperty('emailVerifiedAt')` assertions pass regardless of whether the
 * real `userSchema` declares that field and regardless of whether the route
 * even calls `formatUserResponse` — they lock the removal of the manual
 * Prisma `select`, not the routing through the allowlist + Fastify
 * serializer. See reference_fastify_response_schema_truncates_unlisted_fields
 * (a `{}` sub-schema in fast-json-stringify lets everything through,
 * including `password`).
 *
 * This file exercises the REAL `userSchema` (Fastify response serialization)
 * and the REAL `formatUserResponse` (allowlist) together, so a regression on
 * either barrier — `userSchema` dropping a declared field, or
 * `formatUserResponse` starting to leak a secret — turns a test here red.
 * It is kept separate from profile.test.ts on purpose: that file's other 57
 * tests read response bodies shaped by the mocked passthrough and would
 * break if these two modules stopped being mocked in place.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks — everything EXCEPT the response-serialization path ────────────────
// (`@meeshy/shared/types/api-schemas` and `routes/auth/types` are deliberately
// left unmocked so `userSchema` and `formatUserResponse` run for real.)

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../middleware/auth', () => ({
  authUserCacheKey: jest.fn((id: string) => `auth:user:${id}`),
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  updateUserProfileSchema: { parse: jest.fn((b: any) => b) },
  updateAvatarSchema: { parse: jest.fn((b: any) => b) },
  updateBannerSchema: { parse: jest.fn((b: any) => b) },
  updatePasswordSchema: { parse: jest.fn((b: any) => b) },
  updateUsernameSchema: { parse: jest.fn((b: any) => b) },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { updateUserAvatar, updateUserBanner } from '../../../../routes/users/profile';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// A full Prisma `User` row — including secrets that the allowlist must never
// forward, and fields that `userSchema` declares but that a narrow manual
// `select` used to drop.
const fullUser = {
  id: USER_ID,
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  email: 'alice@example.com',
  phoneNumber: '+33612345678',
  avatar: 'https://example.com/avatar.jpg',
  banner: 'https://example.com/banner.jpg',
  bio: 'Hello world',
  role: 'USER',
  isActive: true,
  deactivatedAt: null,
  isOnline: true,
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: null,
  autoTranslateEnabled: true,
  lastActiveAt: new Date('2024-01-01'),
  emailVerifiedAt: new Date('2024-02-01'),
  phoneVerifiedAt: null,
  twoFactorEnabledAt: null,
  pendingEmail: null,
  pendingPhone: null,
  lastPasswordChange: null,
  lastLoginIp: null,
  lastLoginLocation: null,
  lastLoginDevice: null,
  profileCompletionRate: 80,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  // Secrets — must never reach the response body.
  password: '$2b$12$hashedpassword',
  signalIdentityKeyPublic: 'pub-key-material',
  signalIdentityKeyPrivate: 'private-key-material',
};

// ─── App Builder ─────────────────────────────────────────────────────────────

async function buildApp(routes: Array<(f: FastifyInstance) => Promise<void>>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.decorate('prisma', {
    user: { update: jest.fn<any>().mockResolvedValue(fullUser) },
  } as any);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
    (req as any).user = { userId: USER_ID };
  });
  app.decorate('notificationService', null as any);
  app.decorate('socketIOHandler', null as any);

  for (const route of routes) {
    await route(app);
  }

  await app.ready();
  return app;
}

// ─── PATCH /users/me/avatar — real serialization path ─────────────────────────

describe('PATCH /users/me/avatar — real userSchema + formatUserResponse', () => {
  it('serializes emailVerifiedAt and autoTranslateEnabled, and never leaks password', async () => {
    const app = await buildApp([updateUserAvatar]);
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/avatar',
      payload: { avatar: 'https://example.com/avatar.jpg' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user).toHaveProperty('emailVerifiedAt');
    expect(body.data.user.autoTranslateEnabled).toBe(true);
    expect(body.data.user).not.toHaveProperty('password');
    await app.close();
  });
});

// ─── PATCH /users/me/banner — real serialization path ─────────────────────────

describe('PATCH /users/me/banner — real userSchema + formatUserResponse', () => {
  it('serializes emailVerifiedAt and autoTranslateEnabled, and never leaks password', async () => {
    const app = await buildApp([updateUserBanner]);
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/banner',
      payload: { banner: 'https://example.com/banner.jpg' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user).toHaveProperty('emailVerifiedAt');
    expect(body.data.user.autoTranslateEnabled).toBe(true);
    expect(body.data.user).not.toHaveProperty('password');
    await app.close();
  });
});
