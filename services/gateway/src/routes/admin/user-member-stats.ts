/**
 * `GET /admin/users/:userId/stats` — les compteurs de la fiche d'un membre,
 * côté administration web (#7845).
 *
 * Une lecture, un objet PLAT de nombres, sous le seuil des autres
 * sous-ressources de la fiche (`requireUserViewAccess` ⇒ `canViewUsers`,
 * comme `/communities`, `/media` et `/conversations`). Chaque compteur est un
 * `count` Prisma, lancés ensemble : la fiche paie un aller-retour, pas quinze.
 *
 * Ce que chaque nombre compte — et ce qu'il ne compte pas :
 *
 * - `messagesSent` : messages dont l'expéditeur est une participation de la
 *   cible, hors messages supprimés (`deletedAt: null`, la forme de
 *   `computeUserAchievementStats`).
 * - `conversations` : participations ACTIVES — quitter, être banni ou
 *   « supprimer pour moi » désactive la ligne sans l'effacer.
 * - `posts` / `reels` / `stories` : publications non supprimées par type
 *   (`NOT_DELETED` : un `DateTime?` jamais écrit est ABSENT sur Mongo, `null`
 *   ne le trouverait pas). Les stories expirées comptent : l'auteur garde son
 *   archive.
 * - `comments` : commentaires non supprimés.
 * - `reactionsGiven` : réactions posées sur des messages, des posts et des
 *   commentaires, sommées.
 * - `mediaUploaded` : pièces jointes téléversées plus médias de posts — les
 *   deux sources que `GET /admin/users/:userId/media` fusionne, donc le même
 *   total que cette liste.
 * - `friends` : demandes ACCEPTÉES, dans un sens comme dans l'autre (la loi de
 *   `amitieAcceptee`) ; `pendingFriendRequestsIn` / `Out` : demandes en
 *   attente reçues / envoyées.
 * - `reportsFiled` : signalements déposés par la cible — `null` sans
 *   `canModerateContent`. C'est le seuil de `GET /admin/users/:userId/reports`
 *   (`REPORT_PERMISSION_LA_PLUS_HAUTE`) : deux seuils sur une même donnée,
 *   c'est le plus bas qui décide, et un compte est une lecture de la même
 *   table.
 * - `reportsReceived` : signalements visant les MESSAGES de la cible, sous le
 *   seuil et le plafond de balayage de `reported-messages` (`Report` est
 *   polymorphe : il faut énumérer les messages avant de compter).
 * - `activeSessions` : sessions valides et non expirées.
 * - `communities` : adhésions actives.
 */
