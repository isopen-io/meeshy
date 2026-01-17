/**
 * Tests for PermissionsService
 *
 * Tests role-based permissions, user management authorization,
 * role hierarchy, and permission validation
 */

import { PermissionsService } from '@/services/permissions.service';
import { User, UserRole, UserPermissions, ROLE_HIERARCHY, UserRoleEnum } from '@meeshy/shared/types';

// Mock user-adapter
jest.mock('@/utils/user-adapter', () => ({
  getDefaultPermissions: jest.fn((role: string) => {
    const permissions: Record<string, UserPermissions> = {
      BIGBOSS: {
        canAccessAdmin: true,
        canManageUsers: true,
        canManageGroups: true,
        canManageConversations: true,
        canModerateContent: true,
        canViewAnalytics: true,
        canViewAuditLogs: true,
        canManageTranslations: true,
        canSendMessages: true,
        canCreateGroups: true,
        canUploadFiles: true,
        canUseVoice: true,
      },
      ADMIN: {
        canAccessAdmin: true,
        canManageUsers: true,
        canManageGroups: true,
        canManageConversations: true,
        canModerateContent: true,
        canViewAnalytics: true,
        canViewAuditLogs: true,
        canManageTranslations: false,
        canSendMessages: true,
        canCreateGroups: true,
        canUploadFiles: true,
        canUseVoice: true,
      },
      MODERATOR: {
        canAccessAdmin: true,
        canManageUsers: false,
        canManageGroups: true,
        canManageConversations: true,
        canModerateContent: true,
        canViewAnalytics: false,
        canViewAuditLogs: false,
        canManageTranslations: false,
        canSendMessages: true,
        canCreateGroups: true,
        canUploadFiles: true,
        canUseVoice: true,
      },
      USER: {
        canAccessAdmin: false,
        canManageUsers: false,
        canManageGroups: false,
        canManageConversations: false,
        canModerateContent: false,
        canViewAnalytics: false,
        canViewAuditLogs: false,
        canManageTranslations: false,
        canSendMessages: true,
        canCreateGroups: false,
        canUploadFiles: true,
        canUseVoice: true,
      },
    };
    return permissions[role] || permissions.USER;
  }),
}));

