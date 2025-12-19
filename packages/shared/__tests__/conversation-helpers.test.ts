/**
 * Tests for Conversation Helper Utilities
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveUserLanguage,
  generateConversationIdentifier,
  isValidMongoId,
  canEditMessage,
  generateDefaultConversationTitle,
  getRequiredLanguages,
} from '../utils/conversation-helpers';

describe('resolveUserLanguage', () => {
  it('should return custom destination language when enabled', () => {
    const user = {
      useCustomDestination: true,
      customDestinationLanguage: 'de',
      translateToSystemLanguage: true,
      systemLanguage: 'en',
    };
    expect(resolveUserLanguage(user)).toBe('de');
  });

  it('should return system language when translateToSystemLanguage is true', () => {
    const user = {
      useCustomDestination: false,
      translateToSystemLanguage: true,
      systemLanguage: 'en',
      translateToRegionalLanguage: true,
      regionalLanguage: 'es',
    };
    expect(resolveUserLanguage(user)).toBe('en');
  });

  it('should return regional language when translateToRegionalLanguage is true', () => {
    const user = {
      useCustomDestination: false,
      translateToSystemLanguage: false,
      translateToRegionalLanguage: true,
      regionalLanguage: 'es',
      systemLanguage: 'en',
    };
    expect(resolveUserLanguage(user)).toBe('es');
  });

  it('should fallback to system language', () => {
    const user = {
      useCustomDestination: false,
      translateToSystemLanguage: false,
      translateToRegionalLanguage: false,
      systemLanguage: 'en',
    };
    expect(resolveUserLanguage(user)).toBe('en');
  });

  it('should fallback to fr when no language set', () => {
    const user = {};
    expect(resolveUserLanguage(user)).toBe('fr');
  });

  it('should handle useCustomDestination true but no customDestinationLanguage', () => {
    const user = {
      useCustomDestination: true,
      customDestinationLanguage: undefined,
      translateToSystemLanguage: true,
      systemLanguage: 'en',
    };
    expect(resolveUserLanguage(user)).toBe('en');
  });
});

describe('generateConversationIdentifier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T10:30:45Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should generate identifier with sanitized title', () => {
    const identifier = generateConversationIdentifier('My Group Chat');
    expect(identifier).toBe('mshy_my-group-chat-20240315103045');
  });

  it('should remove special characters from title', () => {
    // Special characters removed, multiple dashes collapsed to one
    const identifier = generateConversationIdentifier('Test @#$% Group!');
    expect(identifier).toBe('mshy_test-group-20240315103045');
  });

  it('should handle title with only special characters', () => {
    const identifier = generateConversationIdentifier('!@#$%');
    expect(identifier).toMatch(/^mshy_[a-z0-9]+-20240315103045$/);
  });

  it('should generate random identifier without title', () => {
    const identifier = generateConversationIdentifier();
    expect(identifier).toMatch(/^mshy_[a-z0-9]+-20240315103045$/);
  });

  it('should generate random identifier with empty title', () => {
    const identifier = generateConversationIdentifier('');
    expect(identifier).toMatch(/^mshy_[a-z0-9]+-20240315103045$/);
  });

  it('should convert title to lowercase', () => {
    const identifier = generateConversationIdentifier('UPPERCASE');
    expect(identifier).toBe('mshy_uppercase-20240315103045');
  });

  it('should collapse multiple dashes', () => {
    const identifier = generateConversationIdentifier('test---multiple---dashes');
    expect(identifier).toBe('mshy_test-multiple-dashes-20240315103045');
  });

  it('should normalize French accents', () => {
    const identifier = generateConversationIdentifier('Café résumé');
    expect(identifier).toBe('mshy_cafe-resume-20240315103045');
  });

  it('should normalize various accented characters', () => {
    // NFD normalization: àâä→aaa, éèêë→eeee, ïî→ii, ô→o, ùûü→uuu, ç→c
    const identifier = generateConversationIdentifier('àâäéèêëïîôùûüç');
    expect(identifier).toBe('mshy_aaaeeeeiiouuuc-20240315103045');
  });

  it('should handle mixed accents and special characters', () => {
    const identifier = generateConversationIdentifier('Réunion équipe été 2024!');
    expect(identifier).toBe('mshy_reunion-equipe-ete-2024-20240315103045');
  });

  it('should handle German umlauts', () => {
    const identifier = generateConversationIdentifier('Größe über');
    expect(identifier).toBe('mshy_groe-uber-20240315103045');
  });

  it('should handle Spanish characters', () => {
    const identifier = generateConversationIdentifier('Niño año');
    expect(identifier).toBe('mshy_nino-ano-20240315103045');
  });
});

describe('isValidMongoId', () => {
  it('should return true for valid MongoDB ObjectId', () => {
    expect(isValidMongoId('507f1f77bcf86cd799439011')).toBe(true);
    expect(isValidMongoId('000000000000000000000000')).toBe(true);
    expect(isValidMongoId('ffffffffffffffffffffffff')).toBe(true);
    expect(isValidMongoId('ABCDEF123456789012345678')).toBe(true);
  });

  it('should return false for invalid ObjectId', () => {
    expect(isValidMongoId('')).toBe(false);
    expect(isValidMongoId('123')).toBe(false);
    expect(isValidMongoId('507f1f77bcf86cd79943901')).toBe(false); // 23 chars
    expect(isValidMongoId('507f1f77bcf86cd7994390111')).toBe(false); // 25 chars
    expect(isValidMongoId('507f1f77bcf86cd79943901g')).toBe(false); // invalid char
    expect(isValidMongoId('not-a-mongo-id')).toBe(false);
  });
});

describe('canEditMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow editing for admins regardless of time', () => {
    const oldMessage = new Date('2024-03-14T12:00:00Z'); // 24 hours ago
    expect(canEditMessage(oldMessage, 'ADMIN')).toEqual({ canEdit: true });
    expect(canEditMessage(oldMessage, 'BIGBOSS')).toEqual({ canEdit: true });
    expect(canEditMessage(oldMessage, 'MODERATOR')).toEqual({ canEdit: true });
    expect(canEditMessage(oldMessage, 'CREATOR')).toEqual({ canEdit: true });
  });

  it('should allow editing recent messages for regular users', () => {
    const recentMessage = new Date('2024-03-15T11:30:00Z'); // 30 minutes ago
    expect(canEditMessage(recentMessage, 'USER')).toEqual({ canEdit: true });
  });

  it('should deny editing old messages for regular users', () => {
    const oldMessage = new Date('2024-03-15T10:30:00Z'); // 1.5 hours ago
    expect(canEditMessage(oldMessage, 'USER')).toEqual({
      canEdit: false,
      reason: 'MESSAGE_TOO_OLD',
    });
  });

  it('should handle string date format', () => {
    const recentMessage = '2024-03-15T11:30:00Z';
    expect(canEditMessage(recentMessage, 'USER')).toEqual({ canEdit: true });
  });

  it('should default to USER role', () => {
    const oldMessage = new Date('2024-03-15T10:30:00Z'); // 1.5 hours ago
    expect(canEditMessage(oldMessage)).toEqual({
      canEdit: false,
      reason: 'MESSAGE_TOO_OLD',
    });
  });

  it('should allow editing exactly at 1 hour boundary', () => {
    const exactlyOneHour = new Date('2024-03-15T11:00:00Z');
    expect(canEditMessage(exactlyOneHour, 'USER')).toEqual({ canEdit: true });
  });

  it('should deny editing just past 1 hour', () => {
    const justPastOneHour = new Date('2024-03-15T10:59:59Z');
    expect(canEditMessage(justPastOneHour, 'USER')).toEqual({
      canEdit: false,
      reason: 'MESSAGE_TOO_OLD',
    });
  });
});

describe('generateDefaultConversationTitle', () => {
  it('should return "Conversation" for no other members', () => {
    const members = [{ id: 'user1', username: 'currentUser' }];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Conversation');
  });

  it('should return single member displayName', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', displayName: 'John Doe', username: 'johndoe' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('John Doe');
  });

  it('should fallback to username if no displayName', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', username: 'johndoe' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('johndoe');
  });

  it('should fallback to firstName + lastName', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', firstName: 'John', lastName: 'Doe' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('John Doe');
  });

  it('should return "Unknown User" for member with no info', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Unknown User');
  });

  it('should join two member names', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', displayName: 'Alice' },
      { id: 'user3', displayName: 'Bob' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Alice, Bob');
  });

  it('should show first two names and count for 3+ members', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', displayName: 'Alice' },
      { id: 'user3', displayName: 'Bob' },
      { id: 'user4', displayName: 'Charlie' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Alice, Bob and 1 other(s)');
  });

  it('should handle 4+ members correctly', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', displayName: 'Alice' },
      { id: 'user3', displayName: 'Bob' },
      { id: 'user4', displayName: 'Charlie' },
      { id: 'user5', displayName: 'Diana' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Alice, Bob and 2 other(s)');
  });

  it('should handle members with only firstName for multiple members', () => {
    const members = [
      { id: 'user1', username: 'currentUser' },
      { id: 'user2', firstName: 'Alice' },
      { id: 'user3', firstName: 'Bob' },
    ];
    expect(generateDefaultConversationTitle(members as any, 'user1')).toBe('Alice, Bob');
  });
});

describe('getRequiredLanguages', () => {
  it('should return unique languages from all members', () => {
    const members = [
      { systemLanguage: 'en', translateToSystemLanguage: true },
      { systemLanguage: 'fr', translateToSystemLanguage: true },
      { systemLanguage: 'de', translateToSystemLanguage: true },
    ];
    const languages = getRequiredLanguages(members);
    expect(languages).toHaveLength(3);
    expect(languages).toContain('en');
    expect(languages).toContain('fr');
    expect(languages).toContain('de');
  });

  it('should deduplicate languages', () => {
    const members = [
      { systemLanguage: 'en', translateToSystemLanguage: true },
      { systemLanguage: 'en', translateToSystemLanguage: true },
      { systemLanguage: 'fr', translateToSystemLanguage: true },
    ];
    const languages = getRequiredLanguages(members);
    expect(languages).toHaveLength(2);
    expect(languages).toContain('en');
    expect(languages).toContain('fr');
  });

  it('should respect user language preferences', () => {
    const members = [
      { systemLanguage: 'en', customDestinationLanguage: 'de', useCustomDestination: true },
      { systemLanguage: 'en', regionalLanguage: 'es', translateToRegionalLanguage: true },
    ];
    const languages = getRequiredLanguages(members);
    expect(languages).toContain('de');
    expect(languages).toContain('es');
    expect(languages).not.toContain('en');
  });

  it('should return empty array for no members', () => {
    expect(getRequiredLanguages([])).toEqual([]);
  });

  it('should fallback to fr for members with no language set', () => {
    const members = [{}];
    const languages = getRequiredLanguages(members);
    expect(languages).toContain('fr');
  });
});
