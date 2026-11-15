import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { accentOf } from '@/lib/accent';
import { APPEARANCE_GAMUT } from '@meeshy/shared/utils/appearance-gamut';

import { bindAppearanceLiveLazily } from './appearance-live';
import { CONVERSATIONS_QUERY_KEY, findCachedConversation } from './conversations';
import type { Conversation } from './types';

const row = { id: 'c1', type: 'group', title: 'Équipe', status: 'active', visibility: 'private', isActive: true, memberCount: 3, participants: [], createdAt: new Date(), updatedAt: new Date() } as unknown as Conversation;

const fakeSocket = () => {
  const handlers = new Map<string, (value: unknown) => void>();
  return {
    handlers,
    socket: { connected: true, connect: () => undefined, disconnect: () => undefined, emit: () => undefined, on: (e: string, h: (v: unknown) => void) => void handlers.set(e, h), off: (e: string) => void handlers.delete(e) },
  };
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 100 && !ready(); i += 1) await settle();
  expect(ready()).toBe(true);
};

describe('l’apparence vivante montée avec la connexion (sans fil ouvert)', () => {
  test('un user:preferences-updated avec appearance repeint la ligne de liste du cache', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
      pages: [{ conversations: [row], pagination: { limit: 30, offset: 0, total: 1, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
      pageParams: [undefined],
    });
    const { socket, handlers } = fakeSocket();
    const off = bindAppearanceLiveLazily({ socket: socket as never, queryClient });
    await until(() => handlers.size === 1);
    handlers.get('user:preferences-updated')?.({
      conversationId: 'c1',
      version: 1,
      preferences: { appearance: { v: 1, background: { kind: 'signature' }, accent: 'corail', animate: true } },
    });
    const served = findCachedConversation(queryClient, 'c1');
    expect(served).toBeDefined();
    expect(accentOf(served as Conversation).toUpperCase()).toBe(APPEARANCE_GAMUT.corail.dark.accent.toUpperCase());
    off();
    expect(handlers.size).toBe(0);
  });

  test('un disposer appelé avant l’arrivée du module ne laisse aucun abonnement', async () => {
    const { socket, handlers } = fakeSocket();
    bindAppearanceLiveLazily({ socket: socket as never, queryClient: new QueryClient() })();
    for (let i = 0; i < 20; i += 1) await settle();
    expect(handlers.size).toBe(0);
  });
});
