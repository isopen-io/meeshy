import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import {
  sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendInternalError,
} from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import type { AuthenticatedRequest } from '../users/types';
import { withMutationLog } from '../../utils/withMutationLog';
import { getCacheStore } from '../../services/CacheStore';
import { blockCacheKey } from '../../utils/block-cache';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { callerRateKey } from '../../utils/client-rate-key';
import { sendWithETag } from '../../utils/etag';
import { validatePagination } from '../../utils/pagination';

/** La page de blocages la plus large qu'un appelant puisse demander. */
export const LIMITE_MAX_BLOCAGES = 100;
const LIMITE_DEFAUT_BLOCAGES = 50;

/**
 * Ce qu'un blocage sert — le minimum pour dessiner une ligne de liste.
 *
 * Aucune présence : on ne sert pas l'état de connexion de quelqu'un qu'on a
 * bloqué, et la loi du 2026-08-25 le masquerait de toute façon.
 */
const PROJECTION_BLOQUE = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
} as const;

const blockedUserSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    username: { type: 'string' },
    displayName: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
  },
} as const;

type Refus = { code: number; message: string };
type Resultat<T> = { valeur: T } | { refus: Refus };

function acteur(request: FastifyRequest): string | null {
  const ctx = (request as AuthenticatedRequest).authContext;
  return ctx?.isAuthenticated && ctx.registeredUser ? (ctx.userId ?? null) : null;
}

/**
 * Bloquer quelqu'un — une APPARTENANCE À UN ENSEMBLE, donc idempotente.
 *
 * ## Pourquoi le second appel ne rend plus 409
 *
 * `POST /users/:userId/block` modélisait une ACTION : bloquer deux fois rendait
 * `409 User is already blocked`. Or bloquer n'est pas un événement qu'on
 * empile, c'est un état qu'on pose — et l'état visé est atteint dans les deux
 * cas. Un 409 oblige alors chaque appelant à traiter comme une erreur ce qui
 * est un succès, et il le fait mal : la file d'attente hors ligne, qui rejoue
 * des mutations enregistrées avant une mise à jour, verrait échouer un blocage
 * DÉJÀ appliqué.
 *
 * `PUT` le dit dans son verbe. Le second appel rend le même corps et le même
 * code que le premier, et n'écrit pas — `dejaBloque` le distingue pour le
 * journal, jamais pour l'appelant.
 */
export async function bloquer(
  fastify: FastifyInstance,
  request: FastifyRequest,
  cibleId: string
): Promise<Resultat<{ message: string; blocked: true; dejaBloque: boolean }>> {
  const moi = acteur(request);
  if (!moi) return { refus: { code: 401, message: 'Authentication required' } };
  if (!isValidMongoId(cibleId)) return { refus: { code: 400, message: 'Invalid user ID format' } };
  if (moi === cibleId) return { refus: { code: 400, message: 'You cannot block yourself' } };

  const cible = await fastify.prisma.user.findUnique({ where: { id: cibleId }, select: { id: true } });
  if (!cible) return { refus: { code: 404, message: 'User not found' } };

  const courant = await fastify.prisma.user.findUnique({
    where: { id: moi },
    select: { blockedUserIds: true },
  });

  const dejaBloque = courant?.blockedUserIds.includes(cibleId) ?? false;

  if (!dejaBloque) {
    // Le `MutationLog` enregistre l'id de la CIBLE : un blocage ne produit
    // aucun enregistrement canonique, et cet id laisse un rejeu confirmer que
    // la même action a déjà été appliquée.
    await withMutationLog({
      request,
      fastify,
      userId: moi,
      kind: 'blockUser',
      replayCost: 'converges',
      op: async () => {
        await fastify.prisma.user.update({
          where: { id: moi },
          data: { blockedUserIds: { push: cibleId } },
        });
        return { id: cibleId };
      },
      onDuplicate: async () => ({ id: cibleId }),
    });
  }

  // Le cache symétrique de la porte d'envoi de DM est invalidé même quand rien
  // n'a été écrit : une entrée `blocks:` chaude (jusqu'à 300 s) laisserait
  // passer les messages de la personne bloquée, et un second appel est
  // justement ce que fait quelqu'un dont le premier n'a « rien fait ».
  try { await getCacheStore().del(blockCacheKey(moi, cibleId)); } catch { /* best-effort */ }

  // `dejaBloque` remonte pour que l'ALIAS puisse rendre son 409 historique
  // SANS relire la ligne : un pré-contrôle chez l'appelant ajouterait une
  // troisième lecture avant les deux existantes. Il n'est pas déclaré au schéma
  // de la route canonique, donc il n'atteint aucun client par cette porte.
  return { valeur: { message: 'User blocked', blocked: true, dejaBloque } };
}

