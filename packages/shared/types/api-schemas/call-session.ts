/**
 * Schémas d’API — sessions d’appel.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/call-session
 */

import { userMinimalSchema } from './user.js';

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
      enum: ['p2p', 'sfu'],
      description: 'WebRTC architecture (p2p or sfu) — NOT the call type; see metadata.type'
    },
    status: {
      type: 'string',
      enum: ['initiated', 'ringing', 'connecting', 'active', 'reconnecting', 'ended', 'missed', 'rejected', 'failed'],
      description: 'Call status'
    },

    // Whitelisted metadata — fast-json-stringify strips everything else
    // (privacy fix 2026-05-12: raw Prisma metadata leaked other participants'
    // telemetry). `type` is the ONLY REST source of the audio/video nature of
    // the call: `mode` carries the WebRTC architecture, never 'video'.
    metadata: {
      type: 'object',
      nullable: true,
      properties: {
        type: { type: 'string', enum: ['audio', 'video'], description: 'Call type (audio or video)' }
      },
      description: 'Call metadata (whitelisted: type only)'
    },

    // Timestamps
    startedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Call start timestamp' },
    answeredAt: { type: 'string', format: 'date-time', nullable: true, description: 'When the first participant answered (ring time excluded from talk-time clocks)' },
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
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Participant record ID' },
          userId: { type: 'string', description: 'User ID' },
          role: { type: 'string', enum: ['initiator', 'participant', 'observer'], description: 'Participant role' },
          status: { type: 'string', enum: ['invited', 'ringing', 'connected', 'disconnected', 'declined'], description: 'Participant status' },
          joinedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Join timestamp' },
          leftAt: { type: 'string', format: 'date-time', nullable: true, description: 'Leave timestamp' },
          isMuted: { type: 'boolean', description: 'Audio muted' },
          isVideoOff: { type: 'boolean', description: 'Video disabled' },
          user: { ...userMinimalSchema, description: 'User info' }
        }
      },
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
    mode: {
      type: 'string',
      enum: ['p2p', 'sfu'],
      description: 'WebRTC architecture (p2p or sfu) — NOT the call type; see metadata.type'
    },
    status: { type: 'string', description: 'Call status' },
    startedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Start time' },
    duration: { type: 'number', nullable: true, description: 'Duration in seconds' },
    participantCount: { type: 'number', description: 'Participant count' }
  }
} as const;

// `callParticipantSchema` (OpenAPI) a été retiré le 2026-08-13, pour la même
// raison que son jumeau Zod `CallParticipantSchemas` : plus aucune route ne le
// référençait, et il documentait des champs (`status`, `duration`, `isMuted`,
// `isVideoOff`) absents du modèle Prisma `CallParticipant`. Publier cette forme
// dans l'OpenAPI aurait fait coder un client contre une entité inexistante.

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
