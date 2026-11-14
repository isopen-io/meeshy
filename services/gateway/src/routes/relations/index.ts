import type { FastifyInstance } from 'fastify';
import { registerRelationReads } from './read';
import { registerRelationLower } from './lower';
import { registerRelationRitual } from './ritual';
import { registerRelationSettings } from './settings';
import { registerRelationNowPlaying } from './nowPlaying';
import { registerRelationLocations } from './locations';
import { registerRelationBloodLocation } from './bloodLocation';

/**
 * `/relations` — les CERCLES (#13933) : lire ses liens, baisser ou sortir, et le rituel du
 * Sang, et les réglages par personne (#13936). Monter est l'affaire de
 * `POST /directory/friend-requests { targetLevel }`.
 */
export async function relationsRoutes(fastify: FastifyInstance): Promise<void> {
  registerRelationNowPlaying(fastify);
  registerRelationLocations(fastify);
  registerRelationBloodLocation(fastify);
  registerRelationReads(fastify);
  registerRelationLower(fastify);
  registerRelationRitual(fastify);
  registerRelationSettings(fastify);
}
