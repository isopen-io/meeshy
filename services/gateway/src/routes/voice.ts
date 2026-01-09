/**
 * Voice API Routes - Production-ready REST endpoints
 * All voice operations go through Gateway -> ZMQ -> Translator
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VoiceAPIService, VoiceAPIError } from '../services/VoiceAPIService';
import { logger } from '../utils/logger';
import type { VoiceAnalysisType, VoiceFeedbackType, VoiceStatsPeriod } from '@meeshy/shared/types';

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
  fastify.post(`${prefix}/translate`, async (request: FastifyRequest<{ Body: TranslateBody }>, reply: FastifyReply) => {
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
  fastify.post(`${prefix}/translate/async`, async (request: FastifyRequest<{ Body: TranslateAsyncBody }>, reply: FastifyReply) => {
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
  fastify.get(`${prefix}/job/:jobId`, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
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
  fastify.delete(`${prefix}/job/:jobId`, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
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
  fastify.post(`${prefix}/analyze`, async (request: FastifyRequest<{ Body: AnalyzeBody }>, reply: FastifyReply) => {
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
  fastify.post(`${prefix}/compare`, async (request: FastifyRequest<{ Body: CompareBody }>, reply: FastifyReply) => {
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
  fastify.post(`${prefix}/feedback`, async (request: FastifyRequest<{ Body: FeedbackBody }>, reply: FastifyReply) => {
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
  fastify.get(`${prefix}/history`, async (request: FastifyRequest<{ Querystring: HistoryQuery }>, reply: FastifyReply) => {
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
  fastify.get(`${prefix}/stats`, async (request: FastifyRequest<{ Querystring: StatsQuery }>, reply: FastifyReply) => {
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
  fastify.get(`${prefix}/admin/metrics`, async (request: FastifyRequest, reply: FastifyReply) => {
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
  fastify.get(`${prefix}/health`, async (request: FastifyRequest, reply: FastifyReply) => {
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
  fastify.get(`${prefix}/languages`, async (request: FastifyRequest, reply: FastifyReply) => {
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
