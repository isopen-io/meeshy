import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RELATION_RITUAL_PHASES } from '@meeshy/shared/types/socketio-events';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { logError } from '../../utils/logger';
import { getCacheStore } from '../../services/CacheStore';
import { runRitualPhase } from '../../services/relations/bloodRitual';
import { forgetFriends } from '../../services/relations/relationCaches';
import { relationIoOf } from '../../socketio/relationEvents';
import { errorResponses, otherUserOf, relationLimiter, sendCoded, userIdParams } from './shared';

const corpsRituel = z.object({
  phase: z.enum(RELATION_RITUAL_PHASES),
  token: z.string().optional(),
  // Lu par le rituel, qui refuse en 400 `RELATION_CONSENT_REQUIRED` tout ce qui n'est pas
  // les quatre booléens : le corps ne le filtre pas.
  consents: z.unknown().optional(),
});

/**
 * Le RITUEL du Sang (#13933) : `POST /relations/:userId/ritual { phase, token?, consents? }`.
 * `start` ouvre ou rejoint, `hold` se rejoue tant qu'on tient l'écran, `confirm` — des
 * DEUX côtés — achève. Détail et raisons : `services/relations/bloodRitual.ts`.
 */
export function registerRelationRitual(fastify: FastifyInstance): void {
  // Un `hold` se rejoue chaque seconde ou presque tant qu'on tient l'écran.
  const steps = relationLimiter(fastify, 'rel:ritual:u', 180);

  fastify.post<{ Params: { userId: string } }>('/:userId/ritual', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, steps.middleware()],
    schema: {
      description: 'Blood ritual: start (open or join), hold (keep the screen), confirm (with an explicit consent for each of the four shares).',
      tags: ['relations'],
      summary: 'Blood ritual',
      params: userIdParams,
      body: {
        type: 'object',
        required: ['phase'],
        properties: {
          phase: { type: 'string', enum: [...RELATION_RITUAL_PHASES] },
          token: { type: 'string' },
          consents: { type: 'object', additionalProperties: true },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                token: { type: 'string' },
                requestId: { type: 'string' },
                expiresAt: { type: 'string' },
                holdWindowMs: { type: 'number' },
                held: { type: 'boolean' },
                completed: { type: 'boolean' },
                level: { type: 'string' },
              },
            },
          },
        },
        ...errorResponses,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const otherId = otherUserOf(request, reply);
      if (otherId === null) return reply;

      const body = corpsRituel.parse(request.body);
      const outcome = await runRitualPhase(
        {
          prisma: fastify.prisma,
          cache: getCacheStore(),
          io: relationIoOf(fastify),
          now: () => new Date(),
          forgetFriends: (ids) => forgetFriends(fastify, ids),
        },
        { phase: body.phase, actorId: request.user!.userId, otherId, token: body.token, consents: body.consents },
      );

      return outcome.ok === true ? sendSuccess(reply, outcome.data) : sendCoded(reply, outcome.status, outcome.message, outcome.code);
    } catch (error) {
      if (error instanceof z.ZodError) return sendBadRequest(reply, 'Donnees invalides');
      logError(fastify.log, 'Blood ritual error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
