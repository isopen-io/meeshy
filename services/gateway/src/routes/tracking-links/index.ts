import { FastifyInstance } from 'fastify';
import { registerCreationRoutes } from './creation';
import { registerTrackingRoutes } from './tracking';

/**
 * Routes pour les liens de tracking
 * Point d'entrée principal qui enregistre tous les sous-modules
 */
export async function trackingLinksRoutes(fastify: FastifyInstance) {
  await Promise.all([
    registerCreationRoutes(fastify),
    registerTrackingRoutes(fastify)
  ]);
}

export * from './types';
