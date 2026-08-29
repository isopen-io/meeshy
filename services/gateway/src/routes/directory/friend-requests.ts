import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import {
  sendSuccess, sendBadRequest, sendNotFound, sendConflict, sendInternalError, sendGone,
} from '../../utils/response';
import { errorResponseSchema, friendRequestSchema } from '@meeshy/shared/types/api-schemas';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { callerRateKey } from '../../utils/client-rate-key';
import { sendWithETag } from '../../utils/etag';
import { MutationResultGone } from '../../utils/withMutationLog';
import {
  envoyerDemande, repondreDemande, listerDemandes,
  ACTIONS, LIMITE_MAX_DEMANDES,
  type ActionDemande, type DirectionDemande, type Resultat,
} from './friend-requests-core';

/**
 * Le budget quotidien d'envois — distinct du débit par minute.
 *
 * C'est lui qui sépare une sociabilité d'un spam : vingt envois par minute
 * suffisent à qui parcourt une liste de suggestions, et permettraient pourtant
 * d'arroser vingt-huit mille personnes en une journée. CHAQUE envoi pousse une
 * notification, et pour beaucoup un e-mail.
 */
export const BUDGET_ENVOIS_PAR_JOUR = 100;
const FENETRE_BUDGET_SECONDES = 24 * 60 * 60;

/**
 * La CHARGE d'une demande, `conversation` COMPRISE.
 *
 * Le schéma partagé ne la déclare pas — et c'est le défaut : le handler
 * d'acceptation greffait la conversation sur l'objet rendu, que
 * fast-json-stringify supprimait ensuite en silence. Le client acceptait une
 * demande, ne recevait jamais la conversation créée, et devait la rechercher.
 */
const demandeAvecConversationSchema = {
  type: 'object',
  properties: {
    ...friendRequestSchema.properties,
    conversation: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        identifier: { type: 'string' },
        type: { type: 'string' },
      },
    },
    // Les deux gestes qui SUPPRIMENT la ligne (`cancel`, `dismiss`) rendent
    // cet accusé — la même route, deux formes de succès.
    deleted: { type: 'boolean' },
    message: { type: 'string' },
  },
} as const;

const corpsEnvoi = z.object({
  receiverId: z.string().min(1),
  message: z.string().max(200).optional(),
});

const corpsAction = z.object({
  action: z.enum(['accept', 'reject', 'cancel', 'dismiss']),
});

function repondre<T>(reply: FastifyReply, resultat: Resultat<T>): unknown {
  if ('valeur' in resultat) return sendSuccess(reply, resultat.valeur);
  const { code, message } = resultat.refus;
  if (code === 400) return sendBadRequest(reply, message);
  if (code === 409) return sendConflict(reply, message);
  return sendNotFound(reply, message);
}

export { repondre as repondreDemandeHTTP };

/**
 * `/directory/friend-requests` — UN chemin, dans les deux sens (#4162).
 *
 * ## Ce que ces trois routes remplacent
 *
 * Deux familles complètes coexistaient, montées sur le même préfixe, avec des
 * gardes divergentes — et le partage du trafic était INVERSÉ : les clients
 * appelaient les handlers les plus faibles. Trois routes listaient la même
 * chose, plus un fantôme (`GET /friend-requests` sans suffixe) qu'appelaient
 * deux sites web et qui n'a jamais existé : leur `if (response.ok)` avalait le
 * 404, et la page contacts historique affichait une liste vide DÉFINITIVE.
 *
 * Quatre gestes vivaient sur deux verbes et trois routes. Ils sont un seul
 * `PATCH … {action}` : accepter, refuser, annuler, écarter.
 */
