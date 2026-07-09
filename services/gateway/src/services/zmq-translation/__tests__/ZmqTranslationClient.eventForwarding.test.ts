/**
 * ZmqTranslationClient — translationCompleted event forwarding
 *
 * ZmqMessageHandler emits BOTH a global `translationCompleted` event and a
 * scoped `translationCompleted:${messageId}` event (see ZmqMessageHandler.ts)
 * so that per-request listeners can subscribe narrowly instead of filtering
 * every global event fired anywhere in the process. ZmqTranslationClient
 * forwards messageHandler events to its own listeners (consumed by
 * CallEventsHandler / PostService) — this suite guards that BOTH the global
 * and the scoped event actually make it across that forwarding boundary.
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { ZmqTranslationClient } from '../ZmqTranslationClient';

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'task-1',
    result: { messageId: 'call-abc-0', translatedText: 'Bonjour' },
    targetLanguage: 'fr',
    metadata: {},
    ...overrides,
  };
}

describe('ZmqTranslationClient — translationCompleted forwarding', () => {
  it('forwards the global translationCompleted event', () => {
    const client = new ZmqTranslationClient();
    const received: unknown[] = [];
    client.on('translationCompleted', (e) => received.push(e));

    (client as unknown as { messageHandler: import('events').EventEmitter }).messageHandler.emit(
      'translationCompleted',
      makePayload()
    );

    expect(received).toHaveLength(1);
  });

  it('also forwards a scoped translationCompleted:<messageId> event', () => {
    const client = new ZmqTranslationClient();
    const received: unknown[] = [];
    client.on('translationCompleted:call-abc-0', (e) => received.push(e));

    (client as unknown as { messageHandler: import('events').EventEmitter }).messageHandler.emit(
      'translationCompleted',
      makePayload()
    );

    expect(received).toHaveLength(1);
  });

  it('does not fire the scoped listener for a different messageId', () => {
    const client = new ZmqTranslationClient();
    const received: unknown[] = [];
    client.on('translationCompleted:call-other-0', (e) => received.push(e));

    (client as unknown as { messageHandler: import('events').EventEmitter }).messageHandler.emit(
      'translationCompleted',
      makePayload()
    );

    expect(received).toHaveLength(0);
  });
});
