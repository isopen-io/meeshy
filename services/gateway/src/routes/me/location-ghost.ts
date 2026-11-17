import type { FastifyInstance } from 'fastify';
import { locationGhostPayloadSchema } from '@meeshy/shared/types/shared-location';
import { setLocationGhostAfter } from '../../services/sharedLocation/sharedLocationDeps';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { errorResponses, relationLimiter } from '../relations/shared';

/** L'état réglé, déclaré champ par champ : rien d'autre ne part. */
const locationGhostResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: { ghost: { type: 'boolean' }, ghostAt: { type: 'string', nullable: true } },
      required: ['ghost', 'ghostAt'],
    },
  },
} as const;

/**
 * LE FANTÔME GLOBAL DE POSITION (#19203) : « masque ma position pour tous, Sang compris ». Hors
 * du drapeau Sang — il ne fait que RETIRER de la visibilité, et doit pouvoir couper le partage
 * temporaire de tout compte. Compte inscrit seulement (`authenticate` refuse une session
 * anonyme). La relecture de l'état est l'affaire de #18025 ; ce PUT rend l'état réglé.
 */
export default async function locationGhostMeRoutes(fastify: FastifyInstance): Promise<void> {
  const writes = relationLimiter(fastify, 'rel:loc-ghost:w', 30);
  const paramsOf = () => ({
    prisma: fastify.prisma,
    io: fastify.socketIOHandler?.getManager?.()?.getIO() as never,
    report: (error: unknown) => logError(fastify.log, 'Location ghost side effect:', error),
  });

  fastify.put('/location/ghost', {
    onRequest: [fastify.authenticate],
    preHandler: [writes.middleware()],
    schema: {
      description: 'Global location ghost mode: nobody sees my position, temporary shares and Blood included.',
      tags: ['me'],
      summary: 'Set my global location ghost mode',
      body: { type: 'object', properties: { ghost: { type: 'boolean' } }, required: ['ghost'] },
      response: { 200: locationGhostResponseSchema, ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const parsed = locationGhostPayloadSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      return sendSuccess(reply, await setLocationGhostAfter(paramsOf(), request.user!.userId, parsed.data.ghost));
    } catch (error) {
      logError(fastify.log, 'Location ghost error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
