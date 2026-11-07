import type { FastifyInstance } from 'fastify';
import { nowPlayingRelayDepsOf } from '../../services/nowPlaying/nowPlayingDeps';
import { nowPlayingSnapshotFor } from '../../services/nowPlaying/nowPlayingRelay';
import { logError } from '../../utils/logger';
import { sendInternalError, sendSuccess } from '../../utils/response';
import { errorResponses, relationLimiter } from './shared';

/**
 * Une écoute servie, déclarée CHAMP PAR CHAMP : le sérialiseur retire tout champ non
 * déclaré, et `title` / `source` n'existent que dans la charge d'un lecteur qui y a droit.
 */
const nowPlayingItemSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    category: { type: 'string' },
    title: { type: 'string' },
    source: { type: 'string' },
    updatedAt: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

/**
 * Le RATTRAPAGE de l'écoute partagée (#13934, #16686) : `GET /relations/now-playing`
 * rend les écoutes en cours de mes Proches et de mes Sangs, chacune tronquée à ce que
 * son émetteur me partage. Le direct passe ensuite par `now-playing:changed`.
 */
export function registerRelationNowPlaying(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:now-playing:u', 120);

  fastify.get('/now-playing', {
    onRequest: [fastify.authenticate],
    preHandler: [reads.middleware()],
    schema: {
      description: 'What my Close and Blood links are listening to or watching right now, each truncated to what they share with me.',
      tags: ['relations'],
      summary: 'Now playing of my links',
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { items: { type: 'array', items: nowPlayingItemSchema } } } } },
        ...errorResponses,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const snapshot = await nowPlayingSnapshotFor(nowPlayingRelayDepsOf({ prisma: fastify.prisma, io: undefined }), request.user!.userId);
      return sendSuccess(reply, snapshot);
    } catch (error) {
      logError(fastify.log, 'Now playing snapshot error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
