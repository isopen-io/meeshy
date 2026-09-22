import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import {
  forgetEphemeral,
  noteEphemeralReception,
  noteServedDeadline,
  resetEphemeralReception,
  resolveEphemeralDeadline,
} from '@/lib/view/ephemeral-reception';

import { messagesQueryKey } from './messages';
import { createRealtimeConnection } from './socket';
import { createTypingStore } from './typing-store';
import type { Message } from './types';

/**
 * **LE DÉCOMPTE D'UN ÉPHÉMÈRE, DE LA RÉCEPTION À L'EFFACEMENT** (#7454,
 * travaux 1 et 3) — le registre de réception et les deux puits socket.
 *
 * Fichier SÉPARÉ de `socket.test.ts` (1 235 lignes) : le budget du dépôt
 * interdit d'ajouter à un fichier déjà hors budget (CLAUDE.md § Code Style).
 * La poignée de socket y est donc rejouée en court — c'est le prix du
 * découpage, et il est payé une fois.
 */

type SocketHandler = (payload: unknown) => void;

type FakeSocket = SocketClient & {
  readonly fire: (event: string, payload: unknown) => void;
  readonly listens: ReadonlyMap<string, number>;
};

function fakeSocket(): FakeSocket {
  const handlers = new Map<string, Set<SocketHandler>>();
  const socket = {
    connected: false,
    connect: () => {},
    disconnect: () => {},
    on: (event: string, handler: SocketHandler) => {
      const set = handlers.get(event) ?? new Set<SocketHandler>();
      set.add(handler);
      handlers.set(event, set);
    },
    off: (event: string, handler: SocketHandler) => {
      handlers.get(event)?.delete(handler);
    },
    emit: () => {},
    fire: (event: string, payload: unknown) => {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(payload);
    },
    get listens(): ReadonlyMap<string, number> {
      return new Map([...handlers].map(([event, set]) => [event, set.size] as const));
    },
  };
  return socket as unknown as FakeSocket;
}

const RECEPTION = Date.parse('2026-09-22T10:00:00.000Z');

function messageOf(partial: Partial<Message>): Message {
  return {
    id: 'm-ephemere',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'Le code est 4817.',
    originalLanguage: 'fr',
    messageType: 'text',
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    translations: [],
    createdAt: new Date(RECEPTION),
    ...partial,
  } as unknown as Message;
}

function connect(): {
  readonly socket: FakeSocket;
  readonly queryClient: QueryClient;
  readonly destroy: () => void;
} {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const queryClient = new QueryClient();
  const connection = createRealtimeConnection(
    { token: 'jwt', sessionToken: 'sess' },
    {
      base: 'https://gate.staging.meeshy.me',
      socketFactory,
      queryClient,
      typing: createTypingStore(),
      conversationStore,
      outbox: createOutboxStore(),
      viewerId: () => 'u-viewer',
      onClearSession: () => undefined,
    },
  );
  return { socket, queryClient, destroy: connection.destroy };
}

function seedThread(queryClient: QueryClient, messages: readonly Message[]): void {
  queryClient.setQueryData(messagesQueryKey('c-a'), {
    pages: [{ messages, hasMore: false }],
    pageParams: [undefined],
  });
}

function threadIds(queryClient: QueryClient): readonly string[] {
  const data = queryClient.getQueryData(messagesQueryKey('c-a')) as
    | { readonly pages: readonly { readonly messages: readonly Message[] }[] }
    | undefined;
  return (data?.pages ?? []).flatMap((page) => page.messages.map((m) => m.id));
}

beforeEach(() => resetEphemeralReception());

describe('le registre de réception — l’état que `packages/shared` ne peut pas tenir', () => {
  test('la PREMIÈRE réception gagne : un second horodatage ne rallonge pas la vie du message', () => {
    noteEphemeralReception('m-1', RECEPTION);
    noteEphemeralReception('m-1', RECEPTION + 60_000);

    expect(
      resolveEphemeralDeadline({ message: messageOf({ id: 'm-1', ephemeralDuration: 30 }), isMine: false, now: RECEPTION }),
    ).toEqual({ state: 'scheduled', expiresAtMs: RECEPTION + 30_000 });
  });

  test('l’échéance SERVIE la plus proche gagne — un `countdown-started` en retard ne rallonge rien', () => {
    noteEphemeralReception('m-2', RECEPTION);
    noteServedDeadline('m-2', new Date(RECEPTION + 20_000).toISOString());
    noteServedDeadline('m-2', new Date(RECEPTION + 90_000).toISOString());

    expect(
      resolveEphemeralDeadline({ message: messageOf({ id: 'm-2', ephemeralDuration: 600 }), isMine: false, now: RECEPTION }),
    ).toEqual({ state: 'scheduled', expiresAtMs: RECEPTION + 20_000 });
  });

  /**
   * LE TÉMOIN DU CÔTÉ QUI COMPTE (directive porteur) : un message ENVOYÉ par
   * le lecteur ne décompte pas depuis son horloge à lui. Sans cette règle, le
   * défaut d'origine — « l'échéance est calculée à l'ENVOI » — reviendrait par
   * la porte du client.
   */
  test('l’EXPÉDITEUR reste en attente : sa propre horloge ne pose aucune échéance', () => {
    const message = messageOf({ id: 'm-3', senderId: 'u-viewer', ephemeralDuration: 45 });
    expect(resolveEphemeralDeadline({ message, isMine: true, now: RECEPTION })).toEqual({
      state: 'awaiting-reception',
      durationSeconds: 45,
    });
  });

  test('le RENDU horodate un destinataire — la première peinture EST une réception', () => {
    const message = messageOf({ id: 'm-4', ephemeralDuration: 120 });
    expect(resolveEphemeralDeadline({ message, isMine: false, now: RECEPTION })).toEqual({
      state: 'scheduled',
      expiresAtMs: RECEPTION + 120_000,
    });
    /* Le SECOND rendu, plus tard, rend la MÊME échéance : l'horodatage ne se
       rejoue pas. C'est ce qui rend un changement de mode de lecture inoffensif. */
    expect(resolveEphemeralDeadline({ message, isMine: false, now: RECEPTION + 60_000 })).toEqual({
      state: 'scheduled',
      expiresAtMs: RECEPTION + 120_000,
    });
  });

  test('`forgetEphemeral` efface les DEUX registres', () => {
    noteEphemeralReception('m-5', RECEPTION);
    noteServedDeadline('m-5', new Date(RECEPTION + 10_000).toISOString());
    forgetEphemeral('m-5');

    expect(resolveEphemeralDeadline({ message: messageOf({ id: 'm-5' }), isMine: false, now: RECEPTION })).toEqual({
      state: 'none',
    });
  });
});

