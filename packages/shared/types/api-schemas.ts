/**
 * API Schemas - JSON Schema definitions for OpenAPI/Swagger documentation
 * SINGLE SOURCE OF TRUTH for API documentation schemas
 *
 * These schemas are used by:
 * - Gateway (Fastify Swagger routes)
 * - Frontend (API client validation)
 * - Any other service requiring API schema validation
 *
 * @module @meeshy/shared/types/api-schemas
 */

// =============================================================================
// USER SCHEMAS
// =============================================================================

/**
 * User permissions object schema
 */
export const userPermissionsSchema = {
  type: 'object',
  description: 'User permissions based on role',
  properties: {
    canAccessAdmin: { type: 'boolean', description: 'Can access admin panel' },
    canManageUsers: { type: 'boolean', description: 'Can manage users' },
    canManageGroups: { type: 'boolean', description: 'Can manage groups' },
    canManageConversations: { type: 'boolean', description: 'Can manage conversations' },
    canViewAnalytics: { type: 'boolean', description: 'Can view analytics' },
    canModerateContent: { type: 'boolean', description: 'Can moderate content' },
    canViewAuditLogs: { type: 'boolean', description: 'Can view audit logs' },
    canManageNotifications: { type: 'boolean', description: 'Can manage notifications' },
    canManageTranslations: { type: 'boolean', description: 'Can manage translations' }
  }
} as const;

/**
 * User object schema for API responses
 * Contains all user fields returned by login, register, and profile endpoints
 */
export const userSchema = {
  type: 'object',
  description: 'User profile data',
  properties: {
    // Identity
    id: { type: 'string', description: 'User unique identifier (MongoDB ObjectId)' },
    username: { type: 'string', description: 'Unique username (2-16 characters)' },
    email: { type: 'string', format: 'email', description: 'Email address' },
    firstName: { type: 'string', description: 'First name' },
    lastName: { type: 'string', description: 'Last name' },
    displayName: { type: 'string', description: 'Display name shown to other users' },
    bio: { type: 'string', nullable: true, description: 'User biography' },
    avatar: { type: 'string', nullable: true, description: 'Avatar image URL' },
    phoneNumber: { type: 'string', nullable: true, description: 'Phone number in E.164 format (+33612345678)' },
    phoneCountryCode: { type: 'string', nullable: true, description: 'ISO 3166-1 alpha-2 country code (FR, US)' },

    // Role & Status
    role: {
      type: 'string',
      enum: ['USER', 'MODERATOR', 'ADMIN', 'CREATOR', 'ANALYST', 'AUDIT', 'BIGBOSS'],
      description: 'User role'
    },
    isActive: { type: 'boolean', description: 'Account active status' },
    deactivatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Account deactivation timestamp' },

    // Translation Settings
    systemLanguage: { type: 'string', description: 'Interface language (ISO 639-1: fr, en, es...)' },
    regionalLanguage: { type: 'string', description: 'Regional language for translations' },
    customDestinationLanguage: { type: 'string', nullable: true, description: 'Custom destination language' },
    autoTranslateEnabled: { type: 'boolean', description: 'Auto-translate messages' },
    translateToSystemLanguage: { type: 'boolean', description: 'Translate to system language' },
    translateToRegionalLanguage: { type: 'boolean', description: 'Translate to regional language' },
    useCustomDestination: { type: 'boolean', description: 'Use custom destination language' },

    // Presence
    isOnline: { type: 'boolean', description: 'Current online status' },
    lastActiveAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last activity timestamp' },

    // Security - Verification Status
    emailVerifiedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Email verification timestamp' },
    phoneVerifiedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Phone verification timestamp' },
    twoFactorEnabledAt: { type: 'string', format: 'date-time', nullable: true, description: '2FA enabled timestamp' },
    lastPasswordChange: { type: 'string', format: 'date-time', nullable: true, description: 'Last password change timestamp' },

    // Security - Login Tracking
    lastLoginIp: { type: 'string', nullable: true, description: 'Last login IP address' },
    lastLoginLocation: { type: 'string', nullable: true, description: 'Last login location (City, Country)' },
    lastLoginDevice: { type: 'string', nullable: true, description: 'Last login device user agent' },

    // Timezone
    timezone: { type: 'string', nullable: true, description: 'User timezone (IANA: Europe/Paris)' },

    // Metadata
    profileCompletionRate: { type: 'number', nullable: true, description: 'Profile completion percentage (0-100)' },
    createdAt: { type: 'string', format: 'date-time', description: 'Account creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last profile update timestamp' },

    // Permissions
    permissions: userPermissionsSchema
  }
} as const;

/**
 * Minimal user schema for lists and references
 */
export const userMinimalSchema = {
  type: 'object',
  description: 'Minimal user data for lists and references',
  properties: {
    id: { type: 'string', description: 'User unique identifier' },
    username: { type: 'string', description: 'Username' },
    displayName: { type: 'string', description: 'Display name' },
    avatar: { type: 'string', nullable: true, description: 'Avatar URL' },
    isOnline: { type: 'boolean', description: 'Online status' }
  }
} as const;

// =============================================================================
// SESSION SCHEMAS
// =============================================================================

/**
 * Session object schema for API responses
 * Contains device, browser, and location information
 */
export const sessionSchema = {
  type: 'object',
  description: 'User session information with device and location data',
  properties: {
    id: { type: 'string', description: 'Session unique identifier' },
    userId: { type: 'string', description: 'User ID who owns this session' },

    // Device Information
    deviceType: { type: 'string', nullable: true, description: 'Device type: mobile, tablet, desktop, smarttv' },
    deviceVendor: { type: 'string', nullable: true, description: 'Device vendor: Apple, Samsung, Huawei' },
    deviceModel: { type: 'string', nullable: true, description: 'Device model: iPhone 15, Galaxy S23' },
    osName: { type: 'string', nullable: true, description: 'Operating system: iOS, Android, Windows, macOS' },
    osVersion: { type: 'string', nullable: true, description: 'OS version: 17.0, 14, 11' },
    browserName: { type: 'string', nullable: true, description: 'Browser name: Safari, Chrome, Firefox' },
    browserVersion: { type: 'string', nullable: true, description: 'Browser version' },
    isMobile: { type: 'boolean', description: 'Is mobile device' },

    // Location Information
    ipAddress: { type: 'string', nullable: true, description: 'IP address' },
    country: { type: 'string', nullable: true, description: 'Country code (ISO 3166-1 alpha-2: FR, US)' },
    city: { type: 'string', nullable: true, description: 'City name' },
    location: { type: 'string', nullable: true, description: 'Formatted location: Paris, France' },

    // Lifecycle
    createdAt: { type: 'string', format: 'date-time', description: 'Session creation timestamp' },
    lastActivityAt: { type: 'string', format: 'date-time', description: 'Last activity timestamp' },

    // Flags
    isCurrentSession: { type: 'boolean', description: 'Is this the current request session' },
    isTrusted: { type: 'boolean', description: 'Is this a trusted device (user-marked)' }
  }
} as const;

/**
 * Minimal session schema for login response
 */
export const sessionMinimalSchema = {
  type: 'object',
  description: 'Minimal session data returned on login',
  properties: {
    id: { type: 'string', description: 'Session unique identifier' },
    deviceType: { type: 'string', nullable: true, description: 'Device type' },
    browserName: { type: 'string', nullable: true, description: 'Browser name' },
    osName: { type: 'string', nullable: true, description: 'OS name' },
    location: { type: 'string', nullable: true, description: 'Location' },
    isMobile: { type: 'boolean', description: 'Is mobile device' },
    createdAt: { type: 'string', format: 'date-time', description: 'Session creation' }
  }
} as const;

// =============================================================================
// MESSAGE SCHEMAS
// =============================================================================

/**
 * Message translation schema
 */
export const messageTranslationSchema = {
  type: 'object',
  description: 'Translation of a message to a specific language',
  properties: {
    id: { type: 'string', description: 'Translation unique identifier' },
    messageId: { type: 'string', description: 'Parent message ID' },
    targetLanguage: { type: 'string', description: 'Target language code (ISO 639-1)' },
    translatedContent: { type: 'string', description: 'Translated message content' },
    translationModel: {
      type: 'string',
      enum: ['basic', 'medium', 'premium'],
      description: 'Translation model used'
    },
    confidenceScore: { type: 'number', nullable: true, description: 'Translation confidence (0-1)' },
    sourceLanguage: { type: 'string', nullable: true, description: 'Source language code' },
    cached: { type: 'boolean', nullable: true, description: 'Whether translation was from cache' },
    createdAt: { type: 'string', format: 'date-time', description: 'Translation creation timestamp' }
  }
} as const;

/**
 * Anonymous sender info schema
 */
export const anonymousSenderSchema = {
  type: 'object',
  description: 'Anonymous participant sender information',
  properties: {
    id: { type: 'string', description: 'Anonymous participant ID' },
    username: { type: 'string', description: 'Generated anonymous username' },
    firstName: { type: 'string', description: 'Anonymous first name' },
    lastName: { type: 'string', description: 'Anonymous last name' },
    language: { type: 'string', description: 'Preferred language' },
    isMeeshyer: { type: 'boolean', description: 'Is a registered Meeshy user' }
  }
} as const;

/**
 * Message schema for API responses
 * Aligned with schema.prisma Message model
 */
