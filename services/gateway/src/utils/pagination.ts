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
