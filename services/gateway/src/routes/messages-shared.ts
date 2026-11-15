/**
 * Routes messages — types et dépendances PARTAGÉS entre messages-reads.ts et
 * messages-writes.ts (issue #4284). Point d'entrée : messages.ts.
 */
import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../middleware/auth.js';
import { AttachmentService } from '../services/attachments/index.js';
import { TrackingLinkService } from '../services/TrackingLinkService';
import { enhancedLogger } from '../utils/logger-enhanced.js';

export const logger = enhancedLogger.child({ module: 'MessagesRoutes' });

export interface MessageParams {
  messageId: string;
}

export type MessagesRouteDeps = {
  prisma: FastifyInstance['prisma'];
  requiredAuth: ReturnType<typeof createUnifiedAuthMiddleware>;
  attachmentService: AttachmentService;
  translationService: FastifyInstance['translationService'];
  socketIOHandler: FastifyInstance['socketIOHandler'];
  trackingLinkService: TrackingLinkService;
};
