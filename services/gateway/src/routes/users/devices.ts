import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { buildPaginationMeta } from '../../utils/pagination';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendSuccess, sendPaginatedSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendForbidden, sendInternalError } from '../../utils/response.js';

const logger = enhancedLogger.child({ module: 'UserDevicesRoutes' });
import {
  userMinimalSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import type { AuthenticatedRequest, IdParams, FriendRequestBody, FriendRequestActionBody, UserIdParams, AffiliateTokenData } from './types';
import type { NotificationService } from '../../services/notifications/NotificationService';
import type { EmailService } from '../../services/EmailService';
import { validatePagination } from '../../utils/pagination';
import { generateCompactConversationIdentifier } from '@meeshy/shared/utils/conversation-helpers';
import { servirParties } from '../directory/friend-requests-core';

/**
 * Bloc `pagination` de la réponse de `GET /users/friend-requests`.
 * Exporté pour qu'un test puisse traverser la sérialisation réelle :
 * fast-json-stringify supprime tout champ non déclaré ici.
 */
export const friendRequestsPaginationSchema = {
  type: 'object',
  properties: {
    total: { type: 'number' },
    offset: { type: 'number' },
    limit: { type: 'number' },
    hasMore: { type: 'boolean' }
  }
} as const;

// #4254 — le gate de présence des deux parties d'une demande n'a plus qu'UN
// site : `servirParties` (`routes/directory/friend-requests-core.ts`). Ce
// module en portait une SECONDE copie, `gateFriendRequestPresence`, qui disait
// la même loi avec ses propres mots — une règle retapée à chaque site est une
// règle qu'un site finira par ne pas avoir.

/**
 * Get all friend requests for authenticated user
 */
export async function getFriendRequests(fastify: FastifyInstance) {
  fastify.get('/users/friend-requests', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all friend requests for the authenticated user. Returns both sent and received requests with full user details.',
      tags: ['users', 'friends'],
      summary: 'Get friend requests',
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', default: '0', description: 'Pagination offset' },
          limit: { type: 'string', default: '20', description: 'Results per page (max 100)' },
          // Le budget `limit` est PARTAGÉ par les deux sens et tous les statuts.
          // Sans ce filtre, une liste d'amis se fait évincer par des demandes
          // en attente ou refusées (spec 2026-08-19, S.2).
          status: { type: 'string', enum: ['pending', 'accepted', 'rejected'], description: 'Filtre de statut' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  senderId: { type: 'string' },
                  receiverId: { type: 'string' },
                  status: { type: 'string', enum: ['pending', 'accepted', 'rejected'] },
                  createdAt: { type: 'string', format: 'date-time' },
                  // `lastActiveAt` est CHARGÉ et GATÉ par `servirParties` ;
                  // `userMinimalSchema` seul le SUPPRIMAIT à la sérialisation.
                  sender: { ...userMinimalSchema, properties: { ...userMinimalSchema.properties, lastActiveAt: { type: 'string', format: 'date-time', nullable: true } } },
                  receiver: { ...userMinimalSchema, properties: { ...userMinimalSchema.properties, lastActiveAt: { type: 'string', format: 'date-time', nullable: true } } }
                }
              }
            },
            pagination: friendRequestsPaginationSchema
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const userId = authContext.userId;
      const { offset = '0', limit = '20', status } = request.query as { offset?: string; limit?: string; status?: string };

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      const whereClause = {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ],
        ...(status ? { status } : {})
      };

      const [friendRequests, totalCount] = await Promise.all([
        fastify.prisma.friendRequest.findMany({
          where: whereClause,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true,
                isOnline: true,
                lastActiveAt: true
              }
            },
            receiver: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true,
                isOnline: true,
                lastActiveAt: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.friendRequest.count({ where: whereClause })
      ]);

      // Gate de présence : cette route est un ANNUAIRE DE PERSONNES (la liste
      // d'amis, c'est `?status=accepted`), et ses profils inline sortaient avec
      // `isOnline`/`lastActiveAt` bruts. Critère STRICT — même régime que
      // `/users/search` et le carnet d'adresses. Une amitié acceptée ne suffit
      // pas : la politique partagée masque quand même la présence d'un ami qui
      // a coupé `showOnlineStatus`, et le blocage comme la désactivation de
      // compte se résolvent ici et nulle part ailleurs.
      const gated = await servirParties(fastify, request, friendRequests as unknown as Record<string, unknown>[]);

      return sendPaginatedSuccess(reply, gated, buildPaginationMeta(totalCount, offsetNum, limitNum, gated.length));
    } catch (error) {
      logger.error('Error retrieving friend requests', error as Error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * Send a friend request
 */
/**
 * `POST /users/friend-requests` et `PATCH /users/friend-requests/:id` sont
 * SUPPRIMÉES (#4162).
 *
 * C'étaient les jumelles ORPHELINES d'une famille complète : montées sur le
 * même préfixe que `routes/friends.ts`, avec des gardes divergentes, et
 * appelées par PERSONNE — ni iOS, ni le web, ni Android. Leur seule garde qui
 * manquait à leur jumelle vivante — le refus d'auto-envoi — a été RÉCUPÉRÉE
 * dans `directory/friend-requests-core.ts` avant ce retrait, avec le contrôle
 * de désactivation et celui de blocage, qui n'existaient dans aucune des deux.
 *
 * Une garde qui vit dans un handler que personne n'appelle ne protège personne.
 */


/**
 * Get active affiliate token for user
 */
export async function getAffiliateToken(fastify: FastifyInstance) {
  fastify.get('/users/:userId/affiliate-token', {
    // Route publique jusqu'ici : n'importe qui énumérait les jetons
    // d'affiliation actifs de tous les utilisateurs, sans limitation de débit.
    // Combinée à /affiliate/register, elle permettait de forger des relations
    // de parrainage à la chaîne.
    onRequest: [(req: FastifyRequest, rep: FastifyReply) => fastify.authenticate(req, rep)],
    schema: {
      description: 'Get the active affiliate token for a user. Used for automatic affiliation via /join links. Returns the most recent active token that has not expired.',
      tags: ['users', 'affiliate'],
      summary: 'Get user affiliate token',
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'User ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              nullable: true,
              properties: {
                token: { type: 'string', description: 'Active affiliate token' }
              }
            }
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params as UserIdParams;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      const affiliateToken = await fastify.prisma.affiliateToken.findFirst({
        where: {
          createdBy: userId,
          isActive: true,
          OR: [
            { expiresAt: { isSet: false } },
            { expiresAt: { equals: null } },
            { expiresAt: { gt: new Date() } }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          token: true
        }
      });

      return sendSuccess(reply, affiliateToken ? { token: affiliateToken.token } : null);
    } catch (error) {
      logger.error('Error fetching affiliate token', error as Error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}


// Les trois routes « to be implemented » ont été RETIRÉES (#4185).
//
// `GET /users`, `PUT /users/:id` et `DELETE /users/:id` rendaient chacune
// `{ message: '… - to be implemented' }` — en **200, sans aucune garde**
// (mesuré en intégration). Leur description Swagger annonçait pourtant
// « Admin-only endpoint » pour les deux dernières : le contrat publié
// déclarait une restriction que le code n'appliquait pas, prête à devenir une
// vraie fuite le jour où quelqu'un les implémenterait.
//
// Un stub qui répond 200 est pire qu'une route absente : il fait croire à un
// contrat. Le seul appelant du dépôt — le repli de la liste de contacts du web
// — recevait un objet là où il attendait un tableau, et n'a donc JAMAIS
// affiché personne.
