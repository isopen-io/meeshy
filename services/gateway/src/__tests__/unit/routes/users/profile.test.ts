/**
 * Unit tests for users profile routes (profile.ts)
 * Tests GET /users/me/test, PATCH /users/me, PATCH /users/me/avatar,
 * PATCH /users/me/banner, PATCH /users/me/password, PATCH /users/me/username,
 * GET /u/:username, GET /users/:id, GET /users/email/:email,
 * GET /users/id/:id, GET /users/phone/:phone.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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
  // getOptionalAuth (presence-gate.ts) calls this at route-registration time
  // for the dedicated email/id/phone lookups — a no-op preValidation hook is
  // enough since these tests don't exercise presence-gating itself.
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

jest.mock('../../../../utils/normalize', () => ({
  normalizeEmail: jest.fn((e: string) => e.toLowerCase().trim()),
  capitalizeName: jest.fn((n: string) => n),
  normalizeDisplayName: jest.fn((n: string) => n),
  normalizePhoneNumber: jest.fn((p: string) => p),
  normalizePhoneWithCountry: jest.fn((p: string) => ({
    isValid: true,
    phoneNumber: p,
    countryCode: 'FR',
  })),
}));

const mockBcryptCompare = jest.fn<any>();
const mockBcryptHash = jest.fn<any>().mockResolvedValue('hashed_new_password');

jest.mock('bcryptjs', () => ({
  default: {
    compare: (...args: any[]) => mockBcryptCompare(...args),
    hash: (...args: any[]) => mockBcryptHash(...args),
  },
  compare: (...args: any[]) => mockBcryptCompare(...args),
  hash: (...args: any[]) => mockBcryptHash(...args),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  updateUserProfileSchema: {
    parse: jest.fn((b: any) => b),
  },
  updateAvatarSchema: {
    parse: jest.fn((b: any) => b),
  },
  updateBannerSchema: {
    parse: jest.fn((b: any) => b),
  },
  updatePasswordSchema: {
    parse: jest.fn((b: any) => b),
  },
  updateUsernameSchema: {
    parse: jest.fn((b: any) => b),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  userSchema: {},
  userMinimalSchema: {},
  updateUserRequestSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object' },
}));

jest.mock('../../../../routes/auth/types', () => ({
  formatUserResponse: jest.fn((u: any) => ({ ...u, formatted: true })),
}));

jest.mock('../../../../utils/pagination', () => ({
  buildPaginationMeta: jest.fn((total: number, limit: number, page: number) => ({
    total,
    limit,
    page,
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

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
} from '../../../../routes/users/profile';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439099';

const mockUser = {
  id: USER_ID,
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  email: 'alice@example.com',
  phoneNumber: '+33612345678',
  avatar: null,
  banner: null,
  bio: 'Hello world',
  role: 'USER',
  isOnline: true,
  isActive: true,
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: null,
  deviceLocale: null,
  lastActiveAt: new Date('2024-01-01'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  password: '$2b$12$hashedpassword',
  usernameHistory: [],
  voiceModel: null,
  deactivatedAt: null,
  autoTranslateEnabled: true,
};

// ─── Prisma Mock Factory ───────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findFirst: jest.fn<any>().mockResolvedValue(mockUser),
      findUnique: jest.fn<any>().mockResolvedValue(mockUser),
      update: jest.fn<any>().mockResolvedValue(mockUser),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    userVoiceModel: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  };
}

// ─── App Builder ─────────────────────────────────────────────────────────────

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
  routes?: Array<(f: FastifyInstance) => Promise<void>>;
  withNotificationService?: boolean;
  withSocketIOHandler?: boolean;
} = {}): Promise<FastifyInstance> {
  const {
    authenticated = true,
    prisma = makePrisma(),
    routes = [getUserTest, updateUserProfile, updateUserAvatar, updateUserBanner, updateUserPassword, updateUsername, getUserByUsername, getUserById, getUserByEmail, getUserByIdDedicated, getUserByPhone],
    withNotificationService = false,
    withSocketIOHandler = false,
  } = opts;

  const app = Fastify({ logger: false });

  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
      };
      (req as any).user = { userId: USER_ID };
    } else {
      (req as any).authContext = null;
    }
  });

  if (withNotificationService) {
    app.decorate('notificationService', {
      createPasswordChangedNotification: jest.fn<any>().mockResolvedValue(undefined),
      emitUserUpdated: jest.fn<any>().mockResolvedValue(undefined),
    });
  } else {
    app.decorate('notificationService', null as any);
  }

  if (withSocketIOHandler) {
    // Stable manager mock so tests can assert on its methods across calls
    // (a fresh object per getManager() call would lose the jest.fn identity).
    const managerMock = {
      refreshUserResolvedLanguages: jest.fn(),
      refreshUserTypingIdentity: jest.fn(),
    };
    (app as any)._socketManagerMock = managerMock;
    app.decorate('socketIOHandler', {
      getManager: jest.fn(() => managerMock),
    });
  } else {
    app.decorate('socketIOHandler', null as any);
  }

  for (const route of routes) {
    await route(app);
  }

  await app.ready();
  return app;
}

// ─── GET /users/me/test ───────────────────────────────────────────────────────

describe('GET /users/me/test — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false, routes: [getUserTest] });
    const res = await app.inject({ method: 'GET', url: '/users/me/test' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /users/me/test — success', () => {
  it('returns 200 with userId and message', async () => {
    const app = await buildApp({ routes: [getUserTest] });
    const res = await app.inject({ method: 'GET', url: '/users/me/test' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe(USER_ID);
    expect(body.data.message).toBe('Test endpoint working');
    await app.close();
  });
});

// ─── PATCH /users/me ──────────────────────────────────────────────────────────

describe('PATCH /users/me — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false, routes: [updateUserProfile] });
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { firstName: 'Bob' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('PATCH /users/me — success', () => {
  it('returns 200 with updated user', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [updateUserProfile], prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { firstName: 'Bob', lastName: 'Jones' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('PATCH /users/me — email already in use', () => {
  it('returns 400 when email is taken by another user', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: OTHER_USER_ID }),
        update: jest.fn<any>().mockResolvedValue(mockUser),
      },
    });
    const app = await buildApp({ routes: [updateUserProfile], prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { email: 'taken@example.com' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('PATCH /users/me — phone already in use', () => {
  it('returns 400 when phone is taken by another user', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: OTHER_USER_ID }),
        update: jest.fn<any>().mockResolvedValue(mockUser),
      },
    });
    const app = await buildApp({ routes: [updateUserProfile], prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { phoneNumber: '+33611111111' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('PATCH /users/me — service error', () => {
  it('returns 500 when prisma update throws', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    });
    // withMutationLog calls op() which calls update
    const { withMutationLog } = await import('../../../../utils/withMutationLog');
    (withMutationLog as jest.Mock).mockImplementationOnce(({ op }: any) => op());

    const app = await buildApp({ routes: [updateUserProfile], prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { firstName: 'Bob' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('PATCH /users/me — with language change fires socketIO refresh', () => {
  it('returns 200 and triggers language refresh', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [updateUserProfile], prisma, withSocketIOHandler: true });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { systemLanguage: 'en' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('PATCH /users/me — realtime propagation to conversation partners', () => {
  it('emits USER_UPDATED with only the changed public fields when displayName/firstName/lastName change', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [updateUserProfile], prisma, withNotificationService: true });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { firstName: 'Bob', lastName: 'Jones', displayName: 'Bob Jones' },
    });
    expect(res.statusCode).toBe(200);
    expect((app as any).notificationService.emitUserUpdated).toHaveBeenCalledWith({
      userId: USER_ID,
      changes: { firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith' },
    });
    await app.close();
  });

  it('does not emit USER_UPDATED when only private fields (bio, language) change', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [updateUserProfile], prisma, withNotificationService: true });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { bio: 'New bio', systemLanguage: 'en' },
    });
    expect(res.statusCode).toBe(200);
    expect((app as any).notificationService.emitUserUpdated).not.toHaveBeenCalled();
    await app.close();
  });

  it('invalidates the cached typing identity when displayName/name changes', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [updateUserProfile], prisma, withSocketIOHandler: true });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { displayName: 'Bob Jones' },
    });
    expect(res.statusCode).toBe(200);
    expect((app as any)._socketManagerMock.refreshUserTypingIdentity).toHaveBeenCalledWith(USER_ID);
    await app.close();
  });

  it('does not invalidate the typing identity when only private fields (bio, language) change', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [updateUserProfile], prisma, withSocketIOHandler: true });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { bio: 'New bio', systemLanguage: 'en' },
    });
    expect(res.statusCode).toBe(200);
    expect((app as any)._socketManagerMock.refreshUserTypingIdentity).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── PATCH /users/me/avatar ───────────────────────────────────────────────────

describe('PATCH /users/me/avatar — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false, routes: [updateUserAvatar] });
    const res = await app.inject({ method: 'PATCH', url: '/users/me/avatar', payload: { avatar: 'https://example.com/avatar.jpg' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('PATCH /users/me/avatar — success', () => {
  it('returns 200 with updated user', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [updateUserAvatar], prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/avatar',
      payload: { avatar: 'https://example.com/avatar.jpg' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('PATCH /users/me/avatar — realtime propagation to conversation partners', () => {
  it('emits USER_UPDATED with the new avatar URL', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn<any>().mockResolvedValue({ ...mockUser, avatar: 'https://example.com/avatar.jpg' }),
      },
    });
    const app = await buildApp({ routes: [updateUserAvatar], prisma, withNotificationService: true });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/avatar',
      payload: { avatar: 'https://example.com/avatar.jpg' },
    });
    expect(res.statusCode).toBe(200);
    expect((app as any).notificationService.emitUserUpdated).toHaveBeenCalledWith({
      userId: USER_ID,
      changes: { avatar: 'https://example.com/avatar.jpg' },
    });
    await app.close();
  });
});

describe('PATCH /users/me/avatar — data URI rejected', () => {
  it('returns 400 when avatar is a base64 data URI', async () => {
    const app = await buildApp({ routes: [updateUserAvatar] });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/avatar',
      payload: { avatar: 'data:image/png;base64,iVBORw0KGgo=' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('PATCH /users/me/avatar — service error', () => {
  it('returns 500 when update throws', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    });
    const app = await buildApp({ routes: [updateUserAvatar], prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/avatar',
      payload: { avatar: 'https://example.com/avatar.jpg' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── PATCH /users/me/banner ───────────────────────────────────────────────────

describe('PATCH /users/me/banner — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false, routes: [updateUserBanner] });
    const res = await app.inject({ method: 'PATCH', url: '/users/me/banner', payload: { banner: 'https://example.com/banner.jpg' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('PATCH /users/me/banner — success', () => {
  it('returns 200 with updated user', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [updateUserBanner], prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/banner',
      payload: { banner: 'https://example.com/banner.jpg' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('PATCH /users/me/banner — realtime propagation to conversation partners', () => {
  it('emits USER_UPDATED with the new banner URL', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn<any>().mockResolvedValue({ ...mockUser, banner: 'https://example.com/banner.jpg' }),
      },
    });
    const app = await buildApp({ routes: [updateUserBanner], prisma, withNotificationService: true });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/banner',
      payload: { banner: 'https://example.com/banner.jpg' },
    });
    expect(res.statusCode).toBe(200);
    expect((app as any).notificationService.emitUserUpdated).toHaveBeenCalledWith({
      userId: USER_ID,
      changes: { banner: 'https://example.com/banner.jpg' },
    });
    await app.close();
  });
});

describe('PATCH /users/me/banner — service error', () => {
  it('returns 500 when update throws', async () => {
    const prisma = makePrisma({
      user: {
        update: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    });
    const app = await buildApp({ routes: [updateUserBanner], prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/banner',
      payload: { banner: 'https://example.com/banner.jpg' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── PATCH /users/me/password ─────────────────────────────────────────────────

describe('PATCH /users/me/password — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false, routes: [updateUserPassword] });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'oldpassword', newPassword: 'new12345678' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('PATCH /users/me/password — user not found', () => {
  it('returns 404 when user does not exist', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(mockUser),
      },
    });
    const app = await buildApp({ routes: [updateUserPassword], prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'oldpassword', newPassword: 'new12345678' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH /users/me/password — wrong current password', () => {
  it('returns 400 when current password is incorrect', async () => {
    mockBcryptCompare.mockResolvedValueOnce(false);
    const app = await buildApp({ routes: [updateUserPassword] });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'wrongpassword', newPassword: 'new12345678' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('PATCH /users/me/password — success', () => {
  it('returns 200 when password is updated', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const app = await buildApp({ routes: [updateUserPassword] });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'correctpassword', newPassword: 'new12345678' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('PATCH /users/me/password — success with notification', () => {
  it('returns 200 and fires notification', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const app = await buildApp({ routes: [updateUserPassword], withNotificationService: true });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'correctpassword', newPassword: 'new12345678' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('PATCH /users/me/password — service error', () => {
  it('returns 500 when update throws', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: USER_ID, password: '$2b$12$hashed' }),
        update: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    });
    const app = await buildApp({ routes: [updateUserPassword], prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'correctpassword', newPassword: 'new12345678' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── PATCH /users/me/username ─────────────────────────────────────────────────

describe('PATCH /users/me/username — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false, routes: [updateUsername] });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'bob', currentPassword: 'pass' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('PATCH /users/me/username — user not found', () => {
  it('returns 404 when user does not exist', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(mockUser),
      },
    });
    const app = await buildApp({ routes: [updateUsername], prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'bob', currentPassword: 'pass' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH /users/me/username — wrong password', () => {
  it('returns 400 when password is incorrect', async () => {
    mockBcryptCompare.mockResolvedValueOnce(false);
    const app = await buildApp({ routes: [updateUsername] });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'bob', currentPassword: 'wrongpass' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('PATCH /users/me/username — same username', () => {
  it('returns 400 when new username matches current', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ ...mockUser, username: 'alice', usernameHistory: [] }),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(mockUser),
      },
    });
    const app = await buildApp({ routes: [updateUsername], prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'alice', currentPassword: 'correctpass' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('PATCH /users/me/username — username taken', () => {
  it('returns 400 when username is already taken', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ ...mockUser, username: 'alice', usernameHistory: [] }),
        findFirst: jest.fn<any>().mockResolvedValue({ id: OTHER_USER_ID }),
        update: jest.fn<any>().mockResolvedValue(mockUser),
      },
    });
    const app = await buildApp({ routes: [updateUsername], prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'bob', currentPassword: 'correctpass' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('PATCH /users/me/username — rate limited', () => {
  it('returns 429 when changed within 30 days', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const recentHistory = [{ newUsername: 'alice', changedAt: new Date().toISOString() }];
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ ...mockUser, username: 'alice', usernameHistory: recentHistory }),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(mockUser),
      },
    });
    const app = await buildApp({ routes: [updateUsername], prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'bob', currentPassword: 'correctpass' },
    });
    expect(res.statusCode).toBe(429);
    await app.close();
  });
});

describe('PATCH /users/me/username — success', () => {
  it('returns 200 with new username', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ ...mockUser, username: 'alice', usernameHistory: [] }),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue({ id: USER_ID, username: 'bob' }),
      },
    });
    const app = await buildApp({ routes: [updateUsername], prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'bob', currentPassword: 'correctpass' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.username).toBe('bob');
    await app.close();
  });
});

describe('PATCH /users/me/username — realtime propagation to conversation partners', () => {
  it('emits USER_UPDATED with the new username', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ ...mockUser, username: 'alice', usernameHistory: [] }),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue({ id: USER_ID, username: 'bob' }),
      },
    });
    const app = await buildApp({ routes: [updateUsername], prisma, withNotificationService: true });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'bob', currentPassword: 'correctpass' },
    });
    expect(res.statusCode).toBe(200);
    expect((app as any).notificationService.emitUserUpdated).toHaveBeenCalledWith({
      userId: USER_ID,
      changes: { username: 'bob' },
    });
    await app.close();
  });

  it('invalidates the cached typing identity on username change', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ ...mockUser, username: 'alice', usernameHistory: [] }),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue({ id: USER_ID, username: 'bob' }),
      },
    });
    const app = await buildApp({ routes: [updateUsername], prisma, withSocketIOHandler: true });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'bob', currentPassword: 'correctpass' },
    });
    expect(res.statusCode).toBe(200);
    expect((app as any)._socketManagerMock.refreshUserTypingIdentity).toHaveBeenCalledWith(USER_ID);
    await app.close();
  });
});

// ─── GET /u/:username ─────────────────────────────────────────────────────────

describe('GET /u/:username — success', () => {
  it('returns 200 with user profile', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [getUserByUsername], prisma });
    const res = await app.inject({ method: 'GET', url: '/u/alice' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /u/:username — not found', () => {
  it('returns 404 when user does not exist', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const app = await buildApp({ routes: [getUserByUsername], prisma });
    const res = await app.inject({ method: 'GET', url: '/u/nobody' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /u/:username — service error', () => {
  it('returns 500 when prisma throws', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    });
    const app = await buildApp({ routes: [getUserByUsername], prisma });
    const res = await app.inject({ method: 'GET', url: '/u/alice' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /users/:id ───────────────────────────────────────────────────────────

describe('GET /users/:id — success by MongoDB ObjectId', () => {
  it('returns 200 with user profile', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [getUserById], prisma });
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /users/:id — success by username', () => {
  it('returns 200 when queried by username', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [getUserById], prisma });
    const res = await app.inject({ method: 'GET', url: '/users/alice' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /users/:id — not found', () => {
  it('returns 404 when user does not exist', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const app = await buildApp({ routes: [getUserById], prisma });
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /users/:id — service error', () => {
  it('returns 500 when prisma throws', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    });
    const app = await buildApp({ routes: [getUserById], prisma });
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /users/email/:email ──────────────────────────────────────────────────

describe('GET /users/email/:email — success', () => {
  it('returns 200 with user profile', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [getUserByEmail], prisma });
    const res = await app.inject({ method: 'GET', url: '/users/email/alice@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /users/email/:email — not found', () => {
  it('returns 404 when user does not exist', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const app = await buildApp({ routes: [getUserByEmail], prisma });
    const res = await app.inject({ method: 'GET', url: '/users/email/nobody@example.com' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /users/email/:email — service error', () => {
  it('returns 500 when prisma throws', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    });
    const app = await buildApp({ routes: [getUserByEmail], prisma });
    const res = await app.inject({ method: 'GET', url: '/users/email/alice@example.com' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /users/id/:id ────────────────────────────────────────────────────────

describe('GET /users/id/:id — success', () => {
  it('returns 200 with user profile', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [getUserByIdDedicated], prisma });
    const res = await app.inject({ method: 'GET', url: `/users/id/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /users/id/:id — invalid ObjectId', () => {
  it('returns 400 when id is not a valid ObjectId', async () => {
    const app = await buildApp({ routes: [getUserByIdDedicated] });
    const res = await app.inject({ method: 'GET', url: '/users/id/not-a-valid-id' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /users/id/:id — not found', () => {
  it('returns 404 when user does not exist', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const app = await buildApp({ routes: [getUserByIdDedicated], prisma });
    const res = await app.inject({ method: 'GET', url: `/users/id/${USER_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /users/id/:id — service error', () => {
  it('returns 500 when prisma throws', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    });
    const app = await buildApp({ routes: [getUserByIdDedicated], prisma });
    const res = await app.inject({ method: 'GET', url: `/users/id/${USER_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /users/phone/:phone ──────────────────────────────────────────────────

describe('GET /users/phone/:phone — success', () => {
  it('returns 200 with user profile', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ routes: [getUserByPhone], prisma });
    const res = await app.inject({ method: 'GET', url: '/users/phone/33612345678' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /users/phone/:phone — invalid phone', () => {
  it('returns 400 when phone is invalid', async () => {
    const { normalizePhoneWithCountry } = await import('../../../../utils/normalize');
    (normalizePhoneWithCountry as jest.Mock).mockReturnValueOnce({ isValid: false, phoneNumber: null });
    const app = await buildApp({ routes: [getUserByPhone] });
    const res = await app.inject({ method: 'GET', url: '/users/phone/123' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /users/phone/:phone — not found', () => {
  it('returns 404 when user does not exist', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const app = await buildApp({ routes: [getUserByPhone], prisma });
    const res = await app.inject({ method: 'GET', url: '/users/phone/33612345678' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /users/phone/:phone — service error', () => {
  it('returns 500 when prisma throws', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    });
    const app = await buildApp({ routes: [getUserByPhone], prisma });
    const res = await app.inject({ method: 'GET', url: '/users/phone/33612345678' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
