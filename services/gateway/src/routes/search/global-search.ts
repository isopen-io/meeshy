import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  GLOBAL_SEARCH_CAPS_HEADER,
  GLOBAL_SEARCH_PROTECTION_CAPS,
  globalSearchQuerySchema,
  postSearchQuerySchema,
} from '@meeshy/shared/types/global-search';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

import type { UnifiedAuthRequest } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import { searchMessagesForReader } from '../../services/search/globalMessageSearch';
import { searchPostsForViewer } from '../../services/search/globalPostSearch';
import { wireReaderFromRequest } from '../../services/posts/storyEffectsV3';
import { RECIPIENT_LANG_SELECT, recipientLanguages } from '../../utils/recipient-language';
import { sendBadRequest, sendInternalError, sendSuccess, sendUnauthorized } from '../../utils/response';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'GlobalSearchRoutes' });

/**
 * La recherche GLOBALE (#14619, #14620) — contrat posté sur les deux issues.
 * Réservée aux comptes inscrits : un invité de lien n'a qu'une conversation,
 * dont la recherche vit sous `GET /conversations/:id/messages/search`.
 */

const nullableString = { type: 'string', nullable: true } as const;

const pagination = {
  type: 'object',
  properties: { limit: { type: 'integer' }, hasMore: { type: 'boolean' }, nextCursor: nullableString },
} as const;

const messageSearchHitResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    conversationId: { type: 'string' },
    createdAt: { type: 'string' },
    messageType: { type: 'string' },
    content: { type: 'string' },
    servedLanguage: nullableString,
    originalContent: { type: 'string' },
    originalLanguage: nullableString,
    isBlurred: { type: 'boolean' },
    match: { type: 'string', enum: ['content', 'transcript'] },
    transcript: {
      type: 'object',
      nullable: true,
      properties: {
        attachmentId: { type: 'string' },
        mediaKind: { type: 'string', enum: ['audio', 'video', 'image', 'document'] },
        text: { type: 'string' },
        servedLanguage: nullableString,
        durationMs: { type: 'integer', nullable: true },
      },
    },
    sender: {
      type: 'object',
      nullable: true,
      properties: { id: { type: 'string' }, userId: nullableString, displayName: { type: 'string' }, username: nullableString, avatar: nullableString },
    },
    conversation: {
      type: 'object',
      properties: { id: { type: 'string' }, identifier: nullableString, type: { type: 'string' }, title: { type: 'string' }, avatar: nullableString },
    },
  },
} as const;

const registeredViewerId = (request: FastifyRequest): string | null => {
  const registeredUser = (request as UnifiedAuthRequest).authContext?.registeredUser;
  return registeredUser && !(request as UnifiedAuthRequest).authContext.isAnonymous ? registeredUser.id : null;
};

/** #16957 — un client qui ne déclare pas savoir voiler ne reçoit aucun flouté. */
const declaresProtectionCaps = (request: FastifyRequest): boolean => {
  const raw = request.headers[GLOBAL_SEARCH_CAPS_HEADER.toLowerCase()];
  const value = Number.parseInt(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '', 10);
  return Number.isFinite(value) && value >= GLOBAL_SEARCH_PROTECTION_CAPS;
};

const querySummary = (raw: unknown) => ({ q: typeof (raw as { q?: unknown })?.q === 'string' ? '[redacted]' : undefined });

export function registerGlobalMessageSearchRoute(fastify: FastifyInstance, prisma: PrismaClient, requiredAuth: unknown) {
  fastify.get('/messages/search', {
    schema: {
      description: 'Search messages across every conversation the reader is an active member of (#14619)',
      tags: ['messages', 'search'],
      summary: 'Global message search',
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: messageSearchHitResponseSchema }, pagination } },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    preValidation: [requiredAuth as never],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const viewerId = registeredViewerId(request);
    if (!viewerId) return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    const parsed = globalSearchQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    try {
      const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: RECIPIENT_LANG_SELECT });
      const page = await searchMessagesForReader(prisma, {
        userId: viewerId,
        languages: recipientLanguages(viewer),
        query: parsed.data.q,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
        protectionCaps: declaresProtectionCaps(request),
      });
      return sendSuccess(reply, page.data, { pagination: page.pagination });
    } catch (error) {
      logger.error('Global message search failed', { error, ...querySummary(request.query) });
      return sendInternalError(reply, 'Error searching messages');
    }
  });
}

export function registerGlobalPostSearchRoute(fastify: FastifyInstance, prisma: PrismaClient, requiredAuth: unknown) {
  fastify.get('/posts/search', {
    schema: {
      description: 'Search posts, reels and stories the viewer may see (#14620)',
      tags: ['posts', 'search'],
      summary: 'Global post search',
      response: {
        // `data` sans `items` : un tableau non décrit laisse passer la forme des listes du fil (aucune route de post ne la déclare),
        // dont l'unique frontière est `withMentions` (#10945).
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array' }, pagination } },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    preValidation: [requiredAuth as never],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const viewerId = registeredViewerId(request);
    if (!viewerId) return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    const parsed = postSearchQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    try {
      const page = await searchPostsForViewer(prisma, {
        viewerId,
        query: parsed.data.q,
        types: parsed.data.types,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
        reader: wireReaderFromRequest(request as UnifiedAuthRequest),
        cache: getCacheStore(),
      });
      return sendSuccess(reply, page.data, { pagination: page.pagination });
    } catch (error) {
      logger.error('Global post search failed', { error, ...querySummary(request.query) });
      return sendInternalError(reply, 'Error searching posts');
    }
  });
}
