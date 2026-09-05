import { validatePagination } from '../utils/pagination';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SecuritySanitizer } from '../utils/sanitize';
import { logError } from '../utils/logger';
import { sendSuccess, sendBadRequest, sendNotFound, sendConflict, sendInternalError, sendGone } from '../utils/response.js';
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
import { apiPath } from '@meeshy/shared/api/prefix';
import type { CursorPaginationMeta, PaginationMeta } from '@meeshy/shared/types';
import {
  cursorPage,
  cursorPaginationSchema,
  cursorQuery,
  cursorQueryProperty,
  encodePageCursor,
  type CursorSort,
} from '../utils/cursor-pagination';

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

/**
 * L'ordre TOTAL des deux listes — DÉCLARÉ une fois, et ce que le curseur encode
 * (#4175).
 *
 * `id` en second rang n'est pas décoratif : la route canonique
 * (`friend-requests-core.listerDemandes`) borne par `{ createdAt: { lt } }` SEUL,
 * si bien que deux demandes nées dans la même milliseconde que la dernière ligne
 * servie sont TOUTES LES DEUX jetées de la page suivante. La loi partagée dérive
 * de cette déclaration l'`orderBy`, la clause de reprise ET la signature inscrite
 * dans le jeton, donc les trois ne peuvent plus diverger.
 */
const ORDRE_DEMANDES: CursorSort = [
  { field: 'createdAt', direction: 'desc', kind: 'date' },
  { field: 'id', direction: 'desc', kind: 'string' },
];

/**
 * Le fragment de `querystring` des deux listes — un seul, pour deux adresses qui
 * répondent à la même question dans deux directions.
 *
 * `offset` n'a PLUS de `default` (#4175), et c'est ce qui rend la forme
 * choisissable : Fastify active `useDefaults` d'AJV, donc un `default` ÉCRIT la
 * valeur dans `request.query` avant le handler, qui ne peut alors plus
 * distinguer « rang non demandé » de « rang zéro ». Avec le `default: '0'` qui
 * vivait ici, chaque première page repayait un `count()` complet, y compris pour
 * un client qui n'a jamais demandé de rang.
 */
const QUERY_LISTE_DEMANDES = {
  type: 'object',
  properties: {
    offset: {
      type: 'string',
      description:
        'DEPRECATED — rank-based pagination. A rank skips rows when the list moves between two pages; use cursor. Absent = the page is served by cursor.',
    },
    limit: {
      type: 'string',
      description: 'Number of items per page (max 100)',
      default: '20',
    },
    cursor: cursorQueryProperty,
  },
} as const;

type QueryListeDemandes = { offset?: string; limit?: string; cursor?: string };

/**
 * UNE page de demandes — la même loi pour les deux directions.
 *
 * ## Qui gagne quand `cursor` et `offset` arrivent ensemble
 *
 * La forme est choisie par la PRÉSENCE de `cursor`, jamais par sa lisibilité :
 * un rang et une ancre ne décrivent pas la même fenêtre, et arbitrer entre les
 * deux dans une seule réponse servirait un rang que l'appelant n'entendait pas
 * comme un point de reprise. Un curseur ILLISIBLE reste donc une page au
 * curseur — la première. C'est le repli du reste du dépôt : refuser couperait le
 * défilement sur une erreur que le lecteur ne peut pas réparer.
 *
 * `offset` ABSENT vaut « sers-moi au curseur », ce qui retire le `count()` du
 * chemin nominal dès la PREMIÈRE page. Android envoie aujourd'hui les deux
 * adresses avec un `offset` explicite (`FriendRepository.kt`) et iOS de même
 * (`FriendService.receivedRequests` / `.sentRequests`) : ils restent servis
 * exactement comme avant, et le jour où l'un cesse d'envoyer le rang il gagne la
 * forme keyset sans changement de serveur.
 *
 * ## Le curseur pagine la collection RENDUE
 *
 * `servirParties` MASQUE des champs de présence, il ne retire aucune ligne : la
 * ligne lue est la ligne servie, et le curseur est frappé sur la ligne BRUTE —
 * faire dépendre la pagination d'une projection filtrée est exactement ce qui
 * produit, ailleurs dans le dépôt, des pages vides que le client doit compenser
 * à la main.
 */