export const messageSchema = {
  type: 'object',
  description: 'Chat message with translations and metadata',
  properties: {
    // Identifiers
    id: { type: 'string', description: 'Message unique identifier (MongoDB ObjectId)' },
    conversationId: { type: 'string', description: 'Parent conversation ID' },
    senderId: { type: 'string', nullable: true, description: 'Authenticated user sender ID' },
    anonymousSenderId: { type: 'string', nullable: true, description: 'Anonymous participant sender ID' },

    // Content
    content: { type: 'string', description: 'Message content (original language)' },
    originalLanguage: { type: 'string', description: 'Original message language (ISO 639-1)' },
    messageType: {
      type: 'string',
      enum: ['text', 'image', 'file', 'audio', 'video', 'location', 'system'],
      description: 'Type of message'
    },
    messageSource: {
      type: 'string',
      enum: ['user', 'system', 'ads', 'app', 'agent', 'authority'],
      description: 'Source/origin of the message'
    },

    // State
    isEdited: { type: 'boolean', description: 'Message has been edited' },
    editedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Edit timestamp' },
    isDeleted: { type: 'boolean', description: 'Message has been deleted' },
    deletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Deletion timestamp' },

    // Reply & Forward
    replyToId: { type: 'string', nullable: true, description: 'ID of message being replied to' },
    forwardedFromId: { type: 'string', nullable: true, description: 'Original message ID if forwarded' },
    forwardedFromConversationId: { type: 'string', nullable: true, description: 'Original conversation ID if forwarded' },

    // Expiration & View-once
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Self-destruct timestamp' },
    isViewOnce: { type: 'boolean', description: 'View-once message (disappears after view)' },
    viewOnceCount: { type: 'number', description: 'Number of unique viewers' },
    isBlurred: { type: 'boolean', description: 'Content blurred until tap to reveal' },

    // Delivery Status
    deliveredCount: { type: 'number', description: 'Number of recipients who received the message' },
    readCount: { type: 'number', description: 'Number of recipients who read the message' },
    deliveredToAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Delivered to all timestamp' },
    readByAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Read by all timestamp' },

    // Encryption
    isEncrypted: { type: 'boolean', description: 'Message is encrypted' },
    encryptionMode: {
      type: 'string',
      enum: ['server', 'e2ee', 'hybrid'],
      nullable: true,
      description: 'Encryption mode'
    },

    // Timestamps
    createdAt: { type: 'string', format: 'date-time', description: 'Message creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last update timestamp' },
    timestamp: { type: 'string', format: 'date-time', description: 'Alias for createdAt' },

    // Sender info (populated)
    sender: { ...userMinimalSchema, nullable: true, description: 'Sender user info' },
    anonymousSender: { ...anonymousSenderSchema, nullable: true, description: 'Anonymous sender info' },

    // Translations
    translations: {
      type: 'array',
      items: messageTranslationSchema,
      description: 'Available translations'
    },

    // Attachments
    attachments: {
      type: 'array',
      items: { type: 'object' },
      nullable: true,
      description: 'Message attachments (files, images, etc.)'
    }
  }
} as const;

/**
 * Minimal message schema for lists
 */
export const messageMinimalSchema = {
  type: 'object',
  description: 'Minimal message data for conversation lists',
  properties: {
    id: { type: 'string', description: 'Message ID' },
    content: { type: 'string', description: 'Message content (truncated)' },
    senderId: { type: 'string', nullable: true, description: 'Sender ID' },
    messageType: { type: 'string', description: 'Message type' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' }
  }
} as const;

// =============================================================================
// CONVERSATION SCHEMAS
// =============================================================================

/**
 * Conversation participant schema
 */
export const conversationParticipantSchema = {
  type: 'object',
  description: 'Participant in a conversation',
  properties: {
    userId: { type: 'string', description: 'User ID' },
    role: {
      type: 'string',
      enum: ['USER', 'ADMIN', 'MODO', 'BIGBOSS', 'AUDIT', 'ANALYST', 'MODERATOR', 'CREATOR', 'MEMBER'],
      description: 'Participant role in conversation'
    },
    joinedAt: { type: 'string', format: 'date-time', description: 'Join timestamp' },
    isActive: { type: 'boolean', description: 'Participant is active' },
    permissions: {
      type: 'object',
      nullable: true,
      properties: {
        canInvite: { type: 'boolean', description: 'Can invite others' },
        canRemove: { type: 'boolean', description: 'Can remove participants' },
        canEdit: { type: 'boolean', description: 'Can edit conversation' },
        canDelete: { type: 'boolean', description: 'Can delete messages' },
        canModerate: { type: 'boolean', description: 'Can moderate content' }
      }
    }
  }
} as const;

/**
 * Conversation settings schema
 */
export const conversationSettingsSchema = {
  type: 'object',
  description: 'Conversation configuration settings',
  properties: {
    allowAnonymous: { type: 'boolean', description: 'Allow anonymous participants' },
    requireApproval: { type: 'boolean', description: 'Require approval to join' },
    maxParticipants: { type: 'number', nullable: true, description: 'Maximum number of participants' },
    autoArchive: { type: 'boolean', nullable: true, description: 'Auto-archive after inactivity' },
    translationEnabled: { type: 'boolean', description: 'Enable automatic translation' },
    defaultLanguage: { type: 'string', nullable: true, description: 'Default conversation language' },
    allowedLanguages: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'Allowed languages for messages'
    }
  }
} as const;

/**
 * Conversation link/share schema
 */
export const conversationLinkSchema = {
  type: 'object',
  description: 'Shareable link to join a conversation',
  properties: {
    id: { type: 'string', description: 'Link unique identifier' },
    type: {
      type: 'string',
      enum: ['invite', 'share', 'embed'],
      description: 'Link type'
    },
    url: { type: 'string', description: 'Full shareable URL' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Link expiration' },
    maxUses: { type: 'number', nullable: true, description: 'Maximum number of uses' },
    currentUses: { type: 'number', description: 'Current number of uses' },
    isActive: { type: 'boolean', description: 'Link is active' },
    createdBy: { type: 'string', description: 'User ID who created the link' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    // Anonymous permissions
    allowAnonymousMessages: { type: 'boolean', nullable: true, description: 'Allow anonymous messages' },
    allowAnonymousFiles: { type: 'boolean', nullable: true, description: 'Allow anonymous file uploads' },
    allowViewHistory: { type: 'boolean', nullable: true, description: 'Allow viewing message history' },
    requireNickname: { type: 'boolean', nullable: true, description: 'Require nickname to join' },
    requireEmail: { type: 'boolean', nullable: true, description: 'Require email to join' }
  }
} as const;

/**
 * Conversation statistics schema
 */
export const conversationStatsSchema = {
  type: 'object',
  description: 'Conversation activity statistics',
  properties: {
    totalMessages: { type: 'number', description: 'Total message count' },
    totalParticipants: { type: 'number', description: 'Total participant count' },
    activeParticipants: { type: 'number', description: 'Active participants (last 24h)' },
    messagesLast24h: { type: 'number', description: 'Messages in last 24 hours' },
    messagesLast7days: { type: 'number', description: 'Messages in last 7 days' },
    averageResponseTime: { type: 'number', description: 'Average response time (minutes)' },
    lastActivity: { type: 'string', format: 'date-time', description: 'Last activity timestamp' },
    topLanguages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          messageCount: { type: 'number' },
          percentage: { type: 'number' }
        }
      },
      description: 'Most used languages'
    }
  }
} as const;

/**
 * Full conversation schema for API responses
 * Aligned with schema.prisma Conversation model
 */
export const conversationSchema = {
  type: 'object',
  description: 'Conversation with participants, messages, and metadata',
  properties: {
    // Identifiers
    id: { type: 'string', description: 'Conversation unique identifier (MongoDB ObjectId)' },
    identifier: { type: 'string', nullable: true, description: 'Human-readable identifier for URLs' },

    // Metadata
    title: { type: 'string', nullable: true, description: 'Conversation title/name' },
    description: { type: 'string', nullable: true, description: 'Conversation description' },
    type: {
      type: 'string',
      enum: ['direct', 'group', 'public', 'global', 'broadcast'],
      description: 'Conversation type'
    },
    status: {
      type: 'string',
      enum: ['active', 'archived', 'deleted'],
      description: 'Conversation status'
    },
    visibility: {
      type: 'string',
      enum: ['public', 'private', 'restricted'],
      description: 'Conversation visibility'
    },
    image: { type: 'string', nullable: true, description: 'Conversation image URL' },
    avatar: { type: 'string', nullable: true, description: 'Conversation avatar URL' },
    banner: { type: 'string', nullable: true, description: 'Conversation banner URL' },

    // Community
    communityId: { type: 'string', nullable: true, description: 'Parent community ID' },
    isActive: { type: 'boolean', description: 'Conversation is active' },
    memberCount: { type: 'number', description: 'Number of members (denormalized)' },

    // Participants
    participants: {
      type: 'array',
      items: conversationParticipantSchema,
      description: 'Conversation participants'
    },

    // Last message
    lastMessage: { ...messageMinimalSchema, nullable: true, description: 'Most recent message' },
    lastMessageAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last message timestamp' },
    messageCount: { type: 'number', nullable: true, description: 'Total message count' },
    unreadCount: { type: 'number', nullable: true, description: 'Unread message count for current user' },

    // Encryption
    encryptionMode: {
      type: 'string',
      enum: ['server', 'e2ee', 'hybrid'],
      nullable: true,
      description: 'Encryption mode'
    },
    encryptionEnabledAt: { type: 'string', format: 'date-time', nullable: true, description: 'Encryption enabled timestamp' },

    // Statistics
    stats: { ...conversationStatsSchema, nullable: true, description: 'Conversation statistics' },

    // Settings
    settings: { ...conversationSettingsSchema, nullable: true, description: 'Conversation settings' },

    // Links
    links: {
      type: 'array',
      items: conversationLinkSchema,
      nullable: true,
      description: 'Shareable links'
    },

    // Timestamps
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' },
    lastActivityAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last activity timestamp' },

    // Creator
    createdBy: { type: 'string', nullable: true, description: 'Creator user ID' },
    createdByUser: { ...userMinimalSchema, nullable: true, description: 'Creator user info' }
  }
} as const;

