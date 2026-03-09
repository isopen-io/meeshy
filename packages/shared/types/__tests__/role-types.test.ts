import { describe, it, expect } from 'vitest';
import {
  GlobalUserRole,
  GLOBAL_ROLE_HIERARCHY,
  normalizeGlobalRole,
  isGlobalUserRole,
  hasMinimumRole,
  getEffectiveRole,
  getEffectiveRoleLevel,
  hasModeratorPrivileges,
} from '../role-types';

describe('AGENT role', () => {
  it('GlobalUserRole includes AGENT', () => {
    expect(GlobalUserRole.AGENT).toBe('AGENT');
  });

  it('AGENT has correct hierarchy level', () => {
    expect(GLOBAL_ROLE_HIERARCHY[GlobalUserRole.AGENT]).toBe(5);
  });

  it('normalizeGlobalRole recognizes AGENT', () => {
    expect(normalizeGlobalRole('AGENT')).toBe(GlobalUserRole.AGENT);
  });

  it('isGlobalUserRole accepts AGENT', () => {
    expect(isGlobalUserRole('AGENT')).toBe(true);
  });

  it('AGENT is below USER in hierarchy', () => {
    expect(hasMinimumRole('AGENT', 'USER')).toBe(false);
    expect(hasMinimumRole('USER', 'AGENT')).toBe(true);
  });
});

describe('getEffectiveRole', () => {
  it('returns global role when higher than member role', () => {
    expect(getEffectiveRole('ADMIN', 'member')).toBe('ADMIN');
  });

  it('returns member role uppercased when higher than global role', () => {
    expect(getEffectiveRole('USER', 'creator')).toBe('CREATOR');
  });

  it('returns global role when member role is empty', () => {
    expect(getEffectiveRole('USER', '')).toBe('USER');
  });

  it('returns global role when member role is undefined', () => {
    expect(getEffectiveRole('MODERATOR', undefined)).toBe('MODERATOR');
  });

  it('returns global role when member role is null', () => {
    expect(getEffectiveRole('ADMIN', null)).toBe('ADMIN');
  });

  it('handles BIGBOSS as highest', () => {
    expect(getEffectiveRole('BIGBOSS', 'creator')).toBe('BIGBOSS');
  });

  it('handles case-insensitive global role', () => {
    expect(getEffectiveRole('user', 'admin')).toBe('ADMIN');
  });

  it('handles case-insensitive member role', () => {
    expect(getEffectiveRole('USER', 'Creator')).toBe('CREATOR');
  });

  it('defaults to USER when global role is empty', () => {
    expect(getEffectiveRole('', 'member')).toBe('USER');
  });

  it('creator beats ANALYST', () => {
    expect(getEffectiveRole('ANALYST', 'creator')).toBe('CREATOR');
  });

  it('member admin (80) beats global MODERATOR (60)', () => {
    expect(getEffectiveRole('MODERATOR', 'admin')).toBe('ADMIN');
  });
});

describe('getEffectiveRoleLevel', () => {
  it('returns numeric level for effective role', () => {
    expect(getEffectiveRoleLevel('USER', 'creator')).toBe(70);
  });

  it('returns global level when higher', () => {
    expect(getEffectiveRoleLevel('BIGBOSS', 'member')).toBe(100);
  });

  it('returns 10 for USER with no member role', () => {
    expect(getEffectiveRoleLevel('USER', undefined)).toBe(10);
  });
});

describe('hasModeratorPrivileges', () => {
  it('returns true for BIGBOSS', () => expect(hasModeratorPrivileges('BIGBOSS')).toBe(true));
  it('returns true for ADMIN', () => expect(hasModeratorPrivileges('ADMIN')).toBe(true));
  it('returns true for CREATOR', () => expect(hasModeratorPrivileges('CREATOR')).toBe(true));
  it('returns true for MODERATOR', () => expect(hasModeratorPrivileges('MODERATOR')).toBe(true));
  it('returns false for USER', () => expect(hasModeratorPrivileges('USER')).toBe(false));
  it('returns false for MEMBER', () => expect(hasModeratorPrivileges('MEMBER')).toBe(false));
  it('returns false for ANALYST', () => expect(hasModeratorPrivileges('ANALYST')).toBe(false));
  it('returns false for AUDIT', () => expect(hasModeratorPrivileges('AUDIT')).toBe(false));
  it('is case insensitive', () => expect(hasModeratorPrivileges('creator')).toBe(true));
});
