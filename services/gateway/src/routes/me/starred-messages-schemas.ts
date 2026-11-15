/**
 * Les schémas de réponse du favori de message (#7377) — FERMÉS à chaque
 * niveau (`additionalProperties: false`), chaque propriété NOMMÉE.
 *
 * C'est la règle 4 de `services/gateway/decisions.md` (§ « Le favori de
 * message ») : ce qui part à côté d'un champ gardé part parce qu'un schéma
 * l'a laissé passer. `fast-json-stringify` ne sert que ce qui est déclaré ici ;
 * la projection (`starredMessageProjection.ts`) reconstruit déjà chaque ligne
 * champ par champ, et ce schéma en est le second verrou.
 *
 * Miroir des schémas Zod partagés (`@meeshy/shared/types/message-star`), que
 * les clients utilisent pour décoder : un témoin vérifie que la réponse servie
 * les satisfait.
 */

export const starMessageParamsJsonSchema = {
  type: 'object',
  required: ['messageId'],
  properties: {
    messageId: { type: 'string', description: 'Message ID (ObjectId)' },
  },
} as const;

export const messageStarPlacedResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['messageId', 'conversationId', 'starred', 'starredAt'],
      properties: {
        messageId: { type: 'string' },
        conversationId: { type: 'string' },
        starred: { type: 'boolean' },
        starredAt: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;

export const messageStarRemovedResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['messageId', 'starred'],
      properties: {
        messageId: { type: 'string' },
        starred: { type: 'boolean' },
      },
    },
  },
} as const;

const nullableString = { type: 'string', nullable: true } as const;

export const starredMessagesQueryJsonSchema = {
  type: 'object',
  properties: {
    cursor: { type: 'string', description: 'Opaque keyset cursor — `pagination.nextCursor` of the previous page' },
    limit: { type: 'string', description: 'Page size, 1 to 50 (20 when absent)' },
  },
} as const;

const starredMessageTranslationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'messageId', 'targetLanguage', 'translatedContent'],
  properties: {
    id: { type: 'string' },
    messageId: { type: 'string' },
    targetLanguage: { type: 'string' },
    translatedContent: { type: 'string' },
    translationModel: { type: 'string' },
    confidenceScore: { type: 'number' },
  },
} as const;

const starredMessageAttachmentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'mimeType', 'fileUrl', 'thumbnailUrl', 'isMasked'],
  properties: {
    id: { type: 'string' },
    mimeType: { type: 'string' },
    fileUrl: nullableString,
    thumbnailUrl: nullableString,
    isMasked: { type: 'boolean', description: 'Protected at attachment level: served without any URL' },
  },
} as const;

const starredMessageBodyJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'conversationId',
    'messageType',
    'createdAt',
    'editedAt',
    'isProtected',
    'content',
    'originalLanguage',
    'translations',
    'attachments',
  ],
  properties: {
    id: { type: 'string' },
    conversationId: { type: 'string' },
    messageType: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    editedAt: { type: 'string', format: 'date-time', nullable: true },
    isProtected: {
      type: 'boolean',
      description: 'Placeholder row (blurred, encrypted, live ephemeral): no text, no translation, no media',
    },
    content: nullableString,
    originalLanguage: nullableString,
    translations: { type: 'array', items: starredMessageTranslationJsonSchema },
    attachments: { type: 'array', items: starredMessageAttachmentJsonSchema },
  },
} as const;

const starredMessageSenderJsonSchema = {
  type: 'object',
  nullable: true,
  additionalProperties: false,
  required: ['id', 'userId', 'displayName', 'avatar', 'username'],
  properties: {
    id: { type: 'string', description: 'Participant ID' },
    userId: nullableString,
    displayName: nullableString,
    avatar: nullableString,
    username: nullableString,
  },
} as const;

const starredMessageConversationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'identifier', 'type', 'name', 'avatar'],
  properties: {
    id: { type: 'string' },
    identifier: { type: 'string' },
    type: { type: 'string', description: 'Conversation type — the input of the accent colour' },
    name: nullableString,
    avatar: nullableString,
  },
} as const;

const starredMessageItemJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'starredAt', 'message', 'sender', 'conversation'],
  properties: {
    id: { type: 'string', description: 'Star ID' },
    starredAt: { type: 'string', format: 'date-time' },
    message: starredMessageBodyJsonSchema,
    sender: starredMessageSenderJsonSchema,
    conversation: starredMessageConversationJsonSchema,
  },
} as const;

export const starredMessagesListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean' },
    data: { type: 'array', items: starredMessageItemJsonSchema },
    pagination: {
      type: 'object',
      additionalProperties: false,
      required: ['limit', 'hasMore', 'nextCursor', 'form'],
      properties: {
        limit: { type: 'integer' },
        hasMore: { type: 'boolean' },
        nextCursor: nullableString,
        form: { type: 'string', enum: ['keyset'] },
      },
    },
  },
} as const;
