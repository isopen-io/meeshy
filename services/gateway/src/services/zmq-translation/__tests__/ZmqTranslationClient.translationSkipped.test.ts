/**
 * #17204 — un `translation_skipped` du translator solde sa requête.
 *
 * Un texte plus long que `MAX_TRANSLATION_LENGTH` ne sera jamais traduit : le
 * translator publie `translation_skipped` (raison `message_too_long`). La
 * passerelle ne connaissait pas ce type — la requête restait armée et le délai
 * la renvoyait jusqu'à `ZMQ_MAX_RETRIES`, puis annonçait un `translationError` :
 * cinq envois pour rien. Le lecteur garde l'original (règle 1 du Prisme).
 *
 * Le témoin part de la trame JSON réelle du translator
 * (`TranslationHandler._handle_translation_request`) et la fait traverser
 * `ZmqMessageHandler.handleMessage`, jamais un événement fabriqué en aval.
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

import { ZmqTranslationClient } from '../ZmqTranslationClient';
import type { ZmqMessageHandler } from '../ZmqMessageHandler';

const MSG_ID = 'msg-long-1';

type SentMessage = Record<string, unknown>;

type ClientInternals = {
  messageHandler: ZmqMessageHandler;
  requestSender: { getPendingRequestsCount(): number };
  cbConsecutiveErrors: number;
  cbOpenedAt: number | null;
};

const internals = (client: ZmqTranslationClient): ClientInternals => client as unknown as ClientInternals;

function buildClient() {
  const sent: SentMessage[] = [];
  const client = new ZmqTranslationClient();
  const connectionManager = {
    send: jest.fn(async (message: SentMessage) => {
      sent.push(message);
    }),
  };
  Object.assign(client as object, { connectionManager });
  Object.assign((client as unknown as { requestSender: object }).requestSender, { connectionManager });
  return { client, sent };
}

const wire = (client: ZmqTranslationClient, frame: Record<string, unknown>) =>
  internals(client).messageHandler.handleMessage(Buffer.from(JSON.stringify(frame), 'utf-8'));

const pendingCount = (client: ZmqTranslationClient): number =>
  internals(client).requestSender.getPendingRequestsCount();

const send = (client: ZmqTranslationClient) =>
  client.sendTranslationRequest({
    messageId: MSG_ID,
    text: 'x'.repeat(42),
    sourceLanguage: 'fr',
    targetLanguages: ['en', 'es'],
    conversationId: 'conv-1',
    modelType: 'medium',
  });

const skippedFrame = (taskId?: string) => ({
  type: 'translation_skipped',
  messageId: MSG_ID,
  reason: 'message_too_long',
  length: 10_001,
  max_length: 10_000,
  conversationId: 'conv-1',
  ...(taskId ? { taskId } : {}),
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Un translation_skipped portant taskId solde sa requête', () => {
  it("ne renvoie rien au délai et n'annonce aucun échec", async () => {
    const { client, sent } = buildClient();
    const failures: unknown[] = [];
    client.on('translationError', (e) => failures.push(e));

    const taskId = await send(client);
    await wire(client, skippedFrame(taskId));
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(pendingCount(client)).toBe(0);
    expect(sent).toHaveLength(1);
    expect(failures).toHaveLength(0);
  });

  it('ne compte rien au disjoncteur, ni échec ni succès', async () => {
    const { client } = buildClient();
    const failedTask = await send(client);
    await wire(client, { type: 'translation_error', taskId: failedTask, messageId: MSG_ID, error: 'model unavailable', conversationId: 'conv-1' });
    expect(internals(client).cbConsecutiveErrors).toBe(1);

    const taskId = await send(client);
    await wire(client, skippedFrame(taskId));

    expect(internals(client).cbConsecutiveErrors).toBe(1);
    expect(internals(client).cbOpenedAt).toBeNull();
  });

  it('annonce le refus sous son propre nom, pour qui veut l’observer', async () => {
    const { client } = buildClient();
    const skipped: unknown[] = [];
    client.on('translationSkipped', (e) => skipped.push(e));

    const taskId = await send(client);
    await wire(client, skippedFrame(taskId));

    expect(skipped).toEqual([
      expect.objectContaining({ taskId, messageId: MSG_ID, reason: 'message_too_long', length: 10_001, maxLength: 10_000 }),
    ]);
  });
});

describe('Un translation_skipped sans taskId (ancien translator) est inoffensif', () => {
  it('ne casse rien et ne solde aucune requête', async () => {
    const { client } = buildClient();
    const skipped: unknown[] = [];
    const failures: unknown[] = [];
    client.on('translationSkipped', (e) => skipped.push(e));
    client.on('translationError', (e) => failures.push(e));

    await send(client);
    await expect(wire(client, skippedFrame())).resolves.toBeUndefined();

    expect(pendingCount(client)).toBe(1);
    expect(failures).toHaveLength(0);
    expect(skipped).toEqual([expect.objectContaining({ messageId: MSG_ID, reason: 'message_too_long' })]);
  });
});
