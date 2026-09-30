/**
 * Les communautés vues par l'administration (#8876, § 6.5) : la fiche, ses
 * membres, et le geste d'activation.
 *
 * `GET /admin/communities` (la liste) vit dans `admin/content.ts`, étendue par le
 * même lot ; ce module porte ce qu'une LISTE ne peut pas dire : qui la dirige,
 * combien y sont encore, ce qu'elle contient, et le geste qui la retire du monde.
 *
 * ## Les portes
 *
 * Partout `canAccessAdmin` ET `canManageCommunities` — BIGBOSS, ADMIN,
 * MODERATOR. AUDIT passe la première et pas la seconde : il lit l'administration,
 * il ne gère pas les communautés. Posées AU NIVEAU DE LA ROUTE.
 *
 * ## Désactiver n'est pas supprimer
 *
 * `isActive: false` + `deletedAt` : la ligne, ses membres, ses conversations et
 * ses publications restent. Ce que le geste change est ce que LES LECTEURS
 * PUBLICS servent — la communauté disparaît de la liste, de la recherche, de
 * « mes communautés », son détail répond 404 et plus personne ne la rejoint
 * (`routes/communities/*`, même lot : sans cela le geste serait inerte). Les
 * conversations de la communauté ne sont PAS touchées : retirer une
 * communauté ne doit pas fermer la porte des gens qui y parlent.
 *
 * Réactiver remet `deletedAt` à `null`. Un geste qui ne change rien (déjà dans
 * l'état demandé) ne produit ni écriture ni trace : le journal dit ce qui s'est
 * passé, pas ce qu'on a demandé.
 *
 * ## Ce qui ne part pas
 *
 * Un membre n'est servi que par son identité publique (`A`) : jamais sa
 * présence, ses coordonnées, son rôle GLOBAL.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { requirePermission, withAudit } from '../../middleware/authorize';
import { conversationActiveMemberCountSelect } from '../conversations/utils/active-member-count';
import { validatePagination } from '../../utils/pagination';
import { logError } from '../../utils/logger';
import {
  sendBadRequest,
  sendInternalError,
  sendNotFound,
  sendPaginatedSuccess,
  sendSuccess,
} from '../../utils/response';
import { ADMIN_PERSON_SELECT } from './oversight-people';
import {
  booleen,
  chaine,
  chaineNulle,
  dateNulle,
  dateServie,
  enveloppe,
  enveloppePaginee,
  nombre,
  personneSchema,
  reponsesEnErreur,
} from './oversight-schemas';

const COMMUNITY_ROLES = ['admin', 'moderator', 'member'] as const;
const STAFF_ROLES = ['admin', 'moderator'] as const;
const STAFF_LIMIT = 20;
const CONVERSATION_LIMIT = 20;

const FICHE_SELECT = {
  id: true,
  identifier: true,
  name: true,
  description: true,
  avatar: true,
  banner: true,
  isPrivate: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: ADMIN_PERSON_SELECT },
} satisfies Prisma.CommunitySelect;

const MEMBER_SELECT = {
  id: true,
  role: true,
  joinedAt: true,
  isActive: true,
  leftAt: true,
  user: { select: ADMIN_PERSON_SELECT },
} satisfies Prisma.CommunityMemberSelect;

const staffRank = (role: string): number => STAFF_ROLES.indexOf(role as (typeof STAFF_ROLES)[number]);

async function loadFiche(prisma: PrismaClient, id: string) {
  const row = await prisma.community.findUnique({ where: { id }, select: FICHE_SELECT });
  if (!row) return null;

  const [activeMemberCount, leftMemberCount, conversationCount, postCount, conversations, staff] = await Promise.all([
    prisma.communityMember.count({ where: { communityId: id, isActive: true } }),
    prisma.communityMember.count({ where: { communityId: id, isActive: false } }),
    prisma.conversation.count({ where: { communityId: id } }),
    prisma.post.count({ where: { communityId: id, deletedAt: null } }),
    prisma.conversation.findMany({
      where: { communityId: id },
      select: {
        id: true,
        title: true,
        identifier: true,
        type: true,
        isActive: true,
        lastMessageAt: true,
        _count: { select: conversationActiveMemberCountSelect },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: CONVERSATION_LIMIT,
    }),
    prisma.communityMember.findMany({
      where: { communityId: id, isActive: true, role: { in: [...STAFF_ROLES] } },
      select: { role: true, joinedAt: true, user: { select: ADMIN_PERSON_SELECT } },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      take: STAFF_LIMIT,
    }),
  ]);

  return {
    ...row,
    activeMemberCount,
    leftMemberCount,
    conversationCount,
    postCount,
    conversations: conversations.map(({ _count, ...conversation }) => ({
      ...conversation,
      memberCount: _count.participants,
    })),
    staff: [...staff].sort((left, right) => staffRank(left.role) - staffRank(right.role)),
  };
}

const ficheSchema = {
  type: 'object',
  properties: {
    id: chaine,
    identifier: chaine,
    name: chaine,
    description: chaineNulle,
    avatar: chaineNulle,
    banner: chaineNulle,
    isPrivate: booleen,
    isActive: booleen,
    deletedAt: dateNulle,
    createdAt: dateServie,
    updatedAt: dateServie,
    creator: personneSchema,
    activeMemberCount: nombre,
    leftMemberCount: nombre,
    conversationCount: nombre,
    postCount: nombre,
    conversations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: chaine,
          title: chaineNulle,
          identifier: chaineNulle,
          type: chaineNulle,
          isActive: booleen,
          lastMessageAt: dateNulle,
          memberCount: nombre,
        },
      },
    },
    staff: {
      type: 'array',
      items: {
        type: 'object',
        properties: { user: personneSchema, role: chaine, joinedAt: dateServie },
      },
    },
  },
} as const;

const memberSchema = {
  type: 'object',
  properties: {
    id: chaine,
    role: chaine,
    joinedAt: dateServie,
    isActive: booleen,
    leftAt: dateNulle,
    user: personneSchema,
  },
} as const;

const communityParams = {
  type: 'object',
  required: ['communityId'],
  properties: { communityId: { type: 'string', pattern: OBJECT_ID_PATTERN } },
} as const;

type MembersQuery = {
  offset?: string;
  limit?: string;
  search?: string;
  role?: (typeof COMMUNITY_ROLES)[number];
  isActive?: 'true' | 'false';
};

export function registerCommunityOversightRoutes(fastify: FastifyInstance): void {
  const guards = [
    fastify.authenticate,
    requirePermission('canAccessAdmin'),
    requirePermission('canManageCommunities'),
  ];

  fastify.get(
    '/communities/:communityId',
    {
      onRequest: guards,
      schema: {
        description:
          "La fiche d'une communauté : identité, état, chiffres, créateur, équipe et conversations. canAccessAdmin + canManageCommunities. #8876.",
        tags: ['admin'],
        summary: 'Get one community (admin)',
        security: [{ bearerAuth: [] }],
        params: communityParams,
        response: { 200: enveloppe(ficheSchema), ...reponsesEnErreur },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { communityId } = request.params as { communityId: string };
        const fiche = await loadFiche(fastify.prisma, communityId);
        if (!fiche) return sendNotFound(reply, 'Communauté introuvable');
        return sendSuccess(reply, fiche);
      } catch (error) {
        logError(fastify.log, 'Get admin community error:', error);
        return sendInternalError(reply, 'Erreur lors de la lecture de la communauté');
      }
    }
  );

  fastify.get(
    '/communities/:communityId/members',
    {
      onRequest: guards,
      schema: {
        description:
          "Les membres d'une communauté, nommés, avec leur rôle, leur arrivée et leur éventuel départ. canAccessAdmin + canManageCommunities. #8876.",
        tags: ['admin'],
        summary: 'List community members (admin)',
        security: [{ bearerAuth: [] }],
        params: communityParams,
        querystring: {
          type: 'object',
          properties: {
            offset: { type: 'string' },
            limit: { type: 'string' },
            search: { type: 'string', maxLength: 100, description: "Nom d'utilisateur ou nom affiché" },
            role: { type: 'string', enum: [...COMMUNITY_ROLES] },
            isActive: { type: 'string', enum: ['true', 'false'] },
          },
        },
        response: { 200: enveloppePaginee(memberSchema), ...reponsesEnErreur },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { communityId } = request.params as { communityId: string };
        const query = request.query as MembersQuery;
        const { offset, limit } = validatePagination(query.offset, query.limit);

        const community = await fastify.prisma.community.findUnique({
          where: { id: communityId },
          select: { id: true },
        });
        if (!community) return sendNotFound(reply, 'Communauté introuvable');

        const search = (query.search ?? '').trim();
        const where: Prisma.CommunityMemberWhereInput = {
          communityId,
          ...(query.role ? { role: query.role } : {}),
          ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
          ...(search !== ''
            ? {
                user: {
                  OR: [
                    { username: { contains: search, mode: 'insensitive' as const } },
                    { displayName: { contains: search, mode: 'insensitive' as const } },
                  ],
                },
              }
            : {}),
        };

        const [rows, total] = await Promise.all([
          fastify.prisma.communityMember.findMany({
            where,
            select: MEMBER_SELECT,
            orderBy: [{ joinedAt: 'desc' }, { id: 'desc' }],
            skip: offset,
            take: limit,
          }),
          fastify.prisma.communityMember.count({ where }),
        ]);

        return sendPaginatedSuccess(reply, rows, { total, limit, offset, hasMore: offset + rows.length < total });
      } catch (error) {
        logError(fastify.log, 'List admin community members error:', error);
        return sendInternalError(reply, 'Erreur lors de la lecture des membres');
      }
    }
  );

  fastify.patch(
    '/communities/:communityId',
    {
      onRequest: guards,
      schema: {
        description:
          "Désactive / réactive une communauté, ou la rend privée / publique. Motif écrit (10 caractères minimum), tracé. Désactiver la retire des lectures publiques ; ses conversations restent. canAccessAdmin + canManageCommunities. #8876.",
        tags: ['admin'],
        summary: 'Update a community (admin)',
        security: [{ bearerAuth: [] }],
        params: communityParams,
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            isActive: { type: 'boolean' },
            isPrivate: { type: 'boolean' },
            reason: { type: 'string', minLength: 10, maxLength: 500, description: 'Motif consigné dans le journal' },
          },
        },
        response: { 200: enveloppe(ficheSchema), ...reponsesEnErreur },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { communityId } = request.params as { communityId: string };
        const { isActive, isPrivate, reason } = request.body as {
          isActive?: boolean;
          isPrivate?: boolean;
          reason: string;
        };
        if (isActive === undefined && isPrivate === undefined) {
          return sendBadRequest(reply, 'Aucun changement demandé : isActive ou isPrivate est requis');
        }

        const current = await loadFiche(fastify.prisma, communityId);
        if (!current) return sendNotFound(reply, 'Communauté introuvable');

        const activeChanged = isActive !== undefined && isActive !== current.isActive;
        const privacyChanged = isPrivate !== undefined && isPrivate !== current.isPrivate;
        if (!activeChanged && !privacyChanged) return sendSuccess(reply, current);

        await fastify.prisma.community.update({
          where: { id: communityId },
          data: {
            ...(activeChanged ? { isActive, deletedAt: isActive ? null : new Date() } : {}),
            ...(privacyChanged ? { isPrivate } : {}),
          },
        });

        await withAudit(request, {
          action: 'ADMIN_COMMUNITY_UPDATED',
          entity: 'Community',
          entityId: communityId,
          userId: current.creator.id,
          reason,
          changes: {
            ...(activeChanged ? { isActive: { before: current.isActive, after: isActive } } : {}),
            ...(privacyChanged ? { isPrivate: { before: current.isPrivate, after: isPrivate } } : {}),
          },
        });

        const updated = await loadFiche(fastify.prisma, communityId);
        return sendSuccess(reply, updated ?? current);
      } catch (error) {
        logError(fastify.log, 'Update admin community error:', error);
        return sendInternalError(reply, 'Erreur lors de la mise à jour de la communauté');
      }
    }
  );
}
