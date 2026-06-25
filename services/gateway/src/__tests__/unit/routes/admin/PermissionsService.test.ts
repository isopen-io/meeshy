/**
 * Unit tests for PermissionsService.
 * Covers getUserPermissions, hasPermission, canManageUser, getRoleLevel
 * across the full BIGBOSS → USER role hierarchy.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PermissionsService } from '../../../../routes/admin/services/PermissionsService';

const sut = new PermissionsService();

// ─── getUserPermissions ───────────────────────────────────────────────────────

describe('getUserPermissions', () => {
  it('grants all permissions to BIGBOSS', () => {
    const p = sut.getUserPermissions('BIGBOSS');

    expect(p.canAccessAdmin).toBe(true);
    expect(p.canManageUsers).toBe(true);
    expect(p.canManageCommunities).toBe(true);
    expect(p.canManageConversations).toBe(true);
    expect(p.canViewAnalytics).toBe(true);
    expect(p.canModerateContent).toBe(true);
    expect(p.canViewAuditLogs).toBe(true);
    expect(p.canManageNotifications).toBe(true);
    expect(p.canManageTranslations).toBe(true);
  });

  it('grants ADMIN all permissions except auditLogs and translations', () => {
    const p = sut.getUserPermissions('ADMIN');

    expect(p.canAccessAdmin).toBe(true);
    expect(p.canManageUsers).toBe(true);
    expect(p.canViewAuditLogs).toBe(false);
    expect(p.canManageTranslations).toBe(false);
  });

  it('grants MODERATOR content moderation but not user management or analytics', () => {
    const p = sut.getUserPermissions('MODERATOR');

    expect(p.canAccessAdmin).toBe(true);
    expect(p.canModerateContent).toBe(true);
    expect(p.canManageUsers).toBe(false);
    expect(p.canViewAnalytics).toBe(false);
    expect(p.canViewAuditLogs).toBe(false);
  });

  it('grants AUDIT read-only: analytics + auditLogs, nothing else', () => {
    const p = sut.getUserPermissions('AUDIT');

    expect(p.canAccessAdmin).toBe(true);
    expect(p.canViewAnalytics).toBe(true);
    expect(p.canViewAuditLogs).toBe(true);
    expect(p.canManageUsers).toBe(false);
    expect(p.canManageCommunities).toBe(false);
    expect(p.canModerateContent).toBe(false);
  });

  it('grants ANALYST only analytics (no admin access)', () => {
    const p = sut.getUserPermissions('ANALYST');

    expect(p.canAccessAdmin).toBe(false);
    expect(p.canViewAnalytics).toBe(true);
    expect(p.canManageUsers).toBe(false);
    expect(p.canModerateContent).toBe(false);
    expect(p.canViewAuditLogs).toBe(false);
  });

  it('grants USER no permissions at all', () => {
    const p = sut.getUserPermissions('USER');
    const values = Object.values(p);

    expect(values.every((v) => v === false)).toBe(true);
  });

  it('falls back to USER permissions for an unknown role', () => {
    const p = sut.getUserPermissions('GHOST' as any);
    const values = Object.values(p);

    expect(values.every((v) => v === false)).toBe(true);
  });
});

// ─── hasPermission ────────────────────────────────────────────────────────────

describe('hasPermission', () => {
  it('returns true when the role has the requested permission', () => {
    expect(sut.hasPermission('ADMIN', 'canManageUsers')).toBe(true);
  });

  it('returns false when the role lacks the requested permission', () => {
    expect(sut.hasPermission('MODERATOR', 'canManageUsers')).toBe(false);
  });

  it('returns true for BIGBOSS on every permission', () => {
    const permissions: Array<'canAccessAdmin' | 'canManageUsers' | 'canManageCommunities' | 'canManageConversations' | 'canViewAnalytics' | 'canModerateContent' | 'canViewAuditLogs' | 'canManageNotifications' | 'canManageTranslations'> = [
      'canAccessAdmin', 'canManageUsers', 'canManageCommunities',
      'canManageConversations', 'canViewAnalytics', 'canModerateContent',
      'canViewAuditLogs', 'canManageNotifications', 'canManageTranslations',
    ];

    for (const perm of permissions) {
      expect(sut.hasPermission('BIGBOSS', perm)).toBe(true);
    }
  });

  it('returns false for USER on every permission', () => {
    const permissions: Array<'canAccessAdmin' | 'canManageUsers' | 'canManageCommunities' | 'canManageConversations' | 'canViewAnalytics' | 'canModerateContent' | 'canViewAuditLogs' | 'canManageNotifications' | 'canManageTranslations'> = [
      'canAccessAdmin', 'canManageUsers', 'canManageCommunities',
      'canManageConversations', 'canViewAnalytics', 'canModerateContent',
      'canViewAuditLogs', 'canManageNotifications', 'canManageTranslations',
    ];

    for (const perm of permissions) {
      expect(sut.hasPermission('USER', perm)).toBe(false);
    }
  });
});

// ─── canManageUser ────────────────────────────────────────────────────────────

describe('canManageUser', () => {
  it('allows BIGBOSS to manage any role', () => {
    expect(sut.canManageUser('BIGBOSS', 'ADMIN')).toBe(true);
    expect(sut.canManageUser('BIGBOSS', 'MODERATOR')).toBe(true);
    expect(sut.canManageUser('BIGBOSS', 'USER')).toBe(true);
  });

  it('allows ADMIN to manage MODERATOR and below', () => {
    expect(sut.canManageUser('ADMIN', 'MODERATOR')).toBe(true);
    expect(sut.canManageUser('ADMIN', 'USER')).toBe(true);
  });

  it('prevents ADMIN from managing another ADMIN (same level)', () => {
    expect(sut.canManageUser('ADMIN', 'ADMIN')).toBe(false);
  });

  it('prevents ADMIN from managing BIGBOSS (higher level)', () => {
    expect(sut.canManageUser('ADMIN', 'BIGBOSS')).toBe(false);
  });

  it('prevents USER from managing anyone', () => {
    expect(sut.canManageUser('USER', 'USER')).toBe(false);
    expect(sut.canManageUser('USER', 'MODERATOR')).toBe(false);
  });

  it('returns false when the admin role is unknown', () => {
    expect(sut.canManageUser('GHOST' as any, 'USER')).toBe(false);
  });
});

// ─── getRoleLevel ─────────────────────────────────────────────────────────────

describe('getRoleLevel', () => {
  it('returns levels in strict descending order: BIGBOSS > ADMIN > MODERATOR > AUDIT > ANALYST > USER', () => {
    const bigboss = sut.getRoleLevel('BIGBOSS');
    const admin = sut.getRoleLevel('ADMIN');
    const moderator = sut.getRoleLevel('MODERATOR');
    const audit = sut.getRoleLevel('AUDIT');
    const analyst = sut.getRoleLevel('ANALYST');
    const user = sut.getRoleLevel('USER');

    expect(bigboss).toBeGreaterThan(admin);
    expect(admin).toBeGreaterThan(moderator);
    expect(moderator).toBeGreaterThan(audit);
    expect(audit).toBeGreaterThan(analyst);
    expect(analyst).toBeGreaterThan(user);
    expect(user).toBeGreaterThan(0);
  });

  it('returns 0 for an unknown role', () => {
    expect(sut.getRoleLevel('UNKNOWN' as any)).toBe(0);
  });
});
