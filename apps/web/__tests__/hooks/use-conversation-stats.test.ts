/**
 * Tests for hooks/use-conversation-stats.ts
 */

jest.mock('@/utils/language-utils', () => ({
  getLanguageFlag: (lang: string) => `flag:${lang}`,
}));

import { renderHook } from '@testing-library/react';
import { useConversationStats } from '@/hooks/use-conversation-stats';
import type { Conversation, User, Message } from '@meeshy/shared/types';

const makeMessage = (id: string, lang = 'fr'): Message =>
  ({ id, originalLanguage: lang, content: `msg ${id}` } as Message);

const makeParticipant = (userId: string, lang = 'fr', isOnline = false) => ({
  userId,
  id: userId,
  user: { id: userId, username: userId, systemLanguage: lang, isOnline },
});

const makeConversation = (participants: ReturnType<typeof makeParticipant>[] = []): Conversation =>
  ({ id: 'conv-1', type: 'group', participants } as unknown as Conversation);

const currentUser: User = { id: 'user-1', username: 'alice', systemLanguage: 'fr' } as User;

// ─── messageLanguageStats ─────────────────────────────────────────────────────

describe('messageLanguageStats', () => {
  it('returns empty array when messages is empty', () => {
    const conv = makeConversation();
    const { result } = renderHook(() =>
      useConversationStats(conv, [], currentUser)
    );
    expect(result.current.messageLanguageStats).toEqual([]);
  });

  it('aggregates counts per language', () => {
    const messages = [
      makeMessage('m1', 'fr'),
      makeMessage('m2', 'fr'),
      makeMessage('m3', 'en'),
    ];
    const { result } = renderHook(() =>
      useConversationStats(makeConversation(), messages, currentUser)
    );
    const stats = result.current.messageLanguageStats;
    const fr = stats.find(s => s.language === 'fr');
    const en = stats.find(s => s.language === 'en');
    expect(fr?.count).toBe(2);
    expect(en?.count).toBe(1);
  });

  it('sorts by count descending', () => {
    const messages = [makeMessage('m1', 'en'), makeMessage('m2', 'fr'), makeMessage('m3', 'fr')];
    const { result } = renderHook(() =>
      useConversationStats(makeConversation(), messages, currentUser)
    );
    const stats = result.current.messageLanguageStats;
    expect(stats[0].language).toBe('fr');
    expect(stats[1].language).toBe('en');
  });

  it('uses flag from getLanguageFlag', () => {
    const { result } = renderHook(() =>
      useConversationStats(makeConversation(), [makeMessage('m1', 'fr')], currentUser)
    );
    expect(result.current.messageLanguageStats[0].flag).toBe('flag:fr');
  });

  it('falls back to fr when originalLanguage is missing', () => {
    const msg = { id: 'm1', content: 'hi' } as Message;
    const { result } = renderHook(() =>
      useConversationStats(makeConversation(), [msg], currentUser)
    );
    expect(result.current.messageLanguageStats[0].language).toBe('fr');
  });
});

// ─── activeLanguageStats ──────────────────────────────────────────────────────

describe('activeLanguageStats', () => {
  it('returns empty array when no participants', () => {
    const { result } = renderHook(() =>
      useConversationStats(makeConversation([]), [], currentUser)
    );
    expect(result.current.activeLanguageStats).toEqual([]);
  });

  it('aggregates participant languages', () => {
    const participants = [
      makeParticipant('u1', 'fr'),
      makeParticipant('u2', 'fr'),
      makeParticipant('u3', 'en'),
    ];
    const { result } = renderHook(() =>
      useConversationStats(makeConversation(participants), [], currentUser)
    );
    const stats = result.current.activeLanguageStats;
    const fr = stats.find(s => s.language === 'fr');
    expect(fr?.count).toBe(2);
  });

  it('sorts by participant count descending', () => {
    const participants = [
      makeParticipant('u1', 'en'),
      makeParticipant('u2', 'fr'),
      makeParticipant('u3', 'fr'),
    ];
    const { result } = renderHook(() =>
      useConversationStats(makeConversation(participants), [], currentUser)
    );
    expect(result.current.activeLanguageStats[0].language).toBe('fr');
  });
});

// ─── activeUsers ──────────────────────────────────────────────────────────────

describe('activeUsers', () => {
  it('returns empty array when no participants', () => {
    const { result } = renderHook(() =>
      useConversationStats(makeConversation([]), [], currentUser)
    );
    expect(result.current.activeUsers).toEqual([]);
  });

  it('includes online participants', () => {
    const participants = [
      makeParticipant('u2', 'fr', true),
      makeParticipant('u3', 'fr', false),
    ];
    const { result } = renderHook(() =>
      useConversationStats(makeConversation(participants), [], currentUser)
    );
    const ids = result.current.activeUsers.map(u => u.id);
    expect(ids).toContain('u2');
    expect(ids).toContain('user-1'); // currentUser always included
  });

  it('includes currentUser even when not online', () => {
    const participants = [makeParticipant('u2', 'fr', true)];
    const { result } = renderHook(() =>
      useConversationStats(makeConversation(participants), [], currentUser)
    );
    expect(result.current.activeUsers.map(u => u.id)).toContain('user-1');
  });

  it('does not duplicate currentUser if already in participants', () => {
    const participants = [makeParticipant('user-1', 'fr', true)];
    const { result } = renderHook(() =>
      useConversationStats(makeConversation(participants), [], currentUser)
    );
    const ids = result.current.activeUsers.map(u => u.id);
    const duplicates = ids.filter(id => id === 'user-1');
    expect(duplicates).toHaveLength(1);
  });
});
