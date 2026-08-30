import { validatePagination } from '../utils/pagination';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SecuritySanitizer } from '../utils/sanitize';
import { logError } from '../utils/logger';
import { sendSuccess, sendPaginatedSuccess, sendBadRequest, sendNotFound, sendConflict, sendInternalError, sendGone } from '../utils/response.js';
import type { NotificationService } from '../services/notifications/NotificationService';
import { withMutationLog, MutationResultGone } from '../utils/withMutationLog';
import {
  sendFriendRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { generateCompactConversationIdentifier } from '@meeshy/shared/utils/conversation-helpers';
import { envoyerDemande, repondreDemande, servirParties, INCLUDE_PARTIES } from './directory/friend-requests-core';
import {
  repondreDemandeHTTP,
  creerGardesFriendRequests,
  demandeAvecPresenceSchema,
  demandeAvecConversationSchema,
} from './directory/friend-requests';
import { depreciee } from '../utils/deprecation';

// Schemas de validation
const createFriendRequestSchema = z.object({
  receiverId: z.string(),
  message: z.string().optional()
});

const updateFriendRequestSchema = z.object({
  status: z.enum(['accepted', 'rejected'])
});


/**
 * Le sursis des cinq alias (#4274, #4283).
 *
 * `depuis` est le jour où ce fichier a cessé de diverger SILENCIEUSEMENT de
 * `/directory/friend-requests` : #4162 avait déjà unifié les gardes
 * d'AUTORISATION (qui peut envoyer, accepter, annuler) en les faisant passer
 * par le même cœur (`friend-requests-core.ts`), mais ni le débit, ni le
 * budget quotidien, ni la forme de réponse ne l'étaient — un correctif posé
 * côté `directory` (le budget anti-spam, `conversation` servie à
 * l'acceptation, `lastActiveAt` gardée) laissait CETTE adresse intacte,
 * exactement le défaut que #4283 ferme.
 *
 * Aucun `retraitLe` : la règle de retrait est gouvernée par le compteur
 * d'adoption de #4275, jamais par une date posée en dur ici. Android appelle
 * encore les CINQ routes (`FriendRepository.kt` → `ContactsViewModel.kt`,
 * `DiscoverViewModel.kt`), iOS deux (`FriendService.receivedRequests` /
 * `.sentRequests`) : une date inventée ferait échouer un geste que
 * l'utilisateur croit accompli.
 */
const DEPUIS_ALIAS_FRIENDS = '2026-08-29';

/** Le successeur d'une route PAR ID porte l'id RÉSOLU, jamais le gabarit `:id`. */
const successeurDemandeCiblee = (request: FastifyRequest): string =>
  `/api/v1/directory/friend-requests/${encodeURIComponent((request.params as { id: string }).id)}`;

const ANNONCE_ALIAS_FRIENDS = {
  envoyer: { depuis: DEPUIS_ALIAS_FRIENDS, successeur: '/api/v1/directory/friend-requests' },
  recues: { depuis: DEPUIS_ALIAS_FRIENDS, successeur: '/api/v1/directory/friend-requests?direction=received' },
  envoyees: { depuis: DEPUIS_ALIAS_FRIENDS, successeur: '/api/v1/directory/friend-requests?direction=sent' },
  agir: { depuis: DEPUIS_ALIAS_FRIENDS, successeur: successeurDemandeCiblee },
} as const;

export async function friendRequestRoutes(fastify: FastifyInstance) {
  // Les MÊMES gardes d'abus que `/directory/friend-requests` (#4283) — pas des
  // jumelles redéclarées : même usine, même `keyPrefix` par garde, donc même
  // compteur Redis par acteur quelle que soit l'adresse par laquelle il est
  // passé. Avant ce lot, cette adresse — la plus APPELÉE des deux, cf.
  // commentaire du POST — n'appliquait NI débit NI budget quotidien : le
  // plafond posé côté `directory` ne protégeait rien tant qu'un appelant
  // pouvait le contourner en alternant les deux adresses.
  const { parLecture, parEnvoi, parAction, budgetEpuise } = creerGardesFriendRequests(fastify);

  // Envoyer une demande d'ami
  fastify.post('/friend-requests', {
    onRequest: [depreciee(ANNONCE_ALIAS_FRIENDS.envoyer), fastify.authenticate],
    preHandler: [parEnvoi.middleware()],
    schema: {
      deprecated: true,
      description: 'DEPRECATED — use POST /directory/friend-requests, which shares this route\'s guards, rate limit and daily budget (#4283). Send a friend request to another user. Creates a pending friend request and notifies the recipient with action buttons to accept or reject the request.',
      tags: ['friends'],
      summary: 'Send friend request (deprecated)',
      body: sendFriendRequestSchema,
      response: {
        201: {
          description: 'Friend request sent successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: demandeAvecPresenceSchema
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
        429: {
          description: 'Rate limit or daily budget exceeded',
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

      // Le BUDGET quotidien (#4283) — partagé par `keyPrefix` avec
      // `/directory/friend-requests` : il ne se contourne plus en alternant
      // les deux adresses (cf. doc-comment de `creerGardesFriendRequests`).
      if (await budgetEpuise(request.user!.userId)) {
        return reply.code(429).send({
          success: false,
          error: 'Budget quotidien de demandes atteint.',
          message: 'Budget quotidien de demandes atteint. Il se réinitialise dans les prochaines heures.',
          code: 'FRIEND_REQUEST_BUDGET_EXCEEDED',
        });
      }

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
    onRequest: [depreciee(ANNONCE_ALIAS_FRIENDS.recues), fastify.authenticate],
    preHandler: [parLecture.middleware()],
    schema: {
      deprecated: true,
      description: 'DEPRECATED — use GET /directory/friend-requests?direction=received, which paginates by cursor and shares this route\'s presence gate (#4283). Get all pending friend requests received by the authenticated user. Returns paginated list of requests with sender information.',
      tags: ['friends'],
      summary: 'Get received friend requests (deprecated)',
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
              items: demandeAvecPresenceSchema
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
        429: {
          description: 'Rate limited',
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
          // `INCLUDE_PARTIES.sender` (#4283) — la MÊME projection que la
          // route canonique, plutôt qu'un `select` local qui charge cinq
          // colonnes et OUBLIE `isOnline`/`lastActiveAt`. Avant ce lot, la
          // requête ne les demandait même pas : le schéma de réponse pouvait
          // bien les DÉCLARER, elles restaient absentes de la ligne Prisma —
          // exactement le défaut « correctif appliqué à `directory`, laissé
          // intact ici » que #4283 ferme, une couche plus bas que le schéma.
          where: whereClause,
          include: { sender: INCLUDE_PARTIES.sender },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.friendRequest.count({ where: whereClause })
      ]);

      // La loi de présence (#4283) — le MÊME gate que `directory`
      // (`servirParties`), sans lequel `isOnline`/`lastActiveAt` sortiraient
      // BRUTS pour un expéditeur qui n'est pas encore un ami accepté :
      // exactement la fuite que la directive du 2026-08-25 interdit.
      const servedRequests = await servirParties(
        fastify, request, friendRequests as unknown as Array<Record<string, unknown>>
      );

      return sendPaginatedSuccess(reply, servedRequests, {
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
    onRequest: [depreciee(ANNONCE_ALIAS_FRIENDS.envoyees), fastify.authenticate],
    preHandler: [parLecture.middleware()],
    schema: {
      deprecated: true,
      description: 'DEPRECATED — use GET /directory/friend-requests?direction=sent, which paginates by cursor and shares this route\'s presence gate (#4283). Get all friend requests sent by the authenticated user. Returns paginated list of requests with receiver information, including pending, accepted, and rejected requests.',
      tags: ['friends'],
      summary: 'Get sent friend requests (deprecated)',
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
              items: demandeAvecPresenceSchema
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
        429: {
          description: 'Rate limited',
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
          // `INCLUDE_PARTIES.receiver` — même raison que GET .../received
          // ci-dessus : projection PARTAGÉE avec la route canonique (#4283).
          where: whereClause,
          include: { receiver: INCLUDE_PARTIES.receiver },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.friendRequest.count({ where: whereClause })
      ]);

      // La loi de présence (#4283) — voir le commentaire jumeau de GET
      // .../received.
      const servedRequests = await servirParties(
        fastify, request, friendRequests as unknown as Array<Record<string, unknown>>
      );

      return sendPaginatedSuccess(reply, servedRequests, {
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
    onRequest: [depreciee(ANNONCE_ALIAS_FRIENDS.agir), fastify.authenticate],
    preHandler: [parAction.middleware()],
    schema: {
      deprecated: true,
      description: 'DEPRECATED — use PATCH /directory/friend-requests/:id with {action}: accepted status→accept, rejected→reject (#4283). Also fixes a silent gap: this route used to strip `conversation` from an acceptance response — it is served now, like the canonical route. Respond to a friend request by accepting or rejecting it. When accepted, creates a direct conversation between users. Automatically marks the friend request notification as read and sends a notification to the requester.',
      tags: ['friends'],
      summary: 'Respond to friend request (deprecated)',
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
            data: demandeAvecConversationSchema
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
        429: {
          description: 'Rate limited',
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
    onRequest: [depreciee(ANNONCE_ALIAS_FRIENDS.agir), fastify.authenticate],
    preHandler: [parAction.middleware()],
    schema: {
      deprecated: true,
      description: 'DEPRECATED — use PATCH /directory/friend-requests/:id with {action: "dismiss"} (#4283). Delete a friend request. Can be used by either the sender to cancel a sent request or the receiver to remove a received request without responding.',
      tags: ['friends'],
      summary: 'Delete friend request (deprecated)',
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
        429: {
          description: 'Rate limited',
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