/** Débloquer — inchangé, y compris son 404 quand la personne n'est pas bloquée. */
export async function debloquer(
  fastify: FastifyInstance,
  request: FastifyRequest,
  cibleId: string
): Promise<Resultat<{ message: string }>> {
  const moi = acteur(request);
  if (!moi) return { refus: { code: 401, message: 'Authentication required' } };
  if (!isValidMongoId(cibleId)) return { refus: { code: 400, message: 'Invalid user ID format' } };

  const courant = await fastify.prisma.user.findUnique({
    where: { id: moi },
    select: { blockedUserIds: true },
  });

  if (!courant?.blockedUserIds.includes(cibleId)) {
    return { refus: { code: 404, message: 'User is not in your blocked list' } };
  }

  await withMutationLog({
    request,
    fastify,
    userId: moi,
    kind: 'unblockUser',
    replayCost: 'converges',
    op: async () => {
      await fastify.prisma.user.update({
        where: { id: moi },
        data: { blockedUserIds: { set: courant.blockedUserIds.filter((id) => id !== cibleId) } },
      });
      return { id: cibleId };
    },
    onDuplicate: async () => ({ id: cibleId }),
  });

  try { await getCacheStore().del(blockCacheKey(moi, cibleId)); } catch { /* best-effort */ }

  return { valeur: { message: 'User unblocked' } };
}

export type PageDeBlocages = {
  readonly items: ReadonlyArray<{ id: string; username: string; displayName: string | null; avatar: string | null }>;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly limit: number;
};

/**
 * La liste des personnes bloquées, BORNÉE.
 *
 * Elle ne l'était par rien : ni page, ni curseur, ni plafond. Un compte qui a
 * beaucoup bloqué rapatriait tout, à chaque ouverture de l'écran.
 *
 * Le curseur est l'identifiant, et l'ordre est celui des identifiants — pas
 * celui du tableau `blockedUserIds`, dont l'ordre est celui des `push`
 * successifs et qui CHANGE quand on débloque quelqu'un (le filtre reconstruit
 * le tableau). Un curseur adossé à un ordre instable saute des lignes.
 */
export async function listerBloques(
  fastify: FastifyInstance,
  request: FastifyRequest,
  options: { cursor?: string; limit?: string }
): Promise<Resultat<PageDeBlocages>> {
  const moi = acteur(request);
  if (!moi) return { refus: { code: 401, message: 'Authentication required' } };

  // Le décodage passe par le SITE UNIQUE (`validatePagination`) — un cliquet du
  // dépôt interdit tout `Number()`/`parseInt` de pagination écrit à la main.
  //
  // Il RABOTE au lieu de refuser, et cette route veut refuser : un `limit=500`
  // silencieusement ramené à 100 ment sur ce qu'il a servi, et le client
  // paginerait sur une taille qu'il ne connaît pas. Le refus se dérive donc du
  // décodage, sans le réécrire — si la valeur rendue n'est pas EXACTEMENT celle
  // demandée, la demande était hors bornes (ou n'était pas un nombre).
  const { limit: demande } = validatePagination('0', options.limit, {
    defaultLimit: LIMITE_DEFAUT_BLOCAGES,
    maxLimit: LIMITE_MAX_BLOCAGES,
  });

  if (options.limit !== undefined && String(demande) !== options.limit.trim()) {
    return { refus: { code: 400, message: `limit must be an integer between 1 and ${LIMITE_MAX_BLOCAGES}` } };
  }

  const courant = await fastify.prisma.user.findUnique({
    where: { id: moi },
    select: { blockedUserIds: true },
  });

  const tous = [...(courant?.blockedUserIds ?? [])].sort();
  const depart = options.cursor ? tous.findIndex((id) => id > options.cursor!) : 0;

  if (tous.length === 0 || depart === -1) {
    return { valeur: { items: [], hasMore: false, nextCursor: null, limit: demande } };
  }

  const page = tous.slice(depart, depart + demande);
  const hasMore = depart + demande < tous.length;

  const lignes = await fastify.prisma.user.findMany({
    where: { id: { in: page } },
    select: PROJECTION_BLOQUE,
    orderBy: { id: 'asc' },
  });

  return {
    valeur: {
      items: lignes,
      hasMore,
      // Le curseur nomme la dernière ligne DEMANDÉE, pas la dernière SERVIE :
      // un compte supprimé disparaît de `findMany` sans disparaître du tableau,
      // et prendre la dernière ligne servie ferait boucler la pagination sur
      // lui à l'infini.
      nextCursor: hasMore ? page[page.length - 1] : null,
      limit: demande,
    },
  };
}

