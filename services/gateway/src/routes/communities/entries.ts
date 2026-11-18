/**
 * Les entrées d'une communauté (#19429, besoin #19290) : les comptes exacts
 * et les demandes d'entrée en attente, réservés à ceux qui l'animent ou la
 * modèrent (`isCommunitySteward`). Tout autre lecteur, membre simple compris,
 * reçoit le MÊME 404 qu'une communauté absente : ni l'existence d'une demande,
 * ni un compte ne se devinent depuis le code de réponse.
 */
import { FastifyInstance, FastifyReply } from 'fastify';
import {
  communityEntryStatsSchema,
  communityJoinRequestSchema,
  communityStewardMemberSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendSuccess, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response.js';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import {
  computeCommunityEntryStats,
  ENTRY_SERIES_SAMPLE_CAP,
  ENTRY_WINDOW_DAYS,
  entryWindowStart,
  isCommunitySteward,
  type CommunityJoinVia
} from '../../services/community-entries';
import { scheduleCommunityMemberBroadcastFrom } from '../../services/community-member-broadcast';

const logger = enhancedLogger.child({ module: 'CommunityEntryRoutes' });

const NOT_FOUND = 'Community not found';
const OBJECT_ID = '^[0-9a-fA-F]{24}$';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: OBJECT_ID, description: 'Community unique ID' } }
} as const;

const requestParams = {
  type: 'object',
  required: ['id', 'requestId'],
  properties: {
    id: { type: 'string', pattern: OBJECT_ID, description: 'Community unique ID' },
    requestId: { type: 'string', pattern: OBJECT_ID, description: 'Join request ID' }
  }
} as const;

const notFoundResponses = {
  401: { description: 'User not authenticated', ...errorResponseSchema },
  404: { description: 'Community not found, or the reader neither animates nor moderates it', ...errorResponseSchema },
  500: { description: 'Internal server error', ...errorResponseSchema }
} as const;

const REQUESTER_SELECT = { id: true, username: true, displayName: true, avatar: true } as const;

function viewerIdOf(request: unknown): string | null {
  const authContext = (request as UnifiedAuthRequest).authContext;
  return authContext?.isAuthenticated && authContext.registeredUser ? authContext.userId : null;
}

const joinViaOf = (stored: string | null | undefined): CommunityJoinVia => (stored === 'link' ? 'link' : 'self');

