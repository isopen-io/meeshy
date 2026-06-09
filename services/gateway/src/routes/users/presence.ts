import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess, sendBadRequest } from '../../utils/response';

/**
 * GET /users/presence?ids=id1,id2,id3
 *
 * Retourne le statut runtime (depuis la `connectedUsers` Map du SocketIOManager) pour
 * une liste d'ids fournie. Utilisé par les clients pour resync la présence après un
 * reconnect, un retour de focus tab, ou un changement de connectivité — sans attendre
 * un event `presence:snapshot` qui ne se déclenche qu'à l'auth socket.
 *
 * Limites :
 * - Max 200 ids par requête (limite anti-abus, suffisant pour les listes de conversations)
 * - Auth requise (Bearer JWT ou X-Session-Token)
 * - `lastActiveAt` lu en best-effort depuis la DB, retourné null si absent
 */
export async function getUsersPresence(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { ids?: string } }>('/users/presence', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get runtime presence status for a list of userIds/participantIds',
      tags: ['users'],
      summary: 'Get users presence',
      querystring: {
        type: 'object',
        properties: {
          ids: { type: 'string', description: 'Comma-separated list of userIds or participantIds' }
        },
        required: ['ids']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                users: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      userId: { type: 'string' },
                      isOnline: { type: 'boolean' },
                      lastActiveAt: { type: ['string', 'null'], format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { ids?: string } }>, reply: FastifyReply) => {
    try {
      const raw = (request.query.ids || '').trim();
      if (!raw) {
        return sendBadRequest(reply, 'Query param "ids" is required');
      }

      const ids: string[] = Array.from(new Set(
        raw.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      ));

      if (ids.length === 0) {
        return sendSuccess(reply, { users: [] });
      }

      if (ids.length > 200) {
        return sendBadRequest(reply, 'Max 200 ids per request');
      }

      const presenceChecker = fastify.presenceChecker;

      if (!presenceChecker) {
        // Service non encore monté (boot phase). Renvoyer tout false plutôt que 500.
        return sendSuccess(reply, {
          users: ids.map(id => ({ userId: id, isOnline: false, lastActiveAt: null }))
        });
      }

      const presenceMap = presenceChecker.bulk(ids);

      // Best-effort lookup de lastActiveAt en DB (users + participants anonymes)
      const [users, participants] = await Promise.all([
        fastify.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, lastActiveAt: true }
        }),
        fastify.prisma.participant.findMany({
          where: { id: { in: ids }, type: 'anonymous' },
          select: { id: true, lastActiveAt: true }
        })
      ]);

      const lastActiveMap = new Map<string, Date | null>();
      for (const u of users) lastActiveMap.set(u.id, u.lastActiveAt);
      for (const p of participants) lastActiveMap.set(p.id, p.lastActiveAt);

      const responseUsers = ids.map(id => ({
        userId: id,
        isOnline: presenceMap.get(id) ?? false,
        lastActiveAt: lastActiveMap.get(id) ?? null
      }));

      return sendSuccess(reply, { users: responseUsers });
    } catch (error) {
      fastify.log.error({ error }, '[users/presence] Failed to resolve presence');
      reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve presence' }
      });
    }
  });
}