describe('PermissionsService', () => {
  const createMockUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    phoneNumber: '',
    role: 'USER' as UserRole,
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    autoTranslateEnabled: true,
    translateToSystemLanguage: true,
    translateToRegionalLanguage: false,
    useCustomDestination: false,
    isOnline: true,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    permissions: {
      canAccessAdmin: false,
      canManageUsers: false,
      canManageGroups: false,
      canManageConversations: false,
      canModerateContent: false,
      canViewAnalytics: false,
      canViewAuditLogs: false,
      canManageTranslations: false,
      canSendMessages: true,
      canCreateGroups: false,
      canUploadFiles: true,
      canUseVoice: true,
    },
    ...overrides,
  });

  describe('hasPermission', () => {
    it('should return true for granted permission', () => {
      const admin = createMockUser({
        role: 'ADMIN' as UserRole,
      });

      expect(PermissionsService.hasPermission(admin, 'canAccessAdmin')).toBe(true);
      expect(PermissionsService.hasPermission(admin, 'canManageUsers')).toBe(true);
    });

    it('should return false for denied permission', () => {
      const user = createMockUser({
        role: 'USER' as UserRole,
      });

      expect(PermissionsService.hasPermission(user, 'canAccessAdmin')).toBe(false);
      expect(PermissionsService.hasPermission(user, 'canManageUsers')).toBe(false);
    });

    it('should check permissions based on role, not stored permissions', () => {
      // Even if user.permissions says true, the role-based check should determine
      const user = createMockUser({
        role: 'USER' as UserRole,
        permissions: {
          canAccessAdmin: true, // This should be ignored
        } as any,
      });

      // The service uses getDefaultPermissions based on role
      expect(PermissionsService.hasPermission(user, 'canAccessAdmin')).toBe(false);
    });
  });

  describe('canAccessAdmin', () => {
    it('should return true for BIGBOSS', () => {
      const bigboss = createMockUser({ role: 'BIGBOSS' as UserRole });
      expect(PermissionsService.canAccessAdmin(bigboss)).toBe(true);
    });

    it('should return true for ADMIN', () => {
      const admin = createMockUser({ role: 'ADMIN' as UserRole });
      expect(PermissionsService.canAccessAdmin(admin)).toBe(true);
    });

    it('should return true for MODERATOR', () => {
      const moderator = createMockUser({ role: 'MODERATOR' as UserRole });
      expect(PermissionsService.canAccessAdmin(moderator)).toBe(true);
    });

    it('should return false for USER', () => {
      const user = createMockUser({ role: 'USER' as UserRole });
      expect(PermissionsService.canAccessAdmin(user)).toBe(false);
    });
  });

  describe('hasRoleOrHigher', () => {
    it('should return true when user has higher role', () => {
      const admin = createMockUser({ role: 'ADMIN' as UserRole });
      // Note: ROLE_HIERARCHY uses 'MODO' not 'MODERATOR'
      expect(PermissionsService.hasRoleOrHigher(admin, 'MODO' as UserRole)).toBe(true);
      expect(PermissionsService.hasRoleOrHigher(admin, 'USER' as UserRole)).toBe(true);
    });

    it('should return true when user has same role', () => {
      const admin = createMockUser({ role: 'ADMIN' as UserRole });
      expect(PermissionsService.hasRoleOrHigher(admin, 'ADMIN' as UserRole)).toBe(true);
    });

    it('should return false when user has lower role', () => {
      const user = createMockUser({ role: 'USER' as UserRole });
      expect(PermissionsService.hasRoleOrHigher(user, 'ADMIN' as UserRole)).toBe(false);
      expect(PermissionsService.hasRoleOrHigher(user, 'MODO' as UserRole)).toBe(false);
    });
  });

  describe('canManageUser', () => {
    it('should return false when trying to manage self', () => {
      const admin = createMockUser({
        id: 'admin-1',
        role: 'ADMIN' as UserRole,
      });

      expect(PermissionsService.canManageUser(admin, admin)).toBe(false);
    });

    it('should return false when lacking canManageUsers permission', () => {
      const user = createMockUser({
        id: 'user-1',
        role: 'USER' as UserRole,
      });
      const targetUser = createMockUser({
        id: 'user-2',
        role: 'USER' as UserRole,
      });

      expect(PermissionsService.canManageUser(user, targetUser)).toBe(false);
    });

    it('should return true when admin manages lower role user', () => {
      const admin = createMockUser({
        id: 'admin-1',
        role: 'ADMIN' as UserRole,
      });
      const user = createMockUser({
        id: 'user-1',
        role: 'USER' as UserRole,
      });

      expect(PermissionsService.canManageUser(admin, user)).toBe(true);
    });

    it('should return false when trying to manage higher role', () => {
      const moderator = createMockUser({
        id: 'mod-1',
        role: 'MODERATOR' as UserRole,
      });
      const admin = createMockUser({
        id: 'admin-1',
        role: 'ADMIN' as UserRole,
      });

      expect(PermissionsService.canManageUser(moderator, admin)).toBe(false);
    });

    it('should return false when trying to manage same role', () => {
      const admin1 = createMockUser({
        id: 'admin-1',
        role: 'ADMIN' as UserRole,
      });
      const admin2 = createMockUser({
        id: 'admin-2',
        role: 'ADMIN' as UserRole,
      });

      expect(PermissionsService.canManageUser(admin1, admin2)).toBe(false);
    });
  });

  describe('getDefaultPermissions', () => {
    it('should return permissions for BIGBOSS', () => {
      const permissions = PermissionsService.getDefaultPermissions('BIGBOSS' as UserRole);

      expect(permissions.canAccessAdmin).toBe(true);
      expect(permissions.canManageUsers).toBe(true);
      expect(permissions.canManageTranslations).toBe(true);
    });

    it('should return permissions for USER', () => {
      const permissions = PermissionsService.getDefaultPermissions('USER' as UserRole);

      // DEFAULT_PERMISSIONS from shared/types only defines admin-related permissions
      expect(permissions.canAccessAdmin).toBe(false);
      expect(permissions.canManageUsers).toBe(false);
      // canSendMessages is not part of the shared DEFAULT_PERMISSIONS
      expect(permissions.canModerateContent).toBe(false);
    });
  });

  describe('canAssignRole', () => {
    it('should return true when assigning lower role', () => {
      const admin = createMockUser({ role: 'ADMIN' as UserRole });
      // Note: ROLE_HIERARCHY uses 'MODO' not 'MODERATOR'
      expect(PermissionsService.canAssignRole(admin, 'MODO' as UserRole)).toBe(true);
      expect(PermissionsService.canAssignRole(admin, 'USER' as UserRole)).toBe(true);
    });

    it('should return false when assigning same or higher role', () => {
      const admin = createMockUser({ role: 'ADMIN' as UserRole });

      expect(PermissionsService.canAssignRole(admin, 'ADMIN' as UserRole)).toBe(false);
      expect(PermissionsService.canAssignRole(admin, 'BIGBOSS' as UserRole)).toBe(false);
    });

    it('should return false when lacking canManageUsers permission', () => {
      const user = createMockUser({ role: 'USER' as UserRole });

      expect(PermissionsService.canAssignRole(user, 'USER' as UserRole)).toBe(false);
    });
  });

  describe('getAssignableRoles', () => {
    it('should return lower roles for admin', () => {
      const admin = createMockUser({ role: 'ADMIN' as UserRole });

      const assignableRoles = PermissionsService.getAssignableRoles(admin);

      expect(assignableRoles).toContain('USER');
      expect(assignableRoles).not.toContain('ADMIN');
      expect(assignableRoles).not.toContain('BIGBOSS');
    });

    it('should return empty array for USER', () => {
      const user = createMockUser({ role: 'USER' as UserRole });

      const assignableRoles = PermissionsService.getAssignableRoles(user);

      expect(assignableRoles).toEqual([]);
    });

    it('should return roles sorted by hierarchy', () => {
      const bigboss = createMockUser({ role: 'BIGBOSS' as UserRole });

      const assignableRoles = PermissionsService.getAssignableRoles(bigboss);

      // Should be sorted from highest to lowest
      const hierarchyOrder = assignableRoles.map((role) => ROLE_HIERARCHY[role]);
      for (let i = 0; i < hierarchyOrder.length - 1; i++) {
        expect(hierarchyOrder[i]).toBeGreaterThanOrEqual(hierarchyOrder[i + 1]);
      }
    });
  });

  describe('getRoleDisplayName', () => {
    it('should return display name for known roles', () => {
      expect(PermissionsService.getRoleDisplayName('BIGBOSS')).toBe('Super Administrateur');
      expect(PermissionsService.getRoleDisplayName('ADMIN')).toBe('Administrateur');
      expect(PermissionsService.getRoleDisplayName('MODO')).toBe('Modérateur');
      expect(PermissionsService.getRoleDisplayName('USER')).toBe('Utilisateur');
    });

    it('should return role as-is for unknown roles', () => {
      expect(PermissionsService.getRoleDisplayName('UNKNOWN_ROLE' as any)).toBe('UNKNOWN_ROLE');
    });

    it('should handle MODERATOR as alias', () => {
      expect(PermissionsService.getRoleDisplayName('MODERATOR')).toBe('Modérateur');
    });
  });

  describe('getRoleColor', () => {
    it('should return color class for roles', () => {
      expect(PermissionsService.getRoleColor('BIGBOSS' as UserRole)).toContain('bg-purple');
      expect(PermissionsService.getRoleColor('ADMIN' as UserRole)).toContain('bg-red');
      expect(PermissionsService.getRoleColor('MODO' as UserRole)).toContain('bg-orange');
      expect(PermissionsService.getRoleColor('USER' as UserRole)).toContain('bg-gray');
    });
  });

  describe('getRoleIcon', () => {
    it('should return emoji icon for roles', () => {
      expect(PermissionsService.getRoleIcon('BIGBOSS' as UserRole)).toBeTruthy();
      expect(PermissionsService.getRoleIcon('ADMIN' as UserRole)).toBeTruthy();
      expect(PermissionsService.getRoleIcon('MODO' as UserRole)).toBeTruthy();
      expect(PermissionsService.getRoleIcon('USER' as UserRole)).toBeTruthy();
    });
  });

  describe('validatePermissions', () => {
    it('should return true for valid permissions within role', () => {
      // User role has no special permissions
      const permissions: UserPermissions = {
        canAccessAdmin: false,
        canManageUsers: false,
        canModerateContent: false,
      } as UserPermissions;

      expect(PermissionsService.validatePermissions('USER' as UserRole, permissions)).toBe(true);
    });

    it('should return false for permissions exceeding role', () => {
      const permissions: UserPermissions = {
        canAccessAdmin: true, // USER shouldn't have this
        canManageUsers: false,
        canSendMessages: true,
      } as UserPermissions;

      expect(PermissionsService.validatePermissions('USER' as UserRole, permissions)).toBe(false);
    });
  });

  describe('getRoleDescription', () => {
    it('should return description for known roles', () => {
      const bigbossDesc = PermissionsService.getRoleDescription('BIGBOSS' as UserRole);
      expect(bigbossDesc).toContain('complet');

      const userDesc = PermissionsService.getRoleDescription('USER' as UserRole);
      expect(userDesc).toContain('standard');
    });
  });

  describe('canPerformAction', () => {
    it('should check access_admin action', () => {
      const admin = createMockUser({ role: 'ADMIN' as UserRole });
      const user = createMockUser({ role: 'USER' as UserRole });

      expect(PermissionsService.canPerformAction(admin, 'access_admin')).toBe(true);
      expect(PermissionsService.canPerformAction(user, 'access_admin')).toBe(false);
    });

    it('should check delete_conversation action', () => {
      // Note: ROLE_HIERARCHY uses 'MODO' not 'MODERATOR'
      const moderator = createMockUser({ role: 'MODO' as UserRole });
      const user = createMockUser({ role: 'USER' as UserRole });

      expect(PermissionsService.canPerformAction(moderator, 'delete_conversation')).toBe(true);
      expect(PermissionsService.canPerformAction(user, 'delete_conversation')).toBe(false);
    });

    it('should check view_analytics action', () => {
      const admin = createMockUser({ role: 'ADMIN' as UserRole });
      const user = createMockUser({ role: 'USER' as UserRole });

      expect(PermissionsService.canPerformAction(admin, 'view_analytics')).toBe(true);
      expect(PermissionsService.canPerformAction(user, 'view_analytics')).toBe(false);
    });

    it('should check view_audit_logs action', () => {
      const admin = createMockUser({ role: 'ADMIN' as UserRole });
      const user = createMockUser({ role: 'USER' as UserRole });

      expect(PermissionsService.canPerformAction(admin, 'view_audit_logs')).toBe(true);
      expect(PermissionsService.canPerformAction(user, 'view_audit_logs')).toBe(false);
    });

    it('should return false for unknown action', () => {
      const admin = createMockUser({ role: 'ADMIN' as UserRole });

      expect(PermissionsService.canPerformAction(admin, 'unknown_action')).toBe(false);
    });

    it('should require targetUserId for manage_user action', () => {
      const admin = createMockUser({ role: 'ADMIN' as UserRole });

      expect(PermissionsService.canPerformAction(admin, 'manage_user')).toBe(false);
      expect(
        PermissionsService.canPerformAction(admin, 'manage_user', { targetUserId: 'user-1' })
      ).toBe(true);
    });
  });

  describe('getUserCapabilities', () => {
    it('should return capabilities summary for user', () => {
      const admin = createMockUser({
        role: 'ADMIN' as UserRole,
        permissions: {
          canAccessAdmin: true,
          canManageUsers: true,
          canViewAnalytics: true,
        } as UserPermissions,
      });

      const capabilities = PermissionsService.getUserCapabilities(admin);

      expect(capabilities.role).toBe('Administrateur');
      expect(capabilities.level).toBe(ROLE_HIERARCHY['ADMIN']);
      expect(capabilities.permissions).toContain('Accès administration');
      expect(capabilities.permissions).toContain('Gestion utilisateurs');
    });

    it('should include restrictions for regular user', () => {
      const user = createMockUser({
        role: 'USER' as UserRole,
        permissions: {
          canAccessAdmin: false,
          canManageUsers: false,
          canViewAnalytics: false,
        } as UserPermissions,
      });

      const capabilities = PermissionsService.getUserCapabilities(user);

      expect(capabilities.restrictions).toContain('Administration interdite');
      expect(capabilities.restrictions).toContain('Gestion utilisateurs interdite');
      expect(capabilities.restrictions).toContain('Analyses interdites');
    });
  });
});
