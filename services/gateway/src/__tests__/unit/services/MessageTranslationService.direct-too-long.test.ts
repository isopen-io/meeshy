/**
 * #18041 — une traduction directe (`POST /translate-blocking`) d'un texte plus
 * long que `MAX_TRANSLATION_LENGTH` attendait dix secondes, puis servait le
 * faux `"[EN] <texte>"` en `modelType: 'fallback'` et comptait une erreur :
 * `translateTextDirectly` n'écoutait pas `translationSkipped` (#17204).
 *
 * Désormais : l'original, dans sa langue, `modelType: 'none'` (règle 1 du
 * Prisme), dès le refus — sans erreur comptée, sans écouteur laissé derrière.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { translateTextDirectly } from '../../../services/message-translation/directTextTranslation';
import { TranslationStats } from '../../../services/message-translation/TranslationStats';
import { ZmqTranslationClient } from '../../../services/zmq-translation/ZmqTranslationClient';
import type { ZmqMessageHandler } from '../../../services/zmq-translation/ZmqMessageHandler';
import type { TranslationSkippedPayload } from '../../../services/zmq-translation/types';

const LISTENED = ['translationCompleted', 'translationError', 'translationUnsupported', 'translationSkipped'] as const;

class FakeZmqClient extends EventEmitter {
  constructor(readonly taskId: string) {
    super();
  }
  sendTranslationRequest = jest.fn<(request: unknown) => Promise<string>>(async () => this.taskId);
}

const skipped = (taskId?: string): TranslationSkippedPayload => ({
  ...(taskId ? { taskId } : {}),
  messageId: 'direct-text:x',
  conversationId: 'rest-request',
  reason: 'message_too_long',
  length: 10_001,
  maxLength: 10_000,
});

const deps = (zmqClient: FakeZmqClient | ZmqTranslationClient, stats = new TranslationStats()) => ({
  zmqClient,
  stats,
  normalizeSourceLanguage: (language: string) => language,
});

const longText = 'x'.repeat(10_001);
const input = { text: longText, sourceLanguage: 'fr', targetLanguage: 'en', modelType: 'basic' };

const withinOneSecond = <T>(pending: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('still waiting after 1s')), 1_000);
  });
  return Promise.race([pending, deadline]).finally(() => clearTimeout(timer));
};

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

describe('translateTextDirectly d’un texte trop long', () => {
  it("rend l'original dès le translationSkipped de sa tâche, sans compter d'erreur", async () => {
    const zmq = new FakeZmqClient('task-long');
    const stats = new TranslationStats();

    const pending = translateTextDirectly(deps(zmq, stats), input);
    await nextTurn();
    zmq.emit('translationSkipped', skipped('task-long'));

    const result = await withinOneSecond(pending);
    expect(result).toMatchObject({ translatedText: longText, sourceLanguage: 'fr', targetLanguage: 'fr', modelType: 'none' });
    expect(stats.getStats().errors).toBe(0);
  });

  it('retire les quatre écouteurs et ne laisse courir aucun délai', async () => {
    jest.useFakeTimers();
    try {
      const zmq = new FakeZmqClient('task-long');
      const pending = translateTextDirectly(deps(zmq), input);
      await jest.advanceTimersByTimeAsync(0);
      zmq.emit('translationSkipped', skipped('task-long'));
      await pending;

      expect(LISTENED.map((event) => zmq.listenerCount(event))).toEqual([0, 0, 0, 0]);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("ignore le refus d'une AUTRE tâche, ou sans taskId", async () => {
    jest.useFakeTimers();
    try {
      const zmq = new FakeZmqClient('task-mine');
      const pending = translateTextDirectly(deps(zmq), { ...input, text: 'Bonjour' });
      await jest.advanceTimersByTimeAsync(0);
      zmq.emit('translationSkipped', skipped('task-other'));
      zmq.emit('translationSkipped', skipped());
      zmq.emit('translationCompleted', {
        taskId: 'task-mine',
        result: { messageId: 'm', translatedText: 'Hello', sourceLanguage: 'fr', targetLanguage: 'en',
          confidenceScore: 0.9, processingTime: 1, modelType: 'basic' },
      });

      await expect(pending).resolves.toMatchObject({ translatedText: 'Hello', modelType: 'basic' });
      expect(LISTENED.map((event) => zmq.listenerCount(event))).toEqual([0, 0, 0, 0]);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['succès', 'translationCompleted', { result: { translatedText: 'Hello' } }],
    ['erreur', 'translationError', { error: 'boom' }],
    ['refus de paire', 'translationUnsupported', {}],
  ] as const)('retire aussi translationSkipped sur %s', async (_label, event, extra) => {
    const zmq = new FakeZmqClient('task-x');
    const pending = translateTextDirectly(deps(zmq), { ...input, text: 'Bonjour' });
    await nextTurn();
    zmq.emit(event, { taskId: 'task-x', ...extra });
    await withinOneSecond(pending);

    expect(LISTENED.map((name) => zmq.listenerCount(name))).toEqual([0, 0, 0, 0]);
  });

  it('retire aussi translationSkipped au délai', async () => {
    jest.useFakeTimers();
    try {
      const zmq = new FakeZmqClient('task-slow');
      const pending = translateTextDirectly(deps(zmq), { ...input, text: 'Bonjour' });
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(pending).resolves.toMatchObject({ modelType: 'fallback' });
      expect(LISTENED.map((name) => zmq.listenerCount(name))).toEqual([0, 0, 0, 0]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('bout en bout : la trame translation_skipped du translator traverse le vrai client ZMQ', () => {
  it("rend l'original sans attendre", async () => {
    const client = new ZmqTranslationClient();
    const connectionManager = { send: jest.fn(async () => undefined) };
    Object.assign(client as object, { connectionManager });
    Object.assign((client as unknown as { requestSender: object }).requestSender, { connectionManager });
    const handler = (client as unknown as { messageHandler: ZmqMessageHandler }).messageHandler;
    const stats = new TranslationStats();
    const sent = jest.spyOn(client, 'sendTranslationRequest');

    const pending = translateTextDirectly(deps(client, stats), input);
    await nextTurn();
    const taskId = await (sent.mock.results[0]?.value as Promise<string>);
    await handler.handleMessage(Buffer.from(JSON.stringify({
      type: 'translation_skipped',
      taskId,
      messageId: 'direct-text:x',
      reason: 'message_too_long',
      length: 10_001,
      max_length: 10_000,
      conversationId: 'rest-request',
    }), 'utf-8'));

    const result = await withinOneSecond(pending);
    expect(result).toMatchObject({ translatedText: longText, targetLanguage: 'fr', modelType: 'none' });
    expect(stats.getStats().errors).toBe(0);
    expect(client.listenerCount('translationSkipped')).toBe(0);
  });
});
