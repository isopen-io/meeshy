import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// ZOD VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const createLinkSchema = z.object({
  conversationId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  maxUses: z.number().int().positive().optional(),
  maxConcurrentUsers: z.number().int().positive().optional(),
  maxUniqueSessions: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  allowAnonymousMessages: z.boolean().optional(),
  allowAnonymousFiles: z.boolean().optional(),
  allowAnonymousImages: z.boolean().optional(),
  allowViewHistory: z.boolean().optional(),
  requireAccount: z.boolean().optional(),
  requireNickname: z.boolean().optional(),
  requireEmail: z.boolean().optional(),
  requireBirthday: z.boolean().optional(),
  allowedCountries: z.array(z.string()).optional(),
  allowedLanguages: z.array(z.string()).optional(),
  allowedIpRanges: z.array(z.string()).optional(),
  newConversation: z.object({
    title: z.string().min(1, 'Le titre de la conversation est requis'),
    description: z.string().optional(),
    memberIds: z.array(z.string()).optional()
  }).optional()
});

export const updateLinkSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  maxConcurrentUsers: z.number().int().positive().nullable().optional(),
  maxUniqueSessions: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
  allowAnonymousMessages: z.boolean().optional(),
  allowAnonymousFiles: z.boolean().optional(),
  allowAnonymousImages: z.boolean().optional(),
  allowViewHistory: z.boolean().optional(),
  requireAccount: z.boolean().optional(),
  requireNickname: z.boolean().optional(),
  requireEmail: z.boolean().optional(),
  requireBirthday: z.boolean().optional(),
  allowedCountries: z.array(z.string()).optional(),
  allowedLanguages: z.array(z.string()).optional(),
  allowedIpRanges: z.array(z.string()).optional()
});

export const sendMessageSchema = z.object({
  content: z.string().max(1000, 'Message is too long').optional(),
  originalLanguage: z.string().default('fr'),
  messageType: z.string().default('text'),
  attachments: z.array(z.string()).optional()
}).refine((data) => {
  return (data.content && data.content.trim().length > 0) || (data.attachments && data.attachments.length > 0);
}, {
  message: 'Message content cannot be empty (unless attachments are included)'
});

