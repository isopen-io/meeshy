import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  PostInteractiveResponseService,
} from '../../services/PostInteractiveResponseService';
import { ValidationError } from '../../errors/custom-errors';
import { PostInteractiveResponseSchema, PostObjectParams } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import {
  sendSuccess,
  sendUnauthorized,
  sendNotFound,
  sendBadRequest,
  sendInternalError,
} from '../../utils/response';
import { mayConsumePost } from './postConsumptionGate';

/**
 * Votes/réponses aux stickers interactifs du composer (O10, #3954) — table
 * légère à côté du blob `storyEffects`, jamais dedans. Le kind `interactive`
 * reste RÉSERVÉ au contrat (#3953) : ces routes sont prêtes, pas atteignables
 * par un client tant que la réserve n'est pas levée.
 *
 * POSER/LIRE une réponse suit l'audience du post (`mayConsumePost`), comme le
 * favori et l'impression — un geste de LECTEUR. RETIRER n'en dépend pas, même
 * raison que `bookmarks.ts` : la ligne est adressée par
 * `(postId, objectId, userId)`, personne ne peut retirer la réponse d'un
 * autre, et conditionner ce retrait à une audience rendrait IRRÉVOCABLE une
 * réponse posée avant que l'accès ne se referme.
 */
export function registerInteractiveResponseRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
) {
  const service = new PostInteractiveResponseService(prisma);

  // POST /posts/:postId/objects/:objectId/responses
  fastify.post('/posts/:postId/objects/:objectId/responses', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostObjectParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId, objectId } = request.params;

      if (!(await mayConsumePost(prisma, postId, authContext.registeredUser.id))) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      const parsed = PostInteractiveResponseSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid response payload', {
          code: 'VALIDATION_ERROR',
          violations: parsed.error.issues.map(issue => ({
            path: issue.path.map(String),
            message: issue.message,
          })),
        });
      }

      const response = await service.submitResponse({
        postId,
        objectId,
        userId: authContext.registeredUser.id,
        ...parsed.data,
      });

      return sendSuccess(reply, { response });
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendBadRequest(reply, error.message, { code: error.code });
      }
      enhancedLogger.error('[POST /posts/:postId/objects/:objectId/responses]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId/objects/:objectId/responses — sans garde d'audience, voir l'en-tête.
  fastify.delete('/posts/:postId/objects/:objectId/responses', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostObjectParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId, objectId } = request.params;
      const removed = await service.removeResponse({
        postId,
        objectId,
        userId: authContext.registeredUser.id,
      });

      return sendSuccess(reply, { removed });
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendBadRequest(reply, error.message, { code: error.code });
      }
      enhancedLogger.error('[DELETE /posts/:postId/objects/:objectId/responses]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/:postId/objects/:objectId/responses — agrégat + réponse propre à l'appelant.
  fastify.get('/posts/:postId/objects/:objectId/responses', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostObjectParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId, objectId } = request.params;

      if (!(await mayConsumePost(prisma, postId, authContext.registeredUser.id))) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      const [aggregation, myResponse] = await Promise.all([
        service.getAggregate(postId, objectId),
        service.getUserResponse(postId, objectId, authContext.registeredUser.id),
      ]);

      return sendSuccess(reply, { ...aggregation, myResponse });
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendBadRequest(reply, error.message, { code: error.code });
      }
      enhancedLogger.error('[GET /posts/:postId/objects/:objectId/responses]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
