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
  MemberRole,
  MEMBER_ROLE_HIERARCHY,
  hasMinimumMemberRole,
  isMemberRole,
  isGlobalAdmin,
  isGlobalModerator,
  isMemberAdmin,
  isMemberModerator,
  isMemberCreator,
  WRITE_PERMISSION_HIERARCHY,
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

  it('normalizeGlobalRole defaults to USER for unknown role', () => {
    expect(normalizeGlobalRole('UNKNOWN_ROLE')).toBe(GlobalUserRole.USER);
  });

  it('normalizeGlobalRole defaults to USER for empty string', () => {
    expect(normalizeGlobalRole('')).toBe(GlobalUserRole.USER);
  });

  it('isGlobalUserRole accepts AGENT', () => {
    expect(isGlobalUserRole('AGENT')).toBe(true);
  });

  it('isGlobalUserRole rejects unknown values', () => {
    expect(isGlobalUserRole('UNKNOWN')).toBe(false);
    expect(isGlobalUserRole('')).toBe(false);
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

  it('member role wins when global role is unknown (level 0)', () => {
    expect(getEffectiveRole('STRANGER', 'member')).toBe('MEMBER');
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

  it('returns 10 when global role is empty (defaults to USER)', () => {
    expect(getEffectiveRoleLevel('', undefined)).toBe(10);
  });

  it('returns member level when global role is unknown (level 0)', () => {
    expect(getEffectiveRoleLevel('STRANGER', 'member')).toBe(10);
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
  it('returns false for unknown role (level 0)', () => expect(hasModeratorPrivileges('UNKNOWN_ROLE')).toBe(false));
});

describe('MemberRole enum', () => {
  it('has CREATOR value', () => expect(MemberRole.CREATOR).toBe('creator'));
  it('has ADMIN value', () => expect(MemberRole.ADMIN).toBe('admin'));
  it('has MODERATOR value', () => expect(MemberRole.MODERATOR).toBe('moderator'));
  it('has MEMBER value', () => expect(MemberRole.MEMBER).toBe('member'));
});

describe('MEMBER_ROLE_HIERARCHY', () => {
  it('creator has highest level 40', () => expect(MEMBER_ROLE_HIERARCHY[MemberRole.CREATOR]).toBe(40));
  it('admin has level 30', () => expect(MEMBER_ROLE_HIERARCHY[MemberRole.ADMIN]).toBe(30));
  it('moderator has level 20', () => expect(MEMBER_ROLE_HIERARCHY[MemberRole.MODERATOR]).toBe(20));
  it('member has lowest level 10', () => expect(MEMBER_ROLE_HIERARCHY[MemberRole.MEMBER]).toBe(10));
});

describe('hasMinimumMemberRole', () => {
  it('creator has creator or above', () => expect(hasMinimumMemberRole('creator', 'creator')).toBe(true));
  it('creator has admin or above', () => expect(hasMinimumMemberRole('creator', 'admin')).toBe(true));
  it('creator has moderator or above', () => expect(hasMinimumMemberRole('creator', 'moderator')).toBe(true));
  it('creator has member or above', () => expect(hasMinimumMemberRole('creator', 'member')).toBe(true));
  it('admin does not have creator or above', () => expect(hasMinimumMemberRole('admin', 'creator')).toBe(false));
  it('admin has admin or above', () => expect(hasMinimumMemberRole('admin', 'admin')).toBe(true));
  it('member does not have moderator or above', () => expect(hasMinimumMemberRole('member', 'moderator')).toBe(false));
  it('unknown role returns false when required role exists', () => {
    expect(hasMinimumMemberRole('stranger', 'member')).toBe(false);
  });
  it('accepts MemberRole enum values', () => {
    expect(hasMinimumMemberRole(MemberRole.ADMIN, MemberRole.MEMBER)).toBe(true);
  });
});

describe('isMemberRole', () => {
  it('returns true for creator', () => expect(isMemberRole('creator')).toBe(true));
  it('returns true for admin', () => expect(isMemberRole('admin')).toBe(true));
  it('returns true for moderator', () => expect(isMemberRole('moderator')).toBe(true));
  it('returns true for member', () => expect(isMemberRole('member')).toBe(true));
  it('returns true for CREATOR uppercase (case-insensitive)', () => expect(isMemberRole('CREATOR')).toBe(true));
  it('returns false for unknown value', () => expect(isMemberRole('guest')).toBe(false));
  it('returns false for empty string', () => expect(isMemberRole('')).toBe(false));
});

describe('isGlobalAdmin', () => {
  it('returns true for ADMIN', () => expect(isGlobalAdmin('ADMIN')).toBe(true));
  it('returns true for BIGBOSS', () => expect(isGlobalAdmin('BIGBOSS')).toBe(true));
  it('is case insensitive', () => expect(isGlobalAdmin('admin')).toBe(true));
  it('returns false for MODERATOR', () => expect(isGlobalAdmin('MODERATOR')).toBe(false));
  it('returns false for USER', () => expect(isGlobalAdmin('USER')).toBe(false));
  it('returns false for AUDIT', () => expect(isGlobalAdmin('AUDIT')).toBe(false));
  it('accepts GlobalUserRole enum', () => expect(isGlobalAdmin(GlobalUserRole.ADMIN)).toBe(true));
});

describe('isGlobalModerator', () => {
  it('returns true for MODERATOR', () => expect(isGlobalModerator('MODERATOR')).toBe(true));
  it('returns true for ADMIN (above moderator)', () => expect(isGlobalModerator('ADMIN')).toBe(true));
  it('returns true for BIGBOSS', () => expect(isGlobalModerator('BIGBOSS')).toBe(true));
  it('returns false for AUDIT (below moderator)', () => expect(isGlobalModerator('AUDIT')).toBe(false));
  it('returns false for USER', () => expect(isGlobalModerator('USER')).toBe(false));
  it('returns false for ANALYST', () => expect(isGlobalModerator('ANALYST')).toBe(false));
  it('accepts GlobalUserRole enum', () => expect(isGlobalModerator(GlobalUserRole.MODERATOR)).toBe(true));
});

describe('isMemberAdmin', () => {
  it('returns true for admin', () => expect(isMemberAdmin('admin')).toBe(true));
  it('is case insensitive', () => expect(isMemberAdmin('ADMIN')).toBe(true));
  it('returns false for creator (above admin)', () => expect(isMemberAdmin('creator')).toBe(false));
  it('returns false for moderator', () => expect(isMemberAdmin('moderator')).toBe(false));
  it('returns false for member', () => expect(isMemberAdmin('member')).toBe(false));
  it('accepts MemberRole enum', () => expect(isMemberAdmin(MemberRole.ADMIN)).toBe(true));
});

describe('isMemberModerator', () => {
  it('returns true for moderator', () => expect(isMemberModerator('moderator')).toBe(true));
  it('returns true for admin (above moderator)', () => expect(isMemberModerator('admin')).toBe(true));
  it('returns true for creator', () => expect(isMemberModerator('creator')).toBe(true));
  it('returns false for member', () => expect(isMemberModerator('member')).toBe(false));
  it('returns false for unknown role', () => expect(isMemberModerator('guest')).toBe(false));
  it('accepts MemberRole enum', () => expect(isMemberModerator(MemberRole.MODERATOR)).toBe(true));
});

describe('isMemberCreator', () => {
  it('returns true for creator', () => expect(isMemberCreator('creator')).toBe(true));
  it('is case insensitive', () => expect(isMemberCreator('CREATOR')).toBe(true));
  it('returns false for admin', () => expect(isMemberCreator('admin')).toBe(false));
  it('returns false for moderator', () => expect(isMemberCreator('moderator')).toBe(false));
  it('returns false for member', () => expect(isMemberCreator('member')).toBe(false));
  it('accepts MemberRole enum', () => expect(isMemberCreator(MemberRole.CREATOR)).toBe(true));
});

describe('WRITE_PERMISSION_HIERARCHY', () => {
  it('everyone has level 0', () => expect(WRITE_PERMISSION_HIERARCHY['everyone']).toBe(0));
  it('member has level 10', () => expect(WRITE_PERMISSION_HIERARCHY['member']).toBe(10));
  it('moderator has level 20', () => expect(WRITE_PERMISSION_HIERARCHY['moderator']).toBe(20));
  it('admin has level 30', () => expect(WRITE_PERMISSION_HIERARCHY['admin']).toBe(30));
  it('creator has level 40', () => expect(WRITE_PERMISSION_HIERARCHY['creator']).toBe(40));
  it('creator is stricter than admin', () => {
    expect(WRITE_PERMISSION_HIERARCHY['creator']).toBeGreaterThan(WRITE_PERMISSION_HIERARCHY['admin']);
  });
  it('everyone is least restrictive', () => {
    const allLevels = Object.values(WRITE_PERMISSION_HIERARCHY);
    expect(Math.min(...allLevels)).toBe(WRITE_PERMISSION_HIERARCHY['everyone']);
  });
});
