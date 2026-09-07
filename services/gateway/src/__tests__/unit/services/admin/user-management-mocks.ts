import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UserManagementService } from '../../../../services/admin/user-management.service';

// ---------------------------------------------------------------------------
// Fabriques partagées entre user-management.service.test.ts et les suites
// dérivées (ex: user-management-reset-password-revocation.test.ts) — une
// seule définition, jamais une copie qui dériverait (#5569).
// ---------------------------------------------------------------------------

export function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '507f1f77bcf86cd799439011',
    username: 'testuser',
    firstName: 'John',
    lastName: 'Doe',
    displayName: 'John D.',
    bio: '',
    email: 'test@example.com',
    password: 'hashed',
    phoneNumber: null,
    avatar: null,
    role: 'USER',
    isActive: true,
    isOnline: false,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    lastActiveAt: new Date(),
    systemLanguage: 'en',
    regionalLanguage: 'en',
    customDestinationLanguage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deactivatedAt: null,
    deletedAt: null,
    twoFactorEnabledAt: null,
    twoFactorSecret: null,
    twoFactorBackupCodes: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lockedReason: null,
    ...overrides,
  };
}

export function makePrisma(methods: Partial<{
  findMany: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  count: jest.Mock;
}> = {}) {
  return {
    user: {
      findMany: methods.findMany ?? jest.fn(),
      findUnique: methods.findUnique ?? jest.fn(),
      create: methods.create ?? jest.fn(),
      update: methods.update ?? jest.fn(),
      count: methods.count ?? jest.fn(),
    },
    // `createUser` route désormais aussi par `ensureGlobalConversationMembership`
    // (#3876) — repli SANS salon global trouvé par défaut : les describe
    // blocks qui ne testent pas ce comportement restent silencieux.
    conversation: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'part-new' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    },
  } as unknown as PrismaClient;
}

export function makeService(prisma?: PrismaClient, deps?: { revokeSessions?: unknown; resolveSocketManager?: unknown }) {
  return new UserManagementService(prisma ?? makePrisma(), deps as never);
}
