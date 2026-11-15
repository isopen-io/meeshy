/**
 * Schémas d’API pour l’audio : transcription, piste traduite, modèle de voix.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/audio-transcription
 */

// =============================================================================
// AUDIO TRANSCRIPTION SCHEMAS
// =============================================================================

/**
 * Message audio transcription schema
 */
export const messageAudioTranscriptionSchema = {
  type: 'object',
  description: 'Audio message transcription',
  properties: {
    id: { type: 'string', description: 'Transcription ID' },
    messageId: { type: 'string', description: 'Parent message ID' },
    attachmentId: { type: 'string', nullable: true, description: 'Audio attachment ID' },
    sourceLanguage: { type: 'string', description: 'Detected source language' },
    transcriptionText: { type: 'string', description: 'Transcribed text' },
    confidence: { type: 'number', nullable: true, description: 'Confidence score (0-1)' },
    duration: { type: 'number', nullable: true, description: 'Audio duration (ms)' },
    model: { type: 'string', nullable: true, description: 'Transcription model used' },
    status: {
      type: 'string',
      enum: ['pending', 'processing', 'completed', 'failed'],
      description: 'Transcription status'
    },
    errorMessage: { type: 'string', nullable: true, description: 'Error if failed' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    completedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Completion timestamp' }
  }
} as const;

/**
 * Translated audio schema
 */
export const messageTranslatedAudioSchema = {
  type: 'object',
  description: 'Translated audio file',
  properties: {
    id: { type: 'string', description: 'Translated audio ID' },
    messageId: { type: 'string', description: 'Parent message ID' },
    transcriptionId: { type: 'string', description: 'Source transcription ID' },
    targetLanguage: { type: 'string', description: 'Target language' },
    translatedText: { type: 'string', description: 'Translated text' },
    audioUrl: { type: 'string', nullable: true, description: 'Generated audio URL' },
    voiceModelId: { type: 'string', nullable: true, description: 'Voice model used' },
    duration: { type: 'number', nullable: true, description: 'Audio duration (ms)' },
    status: {
      type: 'string',
      enum: ['pending', 'processing', 'completed', 'failed'],
      description: 'Generation status'
    },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' }
  }
} as const;

/**
 * User voice model schema
 */
export const userVoiceModelSchema = {
  type: 'object',
  description: 'User voice clone model',
  properties: {
    id: { type: 'string', description: 'Voice model ID' },
    userId: { type: 'string', description: 'Owner user ID' },
    name: { type: 'string', description: 'Voice model name' },
    language: { type: 'string', description: 'Primary language' },
    modelId: { type: 'string', description: 'External model ID' },
    status: {
      type: 'string',
      enum: ['training', 'ready', 'failed', 'deleted'],
      description: 'Model status'
    },
    sampleCount: { type: 'number', description: 'Number of training samples' },
    totalDuration: { type: 'number', nullable: true, description: 'Total sample duration (seconds)' },
    quality: { type: 'number', nullable: true, description: 'Model quality score' },
    isDefault: { type: 'boolean', description: 'Default voice model for user' },
    isPublic: { type: 'boolean', description: 'Whether model is public' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' }
  }
} as const;

/**
 * Request transcription schema
 */
export const requestTranscriptionSchema = {
  type: 'object',
  required: ['messageId'],
  properties: {
    messageId: { type: 'string', description: 'Message ID to transcribe' },
    attachmentId: { type: 'string', description: 'Specific attachment ID (optional)' }
  }
} as const;