/**
 * Minimal conversation schema for lists
 */
export const conversationMinimalSchema = {
  type: 'object',
  description: 'Minimal conversation data for lists',
  properties: {
    id: { type: 'string', description: 'Conversation ID' },
    identifier: { type: 'string', nullable: true, description: 'Human-readable identifier' },
    title: { type: 'string', nullable: true, description: 'Conversation title' },
    type: { type: 'string', description: 'Conversation type' },
    avatar: { type: 'string', nullable: true, description: 'Avatar URL' },
    memberCount: { type: 'number', description: 'Member count' },
    lastMessage: { ...messageMinimalSchema, nullable: true, description: 'Last message' },
    lastMessageAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last message timestamp' },
    unreadCount: { type: 'number', nullable: true, description: 'Unread count' }
  }
} as const;

// =============================================================================
// CONVERSATION REQUEST SCHEMAS
// =============================================================================

/**
 * Create conversation request schema
 */
export const createConversationRequestSchema = {
  type: 'object',
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      enum: ['direct', 'group', 'public', 'global'],
      description: 'Conversation type'
    },
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'Conversation title (required for group/public)'
    },
    description: {
      type: 'string',
      maxLength: 500,
      description: 'Conversation description'
    },
    identifier: {
      type: 'string',
      maxLength: 50,
      pattern: '^[a-zA-Z0-9\\-_@]*$',
      description: 'Custom identifier for URLs'
    },
    participantIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Initial participant user IDs'
    },
    communityId: {
      type: 'string',
      description: 'Parent community ID'
    }
  }
} as const;

/**
 * Update conversation request schema
 */
export const updateConversationRequestSchema = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'New conversation title'
    },
    description: {
      type: 'string',
      maxLength: 500,
      description: 'New description'
    },
    type: {
      type: 'string',
      enum: ['direct', 'group', 'public', 'global'],
      description: 'New conversation type'
    }
  }
} as const;

/**
 * Send message request schema
 */
export const sendMessageRequestSchema = {
  type: 'object',
  required: ['content'],
  properties: {
    content: {
      type: 'string',
      minLength: 1,
      maxLength: 10000,
      description: 'Message content'
    },
    originalLanguage: {
      type: 'string',
      minLength: 2,
      maxLength: 5,
      default: 'fr',
      description: 'Original message language (ISO 639-1)'
    },
    messageType: {
      type: 'string',
      enum: ['text', 'image', 'file', 'audio', 'video', 'location', 'system'],
      default: 'text',
      description: 'Message type'
    },
    replyToId: {
      type: 'string',
      description: 'ID of message to reply to'
    }
  }
} as const;

/**
 * Edit message request schema
 */
export const editMessageRequestSchema = {
  type: 'object',
  required: ['content'],
  properties: {
    content: {
      type: 'string',
      minLength: 1,
      maxLength: 10000,
      description: 'New message content'
    },
    originalLanguage: {
      type: 'string',
      minLength: 2,
      maxLength: 5,
      description: 'Message language if changed'
    }
  }
} as const;

// =============================================================================
// CONVERSATION RESPONSE SCHEMAS
// =============================================================================

/**
 * Conversation list response schema
 */
export const conversationListResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        conversations: {
          type: 'array',
          items: conversationMinimalSchema
        },
        totalCount: { type: 'number', description: 'Total number of conversations' },
        hasMore: { type: 'boolean', description: 'More conversations available' }
      }
    }
  }
} as const;

/**
 * Single conversation response schema
 */
export const conversationResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        conversation: conversationSchema
      }
    }
  }
} as const;

/**
 * Message list response schema
 */
export const messageListResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: messageSchema
        },
        totalCount: { type: 'number', description: 'Total number of messages' },
        hasMore: { type: 'boolean', description: 'More messages available' }
      }
    }
  }
} as const;

/**
 * Single message response schema
 */
export const messageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        message: messageSchema
      }
    }
  }
} as const;

/**
 * Participants list response schema
 */
export const participantsListResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        participants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ...conversationParticipantSchema.properties,
              user: userMinimalSchema
            }
          }
        },
        totalCount: { type: 'number', description: 'Total number of participants' }
      }
    }
  }
} as const;

// =============================================================================
// AUTH RESPONSE SCHEMAS
// =============================================================================

/**
 * Login response schema
 */
export const loginResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        user: userSchema,
        token: { type: 'string', description: 'JWT access token for API authentication' },
        sessionToken: { type: 'string', description: 'Session token for device management (store securely)' },
        session: sessionMinimalSchema,
        expiresIn: { type: 'number', description: 'Token expiration time in seconds', example: 86400 }
      }
    }
  }
} as const;

/**
 * Register response schema
 */
export const registerResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        user: userSchema,
        token: { type: 'string', description: 'JWT access token for API authentication' },
        expiresIn: { type: 'number', description: 'Token expiration time in seconds', example: 86400 }
      }
    }
  }
} as const;

/**
 * Sessions list response schema
 */
export const sessionsListResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        sessions: {
          type: 'array',
          items: sessionSchema
        },
        totalCount: { type: 'number', description: 'Total number of active sessions' }
      }
    }
  }
} as const;

// =============================================================================
// MESSAGE ATTACHMENT SCHEMAS
// =============================================================================

/**
 * Message attachment schema for API responses
 * Aligned with schema.prisma MessageAttachment model
 */
export const messageAttachmentSchema = {
  type: 'object',
  description: 'File attachment for a message',
  properties: {
    // Identifiers
    id: { type: 'string', description: 'Attachment unique identifier' },
    messageId: { type: 'string', description: 'Parent message ID' },

    // File info
    fileName: { type: 'string', description: 'Generated unique filename' },
    originalName: { type: 'string', description: 'Original filename' },
    mimeType: { type: 'string', description: 'MIME type (image/jpeg, application/pdf, etc.)' },
    fileSize: { type: 'number', description: 'File size in bytes' },
    filePath: { type: 'string', description: 'Relative file path' },
    fileUrl: { type: 'string', description: 'Full URL for access' },

    // User-provided metadata
    title: { type: 'string', nullable: true, description: 'Human-readable title' },
    alt: { type: 'string', nullable: true, description: 'Accessibility alt text' },
    caption: { type: 'string', nullable: true, description: 'Caption/legend' },

    // Forwarding
    forwardedFromAttachmentId: { type: 'string', nullable: true, description: 'Original attachment ID if forwarded' },
    isForwarded: { type: 'boolean', description: 'Whether this is a forwarded attachment' },

    // View-once / Secret
    isViewOnce: { type: 'boolean', description: 'View-once attachment' },
    maxViewOnceCount: { type: 'number', nullable: true, description: 'Max unique viewers' },
    viewOnceCount: { type: 'number', description: 'Current view count' },
    isBlurred: { type: 'boolean', description: 'Content blurred until tap' },

    // Image metadata
    width: { type: 'number', nullable: true, description: 'Image width in pixels' },
    height: { type: 'number', nullable: true, description: 'Image height in pixels' },
    thumbnailPath: { type: 'string', nullable: true, description: 'Thumbnail file path' },
    thumbnailUrl: { type: 'string', nullable: true, description: 'Thumbnail URL' },

    // Audio/Video metadata
    duration: { type: 'number', nullable: true, description: 'Duration in milliseconds' },
    bitrate: { type: 'number', nullable: true, description: 'Bitrate in bps' },
    sampleRate: { type: 'number', nullable: true, description: 'Sample rate in Hz' },
    codec: { type: 'string', nullable: true, description: 'Audio codec (opus, aac, mp3)' },
    channels: { type: 'number', nullable: true, description: 'Audio channels (1=mono, 2=stereo)' },

    // Video-specific
    fps: { type: 'number', nullable: true, description: 'Frames per second' },
    videoCodec: { type: 'string', nullable: true, description: 'Video codec (h264, h265, vp9)' },

    // Document metadata
    pageCount: { type: 'number', nullable: true, description: 'Page count for PDFs' },
    lineCount: { type: 'number', nullable: true, description: 'Line count for text files' },

    // Upload info
    uploadedBy: { type: 'string', description: 'Uploader user ID' },
    isAnonymous: { type: 'boolean', description: 'Uploaded by anonymous user' },

    // Security/Moderation
    scanStatus: {
      type: 'string',
      enum: ['pending', 'clean', 'infected', 'error'],
      nullable: true,
      description: 'Virus scan status'
    },
    scanCompletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Scan completion time' },
    moderationStatus: {
      type: 'string',
      enum: ['pending', 'approved', 'flagged', 'rejected'],
      nullable: true,
      description: 'Content moderation status'
    },
    moderationReason: { type: 'string', nullable: true, description: 'Moderation reason' },

    // Delivery status
    deliveredToAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Delivered to all timestamp' },
    viewedByAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Viewed by all timestamp' },
    downloadedByAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Downloaded by all timestamp' },
    viewedCount: { type: 'number', description: 'Number of viewers' },
    downloadedCount: { type: 'number', description: 'Number of downloads' },

    // Encryption
    isEncrypted: { type: 'boolean', description: 'Whether encrypted' },
    encryptionMode: {
      type: 'string',
      enum: ['e2ee', 'server', 'hybrid'],
      nullable: true,
      description: 'Encryption mode'
    },

    // Timestamps
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    metadata: { type: 'object', nullable: true, description: 'Additional metadata JSON' }
  }
} as const;

