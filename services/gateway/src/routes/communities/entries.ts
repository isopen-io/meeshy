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
import { EngagementService } from '../../services/engagement/EngagementService';
import { ACCOUNT_STATE_SELECT, isUsableAccount } from '../../services/relations/usableAccount';
import { getBlockRelatedUserIds, isBlockedBetween } from '../../utils/blocking.js';
import { admitCommunityMember, membershipAfterFailure } from './admission';
import { liveJoinRequestWhere } from '../../services/community-join-request-lifecycle';
import type { CommunityEngagementOptions } from './types';

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

/** Une page de demandes en attente : au plus 100 (l'ancien plafond, que l'ancien client lit sans paramètre). */
const JOIN_REQUESTS_PAGE_MAX = 100;
const joinRequestsQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: JOIN_REQUESTS_PAGE_MAX },
    cursor: { type: 'string', pattern: OBJECT_ID }
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

type Stewarded = { readonly id: string; readonly createdBy: string };

const servedRequest = <T extends { user?: (Record<string, unknown> & { id: string }) | null }>(row: T) => {
  if (!row.user) return row;
  const { isActive: _a, deletedAt: _d, deactivatedAt: _x, ...user } = row.user;
  return { ...row, user };
};

export async function registerEntryRoutes(fastify: FastifyInstance, options: CommunityEngagementOptions = {}) {
  const engagement = options.engagement ?? new EngagementService(fastify.prisma);

  /** La communauté ACTIVE que le lecteur anime ou modère, ou rien (⇒ 404 générique). */
  async function stewardedCommunity(id: string, viewerId: string): Promise<Stewarded | null> {
    const community = await fastify.prisma.community.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        createdBy: true,
        members: { where: { userId: viewerId, isActive: true }, select: { userId: true, role: true } }
      }
    });
    return community && isCommunitySteward(community, viewerId) ? { id: community.id, createdBy: community.createdBy } : null;
  }

  async function guarded(
    request: unknown,
    reply: FastifyReply,
    id: string,
    then: (viewerId: string, community: Stewarded) => Promise<unknown>
  ): Promise<unknown> {
    const viewerId = viewerIdOf(request);
    if (!viewerId) return sendUnauthorized(reply, 'User must be authenticated', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
    const community = await stewardedCommunity(id, viewerId);
    if (!community) return sendNotFound(reply, NOT_FOUND);
    return then(viewerId, community);
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
      description: 'Pending requests to join a community that validates each entry (#19429), most recent first, by pages of `limit` (1-100, default 100) continued with `cursor` = `pagination.nextCursor`. Admins and moderators only; any other reader gets a generic 404.',
      tags: ['communities'],
      summary: 'List pending join requests',
      params: idParams,
      querystring: joinRequestsQuery,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: communityJoinRequestSchema },
            pagination: {
              type: 'object',
              properties: {
                limit: { type: 'integer' },
                hasMore: { type: 'boolean', description: 'Older pending requests remain beyond this page' },
                nextCursor: { type: ['string', 'null'], description: 'Pass as `cursor` to read the next (older) page; null when exhausted' },
                form: { type: 'string', enum: ['keyset'] }
              }
            }
          }
        },
        400: { description: 'Invalid limit or cursor', ...errorResponseSchema },
        ...notFoundResponses
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit = JOIN_REQUESTS_PAGE_MAX, cursor } = request.query as { limit?: number; cursor?: string };
    try {
      return await guarded(request, reply, id, async (viewerId) => {
        const blocked = await getBlockRelatedUserIds(fastify.prisma, viewerId);
        // Le blocage s'exclut EN BASE : une page n'est jamais vidée par ce qu'on retire après.
        const live = liveJoinRequestWhere(new Date());
        const where = blocked.size > 0
          ? { communityId: id, ...live, userId: { notIn: [...blocked] } }
          : { communityId: id, ...live };
        const read = await fastify.prisma.communityJoinRequest.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          include: { user: { select: { ...REQUESTER_SELECT, ...ACCOUNT_STATE_SELECT } } }
        });
        const hasMore = read.length > limit;
        const page = read.slice(0, limit);
        // Le curseur suit la dernière ligne LUE, servie ou non : rien ne se perd entre deux pages.
        const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null;
        // Un compte qui n'est plus utilisable ne part pas, ni l'état du compte.
        const served = page
          .filter((r) => isUsableAccount(r.user) && !blocked.has(r.userId))
          .map(servedRequest);
        return sendSuccess(reply, served, { pagination: { limit, hasMore, nextCursor, form: 'keyset' } });
      });
    } catch (error) {
      logger.error('Error listing community join requests', error as Error);
      return sendInternalError(reply, 'Failed to list join requests');
    }
  });

  /**
   * La demande EN ATTENTE que CET intendant peut trancher : un demandeur au
   * compte utilisable, sans blocage entre eux. Tout le reste est le 404 générique.
   */
  async function decidableRequest(id: string, requestId: string, viewerId: string) {
    const pending = await fastify.prisma.communityJoinRequest.findFirst({
      where: { id: requestId, communityId: id, ...liveJoinRequestWhere(new Date()) },
      select: { id: true, userId: true, via: true, country: true, user: { select: { id: true, ...ACCOUNT_STATE_SELECT } } }
    });
    if (!pending || !isUsableAccount(pending.user)) return null;
    if (await isBlockedBetween(fastify.prisma, viewerId, pending.userId)) return null;
    return pending;
  }

  /** Bascule ATOMIQUE `pending` → décision : deux décisions concurrentes, une seule gagne. */
  async function decide(id: string, requestId: string, viewerId: string, status: 'accepted' | 'rejected'): Promise<boolean> {
    const now = new Date();
    const flipped = await fastify.prisma.communityJoinRequest.updateMany({
      where: { id: requestId, communityId: id, ...liveJoinRequestWhere(now) },
      data: { status, decidedAt: now, decidedBy: viewerId }
    });
    return flipped.count === 1;
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
      return await guarded(request, reply, id, async (viewerId, community) => {
        const pending = await decidableRequest(id, requestId, viewerId);
        if (!pending) return sendNotFound(reply, NOT_FOUND);
        if (!(await decide(id, pending.id, viewerId, 'accepted'))) return sendNotFound(reply, NOT_FOUND);
        try {
          const { member } = await admitCommunityMember(fastify, engagement, {
            communityId: id,
            userId: pending.userId,
            via: joinViaOf(pending.via),
            joinCountry: pending.country ?? null,
            createdBy: community.createdBy,
            decidedBy: viewerId
          });
          return sendSuccess(reply, member);
        } catch (error) {
          // #19914 — seule une entrée qui n'a PAS eu lieu rouvre la demande.
          const after = await membershipAfterFailure(fastify, id, pending.userId);
          if (after.kind === 'entered') {
            logger.warn('join request accepted: entry written despite an error', { requestId: pending.id, error });
            return sendSuccess(reply, after.member);
          }
          if (after.kind === 'unknown') throw error;
          await fastify.prisma.communityJoinRequest
            .updateMany({
              where: { id: pending.id, status: 'accepted', decidedBy: viewerId },
              data: { status: 'pending', decidedAt: null, decidedBy: null }
            })
            .catch((rollback: unknown) => logger.warn('join request rollback failed', { requestId: pending.id, rollback }));
          throw error;
        }
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
        const pending = await decidableRequest(id, requestId, viewerId);
        if (!pending) return sendNotFound(reply, NOT_FOUND);
        if (!(await decide(id, pending.id, viewerId, 'rejected'))) return sendNotFound(reply, NOT_FOUND);
        return sendSuccess(reply, { id: pending.id, status: 'rejected' });
      });
    } catch (error) {
      logger.error('Error rejecting community join request', error as Error);
      return sendInternalError(reply, 'Failed to reject join request');
    }
  });
}
