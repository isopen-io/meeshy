import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { GlobalSearchPagination, GlobalSearchPostType } from '@meeshy/shared/types/global-search';

import type { CacheStore } from '../CacheStore';
import { viewerPostAudience } from '../posts/feedVisibility';
import { NOT_DELETED, postInclude } from '../posts/postIncludes';
import { withMentions, type WireReader } from '../posts/postReferences';
import { withViewerPostState } from '../posts/viewerPostState';
import { hoistLocationDeep } from '../location/sharedPlace';
import { decodeCursor, encodeCursor, keysetBeforeClause, type CursorData } from '../../utils/keyset-cursor';

export { viewerPostAudience };

/**
 * #14620 — LA RECHERCHE GÉNÉRALE DES POSTS, RÉELS ET STORIES.
 *
 * Aucune loi d'audience n'est réécrite ici : la portée est celle du FIL,
 * `buildFeedVisibilityFilter` — PUBLIC, soi, COMMUNITY (co-membre),
 * FRIENDS/EXCEPT (amis ∪ contacts directs), ONLY (nommé), cercles par niveau
 * effectif, auteurs bloqués dans un sens ou dans l'autre exclus. S'y ajoutent
 * deux coupures : le supprimé, et l'EXPIRÉ — une story échue ne se trouve plus,
 * même chez son auteur (son archive vit dans « Mes stories »).
 *
 * Le texte se cherche dans `content` et dans les traductions en clair ; la
 * résolution du texte affiché reste celle de la famille posts du Prisme, chez
 * le client, sur la forme des listes du fil que cette page sert.
 */

export type GlobalPostSearchParams = {
  readonly viewerId: string;
  readonly query: string;
  readonly types: readonly GlobalSearchPostType[];
  readonly limit: number;
  readonly cursor?: string;
  readonly reader: WireReader;
  readonly cache?: CacheStore;
};

export type GlobalPostSearchPage = {
  readonly data: unknown[];
  readonly pagination: GlobalSearchPagination;
};

const TRANSLATION_SCAN_SIZE = 200;

type PostRow = { readonly id: string; readonly createdAt: Date; readonly translations?: unknown };

const notExpired = (now: Date) => ({
  OR: [{ expiresAt: { isSet: false } }, { expiresAt: { equals: null } }, { expiresAt: { gt: now } }],
});

const translationMatches = (translations: unknown, needle: string): boolean => {
  if (!translations || typeof translations !== 'object' || Array.isArray(translations)) return false;
  return Object.values(translations as Record<string, unknown>).some((entry) => {
    if (typeof entry === 'string') return entry.toLowerCase().includes(needle);
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as { isEncrypted?: unknown; text?: unknown };
    return record.isEncrypted !== true && typeof record.text === 'string' && record.text.toLowerCase().includes(needle);
  });
};

const isNewerOrEqual = (row: PostRow, bound: CursorData): boolean => {
  const at = row.createdAt.getTime();
  const boundAt = new Date(bound.createdAt).getTime();
  return at > boundAt || (at === boundAt && row.id >= bound.id);
};

const byRecency = (a: PostRow, b: PostRow): number =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const boundOf = (rows: readonly PostRow[], take: number): CursorData | null => {
  if (rows.length < take) return null;
  const oldest = rows[rows.length - 1];
  return { createdAt: oldest.createdAt.toISOString(), id: oldest.id };
};

const newestBound = (bounds: ReadonlyArray<CursorData | null>): CursorData | null =>
  bounds
    .filter((bound): bound is CursorData => bound !== null)
    .reduce<CursorData | null>((best, bound) => (best === null || !isNewerOrEqual({ id: best.id, createdAt: new Date(best.createdAt) }, bound) ? bound : best), null);

export async function searchPostsForViewer(prisma: PrismaClient, params: GlobalPostSearchParams): Promise<GlobalPostSearchPage> {
  const { viewerId, query, types, limit, reader, cache } = params;
  const needle = query.trim().toLowerCase();
  const cursor = params.cursor ? decodeCursor(params.cursor) : null;
  const audience = await viewerPostAudience(prisma, viewerId, cache);
  const base = {
    deletedAt: NOT_DELETED,
    type: { in: [...types] },
    AND: [audience, notExpired(new Date()), ...(cursor ? [keysetBeforeClause(cursor)] : [])],
  };
  const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
  const take = limit + 1;
  const [contentRows, translationRows] = (await Promise.all([
    prisma.post.findMany({ where: { ...base, content: { contains: needle, mode: 'insensitive' } }, select: postInclude, orderBy, take }),
    prisma.post.findMany({ where: { ...base, translations: { not: { equals: null } } }, select: postInclude, orderBy, take: TRANSLATION_SCAN_SIZE }),
  ])) as unknown as [PostRow[], PostRow[]];

  const bound = newestBound([boundOf(contentRows, take), boundOf(translationRows, TRANSLATION_SCAN_SIZE)]);
  const seen = new Set<string>();
  const merged = [...contentRows, ...translationRows.filter((row) => translationMatches(row.translations, needle))]
    .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
    .filter((row) => bound === null || isNewerOrEqual(row, bound))
    .sort(byRecency);

  const pageFull = merged.length > limit;
  const page = merged.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = pageFull && last ? encodeCursor(last.createdAt, last.id) : bound ? encodeCursor(bound.createdAt, bound.id) : null;

  const withState = await withViewerPostState(prisma, viewerId, page as never[]);
  return {
    data: withState.map((post) => withMentions(hoistLocationDeep(post), reader)),
    pagination: { limit, hasMore: nextCursor !== null, nextCursor },
  };
}
