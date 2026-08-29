/**
 * Voice Analysis Routes - Voice analysis and comparison endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess, sendInternalError, sendNotFound, sendUnauthorized, sendForbidden, sendBadRequest, sendPaginatedSuccess } from '../../utils/response';
import { AudioTranslateService, AudioTranslateError } from '../../services/AudioTranslateService';
import { logger } from '../../utils/logger';
import {
  voiceAnalysisResultSchema,
  voiceComparisonResultSchema,
  translationHistoryEntrySchema,
  systemMetricsSchema,
  supportedLanguageSchema,
  errorResponseSchema,
  getUserId,
  isAdmin,
  type AnalyzeBody,
  type CompareBody,
  type FeedbackBody,
  type HistoryQuery
} from './types';

function errorResponse(reply: FastifyReply, error: unknown, statusCode: number = 500) {
  if (error instanceof AudioTranslateError) {
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

export function registerAnalysisRoutes(
  fastify: FastifyInstance,
  audioTranslateService: AudioTranslateService,
  prefix: string
): void {
  /**
   * POST /api/v1/voice/analyze
   * Analyze voice characteristics
   */
  fastify.post(`${prefix}/analyze`, {
    // SECURITY: authentification obligatoire.
    // Sans ce `preHandler`, `registerVoiceRoutes` (câblée depuis
    // server.ts:1111) n'installait AUCUNE vérification en amont, et
    // `getUserId()` retombait sur l'en-tête brut `x-user-id` fourni par le
    // client : n'importe quel appelant anonyme pouvait usurper l'identité de
    // n'importe quel utilisateur (CWE-290 / CWE-807). Aligné sur le mécanisme
    // déjà utilisé par routes/translation.ts et
    // routes/translation-non-blocking.ts:268.
    preHandler: [(req: FastifyRequest, reply: FastifyReply) => fastify.authenticate(req, reply)],
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
      return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
    }

    try {
      const { audioBase64, analysisTypes } = request.body;

      if (!audioBase64) {
        return sendBadRequest(reply, 'INVALID_REQUEST', { message: 'audioBase64 is required' });
      }

      const result = await audioTranslateService.analyzeVoice(userId, {
        audioBase64,
        analysisTypes
      });

      return sendSuccess(reply, result);
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
    // SECURITY: authentification obligatoire — voir commentaire sur
    // POST /analyze ci-dessus. Même faille, même correctif.
    preHandler: [(req: FastifyRequest, reply: FastifyReply) => fastify.authenticate(req, reply)],
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
      return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
    }

    try {
      const { audioBase64_1, audioBase64_2 } = request.body;

      if (!audioBase64_1 || !audioBase64_2) {
        return sendBadRequest(reply, 'INVALID_REQUEST', { message: 'Both audioBase64_1 and audioBase64_2 are required' });
      }

      const result = await audioTranslateService.compareVoices(userId, {
        audioBase64_1,
        audioBase64_2
      });

      return sendSuccess(reply, result);
    } catch (error) {
      logger.error('[VoiceRoutes] Compare voices error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * POST /api/v1/voice/feedback
   * Submit feedback for a translation
   */
  fastify.post(`${prefix}/feedback`, {
    // SECURITY: authentification obligatoire — voir commentaire sur
    // POST /analyze ci-dessus. Sans elle, un appelant anonyme pouvait
    // soumettre du feedback au nom de n'importe quel utilisateur.
    preHandler: [(req: FastifyRequest, reply: FastifyReply) => fastify.authenticate(req, reply)],
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
      return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
    }

    try {
      const { translationId, rating, feedbackType, comment, metadata } = request.body;

      if (!translationId || rating === undefined) {
        return sendBadRequest(reply, 'INVALID_REQUEST', { message: 'translationId and rating are required' });
      }

      if (rating < 1 || rating > 5) {
        return sendBadRequest(reply, 'INVALID_REQUEST', { message: 'rating must be between 1 and 5' });
      }

      const result = await audioTranslateService.submitFeedback(userId, {
        translationId,
        rating,
        feedbackType,
        comment,
        metadata
      });

      return sendSuccess(reply, result, { statusCode: 201 });
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
    // SECURITY: authentification obligatoire — voir commentaire sur
    // POST /analyze ci-dessus. Sans elle, un appelant anonyme pouvait lire
    // l'historique de traduction de n'importe quel utilisateur en usurpant
    // son identité via x-user-id.
    preHandler: [(req: FastifyRequest, reply: FastifyReply) => fastify.authenticate(req, reply)],
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
      return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
    }

    try {
      const { limit, offset, startDate, endDate } = request.query;
      const result = await audioTranslateService.getHistory(userId, {
        limit,
        offset,
        startDate,
        endDate
      });

      return sendSuccess(reply, result);
    } catch (error) {
      logger.error('[VoiceRoutes] Get history error:', error);
      return errorResponse(reply, error);
    }
  });

  // #4190 — `GET /api/v1/voice/stats` a été RETIRÉE. Aucun appelant sur les
  // trois clients : elle rendait une SECONDE famille de statistiques d'usage,
  // à côté de `GET /users/me/stats`, que rien n'agrégeait jamais ensemble.
  // Si l'usage vocal redevient nécessaire, il rejoint la famille existante —
  // il ne rouvre pas une adresse parallèle.

  /**
   * GET /api/v1/voice/admin/metrics
   * Get system metrics (admin only)
   */
  fastify.get(`${prefix}/admin/metrics`, {
    // SECURITY: authentification obligatoire — voir commentaire sur
    // POST /analyze ci-dessus. Le contrôle `isAdmin()` plus bas ne peut être
    // fiable que si `request.user` provient d'une session vérifiée.
    preHandler: [(req: FastifyRequest, reply: FastifyReply) => fastify.authenticate(req, reply)],
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
      return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
    }

    if (!isAdmin(request)) {
      return sendForbidden(reply, 'FORBIDDEN', { message: 'Admin access required' });
    }

    try {
      const result = await audioTranslateService.getSystemMetrics(userId);
      return sendSuccess(reply, result);
    } catch (error) {
      logger.error('[VoiceRoutes] Get metrics error:', error);
      return errorResponse(reply, error);
    }
  });

  // #4190 — `GET /api/v1/voice/health` a été RETIRÉE. Sonde publique sans aucun
  // appelant : ni les trois clients (iOS SDK + app + extensions, web, Android),
  // ni `infrastructure/` (healthchecks Docker, Traefik) ne la lisaient. Ce
  // qu'elle coûtait n'est pas un octet de trop mais une SECONDE réponse à la
  // question « le service répond-il ? », que `GET /health` (racine, exemptée du
  // limiteur, déjà consommée par les sondes) rend seule — deux sondes qui
  // peuvent se contredire valent moins qu'une seule qui fait autorité.

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
      const result = await audioTranslateService.getSupportedLanguages();
      return sendSuccess(reply, result);
    } catch (error) {
      logger.error('[VoiceRoutes] Get languages error:', error);
      return errorResponse(reply, error);
    }
  });
}
