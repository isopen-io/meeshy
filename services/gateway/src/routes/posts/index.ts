import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { registerCoreRoutes } from './core';
import { registerFeedRoutes } from './feed';
import { registerCommentRoutes } from './comments';
import { registerInteractionRoutes } from './interactions';
import { registerStoryAudioRoutes } from './audio';
import type { OrphanMediaCleanupService } from '../../services/storage/OrphanMediaCleanupService';

/**
 * Point d'entree principal pour toutes les routes de posts/feed
 */
export async function postRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  // Optional decorator from server.ts. Only present in the production
  // bootstrap — unit tests / standalone Fastify harnesses do not have it,
  // and PostService falls back to the inline catch compensation when nil.
  const orphanCleanup = (fastify as unknown as {
    orphanMediaCleanup?: OrphanMediaCleanupService;
  }).orphanMediaCleanup;

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
  registerInteractionRoutes(fastify, prisma, requiredAuth, orphanCleanup);
  registerStoryAudioRoutes(fastify, prisma, requiredAuth);
}
