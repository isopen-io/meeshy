/**
 * #19979 — un `resolvePayloadForReader` qui LÈVE pour un lecteur ne doit pas
 * emporter la file des autres.
 *
 * L'appel vivait dans la boucle, sans garde par entrée : une signature qui
 * jette pour UN destinataire faisait sortir toute la boucle vers le `catch`
 * extérieur, qui journalisait « Failed to fetch participants » — une phrase
 * fausse, puisque les participants avaient été lus. Les destinataires suivants
 * ne recevaient rien.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

const logWarn = jest.fn();

jest.mock('../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: (...args: unknown[]) => logWarn(...args),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

import { enqueueForOfflineParticipants } from '../offlineParticipantQueue';

const THREE = [
  { id: 'participant-A', userId: 'user-A' },
  { id: 'participant-B', userId: 'user-B' },
  { id: 'participant-C', userId: 'user-C' },
];

function makeDeps() {
  const sink: Array<{ userId: string; entry: { payload: unknown } }> = [];
  const enqueue = jest.fn(async (userId: string, entry: { payload: unknown }) => {
    sink.push({ userId, entry });
  });
  return {
    sink,
    deps: {
      deliveryQueue: { enqueue } as never,
      prisma: { participant: { findMany: jest.fn(async () => THREE) } } as never,
      connectedUsers: new Map() as never,
    },
  };
}

describe('enqueueForOfflineParticipants — une résolution par lecteur qui lève (#19979)', () => {
  it('enfile pour les deux autres lecteurs et nomme l’échec de résolution', async () => {
    logWarn.mockClear();
    const { sink, deps } = makeDeps();

    await enqueueForOfflineParticipants(deps, {
      conversationId: 'conv-1',
      eventType: 'link-message',
      messageId: 'msg-1',
      payload: { message: { id: 'msg-1' } },
      resolvePayloadForReader: (queueKey: string) => {
        if (queueKey === 'user-B') throw new Error('signature tombée');
        return { message: { id: 'msg-1', pour: queueKey } };
      },
    });

    expect(sink.map((e) => e.userId).sort()).toEqual(['user-A', 'user-C']);
    expect(sink.find((e) => e.userId === 'user-A')?.entry.payload).toEqual({ message: { id: 'msg-1', pour: 'user-A' } });
    const messages = logWarn.mock.calls.map((c) => c[0]);
    expect(messages).toContain('Failed to resolve offline payload for reader');
    expect(messages).not.toContain('Failed to fetch participants for offline enqueue');
  });
});