// ═══════════════════════════════════════════════════════════════════════════
// JSON SCHEMAS FOR OPENAPI DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const shareLinkSchema = {
  type: 'object',
  description: 'Share link configuration and metadata',
  properties: {
    id: { type: 'string', description: 'Share link database ID' },
    linkId: { type: 'string', description: 'Public share link identifier (mshy_*)', example: 'mshy_67890abcdef12345_a1b2c3d4' },
    identifier: { type: 'string', description: 'Human-readable identifier', example: 'mshy_my-link' },
    conversationId: { type: 'string', description: 'Associated conversation ID' },
    name: { type: 'string', nullable: true, description: 'Link display name' },
    description: { type: 'string', nullable: true, description: 'Link description' },
    createdBy: { type: 'string', description: 'Creator user ID' },
    isActive: { type: 'boolean', description: 'Link active status', default: true },
    maxUses: { type: 'number', nullable: true, description: 'Maximum uses allowed' },
    maxConcurrentUsers: { type: 'number', nullable: true, description: 'Maximum concurrent users' },
    maxUniqueSessions: { type: 'number', nullable: true, description: 'Maximum unique sessions' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration timestamp' },
    allowAnonymousMessages: { type: 'boolean', description: 'Allow anonymous users to send messages', default: true },
    allowAnonymousFiles: { type: 'boolean', description: 'Allow anonymous users to send files', default: false },
    allowAnonymousImages: { type: 'boolean', description: 'Allow anonymous users to send images', default: true },
    allowViewHistory: { type: 'boolean', description: 'Allow viewing message history', default: true },
    requireAccount: { type: 'boolean', description: 'Require user account', default: false },
    requireNickname: { type: 'boolean', description: 'Require nickname', default: true },
    requireEmail: { type: 'boolean', description: 'Require email', default: false },
    requireBirthday: { type: 'boolean', description: 'Require birthday', default: false },
    allowedCountries: { type: 'array', items: { type: 'string' }, description: 'Allowed country codes (ISO 3166-1 alpha-2)' },
    allowedLanguages: { type: 'array', items: { type: 'string' }, description: 'Allowed language codes (ISO 639-1)' },
    allowedIpRanges: { type: 'array', items: { type: 'string' }, description: 'Allowed IP ranges (CIDR notation)' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' }
  }
} as const;

export const conversationSummarySchema = {
  type: 'object',
  description: 'Conversation summary information',
  properties: {
    id: { type: 'string', description: 'Conversation unique identifier' },
    identifier: { type: 'string', nullable: true, description: 'Conversation identifier (e.g., "meeshy")' },
    title: { type: 'string', description: 'Conversation title' },
    description: { type: 'string', nullable: true, description: 'Conversation description' },
    type: { type: 'string', enum: ['direct', 'group', 'public', 'global'], description: 'Conversation type' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' }
  }
} as const;

export const messageSenderSchema = {
  type: 'object',
  description: 'Message sender information',
  properties: {
    id: { type: 'string', description: 'Sender unique identifier' },
    username: { type: 'string', description: 'Sender username' },
    firstName: { type: 'string', description: 'Sender first name' },
    lastName: { type: 'string', description: 'Sender last name' },
    displayName: { type: 'string', nullable: true, description: 'Sender display name' },
    avatar: { type: 'string', nullable: true, description: 'Sender avatar URL' },
    isMeeshyer: { type: 'boolean', description: 'Is registered user (vs anonymous)' }
  }
} as const;

export const messageSchema = {
  type: 'object',
  description: 'Message object',
  properties: {
    id: { type: 'string', description: 'Message unique identifier' },
    content: { type: 'string', description: 'Message content' },
    originalLanguage: { type: 'string', description: 'Original message language code', default: 'fr' },
    messageType: { type: 'string', description: 'Message type', default: 'text' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    sender: { ...messageSenderSchema, nullable: true },
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          targetLanguage: { type: 'string' },
          translatedContent: { type: 'string' },
          translationModel: { type: 'string', nullable: true },
          confidenceScore: { type: 'number', nullable: true },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
} as const;

export const createLinkBodySchema = {
  type: 'object',
  description: 'Create share link request body',
  properties: {
    conversationId: { type: 'string', description: 'Existing conversation ID (optional if creating new conversation)' },
    name: { type: 'string', description: 'Link display name' },
    description: { type: 'string', description: 'Link description' },
    maxUses: { type: 'number', minimum: 1, description: 'Maximum uses allowed' },
    maxConcurrentUsers: { type: 'number', minimum: 1, description: 'Maximum concurrent users' },
    maxUniqueSessions: { type: 'number', minimum: 1, description: 'Maximum unique sessions' },
    expiresAt: { type: 'string', format: 'date-time', description: 'Expiration timestamp' },
    allowAnonymousMessages: { type: 'boolean', default: true },
    allowAnonymousFiles: { type: 'boolean', default: false },
    allowAnonymousImages: { type: 'boolean', default: true },
    allowViewHistory: { type: 'boolean', default: true },
    requireAccount: { type: 'boolean', default: false },
    requireNickname: { type: 'boolean', default: true },
    requireEmail: { type: 'boolean', default: false },
    requireBirthday: { type: 'boolean', default: false },
    allowedCountries: { type: 'array', items: { type: 'string' } },
    allowedLanguages: { type: 'array', items: { type: 'string' } },
    allowedIpRanges: { type: 'array', items: { type: 'string' } },
    newConversation: {
      type: 'object',
      description: 'Create new conversation with this link',
      properties: {
        title: { type: 'string', minLength: 1, description: 'Conversation title (required)' },
        description: { type: 'string', description: 'Conversation description' },
        memberIds: { type: 'array', items: { type: 'string' }, description: 'Initial member user IDs' }
      },
      required: ['title']
    }
  }
} as const;

export const updateLinkBodySchema = {
  type: 'object',
  description: 'Update share link request body (all fields optional)',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    maxUses: { type: 'number', nullable: true, minimum: 1 },
    maxConcurrentUsers: { type: 'number', nullable: true, minimum: 1 },
    maxUniqueSessions: { type: 'number', nullable: true, minimum: 1 },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    isActive: { type: 'boolean' },
    allowAnonymousMessages: { type: 'boolean' },
    allowAnonymousFiles: { type: 'boolean' },
    allowAnonymousImages: { type: 'boolean' },
    allowViewHistory: { type: 'boolean' },
    requireAccount: { type: 'boolean' },
    requireNickname: { type: 'boolean' },
    requireEmail: { type: 'boolean' },
    requireBirthday: { type: 'boolean' },
    allowedCountries: { type: 'array', items: { type: 'string' } },
    allowedLanguages: { type: 'array', items: { type: 'string' } },
    allowedIpRanges: { type: 'array', items: { type: 'string' } }
  }
} as const;

export const sendMessageBodySchema = {
  type: 'object',
  description: 'Send message via share link request body',
  properties: {
    content: { type: 'string', maxLength: 1000, description: 'Message content (required unless attachments provided)' },
    originalLanguage: { type: 'string', default: 'fr', description: 'Message language code' },
    messageType: { type: 'string', default: 'text', description: 'Message type' },
    attachments: { type: 'array', items: { type: 'string' }, description: 'Attachment IDs' }
  }
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
