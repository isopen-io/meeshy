import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { SocketClient } from '../net/socket';
import { communityQueryKey, type CommunitySummary } from './communities';
import { bindCommunityLiveLazily } from './community-live-binding';

const CLUB = '6650a0000000000000000001';

const fakeSocket = () => {
  const handlers = new Map<string, (value: unknown) => void>();
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    emit: () => undefined,
    on: (name, handler) => { handlers.set(name, handler as (value: unknown) => void); },
    off: (name) => { handlers.delete(name); },
  };
  return { handlers, socket };
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 100 && !ready(); i += 1) await settle();
  expect(ready()).toBe(true);
};

describe('les communautés vivantes, montées avec la connexion (#18435)', () => {
  test('un community:updated renomme le détail en cache sans écran de communauté ouvert', async () => {
    const queryClient = new QueryClient();
    const cached: CommunitySummary = {
      id: CLUB, identifier: 'mshy_club', name: 'Ancien', description: null, avatar: null, banner: null,
      isPrivate: false, createdBy: 'u-creator', memberCount: 2, conversationCount: 1,
    };
    queryClient.setQueryData(communityQueryKey(CLUB), cached);
    const { socket, handlers } = fakeSocket();
    const off = bindCommunityLiveLazily({ socket, queryClient });
    await until(() => handlers.size === 1);

    handlers.get('community:updated')?.({
      communityId: CLUB, identifier: 'mshy_club', name: 'Nouveau', description: null, avatar: null, banner: null,
      isPrivate: false, memberCount: 2, updatedAt: '2026-11-14T11:00:00.000Z',
    });

    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey(CLUB))?.name).toBe('Nouveau');
    off();
    expect(handlers.size).toBe(0);
  });

  test("un disposer appelé avant l'arrivée du module ne laisse aucun abonnement", async () => {
    const { socket, handlers } = fakeSocket();
    bindCommunityLiveLazily({ socket, queryClient: new QueryClient() })();
    for (let i = 0; i < 20; i += 1) await settle();
    expect(handlers.size).toBe(0);
  });
});
