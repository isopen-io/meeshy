import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType } from '@meeshy/shared/prisma/client';

import { decodeCursor, encodeCursor } from '../../routes/posts/types';
import { blockedIdsAroundViewer } from '../ContactDirectoryService';
import { hoistLocationDeep } from '../location/sharedPlace';
import { isActiveCommunityMember } from './communityVisibility';
import { NOT_DELETED, postInclude } from './postIncludes';
import { withMentions, type WireReader } from './postReferences';
import { withViewerPostState } from './viewerPostState';

/**
 * Ce que le lecteur peut lire des publications d'une communauté (#6379).
 *
 * - `none` : la communauté est désactivée, inconnue, ou PRIVÉE et le lecteur
 *   n'en est ni membre actif ni créateur — la même loi que le détail
 *   (`GET /communities/:id`), qui refuse ces cas. Une publication PUBLIC d'une
 *   communauté privée reste lisible là où son auteur l'a publiée (son profil,
 *   le fil), jamais par la porte de la communauté.
 * - `public` : un non-membre (ou un visiteur sans compte) d'une communauté
 *   publique.
 * - `member` : un membre actif ou le créateur.
 *
 * Une panne de la lecture d'adhésion vaut « pas membre » (`isActiveCommunityMember`),
 * donc `none` sur une communauté privée ; une panne de la lecture de la
 * communauté lève.
 */
export type CommunityFeedAccess = 'none' | 'public' | 'member';

export async function communityFeedAccess(
  prisma: PrismaClient,
  communityId: string,
  viewerUserId: string | undefined,
): Promise<CommunityFeedAccess> {
  const community = await prisma.community.findFirst({
    where: { id: communityId, isActive: true },
    select: { isPrivate: true, createdBy: true },
  });
  if (community === null) return 'none';
  const isMember =
    viewerUserId !== undefined &&
    (community.createdBy === viewerUserId || (await isActiveCommunityMember(prisma, viewerUserId, communityId)));
  if (isMember) return 'member';
  return community.isPrivate ? 'none' : 'public';
}

const EMPTY_PAGE = { items: [], nextCursor: null, hasMore: false } as const;

export async function loadCommunityFeed(
  prisma: PrismaClient,
  params: {
    readonly communityId: string;
    readonly viewerUserId: string | undefined;
    readonly cursor?: string;
    readonly limit: number;
    readonly reader?: WireReader;
  },
) {
  const access = await communityFeedAccess(prisma, params.communityId, params.viewerUserId);
  if (access === 'none') return EMPTY_PAGE;

  const blockedAuthorIds = params.viewerUserId === undefined ? [] : await blockedIdsAroundViewer(prisma, params.viewerUserId);
  const cursorData = params.cursor ? decodeCursor(params.cursor) : null;

  const posts = await prisma.post.findMany({
    where: {
      communityId: params.communityId,
      deletedAt: NOT_DELETED,
      type: { in: [PostType.POST, PostType.REEL] },
      visibility: access === 'member' ? { in: ['PUBLIC', 'COMMUNITY'] } : 'PUBLIC',
      ...(blockedAuthorIds.length > 0 ? { authorId: { notIn: blockedAuthorIds } } : {}),
      ...(cursorData
        ? {
            OR: [
              { createdAt: { lt: new Date(cursorData.createdAt) } },
              { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
            ],
          }
        : {}),
    },
    select: postInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: params.limit + 1,
  });

  const hasMore = posts.length > params.limit;
  const items = hasMore ? posts.slice(0, params.limit) : posts;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last !== undefined ? encodeCursor(last.createdAt, last.id) : null;

  const withState = await withViewerPostState(prisma, params.viewerUserId, items);

  return {
    items: withState.map((post) => withMentions(hoistLocationDeep(post), params.reader)),
    nextCursor,
    hasMore,
  };
}
