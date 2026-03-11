/**
 * Tests for user utility
 */

import {
  getUserDisplayName,
  getUserInitials,
  getUserFirstName,
  getThreadMemberFirstName,
  formatUserForConversation,
  formatThreadMemberForConversation,
  getLanguageFlag,
  formatConversationTitle,
  formatConversationTitleFromMembers,
} from '../../utils/user';
import { User } from '@/types';
import type { Participant } from '@meeshy/shared/types';

// Mock SUPPORTED_LANGUAGES
jest.mock('@/types', () => ({
  ...jest.requireActual('@/types'),
  SUPPORTED_LANGUAGES: [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'fr', name: 'French', nativeName: 'Francais', flag: '🇫🇷' },
    { code: 'es', name: 'Spanish', nativeName: 'Espanol', flag: '🇪🇸' },
  ],
}));

describe('user', () => {
  // Helper to create mock user
  const createMockUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    firstName: '',
    lastName: '',
    displayName: '',
    systemLanguage: 'en',
    regionalLanguage: 'en',
    useCustomDestination: false,
    translateToRegionalLanguage: false,
    ...overrides,
  } as User);

  const defaultPermissions = {
    canSendMessages: true,
    canSendFiles: true,
    canSendImages: true,
    canSendVideos: true,
    canSendAudios: true,
    canSendLocations: true,
    canSendLinks: true,
  };

  // Helper to create mock participant
  const createMockParticipant = (userOverrides: Partial<User> = {}): Participant => ({
    id: 'member-123',
    conversationId: 'thread-123',
    type: 'user',
    userId: 'user-123',
    displayName: userOverrides.displayName || userOverrides.firstName || userOverrides.username || 'Test User',
    language: 'fr',
    permissions: defaultPermissions,
    isOnline: true,
    isActive: true,
    role: 'member',
    user: createMockUser(userOverrides),
    joinedAt: new Date(),
  } as Participant);

  describe('getUserDisplayName', () => {
    it('should return firstName lastName when both exist', () => {
      const user = createMockUser({ firstName: 'John', lastName: 'Doe' });
      expect(getUserDisplayName(user)).toBe('John Doe');
    });

    it('should return displayName when firstName/lastName not available', () => {
      const user = createMockUser({ displayName: 'Johnny D' });
      expect(getUserDisplayName(user)).toBe('Johnny D');
    });

    it('should return username as last fallback', () => {
      const user = createMockUser({ username: 'johndoe' });
      expect(getUserDisplayName(user)).toBe('johndoe');
    });

    it('should prioritize firstName/lastName over displayName', () => {
      const user = createMockUser({
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'Johnny D',
      });
      expect(getUserDisplayName(user)).toBe('John Doe');
    });
  });

  describe('getUserInitials', () => {
    it('should return ?? for null user', () => {
      expect(getUserInitials(null)).toBe('??');
    });

    it('should return ?? for undefined user', () => {
      expect(getUserInitials(undefined)).toBe('??');
    });

    it('should return initials from firstName/lastName', () => {
      const user = createMockUser({ firstName: 'John', lastName: 'Doe' });
      expect(getUserInitials(user)).toBe('JD');
    });

    it('should return initials from displayName with space', () => {
      const user = createMockUser({ displayName: 'John Doe Smith' });
      expect(getUserInitials(user)).toBe('JS'); // First and last word
    });

    it('should return first 2 chars from displayName without space', () => {
      const user = createMockUser({ displayName: 'Johnny' });
      expect(getUserInitials(user)).toBe('JO');
    });

    it('should return first 2 chars from username', () => {
      const user = createMockUser({ username: 'johndoe' });
      expect(getUserInitials(user)).toBe('JO');
    });

    it('should uppercase initials', () => {
      const user = createMockUser({ firstName: 'john', lastName: 'doe' });
      expect(getUserInitials(user)).toBe('JD');
    });
  });

  describe('getUserFirstName', () => {
    it('should return "Utilisateur" for null user', () => {
      expect(getUserFirstName(null)).toBe('Utilisateur');
    });

    it('should return "Utilisateur" for undefined user', () => {
      expect(getUserFirstName(undefined)).toBe('Utilisateur');
    });

    it('should return firstName when available', () => {
      const user = createMockUser({ firstName: 'John' });
      expect(getUserFirstName(user)).toBe('John');
    });

    it('should return first word of displayName', () => {
      const user = createMockUser({ displayName: 'John Doe' });
      expect(getUserFirstName(user)).toBe('John');
    });

    it('should return username as fallback', () => {
      const user = createMockUser({ username: 'johndoe' });
      expect(getUserFirstName(user)).toBe('johndoe');
    });

    it('should return "Utilisateur" for empty user', () => {
      const user = createMockUser({
        firstName: '',
        displayName: '',
        username: '',
      });
      expect(getUserFirstName(user)).toBe('Utilisateur');
    });
  });

  describe('getThreadMemberFirstName', () => {
    it('should return firstName from member user', () => {
      const member = createMockParticipant({ firstName: 'John' });
      expect(getThreadMemberFirstName(member)).toBe('John');
    });

    it('should return first word of displayName', () => {
      const member = createMockParticipant({ displayName: 'John Doe' });
      expect(getThreadMemberFirstName(member)).toBe('John');
    });

    it('should return username as fallback', () => {
      const member = createMockParticipant({ username: 'johndoe' });
      expect(getThreadMemberFirstName(member)).toBe('johndoe');
    });
  });

  describe('formatUserForConversation', () => {
    it('should format user with firstName, username and email when available', () => {
      // Note: createMockUser sets email by default
      const user = createMockUser({ firstName: 'John', username: 'johndoe', email: '' });
      expect(formatUserForConversation(user)).toBe('John (johndoe)');
    });

    it('should include phone number when available', () => {
      const user = createMockUser({
        firstName: 'John',
        username: 'johndoe',
        phoneNumber: '+1234567890',
        email: '',
      });
      expect(formatUserForConversation(user)).toBe('John (johndoe) • +1234567890');
    });

    it('should include email when phone not available', () => {
      const user = createMockUser({
        firstName: 'John',
        username: 'johndoe',
        email: 'john@example.com',
      });
      expect(formatUserForConversation(user)).toBe('John (johndoe) • john@example.com');
    });

    it('should prefer phone over email', () => {
      const user = createMockUser({
        firstName: 'John',
        username: 'johndoe',
        phoneNumber: '+1234567890',
        email: 'john@example.com',
      });
      expect(formatUserForConversation(user)).toBe('John (johndoe) • +1234567890');
    });
  });

  describe('formatThreadMemberForConversation', () => {
    it('should format member as firstName (username)', () => {
      const member = createMockParticipant({ firstName: 'John', username: 'johndoe' });
      expect(formatThreadMemberForConversation(member)).toBe('John (johndoe)');
    });

    it('should use displayName when no firstName', () => {
      const member = createMockParticipant({ displayName: 'John Doe', username: 'johndoe' });
      expect(formatThreadMemberForConversation(member)).toBe('John (johndoe)');
    });
  });

  describe('getLanguageFlag', () => {
    it('should return flag for known language code', () => {
      expect(getLanguageFlag('en')).toBe('🇬🇧');
      expect(getLanguageFlag('fr')).toBe('🇫🇷');
      expect(getLanguageFlag('es')).toBe('🇪🇸');
    });

    it('should return globe emoji for unknown language', () => {
      expect(getLanguageFlag('xyz')).toBe('🌐');
    });

    it('should return globe emoji for empty string', () => {
      expect(getLanguageFlag('')).toBe('🌐');
    });
  });

  describe('formatConversationTitleFromMembers', () => {
    it('should return "Conversation vide" when no other participants', () => {
      const participants = [createMockParticipant({ username: 'currentuser' })];
      participants[0].userId = 'current-user-id';
      expect(formatConversationTitleFromMembers(participants, 'current-user-id')).toBe('Conversation vide');
    });

    it('should format single participant with flag and username', () => {
      const participants = [
        { ...createMockParticipant({ username: 'currentuser' }), userId: 'current-user-id' },
        { ...createMockParticipant({ username: 'otheruser', systemLanguage: 'en' }), userId: 'other-user-id' },
      ];
      const result = formatConversationTitleFromMembers(participants, 'current-user-id');
      expect(result).toContain('otheruser');
    });

    it('should show +N autres for more than 3 participants', () => {
      const participants = [
        { ...createMockParticipant({ username: 'currentuser' }), userId: 'current' },
        { ...createMockParticipant({ username: 'user1' }), userId: 'user1' },
        { ...createMockParticipant({ username: 'user2' }), userId: 'user2' },
        { ...createMockParticipant({ username: 'user3' }), userId: 'user3' },
        { ...createMockParticipant({ username: 'user4' }), userId: 'user4' },
        { ...createMockParticipant({ username: 'user5' }), userId: 'user5' },
      ];
      const result = formatConversationTitleFromMembers(participants, 'current');
      expect(result).toContain('+2 autres');
    });

    it('should use customDestinationLanguage when enabled', () => {
      const user = createMockUser({
        username: 'otheruser',
        useCustomDestination: true,
        customDestinationLanguage: 'fr',
        systemLanguage: 'en',
      });
      const participants = [
        { ...createMockParticipant(), userId: 'current', user: createMockUser({ username: 'current' }) },
        { ...createMockParticipant(), userId: 'other', user },
      ];
      const result = formatConversationTitleFromMembers(participants, 'current');
      expect(result).toContain('🇫🇷');
    });

    it('should use regionalLanguage when translateToRegionalLanguage is true', () => {
      const user = createMockUser({
        username: 'otheruser',
        translateToRegionalLanguage: true,
        regionalLanguage: 'es',
        systemLanguage: 'en',
      });
      const participants = [
        { ...createMockParticipant(), userId: 'current', user: createMockUser({ username: 'current' }) },
        { ...createMockParticipant(), userId: 'other', user },
      ];
      const result = formatConversationTitleFromMembers(participants, 'current');
      expect(result).toContain('🇪🇸');
    });
  });

  describe('formatConversationTitle', () => {
    it('should delegate to formatConversationTitleFromMembers for Participant array', () => {
      const participants = [
        { ...createMockParticipant({ username: 'currentuser' }), userId: 'current' },
        { ...createMockParticipant({ username: 'otheruser' }), userId: 'other' },
      ];
      const result = formatConversationTitle(participants, 'current', false);
      expect(result).toContain('otheruser');
    });

    it('should return "Conversation vide" when no other participants', () => {
      const participants = [
        { ...createMockParticipant({ username: 'currentuser' }), userId: 'current' },
      ];
      const result = formatConversationTitle(participants, 'current', false);
      expect(result).toBe('Conversation vide');
    });
  });
});