/**
 * Minimal attachment schema for lists
 */
export const messageAttachmentMinimalSchema = {
  type: 'object',
  description: 'Minimal attachment data',
  properties: {
    id: { type: 'string', description: 'Attachment ID' },
    fileName: { type: 'string', description: 'Filename' },
    mimeType: { type: 'string', description: 'MIME type' },
    fileSize: { type: 'number', description: 'File size' },
    fileUrl: { type: 'string', description: 'File URL' },
    thumbnailUrl: { type: 'string', nullable: true, description: 'Thumbnail URL' },
    duration: { type: 'number', nullable: true, description: 'Duration (audio/video)' }
  }
} as const;

// =============================================================================
// REACTION SCHEMAS
// =============================================================================

/**
 * Reaction schema for API responses
 */
export const reactionSchema = {
  type: 'object',
  description: 'Emoji reaction on a message',
  properties: {
    id: { type: 'string', description: 'Reaction unique identifier' },
    messageId: { type: 'string', description: 'Message ID' },
    userId: { type: 'string', nullable: true, description: 'User ID (null for anonymous)' },
    anonymousId: { type: 'string', nullable: true, description: 'Anonymous participant ID' },
    emoji: { type: 'string', description: 'Emoji character' },
    createdAt: { type: 'string', format: 'date-time', description: 'Reaction timestamp' },
    user: { ...userMinimalSchema, nullable: true, description: 'User info if authenticated' }
  }
} as const;

/**
 * Reaction summary schema (grouped by emoji)
 */
export const reactionSummarySchema = {
  type: 'object',
  description: 'Reaction summary grouped by emoji',
  properties: {
    emoji: { type: 'string', description: 'Emoji character' },
    count: { type: 'number', description: 'Number of reactions with this emoji' },
    userReacted: { type: 'boolean', description: 'Whether current user reacted with this emoji' },
    users: {
      type: 'array',
      items: userMinimalSchema,
      description: 'Users who reacted (limited)'
    }
  }
} as const;

/**
 * Add reaction request schema
 */
export const addReactionRequestSchema = {
  type: 'object',
  required: ['emoji'],
  properties: {
    emoji: {
      type: 'string',
      minLength: 1,
      maxLength: 10,
      description: 'Emoji to add as reaction'
    }
  }
} as const;

// =============================================================================
// MENTION SCHEMAS
// =============================================================================

/**
 * Mention schema for API responses
 */
export const mentionSchema = {
  type: 'object',
  description: 'User mention in a message',
  properties: {
    id: { type: 'string', description: 'Mention unique identifier' },
    messageId: { type: 'string', description: 'Message ID' },
    mentionedUserId: { type: 'string', description: 'Mentioned user ID' },
    mentionedAt: { type: 'string', format: 'date-time', description: 'Mention timestamp' },
    mentionedUser: { ...userMinimalSchema, description: 'Mentioned user info' }
  }
} as const;

// =============================================================================
// FRIEND REQUEST SCHEMAS
// =============================================================================

/**
 * Friend request schema for API responses
 */
export const friendRequestSchema = {
  type: 'object',
  description: 'Friend request between users',
  properties: {
    id: { type: 'string', description: 'Request unique identifier' },
    senderId: { type: 'string', description: 'Sender user ID' },
    receiverId: { type: 'string', description: 'Receiver user ID' },
    message: { type: 'string', nullable: true, description: 'Optional message with request' },
    status: {
      type: 'string',
      enum: ['pending', 'accepted', 'rejected', 'blocked'],
      description: 'Request status'
    },
    respondedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Response timestamp' },
    createdAt: { type: 'string', format: 'date-time', description: 'Request creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' },
    sender: { ...userMinimalSchema, description: 'Sender user info' },
    receiver: { ...userMinimalSchema, description: 'Receiver user info' }
  }
} as const;

/**
 * Send friend request body schema
 */
export const sendFriendRequestSchema = {
  type: 'object',
  required: ['receiverId'],
  properties: {
    receiverId: {
      type: 'string',
      description: 'User ID to send request to'
    },
    message: {
      type: 'string',
      maxLength: 200,
      description: 'Optional message with the request'
    }
  }
} as const;

/**
 * Respond to friend request body schema
 */
export const respondFriendRequestSchema = {
  type: 'object',
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: ['accept', 'reject', 'block'],
      description: 'Response action'
    }
  }
} as const;

// =============================================================================
// NOTIFICATION SCHEMAS
// =============================================================================

/**
 * Notification schema for API responses
 */
export const notificationSchema = {
  type: 'object',
  description: 'User notification',
  properties: {
    id: { type: 'string', description: 'Notification unique identifier' },
    userId: { type: 'string', description: 'Recipient user ID' },
    type: {
      type: 'string',
      enum: [
        'new_conversation', 'new_message', 'message_edited',
        'friend_request', 'friend_accepted', 'missed_call',
        'mention', 'reaction', 'member_joined', 'system'
      ],
      description: 'Notification type'
    },
    title: { type: 'string', description: 'Notification title' },
    content: { type: 'string', description: 'Notification content' },
    data: { type: 'string', nullable: true, description: 'Additional data JSON' },
    priority: {
      type: 'string',
      enum: ['low', 'normal', 'high', 'urgent'],
      description: 'Notification priority'
    },
    isRead: { type: 'boolean', description: 'Whether notification is read' },
    readAt: { type: 'string', format: 'date-time', nullable: true, description: 'Read timestamp' },
    emailSent: { type: 'boolean', description: 'Email notification sent' },
    pushSent: { type: 'boolean', description: 'Push notification sent' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration timestamp' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },

    // Sender info (for message/call notifications)
    senderId: { type: 'string', nullable: true, description: 'Sender user ID' },
    senderUsername: { type: 'string', nullable: true, description: 'Sender username' },
    senderAvatar: { type: 'string', nullable: true, description: 'Sender avatar URL' },
    senderDisplayName: { type: 'string', nullable: true, description: 'Sender display name' },
    messagePreview: { type: 'string', nullable: true, description: 'Message preview (truncated)' },

    // References
    conversationId: { type: 'string', nullable: true, description: 'Related conversation ID' },
    messageId: { type: 'string', nullable: true, description: 'Related message ID' },
    callSessionId: { type: 'string', nullable: true, description: 'Related call session ID' }
  }
} as const;

/**
 * Notification preferences schema
 */
export const notificationPreferenceSchema = {
  type: 'object',
  description: 'User notification preferences',
  properties: {
    id: { type: 'string', description: 'Preference unique identifier' },
    userId: { type: 'string', description: 'User ID' },

    // Global toggles
    pushEnabled: { type: 'boolean', description: 'Push notifications enabled' },
    emailEnabled: { type: 'boolean', description: 'Email notifications enabled' },
    soundEnabled: { type: 'boolean', description: 'Sound enabled' },

    // Per-type preferences
    newMessageEnabled: { type: 'boolean', description: 'New message notifications' },
    missedCallEnabled: { type: 'boolean', description: 'Missed call notifications' },
    systemEnabled: { type: 'boolean', description: 'System notifications' },
    conversationEnabled: { type: 'boolean', description: 'Conversation notifications' },
    replyEnabled: { type: 'boolean', description: 'Reply notifications' },
    mentionEnabled: { type: 'boolean', description: 'Mention notifications' },
    reactionEnabled: { type: 'boolean', description: 'Reaction notifications' },
    contactRequestEnabled: { type: 'boolean', description: 'Contact request notifications' },
    memberJoinedEnabled: { type: 'boolean', description: 'Member joined notifications' },

    // Do Not Disturb
    dndEnabled: { type: 'boolean', description: 'Do Not Disturb enabled' },
    dndStartTime: { type: 'string', nullable: true, description: 'DND start time (HH:mm)' },
    dndEndTime: { type: 'string', nullable: true, description: 'DND end time (HH:mm)' },

    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' }
  }
} as const;

/**
 * Update notification preferences request schema
 */
export const updateNotificationPreferencesRequestSchema = {
  type: 'object',
  properties: {
    pushEnabled: { type: 'boolean' },
    emailEnabled: { type: 'boolean' },
    soundEnabled: { type: 'boolean' },
    newMessageEnabled: { type: 'boolean' },
    missedCallEnabled: { type: 'boolean' },
    systemEnabled: { type: 'boolean' },
    conversationEnabled: { type: 'boolean' },
    replyEnabled: { type: 'boolean' },
    mentionEnabled: { type: 'boolean' },
    reactionEnabled: { type: 'boolean' },
    contactRequestEnabled: { type: 'boolean' },
    memberJoinedEnabled: { type: 'boolean' },
    dndEnabled: { type: 'boolean' },
    dndStartTime: { type: 'string', pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' },
    dndEndTime: { type: 'string', pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' }
  }
} as const;

// =============================================================================
// COMMUNITY SCHEMAS
// =============================================================================

/**
 * Community schema for API responses
 */
export const communitySchema = {
  type: 'object',
  description: 'Community/group of conversations',
  properties: {
    id: { type: 'string', description: 'Community unique identifier' },
    identifier: { type: 'string', description: 'Human-readable identifier' },
    name: { type: 'string', description: 'Community name' },
    description: { type: 'string', nullable: true, description: 'Community description' },
    avatar: { type: 'string', nullable: true, description: 'Community avatar URL' },
    banner: { type: 'string', nullable: true, description: 'Community banner URL' },
    isPrivate: { type: 'boolean', description: 'Whether community is private' },
    isActive: { type: 'boolean', description: 'Whether community is active' },
    deletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Deletion timestamp' },
    createdBy: { type: 'string', description: 'Creator user ID' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' },
    creator: { ...userMinimalSchema, description: 'Creator user info' },
    memberCount: { type: 'number', description: 'Number of members' },
    conversationCount: { type: 'number', description: 'Number of conversations' }
  }
} as const;

/**
 * Minimal community schema for lists
 */
export const communityMinimalSchema = {
  type: 'object',
  description: 'Minimal community data for lists',
  properties: {
    id: { type: 'string', description: 'Community ID' },
    identifier: { type: 'string', description: 'Identifier' },
    name: { type: 'string', description: 'Name' },
    avatar: { type: 'string', nullable: true, description: 'Avatar URL' },
    isPrivate: { type: 'boolean', description: 'Is private' },
    memberCount: { type: 'number', description: 'Member count' }
  }
} as const;

/**
 * Community member schema
 */
export const communityMemberSchema = {
  type: 'object',
  description: 'Community membership',
  properties: {
    id: { type: 'string', description: 'Membership unique identifier' },
    communityId: { type: 'string', description: 'Community ID' },
    userId: { type: 'string', description: 'User ID' },
    joinedAt: { type: 'string', format: 'date-time', description: 'Join timestamp' },
    role: {
      type: 'string',
      enum: ['admin', 'moderator', 'member'],
      description: 'Member role'
    },
    isActive: { type: 'boolean', description: 'Whether membership is active' },
    leftAt: { type: 'string', format: 'date-time', nullable: true, description: 'Leave timestamp' },
    user: { ...userMinimalSchema, description: 'User info' }
  }
} as const;

/**
 * Create community request schema
 */
export const createCommunityRequestSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'Community name'
    },
    identifier: {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      pattern: '^[a-zA-Z0-9\\-_]+$',
      description: 'Custom identifier for URLs'
    },
    description: {
      type: 'string',
      maxLength: 500,
      description: 'Community description'
    },
    isPrivate: {
      type: 'boolean',
      default: true,
      description: 'Whether community is private'
    }
  }
} as const;

/**
 * Update community request schema
 */
export const updateCommunityRequestSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', maxLength: 500 },
    avatar: { type: 'string', format: 'uri' },
    banner: { type: 'string', format: 'uri' },
    isPrivate: { type: 'boolean' }
  }
} as const;

