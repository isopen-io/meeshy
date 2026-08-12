/**
 * PermissionsService unit tests
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PermissionsService } from '../../../../services/admin/permissions.service';
import { UserRoleEnum } from '@meeshy/shared/types';

function makeService() {
  return new PermissionsService();
}

describe('PermissionsService.getPermissions', () => {
  it('BIGBOSS has all permissions enabled', () => {
    const svc = makeService();
    const perms = svc.getPermissions(UserRoleEnum.BIGBOSS);
    expect(perms.canAccessAdmin).toBe(true);
    expect(perms.canViewUsers).toBe(true);
    expect(perms.canViewSensitiveData).toBe(true);
    expect(perms.canCreateUsers).toBe(true);
    expect(perms.canUpdateUsers).toBe(true);
    expect(perms.canUpdateUserRoles).toBe(true);
    expect(perms.canDeleteUsers).toBe(true);
    expect(perms.canResetPasswords).toBe(true);
    expect(perms.canViewAuditLogs).toBe(true);
    expect(perms.canManageCommunities).toBe(true);
    expect(perms.canManageConversations).toBe(true);
    expect(perms.canViewAnalytics).toBe(true);
    expect(perms.canModerateContent).toBe(true);
    expect(perms.canManageNotifications).toBe(true);
    expect(perms.canManageTranslations).toBe(true);
  });

  it('ADMIN has all permissions except canViewAuditLogs', () => {
    const svc = makeService();
    const perms = svc.getPermissions(UserRoleEnum.ADMIN);
    expect(perms.canAccessAdmin).toBe(true);
    expect(perms.canViewAuditLogs).toBe(false);
    expect(perms.canManageTranslations).toBe(true);
    expect(perms.canCreateUsers).toBe(true);
    expect(perms.canDeleteUsers).toBe(true);
  });

  it('MODERATOR can access admin and moderate but cannot manage sensitive data or users', () => {
    const svc = makeService();
    const perms = svc.getPermissions(UserRoleEnum.MODERATOR);
    expect(perms.canAccessAdmin).toBe(true);
    expect(perms.canViewUsers).toBe(true);
    expect(perms.canViewSensitiveData).toBe(false);
    expect(perms.canCreateUsers).toBe(false);
    expect(perms.canUpdateUsers).toBe(false);
    expect(perms.canDeleteUsers).toBe(false);
    expect(perms.canManageCommunities).toBe(true);
    expect(perms.canModerateContent).toBe(true);
    expect(perms.canViewAuditLogs).toBe(false);
    expect(perms.canViewAnalytics).toBe(false);
  });

  it('AUDIT has read-only access to users and audit logs, no modification rights', () => {
    const svc = makeService();
    const perms = svc.getPermissions(UserRoleEnum.AUDIT);
    expect(perms.canAccessAdmin).toBe(true);
    expect(perms.canViewUsers).toBe(true);
    expect(perms.canViewSensitiveData).toBe(false);
    expect(perms.canViewAuditLogs).toBe(true);
    expect(perms.canViewAnalytics).toBe(true);
    expect(perms.canUpdateUsers).toBe(false);
    expect(perms.canDeleteUsers).toBe(false);
    expect(perms.canModerateContent).toBe(false);
  });

  it('ANALYST can only view analytics, no admin access', () => {
    const svc = makeService();
    const perms = svc.getPermissions(UserRoleEnum.ANALYST);
    expect(perms.canAccessAdmin).toBe(false);
    expect(perms.canViewUsers).toBe(false);
    expect(perms.canViewAnalytics).toBe(true);
    expect(perms.canModerateContent).toBe(false);
  });

  it('USER has no admin permissions at all', () => {
    const svc = makeService();
    const perms = svc.getPermissions(UserRoleEnum.USER);
    const values = Object.values(perms);
    expect(values.every(v => v === false)).toBe(true);
  });

  it('unknown role falls back to USER (all false)', () => {
    const svc = makeService();
    const perms = svc.getPermissions('UNKNOWN_ROLE' as UserRoleEnum);
    expect(perms.canAccessAdmin).toBe(false);
    expect(perms.canViewAnalytics).toBe(false);
  });
});

describe('PermissionsService.hasPermission', () => {
  it('returns true when role has the permission', () => {
    const svc = makeService();
    expect(svc.hasPermission(UserRoleEnum.ADMIN, 'canDeleteUsers')).toBe(true);
  });

  it('returns false when role lacks the permission', () => {
    const svc = makeService();
    expect(svc.hasPermission(UserRoleEnum.MODERATOR, 'canDeleteUsers')).toBe(false);
  });

  it('checks each permission key independently', () => {
    const svc = makeService();
    const allKeys: Array<keyof ReturnType<PermissionsService['getPermissions']>> = [
      'canAccessAdmin', 'canViewUsers', 'canViewUserDetails', 'canViewSensitiveData',
      'canCreateUsers', 'canUpdateUsers', 'canUpdateUserRoles', 'canDeleteUsers',
      'canResetPasswords', 'canViewAuditLogs', 'canManageCommunities',
      'canManageConversations', 'canViewAnalytics', 'canModerateContent',
      'canManageNotifications', 'canManageTranslations'
    ];
    for (const key of allKeys) {
      const result = svc.hasPermission(UserRoleEnum.BIGBOSS, key);
      expect(typeof result).toBe('boolean');
    }
  });
});

describe('PermissionsService.canManageUser', () => {
  let svc: PermissionsService;
  beforeEach(() => { svc = makeService(); });

  it('BIGBOSS can manage all lower roles', () => {
    const lowerRoles = [UserRoleEnum.ADMIN, UserRoleEnum.MODERATOR, UserRoleEnum.AUDIT, UserRoleEnum.ANALYST, UserRoleEnum.USER];
    for (const role of lowerRoles) {
      expect(svc.canManageUser(UserRoleEnum.BIGBOSS, role)).toBe(true);
    }
  });

  it('ADMIN can manage MODERATOR, AUDIT, ANALYST, USER but not BIGBOSS', () => {
    expect(svc.canManageUser(UserRoleEnum.ADMIN, UserRoleEnum.BIGBOSS)).toBe(false);
    expect(svc.canManageUser(UserRoleEnum.ADMIN, UserRoleEnum.MODERATOR)).toBe(true);
    expect(svc.canManageUser(UserRoleEnum.ADMIN, UserRoleEnum.USER)).toBe(true);
  });

  it('MODERATOR cannot manage ADMIN or BIGBOSS', () => {
    expect(svc.canManageUser(UserRoleEnum.MODERATOR, UserRoleEnum.ADMIN)).toBe(false);
    expect(svc.canManageUser(UserRoleEnum.MODERATOR, UserRoleEnum.BIGBOSS)).toBe(false);
  });

  it('MODERATOR can manage AUDIT, ANALYST, USER', () => {
    expect(svc.canManageUser(UserRoleEnum.MODERATOR, UserRoleEnum.AUDIT)).toBe(true);
    expect(svc.canManageUser(UserRoleEnum.MODERATOR, UserRoleEnum.ANALYST)).toBe(true);
    expect(svc.canManageUser(UserRoleEnum.MODERATOR, UserRoleEnum.USER)).toBe(true);
  });

  it('USER cannot manage anyone', () => {
    const roles = [UserRoleEnum.USER, UserRoleEnum.ANALYST, UserRoleEnum.AUDIT, UserRoleEnum.MODERATOR, UserRoleEnum.ADMIN, UserRoleEnum.BIGBOSS];
    for (const role of roles) {
      expect(svc.canManageUser(UserRoleEnum.USER, role)).toBe(false);
    }
  });

  it('same role cannot manage itself', () => {
    expect(svc.canManageUser(UserRoleEnum.ADMIN, UserRoleEnum.ADMIN)).toBe(false);
    expect(svc.canManageUser(UserRoleEnum.MODERATOR, UserRoleEnum.MODERATOR)).toBe(false);
  });
});

describe('PermissionsService.canViewSensitiveData', () => {
  let svc: PermissionsService;
  beforeEach(() => { svc = makeService(); });

  it('returns true for BIGBOSS and ADMIN', () => {
    expect(svc.canViewSensitiveData(UserRoleEnum.BIGBOSS)).toBe(true);
    expect(svc.canViewSensitiveData(UserRoleEnum.ADMIN)).toBe(true);
  });

  it('returns false for MODERATOR, AUDIT, ANALYST, USER', () => {
    expect(svc.canViewSensitiveData(UserRoleEnum.MODERATOR)).toBe(false);
    expect(svc.canViewSensitiveData(UserRoleEnum.AUDIT)).toBe(false);
    expect(svc.canViewSensitiveData(UserRoleEnum.ANALYST)).toBe(false);
    expect(svc.canViewSensitiveData(UserRoleEnum.USER)).toBe(false);
  });
});

describe('PermissionsService.canModifyUser', () => {
  let svc: PermissionsService;
  beforeEach(() => { svc = makeService(); });

  it('returns true when admin has canUpdateUsers and can manage target role', () => {
    expect(svc.canModifyUser(UserRoleEnum.ADMIN, UserRoleEnum.USER)).toBe(true);
  });

  it('returns false when admin lacks canUpdateUsers (MODERATOR)', () => {
    expect(svc.canModifyUser(UserRoleEnum.MODERATOR, UserRoleEnum.USER)).toBe(false);
  });

  it('returns false when admin has canUpdateUsers but cannot manage target role', () => {
    // ADMIN has canUpdateUsers but cannot manage BIGBOSS (higher rank)
    expect(svc.canModifyUser(UserRoleEnum.ADMIN, UserRoleEnum.BIGBOSS)).toBe(false);
  });

  it('returns false for USER trying to modify anyone', () => {
    expect(svc.canModifyUser(UserRoleEnum.USER, UserRoleEnum.USER)).toBe(false);
  });
});

describe('PermissionsService.canChangeRole', () => {
  let svc: PermissionsService;
  beforeEach(() => { svc = makeService(); });

  it('returns true when admin can manage both current and new role', () => {
    expect(svc.canChangeRole(UserRoleEnum.ADMIN, UserRoleEnum.USER, UserRoleEnum.ANALYST)).toBe(true);
  });

  it('returns false when admin lacks canUpdateUserRoles (MODERATOR)', () => {
    expect(svc.canChangeRole(UserRoleEnum.MODERATOR, UserRoleEnum.USER, UserRoleEnum.ANALYST)).toBe(false);
  });

  it('returns false when admin cannot manage current target role', () => {
    expect(svc.canChangeRole(UserRoleEnum.ADMIN, UserRoleEnum.BIGBOSS, UserRoleEnum.USER)).toBe(false);
  });

  it('returns false when admin cannot manage new target role', () => {
    // ADMIN can manage current USER but cannot assign BIGBOSS rank
    expect(svc.canChangeRole(UserRoleEnum.ADMIN, UserRoleEnum.USER, UserRoleEnum.BIGBOSS)).toBe(false);
  });

  it('BIGBOSS can change roles between any two roles', () => {
    expect(svc.canChangeRole(UserRoleEnum.BIGBOSS, UserRoleEnum.USER, UserRoleEnum.ADMIN)).toBe(true);
    expect(svc.canChangeRole(UserRoleEnum.BIGBOSS, UserRoleEnum.MODERATOR, UserRoleEnum.ANALYST)).toBe(true);
  });
});
