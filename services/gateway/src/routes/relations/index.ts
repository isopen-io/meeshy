import type { FastifyInstance } from 'fastify';
import { registerRelationReads } from './read';
import { registerRelationLower } from './lower';
import { registerRelationRitual } from './ritual';

/**
 * `/relations` — les CERCLES (#13933) : lire ses liens, baisser ou sortir, et le rituel du
 * Sang. Monter est l'affaire de `POST /directory/friend-requests { targetLevel }`.
 */
export async function relationsRoutes(fastify: FastifyInstance): Promise<void> {
  registerRelationReads(fastify);
  registerRelationLower(fastify);
  registerRelationRitual(fastify);
}
