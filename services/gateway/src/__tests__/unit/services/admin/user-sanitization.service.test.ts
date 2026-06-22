/**
 * UserSanitizationService unit tests
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { UserRoleEnum, FullUser, UserAuditLog, UserAuditAction } from '@meeshy/shared/types';

// Mock permissionsService so we control canViewSensitiveData
const mockCanViewSensitiveData = jest.fn() as jest.Mock<any>;

jest.mock('../../../../services/admin/permissions.service', () => ({
  permissionsService: {
    canViewSensitiveData: (...args: unknown[]) => mockCanViewSensitiveData(...args),
  },
}));

import { UserSanitizationService } from '../../../../services/admin/user-sanitization.service';

function makeService() {
  return new UserSanitizationService();
}

function makeFullUser(overrides: Partial<FullUser> = {}): FullUser {
  return {
    id: '507f1f77bcf86cd799439011',
    username: 'testuser',
    firstName: 'John',
    lastName: 'Doe',
    displayName: 'John D.',
    bio: 'A tester',
    email: 'john.doe@example.com',
    phoneNumber: '+33612345678',
    avatar: null,
    role: 'USER',
    isActive: true,
    isOnline: false,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    lastActiveAt: new Date('2026-01-01'),
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    customDestinationLanguage: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deactivatedAt: null,
    deletedAt: null,
    deletedBy: null,
    profileCompletionRate: 80,
    phoneCountryCode: 'FR',
    timezone: 'Europe/Paris',
    lastPasswordChange: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lockedReason: null,
    twoFactorEnabledAt: null,
    twoFactorBackupCodes: [],
    lastLoginIp: '192.168.1.100',
    lastLoginLocation: 'Paris, FR',
    lastLoginDevice: 'iPhone',
    registrationIp: '10.0.0.1',
    registrationLocation: null,
    registrationDevice: null,
    registrationCountry: 'FR',
    userFeature: null,
    _count: { sentMessages: 5, conversations: 2 },
    ...overrides,
  };
}

function makeAuditLog(overrides: Partial<UserAuditLog> = {}): UserAuditLog {
  return {
    id: '507f1f77bcf86cd799439099',
    userId: '507f1f77bcf86cd799439011',
    adminId: '507f1f77bcf86cd799439022',
    action: UserAuditAction.VIEW_USER,
    entity: 'User',
    entityId: '507f1f77bcf86cd799439011',
    changes: null,
    metadata: null,
    ipAddress: '192.168.1.100',
    userAgent: 'test-agent',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ─── sanitizeUser ─────────────────────────────────────────────────────────────

describe('UserSanitizationService.sanitizeUser — sensitive viewer', () => {
  beforeEach(() => {
    mockCanViewSensitiveData.mockReturnValue(true);
  });

  it('returns AdminUser with sensitive fields when viewer has canViewSensitiveData', () => {
    const svc = makeService();
    const user = makeFullUser();
    const result = svc.sanitizeUser(user, UserRoleEnum.ADMIN);

    expect(result).toMatchObject({
      id: user.id,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
      phoneCountryCode: user.phoneCountryCode,
      timezone: user.timezone,
      systemLanguage: user.systemLanguage,
      regionalLanguage: user.regionalLanguage,
      lastLoginIp: user.lastLoginIp,
    });
  });

  it('preserves twoFactorBackupCodes (defaults empty array for null)', () => {
    const svc = makeService();
    const user = makeFullUser({ twoFactorBackupCodes: [] });
    const result = svc.sanitizeUser(user, UserRoleEnum.ADMIN) as any;
    expect(result.twoFactorBackupCodes).toEqual([]);
  });

  it('uses empty array when twoFactorBackupCodes is falsy', () => {
    const svc = makeService();
    const user = makeFullUser({ twoFactorBackupCodes: undefined as unknown as string[] });
    const result = svc.sanitizeUser(user, UserRoleEnum.ADMIN) as any;
    expect(result.twoFactorBackupCodes).toEqual([]);
  });

  it('includes deletedAt and deletedBy in AdminUser', () => {
    const svc = makeService();
    const user = makeFullUser({ deletedAt: new Date('2026-06-01'), deletedBy: 'admin-id' });
    const result = svc.sanitizeUser(user, UserRoleEnum.BIGBOSS) as any;
    expect(result.deletedAt).toBeDefined();
    expect(result.deletedBy).toBe('admin-id');
  });
});

describe('UserSanitizationService.sanitizeUser — non-sensitive viewer', () => {
  beforeEach(() => {
    mockCanViewSensitiveData.mockReturnValue(false);
  });

  it('returns MaskedUser with masked email and phone', () => {
    const svc = makeService();
    const user = makeFullUser({ email: 'john.doe@example.com', phoneNumber: '+33612345678' });
    const result = svc.sanitizeUser(user, UserRoleEnum.MODERATOR) as any;

    // Email should be masked
    expect(result.email).toBe('j***@example.com');
    // Phone should be masked
    expect(result.phoneNumber).toMatch(/\*\*/);
    // Does not expose sensitive fields
    expect(result).not.toHaveProperty('timezone');
    expect(result).not.toHaveProperty('lastLoginIp');
    expect(result).not.toHaveProperty('systemLanguage');
  });

  it('returns null for masked phone when phoneNumber is null', () => {
    const svc = makeService();
    const user = makeFullUser({ phoneNumber: null });
    const result = svc.sanitizeUser(user, UserRoleEnum.AUDIT) as any;
    expect(result.phoneNumber).toBeNull();
  });

  it('includes public fields always: username, firstName, role, isActive, etc.', () => {
    const svc = makeService();
    const user = makeFullUser();
    const result = svc.sanitizeUser(user, UserRoleEnum.MODERATOR) as any;
    expect(result.id).toBe(user.id);
    expect(result.username).toBe(user.username);
    expect(result.firstName).toBe(user.firstName);
    expect(result.role).toBe(user.role);
    expect(result.isActive).toBe(user.isActive);
  });
});

