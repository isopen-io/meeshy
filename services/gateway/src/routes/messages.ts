/**
 * Point d'entrée des routes messages (issue #4284) — compositeur. Le détail
 * vit dans messages-shared.ts (types et dépendances partagés),
 * messages-reads.ts (surface LECTURE) et messages-writes.ts (surface
 * ÉCRITURE), enregistrées ci-dessous dans l'ordre original de déclaration
 * des routes.
 */
import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../middleware/auth.js';
import { AttachmentService } from '../services/attachments/index.js';
import { TrackingLinkService } from '../services/TrackingLinkService';
import { registerMessagesReadRoutes } from './messages-reads';
import { registerMessagesWriteRoutes } from './messages-writes';
import type { MessagesRouteDeps } from './messages-shared';

export { messageDetailResponseSchema } from './messages-reads';

export default async function messageRoutes(fastify: FastifyInstance) {
  // Récupérer prisma décoré par le serveur
  const prisma = fastify.prisma;

  // Instancier les dépendances partagées par les deux surfaces
  const deps: MessagesRouteDeps = {
    prisma,
    // Middleware d'authentification requis pour les messages
    requiredAuth: createUnifiedAuthMiddleware(prisma, {
      requireAuth: true,
      allowAnonymous: false
    }),
    attachmentService: new AttachmentService(prisma),
    translationService: fastify.translationService,
    socketIOHandler: fastify.socketIOHandler,
    trackingLinkService: new TrackingLinkService(prisma),
  };

  // GET /messages/:messageId
  // PUT /messages/:messageId
  // DELETE /messages/:messageId
  // GET /messages/:messageId/translations
  // GET /messages/:messageId/status-details
  // GET /attachments/:attachmentId/status-details
  // POST /attachments/:attachmentId/status
  registerMessagesReadRoutes(fastify, deps);
  registerMessagesWriteRoutes(fastify, deps);
}