function repondre<T>(reply: FastifyReply, resultat: Resultat<T>): FastifyReply | unknown {
  if ('valeur' in resultat) return sendSuccess(reply, resultat.valeur);
  const { code, message } = resultat.refus;
  if (code === 401) return sendUnauthorized(reply, message);
  if (code === 400) return sendBadRequest(reply, message);
  return sendNotFound(reply, message);
}

export { repondre as repondreBlocage };

/**
 * `/directory/blocks` — le blocage comme un ENSEMBLE (S3).
 *
 * `PUT` pose l'appartenance, `DELETE` la retire, `GET` la liste. Les trois
 * anciennes adresses restent servies en alias : la file d'attente hors ligne
 * rejoue des mutations enregistrées AVANT une mise à jour, et un alias qui
 * disparaît fait échouer un blocage que l'utilisateur croit posé.
 */
export async function directoryBlocksRoutes(fastify: FastifyInstance) {
  const parEcrivain = createCustomRateLimiter(
    {
      max: 30,
      windowMs: 60 * 1000,
      keyPrefix: 'dir:blocks:write:u',
      message: 'Trop de modifications de blocage. Veuillez patienter une minute.',
      keyGenerator: callerRateKey,
    },
    fastify.redis ?? undefined
  );

  const paramsCible = {
    type: 'object',
    required: ['userId'],
    properties: { userId: { type: 'string', description: 'ID of the user (MongoDB ObjectId)' } },
  } as const;

  fastify.put<{ Params: { userId: string } }>('/blocks/:userId', {
    onRequest: [fastify.authenticate],
    preHandler: [parEcrivain.middleware()],
    schema: {
      description: 'Block a user. Idempotent — a second call returns the same state and the same status.',
      tags: ['directory'],
      summary: 'Block a user',
      params: paramsCible,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'User blocked' },
                blocked: { type: 'boolean', example: true },
              },
            },
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      return repondre(reply, await bloquer(fastify, request, request.params.userId));
    } catch (error) {
      logError(fastify.log, '[BLOCKS] Error blocking user', error);
      return sendInternalError(reply, 'Failed to block user');
    }
  });

  fastify.delete<{ Params: { userId: string } }>('/blocks/:userId', {
    onRequest: [fastify.authenticate],
    preHandler: [parEcrivain.middleware()],
    schema: {
      description: 'Unblock a user.',
      tags: ['directory'],
      summary: 'Unblock a user',
      params: paramsCible,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: { message: { type: 'string', example: 'User unblocked' } },
            },
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      return repondre(reply, await debloquer(fastify, request, request.params.userId));
    } catch (error) {
      logError(fastify.log, '[BLOCKS] Error unblocking user', error);
      return sendInternalError(reply, 'Failed to unblock user');
    }
  });

  fastify.get<{ Querystring: { cursor?: string; limit?: string } }>('/blocks', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'List blocked users. Bounded page, cursor on the user id, conditional GET.',
      tags: ['directory'],
      summary: 'List blocked users',
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string', description: 'Id of the last row of the previous page' },
          limit: { type: 'string', description: `1..${LIMITE_MAX_BLOCAGES}` },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: blockedUserSchema },
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
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Querystring: { cursor?: string; limit?: string } }>, reply: FastifyReply) => {
    try {
      const resultat = await listerBloques(fastify, request, request.query);
      if ('refus' in resultat) return repondre(reply, resultat);

      const { items, ...pagination } = resultat.valeur;
      const charge = { success: true, data: items, pagination };

      // `sendWithETag` pose `private, no-cache` : la liste se revalide toujours
      // — c'est une donnée qui change sous la main de son propriétaire — et le
      // 304 fait de cette revalidation un aller-retour SANS corps.
      if (sendWithETag(request, reply, charge)) return reply;

      return sendSuccess(reply, items, { pagination } as never);
    } catch (error) {
      logError(fastify.log, '[BLOCKS] Error listing blocked users', error);
      return sendInternalError(reply, 'Failed to fetch blocked users');
    }
  });
}
