import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { registerCoreRoutes } from './core';
import { registerMessagesRoutes } from './messages';
import { registerMessagesAdvancedRoutes } from './messages-advanced';
import { registerParticipantsRoutes } from './participants';
import { registerSharingRoutes } from './sharing';
import { registerSearchRoutes } from './search';
import { MessageTranslationService } from '../../services/MessageTranslationService';

/**
 * Point d'entrée principal pour toutes les routes de conversations
 * Remplace le fichier monolithique conversations.ts
 */
export async function conversationRoutes(fastify: FastifyInstance) {
  // Récupérer prisma et les services décorés par le serveur
  const prisma = fastify.prisma;
  const translationService: MessageTranslationService = (fastify as any).translationService;

  // Middleware d'authentification optionnel pour les conversations
  const optionalAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: false,
    allowAnonymous: true
  });

  // Middleware d'authentification requis pour les conversations
  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  // Enregistrer toutes les routes par domaine fonctionnel
  registerCoreRoutes(fastify, prisma, optionalAuth, requiredAuth);
  registerMessagesRoutes(fastify, prisma, translationService, optionalAuth, requiredAuth);
  registerMessagesAdvancedRoutes(fastify, prisma, translationService, optionalAuth, requiredAuth);
  registerParticipantsRoutes(fastify, prisma, optionalAuth, requiredAuth);
  registerSharingRoutes(fastify, prisma, optionalAuth, requiredAuth);
  registerSearchRoutes(fastify, prisma, requiredAuth);
}
