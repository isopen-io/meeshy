import type { FastifyInstance } from 'fastify';
import { registerCreationRoutes } from './creation';
import { registerManagementRoutes } from './management';
import { registerValidationRoutes } from './validation';
import { registerRetrievalRoutes } from './retrieval';
import { registerMessagesRetrievalRoutes } from './messages-retrieval';
import { registerMessageRoutes } from './messages';
import { registerAdminRoutes } from './admin';
import { registerUserRoutes } from './user';

/**
 * Point d'entrée principal pour toutes les routes de liens de partage
 * Enregistre toutes les routes des sous-modules
 */
export async function linksRoutes(fastify: FastifyInstance) {
  // Les routes user (GET /links, GET /links/stats) doivent être enregistrées
  // avant les routes à paramètre (GET /links/:identifier) pour éviter les conflits
  await registerUserRoutes(fastify);
  await registerValidationRoutes(fastify);
  await registerCreationRoutes(fastify);
  await registerRetrievalRoutes(fastify);
  await registerMessagesRetrievalRoutes(fastify);
  await registerMessageRoutes(fastify);
  await registerManagementRoutes(fastify);
  await registerAdminRoutes(fastify);
}
