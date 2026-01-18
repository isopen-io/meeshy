/**
 * Voice Routes Types - OpenAPI schemas and shared types
 */

import type { FastifyRequest } from 'fastify';
import type {
  VoiceTranslateBody,
  VoiceTranslateAsyncBody,
  VoiceTranscribeBody,
  VoiceAnalyzeBody,
  VoiceCompareBody,
  VoiceFeedbackBody,
  VoiceHistoryQuery,
  VoiceStatsQuery
} from '@meeshy/shared/types';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST BODY TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type TranslateBody = VoiceTranslateBody;
export type TranslateAsyncBody = VoiceTranslateAsyncBody;
export type TranscribeBody = VoiceTranscribeBody;
export type AnalyzeBody = VoiceAnalyzeBody;
export type CompareBody = VoiceCompareBody;
export type FeedbackBody = VoiceFeedbackBody;
export type HistoryQuery = VoiceHistoryQuery;
export type StatsQuery = VoiceStatsQuery;

// ═══════════════════════════════════════════════════════════════════════════
// OPENAPI SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const voiceTranslationResultSchema = {
  type: 'object',
  properties: {
    translationId: { type: 'string', description: 'Unique translation identifier' },
    originalAudio: {
      type: 'object',
      properties: {
        transcription: { type: 'string', description: 'Transcribed text from audio' },
        language: { type: 'string', description: 'Detected source language' },
        durationMs: { type: 'number', description: 'Audio duration in milliseconds' },
        confidence: { type: 'number', description: 'Transcription confidence (0-1)' }
      }
    },
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          targetLanguage: { type: 'string', description: 'Target language code' },
          translatedText: { type: 'string', description: 'Translated text' },
          audioBase64: { type: 'string', description: 'Generated audio in base64 (if requested)' },
          audioUrl: { type: 'string', description: 'URL to generated audio file' },
          durationMs: { type: 'number', description: 'Generated audio duration in milliseconds' },
          voiceCloned: { type: 'boolean', description: 'Whether voice was cloned' },
          voiceQuality: { type: 'number', description: 'Voice clone quality score (0-1)' }
        }
      }
    },
    voiceProfile: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: 'Voice profile ID' },
        quality: { type: 'number', description: 'Profile quality score' },
        isNew: { type: 'boolean', description: 'Whether profile was newly created' }
      }
    },
    processingTimeMs: { type: 'number', description: 'Total processing time in milliseconds' }
  }
} as const;

export const translationJobSchema = {
  type: 'object',
  properties: {
    jobId: { type: 'string', description: 'Unique job identifier' },
    userId: { type: 'string', description: 'User who created the job' },
    status: {
      type: 'string',
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      description: 'Current job status'
    },
    progress: { type: 'number', description: 'Job progress percentage (0-100)', minimum: 0, maximum: 100 },
    currentStep: { type: 'string', description: 'Current processing step' },
    createdAt: { type: 'string', format: 'date-time', description: 'Job creation timestamp' },
    startedAt: { type: 'string', format: 'date-time', description: 'Processing start timestamp' },
    completedAt: { type: 'string', format: 'date-time', description: 'Completion timestamp' },
    result: voiceTranslationResultSchema,
    error: { type: 'string', description: 'Error message if failed' }
  }
} as const;

export const voiceAnalysisResultSchema = {
  type: 'object',
  properties: {
    pitch: {
      type: 'object',
      properties: {
        mean: { type: 'number', description: 'Mean pitch in Hz' },
        std: { type: 'number', description: 'Standard deviation of pitch' },
        min: { type: 'number', description: 'Minimum pitch in Hz' },
        max: { type: 'number', description: 'Maximum pitch in Hz' },
        contour: { type: 'array', items: { type: 'number' }, description: 'Pitch contour over time' }
      }
    },
    timbre: {
      type: 'object',
      properties: {
        spectralCentroid: { type: 'number', description: 'Spectral centroid' },
        spectralBandwidth: { type: 'number', description: 'Spectral bandwidth' },
        spectralRolloff: { type: 'number', description: 'Spectral rolloff point' },
        spectralFlatness: { type: 'number', description: 'Spectral flatness coefficient' }
      }
    },
    mfcc: {
      type: 'object',
      properties: {
        coefficients: { type: 'array', items: { type: 'number' }, description: 'MFCC coefficients' },
        mean: { type: 'array', items: { type: 'number' }, description: 'Mean MFCC values' },
        std: { type: 'array', items: { type: 'number' }, description: 'Standard deviation of MFCC' }
      }
    },
    energy: {
      type: 'object',
      properties: {
        rms: { type: 'number', description: 'Root mean square energy' },
        peak: { type: 'number', description: 'Peak energy level' },
        dynamicRange: { type: 'number', description: 'Dynamic range in dB' }
      }
    },
    classification: {
      type: 'object',
      properties: {
        voiceType: { type: 'string', description: 'Voice type classification' },
        gender: { type: 'string', description: 'Predicted gender' },
        ageRange: { type: 'string', description: 'Estimated age range' },
        confidence: { type: 'number', description: 'Classification confidence (0-1)' }
      }
    }
  }
} as const;

