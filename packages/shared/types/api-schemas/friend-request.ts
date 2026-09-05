/**
 * Schémas d’API — demandes d’amitié.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/friend-request
 */

import { userMinimalSchema } from './user.js';

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
  required: ['status'],
  properties: {
    status: {
      type: 'string',
      enum: ['accepted', 'rejected'],
      description: 'New status for the friend request'
    }
  }
} as const;
