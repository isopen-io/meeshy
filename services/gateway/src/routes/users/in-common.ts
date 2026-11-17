/**
 * `GET /users/:id/in-common` — ce que le lecteur partage avec la personne dont
 * il ouvre la fiche (#19200, vue « En commun » de la planche du profil) :
 * communautés (dès Communauté), amis (dès Ami), médias des conversations
 * partagées (dès Connaissance).
 *
 * Chaque partie est le verdict de la loi d'accès (`readInCommonParts`). Sous son
 * cercle, une partie rend `{ state: 'locked', circle }` — aucun nombre, aucune
 * liste n'est lue. Une cible bloquée dans un sens ou l'autre, désactivée,
 * introuvable, mal formée, ou soi-même rend la réponse d'un inconnu : 200 et
 * tout fermé (loi 9), jamais un 404 qui distinguerait « absent » de « privé ».
 *
 * Les amis en commun révèlent un lien entre la cible et un tiers : leur partie
 * ne part que si `IN_COMMON_FRIENDS_ENABLED=true` (éteint par défaut).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { RELATION_LEVELS } from '@meeshy/shared/types/relation';
import { IN_COMMON_PARTS, isInCommonPart, type InCommonPart } from '@meeshy/shared/utils/profile-in-common';
import { sendForbidden, sendInternalError, sendSuccess } from '../../utils/response';
import { logError } from '../../utils/logger';
import { commonCommunities, commonFriends, readInCommonParts } from '../../services/relations/inCommon';
import { SHARED_ATTACHMENT_KINDS, SHARED_MEDIA_KINDS, isSharedMediaKind } from '../../services/relations/sharedMedia';
import { sharedMediaPart } from '../../services/relations/sharedLinks';
import { profileViewerId } from './profile-block-gate';

export const inCommonFriendsEnabled = (): boolean => process.env.IN_COMMON_FRIENDS_ENABLED === 'true';

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const LIST_LIMIT_DEFAULT = 50;
const MEDIA_LIMIT_DEFAULT = 30;

type InCommonQuery = {
  parts?: string;
  mediaKind?: string;
  cursor?: string;
  limit?: number;
  listLimit?: number;
};

const circleSchema = { type: 'string', enum: [...RELATION_LEVELS] } as const;
const stateSchema = { type: 'string', enum: ['open', 'locked'] } as const;

const communitySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    identifier: { type: 'string' },
    name: { type: 'string' },
    avatar: { type: 'string', nullable: true },
    isPrivate: { type: 'boolean' },
  },
} as const;

const friendSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    username: { type: 'string' },
    displayName: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    circle: { ...circleSchema, description: 'Circle the VIEWER grants this friend — never the one the target grants' },
  },
} as const;

const mediaSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: [...SHARED_ATTACHMENT_KINDS] },
    messageId: { type: 'string', nullable: true },
    conversationId: { type: 'string' },
    originalName: { type: 'string' },
    mimeType: { type: 'string' },
    fileSize: { type: 'number' },
    fileUrl: { type: 'string' },
    thumbnailUrl: { type: 'string', nullable: true },
    thumbHash: { type: 'string', nullable: true },
    duration: { type: 'number', nullable: true },
    width: { type: 'number', nullable: true },
    height: { type: 'number', nullable: true },
    uploadedBy: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

const linkSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    messageId: { type: 'string' },
    conversationId: { type: 'string' },
    url: { type: 'string' },
    domain: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

const listPartSchema = (items: object) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: ['state', 'circle'],
    properties: {
      state: stateSchema,
      circle: circleSchema,
      total: { type: 'number', description: 'Present only when open' },
      items: { type: 'array', items, description: 'Present only when open' },
    },
  }) as const;

const countsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(SHARED_MEDIA_KINDS.map((kind) => [kind, { type: 'number' }])),
} as const;

const mediaPartSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'circle'],
  properties: {
    state: stateSchema,
    circle: circleSchema,
    counts: countsSchema,
    countsCapped: { type: 'boolean', description: 'Counts read over the most recent attachments only' },
    items: { type: 'array', items: mediaSchema },
    links: { type: 'array', items: linkSchema, description: 'Present only when mediaKind=link — links read in the text of shared messages' },
    pagination: {
      type: 'object',
      additionalProperties: false,
      properties: { limit: { type: 'number' }, hasMore: { type: 'boolean' }, nextCursor: { type: 'string', nullable: true } },
    },
  },
} as const;

export const inCommonResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      properties: {
        parts: {
          type: 'object',
          additionalProperties: false,
          properties: {
            communities: listPartSchema(communitySchema),
            friends: listPartSchema(friendSchema),
            media: mediaPartSchema,
          },
        },
      },
    },
  },
} as const;

/** Les parties demandées, dans l'ordre de la fiche ; inconnues ignorées ; aucune = toutes. */
const wantedParts = (raw: string | undefined): readonly InCommonPart[] => {
  const asked = new Set((raw ?? '').split(',').map((part) => part.trim()).filter(isInCommonPart));
  const parts = asked.size === 0 ? IN_COMMON_PARTS : IN_COMMON_PARTS.filter((part) => asked.has(part));
  return inCommonFriendsEnabled() ? parts : parts.filter((part) => part !== 'friends');
};

