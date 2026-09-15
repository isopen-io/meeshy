import { describe, expect, test } from 'bun:test';

import { flattenConversationPages, nextConversationsCursor, type ConversationsPage } from './conversations-pages';
import { flattenConversationPages as flattenRef } from './conversations-pages';
import type { Conversation } from './types';

const row = (id: string, at: string): Conversation =>
  ({
    id,
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: at,
    updatedAt: at,
  }) as unknown as Conversation;

const pageOf = (rows: readonly Conversation[], overrides: Partial<ConversationsPage> = {}): ConversationsPage => ({
  conversations: rows,
  pagination: { limit: 30, offset: 0, total: rows.length, hasMore: false },
  cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
  ...overrides,
});

describe('flattenConversationPages', () => {
  test('deux pages ⇒ une liste dans l’ordre des pages', () => {
    const data = {
      pages: [pageOf([row('a', '2026-01-01')]), pageOf([row('b', '2026-01-02')])],
      pageParams: [undefined, 'a'],
    };
    const flat = flattenConversationPages(data);
    expect(flat.map((c) => c.id)).toEqual(['a', 'b']);
  });

  test('un même id dans la page 1 ET la page 2 ⇒ une seule rangée, la PREMIÈRE gagne', () => {
    const first = row('a', '2026-01-01');
    const second = { ...row('a', '2026-01-05') };
    const data = { pages: [pageOf([first]), pageOf([second])], pageParams: [undefined, 'a'] };
    const flat = flattenConversationPages(data);
    expect(flat).toHaveLength(1);
    expect(flat[0]?.updatedAt).toEqual(new Date('2026-01-01'));
  });

  test('une page vide n’ajoute rien', () => {
    const data = { pages: [pageOf([row('a', '2026-01-01')]), pageOf([])], pageParams: [undefined, 'a'] };
    expect(flattenConversationPages(data).map((c) => c.id)).toEqual(['a']);
  });

  test('chaque rangée est DÉCODÉE — lastMessageAt/createdAt/updatedAt sont des Date', () => {
    const data = { pages: [pageOf([row('a', '2026-01-01T00:00:00.000Z')])], pageParams: [undefined] };
    const flat = flattenConversationPages(data);
    expect(flat[0]?.createdAt).toBeInstanceOf(Date);
    expect(flat[0]?.updatedAt).toBeInstanceOf(Date);
  });

  test('c’est une fonction de MODULE — même référence entre deux imports', () => {
    expect(flattenConversationPages).toBe(flattenRef);
  });
});

describe('nextConversationsCursor', () => {
  const priorPage = pageOf([row('a', '2026-01-01')]);

  test('nominal : hasMore true, nextCursor neuf, ids neufs ⇒ le curseur', () => {
    const last = pageOf([row('b', '2026-01-02')], { cursorPagination: { limit: 30, hasMore: true, nextCursor: 'b' } });
    expect(nextConversationsCursor(last, [priorPage, last], 'a')).toBe('b');
  });

  test('hasMore:false ⇒ undefined', () => {
    const last = pageOf([row('b', '2026-01-02')]);
    expect(nextConversationsCursor(last, [priorPage, last], 'a')).toBeUndefined();
  });

  test('nextCursor:null ⇒ undefined (même si hasMore était vrai par erreur)', () => {
    const last = pageOf([row('b', '2026-01-02')], { cursorPagination: { limit: 30, hasMore: true, nextCursor: null } });
    expect(nextConversationsCursor(last, [priorPage, last], 'a')).toBeUndefined();
  });

  test('curseur STAGNANT (nextCursor === lastPageParam) ⇒ undefined', () => {
    const last = pageOf([row('b', '2026-01-02')], { cursorPagination: { limit: 30, hasMore: true, nextCursor: 'a' } });
    expect(nextConversationsCursor(last, [priorPage, last], 'a')).toBeUndefined();
  });

  test('zéro id NEUF (la page resservie ne contient que des ids déjà connus) ⇒ undefined', () => {
    const last = pageOf([row('a', '2026-01-01')], { cursorPagination: { limit: 30, hasMore: true, nextCursor: 'x' } });
    expect(nextConversationsCursor(last, [priorPage, last], 'unknown-before')).toBeUndefined();
  });

  test('page vide ⇒ undefined', () => {
    const last = pageOf([], { cursorPagination: { limit: 30, hasMore: true, nextCursor: 'x' } });
    expect(nextConversationsCursor(last, [priorPage, last], 'a')).toBeUndefined();
  });
});
