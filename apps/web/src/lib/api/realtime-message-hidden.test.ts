import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { rowExitOf, rowExitStore, type RowExitSchedule } from '@/lib/view/row-exit-motion';
import { localMessage, threadPages } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { performDeleteForMe } from './delete-message';
import type { ApiResult } from './http';
import { mediaHubConversationKey } from './media-hub-cache';
import { messagesQueryKey } from './messages';
import { applyMessageHiddenForMe, isMessageHiddenForMeEvent } from './realtime-message-hidden';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import type { Message } from './types';
import { createTypingStore } from './typing-store';

/**
 * #10587 — UN MESSAGE MASQUÉ « POUR MOI » SUR UN AUTRE APPAREIL QUITTE LE FIL
 * SANS RECHARGEMENT. `message:hidden-for-me` part vers la salle `user:<id>` du
 * lecteur (`personalMessageVisibilitySync.ts`), en UN lot pour tout le geste.
 * Les témoins lisent le cache que les rangées peignent.
 */

const VIEWER = 'u-viewer';

const seeded = (): QueryClient => {
  const queryClient = new QueryClient();
  const row = (id: string) => localMessage({ id, content: `texte ${id}`, senderId: 'u-other' });
  queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([row('m-1'), row('m-2'), row('m-3')]));
  queryClient.setQueryData(messagesQueryKey('c-b'), threadPages([row('m-9')]));
  queryClient.setQueryData([...mediaHubConversationKey('c-a'), 'photos'], threadPages([row('m-2')]));
  return queryClient;
};

const idsIn = (queryClient: QueryClient, key: readonly unknown[]): readonly string[] =>
  queryClient.getQueryData<{ pages: { messages: Message[] }[] }>(key)?.pages.flatMap((p) => p.messages.map((m) => m.id)) ?? [];

const hidden = (refs: readonly (readonly [string, string])[], userId = VIEWER) => ({
  userId,
  messages: refs.map(([messageId, conversationId]) => ({ messageId, conversationId })),
  hiddenAt: '2026-10-14T10:00:00.000Z',
});

describe('applyMessageHiddenForMe — la rangée quitte le fil', () => {
  test('le message nommé part du fil ET de l’écran des médias ; ses voisins restent', () => {
    const queryClient = seeded();
    applyMessageHiddenForMe(queryClient, hidden([['m-2', 'c-a']]), VIEWER);
    expect(idsIn(queryClient, messagesQueryKey('c-a'))).toEqual(['m-1', 'm-3']);
    expect(idsIn(queryClient, [...mediaHubConversationKey('c-a'), 'photos'])).toEqual([]);
    expect(idsIn(queryClient, messagesQueryKey('c-b'))).toEqual(['m-9']);
  });

  test('UN lot pour tout le geste : plusieurs messages, plusieurs conversations', () => {
    const queryClient = seeded();
    applyMessageHiddenForMe(queryClient, hidden([['m-1', 'c-a'], ['m-3', 'c-a'], ['m-9', 'c-b']]), VIEWER);
    expect(idsIn(queryClient, messagesQueryKey('c-a'))).toEqual(['m-2']);
    expect(idsIn(queryClient, messagesQueryKey('c-b'))).toEqual([]);
  });

  test('un message n’est retiré que de la conversation que l’événement nomme', () => {
    const queryClient = seeded();
    applyMessageHiddenForMe(queryClient, hidden([['m-9', 'c-a']]), VIEWER);
    expect(idsIn(queryClient, messagesQueryKey('c-b'))).toEqual(['m-9']);
  });

  test('un événement adressé à un AUTRE compte ne retire rien (fail-closed)', () => {
    const queryClient = seeded();
    applyMessageHiddenForMe(queryClient, hidden([['m-2', 'c-a']], 'u-autre'), VIEWER);
    applyMessageHiddenForMe(queryClient, hidden([['m-2', 'c-a']]), '');
    expect(idsIn(queryClient, messagesQueryKey('c-a'))).toEqual(['m-1', 'm-2', 'm-3']);
  });

  test('rejoué (l’appareil qui a fait le geste reçoit aussi l’événement), il ne change rien', () => {
    const queryClient = seeded();
    applyMessageHiddenForMe(queryClient, hidden([['m-2', 'c-a']]), VIEWER);
    const after = queryClient.getQueryData(messagesQueryKey('c-a'));
    applyMessageHiddenForMe(queryClient, hidden([['m-2', 'c-a']]), VIEWER);
    expect(queryClient.getQueryData(messagesQueryKey('c-a'))).toBe(after);
  });

  test('la ligne de liste qui décrivait le message masqué est relue ; sinon la liste n’est pas touchée', () => {
    const queryClient = seeded();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [{ conversations: [{ id: 'c-a', lastMessage: { id: 'm-3' } }] }], pageParams: [undefined] });
    applyMessageHiddenForMe(queryClient, hidden([['m-1', 'c-a']]), VIEWER);
    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(false);
    applyMessageHiddenForMe(queryClient, hidden([['m-3', 'c-a']]), VIEWER);
    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(true);
  });
});

