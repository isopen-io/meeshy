import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendBadRequest } from '../../utils/response';
import { postInclude, NOT_DELETED } from '../../services/posts/postIncludes';
import { withMentions } from '../../services/posts/postReferences';
import { wireReaderFromRequest, type WireReader } from '../../services/posts/storyEffectsV3';
import { hoistLocationDeep } from '../../services/location/sharedPlace';
import { getCommunityCoMemberIds } from '../../services/posts/communityVisibility';
import { depreciee } from '../../utils/deprecation';

/**
 * GET /posts/hashtag/:tag + GET /hashtags/trending — recherche et tendances
 * de hashtags (Hashtag/PostHashtag, écrits par HashtagService).
 *
 * Design : docs/superpowers/specs/2026-08-03-post-hashtags-and-rich-content-design.md §3
 *
 * Visibilité volontairement PLUS ÉTROITE que le feed personnalisé complet
 * (`buildPostVisibilityOrFilter`, qui inclut FRIENDS/EXCEPT/ONLY) : la
 * découverte par hashtag est une surface de DÉCOUVERTE (comme
 * `getDiscoverStatuses`/`GET /posts/nearby`), pas le feed personnalisé —
 * PUBLIC + COMMUNITY (co-membre) uniquement, jamais FRIENDS-only même si le
 * viewer fait partie de l'audience. Décision assumée (spec §Décisions).
 */

/**
 * Exportée pour `routes/posts/feed.ts` (#4346, `scope=hashtag`) : les mêmes
 * bornes de `cursor`/`limit`, ÉTENDUES par
 * `HashtagPostsQuerySchema.extend({ scope: z.literal('hashtag'), tag: … })`,
 * jamais recopiées.
 */
export const HashtagPostsQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const TrendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, '');
}

export type HashtagFeedResult = {
  readonly data: unknown[];
  readonly pagination: { readonly limit: number; readonly hasMore: boolean; readonly nextCursor: string | null };
};

/**
 * Le NOYAU PARTAGÉ entre `GET /posts/hashtag/:tag` (alias déprécié) et
 * `GET /social/posts?scope=hashtag` (#4346, critère 6 de #4149 : « une
 * fusion qui recopie un handler recrée le doublon qu'elle prétend fermer »).
 * `rawTag` normalise ICI, une seule fois — l'alias le tient d'un segment de
 * chemin, l'union d'un `?tag=` : les deux adresses ne doivent pas pouvoir
 * diverger sur la casse/le `#` intercalés.
 *
 * Visibilité volontairement PLUS ÉTROITE que le feed personnalisé complet —
 * PUBLIC + COMMUNITY (co-membre) + soi-même, jamais FRIENDS-only (doc-comment
 * de tête de fichier, spec §Décisions) — inchangée par cette extraction.
 */
export async function chargerPostsParHashtag(
  prisma: PrismaClient,
  rawTag: string,
  viewerUserId: string,
  params: { cursor: number; limit: number },
  reader: WireReader,
): Promise<HashtagFeedResult> {
  const { cursor, limit } = params;
  const tag = normalizeTag(rawTag);

  const hashtag = await prisma.hashtag.findUnique({ where: { tag } });
  if (!hashtag) {
    return { data: [], pagination: { limit, hasMore: false, nextCursor: null } };
  }

  const links = await prisma.postHashtag.findMany({
    where: { hashtagId: hashtag.id },
    orderBy: { createdAt: 'desc' },
    skip: cursor,
    take: limit + 1,
    select: { postId: true },
  });
  const hasMore = links.length > limit;
  const pageLinks = hasMore ? links.slice(0, limit) : links;
  const orderedIds = pageLinks.map((l) => l.postId);
  const nextCursor = hasMore ? String(cursor + limit) : null;

  if (orderedIds.length === 0) {
    return { data: [], pagination: { limit, hasMore: false, nextCursor: null } };
  }

  const communityCoMemberIds = await getCommunityCoMemberIds(prisma, viewerUserId);
  const posts = await prisma.post.findMany({
    where: {
      id: { in: orderedIds },
      type: { in: ['POST', 'REEL'] },
      deletedAt: NOT_DELETED,
      OR: [
        { authorId: viewerUserId },
        { visibility: 'PUBLIC' },
        { visibility: 'COMMUNITY', authorId: { in: communityCoMemberIds } },
      ],
    },
    include: postInclude,
  });
  const postsById = new Map(posts.map((post) => [post.id, post]));

  const data = orderedIds
    .map((id) => postsById.get(id))
    .filter((post): post is NonNullable<typeof post> => post !== undefined)
    .map((post) => withMentions(hoistLocationDeep(post), reader));

  return { data, pagination: { limit, hasMore, nextCursor } };
}

// #4346 — `/posts/hashtag/:tag` devient un ALIAS déprécié de `scope=hashtag`.
// Le `tag` voyage dans le CHEMIN historique : le successeur est une FONCTION
// de la requête (comme `author`/`community` dans feed.ts), `encodeURIComponent`
// en plus — un tag brut peut porter un espace ou un `&`, que
// `utils/deprecation.ts` (`successeurDe`) rejette sans l'échappement, ce qui
// ferait échouer la déclaration de dépréciation d'une requête par ailleurs
// valide. `/hashtags/trending` (tendances) N'EST PAS concernée : ce n'est
// pas la même question qu'une page de posts, hors périmètre de #4346.
const HASHTAG_SCOPE_DEPUIS = '2026-08-30';

export function registerHashtagRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
) {
  fastify.get('/posts/hashtag/:tag', {
    onRequest: depreciee({
      depuis: HASHTAG_SCOPE_DEPUIS,
      successeur: (request) =>
        `/api/v1/social/posts?scope=hashtag&tag=${encodeURIComponent((request.params as { tag: string }).tag)}`,
    }),
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    if (!authContext?.registeredUser) {
      return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    }

    const parsedQuery = HashtagPostsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    }
    const { cursor, limit } = parsedQuery.data;
    const rawTag = (request.params as { tag: string }).tag;

    const resultat = await chargerPostsParHashtag(
      prisma,
      rawTag,
      authContext.registeredUser.id,
      { cursor, limit },
      wireReaderFromRequest(request as UnifiedAuthRequest),
    );

    return sendSuccess(reply, resultat.data, { pagination: resultat.pagination });
  });

  fastify.get('/hashtags/trending', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    if (!authContext?.registeredUser) {
      return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    }

    const parsed = TrendingQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    }

    const hashtags = await prisma.hashtag.findMany({
      where: { usageCount: { gt: 0 } },
      orderBy: { usageCount: 'desc' },
      take: parsed.data.limit,
      select: { tag: true, usageCount: true },
    });

    return sendSuccess(reply, hashtags);
  });
}
