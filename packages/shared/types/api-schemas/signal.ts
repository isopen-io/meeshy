/**
 * Schémas d’API — protocole Signal / E2EE.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/signal
 */

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
 * Request body for uploading pre-key bundle from client
 */
export const generatePreKeyBundleRequestSchema = {
  type: 'object',
  description: 'Request to upload a new pre-key bundle',
  required: ['identityKey', 'registrationId', 'deviceId', 'signedPreKeyId', 'signedPreKeyPublic', 'signedPreKeySignature'],
  properties: {
    identityKey: { type: 'string' },
    registrationId: { type: 'number' },
    deviceId: { type: 'number' },
    preKeyId: { type: 'number', nullable: true },
    preKeyPublic: { type: 'string', nullable: true },
    signedPreKeyId: { type: 'number' },
    signedPreKeyPublic: { type: 'string' },
    signedPreKeySignature: { type: 'string' },
    kyberPreKeyId: { type: 'number', nullable: true },
    kyberPreKeyPublic: { type: 'string', nullable: true },
    kyberPreKeySignature: { type: 'string', nullable: true }
  }
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
