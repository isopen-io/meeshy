/**
 * « translation pool full » est un refus TRANSITOIRE : le translator le publie
 * quand sa file est pleine ET pour chaque tâche qu'il refuse pendant son arrêt.
 * La machine de renvoi le gère déjà (la requête en attente reste armée).
 *
 * Le compter comme un échec au disjoncteur faisait qu'un arrêt chargé du
 * translator (plus de `cbFailureThreshold` refus d'affilée) ouvrait le
 * disjoncteur 30 s et bloquait TOUTES les traductions de la passerelle (#17004).
 *
 * Le refus est NEUTRE pour le disjoncteur : il ne compte pas, et il ne remet
 * pas non plus le compteur à zéro — un refus n'est pas un succès.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { EventEmitter } from 'events';

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

import { ZmqTranslationClient } from '../../../services/zmq-translation/ZmqTranslationClient';
import { ZMQ_TOLERANCE_DEFAULTS } from '../../../services/zmq-translation/zmqToleranceConfig';

const THRESHOLD = ZMQ_TOLERANCE_DEFAULTS.cbFailureThreshold;
const POOL_FULL = 'translation pool full';

function buildClient(): ZmqTranslationClient {
  const client = new ZmqTranslationClient();
  const connectionManager = { send: jest.fn(async () => undefined) };
  (client as any).connectionManager = connectionManager;
  (client as any).requestSender.connectionManager = connectionManager;
  return client;
}

const handlerOf = (client: ZmqTranslationClient): EventEmitter =>
  (client as unknown as { messageHandler: EventEmitter }).messageHandler;

const translationErrorFor = (taskId: string, error: string) => ({
  type: 'translation_error',
  taskId,
  messageId: `msg-${taskId}`,
  error,
  conversationId: 'conv-cb-transient',
});

const emitErrors = (client: ZmqTranslationClient, count: number, error: string, prefix: string): void => {
  Array.from({ length: count }, (_, i) => `${prefix}-${i}`).forEach((taskId) =>
    handlerOf(client).emit('translationError', translationErrorFor(taskId, error))
  );
};

const sendOne = (client: ZmqTranslationClient, messageId: string) =>
  client.sendTranslationRequest({
    messageId,
    text: 'le texte',
    sourceLanguage: 'fr',
    targetLanguages: ['en'],
    conversationId: 'conv-cb-transient',
    modelType: 'basic',
  } as any);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('Un refus « pool full » du translator n’ouvre pas le disjoncteur de traduction', () => {
  it('laisse partir une traduction après vingt refus « pool full » consécutifs', async () => {
    const client = buildClient();
    client.on('translationError', () => undefined);
    const armedTaskId = await sendOne(client, 'msg-armed');

    Array.from({ length: 10 }).forEach(() =>
      handlerOf(client).emit('translationError', translationErrorFor(armedTaskId, POOL_FULL))
    );
    emitErrors(client, 10, POOL_FULL, 'task-shutdown');

    await expect(sendOne(client, 'msg-after-refusals')).resolves.toEqual(expect.any(String));
    expect(client.getStats().pool_full_rejections).toBe(20);
  });

  it('s’ouvre toujours après le seuil de vraies erreurs de traduction', async () => {
    const client = buildClient();
    client.on('translationError', () => undefined);

    emitErrors(client, THRESHOLD, 'Translation service unavailable', 'task-real');

    await expect(sendOne(client, 'msg-blocked')).rejects.toThrow('ZMQ circuit breaker OPEN');
  });

  it('ne remet pas à zéro la série de vraies erreurs : un refus est neutre', async () => {
    const client = buildClient();
    client.on('translationError', () => undefined);

    emitErrors(client, THRESHOLD - 1, 'Translation service unavailable', 'task-before');
    emitErrors(client, 1, POOL_FULL, 'task-refused');
    emitErrors(client, 1, 'Translation service unavailable', 'task-after');

    await expect(sendOne(client, 'msg-blocked')).rejects.toThrow('ZMQ circuit breaker OPEN');
  });

  it('annonce toujours le refus d’une tâche qui n’a plus de requête en attente', () => {
    const client = buildClient();
    const announced: Array<{ taskId: string; error: string }> = [];
    client.on('translationError', (event) => announced.push(event));

    emitErrors(client, 1, POOL_FULL, 'task-orphan');

    expect(announced).toEqual([expect.objectContaining({ taskId: 'task-orphan-0', error: POOL_FULL })]);
  });
});
