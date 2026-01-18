/**
 * Point d'entrée principal pour les routes d'attachments
 * Enregistre tous les sous-modules de routes
 */

import type { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { AttachmentTranslateService } from '../../services/AttachmentTranslateService';
import { registerUploadRoutes } from './upload';
import { registerDownloadRoutes } from './download';
import { registerMetadataRoutes } from './metadata';
import { registerTranslationRoutes } from './translation';

export async function attachmentRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  // Initialize translate service if ZMQ client is available
  let translateService: AttachmentTranslateService | null = null;
  if ((fastify as any).zmqClient) {
    translateService = new AttachmentTranslateService(
      prisma,
      (fastify as any).zmqClient
    );
  }

  // Middleware d'authentification optionnel (supporte JWT + Session anonyme)
  const authOptional = createUnifiedAuthMiddleware(prisma, {
    requireAuth: false,
    allowAnonymous: true
  });

  // Middleware d'authentification requise
  const authRequired = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  // Enregistrer tous les modules de routes en parallèle
  await Promise.all([
    registerUploadRoutes(fastify, authOptional, prisma),
    registerDownloadRoutes(fastify, prisma),
    registerMetadataRoutes(fastify, authRequired, authOptional, prisma),
    registerTranslationRoutes(fastify, authRequired, prisma, translateService),
  ]);
}

// Export des types pour utilisation externe
export * from './types';
