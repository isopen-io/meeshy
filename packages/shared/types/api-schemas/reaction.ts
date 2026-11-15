/**
 * Schémas d’API — réactions et mentions.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/reaction
 */

import { EMOJI_MAX_LENGTH } from '../reaction.js';
import { userMinimalSchema } from './user.js';

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
    participantId: { type: 'string', nullable: true, description: 'Participant ID' },
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
    hasCurrentUser: { type: 'boolean', description: 'Whether current user reacted with this emoji' },
    userIds: { type: 'array', items: { type: 'string' }, description: 'User IDs who reacted' },
    participantIds: { type: 'array', items: { type: 'string' }, description: 'Participant IDs who reacted' },
    users: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User ID' },
          username: { type: 'string', description: 'Username or display name' },
          avatar: { type: 'string', nullable: true, description: 'Avatar URL' },
          createdAt: { type: 'string', description: 'Reaction timestamp' }
        }
      },
      description: 'Users who reacted with details'
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
      maxLength: EMOJI_MAX_LENGTH,
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
