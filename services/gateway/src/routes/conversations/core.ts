import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { registerCheckIdentifierRoute, registerConversationDetailRoute, registerConversationAnalysisRoute } from './core-detail';
import { registerConversationListRoute } from './core-list';
import {
  registerCreateConversationRoute,
  registerUpdateConversationRoute,
  registerDeleteConversationRoute
} from './core-lifecycle';

export {
  LAST_MESSAGE_PREVIEW_MAX_LENGTH,
  truncateMessagePreview,
} from './utils/last-message-preview';

/**
 * Les sélections/includes Prisma partagées par la surface `conversations/core`
 * vivent désormais dans `core-selects.ts` (découpage #4284) ; ré-exportées ici
 * verbatim pour que les importeurs existants n'aient rien à changer.
 */
export {
  conversationListParticipantSelect,
  conversationUserPreferencesSelect,
  conversationLastMessagePreviewSelect,
  CONVERSATION_DETAIL_PARTICIPANTS_CAP,
  conversationDetailInclude
} from './core-selects';

/**
 * Enregistre les routes CRUD de base pour les conversations.
 *
 * Compositeur (#4284) : chaque route vit désormais dans un fichier frère par
 * surface fonctionnelle — `core-selects.ts` (select/include partagés),
 * `core-list.ts` (GET /conversations), `core-detail.ts` (GET
 * /conversations/check-identifier/:identifier, GET /conversations/:id, GET
 * /conversations/:id/analysis) et `core-lifecycle.ts` (POST /conversations,
 * PUT/PATCH /conversations/:id, DELETE /conversations/:id). Les appels
 * ci-dessous restent dans l'ORDRE ORIGINAL de déclaration des routes.
 */
export function registerCoreRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any,
  requiredAuth: any
) {
  registerCheckIdentifierRoute(fastify, prisma, requiredAuth);
  registerConversationListRoute(fastify, prisma, optionalAuth);
  registerConversationDetailRoute(fastify, prisma, optionalAuth);
  registerCreateConversationRoute(fastify, prisma, optionalAuth);
  registerUpdateConversationRoute(fastify, prisma, requiredAuth);
  registerDeleteConversationRoute(fastify, prisma, requiredAuth);
  registerConversationAnalysisRoute(fastify, prisma, requiredAuth);
}