// =============================================================================
// CALL SESSION SCHEMAS
// =============================================================================

/**
 * Call session schema for API responses
 * Aligned with schema.prisma CallSession model
 */
export const callSessionSchema = {
  type: 'object',
  description: 'Voice/video call session',
  properties: {
    id: { type: 'string', description: 'Call session unique identifier' },
    conversationId: { type: 'string', description: 'Parent conversation ID' },
    initiatorId: { type: 'string', description: 'User who initiated the call' },
    mode: {
      type: 'string',
      enum: ['voice', 'video'],
      description: 'Call mode'
    },
    status: {
      type: 'string',
      enum: ['ringing', 'active', 'ended', 'missed', 'rejected', 'failed'],
      description: 'Call status'
    },

    // Timestamps
    startedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Call start timestamp' },
    endedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Call end timestamp' },
    duration: { type: 'number', nullable: true, description: 'Call duration in seconds' },

    // Recording
    isRecorded: { type: 'boolean', description: 'Whether call was recorded' },
    recordingUrl: { type: 'string', nullable: true, description: 'Recording URL if available' },

    // Transcription
    isTranscribed: { type: 'boolean', description: 'Whether call was transcribed' },
    transcriptionId: { type: 'string', nullable: true, description: 'Transcription ID' },

    // Quality metrics
    averageQuality: { type: 'number', nullable: true, description: 'Average quality score (0-100)' },

    // Metadata
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' },

    // Populated fields
    initiator: { ...userMinimalSchema, description: 'Call initiator user info' },
    participants: {
      type: 'array',
      items: { $ref: '#/components/schemas/CallParticipant' },
      description: 'Call participants'
    },
    participantCount: { type: 'number', description: 'Number of participants' }
  }
} as const;

/**
 * Minimal call session schema for lists
 */
export const callSessionMinimalSchema = {
  type: 'object',
  description: 'Minimal call session data',
  properties: {
    id: { type: 'string', description: 'Call session ID' },
    mode: { type: 'string', enum: ['voice', 'video'], description: 'Call mode' },
    status: { type: 'string', description: 'Call status' },
    startedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Start time' },
    duration: { type: 'number', nullable: true, description: 'Duration in seconds' },
    participantCount: { type: 'number', description: 'Participant count' }
  }
} as const;

/**
 * Call participant schema
 */
export const callParticipantSchema = {
  type: 'object',
  description: 'Participant in a call session',
  properties: {
    id: { type: 'string', description: 'Participant record ID' },
    callSessionId: { type: 'string', description: 'Call session ID' },
    userId: { type: 'string', description: 'User ID' },
    role: {
      type: 'string',
      enum: ['initiator', 'participant', 'observer'],
      description: 'Participant role'
    },
    status: {
      type: 'string',
      enum: ['invited', 'ringing', 'connected', 'disconnected', 'declined'],
      description: 'Participant status'
    },
    joinedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Join timestamp' },
    leftAt: { type: 'string', format: 'date-time', nullable: true, description: 'Leave timestamp' },
    duration: { type: 'number', nullable: true, description: 'Time in call (seconds)' },
    isMuted: { type: 'boolean', description: 'Audio muted' },
    isVideoOff: { type: 'boolean', description: 'Video disabled' },
    connectionQuality: { type: 'number', nullable: true, description: 'Connection quality (0-100)' },
    user: { ...userMinimalSchema, description: 'User info' }
  }
} as const;

/**
 * Start call request schema
 */
export const startCallRequestSchema = {
  type: 'object',
  required: ['conversationId', 'mode'],
  properties: {
    conversationId: { type: 'string', description: 'Conversation to start call in' },
    mode: { type: 'string', enum: ['voice', 'video'], description: 'Call mode' },
    participantIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific users to invite (optional, all conversation members by default)'
    }
  }
} as const;

// =============================================================================
// REPORT SCHEMAS
// =============================================================================

/**
 * Report schema for API responses
 */
export const reportSchema = {
  type: 'object',
  description: 'User or content report',
  properties: {
    id: { type: 'string', description: 'Report unique identifier' },
    reporterId: { type: 'string', description: 'Reporting user ID' },
    reportType: {
      type: 'string',
      enum: ['spam', 'harassment', 'inappropriate_content', 'impersonation', 'other'],
      description: 'Report type'
    },
    targetType: {
      type: 'string',
      enum: ['user', 'message', 'conversation', 'community'],
      description: 'Type of reported content'
    },
    targetId: { type: 'string', description: 'ID of reported content' },
    reason: { type: 'string', description: 'Detailed reason for report' },
    evidence: { type: 'string', nullable: true, description: 'Additional evidence (JSON)' },
    status: {
      type: 'string',
      enum: ['pending', 'investigating', 'resolved', 'dismissed'],
      description: 'Report status'
    },
    resolution: { type: 'string', nullable: true, description: 'Resolution notes' },
    resolvedBy: { type: 'string', nullable: true, description: 'Moderator who resolved' },
    resolvedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Resolution timestamp' },
    createdAt: { type: 'string', format: 'date-time', description: 'Report creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' },
    reporter: { ...userMinimalSchema, description: 'Reporter user info' }
  }
} as const;

/**
 * Create report request schema
 */
export const createReportRequestSchema = {
  type: 'object',
  required: ['reportType', 'targetType', 'targetId', 'reason'],
  properties: {
    reportType: {
      type: 'string',
      enum: ['spam', 'harassment', 'inappropriate_content', 'impersonation', 'other'],
      description: 'Type of report'
    },
    targetType: {
      type: 'string',
      enum: ['user', 'message', 'conversation', 'community'],
      description: 'Type of content being reported'
    },
    targetId: { type: 'string', description: 'ID of content being reported' },
    reason: { type: 'string', minLength: 10, maxLength: 1000, description: 'Detailed reason' },
    evidence: { type: 'string', maxLength: 5000, description: 'Additional evidence' }
  }
} as const;

// =============================================================================
// USER STATS SCHEMAS
// =============================================================================

/**
 * User statistics schema
 */
