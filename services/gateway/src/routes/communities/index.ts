/**
 * Routes Communautes
 *
 * Ce module regroupe les endpoints lies a la gestion des communautes.
 * Une communaute est un conteneur logique permettant de rassembler des membres,
 * d'organiser des permissions et d'agreger des conversations associees.
 *
 * Points cles:
 * - Les routes sont prefixees par `/communities`.
 * - Les conversations d'une communaute sont exposees via `GET /communities/:id/conversations`.
 * - Le schema Prisma definit une relation Community -> Conversation.
 */
import { FastifyInstance } from 'fastify';
import { registerCoreRoutes } from './core';
import { registerMemberRoutes } from './members';
import { registerSettingsRoutes } from './settings';
import { registerSearchRoutes } from './search';

/**
 * Enregistre les routes de gestion des communautes.
 * @param fastify Instance Fastify injectee par le serveur
 */
export async function communityRoutes(fastify: FastifyInstance) {
  // Enregistrer toutes les sous-routes en parallele
  await Promise.all([
    registerCoreRoutes(fastify),
    registerMemberRoutes(fastify),
    registerSettingsRoutes(fastify),
    registerSearchRoutes(fastify)
  ]);
}

// Re-export des types pour faciliter l'utilisation externe
export * from './types';
