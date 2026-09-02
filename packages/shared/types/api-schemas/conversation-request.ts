/**
 * Schémas d’API — corps de requête des conversations et de leurs messages.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/conversation-request
 */

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
      maxItems: 250,
      description: 'Initial participant user IDs (max 250 — use incremental add for larger groups)'
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
    avatar: {
      type: 'string',
      nullable: true,
      description: 'Conversation avatar URL (null clears it)'
    },
    banner: {
      type: 'string',
      nullable: true,
      description: 'Conversation banner URL (null clears it)'
    },
    // Les quatre réglages du conteneur. Le handler les lisait depuis toujours ;
    // le contrat, lui, n'en déclarait aucun — ils ne passaient que parce que
    // rien ne ferme cet objet, c'est-à-dire par accident. Un contrat incomplet
    // qui fonctionne est un contrat dont personne ne saura qu'il a cessé de
    // fonctionner.
    //
    // Aucun `default` ici, délibérément : dans un schéma de REQUÊTE un `default`
    // ÉCRIT dans `request.body` avant le handler, et celui-ci distingue
    // précisément l'absence (« ne touche pas à ce réglage ») de la valeur.
    defaultWriteRole: {
      type: 'string',
      enum: ['everyone', 'member', 'moderator', 'admin', 'creator'],
      description: 'Minimum role required to send messages (creator/admin only)'
    },
    isAnnouncementChannel: {
      type: 'boolean',
      description: 'Announcement-only mode (creator/admin only)'
    },
    slowModeSeconds: {
      type: 'number',
      minimum: 0,
      description: 'Minimum seconds between messages per user, 0 disables (creator/admin only)'
    },
    autoTranslateEnabled: {
      type: 'boolean',
      description: 'Auto-translation for this conversation (creator/admin only)'
    }
    // `type` a été RETIRÉ : il n'était accepté que par la route jumelle
    // supprimée de `sharing.ts`, aucun client ne l'envoie, et muter le type
    // d'une conversation déplace ses invariants d'admission d'écriture sans que
    // rien ne les recalcule.
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
      minLength: 0,
      maxLength: 10000,
      description: 'Message content (can be empty if encryptedPayload or attachments are provided)'
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
    },
    encryptedPayload: {
      type: 'object',
      nullable: true,
      description: 'E2EE encrypted payload containing ciphertext and metadata',
      additionalProperties: true // Allows dynamic encryption properties
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
      minLength: 0,
      maxLength: 10000,
      description: 'New message content (can be empty if encryptedPayload is provided)'
    },
    originalLanguage: {
      type: 'string',
      minLength: 2,
      maxLength: 5,
      description: 'Message language if changed'
    },
    encryptedPayload: {
      type: 'object',
      nullable: true,
      description: 'E2EE encrypted payload containing ciphertext and metadata',
      additionalProperties: true
    }
  }
} as const;