export const userStatsSchema = {
  type: 'object',
  description: 'User activity statistics',
  properties: {
    id: { type: 'string', description: 'Stats record ID' },
    userId: { type: 'string', description: 'User ID' },

    // Message stats
    totalMessagesSent: { type: 'number', description: 'Total messages sent' },
    totalMessagesReceived: { type: 'number', description: 'Total messages received' },
    messagesThisWeek: { type: 'number', description: 'Messages sent this week' },
    messagesThisMonth: { type: 'number', description: 'Messages sent this month' },

    // Conversation stats
    totalConversations: { type: 'number', description: 'Total conversations' },
    activeConversations: { type: 'number', description: 'Active conversations' },
    publicConversationsCreated: { type: 'number', description: 'Public conversations created' },

    // Call stats
    totalCallsInitiated: { type: 'number', description: 'Calls initiated' },
    totalCallsReceived: { type: 'number', description: 'Calls received' },
    totalCallDuration: { type: 'number', description: 'Total call time (minutes)' },

    // Translation stats
    totalTranslationsRequested: { type: 'number', description: 'Translations requested' },
    topLanguagesPaired: { type: 'string', nullable: true, description: 'Top language pairs (JSON)' },

    // Social stats
    totalFriends: { type: 'number', description: 'Total friends' },
    communitiesJoined: { type: 'number', description: 'Communities joined' },
    communitiesCreated: { type: 'number', description: 'Communities created' },

    // Engagement
    averageResponseTime: { type: 'number', nullable: true, description: 'Avg response time (minutes)' },
    lastActiveAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last activity' },
    streakDays: { type: 'number', description: 'Current activity streak' },

    createdAt: { type: 'string', format: 'date-time', description: 'Stats creation' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Stats last update' }
  }
} as const;

// =============================================================================
// AUDIO TRANSCRIPTION SCHEMAS
// =============================================================================

/**
 * Message audio transcription schema
 */
export const messageAudioTranscriptionSchema = {
  type: 'object',
  description: 'Audio message transcription',
  properties: {
    id: { type: 'string', description: 'Transcription ID' },
    messageId: { type: 'string', description: 'Parent message ID' },
    attachmentId: { type: 'string', nullable: true, description: 'Audio attachment ID' },
    sourceLanguage: { type: 'string', description: 'Detected source language' },
    transcriptionText: { type: 'string', description: 'Transcribed text' },
    confidence: { type: 'number', nullable: true, description: 'Confidence score (0-1)' },
    duration: { type: 'number', nullable: true, description: 'Audio duration (ms)' },
    model: { type: 'string', nullable: true, description: 'Transcription model used' },
    status: {
      type: 'string',
      enum: ['pending', 'processing', 'completed', 'failed'],
      description: 'Transcription status'
    },
    errorMessage: { type: 'string', nullable: true, description: 'Error if failed' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    completedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Completion timestamp' }
  }
} as const;

/**
 * Translated audio schema
 */
export const messageTranslatedAudioSchema = {
  type: 'object',
  description: 'Translated audio file',
  properties: {
    id: { type: 'string', description: 'Translated audio ID' },
    messageId: { type: 'string', description: 'Parent message ID' },
    transcriptionId: { type: 'string', description: 'Source transcription ID' },
    targetLanguage: { type: 'string', description: 'Target language' },
    translatedText: { type: 'string', description: 'Translated text' },
    audioUrl: { type: 'string', nullable: true, description: 'Generated audio URL' },
    voiceModelId: { type: 'string', nullable: true, description: 'Voice model used' },
    duration: { type: 'number', nullable: true, description: 'Audio duration (ms)' },
    status: {
      type: 'string',
      enum: ['pending', 'processing', 'completed', 'failed'],
      description: 'Generation status'
    },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' }
  }
} as const;

/**
 * User voice model schema
 */
export const userVoiceModelSchema = {
  type: 'object',
  description: 'User voice clone model',
  properties: {
    id: { type: 'string', description: 'Voice model ID' },
    userId: { type: 'string', description: 'Owner user ID' },
    name: { type: 'string', description: 'Voice model name' },
    language: { type: 'string', description: 'Primary language' },
    modelId: { type: 'string', description: 'External model ID' },
    status: {
      type: 'string',
      enum: ['training', 'ready', 'failed', 'deleted'],
      description: 'Model status'
    },
    sampleCount: { type: 'number', description: 'Number of training samples' },
    totalDuration: { type: 'number', nullable: true, description: 'Total sample duration (seconds)' },
    quality: { type: 'number', nullable: true, description: 'Model quality score' },
    isDefault: { type: 'boolean', description: 'Default voice model for user' },
    isPublic: { type: 'boolean', description: 'Whether model is public' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' }
  }
} as const;

/**
 * Request transcription schema
 */
export const requestTranscriptionSchema = {
  type: 'object',
  required: ['messageId'],
  properties: {
    messageId: { type: 'string', description: 'Message ID to transcribe' },
    attachmentId: { type: 'string', description: 'Specific attachment ID (optional)' }
  }
} as const;

// =============================================================================
// CONVERSATION READ CURSOR SCHEMAS
// =============================================================================

/**
 * Read cursor schema (tracks read position)
 */
export const conversationReadCursorSchema = {
  type: 'object',
  description: 'User read position in conversation',
  properties: {
    id: { type: 'string', description: 'Cursor ID' },
    conversationId: { type: 'string', description: 'Conversation ID' },
    userId: { type: 'string', description: 'User ID' },
    lastReadMessageId: { type: 'string', nullable: true, description: 'Last read message ID' },
    lastReadAt: { type: 'string', format: 'date-time', description: 'Last read timestamp' },
    unreadCount: { type: 'number', description: 'Unread message count' }
  }
} as const;

// =============================================================================
// ADMIN AUDIT LOG SCHEMAS
// =============================================================================

/**
 * Admin audit log schema
 */
export const adminAuditLogSchema = {
  type: 'object',
  description: 'Admin action audit log entry',
  properties: {
    id: { type: 'string', description: 'Audit log ID' },
    adminId: { type: 'string', description: 'Admin user ID who performed action' },
    action: {
      type: 'string',
      enum: [
        'user_ban', 'user_unban', 'user_delete', 'user_role_change',
        'content_delete', 'content_flag', 'content_approve',
        'report_resolve', 'report_dismiss',
        'community_delete', 'community_suspend',
        'settings_change', 'system_config'
      ],
      description: 'Action type'
    },
    targetType: {
      type: 'string',
      enum: ['user', 'message', 'conversation', 'community', 'report', 'system'],
      description: 'Target entity type'
    },
    targetId: { type: 'string', nullable: true, description: 'Target entity ID' },
    details: { type: 'string', nullable: true, description: 'Action details (JSON)' },
    previousState: { type: 'string', nullable: true, description: 'State before action (JSON)' },
    newState: { type: 'string', nullable: true, description: 'State after action (JSON)' },
    ipAddress: { type: 'string', nullable: true, description: 'Admin IP address' },
    userAgent: { type: 'string', nullable: true, description: 'Admin user agent' },
    createdAt: { type: 'string', format: 'date-time', description: 'Action timestamp' },
    admin: { ...userMinimalSchema, description: 'Admin user info' }
  }
} as const;

// =============================================================================
// SECURITY EVENT SCHEMAS
// =============================================================================

/**
 * Security event schema
 */
export const securityEventSchema = {
  type: 'object',
  description: 'Security-related event',
  properties: {
    id: { type: 'string', description: 'Event ID' },
    userId: { type: 'string', nullable: true, description: 'Related user ID' },
    eventType: {
      type: 'string',
      enum: [
        'login_success', 'login_failed', 'logout',
        'password_change', 'password_reset', 'password_reset_request',
        '2fa_enabled', '2fa_disabled', '2fa_failed',
        'session_created', 'session_terminated', 'session_suspicious',
        'account_locked', 'account_unlocked',
        'api_key_created', 'api_key_revoked',
        'brute_force_detected', 'suspicious_activity'
      ],
      description: 'Event type'
    },
    severity: {
      type: 'string',
      enum: ['info', 'warning', 'critical'],
      description: 'Event severity'
    },
    details: { type: 'string', nullable: true, description: 'Event details (JSON)' },
    ipAddress: { type: 'string', nullable: true, description: 'Source IP address' },
    userAgent: { type: 'string', nullable: true, description: 'User agent' },
    location: { type: 'string', nullable: true, description: 'Geo location' },
    isResolved: { type: 'boolean', description: 'Whether event is resolved' },
    resolvedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Resolution timestamp' },
    resolvedBy: { type: 'string', nullable: true, description: 'Resolver user ID' },
    createdAt: { type: 'string', format: 'date-time', description: 'Event timestamp' }
  }
} as const;

// =============================================================================
// AFFILIATE SCHEMAS
// =============================================================================

/**
 * Affiliate token schema
 */
export const affiliateTokenSchema = {
  type: 'object',
  description: 'Affiliate/referral token',
  properties: {
    id: { type: 'string', description: 'Token ID' },
    userId: { type: 'string', description: 'Owner user ID' },
    token: { type: 'string', description: 'Unique affiliate token/code' },
    type: {
      type: 'string',
      enum: ['referral', 'promo', 'partner', 'influencer'],
      description: 'Token type'
    },
    description: { type: 'string', nullable: true, description: 'Token description' },
    commission: { type: 'number', nullable: true, description: 'Commission percentage' },
    maxUses: { type: 'number', nullable: true, description: 'Maximum uses allowed' },
    currentUses: { type: 'number', description: 'Current use count' },
    isActive: { type: 'boolean', description: 'Whether token is active' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration date' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update' }
  }
} as const;

/**
 * Affiliate relation schema
 */
export const affiliateRelationSchema = {
  type: 'object',
  description: 'Affiliate relationship between users',
  properties: {
    id: { type: 'string', description: 'Relation ID' },
    affiliateId: { type: 'string', description: 'Affiliate user ID' },
    referredUserId: { type: 'string', description: 'Referred user ID' },
    tokenId: { type: 'string', description: 'Token used for referral' },
    status: {
      type: 'string',
      enum: ['pending', 'active', 'expired', 'revoked'],
      description: 'Relation status'
    },
    earnings: { type: 'number', description: 'Total earnings from this referral' },
    createdAt: { type: 'string', format: 'date-time', description: 'Relation creation' },
    affiliate: { ...userMinimalSchema, description: 'Affiliate user info' },
    referredUser: { ...userMinimalSchema, description: 'Referred user info' }
  }
} as const;

// =============================================================================
// TRACKING LINK SCHEMAS
// =============================================================================

/**
 * Tracking link schema
 */
export const trackingLinkSchema = {
  type: 'object',
  description: 'Marketing/analytics tracking link',
  properties: {
    id: { type: 'string', description: 'Link ID' },
    userId: { type: 'string', description: 'Creator user ID' },
    shortCode: { type: 'string', description: 'Short URL code' },
    destinationUrl: { type: 'string', description: 'Target URL' },
    title: { type: 'string', nullable: true, description: 'Link title' },
    campaign: { type: 'string', nullable: true, description: 'Campaign name' },
    source: { type: 'string', nullable: true, description: 'Traffic source' },
    medium: { type: 'string', nullable: true, description: 'Traffic medium' },
    totalClicks: { type: 'number', description: 'Total click count' },
    uniqueClicks: { type: 'number', description: 'Unique visitor clicks' },
    isActive: { type: 'boolean', description: 'Whether link is active' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration date' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update' }
  }
} as const;

/**
 * Tracking link click schema
 */
export const trackingLinkClickSchema = {
  type: 'object',
  description: 'Click event on tracking link',
  properties: {
    id: { type: 'string', description: 'Click ID' },
    linkId: { type: 'string', description: 'Tracking link ID' },
    ipAddress: { type: 'string', nullable: true, description: 'Visitor IP' },
    userAgent: { type: 'string', nullable: true, description: 'User agent' },
    referrer: { type: 'string', nullable: true, description: 'Referrer URL' },
    country: { type: 'string', nullable: true, description: 'Visitor country' },
    city: { type: 'string', nullable: true, description: 'Visitor city' },
    deviceType: { type: 'string', nullable: true, description: 'Device type' },
    browser: { type: 'string', nullable: true, description: 'Browser name' },
    os: { type: 'string', nullable: true, description: 'Operating system' },
    isUnique: { type: 'boolean', description: 'First visit from this visitor' },
    createdAt: { type: 'string', format: 'date-time', description: 'Click timestamp' }
  }
} as const;

/**
 * Create tracking link request schema
 */
export const createTrackingLinkRequestSchema = {
  type: 'object',
  required: ['destinationUrl'],
  properties: {
    destinationUrl: { type: 'string', format: 'uri', description: 'Target URL' },
    shortCode: { type: 'string', minLength: 3, maxLength: 20, pattern: '^[a-zA-Z0-9-_]+$', description: 'Custom short code' },
    title: { type: 'string', maxLength: 100, description: 'Link title' },
    campaign: { type: 'string', maxLength: 50, description: 'Campaign name' },
    source: { type: 'string', maxLength: 50, description: 'Traffic source' },
    medium: { type: 'string', maxLength: 50, description: 'Traffic medium' },
    expiresAt: { type: 'string', format: 'date-time', description: 'Expiration date' }
  }
} as const;

// =============================================================================
// ANONYMOUS PARTICIPANT SCHEMAS
// =============================================================================

/**
 * Anonymous participant schema
 */
export const anonymousParticipantSchema = {
  type: 'object',
  description: 'Anonymous participant in a conversation',
  properties: {
    id: { type: 'string', description: 'Anonymous participant ID' },
    conversationId: { type: 'string', description: 'Conversation ID' },
    sessionId: { type: 'string', description: 'Browser session ID' },
    nickname: { type: 'string', nullable: true, description: 'Chosen nickname' },
    language: { type: 'string', description: 'Preferred language' },
    email: { type: 'string', nullable: true, description: 'Optional email' },
    avatarColor: { type: 'string', nullable: true, description: 'Avatar color' },
    isActive: { type: 'boolean', description: 'Currently active' },
    lastActiveAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last activity' },
    ipAddress: { type: 'string', nullable: true, description: 'IP address' },
    userAgent: { type: 'string', nullable: true, description: 'User agent' },
    country: { type: 'string', nullable: true, description: 'Country' },
    messageCount: { type: 'number', description: 'Messages sent' },
    createdAt: { type: 'string', format: 'date-time', description: 'Join timestamp' }
  }
} as const;

/**
 * Join as anonymous request schema
 */
export const joinAnonymousRequestSchema = {
  type: 'object',
  properties: {
    nickname: { type: 'string', minLength: 2, maxLength: 30, description: 'Display nickname' },
    language: { type: 'string', minLength: 2, maxLength: 5, description: 'Preferred language' },
    email: { type: 'string', format: 'email', description: 'Optional email' }
  }
} as const;

// =============================================================================
// USER PREFERENCE SCHEMAS
// =============================================================================

/**
 * User preference schema
 */
export const userPreferenceSchema = {
  type: 'object',
  description: 'User application preferences',
  properties: {
    id: { type: 'string', description: 'Preference ID' },
    userId: { type: 'string', description: 'User ID' },

    // Theme & Display
    theme: { type: 'string', enum: ['light', 'dark', 'system'], description: 'UI theme' },
    fontSize: { type: 'string', enum: ['small', 'medium', 'large'], description: 'Font size' },
    compactMode: { type: 'boolean', description: 'Compact message display' },

    // Privacy
    showOnlineStatus: { type: 'boolean', description: 'Show online status to others' },
    showLastSeen: { type: 'boolean', description: 'Show last seen timestamp' },
    showReadReceipts: { type: 'boolean', description: 'Send read receipts' },
    showTypingIndicator: { type: 'boolean', description: 'Show typing indicator' },

    // Media
    autoPlayMedia: { type: 'boolean', description: 'Auto-play media' },
    autoDownloadMedia: { type: 'boolean', description: 'Auto-download media' },
    mediaQuality: { type: 'string', enum: ['low', 'medium', 'high', 'original'], description: 'Media quality' },

    // Keyboard shortcuts
    enterToSend: { type: 'boolean', description: 'Enter key sends message' },

    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update' }
  }
} as const;

/**
 * Update user preference request schema
 */
export const updateUserPreferenceRequestSchema = {
  type: 'object',
  properties: {
    theme: { type: 'string', enum: ['light', 'dark', 'system'] },
    fontSize: { type: 'string', enum: ['small', 'medium', 'large'] },
    compactMode: { type: 'boolean' },
    showOnlineStatus: { type: 'boolean' },
    showLastSeen: { type: 'boolean' },
    showReadReceipts: { type: 'boolean' },
    showTypingIndicator: { type: 'boolean' },
    autoPlayMedia: { type: 'boolean' },
    autoDownloadMedia: { type: 'boolean' },
    mediaQuality: { type: 'string', enum: ['low', 'medium', 'high', 'original'] },
    enterToSend: { type: 'boolean' }
  }
} as const;

// =============================================================================
// ERROR SCHEMAS
// =============================================================================

/**
 * Standard error response schema
 */
export const errorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: { type: 'string', description: 'Error message' },
    code: { type: 'string', description: 'Error code (optional)' }
  }
} as const;

/**
 * Validation error response schema
 */
export const validationErrorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: { type: 'string', description: 'Validation error message' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'Field that failed validation' },
          message: { type: 'string', description: 'Validation error message' }
        }
      }
    }
  }
} as const;

