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
    requiresJoinApproval: { type: 'boolean', nullable: true, description: 'Whether each entry waits for an admin or moderator to accept it (#19429); absent on older communities = direct entry' },
    isActive: { type: 'boolean', description: 'Whether community is active' },
    deletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Deletion timestamp' },
    createdBy: { type: 'string', description: 'Creator user ID' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' },
    creator: { ...userMinimalSchema, description: 'Creator user info' },
    memberCount: { type: 'number', description: 'Number of members' },
    conversationCount: { type: 'number', description: 'Number of conversations' },
    currentUserRole: { type: 'string', nullable: true, description: "Reader's active role (admin, moderator, member); null when not a member. Served by GET /communities/:id" },
    onlineMemberCount: { type: 'number', nullable: true, description: 'Other active members online now, as an anonymous aggregate; null when the community is too small for a count to stay anonymous. Served by GET /communities/:id (#18014)' },
    currentUserJoinRequest: { type: 'string', enum: ['pending'], nullable: true, description: "Reader's own join request: 'pending' when a non-member awaits an answer from a community that validates each entry; null otherwise. Served by GET /communities/:id (#19868)" }
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
 * La rangée d'un membre telle que la lisent ceux qui animent ou modèrent la
 * communauté (#19429) : la porte d'entrée et le pays d'arrivée en plus. Le
 * schéma COMMUN ne les déclare pas, donc toute autre réponse les retire à la
 * sérialisation, même quand la lecture en base les rend (recherche, adhésion).
 * Seules les routes réservées aux intendants servent celui-ci.
 */
export const communityStewardMemberSchema = {
  ...communityMemberSchema,
  description: 'Community membership, as read by the community admins and moderators',
  properties: {
    ...communityMemberSchema.properties,
    joinedVia: {
      type: 'string',
      nullable: true,
      enum: ['self', 'invited', 'link', null],
      description: "How the member entered (#19429): by themself, invited or added, or through the community link. Served to the community's admins and moderators only; null otherwise and on older rows"
    },
    joinCountry: {
      type: 'string',
      nullable: true,
      description: "Arrival country at entry, ISO 3166-1 alpha-2, never the city (#19429). Served to the community's admins and moderators only; null otherwise"
    }
  }
} as const;

/**
 * Les entrées d'une communauté, comptées par la passerelle (#19429) — réservé
 * à ses administrateurs et modérateurs.
 */
export const communityEntryStatsSchema = {
  type: 'object',
  description: 'Exact entry counts of a community (#19429)',
  properties: {
    last7: { type: 'number', description: 'Entries over the last 7 UTC calendar days, today included' },
    last30: { type: 'number', description: 'Entries over the last 30 UTC calendar days, today included' },
    series30: {
      type: 'array',
      description: 'One bucket per UTC day, oldest first, 30 buckets',
      items: {
        type: 'object',
        properties: {
          day: { type: 'string', description: 'UTC day, YYYY-MM-DD' },
          count: { type: 'number', description: 'Entries that day' }
        }
      }
    },
    viaLink: { type: 'number', description: 'Active members who entered through the community link' }
  }
} as const;

/**
 * Une demande d'entrée en attente (#19429) — réservé aux administrateurs et
 * modérateurs de la communauté.
 */
export const communityJoinRequestSchema = {
  type: 'object',
  description: 'Pending request to join a community that validates each entry (#19429)',
  properties: {
    id: { type: 'string', description: 'Request ID' },
    communityId: { type: 'string', description: 'Community ID' },
    userId: { type: 'string', description: 'Requester user ID' },
    status: { type: 'string', enum: ['pending', 'accepted', 'rejected'], description: 'Request status' },
    via: { type: 'string', nullable: true, enum: ['self', 'link', null], description: 'How the request arrived' },
    country: { type: 'string', nullable: true, description: 'Requester country, ISO 3166-1 alpha-2, never the city' },
    createdAt: { type: 'string', format: 'date-time', description: 'Request timestamp' },
    user: {
      type: 'object',
      description: 'Requester public identity',
      properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        displayName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true }
      }
    }
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
    avatar: { type: 'string', minLength: 1, maxLength: 2048, description: 'Identity image reference (isProfileImageReference)' },
    banner: { type: 'string', minLength: 1, maxLength: 2048, description: 'Identity image reference (isProfileImageReference)' },
    isPrivate: { type: 'boolean' },
    requiresJoinApproval: { type: 'boolean', description: 'Validate each entry: joining creates a request an admin or moderator accepts or rejects (#19429)' }
  }
} as const;
