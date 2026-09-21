import { describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';

import { countUnreadConversations, updateAppBadge } from './use-app-badge';

const conversation = (partial: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c-1',
    title: 'Test',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-09-20T00:00:00.000Z'),
    updatedAt: new Date('2026-09-20T00:00:00.000Z'),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

describe('countUnreadConversations — compte les conversations non lues', () => {
  test('retourne 0 si aucune conversation non lue', () => {
    const conversations = [conversation({ unreadCount: 0 }), conversation({ unreadCount: 0 })];
    const count = countUnreadConversations(conversations);
    expect(count).toBe(0);
  });

  test('compte le nombre total de conversations non lues', () => {
    const conversations = [
      conversation({ id: 'c-1', unreadCount: 5 }),
      conversation({ id: 'c-2', unreadCount: 3 }),
      conversation({ id: 'c-3', unreadCount: 0 }),
    ];
    const count = countUnreadConversations(conversations);
    expect(count).toBe(2);
  });

  test('ignore les conversations sans non-lus', () => {
    const conversations = [
      conversation({ id: 'c-1', unreadCount: 1 }),
      conversation({ id: 'c-2', unreadCount: 0 }),
      conversation({ id: 'c-3', unreadCount: 2 }),
    ];
    const count = countUnreadConversations(conversations);
    expect(count).toBe(2);
  });

  test('retourne 0 si aucune conversation', () => {
    const count = countUnreadConversations([]);
    expect(count).toBe(0);
  });

  test('retourne 0 si conversations est undefined', () => {
    const count = countUnreadConversations(undefined);
    expect(count).toBe(0);
  });
});

describe('updateAppBadge — met a jour le badge du navigateur', () => {
  test('appelle setAppBadge(n) quand n > 0', () => {
    let callCount = 0;
    let callArg = 0;
    const mockNavigator = {
      setAppBadge: (n: number) => {
        callCount++;
        callArg = n;
      },
      clearAppBadge: () => {},
    };
    updateAppBadge(3, mockNavigator as any);
    expect(callCount).toBe(1);
    expect(callArg).toBe(3);
  });

  test('appelle clearAppBadge() quand n = 0', () => {
    let callCount = 0;
    const mockNavigator = {
      setAppBadge: () => {},
      clearAppBadge: () => {
        callCount++;
      },
    };
    updateAppBadge(0, mockNavigator as any);
    expect(callCount).toBe(1);
  });

  test('capture les erreurs de setAppBadge', () => {
    const mockNavigator = {
      setAppBadge: () => {
        throw new Error('setAppBadge not supported');
      },
      clearAppBadge: () => {},
    };
    expect(() => updateAppBadge(3, mockNavigator as any)).not.toThrow();
  });

  test('capture les erreurs de clearAppBadge', () => {
    const mockNavigator = {
      setAppBadge: () => {},
      clearAppBadge: () => {
        throw new Error('clearAppBadge not supported');
      },
    };
    expect(() => updateAppBadge(0, mockNavigator as any)).not.toThrow();
  });
});

describe('updateAppBadge — met a jour le titre du document', () => {
  test('prefixe le titre avec (n) quand n > 0', () => {
    const mockDocument = {
      title: 'Meeshy',
    };
    updateAppBadge(5, {} as any, mockDocument as any);
    expect(mockDocument.title).toBe('(5) Meeshy');
  });

  test('retire le prefixe du titre quand n = 0', () => {
    const mockDocument = {
      title: '(3) Meeshy',
    };
    updateAppBadge(0, {} as any, mockDocument as any);
    expect(mockDocument.title).toBe('Meeshy');
  });

  test('ne change pas le titre sil n\'a pas de prefixe et n = 0', () => {
    const mockDocument = {
      title: 'Meeshy',
    };
    updateAppBadge(0, {} as any, mockDocument as any);
    expect(mockDocument.title).toBe('Meeshy');
  });
});