// =============================================================================
// REQUEST BODY SCHEMAS
// =============================================================================

/**
 * Login request body schema
 */
export const loginRequestSchema = {
  type: 'object',
  required: ['username', 'password'],
  properties: {
    username: {
      type: 'string',
      minLength: 2,
      maxLength: 50,
      description: 'Username, email, or phone number'
    },
    password: {
      type: 'string',
      minLength: 1,
      description: 'User password'
    }
  }
} as const;

/**
 * Register request body schema
 */
export const registerRequestSchema = {
  type: 'object',
  required: ['username', 'password', 'firstName', 'lastName', 'email'],
  properties: {
    username: {
      type: 'string',
      minLength: 2,
      maxLength: 16,
      description: 'Unique username (2-16 characters, alphanumeric)'
    },
    password: {
      type: 'string',
      minLength: 8,
      description: 'Password (minimum 8 characters)'
    },
    firstName: {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      description: 'User first name'
    },
    lastName: {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      description: 'User last name'
    },
    email: {
      type: 'string',
      format: 'email',
      description: 'Valid email address (verification email will be sent)'
    },
    phoneNumber: {
      type: 'string',
      description: 'Phone number (with or without country code, e.g., "+33612345678")'
    },
    phoneCountryCode: {
      type: 'string',
      minLength: 2,
      maxLength: 2,
      description: 'ISO 3166-1 alpha-2 country code (e.g., "FR", "US")'
    },
    systemLanguage: {
      type: 'string',
      default: 'fr',
      description: 'Interface language (ISO 639-1 code)'
    },
    regionalLanguage: {
      type: 'string',
      default: 'fr',
      description: 'Regional language for translations'
    }
  }
} as const;

/**
 * Refresh token request body schema
 */
export const refreshTokenRequestSchema = {
  type: 'object',
  required: ['token'],
  properties: {
    token: {
      type: 'string',
      minLength: 1,
      description: 'Current JWT token to refresh'
    }
  }
} as const;

