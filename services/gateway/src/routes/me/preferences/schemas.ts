/**
 * JSON Schema definitions for OpenAPI documentation and validation
 * All schemas follow Fastify JSON Schema format
 */

import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

export const successMessageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Success message' }
      }
    }
  }
} as const;

// ============================================================================
// NOTIFICATION PREFERENCES SCHEMAS
// ============================================================================

export const notificationPreferencesResponseSchema = {
  type: 'object',
  description: 'User notification preferences',
  properties: {
    id: { type: 'string', nullable: true, description: 'Preference ID (null if default)' },
    userId: { type: 'string', description: 'User ID' },

    // Global toggles
    pushEnabled: { type: 'boolean', description: 'Enable push notifications' },
    emailEnabled: { type: 'boolean', description: 'Enable email notifications' },
    soundEnabled: { type: 'boolean', description: 'Enable notification sounds' },

    // Per-type preferences
    newMessageEnabled: { type: 'boolean', description: 'Notify on new messages' },
    missedCallEnabled: { type: 'boolean', description: 'Notify on missed calls' },
    systemEnabled: { type: 'boolean', description: 'System notifications' },
    conversationEnabled: { type: 'boolean', description: 'Conversation notifications' },
    replyEnabled: { type: 'boolean', description: 'Notify on replies' },
    mentionEnabled: { type: 'boolean', description: 'Notify on mentions' },
    reactionEnabled: { type: 'boolean', description: 'Notify on reactions' },
    contactRequestEnabled: { type: 'boolean', description: 'Notify on contact requests' },
    memberJoinedEnabled: { type: 'boolean', description: 'Notify when members join' },

    // Do Not Disturb
    dndEnabled: { type: 'boolean', description: 'Do Not Disturb enabled' },
    dndStartTime: { type: 'string', nullable: true, description: 'DND start time (HH:MM)' },
    dndEndTime: { type: 'string', nullable: true, description: 'DND end time (HH:MM)' },

    isDefault: { type: 'boolean', description: 'Whether using default values' },
    createdAt: { type: 'string', format: 'date-time', nullable: true, description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last update timestamp' }
  }
} as const;

export const updateNotificationPreferencesRequestSchema = {
  type: 'object',
  properties: {
    pushEnabled: { type: 'boolean', description: 'Enable push notifications' },
    emailEnabled: { type: 'boolean', description: 'Enable email notifications' },
    soundEnabled: { type: 'boolean', description: 'Enable notification sounds' },

    newMessageEnabled: { type: 'boolean', description: 'Notify on new messages' },
    missedCallEnabled: { type: 'boolean', description: 'Notify on missed calls' },
    systemEnabled: { type: 'boolean', description: 'System notifications' },
    conversationEnabled: { type: 'boolean', description: 'Conversation notifications' },
    replyEnabled: { type: 'boolean', description: 'Notify on replies' },
    mentionEnabled: { type: 'boolean', description: 'Notify on mentions' },
    reactionEnabled: { type: 'boolean', description: 'Notify on reactions' },
    contactRequestEnabled: { type: 'boolean', description: 'Notify on contact requests' },
    memberJoinedEnabled: { type: 'boolean', description: 'Notify when members join' },

    dndEnabled: { type: 'boolean', description: 'Enable Do Not Disturb' },
    dndStartTime: {
      type: 'string',
      nullable: true,
      pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
      description: 'DND start time (HH:MM)'
    },
    dndEndTime: {
      type: 'string',
      nullable: true,
      pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
      description: 'DND end time (HH:MM)'
    }
  }
} as const;

// ============================================================================
// ENCRYPTION PREFERENCES SCHEMAS
// ============================================================================

export const encryptionPreferencesResponseSchema = {
  type: 'object',
  properties: {
    encryptionPreference: {
      type: 'string',
      enum: ['disabled', 'optional', 'always'],
      description: 'User encryption preference level'
    },
    hasSignalKeys: {
      type: 'boolean',
      description: 'Whether user has generated Signal Protocol keys'
    },
    signalRegistrationId: {
      type: 'number',
      nullable: true,
      description: 'Signal Protocol registration ID (14-bit random number)'
    },
    signalPreKeyBundleVersion: {
      type: 'number',
      nullable: true,
      description: 'Current pre-key bundle version'
    },
    lastKeyRotation: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Last key rotation timestamp'
    }
  }
} as const;

export const updateEncryptionPreferenceRequestSchema = {
  type: 'object',
  required: ['encryptionPreference'],
  properties: {
    encryptionPreference: {
      type: 'string',
      enum: ['disabled', 'optional', 'always'],
      description: 'New encryption preference: disabled (no encryption), optional (user choice), always (enforce E2EE)'
    }
  }
} as const;