async function servirPageDemandes(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  options: { where: Record<string, unknown>; include: Record<string, unknown> }
): Promise<unknown> {
  const { offset, limit, cursor } = request.query as QueryListeDemandes;
  const { offset: rang, limit: taille } = validatePagination(offset ?? '0', limit);

  const servirParRang = cursor === undefined && offset !== undefined;
  const requete = cursorQuery({ sort: ORDRE_DEMANDES, cursor, limit: taille, where: options.where });

  const [lignes, total] = await Promise.all([
    fastify.prisma.friendRequest.findMany({
      where: servirParRang ? options.where : requete.where,
      include: options.include,
      orderBy: requete.orderBy,
      // Une ligne SONDE au curseur : elle dit `hasMore` sans compter la table.
      take: servirParRang ? taille : requete.take,
      ...(servirParRang ? { skip: rang } : {}),
    }),
    servirParRang
      ? fastify.prisma.friendRequest.count({ where: options.where })
      : Promise.resolve(0),
  ]);

  // La loi de présence (#4283) — le MÊME gate que `directory` (`servirParties`),
  // sans lequel `isOnline`/`lastActiveAt` sortiraient BRUTS pour une partie qui
  // n'est pas encore un ami accepté.
  const servir = (rows: readonly Record<string, unknown>[]) =>
    servirParties(fastify, request, rows as Array<Record<string, unknown>>);

  if (servirParRang) {
    const hasMore = rang + lignes.length < total;
    const derniere = lignes[lignes.length - 1];
    const pagination: PaginationMeta & CursorPaginationMeta = {
      total,
      limit: taille,
      offset: rang,
      hasMore,
      // Le rang rend MALGRÉ TOUT un curseur : c'est la rampe de migration. Un
      // client démarre sur la page 1 (dont il veut le total) et passe au curseur
      // pour la suite, sans jamais redemander la même page.
      nextCursor: hasMore && derniere ? encodePageCursor(ORDRE_DEMANDES, derniere) : null,
      form: 'offset',
    };
    return sendSuccess(reply, await servir(lignes), { pagination });
  }

  const servie = cursorPage({ sort: ORDRE_DEMANDES, rows: lignes, limit: taille });
  return sendSuccess(reply, await servir(servie.page), { pagination: servie.pagination });
}

/** Le successeur d'une route PAR ID porte l'id RÉSOLU, jamais le gabarit `:id`. */
const successeurDemandeCiblee = (request: FastifyRequest): string =>
  `${apiPath('/directory/friend-requests')}/${encodeURIComponent((request.params as { id: string }).id)}`;

const ANNONCE_ALIAS_FRIENDS = {
  envoyer: { depuis: DEPUIS_ALIAS_FRIENDS, successeur: apiPath('/directory/friend-requests') },
  recues: { depuis: DEPUIS_ALIAS_FRIENDS, successeur: apiPath('/directory/friend-requests?direction=received') },
  envoyees: { depuis: DEPUIS_ALIAS_FRIENDS, successeur: apiPath('/directory/friend-requests?direction=sent') },
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
      querystring: QUERY_LISTE_DEMANDES,
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
            // Le fragment PARTAGÉ (#4175) : `fast-json-stringify` retire toute
            // clé qu'aucun schéma ne déclare, donc un `nextCursor` ou un `form`
            // calculés mais non déclarés seraient jetés au dernier mètre.
            pagination: cursorPaginationSchema
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
      // `INCLUDE_PARTIES.sender` (#4283) — la MÊME projection que la route
      // canonique, plutôt qu'un `select` local qui charge cinq colonnes et
      // OUBLIE `isOnline`/`lastActiveAt`.
      return await servirPageDemandes(fastify, request, reply, {
        where: { receiverId: request.user!.userId, status: 'pending' as const },
        include: { sender: INCLUDE_PARTIES.sender },
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
      querystring: QUERY_LISTE_DEMANDES,
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
            // Le fragment PARTAGÉ (#4175) : `fast-json-stringify` retire toute
            // clé qu'aucun schéma ne déclare, donc un `nextCursor` ou un `form`
            // calculés mais non déclarés seraient jetés au dernier mètre.
            pagination: cursorPaginationSchema
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
      // `INCLUDE_PARTIES.receiver` — même raison que GET .../received :
      // projection PARTAGÉE avec la route canonique (#4283).
      return await servirPageDemandes(fastify, request, reply, {
        where: { senderId: request.user!.userId },
        include: { receiver: INCLUDE_PARTIES.receiver },
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
