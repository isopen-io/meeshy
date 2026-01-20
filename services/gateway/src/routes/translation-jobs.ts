/**
 * Routes API pour la gestion des jobs de traduction
 *
 * GET    /translate/jobs/:jobId  - Statut du job
 * DELETE /translate/jobs/:jobId  - Annuler le job
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AttachmentTranslateService } from '../services/AttachmentTranslateService';
import { createUnifiedAuthMiddleware } from '../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

// =============================================================================
// OpenAPI Schemas
// =============================================================================

/**
 * OpenAPI schema for job ID parameter
 */
const jobIdParamSchema = {
  type: 'object',
  required: ['jobId'],
  properties: {
    jobId: {
      type: 'string',
      description: 'Unique identifier of the translation job',
      example: 'job_abc123def456'
    }
  }
} as const;

/**
 * OpenAPI schema for translation job status response
 */
const translationJobStatusResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'Unique identifier of the translation job',
          example: 'job_abc123def456'
        },
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
          description: 'Current status of the translation job',
          example: 'completed'
        },
        progress: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Translation progress percentage (0-100)',
          example: 100
        },
        attachmentId: {
          type: 'string',
          description: 'ID of the attachment being translated',
          example: 'att_789xyz'
        },
        sourceLanguage: {
          type: 'string',
          description: 'Source language code',
          example: 'en'
        },
        targetLanguage: {
          type: 'string',
          description: 'Target language code',
          example: 'fr'
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
          description: 'Timestamp when the job was created',
          example: '2024-01-15T10:30:00.000Z'
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
          description: 'Timestamp of last job update',
          example: '2024-01-15T10:32:15.000Z'
        },
        completedAt: {
          type: 'string',
          format: 'date-time',
          description: 'Timestamp when the job completed (if applicable)',
          example: '2024-01-15T10:32:15.000Z'
        },
        error: {
          type: 'string',
          description: 'Error message if the job failed',
          example: 'Translation service unavailable'
        }
      }
    }
  }
} as const;

/**
 * OpenAPI schema for translation job cancellation response
 */
const translationJobCancelResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'Unique identifier of the cancelled translation job',
          example: 'job_abc123def456'
        },
        status: {
          type: 'string',
          enum: ['cancelled'],
          description: 'Status of the job after cancellation',
          example: 'cancelled'
        },
        message: {
          type: 'string',
          description: 'Confirmation message',
          example: 'Translation job cancelled successfully'
        },
        cancelledAt: {
          type: 'string',
          format: 'date-time',
          description: 'Timestamp when the job was cancelled',
          example: '2024-01-15T10:31:00.000Z'
        }
      }
    }
  }
} as const;

/**
 * OpenAPI schema for service unavailable error
 */
const serviceUnavailableResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: { type: 'string', example: 'Translation service not available' },
    code: { type: 'string', example: 'SERVICE_UNAVAILABLE' }
  }
} as const;

export async function translationJobsRoutes(fastify: FastifyInstance) {
  // Initialize translate service if ZMQ client is available
  let translateService: AttachmentTranslateService | null = null;
  if ((fastify as any).zmqClient) {
    // Utiliser le cache multi-niveau partagé depuis le décorateur Fastify
    const jobMappingCache = (fastify as any).jobMappingCache;

    translateService = new AttachmentTranslateService(
      (fastify as any).prisma,
      (fastify as any).zmqClient,
      jobMappingCache
    );
  }

  // Middleware d'authentification requise
  const authRequired = createUnifiedAuthMiddleware((fastify as any).prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /**
   * GET /translate/jobs/:jobId
   * Get translation job status
   */
  fastify.get(
    '/translate/jobs/:jobId',
    {
      onRequest: [authRequired],
      schema: {
        description: 'Retrieve the current status and progress of a translation job. Returns detailed information about the job including its current state, progress percentage, source/target languages, and timestamps. Requires authentication and user must own the job.',
        tags: ['translation'],
        summary: 'Get translation job status',
        params: jobIdParamSchema,
        response: {
          200: {
            description: 'Job status retrieved successfully',
            ...translationJobStatusResponseSchema
          },
          401: {
            description: 'Unauthorized - authentication required or invalid token',
            ...errorResponseSchema
          },
          404: {
            description: 'Not found - job does not exist or user does not have access',
            ...errorResponseSchema
          },
          503: {
            description: 'Service unavailable - translation service not available',
            ...serviceUnavailableResponseSchema
          },
          500: {
            description: 'Internal server error - failed to retrieve job status',
            ...errorResponseSchema
          }
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!translateService) {
          return reply.status(503).send({
            success: false,
            error: 'Translation service not available',
            code: 'SERVICE_UNAVAILABLE'
          });
        }

        const authContext = (request as any).authContext;
        if (!authContext?.isAuthenticated) {
          return reply.status(401).send({
            success: false,
            error: 'Authentication required',
            code: 'UNAUTHORIZED'
          });
        }

        const { jobId } = request.params as { jobId: string };
        const userId = authContext.userId;

        const result = await translateService.getTranslationStatus(userId, jobId);

        if (!result.success) {
          return reply.status(404).send({
            success: false,
            error: result.error,
            code: result.errorCode
          });
        }

        return reply.send({
          success: true,
          data: result.data
        });
      } catch (error: any) {
        console.error('[TranslationJobsRoutes] ❌ Error getting translation status:', error);
        return reply.status(500).send({
          success: false,
          error: error.message || 'Error getting translation status',
          code: 'STATUS_FAILED'
        });
      }
    }
  );

  /**
   * DELETE /translate/jobs/:jobId
   * Cancel a translation job
   */
  fastify.delete(
    '/translate/jobs/:jobId',
    {
      onRequest: [authRequired],
      schema: {
        description: 'Cancel an active translation job. Only pending or processing jobs can be cancelled. Completed, failed, or already cancelled jobs cannot be cancelled. Requires authentication and user must own the job. The cancellation is immediate and cannot be undone.',
        tags: ['translation'],
        summary: 'Cancel translation job',
        params: jobIdParamSchema,
        response: {
          200: {
            description: 'Job cancelled successfully',
            ...translationJobCancelResponseSchema
          },
          400: {
            description: 'Bad request - job cannot be cancelled (already completed, failed, or cancelled)',
            ...errorResponseSchema
          },
          401: {
            description: 'Unauthorized - authentication required or invalid token',
            ...errorResponseSchema
          },
          404: {
            description: 'Not found - job does not exist or user does not have access',
            ...errorResponseSchema
          },
          503: {
            description: 'Service unavailable - translation service not available',
            ...serviceUnavailableResponseSchema
          },
          500: {
            description: 'Internal server error - failed to cancel job',
            ...errorResponseSchema
          }
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!translateService) {
          return reply.status(503).send({
            success: false,
            error: 'Translation service not available',
            code: 'SERVICE_UNAVAILABLE'
          });
        }

        const authContext = (request as any).authContext;
        if (!authContext?.isAuthenticated) {
          return reply.status(401).send({
            success: false,
            error: 'Authentication required',
            code: 'UNAUTHORIZED'
          });
        }

        const { jobId } = request.params as { jobId: string };
        const userId = authContext.userId;

        const result = await translateService.cancelTranslation(userId, jobId);

        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: result.error,
            code: result.errorCode
          });
        }

        return reply.send({
          success: true,
          data: result.data
        });
      } catch (error: any) {
        console.error('[TranslationJobsRoutes] ❌ Error cancelling translation:', error);
        return reply.status(500).send({
          success: false,
          error: error.message || 'Error cancelling translation',
          code: 'CANCEL_FAILED'
        });
      }
    }
  );
}
