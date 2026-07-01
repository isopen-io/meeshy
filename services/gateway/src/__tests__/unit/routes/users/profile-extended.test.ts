/**
 * Extended tests for profile.ts — covers uncovered branches:
 *   - updateUserProfile: customDestinationLanguage='' → null (line 151)
 *   - updateUserProfile: voicePublic field present (line 206)
 *   - updateUserProfile: ZodError catch path (lines 248-250)
 *   - updateUserProfile: onDuplicate callback in withMutationLog (line 194)
 *   - updateUserAvatar: ZodError catch path (lines 359-360)
 *   - updateUserBanner: ZodError catch path (lines 462-463)
 *   - updateUserPassword: notification .catch() error body (line 555)
 *   - updateUserPassword: ZodError catch path (lines 561-562)
 *   - updateUsername: ZodError catch path (lines 725-730)
 *   - deriveVoiceFields: voicePublic=true branch (line 991)
 *   - getUserByIdDedicated: invalid ObjectId format (line 1122)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { z } from 'zod';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../middleware/auth', () => ({
  authUserCacheKey: jest.fn((id: string) => `auth:user:${id}`),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ del: jest.fn().mockResolvedValue(undefined) })),
}));

const mockWithMutationLog = jest.fn<any>();
jest.mock('../../../../utils/withMutationLog', () => ({
  withMutationLog: (...args: any[]) => mockWithMutationLog(...args),
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
    isValid: true, phoneNumber: p, countryCode: 'FR',
  })),
}));

const mockBcryptCompare = jest.fn<any>().mockResolvedValue(true);
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
  updateUserProfileSchema: { parse: jest.fn((b: any) => b) },
  updateAvatarSchema: { parse: jest.fn((b: any) => b) },
  updateBannerSchema: { parse: jest.fn((b: any) => b) },
  updatePasswordSchema: { parse: jest.fn((b: any) => b) },
  updateUsernameSchema: { parse: jest.fn((b: any) => b) },
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
    total, limit, page,
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  updateUserProfile,
  updateUserAvatar,
  updateUserBanner,
  updateUserPassword,
  updateUsername,
  getUserByIdDedicated,
  getUserByPhone,
  deriveVoiceFields,
} from '../../../../routes/users/profile';

import * as validation from '@meeshy/shared/utils/validation';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

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
  bio: 'Hello',
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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findFirst:  jest.fn<any>().mockResolvedValue(mockUser),
      findUnique: jest.fn<any>().mockResolvedValue(mockUser),
      update:     jest.fn<any>().mockResolvedValue(mockUser),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    userVoiceModel: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  };
}

async function buildApp(opts: {
  prisma?: any;
  routes?: Array<(f: FastifyInstance) => Promise<void>>;
  notificationService?: any;
  socketIOHandler?: any;
} = {}): Promise<FastifyInstance> {
  const {
    prisma = makePrisma(),
    routes = [updateUserProfile],
    notificationService = null,
    socketIOHandler = null,
  } = opts;

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
    (req as any).user = { userId: USER_ID };
  });
  app.decorate('notificationService', notificationService);
  app.decorate('socketIOHandler', socketIOHandler);

  for (const route of routes) {
    await route(app);
  }
  await app.ready();
  return app;
}

// Helper to make a ZodError
function makeZodError(msg = 'test validation error'): z.ZodError {
  return new z.ZodError([{ code: z.ZodIssueCode.custom, message: msg, path: [] }]);
}

// ─── beforeEach: reset withMutationLog to default (calls op()) ────────────────

beforeEach(() => {
  mockWithMutationLog.mockImplementation(({ op }: any) => op());
  // Reset parse mocks to passthrough
  (validation.updateUserProfileSchema.parse as jest.Mock).mockImplementation((b: any) => b);
  (validation.updateAvatarSchema.parse as jest.Mock).mockImplementation((b: any) => b);
  (validation.updateBannerSchema.parse as jest.Mock).mockImplementation((b: any) => b);
  (validation.updatePasswordSchema.parse as jest.Mock).mockImplementation((b: any) => b);
  (validation.updateUsernameSchema.parse as jest.Mock).mockImplementation((b: any) => b);
});

// ─── Line 151: customDestinationLanguage='' → null ───────────────────────────

describe('PATCH /users/me — customDestinationLanguage empty string (line 151)', () => {
  it('maps empty string to null in updateData', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me',
      payload: { customDestinationLanguage: '' },
    });
    expect(res.statusCode).toBe(200);
    // withMutationLog was called; prisma.user.update should have received null
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customDestinationLanguage: null }) })
    );
    await app.close();
  });

  it('maps non-empty customDestinationLanguage string normally', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me',
      payload: { customDestinationLanguage: 'es' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customDestinationLanguage: 'es' }) })
    );
    await app.close();
  });
});

// ─── Line 194: onDuplicate callback in withMutationLog ───────────────────────

describe('PATCH /users/me — onDuplicate callback (line 194)', () => {
  it('calls onDuplicate when withMutationLog invokes it', async () => {
    mockWithMutationLog.mockImplementationOnce(({ onDuplicate }: any) => onDuplicate(USER_ID));
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me',
      payload: { firstName: 'Bob' },
    });
    // onDuplicate calls prisma.user.findUnique
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } })
    );
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── Line 206: voicePublic field triggers userVoiceModel.updateMany ──────────

describe('PATCH /users/me — voicePublic field (line 206)', () => {
  it('calls userVoiceModel.updateMany when voicePublic=true', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me',
      payload: { voicePublic: true },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.userVoiceModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } })
    );
    await app.close();
  });

  it('calls userVoiceModel.updateMany with null when voicePublic=false', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me',
      payload: { voicePublic: false },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.userVoiceModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { voicePublicAt: null } })
    );
    await app.close();
  });
});

// ─── Lines 248-250: ZodError in updateUserProfile catch ──────────────────────

describe('PATCH /users/me — ZodError thrown by schema.parse (lines 248-250)', () => {
  it('returns 400 when updateUserProfileSchema.parse throws ZodError', async () => {
    (validation.updateUserProfileSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw makeZodError('field is required');
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH', url: '/users/me', payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── Lines 359-360: ZodError in updateUserAvatar catch ───────────────────────

describe('PATCH /users/me/avatar — ZodError from schema.parse (lines 359-360)', () => {
  it('returns 400 when updateAvatarSchema.parse throws ZodError', async () => {
    (validation.updateAvatarSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw makeZodError('invalid avatar url');
    });
    const app = await buildApp({ routes: [updateUserAvatar] });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/avatar',
      payload: { avatar: 'https://example.com/img.jpg' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── Lines 462-463: ZodError in updateUserBanner catch ───────────────────────

describe('PATCH /users/me/banner — ZodError from schema.parse (lines 462-463)', () => {
  it('returns 400 when updateBannerSchema.parse throws ZodError', async () => {
    (validation.updateBannerSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw makeZodError('invalid banner url');
    });
    const app = await buildApp({ routes: [updateUserBanner] });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/banner',
      payload: { banner: 'https://example.com/img.jpg' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── Line 555: notification .catch() body in updateUserPassword ───────────────

describe('PATCH /users/me/password — notification catch fires on reject (line 555)', () => {
  it('returns 200 even when createPasswordChangedNotification rejects', async () => {
    const notificationService = {
      createPasswordChangedNotification: jest.fn<any>().mockRejectedValue(new Error('notif fail')),
    };
    const prisma = makePrisma({
      user: {
        findFirst:  jest.fn<any>().mockResolvedValue(mockUser),
        findUnique: jest.fn<any>().mockResolvedValue(mockUser),
        update:     jest.fn<any>().mockResolvedValue(mockUser),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const app = await buildApp({ routes: [updateUserPassword], prisma, notificationService });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'oldpass123', newPassword: 'newpass456' },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve(); // drain the .catch() microtask
    await app.close();
  });
});

// ─── Lines 561-562: ZodError in updateUserPassword catch ─────────────────────

describe('PATCH /users/me/password — ZodError from schema.parse (lines 561-562)', () => {
  it('returns 400 when updatePasswordSchema.parse throws ZodError', async () => {
    (validation.updatePasswordSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw makeZodError('password too short');
    });
    const app = await buildApp({ routes: [updateUserPassword] });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'oldpassword123', newPassword: 'newpassword456' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── Lines 725-730: ZodError in updateUsername catch ─────────────────────────

describe('PATCH /users/me/username — ZodError from schema.parse (lines 725-730)', () => {
  it('returns 400 when updateUsernameSchema.parse throws ZodError', async () => {
    (validation.updateUsernameSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw makeZodError('username too short');
    });
    const app = await buildApp({ routes: [updateUsername] });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'ab', currentPassword: 'pass12345' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── Lines 729-730: non-ZodError in updateUsername catch ─────────────────────

describe('PATCH /users/me/username — non-ZodError catch path (lines 729-730)', () => {
  it('returns 500 when prisma.user.update throws a plain Error', async () => {
    const prisma = makePrisma({
      user: {
        findFirst:  jest.fn<any>().mockResolvedValue(null),   // username not taken
        findUnique: jest.fn<any>().mockResolvedValue(mockUser),
        update:     jest.fn<any>().mockRejectedValue(new Error('DB connection error')),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const app = await buildApp({ routes: [updateUsername], prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'newname', currentPassword: 'pass12345' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── Line 991: deriveVoiceFields with voicePublic=true ───────────────────────

describe('deriveVoiceFields — voicePublic true branch (line 991)', () => {
  it('returns voicePublic:true with voice fields when voicePublicAt is non-null and referenceAudioUrl exists', () => {
    const voiceModel = {
      voicePublicAt: new Date('2024-01-01'),
      referenceAudioUrl: 'https://cdn.example.com/voice.wav',
      totalDurationMs: 5000,
      qualityScore: 0.95,
    };
    const result = deriveVoiceFields(voiceModel);
    expect(result.voicePublic).toBe(true);
    expect((result as any).voiceSampleUrl).toBe('https://cdn.example.com/voice.wav');
    expect((result as any).voiceSampleDurationMs).toBe(5000);
    expect((result as any).voiceQuality).toBe(0.95);
  });

  it('returns voicePublic:false when voicePublicAt is null', () => {
    const result = deriveVoiceFields({ voicePublicAt: null, referenceAudioUrl: 'url', totalDurationMs: null, qualityScore: null });
    expect(result.voicePublic).toBe(false);
  });

  it('returns voicePublic:false when referenceAudioUrl is null', () => {
    const result = deriveVoiceFields({ voicePublicAt: new Date(), referenceAudioUrl: null, totalDurationMs: null, qualityScore: null });
    expect(result.voicePublic).toBe(false);
  });

  it('returns voicePublic:false when voiceModel is null', () => {
    const result = deriveVoiceFields(null);
    expect(result.voicePublic).toBe(false);
  });

  it('returns voicePublic:true with null durations when optional fields are missing', () => {
    const result = deriveVoiceFields({
      voicePublicAt: new Date('2024-01-01'),
      referenceAudioUrl: 'https://cdn.example.com/voice.wav',
      totalDurationMs: null,
      qualityScore: null,
    });
    expect(result.voicePublic).toBe(true);
    expect((result as any).voiceSampleDurationMs).toBeNull();
    expect((result as any).voiceQuality).toBeNull();
  });
});

// ─── Line 1122: invalid ObjectId in getUserByIdDedicated ─────────────────────

describe('GET /users/id/:id — invalid ObjectId format (line 1122)', () => {
  it('returns 400 when id is not a valid 24-char hex ObjectId', async () => {
    const app = await buildApp({ routes: [getUserByIdDedicated] });
    const res = await app.inject({ method: 'GET', url: '/users/id/not-a-valid-objectid' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 for a 24-char non-hex string', async () => {
    const app = await buildApp({ routes: [getUserByIdDedicated] });
    const res = await app.inject({ method: 'GET', url: '/users/id/GGGGGGGGGGGGGGGGGGGGGGGG' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── Lines 139, 149: displayName / regionalLanguage true branches ─────────────────

describe('PATCH /users/me — displayName and regionalLanguage (lines 139, 149)', () => {
  it('updates displayName and regionalLanguage when provided', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me',
      payload: { displayName: 'Alice New', regionalLanguage: 'es' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayName: 'Alice New', regionalLanguage: 'es' }) })
    );
    await app.close();
  });
});

// ─── Lines 142-146: phoneNumber ternary (empty→null, non-empty→normalize) ─────────

describe('PATCH /users/me — phoneNumber ternary branches (lines 142-146)', () => {
  it('maps empty phoneNumber to null in updateData', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me',
      payload: { phoneNumber: '' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phoneNumber: null }) })
    );
    await app.close();
  });

  it('normalizes non-empty phoneNumber and continues on no conflict (line 180 false branch)', async () => {
    const prisma = makePrisma({
      user: {
        findFirst:  jest.fn<any>().mockResolvedValue(null),
        findUnique: jest.fn<any>().mockResolvedValue(mockUser),
        update:     jest.fn<any>().mockResolvedValue(mockUser),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me',
      payload: { phoneNumber: '+33612345678' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── Line 166 false branch: email provided but no conflict ────────────────────────

describe('PATCH /users/me — email no-conflict (line 166 false branch)', () => {
  it('returns 200 when email is provided and no conflict exists', async () => {
    const prisma = makePrisma({
      user: {
        findFirst:  jest.fn<any>().mockResolvedValue(null),
        findUnique: jest.fn<any>().mockResolvedValue(mockUser),
        update:     jest.fn<any>().mockResolvedValue(mockUser),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me',
      payload: { email: 'newemail@example.com' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── Line 562: || 'Invalid data' in updateUserPassword ZodError catch ─────────────

describe('PATCH /users/me/password — ZodError with empty message (line 562 || branch)', () => {
  it('uses "Invalid data" fallback when ZodError message is empty', async () => {
    (validation.updatePasswordSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw makeZodError('');
    });
    const app = await buildApp({ routes: [updateUserPassword] });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/password',
      payload: { currentPassword: 'oldpassword123', newPassword: 'newpassword456' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── Line 726: || 'Invalid data' in updateUsername ZodError catch ──────────────────

describe('PATCH /users/me/username — ZodError with empty message (line 726 || branch)', () => {
  it('uses "Invalid data" fallback when ZodError message is empty', async () => {
    (validation.updateUsernameSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw makeZodError('');
    });
    const app = await buildApp({ routes: [updateUsername] });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'ab', currentPassword: 'pass12345' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── Lines 676, 682-685: username history rate limiting ───────────────────────────

describe('PATCH /users/me/username — history rate limiting (lines 676, 682-685)', () => {
  it('returns 429 when username was changed within the last 30 days', async () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const userWithHistory = {
      ...mockUser,
      usernameHistory: [{ changedAt: recentDate.toISOString(), newUsername: 'oldname' }],
    };
    const prisma = makePrisma({
      user: {
        findFirst:  jest.fn<any>().mockResolvedValue(null),
        findUnique: jest.fn<any>().mockResolvedValue(userWithHistory),
        update:     jest.fn<any>().mockResolvedValue(mockUser),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const app = await buildApp({ routes: [updateUsername], prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'newname', currentPassword: 'pass12345' },
    });
    expect(res.statusCode).toBe(429);
    await app.close();
  });

  it('proceeds normally when usernameHistory is null (line 676 || [] branch)', async () => {
    const userWithNullHistory = { ...mockUser, usernameHistory: null };
    const prisma = makePrisma({
      user: {
        findFirst:  jest.fn<any>().mockResolvedValue(null),
        findUnique: jest.fn<any>().mockResolvedValue(userWithNullHistory),
        update:     jest.fn<any>().mockResolvedValue(mockUser),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const app = await buildApp({ routes: [updateUsername], prisma });
    const res = await app.inject({
      method: 'PATCH', url: '/users/me/username',
      payload: { newUsername: 'newname', currentPassword: 'pass12345' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── Line 1174: getUserByPhone with phone lacking '+' prefix ──────────────────────

describe('GET /users/phone/:phone — phone without + prefix (line 1174)', () => {
  it('prepends + to phone param and returns 200', async () => {
    const app = await buildApp({ routes: [getUserByPhone] });
    const res = await app.inject({ method: 'GET', url: '/users/phone/33699999999' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
