/**
 * Tests for utils/participant-mapper.ts
 */

import {
  DEFAULT_FRONTEND_PERMISSIONS,
  mapCurrentUserToUser,
  mapMemberToUser,
  mapAnonymousParticipantToUser,
  mapParticipantsFromLinkData,
  getAnonymousPermissionHints,
} from '@/utils/participant-mapper';

const makeCurrentUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'u-1',
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  language: 'en',
  ...overrides,
});

const makeMember = (overrides: Record<string, unknown> = {}) => ({
  user: {
    id: 'u-2',
    username: 'bob',
    firstName: 'Bob',
    lastName: 'Jones',
    displayName: 'Bob Jones',
    avatar: 'b.png',
    isOnline: true,
    lastActiveAt: new Date().toISOString(),
    ...((overrides as any).user || {}),
  },
  role: 'member',
  ...overrides,
});

const makeAnonymous = (overrides: Record<string, unknown> = {}) => ({
  id: 'anon-1',
  username: 'anon_user',
  firstName: 'Anon',
  lastName: 'User',
  language: 'fr',
  isOnline: false,
  lastActiveAt: new Date().toISOString(),
  joinedAt: new Date().toISOString(),
  ...overrides,
});

const makeLink = (overrides: Record<string, unknown> = {}) => ({
  allowAnonymousFiles: true,
  allowAnonymousImages: true,
  ...overrides,
});

const makeLinkData = (overrides: Record<string, unknown> = {}) =>
  ({
    currentUser: makeCurrentUser(),
    members: [makeMember()],
    anonymousParticipants: [makeAnonymous()],
    link: makeLink(),
    ...overrides,
  } as any);

// ─── DEFAULT_FRONTEND_PERMISSIONS ─────────────────────────────────────────────

describe('DEFAULT_FRONTEND_PERMISSIONS', () => {
  it('has all permissions set to false', () => {
    for (const value of Object.values(DEFAULT_FRONTEND_PERMISSIONS)) {
      expect(value).toBe(false);
    }
  });
});

// ─── mapCurrentUserToUser ─────────────────────────────────────────────────────

describe('mapCurrentUserToUser', () => {
  it('maps id correctly', () => {
    expect(mapCurrentUserToUser(makeCurrentUser()).id).toBe('u-1');
  });

  it('maps username correctly', () => {
    expect(mapCurrentUserToUser(makeCurrentUser()).username).toBe('alice');
  });

  it('maps displayName correctly', () => {
    expect(mapCurrentUserToUser(makeCurrentUser()).displayName).toBe('Alice Smith');
  });

  it('falls back to username when displayName is absent', () => {
    const user = mapCurrentUserToUser(makeCurrentUser({ displayName: undefined }));
    expect(user.displayName).toBe('alice');
  });

  it('sets systemLanguage from language field', () => {
    expect(mapCurrentUserToUser(makeCurrentUser({ language: 'es' })).systemLanguage).toBe('es');
  });

  it('defaults language to "fr" when absent', () => {
    expect(mapCurrentUserToUser(makeCurrentUser({ language: undefined })).systemLanguage).toBe('fr');
  });

  it('sets role to USER', () => {
    expect(mapCurrentUserToUser(makeCurrentUser()).role).toBe('USER');
  });
});

// ─── mapMemberToUser ──────────────────────────────────────────────────────────

describe('mapMemberToUser', () => {
  it('maps id from nested user', () => {
    expect(mapMemberToUser(makeMember()).id).toBe('u-2');
  });

  it('maps avatar from nested user', () => {
    expect(mapMemberToUser(makeMember()).avatar).toBe('b.png');
  });

  it('maps isOnline correctly', () => {
    expect(mapMemberToUser(makeMember()).isOnline).toBe(true);
  });

  it('sets systemLanguage to "fr"', () => {
    expect(mapMemberToUser(makeMember()).systemLanguage).toBe('fr');
  });
});

// ─── mapAnonymousParticipantToUser ────────────────────────────────────────────

describe('mapAnonymousParticipantToUser', () => {
  it('maps id correctly', () => {
    expect(mapAnonymousParticipantToUser(makeAnonymous()).id).toBe('anon-1');
  });

  it('sets displayName to username for anonymous participants', () => {
    const user = mapAnonymousParticipantToUser(makeAnonymous());
    expect(user.displayName).toBe(user.username);
  });

  it('sets systemLanguage from participant language', () => {
    const user = mapAnonymousParticipantToUser(makeAnonymous({ language: 'es' }));
    expect(user.systemLanguage).toBe('es');
  });

  it('defaults language to "fr" when absent', () => {
    const user = mapAnonymousParticipantToUser(makeAnonymous({ language: undefined }));
    expect(user.systemLanguage).toBe('fr');
  });
});

// ─── mapParticipantsFromLinkData ──────────────────────────────────────────────

describe('mapParticipantsFromLinkData', () => {
  it('includes current user when isAnonymous is true', () => {
    const data = makeLinkData();
    const users = mapParticipantsFromLinkData(data, true);
    expect(users.some(u => u.id === 'u-1')).toBe(true);
  });

  it('does not include current user when isAnonymous is false', () => {
    const data = makeLinkData();
    const users = mapParticipantsFromLinkData(data, false);
    expect(users.some(u => u.id === 'u-1')).toBe(false);
  });

  it('always includes members', () => {
    const data = makeLinkData();
    const users = mapParticipantsFromLinkData(data, false);
    expect(users.some(u => u.id === 'u-2')).toBe(true);
  });

  it('includes anonymous participants', () => {
    const data = makeLinkData();
    const users = mapParticipantsFromLinkData(data, false);
    expect(users.some(u => u.id === 'anon-1')).toBe(true);
  });

  it('skips anonymous participant if they are the current user (anonymous flow)', () => {
    const data = makeLinkData({
      currentUser: makeCurrentUser({ id: 'anon-1' }),
      anonymousParticipants: [makeAnonymous({ id: 'anon-1' })],
    });
    const users = mapParticipantsFromLinkData(data, true);
    // anon-1 is the currentUser so they're only added once (via mapCurrentUserToUser)
    expect(users.filter(u => u.id === 'anon-1')).toHaveLength(1);
  });

  it('handles empty members and anonymousParticipants gracefully', () => {
    const data = makeLinkData({ members: [], anonymousParticipants: [] });
    expect(() => mapParticipantsFromLinkData(data, false)).not.toThrow();
  });
});

// ─── getAnonymousPermissionHints ──────────────────────────────────────────────

describe('getAnonymousPermissionHints', () => {
  it('returns empty array when all permissions are allowed', () => {
    expect(getAnonymousPermissionHints(makeLink())).toHaveLength(0);
  });

  it('adds file hint when files are not allowed', () => {
    const hints = getAnonymousPermissionHints(makeLink({ allowAnonymousFiles: false }));
    expect(hints.some(h => h.toLowerCase().includes('fichier'))).toBe(true);
  });

  it('adds image hint when images are not allowed', () => {
    const hints = getAnonymousPermissionHints(makeLink({ allowAnonymousImages: false }));
    expect(hints.some(h => h.toLowerCase().includes('image'))).toBe(true);
  });

  it('returns two hints when both are forbidden', () => {
    const hints = getAnonymousPermissionHints(makeLink({ allowAnonymousFiles: false, allowAnonymousImages: false }));
    expect(hints).toHaveLength(2);
  });
});
