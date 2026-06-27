/**
 * Tests for hooks/use-conversation-stats.ts
 */

jest.mock('@/utils/language-utils', () => ({
  getLanguageFlag: (code: string) => {
    const flags: Record<string, string> = { fr: '🇫🇷', en: '🇬🇧', es: '🇪🇸', de: '🇩🇪' };
    return flags[code] || '🌐';
  },
}));

import { renderHook } from '@testing-library/react';
import { useConversationStats } from '@/hooks/use-conversation-stats';
import type { Conversation, User, Message } from '@meeshy/shared/types';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    isOnline: false,
    systemLanguage: 'fr',
    ...overrides,
  } as User);

const makeMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: `msg-${Math.random().toString(36).slice(2)}`,
    conversationId: 'conv-1',
    content: 'Hello',
    originalLanguage: 'fr',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Message);

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-1',
    type: 'direct',
    participants: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Conversation);

describe('useConversationStats', () => {
  describe('messageLanguageStats', () => {
    it('returns empty array when no messages', () => {
      const conv = makeConversation();
      const user = makeUser();

      const { result } = renderHook(() => useConversationStats(conv, [], user));

      expect(result.current.messageLanguageStats).toEqual([]);
    });

    it('counts messages by original language', () => {
      const conv = makeConversation();
      const user = makeUser();
      const messages = [
        makeMessage({ originalLanguage: 'fr' }),
        makeMessage({ originalLanguage: 'fr' }),
        makeMessage({ originalLanguage: 'en' }),
      ];

      const { result } = renderHook(() => useConversationStats(conv, messages, user));

      const frStat = result.current.messageLanguageStats.find(s => s.language === 'fr');
      const enStat = result.current.messageLanguageStats.find(s => s.language === 'en');
      expect(frStat?.count).toBe(2);
      expect(enStat?.count).toBe(1);
    });

    it('defaults to fr when originalLanguage is undefined', () => {
      const conv = makeConversation();
      const user = makeUser();
      const messages = [makeMessage({ originalLanguage: undefined })];

      const { result } = renderHook(() => useConversationStats(conv, messages, user));

      expect(result.current.messageLanguageStats[0].language).toBe('fr');
    });

    it('sorts by count descending', () => {
      const conv = makeConversation();
      const user = makeUser();
      const messages = [
        makeMessage({ originalLanguage: 'en' }),
        makeMessage({ originalLanguage: 'fr' }),
        makeMessage({ originalLanguage: 'fr' }),
        makeMessage({ originalLanguage: 'fr' }),
      ];

      const { result } = renderHook(() => useConversationStats(conv, messages, user));

      const stats = result.current.messageLanguageStats;
      expect(stats[0].language).toBe('fr');
      expect(stats[0].count).toBe(3);
      expect(stats[1].language).toBe('en');
      expect(stats[1].count).toBe(1);
    });

    it('includes flag emoji from getLanguageFlag', () => {
      const conv = makeConversation();
      const user = makeUser();
      const messages = [makeMessage({ originalLanguage: 'fr' })];

      const { result } = renderHook(() => useConversationStats(conv, messages, user));

      expect(result.current.messageLanguageStats[0].flag).toBe('🇫🇷');
    });

    it('includes hsl color', () => {
      const conv = makeConversation();
      const user = makeUser();
      const messages = [makeMessage({ originalLanguage: 'fr' })];

      const { result } = renderHook(() => useConversationStats(conv, messages, user));

      expect(result.current.messageLanguageStats[0].color).toMatch(/^hsl\(/);
    });
  });

  describe('activeLanguageStats', () => {
    it('returns empty array when no participants', () => {
      const conv = makeConversation({ participants: [] });
      const user = makeUser();

      const { result } = renderHook(() => useConversationStats(conv, [], user));

      expect(result.current.activeLanguageStats).toEqual([]);
    });

    it('groups participants by system language', () => {
      const conv = makeConversation({
        participants: [
          { id: 'p1', userId: 'u1', user: { systemLanguage: 'fr' } } as any,
          { id: 'p2', userId: 'u2', user: { systemLanguage: 'fr' } } as any,
          { id: 'p3', userId: 'u3', user: { systemLanguage: 'en' } } as any,
        ],
      });
      const user = makeUser();

      const { result } = renderHook(() => useConversationStats(conv, [], user));

      const frStat = result.current.activeLanguageStats.find(s => s.language === 'fr');
      const enStat = result.current.activeLanguageStats.find(s => s.language === 'en');
      expect(frStat?.count).toBe(2);
      expect(enStat?.count).toBe(1);
    });

    it('defaults participant language to fr when systemLanguage missing', () => {
      const conv = makeConversation({
        participants: [{ id: 'p1', userId: 'u1', user: {} } as any],
      });
      const user = makeUser();

      const { result } = renderHook(() => useConversationStats(conv, [], user));

      expect(result.current.activeLanguageStats[0].language).toBe('fr');
    });
  });

  describe('activeUsers', () => {
    it('returns empty array when no participants', () => {
      const conv = makeConversation({ participants: [] });
      const user = makeUser();

      const { result } = renderHook(() => useConversationStats(conv, [], user));

      expect(result.current.activeUsers).toEqual([]);
    });

    it('includes online participants', () => {
      const onlineUser = makeUser({ id: 'u2', isOnline: true });
      const conv = makeConversation({
        participants: [
          { id: 'p1', userId: 'u2', user: onlineUser } as any,
        ],
      });
      const currentUser = makeUser({ id: 'u1' });

      const { result } = renderHook(() => useConversationStats(conv, [], currentUser));

      expect(result.current.activeUsers.some(u => u.id === 'u2')).toBe(true);
    });

    it('includes current user even if not online', () => {
      const offlineOther = makeUser({ id: 'u2', isOnline: false });
      const conv = makeConversation({
        participants: [
          { id: 'p1', userId: 'u2', user: offlineOther } as any,
        ],
      });
      const currentUser = makeUser({ id: 'u1', isOnline: false });

      const { result } = renderHook(() => useConversationStats(conv, [], currentUser));

      // Current user is prepended because they are not found in activeParticipants
      const ids = result.current.activeUsers.map(u => u.id);
      expect(ids).toContain('u1');
    });

    it('does not duplicate current user when they are already in active participants', () => {
      const currentUser = makeUser({ id: 'u1', isOnline: true });
      const conv = makeConversation({
        participants: [
          { id: 'p1', userId: 'u1', user: currentUser } as any,
        ],
      });

      const { result } = renderHook(() => useConversationStats(conv, [], currentUser));

      const u1Count = result.current.activeUsers.filter(u => u.id === 'u1').length;
      expect(u1Count).toBe(1);
    });
  });
});
