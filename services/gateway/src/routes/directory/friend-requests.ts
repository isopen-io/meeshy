import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import {
  sendSuccess, sendBadRequest, sendNotFound, sendConflict, sendInternalError, sendGone,
} from '../../utils/response';
import { errorResponseSchema, friendRequestSchema, userMinimalSchema } from '@meeshy/shared/types/api-schemas';
import { createCustomRateLimiter, type RateLimiter } from '../../utils/rate-limiter.js';
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
 * La partie d'une demande, PRÉSENCE COMPRISE — déclarée ICI, pas dans le schéma
 * partagé.
 *
 * `userMinimalSchema` déclare `isOnline` et TAIT `lastActiveAt` ;
 * fast-json-stringify supprime donc la seconde colonne, celle sur laquelle les
 * trois clients trient (`FriendListAggregator`, `sortContacts`). L'élargir
 * globalement pousserait `lastActiveAt` sur les dizaines de réponses qui
 * emploient ce schéma partagé — dont plusieurs chargent la colonne sans passer
 * par la loi de visibilité : un champ déclaré est un champ SERVI, et la règle du
 * dépôt est de décider de sa visibilité dans le lot qui le rend visible. Le
 * grain juste est donc LOCAL, pour les deux routes de ce fichier, qui gatent à
 * la source (`servirParties`).
 */
const partieAvecPresenceSchema = {
  ...userMinimalSchema,
  properties: {
    ...userMinimalSchema.properties,
    firstName: { type: 'string', nullable: true, description: 'Given name' },
    lastName: { type: 'string', nullable: true, description: 'Family name' },
    lastActiveAt: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Last activity — served only when the presence law allows it',
    },
  },
} as const;

/**
 * Une demande dont les deux parties portent leur présence GATÉE — EXPORTÉE
 * (#4283) pour que `routes/friends.ts` la RÉUTILISE au lieu de servir la forme
 * NUE de `friendRequestSchema`.
 *
 * ## Ce que la forme nue coûtait sur l'alias
 *
 * `lastActiveAt` est chargée par `PROJECTION_PARTIE` et gardée par la loi de
 * présence dans `servirParties` — le MÊME cœur que `routes/friends.ts` appelle
 * (`envoyerDemande`, `repondreDemande`). Avant #4283, l'alias déclarait
 * `data: friendRequestSchema`, qui ne redéclare PAS `lastActiveAt` en local :
 * le champ était donc CALCULÉ, gardé par la loi, et supprimé par le SCHÉMA —
 * pas une fuite, mais tout aussi cassant, sur les DEUX routes que l'app iOS
 * appelle encore par cette adresse (`FriendService.receivedRequests` /
 * `.sentRequests`, qui n'ont pas basculé vers `/directory/friend-requests` —
 * leur commentaire le dit : « La bascule appartient aux hôtes, un par un »).
 * `FriendListAggregator` (iOS) et son port Kotlin trient la liste de contacts
 * sur `isOnline` PUIS `lastActiveAt` : ces deux GET rendaient donc un ordre de
 * dictionnaire, jamais un ordre de présence.
 */
export const demandeAvecPresenceSchema = {
  ...friendRequestSchema,
  properties: {
    ...friendRequestSchema.properties,
    sender: { ...partieAvecPresenceSchema, description: 'Sender user info' },
    receiver: { ...partieAvecPresenceSchema, description: 'Receiver user info' },
  },
} as const;

