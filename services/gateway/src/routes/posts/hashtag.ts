import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { apiPath } from '@meeshy/shared/api/prefix';
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

  const communityCoMemberIds = await getCommunityCoMemberIds(prisma, viewerUserId);

  // `hasMore` se calcule APRÈS le filtrage d'audience, jamais avant (#4339,
  // critère 3 de #4149). L'ancienne forme lisait `limit + 1` LIENS
  // `PostHashtag` et en tirait `hasMore` : sur un tag dont vingt posts sur
  // vingt-trois sont privés, elle rendait trois posts avec `hasMore: false` —
  // une FIN DE FIL annoncée à tort, et la page suivante jamais demandée. Le
  // symptôme n'est pas « une page courte », que tout client tolère, mais
  // « le fil s'arrête », que personne ne voit passer.
  //
  // On lit donc les liens par LOTS et on accumule jusqu'à `limit + 1` posts
  // VISIBLES. Le curseur reste un décalage dans la collection des liens — la
  // seule qui soit stable — et pointe le lien SUIVANT celui du dernier post
  // servi, jamais la fin du lot lu : les liens filtrés du lot ne doivent pas
  // être re-balayés, mais ceux qui suivent le dernier servi doivent l'être.
  const TAILLE_LOT = Math.max(limit * 4, 20);
  const LOTS_MAX = 5;

  const servis: Array<{ readonly post: unknown; readonly decalageApres: number }> = [];
  let decalage = cursor;
  let lotsLus = 0;
  let restentDesLiens = true;

  while (servis.length <= limit && restentDesLiens && lotsLus < LOTS_MAX) {
    const links = await prisma.postHashtag.findMany({
      where: { hashtagId: hashtag.id },
      orderBy: { createdAt: 'desc' },
      skip: decalage,
      take: TAILLE_LOT,
      select: { postId: true },
    });
    lotsLus += 1;
    restentDesLiens = links.length === TAILLE_LOT;
    if (links.length === 0) break;

    const posts = await prisma.post.findMany({
      where: {
        id: { in: links.map((l) => l.postId) },
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

    for (const [index, lien] of links.entries()) {
      const post = postsById.get(lien.postId);
      if (!post) continue;
      servis.push({
        post: withMentions(hoistLocationDeep(post), reader),
        decalageApres: decalage + index + 1,
      });
      if (servis.length > limit) break;
    }
    decalage += links.length;
  }

  // Deux raisons de dire « il y en a d'autres », et elles ne se confondent
  // pas : on a servi plus que la page (cas nominal), ou on a atteint la borne
  // de lots sans remplir la page — auquel cas le curseur repart d'où le
  // balayage s'est arrêté, sans quoi les liens non lus seraient perdus.
  const pageComplete = servis.length > limit;
  const borneAtteinte = lotsLus >= LOTS_MAX && restentDesLiens;
  const hasMore = pageComplete || borneAtteinte;

  const page = servis.slice(0, limit);
  const nextCursor = !hasMore
    ? null
    : String(pageComplete && page.length > 0 ? page[page.length - 1].decalageApres : decalage);

  return { data: page.map((s) => s.post), pagination: { limit, hasMore, nextCursor } };
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
        `${apiPath('/social/posts')}?scope=hashtag&tag=${encodeURIComponent((request.params as { tag: string }).tag)}`,
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
