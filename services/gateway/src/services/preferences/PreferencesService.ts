/**
 * PreferencesService
 *
 * Business logic layer for user preferences management.
 * Implements repository pattern with separation of concerns:
 * - Service layer: Business logic, validation, transformations
 * - Repository layer: Direct database access (Prisma)
 *
 * Features:
 * - Unified preference management across all types
 * - Default value handling
 * - Input validation
 * - Error handling
 * - Type-safe operations
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  NotificationPreferencesDTO,
  UpdateNotificationPreferencesDTO,
  EncryptionPreferencesDTO,
  UpdateEncryptionPreferenceDTO,
  ThemePreferencesDTO,
  UpdateThemePreferencesDTO,
  LanguagePreferencesDTO,
  UpdateLanguagePreferencesDTO,
  PrivacyPreferencesDTO,
  UpdatePrivacyPreferencesDTO,
  EncryptionPreference
} from '../../routes/me/preferences/types';
import {
  NOTIFICATION_PREFERENCES_DEFAULTS,
  PRIVACY_PREFERENCES_DEFAULTS,
  PRIVACY_KEY_MAPPING,
  PRIVACY_KEY_REVERSE_MAPPING,
  isValidDndTime,
  isValidFont,
  VALID_THEMES,
  VALID_FONT_SIZES
} from '../../config/user-preferences-defaults';

export class PreferencesService {
  constructor(private prisma: PrismaClient) {}

  // ============================================================================
  // NOTIFICATION PREFERENCES
  // ============================================================================

  /**
   * Get notification preferences for a user
   * Returns stored preferences or defaults if none exist
   */
  async getNotificationPreferences(userId: string): Promise<NotificationPreferencesDTO> {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId }
    });

    if (preferences) {
      return {
        ...preferences,
        isDefault: false
      };
    }

    // Return defaults
    return {
      id: null,
      userId,
      ...NOTIFICATION_PREFERENCES_DEFAULTS,
      isDefault: true,
      createdAt: null,
      updatedAt: null
    } as NotificationPreferencesDTO;
  }

  /**
   * Update notification preferences (upsert)
   * Validates input and performs partial updates
   */
  async updateNotificationPreferences(
    userId: string,
    data: UpdateNotificationPreferencesDTO
  ): Promise<NotificationPreferencesDTO> {
    // Validate DND times if provided
    if (data.dndStartTime && !isValidDndTime(data.dndStartTime)) {
      throw new Error('Invalid dndStartTime format. Expected HH:MM (e.g., 22:00)');
    }
    if (data.dndEndTime && !isValidDndTime(data.dndEndTime)) {
      throw new Error('Invalid dndEndTime format. Expected HH:MM (e.g., 08:00)');
    }

    // If DND is being enabled, validate times are set
    if (data.dndEnabled === true) {
      const existingPrefs = await this.prisma.notificationPreference.findUnique({
        where: { userId }
      });

      const startTime = data.dndStartTime ?? existingPrefs?.dndStartTime;
      const endTime = data.dndEndTime ?? existingPrefs?.dndEndTime;

      if (!startTime || !endTime) {
        throw new Error('dndStartTime and dndEndTime are required when enabling DND');
      }
    }

    // Filter undefined values for partial update
    const updateData: any = {};
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        updateData[key] = value;
      }
    });

    const preferences = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...NOTIFICATION_PREFERENCES_DEFAULTS,
        ...updateData
      },
      update: updateData
    });

    return {
      ...preferences,
      isDefault: false
    };
  }

  /**
   * Reset notification preferences to defaults
   */
  async resetNotificationPreferences(userId: string): Promise<void> {
    await this.prisma.notificationPreference.deleteMany({
      where: { userId }
    });
  }

  // ============================================================================
  // ENCRYPTION PREFERENCES
  // ============================================================================

  /**
   * Get encryption preferences for a user
   */
  async getEncryptionPreferences(userId: string): Promise<EncryptionPreferencesDTO> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        signalIdentityKeyPublic: true,
        signalRegistrationId: true,
        signalPreKeyBundleVersion: true,
        lastKeyRotation: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const userFeature = await this.prisma.userFeature.findUnique({
      where: { userId },
      select: { encryptionPreference: true }
    });

    return {
      encryptionPreference: (userFeature?.encryptionPreference as EncryptionPreference) || 'optional',
      hasSignalKeys: !!user.signalIdentityKeyPublic,
      signalRegistrationId: user.signalRegistrationId,
      signalPreKeyBundleVersion: user.signalPreKeyBundleVersion,
      lastKeyRotation: user.lastKeyRotation
    };
  }

  /**
   * Update encryption preference
   */
  async updateEncryptionPreference(
    userId: string,
    data: UpdateEncryptionPreferenceDTO
  ): Promise<{ encryptionPreference: EncryptionPreference }> {
    // Validate preference
    const validPreferences: EncryptionPreference[] = ['disabled', 'optional', 'always'];
    if (!validPreferences.includes(data.encryptionPreference)) {
      throw new Error('Invalid encryption preference. Must be "disabled", "optional", or "always"');
    }

    const updatedUserFeature = await this.prisma.userFeature.upsert({
      where: { userId },
      update: { encryptionPreference: data.encryptionPreference },
      create: { userId, encryptionPreference: data.encryptionPreference },
      select: { encryptionPreference: true }
    });

    return {
      encryptionPreference: updatedUserFeature.encryptionPreference as EncryptionPreference
    };
  }

  // ============================================================================
  // THEME PREFERENCES
  // ============================================================================

  /**
   * Get theme preferences for a user
   */
  async getThemePreferences(userId: string): Promise<ThemePreferencesDTO> {
    const preferences = await this.prisma.userPreference.findMany({
      where: {
        userId,
        key: { in: ['theme', 'font-family', 'font-size', 'compact-mode'] }
      }
    });

    const prefsMap = new Map(preferences.map(p => [p.key, p.value]));

    return {
      theme: (prefsMap.get('theme') as ThemePreferencesDTO['theme']) || 'system',
      fontFamily: (prefsMap.get('font-family') as ThemePreferencesDTO['fontFamily']) || 'inter',
      fontSize: (prefsMap.get('font-size') as ThemePreferencesDTO['fontSize']) || 'medium',
      compactMode: prefsMap.get('compact-mode') === 'true'
    };
  }

  /**
   * Update theme preferences
   */
  async updateThemePreferences(
    userId: string,
    data: UpdateThemePreferencesDTO
  ): Promise<ThemePreferencesDTO> {
    // Validate inputs
    if (data.theme && !VALID_THEMES.includes(data.theme)) {
      throw new Error(`Invalid theme. Must be one of: ${VALID_THEMES.join(', ')}`);
    }
    if (data.fontFamily && !isValidFont(data.fontFamily)) {
      throw new Error('Invalid font family');
    }
    if (data.fontSize && !VALID_FONT_SIZES.includes(data.fontSize)) {
      throw new Error(`Invalid font size. Must be one of: ${VALID_FONT_SIZES.join(', ')}`);
    }

    // Update preferences in database
    const updates: Array<{ key: string; value: string }> = [];
    if (data.theme !== undefined) updates.push({ key: 'theme', value: data.theme });
    if (data.fontFamily !== undefined) updates.push({ key: 'font-family', value: data.fontFamily });
    if (data.fontSize !== undefined) updates.push({ key: 'font-size', value: data.fontSize });
    if (data.compactMode !== undefined) updates.push({ key: 'compact-mode', value: String(data.compactMode) });

    // Perform upserts
    await Promise.all(
      updates.map(({ key, value }) =>
        this.prisma.userPreference.upsert({
          where: { userId_key: { userId, key } },
          create: { userId, key, value, valueType: 'string' },
          update: { value }
        })
      )
    );

    return this.getThemePreferences(userId);
  }

  /**
   * Reset theme preferences to defaults
   */
  async resetThemePreferences(userId: string): Promise<void> {
    await this.prisma.userPreference.deleteMany({
      where: {
        userId,
        key: { in: ['theme', 'font-family', 'font-size', 'compact-mode'] }
      }
    });
  }

  // ============================================================================
  // LANGUAGE PREFERENCES
  // ============================================================================

  /**
   * Get language preferences for a user
   */
  async getLanguagePreferences(userId: string): Promise<LanguagePreferencesDTO> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        systemLanguage: true,
        regionalLanguage: true,
        customDestinationLanguage: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const autoTranslatePref = await this.prisma.userPreference.findUnique({
      where: { userId_key: { userId, key: 'auto-translate' } }
    });

    return {
      systemLanguage: user.systemLanguage,
      regionalLanguage: user.regionalLanguage,
      customDestinationLanguage: user.customDestinationLanguage || undefined,
      autoTranslate: autoTranslatePref?.value === 'true'
    };
  }

  /**
   * Update language preferences
   */
  async updateLanguagePreferences(
    userId: string,
    data: UpdateLanguagePreferencesDTO
  ): Promise<LanguagePreferencesDTO> {
    // Update user language fields
    const updateData: any = {};
    if (data.systemLanguage !== undefined) updateData.systemLanguage = data.systemLanguage;
    if (data.regionalLanguage !== undefined) updateData.regionalLanguage = data.regionalLanguage;
    if (data.customDestinationLanguage !== undefined) {
      updateData.customDestinationLanguage = data.customDestinationLanguage;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: updateData
      });
    }

    // Update auto-translate preference
    if (data.autoTranslate !== undefined) {
      await this.prisma.userPreference.upsert({
        where: { userId_key: { userId, key: 'auto-translate' } },
        create: { userId, key: 'auto-translate', value: String(data.autoTranslate), valueType: 'boolean' },
        update: { value: String(data.autoTranslate) }
      });
    }

    return this.getLanguagePreferences(userId);
  }

  // ============================================================================
  // PRIVACY PREFERENCES
  // ============================================================================

  /**
   * Get privacy preferences for a user
   */
  async getPrivacyPreferences(userId: string): Promise<PrivacyPreferencesDTO> {
    const dbKeys = Object.values(PRIVACY_KEY_MAPPING);
    const preferences = await this.prisma.userPreference.findMany({
      where: {
        userId,
        key: { in: dbKeys }
      }
    });

    const prefsMap = new Map(preferences.map(p => [p.key, p.value]));

    // Convert from database keys to DTO keys
    const result: any = {};
    Object.entries(PRIVACY_KEY_MAPPING).forEach(([dtoKey, dbKey]) => {
      const defaultValue = PRIVACY_PREFERENCES_DEFAULTS[dtoKey as keyof PrivacyPreferencesDTO];
      result[dtoKey] = prefsMap.has(dbKey) ? prefsMap.get(dbKey) === 'true' : defaultValue;
    });

    return result as PrivacyPreferencesDTO;
  }

  /**
   * Update privacy preferences
   */
  async updatePrivacyPreferences(
    userId: string,
    data: UpdatePrivacyPreferencesDTO
  ): Promise<PrivacyPreferencesDTO> {
    const updates: Array<{ key: string; value: string }> = [];

    // Convert DTO keys to database keys
    Object.entries(data).forEach(([dtoKey, value]) => {
      if (value !== undefined) {
        const dbKey = PRIVACY_KEY_MAPPING[dtoKey as keyof PrivacyPreferencesDTO];
        if (dbKey) {
          updates.push({ key: dbKey, value: String(value) });
        }
      }
    });

    // Perform upserts
    await Promise.all(
      updates.map(({ key, value }) =>
        this.prisma.userPreference.upsert({
          where: { userId_key: { userId, key } },
          create: { userId, key, value, valueType: 'boolean' },
          update: { value }
        })
      )
    );

    return this.getPrivacyPreferences(userId);
  }

  /**
   * Reset privacy preferences to defaults
   */
  async resetPrivacyPreferences(userId: string): Promise<void> {
    const dbKeys = Object.values(PRIVACY_KEY_MAPPING);
    await this.prisma.userPreference.deleteMany({
      where: {
        userId,
        key: { in: dbKeys }
      }
    });
  }
}