/**
 * #12634 — L'ÉCHO DU GESTE LOCAL NE COUPE PAS LE REPLI. La passerelle diffuse
 * `message:hidden-for-me` vers `user:<id>` AVANT de répondre en HTTP : l'appareil
 * qui a fait le geste le reçoit pendant que sa rangée se replie encore. Retirée
 * à ce moment-là, elle disparaissait d'un coup, à mi-fondu. Le geste local la
 * retirera lui-même à la fin du repli.
 */
describe('applyMessageHiddenForMe — l’écho d’un repli en cours', () => {
  const resting = () => rowExitStore.setState({ leaving: new Set(), returning: new Set() });

  test('une rangée qui se replie reste au cache ; les autres messages nommés partent', () => {
    const queryClient = seeded();
    rowExitStore.setState({ leaving: new Set(['m-2']), returning: new Set() });
    try {
      applyMessageHiddenForMe(queryClient, hidden([['m-2', 'c-a'], ['m-3', 'c-a']]), VIEWER);
      expect(idsIn(queryClient, messagesQueryKey('c-a'))).toEqual(['m-1', 'm-2']);
    } finally {
      resting();
    }
  });

  test('le geste local, son écho reçu en plein repli : la rangée reste jusqu’à la fin du repli, puis part', async () => {
    const queryClient = seeded();
    const queue: (() => void)[] = [];
    const schedule: RowExitSchedule = (run) => {
      queue.push(run);
    };
    const rowExit = rowExitOf({ store: rowExitStore, reduceMotion: () => false, schedule });
    const [m2] = (queryClient.getQueryData<{ pages: { messages: Message[] }[] }>(messagesQueryKey('c-a'))?.pages ?? []).flatMap((p) =>
      p.messages.filter((m) => m.id === 'm-2'),
    );
    try {
      const performed = performDeleteForMe({
        queryClient,
        conversationId: 'c-a',
        messages: m2 === undefined ? [] : [m2],
        rowExit,
        transport: {
          request: async <T,>() => {
            applyMessageHiddenForMe(queryClient, hidden([['m-2', 'c-a']]), VIEWER);
            return { ok: true, data: null } as ApiResult<T>;
          },
        },
      });
      await Promise.resolve();
      expect(idsIn(queryClient, messagesQueryKey('c-a'))).toEqual(['m-1', 'm-2', 'm-3']);
      queue.splice(0).forEach((run) => run());
      expect(await performed).toEqual({ deleted: 1, failed: 0, offline: false });
      expect(idsIn(queryClient, messagesQueryKey('c-a'))).toEqual(['m-1', 'm-3']);
    } finally {
      resting();
    }
  });
});

describe('isMessageHiddenForMeEvent — la charge est relue', () => {
  test('la forme servie passe', () => {
    expect(isMessageHiddenForMeEvent(hidden([['m-1', 'c-a']]))).toBe(true);
  });

  test('une charge sans compte, sans liste ou aux références incomplètes est refusée', () => {
    expect(isMessageHiddenForMeEvent(null)).toBe(false);
    expect(isMessageHiddenForMeEvent({ messages: [] })).toBe(false);
    expect(isMessageHiddenForMeEvent({ userId: VIEWER, messages: 'm-1' })).toBe(false);
    expect(isMessageHiddenForMeEvent({ userId: VIEWER, messages: [{ messageId: 'm-1' }] })).toBe(false);
  });
});

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void } {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  return {
    get connected() {
      return connected;
    },
    connect: () => {
      connected = true;
    },
    disconnect: () => {
      connected = false;
    },
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => undefined,
    fire: (event, payload) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}

describe('le branchement — `socket.ts` écoute `message:hidden-for-me`', () => {
  const connected = () => {
    const socket = fakeSocket();
    const socketFactory: SocketFactory = () => socket;
    const queryClient = seeded();
    const deps: RealtimeDeps = {
      base: 'https://gate.staging.meeshy.me',
      socketFactory,
      queryClient,
      typing: createTypingStore(),
      conversationStore,
      outbox: createOutboxStore(),
      viewerId: () => VIEWER,
      onClearSession: () => undefined,
    };
    const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    return { socket, queryClient, destroy: connection.destroy };
  };

  test('l’événement reçu retire la rangée du fil ouvert', () => {
    const { socket, queryClient, destroy } = connected();
    socket.fire(SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME, hidden([['m-2', 'c-a']]));
    expect(idsIn(queryClient, messagesQueryKey('c-a'))).toEqual(['m-1', 'm-3']);
    destroy();
  });

  test('une charge malformée est ignorée', () => {
    const { socket, queryClient, destroy } = connected();
    socket.fire(SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME, { userId: VIEWER, messages: [{ messageId: 'm-2' }] });
    expect(idsIn(queryClient, messagesQueryKey('c-a'))).toEqual(['m-1', 'm-2', 'm-3']);
    destroy();
  });

  test('après `destroy`, l’événement n’est plus écouté', () => {
    const { socket, queryClient, destroy } = connected();
    destroy();
    socket.fire(SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME, hidden([['m-2', 'c-a']]));
    expect(idsIn(queryClient, messagesQueryKey('c-a'))).toEqual(['m-1', 'm-2', 'm-3']);
  });
});
