import type { PaginationMeta, CursorPaginationMeta } from '@meeshy/shared/types';

export interface PaginationParams {
  offset: number;
  limit: number;
}

// Re-export PaginationMeta from shared for convenience
export type { PaginationMeta, CursorPaginationMeta } from '@meeshy/shared/types';

export function validatePagination(
  offset: string = '0',
  limit: string = '20',
  maxLimit: number = 100
): PaginationParams {
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 20), maxLimit);
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

export function buildCursorPaginationMeta(
  limit: number,
  resultCount: number,
  lastItemId: string | null
): CursorPaginationMeta {
  return {
    limit,
    hasMore: resultCount === limit,
    nextCursor: resultCount > 0 ? lastItemId : null
  };
}
