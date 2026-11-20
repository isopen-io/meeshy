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
import { securityEventsRoutes } from './security-events';
import profileDecorRoutes from './profile-decor';
import bloodLocationMeRoutes from './blood-location';
import locationSettingsReadMeRoutes from './location-settings-read';
import locationGhostMeRoutes from './location-ghost';
import deviceBatteryMeRoutes from './device-battery';
import deviceReachabilityMeRoutes from './device-reachability';
import wellnessMeRoutes from './wellness';
import deviceCallMeRoutes from './device-call';
import healthFallMeRoutes from './health-fall';
import liveActivityTokensMeRoutes from './live-activity-tokens';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { handleGetMe, meRouteSharedOptions } from './get-me';

export default async function meRoutes(fastify: FastifyInstance) {
  // Register preferences routes under /me/preferences
  await fastify.register(userPreferencesRoutes, { prefix: '/preferences' });
  await fastify.register(deleteAccountRoutes);
  await fastify.register(dataExportRoutes);
  await fastify.register(securityEventsRoutes);
  // #10632 : équiper un contour d'avatar et une bannière de design possédés.
  await fastify.register(profileDecorRoutes);
  // #13937 : la position du Sang, derrière le drapeau serveur.
  await fastify.register(bloodLocationMeRoutes);
  // #19452 : la relecture de mon fantôme (hors drapeau) et de mes réglages Sang (sous drapeau).
  await fastify.register(locationSettingsReadMeRoutes);
  // #19203 : le fantôme global de position, HORS drapeau Sang.
  await fastify.register(locationGhostMeRoutes);
  // #14147 : le relevé de batterie (REST, même porte que la socket) et la coupure globale.
  await fastify.register(deviceBatteryMeRoutes);
  // #18737 : le signe de vie du téléphone sondé et la coupure globale de son injoignabilité.
  await fastify.register(deviceReachabilityMeRoutes);
  await fastify.register(wellnessMeRoutes);
  await fastify.register(deviceCallMeRoutes);
  // #18748 : la chute détectée par la montre, sous l'accord explicite de la personne.
  await fastify.register(healthFallMeRoutes);
  // #19463 : le jeton d'Activité en direct d'un partage de position, clos par la passerelle à sa fin.
  await fastify.register(liveActivityTokensMeRoutes);

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