// ─── maskEmail edge cases ─────────────────────────────────────────────────────

describe('UserSanitizationService — maskEmail edge cases (via sanitizeUser)', () => {
  beforeEach(() => {
    mockCanViewSensitiveData.mockReturnValue(false);
  });

  it('masks first char + keeps domain', () => {
    const svc = makeService();
    const result = svc.sanitizeUser(makeFullUser({ email: 'alice@test.org' }), UserRoleEnum.AUDIT) as any;
    expect(result.email).toBe('a***@test.org');
  });

  it('returns ***@*** when email has no @ separator', () => {
    const svc = makeService();
    const result = svc.sanitizeUser(makeFullUser({ email: 'invalidemail' }), UserRoleEnum.AUDIT) as any;
    expect(result.email).toBe('***@***');
  });

  it('handles single char local part', () => {
    const svc = makeService();
    const result = svc.sanitizeUser(makeFullUser({ email: 'x@domain.com' }), UserRoleEnum.AUDIT) as any;
    expect(result.email).toBe('x***@domain.com');
  });
});

// ─── maskPhone edge cases ─────────────────────────────────────────────────────

describe('UserSanitizationService — maskPhone edge cases (via sanitizeUser)', () => {
  beforeEach(() => {
    mockCanViewSensitiveData.mockReturnValue(false);
  });

  it('returns *** when phone is shorter than 6 chars', () => {
    const svc = makeService();
    const result = svc.sanitizeUser(makeFullUser({ phoneNumber: '123' }), UserRoleEnum.AUDIT) as any;
    expect(result.phoneNumber).toBe('***');
  });

  it('returns null for empty string phone (falsy check)', () => {
    const svc = makeService();
    const result = svc.sanitizeUser(makeFullUser({ phoneNumber: '' }), UserRoleEnum.AUDIT) as any;
    // maskPhone treats '' as falsy → returns null (same as null input)
    expect(result.phoneNumber).toBeNull();
  });

  it('strips spaces before measuring length', () => {
    const svc = makeService();
    const result = svc.sanitizeUser(makeFullUser({ phoneNumber: '+33 6 12 34 56 78' }), UserRoleEnum.AUDIT) as any;
    // cleaned = '+336123456789' → length >= 6 → not '***'
    expect(result.phoneNumber).not.toBe('***');
    expect(result.phoneNumber).toMatch(/\*\*/);
  });
});

// ─── sanitizeUsers ────────────────────────────────────────────────────────────

describe('UserSanitizationService.sanitizeUsers', () => {
  it('maps each user through sanitizeUser', () => {
    mockCanViewSensitiveData.mockReturnValue(true);
    const svc = makeService();
    const users = [makeFullUser({ id: 'id1' }), makeFullUser({ id: 'id2' })];
    const results = svc.sanitizeUsers(users, UserRoleEnum.ADMIN);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('id1');
    expect(results[1].id).toBe('id2');
  });

  it('returns empty array for empty input', () => {
    const svc = makeService();
    expect(svc.sanitizeUsers([], UserRoleEnum.ADMIN)).toEqual([]);
  });
});

// ─── sanitizeAuditLog ─────────────────────────────────────────────────────────

describe('UserSanitizationService.sanitizeAuditLog', () => {
  it('returns full log when viewer can see sensitive data', () => {
    mockCanViewSensitiveData.mockReturnValue(true);
    const svc = makeService();
    const log = makeAuditLog({ ipAddress: '192.168.1.100' });
    const result = svc.sanitizeAuditLog(log, UserRoleEnum.ADMIN);
    expect(result.ipAddress).toBe('192.168.1.100');
    expect(result).toEqual(log);
  });

  it('masks IP for viewer without sensitive access', () => {
    mockCanViewSensitiveData.mockReturnValue(false);
    const svc = makeService();
    const log = makeAuditLog({ ipAddress: '192.168.1.100' });
    const result = svc.sanitizeAuditLog(log, UserRoleEnum.AUDIT);
    expect(result.ipAddress).not.toBe('192.168.1.100');
    expect(result.ipAddress).toContain('***');
  });

  it('returns null ipAddress unchanged when IP is null', () => {
    mockCanViewSensitiveData.mockReturnValue(false);
    const svc = makeService();
    const log = makeAuditLog({ ipAddress: null });
    const result = svc.sanitizeAuditLog(log, UserRoleEnum.AUDIT);
    expect(result.ipAddress).toBeNull();
  });

  it('returns *.*.*.* for non-IPv4 addresses', () => {
    mockCanViewSensitiveData.mockReturnValue(false);
    const svc = makeService();
    const log = makeAuditLog({ ipAddress: '::1' }); // IPv6
    const result = svc.sanitizeAuditLog(log, UserRoleEnum.AUDIT);
    expect(result.ipAddress).toBe('***.***.***.***');
  });

  it('preserves all non-IP fields when masking', () => {
    mockCanViewSensitiveData.mockReturnValue(false);
    const svc = makeService();
    const log = makeAuditLog();
    const result = svc.sanitizeAuditLog(log, UserRoleEnum.MODERATOR);
    expect(result.action).toBe(log.action);
    expect(result.adminId).toBe(log.adminId);
    expect(result.userId).toBe(log.userId);
    expect(result.userAgent).toBe(log.userAgent);
  });
});
