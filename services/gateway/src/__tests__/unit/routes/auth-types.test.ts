/**
 * routes/auth/types.ts — unit tests
 *
 * Covers the two pure utility functions: formatUserResponse and formatSessionResponse.
 * Both are called consistently across all auth route modules (login, register,
 * magic-link, phone-transfer) to normalise the payload shape sent to clients.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { formatUserResponse, formatSessionResponse } from '../../../routes/auth/types';

// ── Factories ────────────────────────────────────────────────────────────────

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-abc-123',
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  bio: 'Hello world',
  avatar: 'https://cdn.example.com/alice.jpg',
  banner: 'https://cdn.example.com/banner.jpg',
  phoneNumber: '+33612345678',
  role: 'USER',
  isActive: true,
  deactivatedAt: null,
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: null,
  autoTranslateEnabled: true,
  isOnline: false,
  lastActiveAt: new Date('2026-01-01T12:00:00Z'),
  emailVerifiedAt: new Date('2026-01-01T08:00:00Z'),
  phoneVerifiedAt: null,
  twoFactorEnabledAt: null,
  pendingEmail: null,
  pendingPhone: null,
  lastPasswordChange: null,
  lastLoginIp: '127.0.0.1',
  lastLoginLocation: 'Paris, FR',
  lastLoginDevice: 'iPhone 16',
  profileCompletionRate: 75,
  createdAt: new Date('2025-06-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T12:00:00Z'),
  permissions: undefined,
  ...overrides,
});

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'sess-xyz-789',
  deviceType: 'mobile',
  browserName: 'Safari',
  osName: 'iOS',
  location: 'Paris, FR',
  isMobile: true,
  isTrusted: false,
  createdAt: new Date('2026-01-01T09:00:00Z'),
  ...overrides,
});

// ── formatUserResponse ────────────────────────────────────────────────────────

describe('formatUserResponse', () => {
  it('maps all fields from a complete user object', () => {
    const user = makeUser();
    const result = formatUserResponse(user);

    expect(result.id).toBe('user-abc-123');
    expect(result.username).toBe('alice');
    expect(result.email).toBe('alice@example.com');
    expect(result.firstName).toBe('Alice');
    expect(result.lastName).toBe('Smith');
    expect(result.displayName).toBe('Alice Smith');
    expect(result.bio).toBe('Hello world');
    expect(result.avatar).toBe('https://cdn.example.com/alice.jpg');
    expect(result.banner).toBe('https://cdn.example.com/banner.jpg');
    expect(result.phoneNumber).toBe('+33612345678');
    expect(result.role).toBe('USER');
    expect(result.isActive).toBe(true);
    expect(result.deactivatedAt).toBeNull();
    expect(result.systemLanguage).toBe('fr');
    expect(result.regionalLanguage).toBe('en');
    expect(result.customDestinationLanguage).toBeNull();
    expect(result.autoTranslateEnabled).toBe(true);
    expect(result.isOnline).toBe(false);
    expect(result.lastActiveAt).toEqual(new Date('2026-01-01T12:00:00Z'));
    expect(result.emailVerifiedAt).toEqual(new Date('2026-01-01T08:00:00Z'));
    expect(result.phoneVerifiedAt).toBeNull();
    expect(result.twoFactorEnabledAt).toBeNull();
    expect(result.pendingEmail).toBeNull();
    expect(result.pendingPhone).toBeNull();
    expect(result.lastPasswordChange).toBeNull();
    expect(result.lastLoginIp).toBe('127.0.0.1');
    expect(result.lastLoginLocation).toBe('Paris, FR');
    expect(result.lastLoginDevice).toBe('iPhone 16');
    expect(result.profileCompletionRate).toBe(75);
    expect(result.createdAt).toEqual(new Date('2025-06-01T00:00:00Z'));
    expect(result.updatedAt).toEqual(new Date('2026-01-01T12:00:00Z'));
  });

  it('falls back banner to null when user.banner is falsy', () => {
    const result = formatUserResponse(makeUser({ banner: undefined }));
    expect(result.banner).toBeNull();
  });

  it('falls back banner to null when user.banner is empty string', () => {
    const result = formatUserResponse(makeUser({ banner: '' }));
    expect(result.banner).toBeNull();
  });

  it('uses permissions argument when provided', () => {
    const permissions = { canPost: true, canModerate: false };
    const result = formatUserResponse(makeUser(), permissions);
    expect(result.permissions).toEqual(permissions);
  });

  it('falls back to user.permissions when permissions argument is omitted', () => {
    const userPerms = { isAdmin: true };
    const result = formatUserResponse(makeUser({ permissions: userPerms }));
    expect(result.permissions).toEqual(userPerms);
  });

  it('permissions is undefined when neither argument nor user.permissions is set', () => {
    const result = formatUserResponse(makeUser({ permissions: undefined }));
    expect(result.permissions).toBeUndefined();
  });

  it('prefers pendingPhone over pendingPhoneNumber when both present', () => {
    const result = formatUserResponse(makeUser({ pendingPhone: '+1', pendingPhoneNumber: '+2' }));
    expect(result.pendingPhone).toBe('+1');
  });

  it('falls back to pendingPhoneNumber when pendingPhone is null', () => {
    const result = formatUserResponse(makeUser({ pendingPhone: null, pendingPhoneNumber: '+33600000000' }));
    expect(result.pendingPhone).toBe('+33600000000');
  });

  it('returns null for pendingPhone when both pendingPhone and pendingPhoneNumber are null/undefined', () => {
    const result = formatUserResponse(makeUser({ pendingPhone: null, pendingPhoneNumber: undefined }));
    expect(result.pendingPhone).toBeNull();
  });

  it('returns null for pendingEmail when user.pendingEmail is falsy', () => {
    const result = formatUserResponse(makeUser({ pendingEmail: undefined }));
    expect(result.pendingEmail).toBeNull();
  });

  it('passes through a non-null pendingEmail', () => {
    const result = formatUserResponse(makeUser({ pendingEmail: 'new@example.com' }));
    expect(result.pendingEmail).toBe('new@example.com');
  });

  it('handles a user with no optional fields gracefully', () => {
    const minimal = makeUser({
      firstName: null,
      lastName: null,
      bio: null,
      avatar: null,
      banner: null,
      phoneNumber: null,
      deactivatedAt: null,
      customDestinationLanguage: null,
      lastActiveAt: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      twoFactorEnabledAt: null,
      pendingEmail: null,
      pendingPhone: null,
      lastPasswordChange: null,
      lastLoginIp: null,
      lastLoginLocation: null,
      lastLoginDevice: null,
    });
    const result = formatUserResponse(minimal);
    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeNull();
    expect(result.bio).toBeNull();
    expect(result.avatar).toBeNull();
    expect(result.banner).toBeNull();
    expect(result.phoneNumber).toBeNull();
  });
});

// ── formatSessionResponse ─────────────────────────────────────────────────────

describe('formatSessionResponse', () => {
  it('maps all fields from a complete session object', () => {
    const session = makeSession();
    const result = formatSessionResponse(session);

    expect(result.id).toBe('sess-xyz-789');
    expect(result.deviceType).toBe('mobile');
    expect(result.browserName).toBe('Safari');
    expect(result.osName).toBe('iOS');
    expect(result.location).toBe('Paris, FR');
    expect(result.isMobile).toBe(true);
    expect(result.createdAt).toEqual(new Date('2026-01-01T09:00:00Z'));
  });

  it('isTrusted is false by default (rememberDevice omitted)', () => {
    const result = formatSessionResponse(makeSession());
    expect(result.isTrusted).toBe(false);
  });

  it('isTrusted is true when rememberDevice=true', () => {
    const result = formatSessionResponse(makeSession(), true);
    expect(result.isTrusted).toBe(true);
  });

  it('isTrusted is false when rememberDevice=false explicitly', () => {
    const result = formatSessionResponse(makeSession(), false);
    expect(result.isTrusted).toBe(false);
  });

  it('handles a session with null optional fields', () => {
    const session = makeSession({
      deviceType: null,
      browserName: null,
      osName: null,
      location: null,
    });
    const result = formatSessionResponse(session);
    expect(result.deviceType).toBeNull();
    expect(result.browserName).toBeNull();
    expect(result.osName).toBeNull();
    expect(result.location).toBeNull();
  });

  it('does not expose isMobile=false incorrectly (desktop session)', () => {
    const result = formatSessionResponse(makeSession({ isMobile: false }));
    expect(result.isMobile).toBe(false);
  });
});
