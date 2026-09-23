/**
 * Schémas de réponse du contrat d'aperçu de conversation (#7545) — la forme
 * JSON de `types/conversation-preview.ts`. Sans ces déclarations,
 * fast-json-stringify retire les champs en SILENCE de `GET /conversations`.
 */

export const attachmentSummarySchema = {
  type: 'object',
  nullable: true,
  description: "Résumé de TOUTES les pièces jointes du dernier message (null sans pièce jointe, ou message protégé)",
  properties: {
    count: { type: 'integer', description: 'Nombre total de pièces jointes' },
    kinds: {
      type: 'object',
      description: 'Décompte par famille (image, video, audio, file) — une famille absente vaut 0',
      properties: {
        image: { type: 'integer' },
        video: { type: 'integer' },
        audio: { type: 'integer' },
        file: { type: 'integer' }
      }
    },
    totalSize: { type: 'number', nullable: true, description: 'Somme des tailles connues, en octets — null si aucune' }
  }
} as const;

export const callSummarySchema = {
  type: 'object',
  nullable: true,
  description: "Appel dont la synthèse est le dernier message — lu depuis Message.metadata, jamais depuis le texte FR",
  properties: {
    callId: { type: 'string' },
    kind: { type: 'string', enum: ['audio', 'video'] },
    outcome: { type: 'string', enum: ['completed', 'missed', 'rejected', 'failed', 'ongoing'] },
    durationSec: { type: 'integer' },
    initiatorId: { type: 'string', description: "User.id de l'appelant (flèche entrant / sortant)" },
    endedByInitiator: { type: 'boolean' }
  }
} as const;

export const systemEventSchema = {
  type: 'object',
  nullable: true,
  description: 'Événement système localisable { key, params } — jamais le texte FR stocké',
  properties: {
    key: { type: 'string' },
    params: { type: 'object', additionalProperties: { type: ['string', 'number'] } }
  }
} as const;

export const lastReactionSchema = {
  type: 'object',
  nullable: true,
  description: 'Dernière réaction posée dans la conversation — extrait soumis à la même protection que l’aperçu',
  properties: {
    emoji: { type: 'string' },
    reactorId: { type: 'string', description: 'Participant.id' },
    reactorUserId: { type: 'string', nullable: true, description: 'User.id (null pour un anonyme)' },
    reactorName: { type: 'string' },
    messageId: { type: 'string' },
    targetSenderId: { type: 'string', nullable: true, description: 'Participant.id de l’auteur du message réagi' },
    targetSenderUserId: { type: 'string', nullable: true, description: 'User.id de l’auteur du message réagi' },
    excerpt: { type: 'string', nullable: true },
    excerptOriginalLanguage: { type: 'string', nullable: true },
    excerptTranslations: {
      type: 'object',
      nullable: true,
      additionalProperties: { type: 'string' }
    },
    excerptProtection: {
      type: 'string',
      nullable: true,
      enum: ['expired', 'view-once', 'blurred', 'encrypted', 'ephemeral', null]
    },
    createdAt: { type: 'string', format: 'date-time' }
  }
} as const;

export const activeCallSchema = {
  type: 'object',
  nullable: true,
  description: "Appel en cours dans la conversation, ou null",
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: ['audio', 'video'] },
    participantCount: { type: 'integer' },
    startedAt: { type: 'string', format: 'date-time' }
  }
} as const;
