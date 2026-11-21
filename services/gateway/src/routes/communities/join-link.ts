/**
 * Le lien d'entrée d'une communauté se met en pause (#19661).
 *
 * Un « lien de communauté » n'est pas une entité : c'est l'adresse canonique
 * de la communauté (`/chat/<identifier>`). Le suspendre ne touche ni à la
 * communauté (`isActive` reste la désactivation ADMINISTRATIVE, #8876) ni à ses
 * membres : `joinLinkPausedAt` dit seulement qu'on n'entre plus PAR LE LIEN
 * (`POST /communities/:id/join` avec `via: 'link'` ⇒ 403
 * `COMMUNITY_LINK_PAUSED`, `membership.ts`).
 *
 * Réservé à ceux qui animent ou modèrent (`isCommunitySteward`, la porte des
 * entrées) d'une communauté ACTIVE ; tout autre lecteur reçoit le MÊME 404
 * qu'une communauté absente. Seul l'état part, jamais rien d'autre de la ligne.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response.js';
import { isCommunitySteward } from '../../services/community-entries';

const logger = enhancedLogger.child({ module: 'CommunityJoinLinkRoutes' });

const OBJECT_ID = '^[0-9a-fA-F]{24}$';

const JoinLinkStateSchema = z.object({ paused: z.boolean() }).strict();

const joinLinkStateSchema = {
  type: 'object',
  properties: {
    joinLinkPausedAt: { type: 'string', format: 'date-time', nullable: true, description: 'When the entry link was paused; null = active' }
  }
} as const;

function viewerIdOf(request: unknown): string | null {
  const authContext = (request as UnifiedAuthRequest).authContext;
  return authContext?.isAuthenticated && authContext.registeredUser ? authContext.userId : null;
}

/** L'instant servi après la demande : une pause déjà posée garde le sien, une reprise l'efface. */
export function nextJoinLinkPause(current: Date | null, paused: boolean, now: Date): Date | null {
  if (!paused) return null;
  return current ?? now;
}

export async function registerJoinLinkRoutes(fastify: FastifyInstance) {
  fastify.put('/communities/:id/join-link', {
    onRequest: [fastify.authenticate],
    schema: {
      description: "Pause or resume a community entry link (#19661). While paused, joining through the link is refused (403 COMMUNITY_LINK_PAUSED); the community, its members, direct joining of a public community and named invitations are untouched. Pausing an already paused link keeps its instant. Admins, moderators and the creator only; any other reader gets a generic 404.",
      tags: ['communities'],
      summary: 'Pause or resume a community entry link',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', pattern: OBJECT_ID, description: 'Community unique ID' } }
      },
      body: {
        type: 'object',
        required: ['paused'],
        additionalProperties: false,
        properties: { paused: { type: 'boolean', description: 'true pauses the link, false resumes it' } }
      },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: joinLinkStateSchema } },
        400: { description: 'Invalid body', ...errorResponseSchema },
        401: { description: 'User not authenticated', ...errorResponseSchema },
        404: { description: 'Community not found, or the reader neither animates nor moderates it', ...errorResponseSchema },
        500: { description: 'Internal server error', ...errorResponseSchema }
      }
    }
  }, async (request, reply) => {
    const viewerId = viewerIdOf(request);
    if (!viewerId) return sendUnauthorized(reply, 'User must be authenticated');

    const parsed = JoinLinkStateSchema.safeParse(request.body ?? {});
    if (!parsed.success) return sendBadRequest(reply, 'Invalid join link state', { code: 'INVALID_JOIN_LINK_STATE' });

    const { id } = request.params as { id: string };

    try {
      const community = await fastify.prisma.community.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          createdBy: true,
          joinLinkPausedAt: true,
          members: { where: { userId: viewerId, isActive: true }, select: { userId: true, role: true } }
        }
      });
      if (!community || !isCommunitySteward(community, viewerId)) return sendNotFound(reply, 'Community not found');

      const current = community.joinLinkPausedAt ?? null;
      const next = nextJoinLinkPause(current, parsed.data.paused, new Date());
      if (next !== current) {
        await fastify.prisma.community.update({ where: { id: community.id }, data: { joinLinkPausedAt: next } });
      }
      return sendSuccess(reply, { joinLinkPausedAt: next });
    } catch (error) {
      logger.error('Error updating community join link state', error as Error);
      return sendInternalError(reply, 'Failed to update the community join link');
    }
  });
}
