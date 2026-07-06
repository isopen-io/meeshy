/**
 * routes/auth/types unit tests — pure formatting functions
 *
 * @jest-environment node
 */

import {
  formatUserResponse,
  formatSessionResponse,
} from '../../../../routes/auth/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_001',
    username: 'alice',
    email: 'alice@meeshy.me',
    firstName: 'Alice',
    lastName: 'Dupont',
    displayName: 'Alice Dupont',
    bio: 'Hello there',
    avatar: 'https://cdn.meeshy.me/avatars/alice.jpg',
    banner: null,
    phoneNumber: '+33612345678',
    role: 'USER',
    isActive: true,
    deactivatedAt: null,
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    customDestinationLanguage: null,
    autoTranslateEnabled: true,
    isOnline: false,
    lastActiveAt: new Date('2026-01-01T12:00:00Z'),
    emailVerifiedAt: new Date('2025-01-01T00:00:00Z'),
    phoneVerifiedAt: null,
    twoFactorEnabledAt: null,
    pendingEmail: null,
    pendingPhone: null,
    pendingPhoneNumber: null,
    lastPasswordChange: null,
    lastLoginIp: null,
    lastLoginLocation: null,
    lastLoginDevice: null,
    profileCompletionRate: 80,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T12:00:00Z'),
    permissions: null,
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session_abc',
    deviceType: 'mobile',
    browserName: 'Safari',
    osName: 'iOS',
    location: 'Paris, France',
    isMobile: true,
    createdAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatUserResponse
// ---------------------------------------------------------------------------

describe('formatUserResponse', () => {
  it('maps all standard user fields', () => {
    const user = makeUser();
    const result = formatUserResponse(user);

    expect(result.id).toBe('user_001');
    expect(result.username).toBe('alice');
    expect(result.email).toBe('alice@meeshy.me');
    expect(result.firstName).toBe('Alice');
    expect(result.lastName).toBe('Dupont');
    expect(result.displayName).toBe('Alice Dupont');
    expect(result.bio).toBe('Hello there');
    expect(result.avatar).toBe('https://cdn.meeshy.me/avatars/alice.jpg');
    expect(result.phoneNumber).toBe('+33612345678');
    expect(result.role).toBe('USER');
    expect(result.isActive).toBe(true);
    expect(result.systemLanguage).toBe('fr');
    expect(result.regionalLanguage).toBe('fr');
    expect(result.autoTranslateEnabled).toBe(true);
  });

  it('maps date fields correctly', () => {
    const user = makeUser();
    const result = formatUserResponse(user);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.lastActiveAt).toBeInstanceOf(Date);
    expect(result.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('falls back to null for missing banner', () => {
    const user = makeUser({ banner: undefined });
    expect(formatUserResponse(user).banner).toBeNull();
  });

  it('uses banner value when present', () => {
    const user = makeUser({ banner: 'https://cdn.meeshy.me/banners/b.jpg' });
    expect(formatUserResponse(user).banner).toBe('https://cdn.meeshy.me/banners/b.jpg');
  });

  it('falls back to null for missing pendingEmail', () => {
    const user = makeUser({ pendingEmail: undefined });
    expect(formatUserResponse(user).pendingEmail).toBeNull();
  });

  it('uses pendingEmail value when present', () => {
    const user = makeUser({ pendingEmail: 'newemail@meeshy.me' });
    expect(formatUserResponse(user).pendingEmail).toBe('newemail@meeshy.me');
  });

  it('uses pendingPhone from pendingPhone field', () => {
    const user = makeUser({ pendingPhone: '+33699999999' });
    expect(formatUserResponse(user).pendingPhone).toBe('+33699999999');
  });

  it('falls back to pendingPhoneNumber when pendingPhone is absent', () => {
    const user = makeUser({ pendingPhone: undefined, pendingPhoneNumber: '+33688888888' });
    expect(formatUserResponse(user).pendingPhone).toBe('+33688888888');
  });

  it('returns null for pendingPhone when both are absent', () => {
    const user = makeUser({ pendingPhone: undefined, pendingPhoneNumber: undefined });
    expect(formatUserResponse(user).pendingPhone).toBeNull();
  });

  it('uses explicit permissions argument over user.permissions', () => {
    const user = makeUser({ permissions: { canPost: false } });
    const explicitPermissions = { canPost: true, canDelete: true };
    expect(formatUserResponse(user, explicitPermissions).permissions).toEqual(explicitPermissions);
  });

  it('falls back to user.permissions when no explicit permissions passed', () => {
    const userPerms = { canPost: true };
    const user = makeUser({ permissions: userPerms });
    expect(formatUserResponse(user).permissions).toEqual(userPerms);
  });

  it('permissions is undefined when both are absent', () => {
    const user = makeUser({ permissions: undefined });
    expect(formatUserResponse(user).permissions).toBeUndefined();
  });

  it('handles null values for nullable date fields', () => {
    const user = makeUser({
      deactivatedAt: null,
      lastActiveAt: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      twoFactorEnabledAt: null,
      lastPasswordChange: null,
    });
    const result = formatUserResponse(user);
    expect(result.deactivatedAt).toBeNull();
    expect(result.emailVerifiedAt).toBeNull();
    expect(result.phoneVerifiedAt).toBeNull();
    expect(result.twoFactorEnabledAt).toBeNull();
    expect(result.lastPasswordChange).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatSessionResponse
// ---------------------------------------------------------------------------

describe('formatSessionResponse', () => {
  it('maps all session fields correctly', () => {
    const session = makeSession();
    const result = formatSessionResponse(session);

    expect(result.id).toBe('session_abc');
    expect(result.deviceType).toBe('mobile');
    expect(result.browserName).toBe('Safari');
    expect(result.osName).toBe('iOS');
    expect(result.location).toBe('Paris, France');
    expect(result.isMobile).toBe(true);
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('defaults isTrusted to false when rememberDevice not provided', () => {
    expect(formatSessionResponse(makeSession()).isTrusted).toBe(false);
  });

  it('sets isTrusted to true when rememberDevice is true', () => {
    expect(formatSessionResponse(makeSession(), true).isTrusted).toBe(true);
  });

  it('sets isTrusted to false when rememberDevice is false', () => {
    expect(formatSessionResponse(makeSession(), false).isTrusted).toBe(false);
  });

  it('handles null optional session fields', () => {
    const session = makeSession({
      deviceType: null,
      browserName: null,
      osName: null,
      location: null,
      isMobile: false,
    });
    const result = formatSessionResponse(session);
    expect(result.deviceType).toBeNull();
    expect(result.browserName).toBeNull();
    expect(result.osName).toBeNull();
    expect(result.location).toBeNull();
    expect(result.isMobile).toBe(false);
  });
});
