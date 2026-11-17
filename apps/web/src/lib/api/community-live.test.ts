import { describe, expect, test } from 'bun:test';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type { CommunityUpdatedEventData } from '@meeshy/shared/types/socketio-events';

import type { SocketClient } from '../net/socket';
import { communitiesQueryKey, communityQueryKey, type CommunityPage, type CommunitySummary } from './communities';
import { applyCommunityUpdatedEvent, bindCommunityLive } from './community-live';

/**
 * **L'IDENTITÉ D'UNE COMMUNAUTÉ SUIT SES RÉGLAGES** (#18435) — `community:updated`.
 * Chaque témoin assert sur ce que le cache REND, et la charge est celle que la
 * passerelle émet, clé par clé (`community-updated-broadcast.ts`).
 */

const CLUB = '6650a0000000000000000001';
const OTHER = '6650a0000000000000000002';

const summary = (id: string, overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id,
  identifier: `mshy_${id}`,
  name: 'Ancien nom',
  description: null,
  avatar: null,
  banner: null,
  isPrivate: false,
  createdBy: 'u-creator',
  memberCount: 3,
  conversationCount: 2,
  viewerRole: 'member',
  onlineMemberCount: 4,
  ...overrides,
});

const event = (overrides: Partial<CommunityUpdatedEventData> = {}): CommunityUpdatedEventData => ({
  communityId: CLUB,
  identifier: 'mshy_club',
  name: 'Club &amp; amis',
  description: 'Le &lt;club&gt;',
  avatar: 'community/avatar.webp',
  banner: null,
  isPrivate: true,
  memberCount: 5,
  updatedAt: '2026-11-14T11:00:00.000Z',
  ...overrides,
});

const listOf = (...communities: CommunitySummary[]): InfiniteData<CommunityPage, number> => ({
  pages: [{ communities, nextOffset: null }],
  pageParams: [0],
});

describe('applyCommunityUpdatedEvent', () => {
  test("le détail en cache prend la nouvelle identité, décodée, et garde le rôle du lecteur et l'agrégat", () => {
    const client = new QueryClient();
    client.setQueryData(communityQueryKey(CLUB), summary(CLUB));

    applyCommunityUpdatedEvent(client, event());

    expect(client.getQueryData<CommunitySummary>(communityQueryKey(CLUB))).toEqual(
      summary(CLUB, {
        identifier: 'mshy_club',
        name: 'Club & amis',
        description: 'Le <club>',
        avatar: 'community/avatar.webp',
        isPrivate: true,
        memberCount: 5,
      }),
    );
  });

  test('chaque liste en cache renomme la ligne, et seulement elle', () => {
    const client = new QueryClient();
    client.setQueryData(communitiesQueryKey(''), listOf(summary(OTHER), summary(CLUB)));
    client.setQueryData(communitiesQueryKey('club'), listOf(summary(CLUB)));

    applyCommunityUpdatedEvent(client, event());

    const home = client.getQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey(''));
    expect(home?.pages[0]?.communities.map((c) => c.name)).toEqual(['Ancien nom', 'Club & amis']);
    const searched = client.getQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey('club'));
    expect(searched?.pages[0]?.communities[0]?.isPrivate).toBe(true);
  });

  test("une communauté absente du cache n'y est pas posée", () => {
    const client = new QueryClient();
    applyCommunityUpdatedEvent(client, event());

    expect(client.getQueryData(communityQueryKey(CLUB))).toBeUndefined();
  });

  test('une charge malformée est ignorée ENTIÈRE', () => {
    const client = new QueryClient();
    client.setQueryData(communityQueryKey(CLUB), summary(CLUB));

    applyCommunityUpdatedEvent(client, { communityId: CLUB, name: '' });
    applyCommunityUpdatedEvent(client, { ...event(), isPrivate: 'oui' });
    applyCommunityUpdatedEvent(client, null);

    expect(client.getQueryData(communityQueryKey(CLUB))).toEqual(summary(CLUB));
  });
});

describe('bindCommunityLive', () => {
  test("écoute community:updated et s'en débranche", () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const socket: SocketClient = {
      connected: true,
      connect: () => undefined,
      disconnect: () => undefined,
      on: (name, handler) => { handlers.set(name, handler as (payload: unknown) => void); },
      off: (name) => { handlers.delete(name); },
      emit: () => undefined,
    };
    const client = new QueryClient();
    client.setQueryData(communityQueryKey(CLUB), summary(CLUB));

    const stop = bindCommunityLive({ socket, queryClient: client });
    handlers.get(SERVER_EVENTS.COMMUNITY_UPDATED)?.(event({ name: 'Renommée' }));
    expect(client.getQueryData<CommunitySummary>(communityQueryKey(CLUB))?.name).toBe('Renommée');

    stop();
    expect(handlers.has(SERVER_EVENTS.COMMUNITY_UPDATED)).toBe(false);
  });
});