import type { FastifyInstance } from 'fastify';
import { PostType } from '@meeshy/shared/prisma/client';
import { UserRoleEnum } from '@meeshy/shared/types';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { requireUserViewAccess } from '../../middleware/admin-user-auth.middleware';
import { permissionsService } from '../../services/admin/permissions.service';
import { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';
import { NOT_DELETED } from '../../services/posts/softDelete';
import { sendNotFound, sendInternalError, sendSuccess } from '../../utils/response';
import { logError } from '../../utils/logger.js';
import {
  REPORT_PERMISSION_LA_PLUS_HAUTE,
  REPORTED_MESSAGES_PARTICIPANT_SCAN_CAP,
  REPORTED_MESSAGES_MESSAGE_SCAN_CAP
} from './user-reports';

export const MEMBER_STAT_KEYS = [
  'messagesSent',
  'conversations',
  'posts',
  'reels',
  'stories',
  'comments',
  'reactionsGiven',
  'mediaUploaded',
  'friends',
  'pendingFriendRequestsIn',
  'pendingFriendRequestsOut',
  'reportsFiled',
  'reportsReceived',
  'activeSessions',
  'communities'
] as const;

export type MemberStats = Record<Exclude<(typeof MEMBER_STAT_KEYS)[number], 'reportsFiled'>, number> & {
  reportsFiled: number | null;
};

const userIdParams = {
  type: 'object',
  required: ['userId'],
  properties: { userId: { type: 'string', pattern: OBJECT_ID_PATTERN } }
} as const;

async function countReportsOnMessagesOf(fastify: FastifyInstance, userId: string): Promise<number> {
  const participants = await fastify.prisma.participant.findMany({
    where: { userId, type: 'user' },
    select: { id: true },
    orderBy: { joinedAt: 'desc' },
    take: REPORTED_MESSAGES_PARTICIPANT_SCAN_CAP
  });
  if (participants.length === 0) return 0;

  const messages = await fastify.prisma.message.findMany({
    where: { senderId: { in: participants.map((p) => p.id) } },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: REPORTED_MESSAGES_MESSAGE_SCAN_CAP
  });
  if (messages.length === 0) return 0;

  return fastify.prisma.report.count({
    where: { reportedType: 'message', reportedEntityId: { in: messages.map((m) => m.id) } }
  });
}

export function registerUserMemberStatsRoutes(fastify: FastifyInstance): void {
  /**
   * GET /admin/users/:userId/stats - Compteurs de la fiche d'un membre.
   * Requiert canViewUsers ; `reportsFiled` requiert en plus canModerateContent.
   */
  fastify.get<{
    Params: { userId: string };
  }>('/admin/users/:userId/stats', {
    preHandler: [fastify.authenticate, requireUserViewAccess],
    schema: {
      description:
        "Compteurs de la fiche d'un membre (messages, conversations, publications, réactions, médias, " +
        'amis, signalements, sessions, communautés) — un objet plat de nombres. #7845.',
      tags: ['admin'],
      summary: 'Member counters (admin)',
      security: [{ bearerAuth: [] }],
      params: userIdParams,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: Object.fromEntries(
                MEMBER_STAT_KEYS.map((key) => [
                  key,
                  key === 'reportsFiled' ? { type: 'number', nullable: true } : { type: 'number' }
                ])
              )
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const viewerRole = authContext.registeredUser!.role as UserRoleEnum;
      const canReadFiledReports = permissionsService.hasPermission(viewerRole, REPORT_PERMISSION_LA_PLUS_HAUTE);
      const { userId } = request.params;

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const prisma = fastify.prisma;
      const [
        messagesSent,
        conversations,
        posts,
        reels,
        stories,
        comments,
        messageReactions,
        postReactions,
        commentReactions,
        attachments,
        postMedia,
        friends,
        pendingFriendRequestsIn,
        pendingFriendRequestsOut,
        reportsFiled,
        reportsReceived,
        activeSessions,
        communities
      ] = await Promise.all([
        prisma.message.count({ where: { sender: { userId }, deletedAt: null } }),
        prisma.participant.count({ where: { userId, isActive: true } }),
        prisma.post.count({ where: { authorId: userId, deletedAt: NOT_DELETED, type: PostType.POST } }),
        prisma.post.count({ where: { authorId: userId, deletedAt: NOT_DELETED, type: PostType.REEL } }),
        prisma.post.count({ where: { authorId: userId, deletedAt: NOT_DELETED, type: PostType.STORY } }),
        prisma.postComment.count({ where: { authorId: userId, deletedAt: NOT_DELETED } }),
        prisma.reaction.count({ where: { participant: { userId } } }),
        prisma.postReaction.count({ where: { userId } }),
        prisma.commentReaction.count({ where: { userId } }),
        prisma.messageAttachment.count({ where: { uploadedBy: userId } }),
        prisma.postMedia.count({ where: { post: { authorId: userId } } }),
        prisma.friendRequest.count({
          where: { status: 'accepted', OR: [{ senderId: userId }, { receiverId: userId }] }
        }),
        prisma.friendRequest.count({ where: { receiverId: userId, status: 'pending' } }),
        prisma.friendRequest.count({ where: { senderId: userId, status: 'pending' } }),
        canReadFiledReports ? prisma.report.count({ where: { reporterId: userId } }) : Promise.resolve(null),
        countReportsOnMessagesOf(fastify, userId),
        prisma.userSession.count({ where: { userId, isValid: true, expiresAt: { gt: new Date() } } }),
        prisma.communityMember.count({ where: { userId, isActive: true } })
      ]);

      const stats: MemberStats = {
        messagesSent,
        conversations,
        posts,
        reels,
        stories,
        comments,
        reactionsGiven: messageReactions + postReactions + commentReactions,
        mediaUploaded: attachments + postMedia,
        friends,
        pendingFriendRequestsIn,
        pendingFriendRequestsOut,
        reportsFiled,
        reportsReceived,
        activeSessions,
        communities
      };

      return sendSuccess(reply, stats);
    } catch (error) {
      logError(fastify.log, 'Error fetching user stats', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user stats' });
    }
  });
}
