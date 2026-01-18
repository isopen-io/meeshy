/**
 * Voice Analysis Routes
 *
 * API endpoints for voice quality analysis with MongoDB persistence:
 * - POST /api/voice-analysis/attachment/:id - Analyze single attachment
 * - POST /api/voice-analysis/attachments/batch - Analyze multiple attachments (parallel)
 * - POST /api/voice-analysis/profile - Analyze user voice profile
 * - GET /api/voice-analysis/attachment/:id - Get attachment analysis
 * - GET /api/voice-analysis/profile - Get voice profile analysis
 *
 * Features:
 * - Automatic persistence in MessageAudioTranscription and UserVoiceModel
 * - Parallel batch processing with Promise.all()
 * - Rich voice metrics (pitch, timbre, MFCC, prosody, quality)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VoiceAnalysisService } from '../services/VoiceAnalysisService';
import { createUnifiedAuthMiddleware, UnifiedAuthContext } from '../middleware/auth';
import { ZMQSingleton } from '../services/ZmqSingleton';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { VoiceAnalysisType } from '@meeshy/shared/types/voice-api';

// Extend FastifyRequest to include auth
declare module 'fastify' {
  interface FastifyRequest {
    auth?: UnifiedAuthContext;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AnalyzeAttachmentBody {
  audioBase64?: string;
  audioPath?: string;
  analysisTypes?: VoiceAnalysisType[];
  persist?: boolean;
}

interface AnalyzeAttachmentsBatchBody {
  attachments: Array<{
    attachmentId: string;
    messageId: string;
    audioBase64?: string;
    audioPath?: string;
    analysisTypes?: VoiceAnalysisType[];
  }>;
  persist?: boolean;
}

interface AnalyzeVoiceProfileBody {
  audioBase64?: string;
  audioPath?: string;
  analysisTypes?: VoiceAnalysisType[];
  persist?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

export async function voiceAnalysisRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  if (!prisma) {
    console.error('[VoiceAnalysis] Missing required service: prisma');
    return;
  }

  // Get ZMQ client from singleton
  const zmqClient = await ZMQSingleton.getInstance();
  const voiceAnalysisService = new VoiceAnalysisService(prisma, zmqClient);

  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  const prefix = '/api/voice-analysis';

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTACHMENT ANALYSIS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/voice-analysis/attachment/:id
   * Analyze single attachment and persist in MessageAudioTranscription
   */
  fastify.post(`${prefix}/attachment/:id`, {
    preHandler: authMiddleware,
    schema: {
      description:
        'Analyze voice quality of an audio attachment. Extracts pitch, timbre, MFCC, energy, prosody, and classification. Automatically persists results in MessageAudioTranscription.voiceQualityAnalysis for future retrieval.',
      tags: ['voice-analysis'],
      summary: 'Analyze attachment voice quality',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Attachment ID (MongoDB ObjectId)'
          }
        }
      },
      body: {
        type: 'object',
        properties: {
          audioBase64: {
            type: 'string',
            description: 'Base64-encoded audio (alternative to audioPath)'
          },
          audioPath: {
            type: 'string',
            description: 'Server file path to audio (alternative to audioBase64)'
          },
          analysisTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['pitch', 'timbre', 'mfcc', 'spectral', 'classification']
            },
            description: 'Specific analysis types (all if not specified)'
          },
          persist: {
            type: 'boolean',
            description: 'Whether to persist results in DB (default: true)',
            default: true
          }
        }
      },
      response: {
        200: {
          description: 'Analysis completed and persisted',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                attachmentId: { type: 'string' },
                messageId: { type: 'string' },
                analysis: { type: 'object' },
                persisted: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: AnalyzeAttachmentBody;
    }>,
    reply: FastifyReply
  ) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const { id: attachmentId } = request.params;
    const { audioBase64, audioPath, analysisTypes, persist = true } = request.body;

    try {
      // Récupérer l'attachment pour obtenir messageId
      const attachment = await prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: { messageId: true }
      });

      if (!attachment) {
        return reply.status(404).send({
          success: false,
          error: 'NOT_FOUND',
          message: 'Attachment not found'
        });
      }

      const result = await voiceAnalysisService.analyzeAttachment({
        attachmentId,
        messageId: attachment.messageId,
        userId,
        audioBase64,
        audioPath,
        analysisTypes,
        persist
      });

      return reply.status(200).send({
        success: true,
        data: result
      });
    } catch (error: any) {
      fastify.log.error({ error }, '[VoiceAnalysis] Attachment analysis error');
      return reply.status(500).send({
        success: false,
        error: 'ANALYSIS_FAILED',
        message: error.message || 'Voice analysis failed'
      });
    }
  });

  /**
   * POST /api/voice-analysis/attachments/batch
   * Analyze multiple attachments in parallel
   */
  fastify.post(`${prefix}/attachments/batch`, {
    preHandler: authMiddleware,
    schema: {
      description:
        'Batch analyze multiple audio attachments in parallel using Promise.all(). Maximum parallelism for high performance. Results are persisted in MessageAudioTranscription.voiceQualityAnalysis. Returns both successful analyses and failures with error details.',
      tags: ['voice-analysis'],
      summary: 'Batch analyze attachments (parallel)',
      body: {
        type: 'object',
        required: ['attachments'],
        properties: {
          attachments: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
              type: 'object',
              required: ['attachmentId', 'messageId'],
              properties: {
                attachmentId: { type: 'string' },
                messageId: { type: 'string' },
                audioBase64: { type: 'string' },
                audioPath: { type: 'string' },
                analysisTypes: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['pitch', 'timbre', 'mfcc', 'spectral', 'classification']
                  }
                }
              }
            }
          },
          persist: {
            type: 'boolean',
            description: 'Whether to persist results in DB (default: true)',
            default: true
          }
        }
      },
      response: {
        200: {
          description: 'Batch analysis completed',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                success: { type: 'array' },
                failures: { type: 'array' },
                total: { type: 'number' },
                successCount: { type: 'number' },
                failureCount: { type: 'number' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (
    request: FastifyRequest<{ Body: AnalyzeAttachmentsBatchBody }>,
    reply: FastifyReply
  ) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const { attachments, persist = true } = request.body;

    if (!attachments || attachments.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'attachments array is required and must not be empty'
      });
    }

    if (attachments.length > 50) {
      return reply.status(400).send({
        success: false,
        error: 'BATCH_TOO_LARGE',
        message: 'Maximum 50 attachments per batch'
      });
    }

    try {
      const options = attachments.map(att => ({
        attachmentId: att.attachmentId,
        messageId: att.messageId,
        userId,
        audioBase64: att.audioBase64,
        audioPath: att.audioPath,
        analysisTypes: att.analysisTypes,
        persist
      }));

      const result = await voiceAnalysisService.analyzeAttachmentsBatch(options);

      return reply.status(200).send({
        success: true,
        data: {
          ...result,
          total: attachments.length,
          successCount: result.success.length,
          failureCount: result.failures.length
        }
      });
    } catch (error: any) {
      fastify.log.error({ error }, '[VoiceAnalysis] Batch analysis error');
      return reply.status(500).send({
        success: false,
        error: 'BATCH_ANALYSIS_FAILED',
        message: error.message || 'Batch voice analysis failed'
      });
    }
  });

  /**
   * GET /api/voice-analysis/attachment/:id
   * Get persisted analysis for an attachment
   */
  fastify.get(`${prefix}/attachment/:id`, {
    preHandler: authMiddleware,
    schema: {
      description: 'Retrieve persisted voice analysis for an attachment from MessageAudioTranscription.voiceQualityAnalysis. Returns null if no analysis exists.',
      tags: ['voice-analysis'],
      summary: 'Get attachment analysis',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Attachment ID' }
        }
      },
      response: {
        200: {
          description: 'Analysis retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              nullable: true,
              properties: {
                analysis: { type: 'object' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const { id: attachmentId } = request.params;

    try {
      const analysis = await voiceAnalysisService.getAttachmentAnalysis(attachmentId);

      return reply.status(200).send({
        success: true,
        data: analysis ? { analysis } : null
      });
    } catch (error: any) {
      fastify.log.error({ error }, '[VoiceAnalysis] Get attachment analysis error');
      return reply.status(500).send({
        success: false,
        error: 'RETRIEVAL_FAILED',
        message: error.message || 'Failed to retrieve analysis'
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE PROFILE ANALYSIS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/voice-analysis/profile
   * Analyze user voice profile and persist in UserVoiceModel
   */
  fastify.post(`${prefix}/profile`, {
    preHandler: authMiddleware,
    schema: {
      description:
        'Analyze voice quality for user voice profile. Extracts comprehensive voice characteristics and persists in UserVoiceModel.voiceCharacteristics. Used for voice cloning quality assessment.',
      tags: ['voice-analysis'],
      summary: 'Analyze voice profile',
      body: {
        type: 'object',
        properties: {
          audioBase64: { type: 'string' },
          audioPath: { type: 'string' },
          analysisTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['pitch', 'timbre', 'mfcc', 'spectral', 'classification']
            }
          },
          persist: { type: 'boolean', default: true }
        }
      },
      response: {
        200: {
          description: 'Profile analysis completed',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                userId: { type: 'string' },
                analysis: { type: 'object' },
                persisted: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (
    request: FastifyRequest<{ Body: AnalyzeVoiceProfileBody }>,
    reply: FastifyReply
  ) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const { audioBase64, audioPath, analysisTypes, persist = true } = request.body;

    try {
      const result = await voiceAnalysisService.analyzeVoiceProfile({
        userId,
        audioBase64,
        audioPath,
        analysisTypes,
        persist
      });

      return reply.status(200).send({
        success: true,
        data: result
      });
    } catch (error: any) {
      fastify.log.error({ error }, '[VoiceAnalysis] Profile analysis error');
      return reply.status(500).send({
        success: false,
        error: 'ANALYSIS_FAILED',
        message: error.message || 'Voice profile analysis failed'
      });
    }
  });

  /**
   * GET /api/voice-analysis/profile
   * Get persisted analysis for user voice profile
   */
  fastify.get(`${prefix}/profile`, {
    preHandler: authMiddleware,
    schema: {
      description: 'Retrieve persisted voice analysis for user voice profile from UserVoiceModel.voiceCharacteristics. Returns null if no analysis exists.',
      tags: ['voice-analysis'],
      summary: 'Get voice profile analysis',
      response: {
        200: {
          description: 'Profile analysis retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              nullable: true,
              properties: {
                analysis: { type: 'object' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    try {
      const analysis = await voiceAnalysisService.getVoiceProfileAnalysis(userId);

      return reply.status(200).send({
        success: true,
        data: analysis ? { analysis } : null
      });
    } catch (error: any) {
      fastify.log.error({ error }, '[VoiceAnalysis] Get profile analysis error');
      return reply.status(500).send({
        success: false,
        error: 'RETRIEVAL_FAILED',
        message: error.message || 'Failed to retrieve profile analysis'
      });
    }
  });
}
