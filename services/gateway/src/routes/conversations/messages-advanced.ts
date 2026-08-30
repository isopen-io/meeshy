import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { AttachmentService } from '../../services/attachments';
import {
  registerEditMessagePutRoute,
  registerEditMessagePatchRoute,
} from './messages-advanced-edit';
import { registerDeleteMessageRoute } from './messages-advanced-delete';
import { registerMessagesAdvancedReadRoutes } from './messages-advanced-reads';

/**
 * Point d'entrée de la surface avancée de gestion des messages
 * (édition, suppression, réactions, statuts).
 *
 * Découpé par responsabilité (issue #4284, aucun changement de comportement) :
 * ce fichier COMPOSE les registrars extraits, dans l'ordre original de
 * déclaration des routes (l'ordre d'enregistrement Fastify compte, et
 * `route-manifest.json` le reflète).
 *
 *   - `messages-advanced-edit.ts`   → PUT + PATCH (édition)
 *   - `messages-advanced-delete.ts` → DELETE (suppression)
 *   - `messages-advanced-reads.ts`  → GET réactions + GET statuts
 *   - `messages-advanced-shared.ts` → schémas communs aux transports d'édition
 *
 * `editedMessageResponseSchema` / `patchedMessageResponseSchema` restent
 * importables d'ICI (voir `__tests__/unit/routes/edited-message-serialization.test.ts`) :
 * ré-exportées depuis `messages-advanced-shared.ts`, où elles sont définies.
 */
export { editedMessageResponseSchema, patchedMessageResponseSchema } from './messages-advanced-shared';

/**
 * Enregistre les routes avancées de gestion des messages (edit, delete, reactions, status)
 */
export function registerMessagesAdvancedRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  translationService: MessageTranslationService,
  optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = fastify.socketIOHandler;
  const trackingLinkService = new TrackingLinkService(prisma);
  const attachmentService = new AttachmentService(prisma);

  registerEditMessagePutRoute(fastify, prisma, requiredAuth, { socketIOHandler, trackingLinkService });
  registerDeleteMessageRoute(fastify, prisma, requiredAuth, { socketIOHandler, attachmentService });
  registerEditMessagePatchRoute(fastify, prisma, requiredAuth, { socketIOHandler, trackingLinkService });
  registerMessagesAdvancedReadRoutes(fastify, prisma, requiredAuth);
}
