/**
 * Tests for utils/participant-helpers.ts
 */

jest.mock('@/lib/avatar-utils', () => ({
  getUserInitials: (user: any) => {
    const name = user.displayName || user.username || '';
    return name.slice(0, 2).toUpperCase();
  },
}));

import {
  isAnonymousParticipant,
  getParticipantDisplayName,
  getParticipantInitials,
  isParticipantModerator,
} from '@/utils/participant-helpers';

// ─── isAnonymousParticipant ───────────────────────────────────────────────────

describe('isAnonymousParticipant', () => {
  it('returns true for a user with type=anonymous', () => {
    expect(isAnonymousParticipant({ type: 'anonymous' })).toBe(true);
  });

  it('returns true when the user has a sessionToken property', () => {
    expect(isAnonymousParticipant({ sessionToken: 'tok' })).toBe(true);
  });

  it('returns true when the user has a shareLinkId property', () => {
    expect(isAnonymousParticipant({ shareLinkId: 'link-1' })).toBe(true);
  });

  it('returns false for a regular user', () => {
    expect(isAnonymousParticipant({ type: 'user', id: 'u-1' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAnonymousParticipant(null)).toBeFalsy();
  });

  it('returns false for undefined', () => {
    expect(isAnonymousParticipant(undefined)).toBeFalsy();
  });
});

// ─── getParticipantDisplayName ────────────────────────────────────────────────

describe('getParticipantDisplayName', () => {
  it('returns displayName when set', () => {
    expect(getParticipantDisplayName({ displayName: 'Alice Smith', username: 'alice' })).toBe('Alice Smith');
  });

  it('returns firstName + lastName when displayName is absent', () => {
    expect(getParticipantDisplayName({ firstName: 'Bob', lastName: 'Jones', username: 'bob' })).toBe('Bob Jones');
  });

  it('returns just firstName when lastName is absent', () => {
    expect(getParticipantDisplayName({ firstName: 'Bob', username: 'bob' })).toBe('Bob');
  });

  it('returns just lastName when firstName is absent', () => {
    expect(getParticipantDisplayName({ lastName: 'Jones', username: 'jones' })).toBe('Jones');
  });

  it('returns username as last resort', () => {
    expect(getParticipantDisplayName({ username: 'charlie' })).toBe('charlie');
  });
});

// ─── getParticipantInitials ───────────────────────────────────────────────────

describe('getParticipantInitials', () => {
  it('returns initials from the mocked getUserInitials', () => {
    const initials = getParticipantInitials({ displayName: 'Alice', username: 'alice' });
    expect(typeof initials).toBe('string');
    expect(initials.length).toBeGreaterThan(0);
  });
});

// ─── isParticipantModerator ───────────────────────────────────────────────────

describe('isParticipantModerator', () => {
  it('returns true for MODERATOR role', () => {
    expect(isParticipantModerator('MODERATOR')).toBe(true);
  });

  it('returns true for ADMIN role (higher than MODERATOR)', () => {
    expect(isParticipantModerator('ADMIN')).toBe(true);
  });

  it('returns false for USER role', () => {
    expect(isParticipantModerator('USER')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isParticipantModerator('moderator')).toBe(true);
  });
});