export async function getUserInCommon(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string }; Querystring: InCommonQuery }>(
    '/users/:id/in-common',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description:
          'What the viewer shares with another user: communities (from Community), friends (from Friend, behind IN_COMMON_FRIENDS_ENABLED), media of shared conversations (from Acquaintance). Each part is gated by the circle access law; a locked part carries its circle only. A blocked, deactivated, unknown or self target answers exactly like a stranger.',
        tags: ['users'],
        summary: 'Communities, friends and media in common with a user',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        querystring: {
          type: 'object',
          properties: {
            parts: { type: 'string', description: 'Comma-separated subset of communities,friends,media (default: all)' },
            mediaKind: { type: 'string', enum: [...SHARED_MEDIA_KINDS], description: 'Filter the media page by kind' },
            cursor: { type: 'string', description: 'Media keyset cursor — the id of the last item (the message id for links) of the previous page' },
            limit: { type: 'number', minimum: 1, maximum: 100, default: MEDIA_LIMIT_DEFAULT, description: 'Media page size' },
            listLimit: { type: 'number', minimum: 1, maximum: 100, default: LIST_LIMIT_DEFAULT, description: 'Communities and friends list size' },
          },
        },
        response: {
          200: inCommonResponseSchema,
          401: { description: 'Authentication required', ...errorResponseSchema },
          403: { description: 'Registered user required', ...errorResponseSchema },
          500: { description: 'Internal server error', ...errorResponseSchema },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Querystring: InCommonQuery }>, reply: FastifyReply) => {
      const viewerId = profileViewerId(request);
      if (!viewerId) return sendForbidden(reply, 'Utilisateur enregistré requis');

      const targetId = OBJECT_ID.test(request.params.id) ? request.params.id : '';
      const query = request.query;
      const listLimit = query.listLimit ?? LIST_LIMIT_DEFAULT;
      const cursor = query.cursor && OBJECT_ID.test(query.cursor) ? query.cursor : undefined;
      const pair = { viewerId, targetId };

      try {
        const verdicts = await readInCommonParts(fastify.prisma, pair);
        const served = await Promise.all(
          wantedParts(query.parts).map(async (part) => {
            const verdict = verdicts[part];
            if (verdict.state !== 'open') return [part, verdict] as const;
            if (part === 'communities') return [part, { ...verdict, ...(await commonCommunities(fastify.prisma, { ...pair, limit: listLimit })) }] as const;
            if (part === 'friends') return [part, { ...verdict, ...(await commonFriends(fastify.prisma, { ...pair, limit: listLimit })) }] as const;
            const media = await sharedMediaPart(fastify.prisma, {
              ...pair,
              kind: isSharedMediaKind(query.mediaKind) ? query.mediaKind : undefined,
              cursor,
              limit: query.limit ?? MEDIA_LIMIT_DEFAULT,
            });
            return [part, { ...verdict, ...media }] as const;
          }),
        );
        return sendSuccess(reply, { parts: Object.fromEntries(served) });
      } catch (error) {
        logError(fastify.log, '[users/in-common] Failed to resolve what the pair shares', error);
        return sendInternalError(reply, 'Impossible de lire ce que vous avez en commun');
      }
    },
  );
}
