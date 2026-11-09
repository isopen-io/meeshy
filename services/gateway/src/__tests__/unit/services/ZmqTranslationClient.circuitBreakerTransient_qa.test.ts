/**
 * QA #17004 — le refus transitoire du translator traverse le VRAI décodeur.
 *
 * Le témoin principal émet l'événement déjà décodé dans le handler ; celui-ci
 * part de la charge RÉELLE que publie le translator
 * (`zmq_translation_handler.py` → `_pool_full_error`, utilisée à l'identique par
 * `publish_pool_full` ET `publish_refused_at_shutdown`), copiée clé par clé,
 * sérialisée en JSON, et la fait passer par `ZmqMessageHandler.handleMessage`.
 *
 * Il garde aussi la fiabilité : un translator qui ne répond PLUS que
 * « pool full » n'ouvre pas le disjoncteur, mais ne provoque pas non plus de
 * tempête — le refus ne déclenche aucun renvoi immédiat, et le renvoi reste
 * borné par le budget du deadman.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

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
const MAX_ATTEMPTS = ZMQ_TOLERANCE_DEFAULTS.maxRetries + 1;
const CONVERSATION_ID = 'conv-cb-qa';

type Sent = Record<string, unknown>;

function buildClient() {
  const sent: Sent[] = [];
  const client = new ZmqTranslationClient();
  const connectionManager = { send: jest.fn(async (message: Sent) => { sent.push(message); }) };
  (client as any).connectionManager = connectionManager;
  (client as any).requestSender.connectionManager = connectionManager;
  return { client, sent };
}

const decoderOf = (client: ZmqTranslationClient) =>
  (client as unknown as { messageHandler: { handleMessage: (m: Buffer) => Promise<void> } }).messageHandler;

const translatorRefusalJson = (taskId: string, error: string): Buffer =>
  Buffer.from(
    JSON.stringify({
      type: 'translation_error',
      taskId,
      messageId: `msg-${taskId}`,
      error,
      conversationId: CONVERSATION_ID,
    }),
    'utf-8'
  );

const publish = async (client: ZmqTranslationClient, taskId: string, error: string) =>
  decoderOf(client).handleMessage(translatorRefusalJson(taskId, error));

const publishMany = async (client: ZmqTranslationClient, count: number, error: string, prefix: string) => {
  for (const i of Array.from({ length: count }, (_, k) => k)) {
    await publish(client, `${prefix}-${i}`, error);
  }
};

const sendOne = (client: ZmqTranslationClient, messageId: string) =>
  client.sendTranslationRequest({
    messageId,
    text: 'le texte',
    sourceLanguage: 'fr',
    targetLanguages: ['en'],
    conversationId: CONVERSATION_ID,
    modelType: 'basic',
  } as any);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('QA #17004 — refus du translator décodé par le vrai décodeur', () => {
  it('un arrêt chargé (trois fois le seuil de refus) laisse le disjoncteur fermé', async () => {
    const { client } = buildClient();
    const announced: Array<{ taskId: string; error: string }> = [];
    client.on('translationError', (event) => announced.push(event));

    await publishMany(client, THRESHOLD * 3, 'translation pool full', 'task-shutdown');

    await expect(sendOne(client, 'msg-after-shutdown')).resolves.toEqual(expect.any(String));
    expect(announced).toHaveLength(THRESHOLD * 3);
    expect(announced[0]).toEqual(expect.objectContaining({ error: 'translation pool full' }));
  });

  it('une vraie erreur, décodée de la même façon, ouvre toujours le disjoncteur au seuil', async () => {
    const { client } = buildClient();
    client.on('translationError', () => undefined);

    await publishMany(client, THRESHOLD, 'Translation service unavailable', 'task-real');

    await expect(sendOne(client, 'msg-blocked')).rejects.toThrow('ZMQ circuit breaker OPEN');
  });

  it('les refus décodés au milieu d’une série de vraies erreurs ne la remettent pas à zéro', async () => {
    const { client } = buildClient();
    client.on('translationError', () => undefined);

    await publishMany(client, THRESHOLD - 1, 'Translation service unavailable', 'task-before');
    await publishMany(client, THRESHOLD * 2, 'translation pool full', 'task-refused');
    await publishMany(client, 1, 'Translation service unavailable', 'task-after');

    await expect(sendOne(client, 'msg-blocked')).rejects.toThrow('ZMQ circuit breaker OPEN');
  });
});

describe('QA #17004 — un translator qui ne répond plus que « pool full »', () => {
  it('ne renvoie pas au moment du refus : seul le deadman renvoie', async () => {
    const { client, sent } = buildClient();
    client.on('translationError', () => undefined);
    const taskId = await sendOne(client, 'msg-saturated');

    await publish(client, taskId, 'translation pool full');

    expect(sent).toHaveLength(1);
  });

  it('renvoie au plus le budget du deadman, annonce l’échec une fois, et n’ouvre jamais le disjoncteur', async () => {
    const { client, sent } = buildClient();
    const failures: Array<{ taskId: string }> = [];
    client.on('translationError', (event) => failures.push(event));
    const taskId = await sendOne(client, 'msg-saturated');

    for (const _ of Array.from({ length: MAX_ATTEMPTS })) {
      await publish(client, taskId, 'translation pool full');
      await jest.advanceTimersByTimeAsync(ZMQ_TOLERANCE_DEFAULTS.requestTimeoutMs + 1);
    }
    await jest.advanceTimersByTimeAsync(10 * ZMQ_TOLERANCE_DEFAULTS.requestTimeoutMs);

    expect(sent).toHaveLength(MAX_ATTEMPTS);
    expect(sent.every((message) => message.taskId === taskId)).toBe(true);
    expect(failures.filter((failure) => failure.taskId === taskId)).toHaveLength(1);
    expect(client.getStats().pool_full_rejections).toBe(MAX_ATTEMPTS);
    await expect(sendOne(client, 'msg-next')).resolves.toEqual(expect.any(String));
  });
});
