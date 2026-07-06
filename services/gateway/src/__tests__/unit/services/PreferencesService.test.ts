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
      userPreferences: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
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
      const now = new Date();
      const mockUserPrefs = {
        notification: {
          pushEnabled: true,
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
        },
        createdAt: now,
        updatedAt: now,
      };

      mockPrisma.userPreferences.findUnique.mockResolvedValue(mockUserPrefs);

      const result = await service.getNotificationPreferences('user-123');

      expect(result).toEqual({
        ...NOTIFICATION_PREFERENCES_DEFAULTS,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      });
      expect(mockPrisma.userPreferences.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        select: { notification: true, createdAt: true, updatedAt: true },
      });
    });

    it('should return defaults when no preferences exist', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const result = await service.getNotificationPreferences('user-123');

      expect(result).toMatchObject({
        ...NOTIFICATION_PREFERENCES_DEFAULTS,
        isDefault: true,
        createdAt: null,
        updatedAt: null,
      });
    });
  });

  describe('updateNotificationPreferences', () => {
    it('should update existing preferences', async () => {
      const updateData = { pushEnabled: false, emailEnabled: true };
      const now = new Date();

      // Mock existing prefs lookup
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        notification: {},
      });

      // Mock upsert result
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        notification: {
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
        },
        createdAt: now,
        updatedAt: now,
      });

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
        createdAt: now,
        updatedAt: now,
      });
      expect(mockPrisma.userPreferences.upsert).toHaveBeenCalled();
    });

    it('should validate DND time format', async () => {
      const invalidData = { dndStartTime: 'invalid-time' };

      await expect(
        service.updateNotificationPreferences('user-123', invalidData)
      ).rejects.toThrow('Invalid dndStartTime format');
    });

    it('should require DND times when enabling DND', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        notification: {
          dndStartTime: null,
          dndEndTime: null,
        },
      });

      await expect(
        service.updateNotificationPreferences('user-123', { dndEnabled: true })
      ).rejects.toThrow('dndStartTime and dndEndTime are required');
    });
  });

  describe('resetNotificationPreferences', () => {
    it('should reset notification to null in userPreferences', async () => {
      mockPrisma.userPreferences.update.mockResolvedValue({});

      await service.resetNotificationPreferences('user-123');

      expect(mockPrisma.userPreferences.update).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        data: { notification: null },
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

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userPreferences.findUnique.mockResolvedValue({ application: { encryptionPreference: 'optional' } });

      const result = await service.getEncryptionPreferences('user-123');

      expect(result).toEqual({
        encryptionPreference: 'optional',
        hasSignalKeys: true,
        signalRegistrationId: 12345,
        signalPreKeyBundleVersion: 1,
        lastKeyRotation: mockUser.lastKeyRotation
      });
    });

    it('should return stored preference of always when saved', async () => {
      const mockUser = {
        signalIdentityKeyPublic: null,
        signalRegistrationId: null,
        signalPreKeyBundleVersion: null,
        lastKeyRotation: null
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userPreferences.findUnique.mockResolvedValue({ application: { encryptionPreference: 'always' } });

      const result = await service.getEncryptionPreferences('user-123');

      expect(result.encryptionPreference).toBe('always');
      expect(result.hasSignalKeys).toBe(false);
    });

    it('should default to optional when no application preference stored', async () => {
      const mockUser = {
        signalIdentityKeyPublic: null,
        signalRegistrationId: null,
        signalPreKeyBundleVersion: null,
        lastKeyRotation: null
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const result = await service.getEncryptionPreferences('user-123');

      expect(result.encryptionPreference).toBe('optional');
    });

    it('should throw error if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      await expect(
        service.getEncryptionPreferences('user-123')
      ).rejects.toThrow('User not found');
    });
  });

  describe('updateEncryptionPreference', () => {
    it('should update encryption preference and persist via upsert', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
      mockPrisma.userPreferences.upsert.mockResolvedValue({ id: 'pref-1' });

      const result = await service.updateEncryptionPreference('user-123', {
        encryptionPreference: 'always'
      });

      expect(result).toEqual({ encryptionPreference: 'always' });
      expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123' },
          create: expect.objectContaining({ userId: 'user-123', application: { encryptionPreference: 'always' } }),
          update: expect.objectContaining({ application: { encryptionPreference: 'always' } }),
        })
      );
    });

    it('should merge with existing application data on upsert', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        application: { someOtherKey: 'existingValue' }
      });
      mockPrisma.userPreferences.upsert.mockResolvedValue({ id: 'pref-1' });

      await service.updateEncryptionPreference('user-123', {
        encryptionPreference: 'disabled'
      });

      expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            application: { someOtherKey: 'existingValue', encryptionPreference: 'disabled' }
          }),
        })
      );
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

    it('lowercases language codes at the write boundary (Prisme invariant)', async () => {
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({
        systemLanguage: 'en',
        regionalLanguage: 'fr',
        customDestinationLanguage: 'de'
      });
      mockPrisma.userPreference.findUnique.mockResolvedValue({ value: 'false' });

      await service.updateLanguagePreferences('user-123', {
        systemLanguage: 'EN',
        regionalLanguage: 'Fr',
        customDestinationLanguage: 'DE'
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { systemLanguage: 'en', regionalLanguage: 'fr', customDestinationLanguage: 'de' }
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

  // ============================================================================
  // UNCOVERED PATHS COVERAGE
  // ============================================================================

  describe('updateNotificationPreferences — invalid dndEndTime', () => {
    it('should throw when dndEndTime has invalid format', async () => {
      await expect(
        service.updateNotificationPreferences('user-123', { dndEndTime: 'bad-time' })
      ).rejects.toThrow('Invalid dndEndTime format');
    });
  });

  describe('updateThemePreferences — invalid fontSize', () => {
    it('should throw when fontSize is invalid', async () => {
      await expect(
        service.updateThemePreferences('user-123', { fontSize: 'huge' as any })
      ).rejects.toThrow('Invalid font size');
    });
  });

  describe('resetThemePreferences', () => {
    it('should delete theme-related user preferences', async () => {
      mockPrisma.userPreference.deleteMany.mockResolvedValue({ count: 4 });

      await service.resetThemePreferences('user-123');

      expect(mockPrisma.userPreference.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          key: { in: ['theme', 'font-family', 'font-size', 'compact-mode'] }
        }
      });
    });
  });

  describe('getLanguagePreferences — user not found', () => {
    it('should throw when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getLanguagePreferences('user-999')
      ).rejects.toThrow('User not found');
    });
  });

  describe('updateLanguagePreferences — customDestinationLanguage', () => {
    it('should update customDestinationLanguage when provided', async () => {
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({
        systemLanguage: 'fr',
        regionalLanguage: null,
        customDestinationLanguage: 'de'
      });
      mockPrisma.userPreference.findUnique.mockResolvedValue(null);

      const result = await service.updateLanguagePreferences('user-123', {
        customDestinationLanguage: 'de'
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { customDestinationLanguage: 'de' }
      });
      expect(result.customDestinationLanguage).toBe('de');
    });
  });

  describe('updateLanguagePreferences — autoTranslate', () => {
    it('should upsert auto-translate preference when provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        systemLanguage: 'fr',
        regionalLanguage: null,
        customDestinationLanguage: null
      });
      mockPrisma.userPreference.upsert.mockResolvedValue({});
      mockPrisma.userPreference.findUnique.mockResolvedValue({ value: 'true' });

      const result = await service.updateLanguagePreferences('user-123', {
        autoTranslate: true
      });

      expect(mockPrisma.userPreference.upsert).toHaveBeenCalledWith({
        where: { userId_key: { userId: 'user-123', key: 'auto-translate' } },
        create: { userId: 'user-123', key: 'auto-translate', value: 'true', valueType: 'boolean' },
        update: { value: 'true' }
      });
      expect(result.autoTranslate).toBe(true);
    });
  });
});
