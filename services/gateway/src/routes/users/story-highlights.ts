/**
 * Les stories « à la une » (#19394, décision #19393, chantier #18857).
 *
 * - `GET /users/:id/highlights` : les albums d'une personne tels que CE lecteur peut les lire —
 *   chaque story sous sa propre audience, même expirée ; un album vide pour lui est omis. Un
 *   identifiant illisible, une cible bloquée ou inconnue rend une liste vide (jamais un 404
 *   qui distinguerait l'absent du privé). Comme toute la fiche depuis #10205, un compte est
 *   requis : un anonyme reçoit 401, un invité 403.
 * - `/users/me/highlights` : l'auteur lit tous ses albums (vides compris), en crée, les modifie,
 *   les supprime et les réordonne, avec ses seules stories. L'album d'autrui est un 404.
 *
 * Une écriture acceptée change la fiche de ses lecteurs : ils la revalident
 * (`announceProfileChanged`, #19384).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  STORY_HIGHLIGHT_GLYPH_MAX_LENGTH,
  STORY_HIGHLIGHT_MAX_STORIES,
  STORY_HIGHLIGHT_TITLE_MAX_LENGTH,
} from '@meeshy/shared/types/story-highlight';
import {
  createStoryHighlight,
  deleteStoryHighlight,
  readStoryHighlights,
  reorderStoryHighlights,
  updateStoryHighlight,
  type HighlightOutcome,
} from '../../services/posts/storyHighlights';
import { announceProfileChanged } from '../../services/notifications/profile-changed';
import { sendBadRequest, sendConflict, sendForbidden, sendInternalError, sendNotFound, sendSuccess, sendUnauthorized } from '../../utils/response';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import { logError } from '../../utils/logger';
import { profileViewerId } from './profile-block-gate';

const highlightSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string', maxLength: STORY_HIGHLIGHT_TITLE_MAX_LENGTH },
    glyph: { type: 'string', maxLength: STORY_HIGHLIGHT_GLYPH_MAX_LENGTH, description: 'Icon name from the profile board set (map-pin, moon…)' },
    order: { type: 'integer' },
    storyIds: { type: 'array', items: { type: 'string' }, description: 'Only the stories THIS reader may read, in album order' },
    storyCount: { type: 'integer' },
    stories: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Served story payloads, same shape as a profile post' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const listSchema = {
  type: 'object',
  properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { highlights: { type: 'array', items: highlightSchema } } } },
} as const;
const oneSchema = { type: 'object', properties: { success: { type: 'boolean' }, data: highlightSchema } } as const;

const bodyProperties = {
  title: { type: 'string' },
  glyph: { type: 'string' },
  storyIds: { type: 'array', items: { type: 'string' }, maxItems: STORY_HIGHLIGHT_MAX_STORIES },
} as const;
const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } as const;

function answer<T>(reply: FastifyReply, outcome: HighlightOutcome<T>, statusCode = 200) {
  if (outcome.ok === true) return sendSuccess(reply, outcome.value, { statusCode });
  const { status, error, code } = outcome.refusal;
  if (status === 404) return sendNotFound(reply, error);
  if (status === 409) return sendConflict(reply, error, { code });
  return sendBadRequest(reply, error, { code });
}

export async function storyHighlightRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const announced = <T>(ownerId: string, outcome: HighlightOutcome<T>): HighlightOutcome<T> => {
    if (outcome.ok === true) void announceProfileChanged(fastify, { userId: ownerId });
    return outcome;
  };
  const owner = (request: FastifyRequest, reply: FastifyReply): string | null => {
    const ownerId = profileViewerId(request) ?? null;
    if (ownerId === null) sendUnauthorized(reply, 'Authentication required', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
    return ownerId;
  };
  const common = { onRequest: [fastify.authenticate], tags: ['users'] };
  const errors = { 400: errorResponseSchema, 401: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema };

  fastify.get<{ Params: { id: string } }>('/users/:id/highlights', {
    onRequest: common.onRequest,
    schema: {
      tags: common.tags,
      summary: 'A person’s highlighted stories, as this reader may read them',
      description:
        'Albums of stories pinned by their author. Each story is served only if its own audience (visibility, named viewers, circles, community, blocking) admits THIS reader, even after its 20-hour expiry; an album with no readable story is omitted. A registered account is required, as for every profile read.',
      params: idParams,
      response: { 200: listSchema, 401: errorResponseSchema, 403: errorResponseSchema, 500: errorResponseSchema },
    },
  }, async (request, reply) => {
    const viewerId = profileViewerId(request);
    if (!viewerId) return sendForbidden(reply, 'Utilisateur enregistré requis');
    try {
      const highlights = await readStoryHighlights(prisma, { ownerId: request.params.id, viewerId, keepEmpty: false });
      return sendSuccess(reply, { highlights });
    } catch (error) {
      logError(fastify.log, '[users/highlights] Failed to read highlights', error);
      return sendInternalError(reply, 'Impossible de lire les stories à la une');
    }
  });

  fastify.get('/users/me/highlights', {
    onRequest: common.onRequest,
    schema: { tags: common.tags, summary: 'My highlighted stories', description: 'Every album of the authenticated user, empty ones included.', response: { 200: listSchema, 401: errorResponseSchema } },
  }, async (request, reply) => {
    const ownerId = owner(request, reply);
    if (ownerId === null) return;
    return sendSuccess(reply, { highlights: await readStoryHighlights(prisma, { ownerId, viewerId: ownerId, keepEmpty: true }) });
  });

  fastify.post('/users/me/highlights', {
    onRequest: common.onRequest,
    schema: {
      tags: common.tags,
      summary: 'Create a highlight album',
      description: `Title (1-${STORY_HIGHLIGHT_TITLE_MAX_LENGTH}), glyph (icon name), and the author’s own non-deleted stories, in order.`,
      body: { type: 'object', properties: bodyProperties },
      response: { 201: oneSchema, ...errors },
    },
  }, async (request, reply) => {
    const ownerId = owner(request, reply);
    if (ownerId === null) return;
    return answer(reply, announced(ownerId, await createStoryHighlight(prisma, ownerId, request.body ?? {})), 201);
  });

  fastify.put<{ Body: { ids: string[] } }>('/users/me/highlights/order', {
    onRequest: common.onRequest,
    schema: {
      tags: common.tags,
      summary: 'Reorder my highlight albums',
      description: 'Lists every album id exactly once, in the new order.',
      body: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string' } } } },
      response: { 200: listSchema, ...errors },
    },
  }, async (request, reply) => {
    const ownerId = owner(request, reply);
    if (ownerId === null) return;
    const outcome = announced(ownerId, await reorderStoryHighlights(prisma, ownerId, request.body));
    return outcome.ok === true ? sendSuccess(reply, { highlights: outcome.value }) : answer(reply, outcome);
  });

  fastify.patch<{ Params: { id: string } }>('/users/me/highlights/:id', {
    onRequest: common.onRequest,
    schema: { tags: common.tags, summary: 'Edit a highlight album', params: idParams, body: { type: 'object', properties: bodyProperties }, response: { 200: oneSchema, ...errors } },
  }, async (request, reply) => {
    const ownerId = owner(request, reply);
    if (ownerId === null) return;
    return answer(reply, announced(ownerId, await updateStoryHighlight(prisma, ownerId, request.params.id, request.body ?? {})));
  });

  fastify.delete<{ Params: { id: string } }>('/users/me/highlights/:id', {
    onRequest: common.onRequest,
    schema: {
      tags: common.tags,
      summary: 'Delete a highlight album',
      params: idParams,
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { deleted: { type: 'boolean' } } } } }, 401: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const ownerId = owner(request, reply);
    if (ownerId === null) return;
    const outcome = announced(ownerId, await deleteStoryHighlight(prisma, ownerId, request.params.id));
    return outcome.ok === true ? sendSuccess(reply, { deleted: true }) : answer(reply, outcome);
  });
}