// ============================================================================
// THEME PREFERENCES SCHEMAS
// ============================================================================

export const themePreferencesResponseSchema = {
  type: 'object',
  properties: {
    theme: {
      type: 'string',
      enum: ['light', 'dark', 'system'],
      description: 'Application theme'
    },
    fontFamily: {
      type: 'string',
      enum: ['inter', 'nunito', 'poppins', 'open-sans', 'lato', 'comic-neue', 'lexend', 'roboto', 'geist-sans'],
      description: 'Font family'
    },
    fontSize: {
      type: 'string',
      enum: ['small', 'medium', 'large'],
      description: 'Font size'
    },
    compactMode: {
      type: 'boolean',
      description: 'Enable compact UI mode'
    }
  }
} as const;

export const updateThemePreferencesRequestSchema = {
  type: 'object',
  properties: {
    theme: {
      type: 'string',
      enum: ['light', 'dark', 'system'],
      description: 'Application theme'
    },
    fontFamily: {
      type: 'string',
      enum: ['inter', 'nunito', 'poppins', 'open-sans', 'lato', 'comic-neue', 'lexend', 'roboto', 'geist-sans'],
      description: 'Font family'
    },
    fontSize: {
      type: 'string',
      enum: ['small', 'medium', 'large'],
      description: 'Font size'
    },
    compactMode: {
      type: 'boolean',
      description: 'Enable compact UI mode'
    }
  }
} as const;

// ============================================================================
// LANGUAGE PREFERENCES SCHEMAS
// ============================================================================

export const languagePreferencesResponseSchema = {
  type: 'object',
  properties: {
    systemLanguage: {
      type: 'string',
      description: 'System/UI language code (ISO 639-1)'
    },
    regionalLanguage: {
      type: 'string',
      description: 'Regional/native language code (ISO 639-1)'
    },
    customDestinationLanguage: {
      type: 'string',
      nullable: true,
      description: 'Custom destination language for translations (ISO 639-1)'
    },
    autoTranslate: {
      type: 'boolean',
      description: 'Automatically translate messages'
    }
  }
} as const;

export const updateLanguagePreferencesRequestSchema = {
  type: 'object',
  properties: {
    systemLanguage: {
      type: 'string',
      description: 'System/UI language code (ISO 639-1)'
    },
    regionalLanguage: {
      type: 'string',
      description: 'Regional/native language code (ISO 639-1)'
    },
    customDestinationLanguage: {
      type: 'string',
      nullable: true,
      description: 'Custom destination language for translations (ISO 639-1)'
    },
    autoTranslate: {
      type: 'boolean',
      description: 'Automatically translate messages'
    }
  }
} as const;

// ============================================================================
// PRIVACY PREFERENCES SCHEMAS
// ============================================================================

export const privacyPreferencesResponseSchema = {
  type: 'object',
  properties: {
    showOnlineStatus: {
      type: 'boolean',
      description: 'Show online status to others'
    },
    showLastSeen: {
      type: 'boolean',
      description: 'Show last seen time to others'
    },
    showReadReceipts: {
      type: 'boolean',
      description: 'Send read receipts'
    },
    showTypingIndicator: {
      type: 'boolean',
      description: 'Show typing indicator'
    },
    allowContactRequests: {
      type: 'boolean',
      description: 'Allow contact requests from strangers'
    },
    allowGroupInvites: {
      type: 'boolean',
      description: 'Allow group invites from non-contacts'
    },
    saveMediaToGallery: {
      type: 'boolean',
      description: 'Auto-save media to gallery'
    },
    allowAnalytics: {
      type: 'boolean',
      description: 'Allow anonymous usage analytics'
    }
  }
} as const;

export const updatePrivacyPreferencesRequestSchema = {
  type: 'object',
  properties: {
    showOnlineStatus: {
      type: 'boolean',
      description: 'Show online status to others'
    },
    showLastSeen: {
      type: 'boolean',
      description: 'Show last seen time to others'
    },
    showReadReceipts: {
      type: 'boolean',
      description: 'Send read receipts'
    },
    showTypingIndicator: {
      type: 'boolean',
      description: 'Show typing indicator'
    },
    allowContactRequests: {
      type: 'boolean',
      description: 'Allow contact requests from strangers'
    },
    allowGroupInvites: {
      type: 'boolean',
      description: 'Allow group invites from non-contacts'
    },
    saveMediaToGallery: {
      type: 'boolean',
      description: 'Auto-save media to gallery'
    },
    allowAnalytics: {
      type: 'boolean',
      description: 'Allow anonymous usage analytics'
    }
  }
} as const;

// Re-export error schema for convenience
export { errorResponseSchema };
