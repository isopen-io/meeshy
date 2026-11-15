import type { PostVisibility } from '@meeshy/shared/prisma/client';

type RepostSource = { readonly visibility: PostVisibility | string; readonly communityId: string | null };

/**
 * La communauté d'une republication (#16892). Une publication `COMMUNITY` posée
 * dans une communauté ne se lit que par ses membres : la republier hors de cette
 * communauté la rouvrirait à la règle « co-membre de n'importe quelle communauté
 * du republieur ». La republication HÉRITE donc la communauté de sa source, et un
 * `communityId` demandé qui en diffère est refusé (403
 * `REPOST_COMMUNITY_MISMATCH`). Toute autre source garde la communauté demandée.
 */
export function repostCommunityId(source: RepostSource, requested: string | undefined): string | undefined {
  if (source.visibility !== 'COMMUNITY' || !source.communityId) return requested;
  if (requested !== undefined && requested !== source.communityId) {
    throw Object.assign(new Error('A repost stays in the community of its source'), {
      statusCode: 403,
      code: 'REPOST_COMMUNITY_MISMATCH',
    });
  }
  return source.communityId;
}
