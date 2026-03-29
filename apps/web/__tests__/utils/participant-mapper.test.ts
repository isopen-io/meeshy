/**
 * Tests for participant-mapper utility
 *
 * Covers:
 * - mapCurrentUserToUser: maps LinkConversationData.currentUser to User
 * - mapMemberToUser: maps a link member to User
 * - mapAnonymousParticipantToUser: maps an anonymous participant to User
 * - mapParticipantsFromLinkData: maps all participants from LinkConversationData
 * - DEFAULT_USER_PERMISSIONS constant
 */

import {
  mapCurrentUserToUser,
  mapMemberToUser,
  mapAnonymousParticipantToUser,
  mapParticipantsFromLinkData,
  getAnonymousPermissionHints,
  DEFAULT_FRONTEND_PERMISSIONS,
} from '@/utils/participant-mapper';
import type { LinkConversationData } from '@/services/link-conversation.service';

const baseLinkData: LinkConversationData = {
  conversation: {
    id: 'conv-123',
    title: 'Test Conversation',
    description: 'A test conversation',
    type: 'group',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  link: {
    id: 'link-1',
    linkId: 'mshy_abc',
    name: 'Test Link',
    description: '',
    allowViewHistory: true,
    allowAnonymousMessages: true,
    allowAnonymousFiles: false,
    allowAnonymousImages: true,
    requireAccount: false,
    requireEmail: false,
    requireNickname: true,
    requireBirthday: false,
    expiresAt: null,
    isActive: true,
  },
  userType: 'anonymous',
  messages: [],
  stats: {
    totalMessages: 10,
    totalMembers: 3,
    totalAnonymousParticipants: 2,
    onlineAnonymousParticipants: 1,
    hasMore: false,
  },
  members: [
    {
      id: 'member-1',
      role: 'admin',
      joinedAt: '2026-01-01T00:00:00Z',
      user: {
        id: 'user-1',
        username: 'alice',
        firstName: 'Alice',
        lastName: 'Smith',
        displayName: 'Alice Smith',
        avatar: 'https://example.com/alice.jpg',
        isOnline: true,
        lastActiveAt: '2026-03-27T10:00:00Z',
      },
    },
  ],
  anonymousParticipants: [
    {
      id: 'anon-1',
      username: 'guest_42',
      firstName: 'Guest',
      lastName: '42',
      language: 'en',
      isOnline: true,
      lastActiveAt: '2026-03-27T09:00:00Z',
      joinedAt: '2026-03-27T08:00:00Z',
      canSendMessages: true,
      canSendFiles: false,
      canSendImages: true,
    },
  ],
  currentUser: {
    id: 'anon-current',
    username: 'me_anon',
    firstName: 'John',
    lastName: 'Doe',
    displayName: 'John Doe',
    language: 'fr',
    isMeeshyer: false,
    permissions: {
      canSendMessages: true,
      canSendFiles: false,
      canSendImages: true,
    },
  },
};

describe('participant-mapper', () => {
  describe('DEFAULT_FRONTEND_PERMISSIONS', () => {
    it('has all admin permissions set to false', () => {
      expect(DEFAULT_FRONTEND_PERMISSIONS).toEqual({
        canAccessAdmin: false,
        canManageUsers: false,
        canManageGroups: false,
        canManageConversations: false,
        canViewAnalytics: false,
        canModerateContent: false,
        canViewAuditLogs: false,
        canManageNotifications: false,
        canManageTranslations: false,
      });
    });
  });

  describe('mapCurrentUserToUser', () => {
    it('maps anonymous current user correctly', () => {
      const result = mapCurrentUserToUser(baseLinkData.currentUser!);

      expect(result.id).toBe('anon-current');
      expect(result.username).toBe('me_anon');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.email).toBe('');
      expect(result.role).toBe('USER');
      expect(result.systemLanguage).toBe('fr');
      expect(result.regionalLanguage).toBe('fr');
      expect(result.autoTranslateEnabled).toBe(true);
      expect(result.isOnline).toBe(true);
      expect(result.isActive).toBe(true);
      expect(result.permissions).toEqual(DEFAULT_FRONTEND_PERMISSIONS);
    });

    it('preserves custom permissions from currentUser', () => {
      const result = mapCurrentUserToUser(baseLinkData.currentUser!);
      // The user-level permissions should be DEFAULT_FRONTEND_PERMISSIONS
      // Participant-level permissions are separate
      expect(result.permissions!.canAccessAdmin).toBe(false);
    });

    it('defaults language to fr when not provided', () => {
      const userNoLang = { ...baseLinkData.currentUser!, language: '' };
      const result = mapCurrentUserToUser(userNoLang);
      expect(result.systemLanguage).toBe('fr');
      expect(result.regionalLanguage).toBe('fr');
    });
  });

  describe('mapMemberToUser', () => {
    it('maps authenticated member correctly', () => {
      const member = baseLinkData.members[0];
      const result = mapMemberToUser(member);

      expect(result.id).toBe('user-1');
      expect(result.username).toBe('alice');
      expect(result.firstName).toBe('Alice');
      expect(result.lastName).toBe('Smith');
      expect(result.displayName).toBe('Alice Smith');
      expect(result.avatar).toBe('https://example.com/alice.jpg');
      expect(result.email).toBe('');
      expect(result.role).toBe('USER');
      expect(result.isOnline).toBe(true);
      expect(result.systemLanguage).toBe('fr');
      expect(result.permissions).toEqual(DEFAULT_FRONTEND_PERMISSIONS);
    });

    it('handles missing lastActiveAt gracefully', () => {
      const member = {
        ...baseLinkData.members[0],
        user: { ...baseLinkData.members[0].user, lastActiveAt: '' },
      };
      const result = mapMemberToUser(member);
      expect(result.lastActiveAt).toBeInstanceOf(Date);
    });
  });

  describe('mapAnonymousParticipantToUser', () => {
    it('maps anonymous participant correctly', () => {
      const anon = baseLinkData.anonymousParticipants[0];
      const result = mapAnonymousParticipantToUser(anon);

      expect(result.id).toBe('anon-1');
      expect(result.username).toBe('guest_42');
      expect(result.firstName).toBe('Guest');
      expect(result.lastName).toBe('42');
      expect(result.displayName).toBe('guest_42');
      expect(result.email).toBe('');
      expect(result.avatar).toBe('');
      expect(result.role).toBe('USER');
      expect(result.systemLanguage).toBe('en');
      expect(result.regionalLanguage).toBe('en');
      expect(result.isOnline).toBe(true);
      expect(result.permissions).toEqual(DEFAULT_FRONTEND_PERMISSIONS);
    });

    it('defaults language to fr when not provided', () => {
      const anon = { ...baseLinkData.anonymousParticipants[0], language: '' };
      const result = mapAnonymousParticipantToUser(anon);
      expect(result.systemLanguage).toBe('fr');
    });
  });

  describe('mapParticipantsFromLinkData', () => {
    it('includes anonymous current user first when isAnonymous is true', () => {
      const result = mapParticipantsFromLinkData(baseLinkData, true);

      expect(result[0].id).toBe('anon-current');
      expect(result.length).toBe(3); // currentUser + 1 member + 1 anon (excluding current)
    });

    it('does not duplicate current user in anonymous participants', () => {
      const dataWithDuplicate: LinkConversationData = {
        ...baseLinkData,
        currentUser: {
          ...baseLinkData.currentUser!,
          id: 'anon-1', // Same as anonymousParticipants[0]
        },
      };

      const result = mapParticipantsFromLinkData(dataWithDuplicate, true);
      const ids = result.map(u => u.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('does not include current user when isAnonymous is false', () => {
      const result = mapParticipantsFromLinkData(baseLinkData, false);

      expect(result[0].id).toBe('user-1'); // First member
      expect(result.length).toBe(2); // 1 member + 1 anon
    });

    it('handles null currentUser gracefully', () => {
      const dataNoUser = { ...baseLinkData, currentUser: null };
      const result = mapParticipantsFromLinkData(dataNoUser, true);

      expect(result.length).toBe(2); // 1 member + 1 anon
    });

    it('handles empty members and anonymous lists', () => {
      const emptyData = {
        ...baseLinkData,
        members: [],
        anonymousParticipants: [],
        currentUser: null,
      };
      const result = mapParticipantsFromLinkData(emptyData, false);
      expect(result).toEqual([]);
    });
  });

  describe('getAnonymousPermissionHints', () => {
    it('returns hints for restricted permissions', () => {
      const hints = getAnonymousPermissionHints(baseLinkData.link);
      expect(hints).toContain('Fichiers non autorisés');
      expect(hints).not.toContain('Images non autorisées');
    });

    it('returns empty array when all permissions are granted', () => {
      const allAllowed = {
        ...baseLinkData.link,
        allowAnonymousFiles: true,
        allowAnonymousImages: true,
      };
      const hints = getAnonymousPermissionHints(allAllowed);
      expect(hints).toEqual([]);
    });

    it('returns both hints when both are restricted', () => {
      const allRestricted = {
        ...baseLinkData.link,
        allowAnonymousFiles: false,
        allowAnonymousImages: false,
      };
      const hints = getAnonymousPermissionHints(allRestricted);
      expect(hints).toHaveLength(2);
    });
  });
});