export async function registerEntryRoutes(fastify: FastifyInstance) {
  /** La communauté ACTIVE que le lecteur anime ou modère, ou rien (⇒ 404 générique). */
  async function stewardedCommunity(id: string, viewerId: string): Promise<{ id: string } | null> {
    const community = await fastify.prisma.community.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        createdBy: true,
        members: { where: { userId: viewerId, isActive: true }, select: { userId: true, role: true } }
      }
    });
    return community && isCommunitySteward(community, viewerId) ? { id: community.id } : null;
  }

  async function guarded(
    request: unknown,
    reply: FastifyReply,
    id: string,
    then: (viewerId: string) => Promise<unknown>
  ): Promise<unknown> {
    const viewerId = viewerIdOf(request);
    if (!viewerId) return sendUnauthorized(reply, 'User must be authenticated', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
    const community = await stewardedCommunity(id, viewerId);
    if (!community) return sendNotFound(reply, NOT_FOUND);
    return then(viewerId);
  }

  fastify.get('/communities/:id/entries/stats', {
    onRequest: [fastify.authenticate],
    schema: {
      description: "Exact entry counts of a community (#19429): last 7 and 30 UTC days, a daily series over 30 days, and the members who entered through the community link. Admins and moderators only; any other reader gets a generic 404.",
      tags: ['communities'],
      summary: 'Get community entry counts',
      params: idParams,
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: communityEntryStatsSchema } },
        ...notFoundResponses
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await guarded(request, reply, id, async () => {
        const now = new Date();
        const since = (days: number) => ({ communityId: id, isActive: true, joinedAt: { gte: entryWindowStart(now, days) } });
        // Les comptes sont EXACTS (`count`) ; la série se lit sur les arrivées des 30 jours, bornée.
        const [recent, last7, last30, viaLink] = await Promise.all([
          fastify.prisma.communityMember.findMany({
            where: since(ENTRY_WINDOW_DAYS),
            select: { joinedAt: true },
            orderBy: { joinedAt: 'desc' },
            take: ENTRY_SERIES_SAMPLE_CAP
          }),
          fastify.prisma.communityMember.count({ where: since(7) }),
          fastify.prisma.communityMember.count({ where: since(ENTRY_WINDOW_DAYS) }),
          fastify.prisma.communityMember.count({ where: { communityId: id, isActive: true, joinedVia: 'link' } })
        ]);
        const stats = computeCommunityEntryStats({ joinedAt: recent.map((r) => r.joinedAt), viaLink, now });
        return sendSuccess(reply, { ...stats, last7, last30 });
      });
    } catch (error) {
      logger.error('Error computing community entry stats', error as Error);
      return sendInternalError(reply, 'Failed to compute community entry stats');
    }
  });

  fastify.get('/communities/:id/join-requests', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Pending requests to join a community that validates each entry (#19429), most recent first. Admins and moderators only; any other reader gets a generic 404.',
      tags: ['communities'],
      summary: 'List pending join requests',
      params: idParams,
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' }, data: { type: 'array', items: communityJoinRequestSchema } }
        },
        ...notFoundResponses
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await guarded(request, reply, id, async () => {
        const requests = await fastify.prisma.communityJoinRequest.findMany({
          where: { communityId: id, status: 'pending' },
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { user: { select: REQUESTER_SELECT } }
        });
        return sendSuccess(reply, requests);
      });
    } catch (error) {
      logger.error('Error listing community join requests', error as Error);
      return sendInternalError(reply, 'Failed to list join requests');
    }
  });

  async function pendingRequest(id: string, requestId: string) {
    return fastify.prisma.communityJoinRequest.findFirst({
      where: { id: requestId, communityId: id, status: 'pending' },
      select: { id: true, userId: true, via: true, country: true }
    });
  }

  fastify.post('/communities/:id/join-requests/:requestId/accept', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Accept a pending join request (#19429): the requester enters as a member, with the source and country of the request. Admins and moderators only; any other reader, an unknown or already decided request gets a generic 404.',
      tags: ['communities'],
      summary: 'Accept a join request',
      params: requestParams,
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: communityStewardMemberSchema } },
        ...notFoundResponses
      }
    }
  }, async (request, reply) => {
    const { id, requestId } = request.params as { id: string; requestId: string };
    try {
      return await guarded(request, reply, id, async (viewerId) => {
        const pending = await pendingRequest(id, requestId);
        if (!pending) return sendNotFound(reply, NOT_FOUND);
        const via = joinViaOf(pending.via);
        const entry = { role: 'member', joinedVia: via, joinCountry: pending.country ?? null };
        const existing = await fastify.prisma.communityMember.findFirst({
          where: { communityId: id, userId: pending.userId },
          select: { id: true, isActive: true }
        });
        // Une ligne laissée par un départ se RÉACTIVE (#5760) ; une ligne active n'est pas réécrite.
        const member = existing?.isActive
          ? existing
          : existing
            ? await fastify.prisma.communityMember.update({
                where: { id: existing.id },
                data: { ...entry, isActive: true, leftAt: null }
              })
            : await fastify.prisma.communityMember.create({
                data: { communityId: id, userId: pending.userId, ...entry }
              });
        await fastify.prisma.communityJoinRequest.update({
          where: { id: pending.id },
          data: { status: 'accepted', decidedAt: new Date(), decidedBy: viewerId }
        });
        if (!existing?.isActive) {
          scheduleCommunityMemberBroadcastFrom(fastify, { kind: 'joined', communityId: id, userId: pending.userId, role: 'member', via });
        }
        return sendSuccess(reply, member);
      });
    } catch (error) {
      logger.error('Error accepting community join request', error as Error);
      return sendInternalError(reply, 'Failed to accept join request');
    }
  });

  fastify.post('/communities/:id/join-requests/:requestId/reject', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Reject a pending join request (#19429). Nobody enters. Admins and moderators only; any other reader, an unknown or already decided request gets a generic 404.',
      tags: ['communities'],
      summary: 'Reject a join request',
      params: requestParams,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string' } } }
          }
        },
        ...notFoundResponses
      }
    }
  }, async (request, reply) => {
    const { id, requestId } = request.params as { id: string; requestId: string };
    try {
      return await guarded(request, reply, id, async (viewerId) => {
        const pending = await pendingRequest(id, requestId);
        if (!pending) return sendNotFound(reply, NOT_FOUND);
        await fastify.prisma.communityJoinRequest.update({
          where: { id: pending.id },
          data: { status: 'rejected', decidedAt: new Date(), decidedBy: viewerId }
        });
        return sendSuccess(reply, { id: pending.id, status: 'rejected' });
      });
    } catch (error) {
      logger.error('Error rejecting community join request', error as Error);
      return sendInternalError(reply, 'Failed to reject join request');
    }
  });
}