describe('les deux puits socket (#7454, travail 3)', () => {
  test('`message:expired` RETIRE la rangée du fil ouvert, sur-le-champ', () => {
    const { socket, queryClient, destroy } = connect();
    seedThread(queryClient, [messageOf({ id: 'm-ephemere' }), messageOf({ id: 'm-autre' })]);

    socket.fire(SERVER_EVENTS.MESSAGE_EXPIRED, { messageId: 'm-ephemere', conversationId: 'c-a' });

    expect(threadIds(queryClient)).toEqual(['m-autre']);
    destroy();
  });

  test('`message:expired` OUBLIE le message du registre — la mémoire ne fuit pas', () => {
    const { socket, queryClient, destroy } = connect();
    seedThread(queryClient, [messageOf({ id: 'm-ephemere' })]);
    noteEphemeralReception('m-ephemere', RECEPTION);

    socket.fire(SERVER_EVENTS.MESSAGE_EXPIRED, { messageId: 'm-ephemere', conversationId: 'c-a' });

    expect(
      resolveEphemeralDeadline({
        message: messageOf({ id: 'm-ephemere', ephemeralDuration: 30 }),
        isMine: true,
        now: RECEPTION,
      }),
    ).toEqual({ state: 'awaiting-reception', durationSeconds: 30 });
    destroy();
  });

  test('une charge MALFORMÉE est ignorée — le fil ne bouge pas', () => {
    const { socket, queryClient, destroy } = connect();
    seedThread(queryClient, [messageOf({ id: 'm-ephemere' })]);

    socket.fire(SERVER_EVENTS.MESSAGE_EXPIRED, { messageId: 42, conversationId: 'c-a' });
    socket.fire(SERVER_EVENTS.MESSAGE_COUNTDOWN_STARTED, { messageId: 'm-ephemere', conversationId: 'c-a' });

    expect(threadIds(queryClient)).toEqual(['m-ephemere']);
    destroy();
  });

  test('`message:countdown-started` pose l’échéance SERVIE, qui l’emporte quand elle est plus proche', () => {
    const { socket, destroy } = connect();
    noteEphemeralReception('m-ephemere', RECEPTION);

    socket.fire(SERVER_EVENTS.MESSAGE_COUNTDOWN_STARTED, {
      messageId: 'm-ephemere',
      conversationId: 'c-a',
      expiresAt: new Date(RECEPTION + 15_000).toISOString(),
    });

    expect(
      resolveEphemeralDeadline({
        message: messageOf({ id: 'm-ephemere', ephemeralDuration: 600 }),
        isMine: false,
        now: RECEPTION,
      }),
    ).toEqual({ state: 'scheduled', expiresAtMs: RECEPTION + 15_000 });
    destroy();
  });

  /**
   * LE DÉCOMPTE PART DE LA LIVRAISON, PAS DU PREMIER PIXEL — le fil peut être
   * FERMÉ quand l'éphémère arrive. Sans cet horodatage, un message reçu
   * pendant qu'on lit la liste des conversations ne commencerait à décompter
   * qu'à l'ouverture du fil.
   */
  test('`message:new` horodate la réception d’un éphémère, fil ouvert ou non', () => {
    const { socket, destroy } = connect();
    const before = Date.now();

    const payload: SocketIOMessage = {
      id: 'm-direct',
      conversationId: 'c-a',
      senderId: 'u-other',
      content: 'Le code est 4817.',
      originalLanguage: 'fr',
      messageType: 'text',
      ephemeralDuration: 30,
      createdAt: '2026-09-22T10:00:00.000Z' as unknown as Date,
    };
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, payload);

    const deadline = resolveEphemeralDeadline({
      message: messageOf({ id: 'm-direct', ephemeralDuration: 30 }),
      isMine: false,
      now: before + 10_000,
    });
    expect(deadline.state).toBe('scheduled');
    /* L'échéance part de la LIVRAISON (≈ `before`), pas de l'appel ci-dessus
       (`before + 10 s`) — c'est toute la différence que ce témoin mesure. */
    if (deadline.state === 'scheduled') {
      expect(deadline.expiresAtMs).toBeLessThan(before + 10_000 + 30_000);
    }
    destroy();
  });

  test('`destroy()` DÉSABONNE les deux événements', () => {
    const { socket, destroy } = connect();
    expect(socket.listens.get(SERVER_EVENTS.MESSAGE_EXPIRED)).toBe(1);
    expect(socket.listens.get(SERVER_EVENTS.MESSAGE_COUNTDOWN_STARTED)).toBe(1);

    destroy();

    expect(socket.listens.get(SERVER_EVENTS.MESSAGE_EXPIRED)).toBe(0);
    expect(socket.listens.get(SERVER_EVENTS.MESSAGE_COUNTDOWN_STARTED)).toBe(0);
  });
});
