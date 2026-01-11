/**
 * Voice API Routes - Production-ready REST endpoints
 * All voice operations go through Gateway -> ZMQ -> Translator
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VoiceAPIService, VoiceAPIError } from '../services/VoiceAPIService';
import { logger } from '../utils/logger';
import type { VoiceAnalysisType, VoiceFeedbackType, VoiceStatsPeriod } from '@meeshy/shared/types';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

// ═══════════════════════════════════════════════════════════════════════════
// OPENAPI SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Voice translation result schema
 */
const voiceTranslationResultSchema = {
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

/**
 * Translation job schema
 */
const translationJobSchema = {
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

/**
 * Voice analysis result schema
 */
const voiceAnalysisResultSchema = {
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

/**
 * Voice comparison result schema
 */
const voiceComparisonResultSchema = {
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

/**
 * Translation history entry schema
 */
const translationHistoryEntrySchema = {
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

/**
 * User statistics schema
 */
const userStatsSchema = {
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

/**
 * System metrics schema
 */
const systemMetricsSchema = {
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

/**
 * Health status schema
 */
const healthStatusSchema = {
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

/**
 * Supported language schema
 */
const supportedLanguageSchema = {
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

// Request body types
interface TranslateBody {
  audioBase64?: string;
  targetLanguages: string[];
  sourceLanguage?: string;
  generateVoiceClone?: boolean;
}

interface TranslateAsyncBody extends TranslateBody {
  webhookUrl?: string;
  priority?: number;
  callbackMetadata?: Record<string, any>;
}

interface AnalyzeBody {
  audioBase64?: string;
  analysisTypes?: VoiceAnalysisType[];
}

interface CompareBody {
  audioBase64_1?: string;
  audioBase64_2?: string;
}

interface FeedbackBody {
  translationId: string;
  rating: number;
  feedbackType?: VoiceFeedbackType;
  comment?: string;
  metadata?: Record<string, any>;
}

interface HistoryQuery {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

interface StatsQuery {
  period?: VoiceStatsPeriod;
}

// Error response helper - returns standardized error format
function errorResponse(reply: FastifyReply, error: unknown, statusCode: number = 500) {
  if (error instanceof VoiceAPIError) {
    return reply.status(statusCode).send({
      success: false,
      error: error.code,
      message: error.message
    });
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  return reply.status(statusCode).send({
    success: false,
    error: 'INTERNAL_ERROR',
    message: message
  });
}

// Get user ID from request (supports JWT and session auth)
function getUserId(request: FastifyRequest): string | null {
  // Try JWT user first
  const user = (request as any).user;
  if (user?.id) return user.id;

  // Try session user
  const session = (request as any).session;
  if (session?.userId) return session.userId;

  // Try header-based user ID (for service-to-service)
  const headerUserId = request.headers['x-user-id'];
  if (typeof headerUserId === 'string') return headerUserId;

  return null;
}

// Check if user is admin
function isAdmin(request: FastifyRequest): boolean {
  const user = (request as any).user;
  return user?.role === 'admin' || user?.isAdmin === true;
}

export function registerVoiceRoutes(
  fastify: FastifyInstance,
  voiceAPIService: VoiceAPIService
): void {
  const prefix = '/api/v1/voice';

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE TRANSLATION ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/voice/translate
   * Synchronous voice translation - waits for result
   */
  fastify.post(`${prefix}/translate`, {
    schema: {
      description: 'Translate audio to one or more target languages with voice cloning support. This is a synchronous endpoint that waits for the translation to complete before returning. Audio is transcribed, translated, and optionally synthesized with voice cloning. Maximum audio duration depends on service configuration.',
      tags: ['voice'],
      summary: 'Synchronous voice translation',
      body: {
        type: 'object',
        required: ['audioBase64', 'targetLanguages'],
        properties: {
          audioBase64: {
            type: 'string',
            description: 'Base64-encoded audio file (wav, mp3, ogg, webm, m4a supported)',
            example: 'UklGRiQAAABXQVZFZm10...'
          },
          targetLanguages: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Array of target language codes (ISO 639-1: en, fr, es, de, etc.)',
            example: ['en', 'es']
          },
          sourceLanguage: {
            type: 'string',
            description: 'Source language code (auto-detected if not provided)',
            example: 'fr'
          },
          generateVoiceClone: {
            type: 'boolean',
            default: false,
            description: 'Whether to clone the original voice in the translated audio'
          }
        }
      },
      response: {
        200: {
          description: 'Translation completed successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: voiceTranslationResultSchema
          }
        },
        400: {
          description: 'Bad request - missing required fields or invalid audio',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error or translation service failure',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: TranslateBody }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const { audioBase64, targetLanguages, sourceLanguage, generateVoiceClone } = request.body;

      if (!audioBase64 && !targetLanguages?.length) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'audioBase64 and targetLanguages are required'
        });
      }

      const result = await voiceAPIService.translateSync(userId, {
        audioBase64,
        targetLanguages,
        sourceLanguage,
        generateVoiceClone
      });

      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Translate error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * POST /api/v1/voice/translate/async
   * Asynchronous voice translation - returns job ID immediately
   */
  fastify.post(`${prefix}/translate/async`, {
    schema: {
      description: 'Submit an asynchronous voice translation job. Returns a job ID immediately without waiting for processing. Use GET /job/:jobId to check status and retrieve results. Optionally provide a webhook URL for completion notifications. Supports priority queuing for premium users.',
      tags: ['voice'],
      summary: 'Asynchronous voice translation',
      body: {
        type: 'object',
        required: ['audioBase64', 'targetLanguages'],
        properties: {
          audioBase64: {
            type: 'string',
            description: 'Base64-encoded audio file (wav, mp3, ogg, webm, m4a supported)',
            example: 'UklGRiQAAABXQVZFZm10...'
          },
          targetLanguages: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Array of target language codes (ISO 639-1)',
            example: ['en', 'es', 'de']
          },
          sourceLanguage: {
            type: 'string',
            description: 'Source language code (auto-detected if not provided)',
            example: 'fr'
          },
          generateVoiceClone: {
            type: 'boolean',
            default: false,
            description: 'Whether to clone the original voice in the translated audio'
          },
          webhookUrl: {
            type: 'string',
            format: 'uri',
            description: 'URL to receive a POST request when translation completes',
            example: 'https://api.example.com/webhooks/translation'
          },
          priority: {
            type: 'number',
            minimum: 1,
            maximum: 10,
            default: 5,
            description: 'Job priority (1=lowest, 10=highest, premium feature)'
          },
          callbackMetadata: {
            type: 'object',
            description: 'Custom metadata to include in webhook callback',
            additionalProperties: true
          }
        }
      },
      response: {
        202: {
          description: 'Translation job accepted and queued',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                jobId: { type: 'string', description: 'Unique job identifier for status tracking' },
                status: { type: 'string', enum: ['pending'], description: 'Initial job status' }
              }
            }
          }
        },
        400: {
          description: 'Bad request - missing required fields or invalid audio',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: TranslateAsyncBody }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const {
        audioBase64,
        targetLanguages,
        sourceLanguage,
        generateVoiceClone,
        webhookUrl,
        priority,
        callbackMetadata
      } = request.body;

      if (!audioBase64 && !targetLanguages?.length) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'audioBase64 and targetLanguages are required'
        });
      }

      const result = await voiceAPIService.translateAsync(userId, {
        audioBase64,
        targetLanguages,
        sourceLanguage,
        generateVoiceClone,
        webhookUrl,
        priority,
        callbackMetadata
      });

      return reply.status(202).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Translate async error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * GET /api/v1/voice/job/:jobId
   * Get job status
   */
  fastify.get(`${prefix}/job/:jobId`, {
    schema: {
      description: 'Check the status of an asynchronous translation job. Returns job metadata, current progress, and results if completed. Jobs can be in pending, processing, completed, failed, or cancelled status.',
      tags: ['voice'],
      summary: 'Get translation job status',
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: {
            type: 'string',
            description: 'Unique job identifier returned from POST /translate/async'
          }
        }
      },
      response: {
        200: {
          description: 'Job status retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: translationJobSchema
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Job not found or access denied',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const { jobId } = request.params;
      const result = await voiceAPIService.getJobStatus(userId, jobId);
      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Get job status error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * DELETE /api/v1/voice/job/:jobId
   * Cancel a pending job
   */
  fastify.delete(`${prefix}/job/:jobId`, {
    schema: {
      description: 'Cancel a pending or processing translation job. Only jobs that have not completed can be cancelled. Returns the updated job status. Cancelled jobs cannot be resumed.',
      tags: ['voice'],
      summary: 'Cancel translation job',
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: {
            type: 'string',
            description: 'Unique job identifier to cancel'
          }
        }
      },
      response: {
        200: {
          description: 'Job cancelled successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                jobId: { type: 'string', description: 'Cancelled job ID' },
                status: { type: 'string', enum: ['cancelled'], description: 'Updated job status' }
              }
            }
          }
        },
        400: {
          description: 'Job cannot be cancelled (already completed or failed)',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Job not found or access denied',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const { jobId } = request.params;
      const result = await voiceAPIService.cancelJob(userId, jobId);
      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Cancel job error:', error);
      return errorResponse(reply, error);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE ANALYSIS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/voice/analyze
   * Analyze voice characteristics
   */
  fastify.post(`${prefix}/analyze`, {
    schema: {
      description: 'Analyze voice characteristics including pitch, timbre, MFCC (Mel-frequency cepstral coefficients), spectral features, and speaker classification. Returns detailed acoustic analysis for voice profiling, speaker verification, or voice quality assessment.',
      tags: ['voice'],
      summary: 'Analyze voice characteristics',
      body: {
        type: 'object',
        required: ['audioBase64'],
        properties: {
          audioBase64: {
            type: 'string',
            description: 'Base64-encoded audio file to analyze',
            example: 'UklGRiQAAABXQVZFZm10...'
          },
          analysisTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['pitch', 'timbre', 'mfcc', 'spectral', 'classification']
            },
            description: 'Specific analysis types to perform (all if not specified)',
            example: ['pitch', 'classification']
          }
        }
      },
      response: {
        200: {
          description: 'Voice analysis completed successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: voiceAnalysisResultSchema
          }
        },
        400: {
          description: 'Bad request - missing audio or invalid format',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error or analysis service failure',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: AnalyzeBody }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const { audioBase64, analysisTypes } = request.body;

      if (!audioBase64) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'audioBase64 is required'
        });
      }

      const result = await voiceAPIService.analyzeVoice(userId, {
        audioBase64,
        analysisTypes
      });

      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Analyze voice error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * POST /api/v1/voice/compare
   * Compare two voice samples
   */
  fastify.post(`${prefix}/compare`, {
    schema: {
      description: 'Compare two voice samples for speaker verification. Analyzes similarity across multiple acoustic dimensions (pitch, timbre, MFCC, energy) and provides a verdict on whether samples are from the same speaker. Useful for authentication, duplicate detection, or voice matching.',
      tags: ['voice'],
      summary: 'Compare voice samples',
      body: {
        type: 'object',
        required: ['audioBase64_1', 'audioBase64_2'],
        properties: {
          audioBase64_1: {
            type: 'string',
            description: 'Base64-encoded first audio sample',
            example: 'UklGRiQAAABXQVZFZm10...'
          },
          audioBase64_2: {
            type: 'string',
            description: 'Base64-encoded second audio sample',
            example: 'UklGRiQAAABXQVZFZm10...'
          }
        }
      },
      response: {
        200: {
          description: 'Voice comparison completed successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: voiceComparisonResultSchema
          }
        },
        400: {
          description: 'Bad request - missing audio samples or invalid format',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error or comparison service failure',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CompareBody }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const { audioBase64_1, audioBase64_2 } = request.body;

      if (!audioBase64_1 || !audioBase64_2) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'Both audioBase64_1 and audioBase64_2 are required'
        });
      }

      const result = await voiceAPIService.compareVoices(userId, {
        audioBase64_1,
        audioBase64_2
      });

      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Compare voices error:', error);
      return errorResponse(reply, error);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FEEDBACK & ANALYTICS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════
  // NOTE: Voice profile management is handled by /api/voice/profile routes
  // See voice-profile.ts for consent, register, update, and delete operations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/voice/feedback
   * Submit feedback for a translation
   */
  fastify.post(`${prefix}/feedback`, {
    schema: {
      description: 'Submit user feedback for a completed voice translation. Ratings help improve translation quality and voice cloning accuracy. Feedback can include quality ratings, accuracy assessments, voice similarity scores, and optional comments.',
      tags: ['voice', 'feedback'],
      summary: 'Submit translation feedback',
      body: {
        type: 'object',
        required: ['translationId', 'rating'],
        properties: {
          translationId: {
            type: 'string',
            description: 'ID of the translation to provide feedback for'
          },
          rating: {
            type: 'number',
            minimum: 1,
            maximum: 5,
            description: 'Overall rating from 1 (poor) to 5 (excellent)'
          },
          feedbackType: {
            type: 'string',
            enum: ['quality', 'accuracy', 'voice_similarity', 'other'],
            description: 'Type of feedback being provided'
          },
          comment: {
            type: 'string',
            maxLength: 1000,
            description: 'Optional detailed feedback comment'
          },
          metadata: {
            type: 'object',
            description: 'Additional structured feedback data',
            additionalProperties: true
          }
        }
      },
      response: {
        201: {
          description: 'Feedback submitted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                feedbackId: { type: 'string', description: 'Unique feedback identifier' },
                translationId: { type: 'string', description: 'Translation ID' },
                rating: { type: 'number', description: 'Submitted rating' }
              }
            }
          }
        },
        400: {
          description: 'Bad request - invalid rating or missing required fields',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Translation not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: FeedbackBody }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const { translationId, rating, feedbackType, comment, metadata } = request.body;

      if (!translationId || rating === undefined) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'translationId and rating are required'
        });
      }

      if (rating < 1 || rating > 5) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'rating must be between 1 and 5'
        });
      }

      const result = await voiceAPIService.submitFeedback(userId, {
        translationId,
        rating,
        feedbackType,
        comment,
        metadata
      });

      return reply.status(201).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Submit feedback error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * GET /api/v1/voice/history
   * Get translation history
   */
  fastify.get(`${prefix}/history`, {
    schema: {
      description: 'Retrieve user translation history with pagination and date filtering. Returns completed translations with source/target languages, original text, translated outputs, and user feedback. Useful for tracking usage and accessing past translations.',
      tags: ['voice', 'history'],
      summary: 'Get translation history',
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 50,
            description: 'Maximum number of history entries to return'
          },
          offset: {
            type: 'number',
            minimum: 0,
            default: 0,
            description: 'Number of entries to skip for pagination'
          },
          startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter translations after this date (ISO 8601 format)',
            example: '2024-01-01T00:00:00Z'
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter translations before this date (ISO 8601 format)',
            example: '2024-12-31T23:59:59Z'
          }
        }
      },
      response: {
        200: {
          description: 'Translation history retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: translationHistoryEntrySchema
                },
                total: { type: 'number', description: 'Total number of translations' },
                limit: { type: 'number', description: 'Applied limit' },
                offset: { type: 'number', description: 'Applied offset' },
                hasMore: { type: 'boolean', description: 'Whether more results are available' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: HistoryQuery }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const { limit, offset, startDate, endDate } = request.query;
      const result = await voiceAPIService.getHistory(userId, {
        limit,
        offset,
        startDate,
        endDate
      });

      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Get history error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * GET /api/v1/voice/stats
   * Get user statistics
   */
  fastify.get(`${prefix}/stats`, {
    schema: {
      description: 'Get user voice translation statistics for a specified time period. Returns aggregated metrics including total translations, audio minutes processed, languages used, average processing times, and feedback ratings. Useful for usage analytics and billing.',
      tags: ['voice', 'analytics'],
      summary: 'Get user statistics',
      querystring: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['day', 'week', 'month', 'all'],
            default: 'all',
            description: 'Time period for statistics aggregation'
          }
        }
      },
      response: {
        200: {
          description: 'User statistics retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: userStatsSchema
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: StatsQuery }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const { period } = request.query;
      const result = await voiceAPIService.getUserStats(userId, period);
      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Get stats error:', error);
      return errorResponse(reply, error);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN & MONITORING ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/voice/admin/metrics
   * Get system metrics (admin only)
   */
  fastify.get(`${prefix}/admin/metrics`, {
    schema: {
      description: 'Get comprehensive system metrics and performance data. Admin-only endpoint that returns active/queued jobs, completion rates, resource usage (CPU, memory, GPU), loaded ML models, and service uptime. Critical for monitoring and capacity planning.',
      tags: ['voice', 'admin'],
      summary: 'Get system metrics (admin only)',
      response: {
        200: {
          description: 'System metrics retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: systemMetricsSchema
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Admin access required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    if (!isAdmin(request)) {
      return reply.status(403).send({ success: false, error: 'FORBIDDEN', message: 'Admin access required' });
    }

    try {
      const result = await voiceAPIService.getSystemMetrics(userId);
      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Get metrics error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * GET /api/v1/voice/health
   * Get service health status (public endpoint)
   */
  fastify.get(`${prefix}/health`, {
    schema: {
      description: 'Check the health and availability of voice translation services. Public endpoint that returns overall status (healthy/degraded/unhealthy), individual service statuses (transcription, translation, TTS, voice cloning), and average latencies. No authentication required.',
      tags: ['voice', 'monitoring'],
      summary: 'Get service health status',
      response: {
        200: {
          description: 'Service is healthy or degraded but operational',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: healthStatusSchema
          }
        },
        503: {
          description: 'Service is unhealthy or unavailable',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Error code' },
            message: { type: 'string', description: 'Error message' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await voiceAPIService.getHealthStatus();
      const statusCode = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;
      return reply.status(statusCode).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Get health error:', error);
      return reply.status(503).send({
        success: false,
        error: 'HEALTH_CHECK_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/v1/voice/languages
   * Get supported languages (public endpoint)
   */
  fastify.get(`${prefix}/languages`, {
    schema: {
      description: 'Get a list of supported languages for voice translation. Returns language codes (ISO 639-1), names, native names, and feature support matrix (transcription, translation, TTS, voice cloning). Public endpoint requiring no authentication.',
      tags: ['voice', 'languages'],
      summary: 'Get supported languages',
      response: {
        200: {
          description: 'Supported languages retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                languages: {
                  type: 'array',
                  items: supportedLanguageSchema
                },
                totalCount: { type: 'number', description: 'Total number of supported languages' }
              }
            }
          }
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await voiceAPIService.getSupportedLanguages();
      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Get languages error:', error);
      return errorResponse(reply, error);
    }
  });

  logger.info('[VoiceRoutes] Voice API routes registered at /api/v1/voice/*');
}
