/**
 * Tests for utils/user-adapter.ts
 */

import {
  getDefaultPermissions,
  socketIOUserToUser,
  createDefaultUser,
} from '@/utils/user-adapter';
import type { SocketIOUser } from '@/types';

// ─── getDefaultPermissions ────────────────────────────────────────────────────

describe('getDefaultPermissions', () => {
  it('BIGBOSS has all permissions', () => {
    const perms = getDefaultPermissions('BIGBOSS');
    expect(perms.canAccessAdmin).toBe(true);
    expect(perms.canManageUsers).toBe(true);
    expect(perms.canManageGroups).toBe(true);
    expect(perms.canManageConversations).toBe(true);
    expect(perms.canViewAnalytics).toBe(true);
    expect(perms.canModerateContent).toBe(true);
    expect(perms.canViewAuditLogs).toBe(true);
    expect(perms.canManageNotifications).toBe(true);
    expect(perms.canManageTranslations).toBe(true);
  });

  it('USER has no permissions', () => {
    const perms = getDefaultPermissions('USER');
    expect(perms.canAccessAdmin).toBe(false);
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canViewAnalytics).toBe(false);
    expect(perms.canModerateContent).toBe(false);
  });

  it('ADMIN can manage users but not translations', () => {
    const perms = getDefaultPermissions('ADMIN');
    expect(perms.canAccessAdmin).toBe(true);
    expect(perms.canManageUsers).toBe(true);
    expect(perms.canManageTranslations).toBe(false);
  });

  it('MODERATOR can moderate but not manage users or view analytics', () => {
    const perms = getDefaultPermissions('MODERATOR');
    expect(perms.canModerateContent).toBe(true);
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canViewAnalytics).toBe(false);
    expect(perms.canViewAuditLogs).toBe(false);
  });

  it('AUDIT can view analytics and audit logs but not manage', () => {
    const perms = getDefaultPermissions('AUDIT');
    expect(perms.canViewAnalytics).toBe(true);
    expect(perms.canViewAuditLogs).toBe(true);
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canModerateContent).toBe(false);
  });

  it('ANALYST can view analytics but not audit logs', () => {
    const perms = getDefaultPermissions('ANALYST');
    expect(perms.canViewAnalytics).toBe(true);
    expect(perms.canViewAuditLogs).toBe(false);
  });

  it('unknown role falls back to USER permissions (all false)', () => {
    const perms = getDefaultPermissions('UNKNOWN_ROLE');
    expect(perms.canAccessAdmin).toBe(false);
    expect(perms.canManageUsers).toBe(false);
  });
});

// ─── socketIOUserToUser ───────────────────────────────────────────────────────

const makeSocketUser = (overrides: Partial<SocketIOUser> = {}): SocketIOUser => ({
  id: 'u1',
  username: 'alice99',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  avatar: '',
  role: 'USER',
  isOnline: false,
  lastActiveAt: new Date(),
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  autoTranslateEnabled: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('socketIOUserToUser', () => {
  it('adds USER permissions for role USER', () => {
    const result = socketIOUserToUser(makeSocketUser({ role: 'USER' }));
    expect(result.permissions.canAccessAdmin).toBe(false);
  });

  it('adds ADMIN permissions for role ADMIN', () => {
    const result = socketIOUserToUser(makeSocketUser({ role: 'ADMIN' }));
    expect(result.permissions.canManageUsers).toBe(true);
  });

  it('preserves all original fields', () => {
    const socket = makeSocketUser({ username: 'bob', firstName: 'Bob' });
    const result = socketIOUserToUser(socket);
    expect(result.username).toBe('bob');
    expect(result.firstName).toBe('Bob');
  });

  it('defaults isActive to true when undefined', () => {
    const socket = makeSocketUser({ isActive: undefined as any });
    const result = socketIOUserToUser(socket);
    expect(result.isActive).toBe(true);
  });

  it('defaults phoneNumber to empty string when undefined', () => {
    const socket = makeSocketUser({ phoneNumber: undefined });
    const result = socketIOUserToUser(socket);
    expect(result.phoneNumber).toBe('');
  });
});

// ─── createDefaultUser ────────────────────────────────────────────────────────

describe('createDefaultUser', () => {
  it('uses "unknown" as default id', () => {
    const user = createDefaultUser();
    expect(user.id).toBe('unknown');
  });

  it('uses provided id when given', () => {
    const user = createDefaultUser('custom-id');
    expect(user.id).toBe('custom-id');
  });

  it('has USER role with no admin permissions', () => {
    const user = createDefaultUser();
    expect(user.role).toBe('USER');
    expect(user.permissions.canAccessAdmin).toBe(false);
  });

  it('has default locale set to fr', () => {
    const user = createDefaultUser();
    expect(user.systemLanguage).toBe('fr');
  });
});
