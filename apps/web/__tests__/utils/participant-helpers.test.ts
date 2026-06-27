/**
 * Tests for utils/participant-helpers.ts
 */

jest.mock('@/lib/avatar-utils', () => ({
  getUserInitials: jest.fn((user: any) => {
    if (!user) return '??';
    if (user.firstName && user.lastName) return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    if (user.displayName) return user.displayName.slice(0, 2).toUpperCase();
    return user.username?.slice(0, 2).toUpperCase() ?? '??';
  }),
}));

import {
  isAnonymousParticipant,
  getParticipantDisplayName,
  getParticipantInitials,
  isParticipantModerator,
} from '@/utils/participant-helpers';

// ─── isAnonymousParticipant ───────────────────────────────────────────────────

describe('isAnonymousParticipant', () => {
  it('returns true when type is anonymous', () => {
    expect(isAnonymousParticipant({ type: 'anonymous' })).toBe(true);
  });

  it('returns true when user has sessionToken property', () => {
    expect(isAnonymousParticipant({ sessionToken: 'token123' })).toBe(true);
  });

  it('returns true when user has shareLinkId property', () => {
    expect(isAnonymousParticipant({ shareLinkId: 'link-abc' })).toBe(true);
  });

  it('returns false for a registered user', () => {
    expect(isAnonymousParticipant({ type: 'registered', userId: 'u1' })).toBe(false);
  });

  it('returns falsy for null/undefined', () => {
    expect(isAnonymousParticipant(null)).toBeFalsy();
    expect(isAnonymousParticipant(undefined)).toBeFalsy();
  });
});

// ─── getParticipantDisplayName ────────────────────────────────────────────────

describe('getParticipantDisplayName', () => {
  it('prefers displayName when set', () => {
    expect(getParticipantDisplayName({ displayName: 'Alice', username: 'alice99' })).toBe('Alice');
  });

  it('falls back to firstName + lastName', () => {
    expect(getParticipantDisplayName({ firstName: 'Bob', lastName: 'Smith', username: 'bob' })).toBe('Bob Smith');
  });

  it('falls back to username when no displayName or name parts', () => {
    expect(getParticipantDisplayName({ username: 'charlie99' })).toBe('charlie99');
  });

  it('handles firstName only', () => {
    expect(getParticipantDisplayName({ firstName: 'Dave', username: 'dave' })).toBe('Dave');
  });

  it('handles empty displayName by falling through', () => {
    expect(getParticipantDisplayName({ displayName: '', firstName: 'Eve', username: 'eve' })).toBe('Eve');
  });
});

// ─── getParticipantInitials ───────────────────────────────────────────────────

describe('getParticipantInitials', () => {
  it('returns initials from firstName and lastName', () => {
    expect(getParticipantInitials({ firstName: 'Frank', lastName: 'Green', username: 'fg' })).toBe('FG');
  });

  it('returns ?? for null user (mock behaviour)', () => {
    expect(getParticipantInitials(null as any)).toBe('??');
  });

  it('uses displayName fallback (mock behaviour)', () => {
    expect(getParticipantInitials({ displayName: 'Hiro', username: 'hiro' })).toBe('HI');
  });
});

// ─── isParticipantModerator ───────────────────────────────────────────────────

describe('isParticipantModerator', () => {
  it('returns true for moderator role', () => {
    expect(isParticipantModerator('moderator')).toBe(true);
  });

  it('returns true for admin role (higher than moderator)', () => {
    expect(isParticipantModerator('admin')).toBe(true);
  });

  it('returns true for creator role (highest)', () => {
    expect(isParticipantModerator('creator')).toBe(true);
  });

  it('returns false for member role (below moderator)', () => {
    expect(isParticipantModerator('member')).toBe(false);
  });

  it('lowercases the input before checking', () => {
    expect(isParticipantModerator('MODERATOR')).toBe(true);
    expect(isParticipantModerator('MEMBER')).toBe(false);
  });
});
