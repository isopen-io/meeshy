/**
 * Routes API pour la gestion des jobs de traduction
 *
 * GET    /translate/jobs/:jobId  - Statut du job
 * DELETE /translate/jobs/:jobId  - Annuler le job
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AttachmentTranslateService } from '../services/AttachmentTranslateService';
import { createUnifiedAuthMiddleware } from '../middleware/auth';

export async function translationJobsRoutes(fastify: FastifyInstance) {
  // Initialize translate service if ZMQ client is available
  let translateService: AttachmentTranslateService | null = null;
  if ((fastify as any).zmqClient) {
    translateService = new AttachmentTranslateService(
      (fastify as any).prisma,
      (fastify as any).zmqClient
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
      onRequest: [authRequired]
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
      onRequest: [authRequired]
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
