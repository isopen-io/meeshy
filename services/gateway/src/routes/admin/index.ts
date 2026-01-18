import { FastifyInstance } from 'fastify';
import { userAdminRoutes } from './users';
import { reportRoutes } from './reports';
import { invitationRoutes } from './invitations';
import { analyticsRoutes } from './analytics';
import { languagesRoutes } from './languages';
import { messagesRoutes } from './messages';
import { registerRoleRoutes } from './roles';
import { registerContentRoutes } from './content';

/**
 * Point d'entrée principal pour toutes les routes d'administration
 * Remplace le fichier monolithique admin.ts
 */
export async function adminRoutes(fastify: FastifyInstance) {
  // Enregistrer toutes les sous-routes d'administration
  await fastify.register(userAdminRoutes);
  await fastify.register(reportRoutes);
  await fastify.register(invitationRoutes);
  await fastify.register(analyticsRoutes);
  await fastify.register(languagesRoutes);
  await fastify.register(messagesRoutes);
  await fastify.register(registerRoleRoutes);
  await fastify.register(registerContentRoutes);
}

// Re-export des sous-routes pour imports directs
export { userAdminRoutes } from './users';
export { reportRoutes } from './reports';
export { invitationRoutes } from './invitations';
export { analyticsRoutes } from './analytics';
export { languagesRoutes } from './languages';
export { messagesRoutes } from './messages';
export { registerRoleRoutes } from './roles';
export { registerContentRoutes } from './content';
