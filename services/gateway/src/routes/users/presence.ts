import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { sendSuccess, sendBadRequest, sendInternalError } from '../../utils/response';
import { viewerFromAuthContext } from './presence-gate';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';

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
      const participantIds = new Set(participants.map(p => p.id));

      // Gate de présence sur les utilisateurs enregistrés (critère strict :
      // soi / ami accepté / administrateur global — voir
      // packages/shared/utils/presence-visibility.ts).
      const viewer = viewerFromAuthContext(
        (request as FastifyRequest & {
          authContext?: { type?: string; userId?: string; registeredUser?: { role?: string } | null };
        }).authContext,
      );
      const viewerIsGlobalAdmin = !!viewer && isGlobalAdmin(viewer.role);
      const visibilityMap = await getPresenceVisibilityService(fastify.prisma).resolveForTargets(
        viewer,
        users.map(u => u.id),
      );

      const responseUsers = ids.map(id => {
        const vis = visibilityMap.get(id);
        if (!vis) {
          // Id non résolu à un utilisateur enregistré. Un participant anonyme
          // n'a ni ami ni administrateur qui le "connaît" en dehors du fil où
          // il écrit — sa présence reste masquée, sauf pour un administrateur
          // global (directive produit 2026-08-25 : « personne ne doit savoir
          // ma dernière connexion si on n'est pas ami » — un anonyme n'est
          // jamais ami).
          if (participantIds.has(id) && !viewerIsGlobalAdmin) {
            return { userId: id, isOnline: false, lastActiveAt: null };
          }
          return { userId: id, isOnline: presenceMap.get(id) ?? false, lastActiveAt: lastActiveMap.get(id) ?? null };
        }
        return {
          userId: id,
          isOnline: vis.showOnline ? (presenceMap.get(id) ?? false) : false,
          lastActiveAt: vis.showLastSeenTimestamp ? (lastActiveMap.get(id) ?? null) : null,
        };
      });

      return sendSuccess(reply, { users: responseUsers });
    } catch (error) {
      fastify.log.error({ error }, '[users/presence] Failed to resolve presence');
      return sendInternalError(reply, 'Failed to resolve presence');
    }
  });
}
