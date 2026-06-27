/**
 * Tests for utils/user-display-name.ts
 */

import { getUserDisplayName, getUserDisplayNameOrNull } from '@/utils/user-display-name';

// ─── getUserDisplayName ───────────────────────────────────────────────────────

describe('getUserDisplayName', () => {
  it('returns fallback for null user', () => {
    expect(getUserDisplayName(null)).toBe('Utilisateur inconnu');
  });

  it('returns fallback for undefined user', () => {
    expect(getUserDisplayName(undefined)).toBe('Utilisateur inconnu');
  });

  it('uses custom fallback', () => {
    expect(getUserDisplayName(null, 'Unknown')).toBe('Unknown');
  });

  it('returns displayName when set', () => {
    expect(getUserDisplayName({ displayName: 'Alice', username: 'alice' })).toBe('Alice');
  });

  it('trims displayName whitespace', () => {
    expect(getUserDisplayName({ displayName: '  Alice  ', username: 'alice' })).toBe('Alice');
  });

  it('ignores empty displayName and uses firstName+lastName', () => {
    expect(getUserDisplayName({ displayName: '', firstName: 'Bob', lastName: 'Jones', username: 'bob' })).toBe('Bob Jones');
  });

  it('uses firstName alone when lastName is absent', () => {
    expect(getUserDisplayName({ firstName: 'Bob', username: 'bob' })).toBe('Bob');
  });

  it('uses lastName alone when firstName is absent', () => {
    expect(getUserDisplayName({ lastName: 'Jones', username: 'bob' })).toBe('Jones');
  });

  it('falls back to username when names are absent', () => {
    expect(getUserDisplayName({ username: 'charlie' })).toBe('charlie');
  });

  it('trims username', () => {
    expect(getUserDisplayName({ username: '  charlie  ' })).toBe('charlie');
  });

  it('returns fallback when all fields are empty', () => {
    expect(getUserDisplayName({ displayName: '', firstName: '', lastName: '', username: '' })).toBe('Utilisateur inconnu');
  });

  it('displayName takes priority over firstName+lastName', () => {
    expect(getUserDisplayName({ displayName: 'Alice', firstName: 'Bob', lastName: 'Jones', username: 'bob' })).toBe('Alice');
  });

  it('firstName+lastName takes priority over username', () => {
    expect(getUserDisplayName({ firstName: 'Bob', lastName: 'Jones', username: 'bob' })).toBe('Bob Jones');
  });
});

// ─── getUserDisplayNameOrNull ─────────────────────────────────────────────────

describe('getUserDisplayNameOrNull', () => {
  it('returns null for null user', () => {
    expect(getUserDisplayNameOrNull(null)).toBeNull();
  });

  it('returns null for undefined user', () => {
    expect(getUserDisplayNameOrNull(undefined)).toBeNull();
  });

  it('returns displayName when set', () => {
    expect(getUserDisplayNameOrNull({ displayName: 'Alice', username: 'alice' })).toBe('Alice');
  });

  it('returns firstName+lastName when displayName is absent', () => {
    expect(getUserDisplayNameOrNull({ firstName: 'Bob', lastName: 'Jones', username: 'bob' })).toBe('Bob Jones');
  });

  it('returns username as last resort', () => {
    expect(getUserDisplayNameOrNull({ username: 'charlie' })).toBe('charlie');
  });

  it('returns null when all fields are empty', () => {
    expect(getUserDisplayNameOrNull({ displayName: '', firstName: '', lastName: '', username: '' })).toBeNull();
  });
});
