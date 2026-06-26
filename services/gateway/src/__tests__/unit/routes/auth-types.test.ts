/**
 * Unit tests for routes/auth/types.ts
 * Covers: formatUserResponse, formatSessionResponse
 */

import { describe, it, expect } from '@jest/globals';
import { formatUserResponse, formatSessionResponse } from '../../../routes/auth/types';

const baseUser = {
  id: 'user-1',
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  bio: 'Hello',
  avatar: 'https://cdn/avatar.png',
  banner: 'https://cdn/banner.png',
  phoneNumber: '+33600000001',
  role: 'USER',
  isActive: true,
  deactivatedAt: null,
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  autoTranslateEnabled: true,
  isOnline: true,
  lastActiveAt: new Date('2026-01-01'),
  emailVerifiedAt: new Date('2026-01-01'),
  phoneVerifiedAt: new Date('2026-01-01'),
  twoFactorEnabledAt: null,
  pendingEmail: null,
  pendingPhone: '+33600000002',
  lastPasswordChange: null,
  lastLoginIp: '127.0.0.1',
  lastLoginLocation: 'Paris',
  lastLoginDevice: 'iPhone',
  profileCompletionRate: 85,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2026-06-01'),
  permissions: null,
};

describe('formatUserResponse', () => {
  it('maps all user fields correctly', () => {
    const result = formatUserResponse(baseUser);
    expect(result.id).toBe('user-1');
    expect(result.username).toBe('alice');
    expect(result.displayName).toBe('Alice Smith');
    expect(result.systemLanguage).toBe('fr');
    expect(result.profileCompletionRate).toBe(85);
  });

  it('uses pendingPhone when present', () => {
    const result = formatUserResponse(baseUser);
    expect(result.pendingPhone).toBe('+33600000002');
  });

  it('falls back to pendingPhoneNumber when pendingPhone is falsy', () => {
    const user = { ...baseUser, pendingPhone: null, pendingPhoneNumber: '+33600000099' };
    const result = formatUserResponse(user);
    expect(result.pendingPhone).toBe('+33600000099');
  });

  it('sets pendingPhone to null when both fields absent', () => {
    const user = { ...baseUser, pendingPhone: null, pendingPhoneNumber: undefined };
    const result = formatUserResponse(user);
    expect(result.pendingPhone).toBeNull();
  });

  it('uses banner from user when present', () => {
    const result = formatUserResponse(baseUser);
    expect(result.banner).toBe('https://cdn/banner.png');
  });

  it('sets banner to null when absent', () => {
    const result = formatUserResponse({ ...baseUser, banner: null });
    expect(result.banner).toBeNull();
  });

  it('passes permissions argument when provided', () => {
    const perms = { canDelete: true };
    const result = formatUserResponse(baseUser, perms);
    expect(result.permissions).toEqual(perms);
  });

  it('falls back to user.permissions when argument not provided', () => {
    const userWithPerms = { ...baseUser, permissions: { canEdit: true } };
    const result = formatUserResponse(userWithPerms);
    expect(result.permissions).toEqual({ canEdit: true });
  });
});

describe('formatSessionResponse', () => {
  const baseSession = {
    id: 'sess-1',
    deviceType: 'mobile',
    browserName: 'Safari',
    osName: 'iOS',
    location: 'Paris',
    isMobile: true,
    createdAt: new Date('2026-01-01'),
  };

  it('maps session fields correctly', () => {
    const result = formatSessionResponse(baseSession);
    expect(result.id).toBe('sess-1');
    expect(result.deviceType).toBe('mobile');
    expect(result.isMobile).toBe(true);
    expect(result.isTrusted).toBe(false);
  });

  it('sets isTrusted to true when rememberDevice is true', () => {
    const result = formatSessionResponse(baseSession, true);
    expect(result.isTrusted).toBe(true);
  });

  it('sets isTrusted to false when rememberDevice is false', () => {
    const result = formatSessionResponse(baseSession, false);
    expect(result.isTrusted).toBe(false);
  });
});
