import type { PaginationMeta, CursorPaginationMeta } from '@meeshy/shared/types';

export interface PaginationParams {
  offset: number;
  limit: number;
}

// Re-export PaginationMeta from shared for convenience
export type { PaginationMeta, CursorPaginationMeta } from '@meeshy/shared/types';

export interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
  maxOffset?: number;
}

export const MAX_PAGINATION_OFFSET = 100_000;

export function validatePagination(
  offset: string = '0',
  limit?: string,
  options: PaginationOptions = {}
): PaginationParams {
  const { defaultLimit = 20, maxLimit = 100, maxOffset = MAX_PAGINATION_OFFSET } = options;
  const offsetNum = Math.min(Math.max(0, parseInt(offset, 10) || 0), maxOffset);
  // `defaultLimit` is the fallback for MISSING/unparsable input only (`NaN`). An
  // explicit but below-minimum value (`'0'`, `'-5'`) is a real parsed number and
  // must clamp to the floor of 1 — not be falsy-coerced to `defaultLimit`. The
  // former `parseInt(...) || defaultLimit` conflated `0` with "absent", so
  // `limit=0` returned a full page (20) while `limit=-5` returned 1.
  const parsedLimit = parseInt(limit ?? '', 10);
  const requestedLimit = Number.isNaN(parsedLimit) ? defaultLimit : parsedLimit;
  const limitNum = Math.min(Math.max(1, requestedLimit), maxLimit);
  return { offset: offsetNum, limit: limitNum };
}

export function buildPaginationMeta(
  total: number,
  offset: number,
  limit: number,
  resultCount: number
): PaginationMeta {
  return {
    total,
    offset,
    limit,
    hasMore: offset + resultCount < total
  };
}

/**
 * Keyset cursor meta (`?cursor=<lastId>&limit=<n>`) for a DB-paginated list.
 *
 * `nextCursor` follows `hasMore`: a cursor is only handed back when a next page
 * actually exists. Gating it on `resultCount > 0` instead emitted a cursor on a
 * partial final page (`hasMore: false`) — a self-contradictory meta that makes a
 * client driving pagination off `nextCursor` issue one extra `?cursor=<lastId>`
 * request that keyset-resolves to an empty page. This is the same rule the
 * sibling {@link sliceByIdCursor} and the canonical `cursorPage`
 * (`utils/cursor-pagination.ts`) already enforce.
 */
export function buildCursorPaginationMeta(
  limit: number,
  resultCount: number,
  lastItemId: string | null
): CursorPaginationMeta {
  const hasMore = resultCount === limit;
  return {
    limit,
    hasMore,
    nextCursor: hasMore ? lastItemId : null
  };
}

/**
 * Windows an already-ordered, already-filtered in-memory list by an `id`
 * cursor. This is the in-memory counterpart of a DB keyset cursor: use it only
 * when the page cannot be expressed as a Prisma `cursor`/`skip` query — e.g. the
 * "top-N most active members" listing, whose list is recomputed on every request
 * from live message-count ranking + presence.
 *
 * Because the list is recomputed each call, a cursor handed out on a previous
 * page routinely names a row that is no longer present (a member dropped out of
 * the ranking, or went offline under `onlineOnly`). A naïve
 * `findIndex(cursor) + 1` collapses that miss to `0` (findIndex → -1), silently
 * re-serving page 1 and duplicating already-seen rows — an infinite-scroll loop.
 * A stale cursor must instead TERMINATE pagination: an unknown cursor yields an
 * empty tail, never a restart.
 */
export function sliceByIdCursor<T extends { id: string }>(
  items: readonly T[],
  cursor: string | undefined,
  pageLimit: number
): { page: T[]; hasMore: boolean; nextCursor: string | null } {
  const foundIndex = cursor ? items.findIndex((item) => item.id === cursor) : -1;
  const startIndex = cursor ? (foundIndex >= 0 ? foundIndex + 1 : items.length) : 0;
  const page = items.slice(startIndex, startIndex + pageLimit);
  const hasMore = startIndex + page.length < items.length;
  return {
    page,
    hasMore,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null
  };
}
