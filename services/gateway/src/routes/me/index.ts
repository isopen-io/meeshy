/**
 * /me Routes Entry Point
 *
 * Aggregates all user-scoped "me" routes:
 * - /me/preferences/* - User preference management
 * - Future: /me/profile, /me/settings, etc.
 *
 * All routes under /me require authentication and operate on the
 * authenticated user's own data (self-service).
 */

import { FastifyInstance } from 'fastify';
import { userPreferencesRoutes } from './preferences';
import { deleteAccountRoutes } from './delete-account';
import { dataExportRoutes } from './export';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { handleGetMe, meRouteSharedOptions } from './get-me';

export default async function meRoutes(fastify: FastifyInstance) {
  // Register preferences routes under /me/preferences
  await fastify.register(userPreferencesRoutes, { prefix: '/preferences' });
  await fastify.register(deleteAccountRoutes);
  await fastify.register(dataExportRoutes);

  // Future routes can be added here:
  // await fastify.register(profileRoutes);
  // await fastify.register(settingsRoutes);
  // await fastify.register(devicesRoutes);

  // La racine du module, PAS '/me' : `route-registration.ts` monte déjà ce
  // plugin sous `${API_PREFIX}/me`, si bien que le chemin réel était
  // `/api/v1/me/me` avant #4141 (garde de segment doublé, régression gardée
  // par `identity-twins-retired.test.ts` et `route-auth-coverage.test.ts`).
  //
  // C'est désormais l'adresse CIBLE de #4178 : `GET /api/v1/me`, niveau S2
  // (JWT OU X-Session-Token — `allowAnonymous: true`, ce que l'ancien stub
  // n'offrait pas : `fastify.authenticate` est JWT SEUL). Le calcul lui-même
  // — six champs contre le profil complet d'aujourd'hui, `security` sur
  // `?expand=`, `?fields=` — vit dans `get-me.ts`, SEUL site, partagé avec
  // l'alias déprécié `GET /auth/me` (`routes/auth/magic-link.ts`). Ne pas
  // réécrire ce calcul ici : c'est exactement la divergence que #4178 ferme.
  fastify.get(
    '/',
    {
      ...meRouteSharedOptions,
      preValidation: [createUnifiedAuthMiddleware(fastify.prisma, { requireAuth: true, allowAnonymous: true })],
    },
    handleGetMe
  );
}