/**
 * Verify email request body schema
 */
export const verifyEmailRequestSchema = {
  type: 'object',
  required: ['token', 'email'],
  properties: {
    token: {
      type: 'string',
      minLength: 1,
      description: 'Verification token from email'
    },
    email: {
      type: 'string',
      format: 'email',
      description: 'Email address to verify'
    }
  }
} as const;

/**
 * Resend verification email request body schema
 */
export const resendVerificationRequestSchema = {
  type: 'object',
  required: ['email'],
  properties: {
    email: {
      type: 'string',
      format: 'email',
      description: 'Email address to send verification to'
    }
  }
} as const;

/**
 * Send phone verification code request body schema
 */
export const sendPhoneCodeRequestSchema = {
  type: 'object',
  required: ['phoneNumber'],
  properties: {
    phoneNumber: {
      type: 'string',
      minLength: 8,
      description: 'Phone number to send verification code to'
    }
  }
} as const;

/**
 * Verify phone request body schema
 */
export const verifyPhoneRequestSchema = {
  type: 'object',
  required: ['phoneNumber', 'code'],
  properties: {
    phoneNumber: {
      type: 'string',
      minLength: 8,
      description: 'Phone number to verify'
    },
    code: {
      type: 'string',
      minLength: 6,
      maxLength: 6,
      description: '6-digit verification code from SMS'
    }
  }
} as const;

/**
 * Validate session token request body schema
 */
export const validateSessionRequestSchema = {
  type: 'object',
  required: ['sessionToken'],
  properties: {
    sessionToken: {
      type: 'string',
      minLength: 1,
      description: 'Session token to validate'
    }
  }
} as const;

/**
 * Change password request body schema
 */
export const changePasswordRequestSchema = {
  type: 'object',
  required: ['currentPassword', 'newPassword'],
  properties: {
    currentPassword: {
      type: 'string',
      minLength: 1,
      description: 'Current password'
    },
    newPassword: {
      type: 'string',
      minLength: 8,
      description: 'New password (minimum 8 characters)'
    }
  }
} as const;

/**
 * Reset password request body schema
 */
export const resetPasswordRequestSchema = {
  type: 'object',
  required: ['token', 'newPassword'],
  properties: {
    token: {
      type: 'string',
      minLength: 1,
      description: 'Password reset token from email'
    },
    newPassword: {
      type: 'string',
      minLength: 8,
      description: 'New password (minimum 8 characters)'
    }
  }
} as const;

/**
 * Request password reset request body schema
 */
export const requestPasswordResetRequestSchema = {
  type: 'object',
  required: ['email'],
  properties: {
    email: {
      type: 'string',
      format: 'email',
      description: 'Email address to send reset link to'
    }
  }
} as const;

/**
 * Update user profile request body schema
 */
export const updateUserRequestSchema = {
  type: 'object',
  properties: {
    firstName: { type: 'string', minLength: 1, maxLength: 50, description: 'First name' },
    lastName: { type: 'string', minLength: 1, maxLength: 50, description: 'Last name' },
    displayName: { type: 'string', minLength: 1, maxLength: 100, description: 'Display name' },
    bio: { type: 'string', maxLength: 500, description: 'User biography' },
    avatar: { type: 'string', format: 'uri', description: 'Avatar image URL' },
    phoneNumber: { type: 'string', description: 'Phone number' },
    systemLanguage: { type: 'string', minLength: 2, maxLength: 5, description: 'System language code' },
    regionalLanguage: { type: 'string', minLength: 2, maxLength: 5, description: 'Regional language code' },
    customDestinationLanguage: { type: 'string', minLength: 2, maxLength: 5, nullable: true, description: 'Custom destination language' },
    autoTranslateEnabled: { type: 'boolean', description: 'Enable auto-translation' },
    translateToSystemLanguage: { type: 'boolean', description: 'Translate to system language' },
    translateToRegionalLanguage: { type: 'boolean', description: 'Translate to regional language' },
    useCustomDestination: { type: 'boolean', description: 'Use custom destination language' },
    timezone: { type: 'string', description: 'User timezone (IANA format)' }
  }
} as const;

// =============================================================================
// SIGNAL PROTOCOL / E2EE SCHEMAS
// =============================================================================

/**
 * Signal Protocol Pre-Key Bundle schema (public portion for exchange)
 * Used for establishing end-to-end encrypted sessions
 */
export const signalPreKeyBundleSchema = {
  type: 'object',
  description: 'Signal Protocol pre-key bundle for E2EE session establishment',
  required: ['identityKey', 'registrationId', 'deviceId', 'signedPreKeyId', 'signedPreKeyPublic', 'signedPreKeySignature'],
  properties: {
    identityKey: {
      type: 'string',
      description: 'Public identity key (base64-encoded, 32 bytes)'
    },
    registrationId: {
      type: 'number',
      description: 'Registration ID (14-bit random number, unique per device)',
      minimum: 0,
      maximum: 16383
    },
    deviceId: {
      type: 'number',
      description: 'Device ID for multi-device support',
      minimum: 1
    },
    preKeyId: {
      type: 'number',
      nullable: true,
      description: 'One-time pre-key ID (consumed after first use)',
      minimum: 0
    },
    preKeyPublic: {
      type: 'string',
      nullable: true,
      description: 'One-time pre-key public portion (base64-encoded)'
    },
    signedPreKeyId: {
      type: 'number',
      description: 'Signed pre-key ID (rotated periodically)',
      minimum: 0
    },
    signedPreKeyPublic: {
      type: 'string',
      description: 'Signed pre-key public portion (base64-encoded)'
    },
    signedPreKeySignature: {
      type: 'string',
      description: 'Signature of signed pre-key (base64-encoded)'
    },
    kyberPreKeyId: {
      type: 'number',
      nullable: true,
      description: 'Kyber post-quantum pre-key ID',
      minimum: 0
    },
    kyberPreKeyPublic: {
      type: 'string',
      nullable: true,
      description: 'Kyber post-quantum pre-key public portion (base64-encoded)'
    },
    kyberPreKeySignature: {
      type: 'string',
      nullable: true,
      description: 'Kyber pre-key signature (base64-encoded)'
    }
  }
} as const;

/**
 * Request body for generating pre-key bundle
 * Empty body - keys are generated server-side for the authenticated user
 */
export const generatePreKeyBundleRequestSchema = {
  type: 'object',
  description: 'Request to generate a new pre-key bundle (empty body)',
  properties: {}
} as const;

/**
 * Response for successful pre-key bundle generation
 */
export const generatePreKeyBundleResponseSchema = {
  type: 'object',
  description: 'Pre-key bundle generation response',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        registrationId: { type: 'number', description: 'Generated registration ID' },
        deviceId: { type: 'number', description: 'Device ID' },
        preKeyId: { type: 'number', nullable: true, description: 'Pre-key ID' },
        signedPreKeyId: { type: 'number', description: 'Signed pre-key ID' },
        message: { type: 'string', example: 'Pre-key bundle generated successfully' }
      }
    }
  }
} as const;

/**
 * Response for fetching a user's pre-key bundle
 */
export const getPreKeyBundleResponseSchema = {
  type: 'object',
  description: 'Fetched pre-key bundle',
  properties: {
    success: { type: 'boolean', example: true },
    data: signalPreKeyBundleSchema
  }
} as const;

/**
 * Request body for establishing E2EE session
 */
export const establishSessionRequestSchema = {
  type: 'object',
  description: 'Request to establish E2EE session with another user',
  required: ['recipientUserId', 'conversationId'],
  properties: {
    recipientUserId: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      description: 'User ID of the recipient to establish session with'
    },
    conversationId: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      description: 'Conversation ID where session will be used'
    }
  }
} as const;

/**
 * Response for successful session establishment
 */
export const establishSessionResponseSchema = {
  type: 'object',
  description: 'E2EE session establishment response',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'E2EE session established successfully' }
      }
    }
  }
} as const;

// =============================================================================
// TYPE EXPORTS (TypeScript interfaces matching schemas)
// =============================================================================

/**
 * TypeScript type for user permissions
 */
export interface UserPermissions {
  canAccessAdmin: boolean;
  canManageUsers: boolean;
  canManageGroups: boolean;
  canManageConversations: boolean;
  canViewAnalytics: boolean;
  canModerateContent: boolean;
  canViewAuditLogs: boolean;
  canManageNotifications: boolean;
  canManageTranslations: boolean;
}

/**
 * TypeScript type for session data
 */
export interface SessionInfo {
  id: string;
  userId: string;
  deviceType: string | null;
  deviceVendor: string | null;
  deviceModel: string | null;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
  isMobile: boolean;
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  location: string | null;
  createdAt: Date | string;
  lastActivityAt: Date | string;
  isCurrentSession: boolean;
  isTrusted: boolean;
}

/**
 * TypeScript type for minimal session
 */
export interface SessionMinimal {
  id: string;
  deviceType: string | null;
  browserName: string | null;
  osName: string | null;
  location: string | null;
  isMobile: boolean;
  createdAt: Date | string;
}

/**
 * TypeScript type for login response data
 */
export interface LoginResponseData {
  user: Record<string, unknown>;
  token: string;
  sessionToken: string;
  session: SessionMinimal;
  expiresIn: number;
}

/**
 * TypeScript type for register response data
 */
export interface RegisterResponseData {
  user: Record<string, unknown>;
  token: string;
  expiresIn: number;
}