export async function directoryFriendRequestsRoutes(fastify: FastifyInstance) {
  const parLecture = createCustomRateLimiter(
    { max: 60, windowMs: 60_000, keyPrefix: 'dir:fr:u', message: 'Trop de requêtes. Patientez une minute.', keyGenerator: callerRateKey },
    fastify.redis ?? undefined
  );
  const parEnvoi = createCustomRateLimiter(
    { max: 20, windowMs: 60_000, keyPrefix: 'dir:fr:send:u', message: 'Trop de demandes envoyées. Patientez une minute.', keyGenerator: callerRateKey },
    fastify.redis ?? undefined
  );
  const parAction = createCustomRateLimiter(
    { max: 60, windowMs: 60_000, keyPrefix: 'dir:fr:act:u', message: 'Trop d\'actions. Patientez une minute.', keyGenerator: callerRateKey },
    fastify.redis ?? undefined
  );

  // ─── Lister ────────────────────────────────────────────────────────────────

  fastify.get('/friend-requests', {
    onRequest: [fastify.authenticate],
    preHandler: [parLecture.middleware()],
    schema: {
      description: 'List friend requests. Replaces the three listings and the phantom GET /friend-requests.',
      tags: ['directory'],
      summary: 'List friend requests',
      querystring: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['received', 'sent', 'any'], default: 'received' },
          status: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'blocked'] },
          q: { type: 'string', description: 'Filter on the other party name — server side' },
          cursor: { type: 'string', description: 'createdAt of the last row of the previous page (ISO)' },
          limit: { type: 'string', description: `1..${LIMITE_MAX_DEMANDES}` },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: friendRequestSchema },
            pagination: {
              type: 'object',
              properties: {
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string', nullable: true },
                limit: { type: 'number' },
              },
            },
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        direction?: DirectionDemande; status?: string; q?: string; cursor?: string; limit?: string;
      };

      const resultat = await listerDemandes(fastify, {
        acteurId: request.user!.userId,
        ...query,
      });

      if ('refus' in resultat) return repondre(reply, resultat);

      const { items, ...pagination } = resultat.valeur;
      const charge = { success: true, data: items, pagination };

      if (sendWithETag(request, reply, charge)) return reply;

      return sendSuccess(reply, items, { pagination } as never);
    } catch (error) {
      logError(fastify.log, 'List friend requests error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // ─── Envoyer ───────────────────────────────────────────────────────────────

  fastify.post('/friend-requests', {
    onRequest: [fastify.authenticate],
    preHandler: [parEnvoi.middleware()],
    schema: {
      description: 'Send a friend request. Carries the union of both former families\' guards, plus the blocking check.',
      tags: ['directory'],
      summary: 'Send friend request',
      body: {
        type: 'object',
        required: ['receiverId'],
        properties: {
          receiverId: { type: 'string' },
          message: { type: 'string', maxLength: 200 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: { success: { type: 'boolean', example: true }, data: friendRequestSchema },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
        410: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = corpsEnvoi.parse(request.body);
      const emetteurId = request.user!.userId;

      if (await budgetEpuise(fastify, emetteurId)) {
        return reply.code(429).send({
          success: false,
          error: 'Budget quotidien de demandes atteint.',
          message: 'Budget quotidien de demandes atteint. Il se réinitialise dans les prochaines heures.',
          code: 'FRIEND_REQUEST_BUDGET_EXCEEDED',
        });
      }

      const resultat = await envoyerDemande(fastify, request, {
        emetteurId,
        receveurId: body.receiverId,
        message: body.message,
      });

      if ('refus' in resultat) return repondre(reply, resultat);

      return sendSuccess(reply, resultat.valeur, { statusCode: 201 });
    } catch (error) {
      // Le cmid a été appliqué mais son résultat n'est plus relisible, et l'op
      // DIVERGE : la rejouer recréerait une ligne que l'auteur a fait
      // disparaître. 410 le dit — le geste a eu lieu, il n'y a rien à refaire.
      if (error instanceof MutationResultGone) {
        return sendGone(reply, 'Friend request already applied, its result is gone', { code: 'MUTATION_RESULT_GONE' });
      }
      if (error instanceof z.ZodError) return sendBadRequest(reply, 'Donnees invalides');

      logError(fastify.log, 'Create friend request error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // ─── Répondre ──────────────────────────────────────────────────────────────

  fastify.patch<{ Params: { id: string } }>('/friend-requests/:id', {
    onRequest: [fastify.authenticate],
    preHandler: [parAction.middleware()],
    schema: {
      description: 'Act on a friend request: accept, reject, cancel or dismiss. Replaces the two PATCH and the DELETE.',
      tags: ['directory'],
      summary: 'Act on a friend request',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['action'],
        properties: { action: { type: 'string', enum: [...ACTIONS] } },
      },
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean', example: true }, data: demandeAvecConversationSchema },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { action } = corpsAction.parse(request.body);

      return repondre(reply, await repondreDemande(fastify, request, {
        acteurId: request.user!.userId,
        demandeId: request.params.id,
        action: action as ActionDemande,
      }));
    } catch (error) {
      if (error instanceof z.ZodError) return sendBadRequest(reply, 'Donnees invalides');

      logError(fastify.log, 'Act on friend request error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  /** Consomme le budget d'envois, et dit si l'appelant l'a épuisé. */
  async function budgetEpuise(instance: FastifyInstance, emetteurId: string): Promise<boolean> {
    const redis = instance.redis;
    // Sans Redis (test, exécution directe), le budget ne s'applique pas :
    // c'est le limiteur par minute qui borne. Dit ici plutôt que subi.
    if (!redis || !emetteurId) return false;

    const cle = `dir:fr:budget:u:${emetteurId}`;
    const total = await redis.incrby(cle, 1);
    if (total === 1) await redis.expire(cle, FENETRE_BUDGET_SECONDES);
    return total > BUDGET_ENVOIS_PAR_JOUR;
  }
}
