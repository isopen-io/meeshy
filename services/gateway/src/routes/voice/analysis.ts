/**
 * Voice Analysis Routes - Voice analysis and comparison endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AudioTranslateService, AudioTranslateError } from '../../services/AudioTranslateService';
import { logger } from '../../utils/logger';
import {
  voiceAnalysisResultSchema,
  voiceComparisonResultSchema,
  translationHistoryEntrySchema,
  userStatsSchema,
  systemMetricsSchema,
  healthStatusSchema,
  supportedLanguageSchema,
  errorResponseSchema,
  getUserId,
  isAdmin,
  type AnalyzeBody,
  type CompareBody,
  type FeedbackBody,
  type HistoryQuery,
  type StatsQuery
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

      const result = await audioTranslateService.analyzeVoice(userId, {
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

      const result = await audioTranslateService.compareVoices(userId, {
        audioBase64_1,
        audioBase64_2
      });

      return reply.status(200).send({ success: true, data: result });
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

      const result = await audioTranslateService.submitFeedback(userId, {
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
      const result = await audioTranslateService.getHistory(userId, {
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
      const result = await audioTranslateService.getUserStats(userId, period);
      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Get stats error:', error);
      return errorResponse(reply, error);
    }
  });

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
      const result = await audioTranslateService.getSystemMetrics(userId);
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
      const result = await audioTranslateService.getHealthStatus();
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
      const result = await audioTranslateService.getSupportedLanguages();
      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Get languages error:', error);
      return errorResponse(reply, error);
    }
  });
}
