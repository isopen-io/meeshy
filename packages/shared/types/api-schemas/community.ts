/**
 * Schémas d’API — communautés et leurs membres.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/community
 */

import { userMinimalSchema } from './user.js';

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
