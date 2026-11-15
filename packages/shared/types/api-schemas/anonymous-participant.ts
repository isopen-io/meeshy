/**
 * Schémas d’API — participants anonymes.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/anonymous-participant
 */

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
    id: { type: 'string', description: 'Participant ID' },
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
