import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { registerCoreRoutes } from './core';
import { registerFeedRoutes } from './feed';
import { registerCommentRoutes } from './comments';
import { registerInteractionRoutes } from './interactions';

/**
 * Point d'entree principal pour toutes les routes de posts/feed
 */
export async function postRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  const optionalAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: false,
    allowAnonymous: true,
  });

  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false,
  });

  registerCoreRoutes(fastify, prisma, requiredAuth);
  registerFeedRoutes(fastify, prisma, requiredAuth, optionalAuth);
  registerCommentRoutes(fastify, prisma, requiredAuth);
  registerInteractionRoutes(fastify, prisma, requiredAuth);
}