/**
 * La CHARGE d'une demande, `conversation` COMPRISE — EXPORTÉE (#4283) pour la
 * même raison que ci-dessus.
 *
 * Le schéma partagé ne la déclare pas — et c'était le défaut ORIGINAL : le
 * handler d'acceptation greffe `conversation` sur l'objet rendu
 * (`repondreDemande`), que `friendRequestSchema` NU supprimait à la
 * sérialisation. Réparé ici (#4162) pour `/directory/friend-requests/:id` —
 * et SILENCIEUSEMENT intact sur `routes/friends.ts`, l'adresse que l'app
 * ANDROID appelle encore pour accepter (`FriendApi.respond` →
 * `FriendRepository.kt`, `ContactsViewModel.kt`, `DiscoverViewModel.kt`) :
 * iOS a basculé son `respond()` vers `/directory/friend-requests/:id`, Android
 * non. Un utilisateur Android qui acceptait une demande n'a jamais appris où
 * parler à son nouvel ami sans relancer une requête — exactement le défaut que
 * ce schéma corrige ici, laissé intact une adresse plus loin.
 */
export const demandeAvecConversationSchema = {
  type: 'object',
  properties: {
    ...demandeAvecPresenceSchema.properties,
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
export type GardesFriendRequests = {
  readonly parLecture: RateLimiter;
  readonly parEnvoi: RateLimiter;
  readonly parAction: RateLimiter;
  readonly budgetEpuise: (emetteurId: string) => Promise<boolean>;
};

/**
 * Les trois limiteurs de débit + le budget quotidien — EXPORTÉS (#4283) pour
 * que `routes/friends.ts` les PARTAGE au lieu d'exposer ses cinq routes SANS
 * AUCUNE garde d'abus.
 *
 * ## Ce que l'absence de partage aurait coûté
 *
 * `routes/friends.ts` sert le MÊME domaine sous une adresse plus ANCIENNE, que
 * l'app Android appelle encore pour les CINQ gestes (`FriendRepository.kt`) et
 * l'app iOS pour deux (`FriendService.receivedRequests` / `.sentRequests`).
 * Tant qu'elle n'appelait AUCUN de ces trois limiteurs, le budget quotidien
 * ci-dessous ne protégeait RIEN : un appelant plafonné sur
 * `/directory/friend-requests` pouvait continuer d'arroser des demandes par
 * `/friend-requests` sans qu'aucun compteur ne le voie — deux adresses pour un
 * seul domaine ne doivent JAMAIS receler deux budgets.
 *
 * L'usine est appelée UNE FOIS PAR SURFACE — chaque plugin Fastify enregistré
 * via `server.register()` est encapsulé, donc `routes/friends.ts` obtient son
 * PROPRE objet `RateLimiter`. Ce qui unifie l'application n'est pas le
 * partage de l'INSTANCE mais celui du `keyPrefix` : les deux exemplaires
 * incrémentent la MÊME clé Redis pour le même acteur, quelle que soit
 * l'adresse par laquelle il est passé.
 */
export function creerGardesFriendRequests(fastify: FastifyInstance): GardesFriendRequests {
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

  /** Consomme le budget d'envois, et dit si l'appelant l'a épuisé. */
  async function budgetEpuise(emetteurId: string): Promise<boolean> {
    const redis = fastify.redis;
    // Sans Redis (test, exécution directe), le budget ne s'applique pas :
    // c'est le limiteur par minute qui borne. Dit ici plutôt que subi.
    if (!redis || !emetteurId) return false;

    const cle = `dir:fr:budget:u:${emetteurId}`;
    const total = await redis.incrby(cle, 1);
    if (total === 1) await redis.expire(cle, FENETRE_BUDGET_SECONDES);
    return total > BUDGET_ENVOIS_PAR_JOUR;
  }

  return { parLecture, parEnvoi, parAction, budgetEpuise };
}

export async function directoryFriendRequestsRoutes(fastify: FastifyInstance) {
  const { parLecture, parEnvoi, parAction, budgetEpuise } = creerGardesFriendRequests(fastify);

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
            data: { type: 'array', items: demandeAvecPresenceSchema },
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

      const resultat = await listerDemandes(fastify, request, {
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
          properties: { success: { type: 'boolean', example: true }, data: demandeAvecPresenceSchema },
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

      if (await budgetEpuise(emetteurId)) {
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
}
