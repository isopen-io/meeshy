/**
 * Unit tests for PreferencesService
 * Tests business logic for all preference types
 */

import { PreferencesService } from '../../../services/preferences/PreferencesService';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NOTIFICATION_PREFERENCES_DEFAULTS, PRIVACY_PREFERENCES_DEFAULTS } from '../../../config/user-preferences-defaults';

// Mock Prisma
jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

describe('PreferencesService', () => {
  let service: PreferencesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      notificationPreference: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn()
      },
      userFeature: {
        findUnique: jest.fn(),
        upsert: jest.fn()
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn()
      },
      userPreference: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn()
      }
    };

    service = new PreferencesService(mockPrisma as unknown as PrismaClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // NOTIFICATION PREFERENCES TESTS
  // ============================================================================

  describe('getNotificationPreferences', () => {
    it('should return stored preferences when they exist', async () => {
      // Mock avec les noms de champs Prisma (pas les noms DTO)
      const mockPreferences = {
        id: 'pref-123',
        userId: 'user-123',
        pushNotifications: true,
        emailNotifications: true,
        soundEnabled: true,
        newMessage: true,
        missedCall: true,
        newConversation: true,
        messageReply: true,
        messageMention: true,
        friendRequest: true,
        friendRequestAccepted: true,
        dndEnabled: false,
        dndStartTime: null,
        dndEndTime: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.notificationPreference.findUnique.mockResolvedValue(mockPreferences);

      const result = await service.getNotificationPreferences('user-123');

      expect(result).toEqual({
        ...NOTIFICATION_PREFERENCES_DEFAULTS,
        isDefault: false,
        createdAt: mockPreferences.createdAt,
        updatedAt: mockPreferences.updatedAt
      });
      expect(mockPrisma.notificationPreference.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
    });

    it('should return defaults when no preferences exist', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);

      const result = await service.getNotificationPreferences('user-123');

      expect(result).toMatchObject({
        userId: 'user-123',
        ...NOTIFICATION_PREFERENCES_DEFAULTS,
        isDefault: true,
        id: null,
        createdAt: null,
        updatedAt: null
      });
    });
  });

  describe('updateNotificationPreferences', () => {
    it('should update existing preferences', async () => {
      const updateData = { pushEnabled: false, emailEnabled: true };
      // Mock avec les noms de champs Prisma
      const mockUpdated = {
        id: 'pref-123',
        userId: 'user-123',
        pushNotifications: false,  // pushEnabled -> pushNotifications
        emailNotifications: true,  // emailEnabled -> emailNotifications
        soundEnabled: true,
        newMessage: true,
        missedCall: true,
        newConversation: true,
        messageReply: true,
        messageMention: true,
        friendRequest: true,
        friendRequestAccepted: true,
        dndEnabled: false,
        dndStartTime: null,
        dndEndTime: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.notificationPreference.upsert.mockResolvedValue(mockUpdated);

      const result = await service.updateNotificationPreferences('user-123', updateData);

      expect(result).toEqual({
        pushEnabled: false,
        emailEnabled: true,
        soundEnabled: true,
        newMessageEnabled: true,
        missedCallEnabled: true,
        systemEnabled: true,
        conversationEnabled: true,
        replyEnabled: true,
        mentionEnabled: true,
        reactionEnabled: true,
        contactRequestEnabled: true,
        memberJoinedEnabled: true,
        dndEnabled: false,
        dndStartTime: null,
        dndEndTime: null,
        isDefault: false,
        createdAt: mockUpdated.createdAt,
        updatedAt: mockUpdated.updatedAt
      });
      // Vérifier que upsert est appelé avec les champs Prisma corrects
      expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        create: expect.objectContaining({
          userId: 'user-123',
          pushNotifications: false,
          emailNotifications: true
        }),
        update: {
          pushNotifications: false,
          emailNotifications: true
        }
      });
    });

    it('should validate DND time format', async () => {
      const invalidData = { dndStartTime: 'invalid-time' };

      await expect(
        service.updateNotificationPreferences('user-123', invalidData)
      ).rejects.toThrow('Invalid dndStartTime format');
    });

    it('should require DND times when enabling DND', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'user-123',
        dndStartTime: null,
        dndEndTime: null
      });

      await expect(
        service.updateNotificationPreferences('user-123', { dndEnabled: true })
      ).rejects.toThrow('dndStartTime and dndEndTime are required');
    });
  });

  describe('resetNotificationPreferences', () => {
    it('should delete user preferences', async () => {
      mockPrisma.notificationPreference.deleteMany.mockResolvedValue({ count: 1 });

      await service.resetNotificationPreferences('user-123');

      expect(mockPrisma.notificationPreference.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
    });
  });

  // ============================================================================
  // ENCRYPTION PREFERENCES TESTS
  // ============================================================================

  describe('getEncryptionPreferences', () => {
    it('should return encryption preferences with key status', async () => {
      const mockUser = {
        signalIdentityKeyPublic: 'public-key-123',
        signalRegistrationId: 12345,
        signalPreKeyBundleVersion: 1,
        lastKeyRotation: new Date()
      };

      const mockUserFeature = {
        encryptionPreference: 'optional'
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userFeature.findUnique.mockResolvedValue(mockUserFeature);

      const result = await service.getEncryptionPreferences('user-123');

      expect(result).toEqual({
        encryptionPreference: 'optional',
        hasSignalKeys: true,
        signalRegistrationId: 12345,
        signalPreKeyBundleVersion: 1,
        lastKeyRotation: mockUser.lastKeyRotation
      });
    });

    it('should throw error if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getEncryptionPreferences('user-123')
      ).rejects.toThrow('User not found');
    });
  });

  describe('updateEncryptionPreference', () => {
    it('should update encryption preference', async () => {
      const result = await service.updateEncryptionPreference('user-123', {
        encryptionPreference: 'always'
      });

      // TODO: Le service ne sauvegarde pas encore, il retourne juste la valeur
      expect(result).toEqual({ encryptionPreference: 'always' });
      // Pas d'appel à la base de données pour l'instant (TODO dans le service)
    });

    it('should validate encryption preference value', async () => {
      await expect(
        service.updateEncryptionPreference('user-123', {
          encryptionPreference: 'invalid' as any
        })
      ).rejects.toThrow('Invalid encryption preference');
    });
  });

  // ============================================================================
  // THEME PREFERENCES TESTS
  // ============================================================================

  describe('getThemePreferences', () => {
    it('should return theme preferences', async () => {
      const mockPreferences = [
        { key: 'theme', value: 'dark' },
        { key: 'font-family', value: 'inter' },
        { key: 'font-size', value: 'large' },
        { key: 'compact-mode', value: 'true' }
      ];

      mockPrisma.userPreference.findMany.mockResolvedValue(mockPreferences);

      const result = await service.getThemePreferences('user-123');

      expect(result).toEqual({
        theme: 'dark',
        fontFamily: 'inter',
        fontSize: 'large',
        compactMode: true
      });
    });

    it('should return defaults when no preferences exist', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue([]);

      const result = await service.getThemePreferences('user-123');

      expect(result).toEqual({
        theme: 'system',
        fontFamily: 'inter',
        fontSize: 'medium',
        compactMode: false
      });
    });
  });

  describe('updateThemePreferences', () => {
    it('should update theme preferences', async () => {
      mockPrisma.userPreference.upsert.mockResolvedValue({});
      mockPrisma.userPreference.findMany.mockResolvedValue([
        { key: 'theme', value: 'dark' }
      ]);

      const result = await service.updateThemePreferences('user-123', {
        theme: 'dark'
      });

      expect(mockPrisma.userPreference.upsert).toHaveBeenCalled();
      expect(result.theme).toBe('dark');
    });

    it('should validate theme value', async () => {
      await expect(
        service.updateThemePreferences('user-123', { theme: 'invalid' as any })
      ).rejects.toThrow('Invalid theme');
    });

    it('should validate font family', async () => {
      await expect(
        service.updateThemePreferences('user-123', { fontFamily: 'invalid' as any })
      ).rejects.toThrow('Invalid font family');
    });
  });

  // ============================================================================
  // LANGUAGE PREFERENCES TESTS
  // ============================================================================

  describe('getLanguagePreferences', () => {
    it('should return language preferences', async () => {
      const mockUser = {
        systemLanguage: 'en',
        regionalLanguage: 'fr',
        customDestinationLanguage: 'es'
      };

      const mockAutoTranslate = { value: 'true' };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userPreference.findUnique.mockResolvedValue(mockAutoTranslate);

      const result = await service.getLanguagePreferences('user-123');

      expect(result).toEqual({
        systemLanguage: 'en',
        regionalLanguage: 'fr',
        customDestinationLanguage: 'es',
        autoTranslate: true
      });
    });
  });

  describe('updateLanguagePreferences', () => {
    it('should update language fields', async () => {
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({
        systemLanguage: 'es',
        regionalLanguage: 'en',
        customDestinationLanguage: null
      });
      mockPrisma.userPreference.findUnique.mockResolvedValue({ value: 'false' });

      await service.updateLanguagePreferences('user-123', {
        systemLanguage: 'es'
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { systemLanguage: 'es' }
      });
    });
  });

  // ============================================================================
  // PRIVACY PREFERENCES TESTS
  // ============================================================================

  describe('getPrivacyPreferences', () => {
    it('should return privacy preferences with defaults', async () => {
      mockPrisma.userPreference.findMany.mockResolvedValue([]);

      const result = await service.getPrivacyPreferences('user-123');

      expect(result).toEqual(PRIVACY_PREFERENCES_DEFAULTS);
    });

    it('should return stored privacy preferences', async () => {
      const mockPreferences = [
        { key: 'show-online-status', value: 'false' },
        { key: 'show-last-seen', value: 'true' }
      ];

      mockPrisma.userPreference.findMany.mockResolvedValue(mockPreferences);

      const result = await service.getPrivacyPreferences('user-123');

      expect(result.showOnlineStatus).toBe(false);
      expect(result.showLastSeen).toBe(true);
    });
  });

  describe('updatePrivacyPreferences', () => {
    it('should update privacy preferences', async () => {
      mockPrisma.userPreference.upsert.mockResolvedValue({});
      mockPrisma.userPreference.findMany.mockResolvedValue([
        { key: 'show-online-status', value: 'false' }
      ]);

      const result = await service.updatePrivacyPreferences('user-123', {
        showOnlineStatus: false
      });

      expect(mockPrisma.userPreference.upsert).toHaveBeenCalled();
      expect(result.showOnlineStatus).toBe(false);
    });
  });

  describe('resetPrivacyPreferences', () => {
    it('should delete privacy preferences', async () => {
      mockPrisma.userPreference.deleteMany.mockResolvedValue({ count: 8 });

      await service.resetPrivacyPreferences('user-123');

      expect(mockPrisma.userPreference.deleteMany).toHaveBeenCalled();
    });
  });
});