export const voiceComparisonResultSchema = {
  type: 'object',
  properties: {
    overallSimilarity: { type: 'number', description: 'Overall similarity score (0-1)', minimum: 0, maximum: 1 },
    pitchSimilarity: { type: 'number', description: 'Pitch similarity score (0-1)', minimum: 0, maximum: 1 },
    timbreSimilarity: { type: 'number', description: 'Timbre similarity score (0-1)', minimum: 0, maximum: 1 },
    mfccSimilarity: { type: 'number', description: 'MFCC similarity score (0-1)', minimum: 0, maximum: 1 },
    energySimilarity: { type: 'number', description: 'Energy similarity score (0-1)', minimum: 0, maximum: 1 },
    verdict: {
      type: 'string',
      enum: ['same_speaker', 'different_speaker', 'uncertain'],
      description: 'Speaker verification verdict'
    },
    confidence: { type: 'number', description: 'Verdict confidence (0-1)', minimum: 0, maximum: 1 }
  }
} as const;

export const translationHistoryEntrySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Translation ID' },
    userId: { type: 'string', description: 'User ID' },
    timestamp: { type: 'string', format: 'date-time', description: 'Translation timestamp' },
    sourceLanguage: { type: 'string', description: 'Source language code' },
    targetLanguages: { type: 'array', items: { type: 'string' }, description: 'Target language codes' },
    originalText: { type: 'string', description: 'Original transcribed text' },
    translatedTexts: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'Map of language code to translated text'
    },
    audioGenerated: { type: 'boolean', description: 'Whether audio was generated' },
    voiceCloned: { type: 'boolean', description: 'Whether voice was cloned' },
    processingTimeMs: { type: 'number', description: 'Processing time in milliseconds' },
    feedbackRating: { type: 'number', description: 'User feedback rating (1-5)', minimum: 1, maximum: 5 }
  }
} as const;

export const userStatsSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string', description: 'User ID' },
    totalTranslations: { type: 'number', description: 'Total number of translations' },
    totalAudioMinutes: { type: 'number', description: 'Total audio processed in minutes' },
    languagesUsed: { type: 'array', items: { type: 'string' }, description: 'Languages used in translations' },
    averageProcessingTimeMs: { type: 'number', description: 'Average processing time in milliseconds' },
    averageFeedbackRating: { type: 'number', description: 'Average user feedback rating' },
    feedbackCount: { type: 'number', description: 'Total feedback submissions' },
    profileCount: { type: 'number', description: 'Number of voice profiles created' },
    periodStart: { type: 'string', format: 'date-time', description: 'Stats period start' },
    periodEnd: { type: 'string', format: 'date-time', description: 'Stats period end' }
  }
} as const;

export const systemMetricsSchema = {
  type: 'object',
  properties: {
    activeJobs: { type: 'number', description: 'Currently active translation jobs' },
    queuedJobs: { type: 'number', description: 'Jobs waiting in queue' },
    completedToday: { type: 'number', description: 'Jobs completed today' },
    failedToday: { type: 'number', description: 'Jobs failed today' },
    averageProcessingTimeMs: { type: 'number', description: 'Average processing time in milliseconds' },
    cpuUsage: { type: 'number', description: 'CPU usage percentage', minimum: 0, maximum: 100 },
    memoryUsageMb: { type: 'number', description: 'Memory usage in megabytes' },
    gpuUsage: { type: 'number', description: 'GPU usage percentage', minimum: 0, maximum: 100 },
    gpuMemoryMb: { type: 'number', description: 'GPU memory usage in megabytes' },
    modelsLoaded: { type: 'array', items: { type: 'string' }, description: 'Currently loaded ML models' },
    uptime: { type: 'number', description: 'Service uptime in seconds' },
    version: { type: 'string', description: 'Service version' }
  }
} as const;

export const healthStatusSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['healthy', 'degraded', 'unhealthy'],
      description: 'Overall service health status'
    },
    services: {
      type: 'object',
      properties: {
        transcription: { type: 'boolean', description: 'Transcription service available' },
        translation: { type: 'boolean', description: 'Translation service available' },
        tts: { type: 'boolean', description: 'Text-to-speech service available' },
        voiceClone: { type: 'boolean', description: 'Voice cloning service available' },
        analytics: { type: 'boolean', description: 'Analytics service available' },
        database: { type: 'boolean', description: 'Database available' }
      }
    },
    latency: {
      type: 'object',
      properties: {
        transcriptionMs: { type: 'number', description: 'Average transcription latency in milliseconds' },
        translationMs: { type: 'number', description: 'Average translation latency in milliseconds' },
        ttsMs: { type: 'number', description: 'Average TTS latency in milliseconds' }
      }
    },
    timestamp: { type: 'string', format: 'date-time', description: 'Status check timestamp' }
  }
} as const;

export const supportedLanguageSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'ISO 639-1 language code', example: 'en' },
    name: { type: 'string', description: 'English language name', example: 'English' },
    nativeName: { type: 'string', description: 'Native language name', example: 'English' },
    supportedFeatures: {
      type: 'object',
      properties: {
        transcription: { type: 'boolean', description: 'Speech-to-text support' },
        translation: { type: 'boolean', description: 'Translation support' },
        tts: { type: 'boolean', description: 'Text-to-speech support' },
        voiceClone: { type: 'boolean', description: 'Voice cloning support' }
      }
    }
  }
} as const;

export { errorResponseSchema };

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getUserId(request: FastifyRequest): string | null {
  const user = (request as any).user;
  if (user?.id) return user.id;

  const session = (request as any).session;
  if (session?.userId) return session.userId;

  const headerUserId = request.headers['x-user-id'];
  if (typeof headerUserId === 'string') return headerUserId;

  return null;
}

export function isAdmin(request: FastifyRequest): boolean {
  const user = (request as any).user;
  return user?.role === 'admin' || user?.isAdmin === true;
}
