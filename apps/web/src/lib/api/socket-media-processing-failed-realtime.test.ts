import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import {
  TRANSCRIPTION_STAGE,
  TRANSLATIONS_STAGE,
  failedStagesOf,
  mediaProcessingFailures,
  type MediaProcessingStage,
} from './media-processing-failures';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';

/**
 * #18537 — LE TÉMOIN DE SURFACE : « ces deux noms sont-ils ÉCOUTÉS ? »
 *
 * Le puits et le magasin ont leurs propres témoins, et ils resteraient verts si
 * personne ne les branchait : c'est exactement la panne que ce lot répare, et
 * c'est aussi la forme du défaut du cycle 104 (une émission sous un nom
 * `undefined` dont le témoin n'assertait que la room). Celui-ci part donc de la
 * CONSTANTE de contrat — jamais d'un littéral recopié — et traverse
 * `createRealtimeConnection`, le site d'abonnement réel.
 */
function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void; listens(event: string): boolean } {
  const handlers = new Map<string, Set<SocketHandler>>();
  let open = false;
  return {
    get connected() {
      return open;
    },
    connect: () => {
      open = true;
    },
    disconnect: () => {
      open = false;
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
    listens: (event) => (handlers.get(event)?.size ?? 0) > 0,
  };
}

const connected = () => {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const deps: RealtimeDeps = {
    base: 'https://gate.staging.meeshy.me',
    socketFactory,
    queryClient: new QueryClient(),
    typing: createTypingStore(),
    conversationStore,
    outbox: createOutboxStore(),
    viewerId: () => 'u-viewer',
    onClearSession: () => undefined,
  };
  const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, connection };
};

/** La charge RÉELLE de `MeeshySocketIOManager`, recopiée clé par clé. */
const payload = (attachmentId: string) => ({
  messageId: '68c1f0a9b2d4e5f601020304',
  attachmentId,
  conversationId: '68c1f0a9b2d4e5f60102bbbb',
  error: 'Whisper worker unavailable',
  errorCode: 'TRANSCRIPTION_FAILED',
  taskId: 'task-7',
});

describe('la connexion écoute les deux pannes de traitement (#18537)', () => {
  const WIRED: readonly (readonly [string, MediaProcessingStage])[] = [
    [SERVER_EVENTS.TRANSCRIPTION_FAILED, TRANSCRIPTION_STAGE],
    [SERVER_EVENTS.AUDIO_TRANSLATION_FAILED, TRANSLATIONS_STAGE],
  ];

  for (const [event, stage] of WIRED) {
    test(`${event} est écouté, et sa trame écrit son étage`, () => {
      const attachmentId = `a-${stage}`;
      const { socket } = connected();

      expect(socket.listens(event)).toBe(true);

      socket.fire(event, payload(attachmentId));
      expect(failedStagesOf(mediaProcessingFailures.getState(), attachmentId)).toEqual([stage]);

      mediaProcessingFailures.getState().cleared(attachmentId, stage);
    });
  }

  test('une trame malformée ne laisse aucune trace', () => {
    const { socket } = connected();

    socket.fire(SERVER_EVENTS.TRANSCRIPTION_FAILED, { messageId: 'm-1' });
    socket.fire(SERVER_EVENTS.AUDIO_TRANSLATION_FAILED, null);

    expect(mediaProcessingFailures.getState().byAttachment).toEqual({});
  });
});
