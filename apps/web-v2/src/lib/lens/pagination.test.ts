import { describe, expect, test } from 'bun:test';

import { LOAD_MORE_LEAD_ROWS, loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from './pagination';

describe('paginationStateOf', () => {
  test('idle : hasNextPage, rien en vol, aucune erreur', () => {
    expect(paginationStateOf({ hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: false })).toBe('idle');
  });

  test('loading-more : en vol, PRIME sur une erreur passée', () => {
    expect(paginationStateOf({ hasNextPage: true, isFetchingNextPage: true, isFetchNextPageError: true })).toBe('loading-more');
  });

  test('error : erreur, rien en vol', () => {
    expect(paginationStateOf({ hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: true })).toBe('error');
  });

  test('exhausted : plus de page, rien en vol, aucune erreur', () => {
    expect(paginationStateOf({ hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false })).toBe('exhausted');
  });

  test('error avec hasNextPage:false ⇒ error, jamais exhausted — on peut réessayer', () => {
    expect(paginationStateOf({ hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: true })).toBe('error');
  });
});

describe('showsAllLoadedHint', () => {
  test('exactement la taille de page ⇒ false', () => {
    expect(showsAllLoadedHint(30, 30)).toBe(false);
  });

  test('une de plus que la taille de page ⇒ true', () => {
    expect(showsAllLoadedHint(31, 30)).toBe(true);
  });
});

describe('loadMoreRootMargin / LOAD_MORE_LEAD_ROWS', () => {
  test('5 rangs de 84 px ⇒ 420 px de marge basse', () => {
    expect(LOAD_MORE_LEAD_ROWS).toBe(5);
    expect(loadMoreRootMargin(84)).toBe('0px 0px 420px 0px');
  });
});
