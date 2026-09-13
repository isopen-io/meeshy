import { describe, expect, test } from 'bun:test';

import { PAGINATION_CONVERSATIONS, pageOfConversations } from './fixtures-pagination';
import { CONVERSATIONS } from './fixtures';
import type { Conversation } from './types';

describe('PAGINATION_CONVERSATIONS', () => {
  test('34 entrées, ids uniques, absents des 11 existantes', () => {
    expect(PAGINATION_CONVERSATIONS).toHaveLength(34);
    const ids = new Set(PAGINATION_CONVERSATIONS.map((c) => c.id));
    expect(ids.size).toBe(34);
    const existingIds = new Set(CONVERSATIONS.filter((c) => !PAGINATION_CONVERSATIONS.includes(c)).map((c) => c.id));
    for (const id of ids) expect(existingIds.has(id)).toBe(false);
  });

  test('CONVERSATIONS.length === 45 — les 34 sont bien fusionnées', () => {
    expect(CONVERSATIONS).toHaveLength(45);
  });

  test('toutes STRICTEMENT plus anciennes que la plus ancienne des 11 existantes', () => {
    const existing = CONVERSATIONS.filter((c) => !PAGINATION_CONVERSATIONS.includes(c));
    const oldestExisting = Math.min(...existing.map((c) => c.lastMessageAt!.getTime()));
    const newestPagination = Math.max(...PAGINATION_CONVERSATIONS.map((c) => c.lastMessageAt!.getTime()));
    expect(newestPagination).toBeLessThan(oldestExisting);
  });

  test('aucune n’est isArchived/isPinned', () => {
    for (const c of PAGINATION_CONVERSATIONS) {
      const prefs = Array.isArray(c.userPreferences) ? c.userPreferences[0] : undefined;
      expect((prefs as { isArchived?: boolean } | undefined)?.isArchived).not.toBe(true);
      expect((prefs as { isPinned?: boolean } | undefined)?.isPinned).not.toBe(true);
    }
  });
});

const row = (id: string, daysAgo: number): Conversation =>
  ({
    id,
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(Date.now() - daysAgo * 86_400_000),
  }) as unknown as Conversation;

describe('pageOfConversations', () => {
  const corpus45 = Array.from({ length: 45 }, (_, i) => row(`c-${i}`, i));

  test('page 1 = 30, triées lastMessageAt desc, hasMore:true, nextCursor = id de la 30ᵉ, total:45', () => {
    const page = pageOfConversations(corpus45, { limit: 30 });
    expect(page.conversations).toHaveLength(30);
    expect(page.conversations[0]?.id).toBe('c-0');
    expect(page.conversations[29]?.id).toBe('c-29');
    expect(page.pagination.total).toBe(45);
    expect(page.pagination.hasMore).toBe(true);
    expect(page.cursorPagination.hasMore).toBe(true);
    expect(page.cursorPagination.nextCursor).toBe('c-29');
  });

  test('before = la 30ᵉ ⇒ 15, hasMore:false, nextCursor:null, total:0 (compte sauté)', () => {
    const page = pageOfConversations(corpus45, { before: 'c-29', limit: 30 });
    expect(page.conversations).toHaveLength(15);
    expect(page.conversations[0]?.id).toBe('c-30');
    expect(page.cursorPagination.hasMore).toBe(false);
    expect(page.cursorPagination.nextCursor).toBeNull();
    expect(page.pagination.total).toBe(0);
  });

  test('corpus de exactement 30 ⇒ page 1 cursorPagination.hasMore:true, page 2 vide hasMore:false', () => {
    const corpus30 = Array.from({ length: 30 }, (_, i) => row(`x-${i}`, i));
    const page1 = pageOfConversations(corpus30, { limit: 30 });
    expect(page1.conversations).toHaveLength(30);
    expect(page1.cursorPagination.hasMore).toBe(true);
    const page2 = pageOfConversations(corpus30, { before: page1.cursorPagination.nextCursor!, limit: 30 });
    expect(page2.conversations).toHaveLength(0);
    expect(page2.cursorPagination.hasMore).toBe(false);
  });

  test('before INCONNU ⇒ la page 1 est resservie', () => {
    const page1 = pageOfConversations(corpus45, { limit: 30 });
    const resent = pageOfConversations(corpus45, { before: 'id-jamais-vu', limit: 30 });
    expect(resent.conversations.map((c) => c.id)).toEqual(page1.conversations.map((c) => c.id));
  });

  test('limit respecté', () => {
    const page = pageOfConversations(corpus45, { limit: 5 });
    expect(page.conversations).toHaveLength(5);
  });
});
