import { readFileSync } from 'node:fs';

import { InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { callHistoryQueryKey, type CallHistoryPage } from '@/lib/api/calls';
import type { SocketClient } from '@/lib/net/socket';

import { bridgeCallEvents } from './call-socket-bridge';
import { resetCallTransportForTests } from './call-transport';

/**
 * **L'HISTORIQUE D'APPELS MONTRE UN APPEL MANQUÉ SANS REVENIR SUR L'ÉCRAN**
 * (#18922, WEB-15 volet appels). Le pont d'appels ne touchait aucun cache : un
 * appel terminé, manqué ou refusé n'apparaissait dans « Appels » qu'au prochain
 * rechargement ou retour d'onglet passé la fraîcheur. La passerelle écrit la
 * ligne de l'appel AVANT de diffuser `call:ended` (`CallEventsHandler`, la
 * session est passée `missed` ou `ended` d'abord) : relire l'historique à
 * l'arrivée de l'événement le montre.
 *
 * Les témoins montent de VRAIS observateurs (leçon 109) : une invalidation ne
 * relit que ce qu'un écran regarde, et un cache posé à la main resterait muet.
 */

const fakeSocket = () => {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();
  const socket: SocketClient = {
    connected: false,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => void handlers.set(event, [...(handlers.get(event) ?? []), handler as (payload: unknown) => void]),
    off: (event, handler) => void handlers.set(event, (handlers.get(event) ?? []).filter((entry) => entry !== handler)),
    emit: () => undefined,
  };
  return { socket, fire: (event: string, payload: unknown) => (handlers.get(event) ?? []).forEach((handler) => handler(payload)) };
};

const settle = async (queryClient: QueryClient): Promise<void> => {
  for (let i = 0; i < 40 && queryClient.isFetching() > 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const EMPTY: CallHistoryPage = { records: [], nextCursor: null };

/** L'écran « Appels » ouvert sur un filtre : un observateur, et le compte de ses lectures. */
function watchHistory(queryClient: QueryClient, filter: 'all' | 'missed') {
  const reads = { count: 0 };
  const observer = new InfiniteQueryObserver(queryClient, {
    queryKey: callHistoryQueryKey(filter),
    queryFn: () => {
      reads.count += 1;
      return Promise.resolve(EMPTY);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page: CallHistoryPage) => page.nextCursor ?? undefined,
    staleTime: 60_000,
  });
  return { reads, stop: observer.subscribe(() => undefined) };
}

const ENDED = { callId: '6650c0ffee0000000000c411', duration: 0, reason: 'missed' } as const;
const MISSED = { callId: '6650c0ffee0000000000c411', conversationId: 'c-1', callerId: 'u-awa', callerName: 'Awa' } as const;

afterEach(() => {
  resetCallTransportForTests();
});

describe('le pont d’appels tient l’historique à jour (#18922)', () => {
  test('un appel terminé (manqué, refusé ou raccroché) relance l’historique observé, sur chaque filtre', async () => {
    const queryClient = new QueryClient();
    const all = watchHistory(queryClient, 'all');
    const missed = watchHistory(queryClient, 'missed');
    await settle(queryClient);
    const { socket, fire } = fakeSocket();
    const detach = bridgeCallEvents(socket, { queryClient });

    fire(SERVER_EVENTS.CALL_ENDED, ENDED);
    await settle(queryClient);

    expect(all.reads.count).toBe(2);
    expect(missed.reads.count).toBe(2);
    detach();
    all.stop();
    missed.stop();
  });

  test('`call:missed` relance l’historique aussi', async () => {
    const queryClient = new QueryClient();
    const missed = watchHistory(queryClient, 'missed');
    await settle(queryClient);
    const { socket, fire } = fakeSocket();
    const detach = bridgeCallEvents(socket, { queryClient });

    fire(SERVER_EVENTS.CALL_MISSED, MISSED);
    await settle(queryClient);

    expect(missed.reads.count).toBe(2);
    detach();
    missed.stop();
  });

  test('ni les autres requêtes, ni un événement qui ne termine rien, ni un pont détaché ne relisent l’historique', async () => {
    const queryClient = new QueryClient();
    const history = watchHistory(queryClient, 'all');
    const otherReads = { count: 0 };
    const other = new QueryObserver(queryClient, {
      queryKey: ['calls', 'active'],
      queryFn: () => {
        otherReads.count += 1;
        return Promise.resolve(null);
      },
      staleTime: 60_000,
    });
    const stopOther = other.subscribe(() => undefined);
    await settle(queryClient);
    const { socket, fire } = fakeSocket();
    const detach = bridgeCallEvents(socket, { queryClient });

    fire(SERVER_EVENTS.CALL_MEDIA_TOGGLED, { callId: ENDED.callId, participantId: 'p-1', mediaType: 'audio', enabled: false });
    fire(SERVER_EVENTS.CALL_ENDED, ENDED);
    await settle(queryClient);
    detach();
    fire(SERVER_EVENTS.CALL_ENDED, ENDED);
    await settle(queryClient);

    expect(history.reads.count).toBe(2);
    expect(otherReads.count).toBe(1);
    history.stop();
    stopOther();
  });
});

/**
 * **LE PONT EST BRANCHÉ SUR LE CLIENT DE L'APPLICATION.** `realtime.ts` n'est
 * importé par aucun témoin (ses abonnements de module toucheraient les
 * singletons de toute la suite) : on lit sa source, motif
 * `served-profile-session.test.ts`.
 */
describe('le pont d’appels reçoit le client de requêtes de l’application', () => {
  test('realtime.ts passe `appQueryClient` au pont', () => {
    const source = readFileSync(new URL('../api/realtime.ts', import.meta.url), 'utf8');

    expect(source).toContain('bridgeCallEvents(next.socket, { queryClient: appQueryClient })');
  });
});
