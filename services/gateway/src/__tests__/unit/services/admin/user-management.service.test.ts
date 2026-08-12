/**
 * UserManagementService unit tests
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
}));

import { UserManagementService } from '../../../../services/admin/user-management.service';
import * as bcrypt from 'bcrypt';

const mockHash = bcrypt.hash as jest.Mock;
const mockCompare = bcrypt.compare as jest.Mock;

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
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

function makePrisma(methods: Partial<{
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
  } as unknown as PrismaClient;
}

function makeService(prisma?: PrismaClient) {
  return new UserManagementService(prisma ?? makePrisma());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHash.mockResolvedValue('hashed_password');
  mockCompare.mockResolvedValue(true);
});

// ─── getUsers ─────────────────────────────────────────────────────────────────

describe('UserManagementService.getUsers', () => {
  it('queries with no filters and pagination', async () => {
    const users = [makeUser()];
    const findMany = jest.fn().mockResolvedValue(users);
    const count = jest.fn().mockResolvedValue(1);
    const svc = makeService(makePrisma({ findMany, count }));

    const result = await svc.getUsers({}, { offset: 0, limit: 20 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    }));
    expect(result.total).toBe(1);
    expect(result.users).toHaveLength(1);
  });

  it('applies search to OR clause', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ search: 'alice' }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.OR).toBeDefined();
    expect(callWhere.OR).toEqual(expect.arrayContaining([
      expect.objectContaining({ username: expect.objectContaining({ contains: 'alice' }) }),
      expect.objectContaining({ email: expect.objectContaining({ contains: 'alice' }) }),
    ]));
  });

  it('filters by role when provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ role: 'ADMIN' as any }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.role).toBe('ADMIN');
  });

  it('filters isActive: true', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ isActive: true }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.isActive).toBe(true);
  });

  it('filters isActive: false', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ isActive: false }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.isActive).toBe(false);
  });

  it('filters emailVerified: true → emailVerifiedAt not null', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ emailVerified: true }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.emailVerifiedAt).toEqual({ not: null });
  });

  it('filters emailVerified: false → emailVerifiedAt null', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ emailVerified: false }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.emailVerifiedAt).toBeNull();
  });

  it('filters phoneVerified: true → phoneVerifiedAt not null', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ phoneVerified: true }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.phoneVerifiedAt).toEqual({ not: null });
  });

  it('filters phoneVerified: false → phoneVerifiedAt null', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ phoneVerified: false }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.phoneVerifiedAt).toBeNull();
  });

  it('filters twoFactorEnabled: true → twoFactorEnabledAt not null', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ twoFactorEnabled: true }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.twoFactorEnabledAt).toEqual({ not: null });
  });

  it('filters twoFactorEnabled: false → twoFactorEnabledAt null', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ twoFactorEnabled: false }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.twoFactorEnabledAt).toBeNull();
  });

  it('applies createdAfter and createdBefore date range', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));
    const after = new Date('2026-01-01');
    const before = new Date('2026-06-01');

    await svc.getUsers({ createdAfter: after, createdBefore: before }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.createdAt.gte).toBe(after);
    expect(callWhere.createdAt.lte).toBe(before);
  });

  it('applies createdBefore only (no createdAfter)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));
    const before = new Date('2026-06-01');

    await svc.getUsers({ createdBefore: before }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.createdAt.lte).toBe(before);
    expect(callWhere.createdAt.gte).toBeUndefined();
  });

  it('applies createdAfter only (no createdBefore)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));
    const after = new Date('2026-01-01');

    await svc.getUsers({ createdAfter: after }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.createdAt.gte).toBe(after);
    expect(callWhere.createdAt.lte).toBeUndefined();
  });

  it('applies lastActiveAfter and lastActiveBefore', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));
    const after = new Date('2026-01-01');

    await svc.getUsers({ lastActiveAfter: after }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.lastActiveAt.gte).toBe(after);
  });

  it('applies lastActiveBefore only (without lastActiveAfter)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));
    const before = new Date('2026-06-01');

    await svc.getUsers({ lastActiveBefore: before }, { offset: 0, limit: 10 });

    const callWhere = (findMany.mock.calls[0] as any[])[0].where;
    expect(callWhere.lastActiveAt.lte).toBe(before);
    expect(callWhere.lastActiveAt.gte).toBeUndefined();
  });

  it('uses custom sortBy and sortOrder', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ sortBy: 'username', sortOrder: 'asc' }, { offset: 0, limit: 10 });

    const callOrder = (findMany.mock.calls[0] as any[])[0].orderBy;
    expect(callOrder).toEqual({ username: 'asc' });
  });

  it('defaults sortOrder to desc when sortBy is set without sortOrder', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({ sortBy: 'username' }, { offset: 0, limit: 10 });

    const callOrder = (findMany.mock.calls[0] as any[])[0].orderBy;
    expect(callOrder).toEqual({ username: 'desc' });
  });

  it('defaults to createdAt desc sort when sortBy not provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.getUsers({}, { offset: 0, limit: 10 });

    expect((findMany.mock.calls[0] as any[])[0].orderBy).toEqual({ createdAt: 'desc' });
  });
});

// ─── getUserById ──────────────────────────────────────────────────────────────

describe('UserManagementService.getUserById', () => {
  it('returns user with _count include when found', async () => {
    const user = makeUser();
    const findUnique = jest.fn().mockResolvedValue(user);
    const svc = makeService(makePrisma({ findUnique }));

    const result = await svc.getUserById('user-id');
    expect(result?.id).toBe(user.id);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-id' },
      include: expect.objectContaining({ _count: expect.anything() }),
    }));
  });

  it('returns null when user not found', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const svc = makeService(makePrisma({ findUnique }));

    expect(await svc.getUserById('nonexistent')).toBeNull();
  });
});

// ─── createUser ───────────────────────────────────────────────────────────────

describe('UserManagementService.createUser', () => {
  it('hashes password and creates user with defaults', async () => {
    const user = makeUser();
    const create = jest.fn().mockResolvedValue(user);
    const svc = makeService(makePrisma({ create }));

    await svc.createUser({
      username: 'alice',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      password: 'plaintext',
      displayName: null,
      bio: null,
      phoneNumber: null,
    }, 'creator-id');

    expect(mockHash).toHaveBeenCalledWith('plaintext', 10);
    const callData = (create.mock.calls[0] as any[])[0].data;
    expect(callData.password).toBe('hashed_password');
    expect(callData.isActive).toBe(true);
  });

  it('uses provided role or defaults to USER', async () => {
    const create = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ create }));

    await svc.createUser({
      username: 'alice', firstName: 'A', lastName: 'B',
      email: 'alice@ex.com', password: 'pw',
      displayName: null, bio: null, phoneNumber: null,
    }, 'creator');

    const callData = (create.mock.calls[0] as any[])[0].data;
    expect(callData.role).toBe('USER');
  });

  it('uses systemLanguage from DTO or defaults to en', async () => {
    const create = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ create }));

    await svc.createUser({
      username: 'u', firstName: 'F', lastName: 'L',
      email: 'u@e.com', password: 'pw',
      displayName: null, bio: null, phoneNumber: null,
    }, 'creator');

    const callData = (create.mock.calls[0] as any[])[0].data;
    expect(callData.systemLanguage).toBe('en');
  });
});

// ─── updateUser ───────────────────────────────────────────────────────────────

describe('UserManagementService.updateUser', () => {
  it('updates user with data and sets updatedAt', async () => {
    const update = jest.fn().mockResolvedValue(makeUser({ firstName: 'Updated' }));
    const svc = makeService(makePrisma({ update }));

    const result = await svc.updateUser('user-id', { firstName: 'Updated' } as any, 'updater');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: expect.objectContaining({ firstName: 'Updated', updatedAt: expect.any(Date) }),
    });
    expect((result as any).firstName).toBe('Updated');
  });
});

// ─── updateEmail ──────────────────────────────────────────────────────────────

describe('UserManagementService.updateEmail', () => {
  it('throws when user not found', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const svc = makeService(makePrisma({ findUnique }));

    await expect(svc.updateEmail('user-id', { password: 'pw', newEmail: 'new@ex.com' }, 'updater'))
      .rejects.toThrow('User not found');
  });

  it('throws when password is invalid', async () => {
    mockCompare.mockResolvedValueOnce(false);
    const findUnique = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ findUnique }));

    await expect(svc.updateEmail('user-id', { password: 'wrong', newEmail: 'new@ex.com' }, 'updater'))
      .rejects.toThrow('Invalid password');
  });

  it('updates email when password is valid', async () => {
    mockCompare.mockResolvedValueOnce(true);
    const findUnique = jest.fn().mockResolvedValue(makeUser({ password: 'hashed' }));
    const update = jest.fn().mockResolvedValue(makeUser({ email: 'new@ex.com' }));
    const svc = makeService(makePrisma({ findUnique, update }));

    const result = await svc.updateEmail('user-id', { password: 'correct', newEmail: 'new@ex.com' }, 'updater');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'new@ex.com' }),
    }));
    expect((result as any).email).toBe('new@ex.com');
  });
});

// ─── updateRole ───────────────────────────────────────────────────────────────

describe('UserManagementService.updateRole', () => {
  it('updates user role', async () => {
    const update = jest.fn().mockResolvedValue(makeUser({ role: 'MODERATOR' }));
    const svc = makeService(makePrisma({ update }));

    await svc.updateRole('user-id', { role: 'MODERATOR' }, 'updater');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: expect.objectContaining({ role: 'MODERATOR' }),
    });
  });
});

// ─── updateStatus ─────────────────────────────────────────────────────────────

describe('UserManagementService.updateStatus', () => {
  it('sets deactivatedAt to null when activating user', async () => {
    const update = jest.fn().mockResolvedValue(makeUser({ isActive: true, deactivatedAt: null }));
    const svc = makeService(makePrisma({ update }));

    await svc.updateStatus('user-id', { isActive: true }, 'updater');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isActive: true, deactivatedAt: null }),
    }));
  });

  it('sets deactivatedAt to now when deactivating user', async () => {
    const update = jest.fn().mockResolvedValue(makeUser({ isActive: false }));
    const svc = makeService(makePrisma({ update }));

    await svc.updateStatus('user-id', { isActive: false }, 'updater');

    const callData = (update.mock.calls[0] as any[])[0].data;
    expect(callData.deactivatedAt).toBeInstanceOf(Date);
    expect(callData.isActive).toBe(false);
  });
});

// ─── resetPassword ────────────────────────────────────────────────────────────

describe('UserManagementService.resetPassword', () => {
  it('hashes new password and updates user', async () => {
    const update = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ update }));

    await svc.resetPassword('user-id', { newPassword: 'newpass' }, 'resetter');

    expect(mockHash).toHaveBeenCalledWith('newpass', 10);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ password: 'hashed_password' }),
    }));
  });
});

// ─── deleteUser ───────────────────────────────────────────────────────────────

describe('UserManagementService.deleteUser', () => {
  it('soft-deletes user by setting isActive=false', async () => {
    const update = jest.fn().mockResolvedValue(makeUser({ isActive: false }));
    const svc = makeService(makePrisma({ update }));

    await svc.deleteUser('user-id', 'deleter');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isActive: false }),
    }));
  });
});

// ─── restoreUser ──────────────────────────────────────────────────────────────

describe('UserManagementService.restoreUser', () => {
  it('restores user by setting isActive=true', async () => {
    const update = jest.fn().mockResolvedValue(makeUser({ isActive: true }));
    const svc = makeService(makePrisma({ update }));

    await svc.restoreUser('user-id', 'restorer');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isActive: true }),
    }));
  });
});

// ─── updateAvatar / deleteAvatar ──────────────────────────────────────────────

describe('UserManagementService.updateAvatar', () => {
  it('sets avatar url', async () => {
    const update = jest.fn().mockResolvedValue(makeUser({ avatar: 'https://cdn/avatar.jpg' }));
    const svc = makeService(makePrisma({ update }));

    await svc.updateAvatar('user-id', 'https://cdn/avatar.jpg');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ avatar: 'https://cdn/avatar.jpg' }),
    }));
  });
});

describe('UserManagementService.deleteAvatar', () => {
  it('sets avatar to null', async () => {
    const update = jest.fn().mockResolvedValue(makeUser({ avatar: null }));
    const svc = makeService(makePrisma({ update }));

    await svc.deleteAvatar('user-id');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ avatar: null }),
    }));
  });
});

// ─── verifyEmail / verifyPhone ────────────────────────────────────────────────

describe('UserManagementService.verifyEmail', () => {
  it('sets emailVerifiedAt to now when verified=true', async () => {
    const update = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ update }));

    await svc.verifyEmail('user-id', true, 'updater');

    const callData = (update.mock.calls[0] as any[])[0].data;
    expect(callData.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('sets emailVerifiedAt to null when verified=false', async () => {
    const update = jest.fn().mockResolvedValue(makeUser({ emailVerifiedAt: null }));
    const svc = makeService(makePrisma({ update }));

    await svc.verifyEmail('user-id', false, 'updater');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ emailVerifiedAt: null }),
    }));
  });
});

describe('UserManagementService.verifyPhone', () => {
  it('sets phoneVerifiedAt to now when verified=true', async () => {
    const update = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ update }));

    await svc.verifyPhone('user-id', true, 'updater');

    const callData = (update.mock.calls[0] as any[])[0].data;
    expect(callData.phoneVerifiedAt).toBeInstanceOf(Date);
  });

  it('sets phoneVerifiedAt to null when verified=false', async () => {
    const update = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ update }));

    await svc.verifyPhone('user-id', false, 'updater');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phoneVerifiedAt: null }),
    }));
  });
});

// ─── unlockAccount ────────────────────────────────────────────────────────────

describe('UserManagementService.unlockAccount', () => {
  it('resets failedLoginAttempts, lockedUntil, lockedReason', async () => {
    const update = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ update }));

    await svc.unlockAccount('user-id', 'admin');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lockedReason: null,
      }),
    }));
  });
});

// ─── enable2FA / disable2FA ───────────────────────────────────────────────────

describe('UserManagementService.enable2FA', () => {
  it('sets twoFactorEnabledAt to now', async () => {
    const update = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ update }));

    await svc.enable2FA('user-id', 'admin');

    const callData = (update.mock.calls[0] as any[])[0].data;
    expect(callData.twoFactorEnabledAt).toBeInstanceOf(Date);
  });
});

describe('UserManagementService.disable2FA', () => {
  it('clears twoFactor fields', async () => {
    const update = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ update }));

    await svc.disable2FA('user-id', 'admin');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        twoFactorEnabledAt: null,
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
      }),
    }));
  });
});

// ─── toggleVoiceConsent ───────────────────────────────────────────────────────

describe('UserManagementService.toggleVoiceConsent', () => {
  const consentTypes: Array<'voiceProfile' | 'voiceData' | 'dataProcessing' | 'voiceCloning'> = [
    'voiceProfile', 'voiceData', 'dataProcessing', 'voiceCloning',
  ];
  const fieldMap: Record<string, string> = {
    voiceProfile: 'voiceProfileConsentAt',
    voiceData: 'voiceDataConsentAt',
    dataProcessing: 'dataProcessingConsentAt',
    voiceCloning: 'voiceCloningEnabledAt',
  };

  for (const consentType of consentTypes) {
    it(`sets ${fieldMap[consentType]} to Date when enabled=true (${consentType})`, async () => {
      const update = jest.fn().mockResolvedValue(makeUser());
      const svc = makeService(makePrisma({ update }));

      await svc.toggleVoiceConsent('user-id', consentType, true, 'admin');

      const callData = (update.mock.calls[0] as any[])[0].data;
      expect(callData[fieldMap[consentType]]).toBeInstanceOf(Date);
    });

    it(`sets ${fieldMap[consentType]} to null when enabled=false (${consentType})`, async () => {
      const update = jest.fn().mockResolvedValue(makeUser());
      const svc = makeService(makePrisma({ update }));

      await svc.toggleVoiceConsent('user-id', consentType, false, 'admin');

      const callData = (update.mock.calls[0] as any[])[0].data;
      expect(callData[fieldMap[consentType]]).toBeNull();
    });
  }
});

// ─── verifyAge ────────────────────────────────────────────────────────────────

describe('UserManagementService.verifyAge', () => {
  it('sets ageVerifiedAt to now when verified=true', async () => {
    const update = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ update }));

    await svc.verifyAge('user-id', true, 'admin');

    const callData = (update.mock.calls[0] as any[])[0].data;
    expect(callData.ageVerifiedAt).toBeInstanceOf(Date);
  });

  it('sets ageVerifiedAt to null when verified=false', async () => {
    const update = jest.fn().mockResolvedValue(makeUser());
    const svc = makeService(makePrisma({ update }));

    await svc.verifyAge('user-id', false, 'admin');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ageVerifiedAt: null }),
    }));
  });
});
