import { validatePagination } from '../utils/pagination';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SecuritySanitizer } from '../utils/sanitize';
import { logError } from '../utils/logger';
import { sendSuccess, sendPaginatedSuccess, sendBadRequest, sendNotFound, sendConflict, sendInternalError, sendGone } from '../utils/response.js';
import type { NotificationService } from '../services/notifications/NotificationService';
import { withMutationLog, MutationResultGone } from '../utils/withMutationLog';
import {
  friendRequestSchema,
  sendFriendRequestSchema,
  respondFriendRequestSchema,
  userMinimalSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { generateCompactConversationIdentifier } from '@meeshy/shared/utils/conversation-helpers';
import { envoyerDemande, repondreDemande } from './directory/friend-requests-core';
import { repondreDemandeHTTP } from './directory/friend-requests';

// Schemas de validation
const createFriendRequestSchema = z.object({
  receiverId: z.string(),
  message: z.string().optional()
});

const updateFriendRequestSchema = z.object({
  status: z.enum(['accepted', 'rejected'])
});


export async function friendRequestRoutes(fastify: FastifyInstance) {
  // Envoyer une demande d'ami
  fastify.post('/friend-requests', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Send a friend request to another user. Creates a pending friend request and notifies the recipient with action buttons to accept or reject the request.',
      tags: ['friends'],
      summary: 'Send friend request',
      body: sendFriendRequestSchema,
      response: {
        201: {
          description: 'Friend request sent successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: friendRequestSchema
          }
        },
        400: {
          description: 'Invalid request data',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Target user not found',
          ...errorResponseSchema
        },
        409: {
          description: 'Friend request already exists between users',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createFriendRequestSchema.parse(request.body);

      // ALIAS de `POST /directory/friend-requests` (#4162).
      //
      // Ce handler était le plus APPELÉ et le plus FAIBLE des deux qui
      // coexistaient : ni garde d'auto-envoi, ni contrôle de blocage, ni
      // contrôle de désactivation, et un `findUnique` SANS `select` qui
      // chargeait la ligne utilisateur entière — mot de passe haché compris —
      // pour tester une existence. Son jumeau orphelin avait au moins la
      // première, et personne ne l'appelait.
      //
      // Il porte désormais l'union des gardes des deux familles, plus le
      // blocage, qui n'existait dans aucune.
      const resultat = await envoyerDemande(fastify, request, {
        emetteurId: request.user!.userId,
        receveurId: body.receiverId,
        message: body.message,
      });

      if ('refus' in resultat) return repondreDemandeHTTP(reply, resultat);

      return sendSuccess(reply, resultat.valeur, { statusCode: 201 });

    } catch (error) {
      // Le cmid a bien été appliqué, mais son résultat n'est plus relisible
      // (contenu supprimé, expiré, ou hors de la tranche ACL du lecteur) et
      // l'op DIVERGE — la rejouer recréerait une ligne que l'auteur a fait
      // disparaître. 410 le dit exactement : le geste a eu lieu, il n'y a
      // rien à refaire.
      if (error instanceof MutationResultGone) {
        return sendGone(reply, 'Friend request already applied, its result is gone', { code: 'MUTATION_RESULT_GONE' });
      }
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Donnees invalides');
      }

      logError(fastify.log, 'Create friend request error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // Recuperer les demandes d'ami recues
  fastify.get('/friend-requests/received', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all pending friend requests received by the authenticated user. Returns paginated list of requests with sender information.',
      tags: ['friends'],
      summary: 'Get received friend requests',
      querystring: {
        type: 'object',
        properties: {
          offset: {
            type: 'string',
            description: 'Pagination offset',
            default: '0'
          },
          limit: {
            type: 'string',
            description: 'Number of items per page (max 100)',
            default: '20'
          }
        }
      },
      response: {
        200: {
          description: 'List of received friend requests',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: friendRequestSchema
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number', description: 'Total number of requests' },
                limit: { type: 'number', description: 'Items per page' },
                offset: { type: 'number', description: 'Current offset' },
                hasMore: { type: 'boolean', description: 'Whether more items exist' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.userId;
      /* istanbul ignore next -- Fastify AJV applies schema defaults before handler runs */
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      const whereClause = { receiverId: userId, status: 'pending' as const };

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
                avatar: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.friendRequest.count({ where: whereClause })
      ]);

      return sendPaginatedSuccess(reply, friendRequests, {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + friendRequests.length < totalCount
      });

    } catch (error) {
      logError(fastify.log, 'Get received friend requests error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // Recuperer les demandes d'ami envoyees
  fastify.get('/friend-requests/sent', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all friend requests sent by the authenticated user. Returns paginated list of requests with receiver information, including pending, accepted, and rejected requests.',
      tags: ['friends'],
      summary: 'Get sent friend requests',
      querystring: {
        type: 'object',
        properties: {
          offset: {
            type: 'string',
            description: 'Pagination offset',
            default: '0'
          },
          limit: {
            type: 'string',
            description: 'Number of items per page (max 100)',
            default: '20'
          }
        }
      },
      response: {
        200: {
          description: 'List of sent friend requests',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: friendRequestSchema
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number', description: 'Total number of requests' },
                limit: { type: 'number', description: 'Items per page' },
                offset: { type: 'number', description: 'Current offset' },
                hasMore: { type: 'boolean', description: 'Whether more items exist' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user!.userId;
      /* istanbul ignore next -- Fastify AJV applies schema defaults before handler runs */
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      const whereClause = { senderId: userId };

      const [friendRequests, totalCount] = await Promise.all([
        fastify.prisma.friendRequest.findMany({
          where: whereClause,
          include: {
            receiver: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.friendRequest.count({ where: whereClause })
      ]);

      return sendPaginatedSuccess(reply, friendRequests, {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + friendRequests.length < totalCount
      });

    } catch (error) {
      logError(fastify.log, 'Get sent friend requests error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // Repondre a une demande d'ami
  fastify.patch('/friend-requests/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Respond to a friend request by accepting or rejecting it. When accepted, creates a direct conversation between users. Automatically marks the friend request notification as read and sends a notification to the requester.',
      tags: ['friends'],
      summary: 'Respond to friend request',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Friend request ID'
          }
        }
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['accepted', 'rejected'],
            description: 'Response action'
          }
        }
      },
      response: {
        200: {
          description: 'Friend request response processed successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: friendRequestSchema
          }
        },
        400: {
          description: 'Invalid request data',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Friend request not found or already processed',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateFriendRequestSchema.parse(request.body);

      // ALIAS de `PATCH /directory/friend-requests/:id` (#4162), dont le corps
      // porte une ACTION plutôt qu'un statut. Les deux mots disent le même
      // geste ; celui de la route canonique en couvre quatre — accepter,
      // refuser, annuler, écarter — là où celui-ci n'en dit que deux.
      return repondreDemandeHTTP(reply, await repondreDemande(fastify, request, {
        acteurId: request.user!.userId,
        demandeId: id,
        action: body.status === 'accepted' ? 'accept' : 'reject',
      }));

    } catch (error) {
      /* istanbul ignore next -- AJV enforces enum['accepted','rejected'] before handler runs */
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Donnees invalides');
      }

      logError(fastify.log, 'Update friend request error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  // Supprimer une demande d'ami
  fastify.delete('/friend-requests/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete a friend request. Can be used by either the sender to cancel a sent request or the receiver to remove a received request without responding.',
      tags: ['friends'],
      summary: 'Delete friend request',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Friend request ID'
          }
        }
      },
      response: {
        200: {
          description: 'Friend request deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Demande d\'ami supprimee' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Friend request not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      // ALIAS de `PATCH /directory/friend-requests/:id` avec `action=cancel`
      // (#4162) : un geste, un verbe. Ce `DELETE` et les deux `PATCH`
      // exprimaient quatre gestes sur trois routes.
      //
      // `cancel` est le geste de l'ÉMETTEUR ; `dismiss` celui de l'un ou
      // l'autre. Cette adresse n'en distinguait aucun — elle acceptait les deux
      // parties — donc c'est `dismiss` qui la traduit fidèlement.
      const resultat = await repondreDemande(fastify, request, {
        acteurId: request.user!.userId,
        demandeId: id,
        action: 'dismiss',
      });

      if ('refus' in resultat) return repondreDemandeHTTP(reply, resultat);

      // La forme HISTORIQUE : `{ message }` seul, ce que le schéma déclare.
      return sendSuccess(reply, { message: 'Demande d\'ami supprimee' });

    } catch (error) {
      logError(fastify.log, 'Delete friend request error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
