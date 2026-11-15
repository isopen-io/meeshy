/**
 * QA #17204 — garde-fous autour du solde par `translation_skipped`.
 * Un skipped ne solde QUE la requête dont il porte le taskId (chaîne non vide),
 * ne compte aucune erreur, et un taskId mal typé est ignoré sans lever.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { ZmqTranslationClient } from '../ZmqTranslationClient';
import type { ZmqMessageHandler } from '../ZmqMessageHandler';

type Internals = {
  messageHandler: ZmqMessageHandler;
  requestSender: { getPendingRequestsCount(): number; hasPendingRequest(id: string): boolean };
};

const internals = (c: ZmqTranslationClient) => c as unknown as Internals;

function buildClient() {
  const sent: Record<string, unknown>[] = [];
  const client = new ZmqTranslationClient();
  const connectionManager = { send: jest.fn(async (m: Record<string, unknown>) => { sent.push(m); }) };
  Object.assign(client as object, { connectionManager });
  Object.assign((client as unknown as { requestSender: object }).requestSender, { connectionManager });
  return { client, sent };
}

const wire = (c: ZmqTranslationClient, frame: Record<string, unknown>) =>
  internals(c).messageHandler.handleMessage(Buffer.from(JSON.stringify(frame), 'utf-8'));

const send = (c: ZmqTranslationClient, messageId: string) =>
  c.sendTranslationRequest({
    messageId,
    text: 'hello',
    sourceLanguage: 'fr',
    targetLanguages: ['en'],
    conversationId: 'conv-1',
    modelType: 'basic',
  });

const skipped = (extra: Record<string, unknown>) => ({
  type: 'translation_skipped',
  messageId: 'm-long',
  reason: 'message_too_long',
  length: 10_001,
  max_length: 10_000,
  conversationId: 'conv-1',
  ...extra,
});

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('QA — un translation_skipped ne solde que SA requête', () => {
  it("laisse armée une requête voisine dont il ne porte pas le taskId", async () => {
    const { client } = buildClient();
    const mine = await send(client, 'm-long');
    const other = await send(client, 'm-other');

    await wire(client, skipped({ taskId: mine }));

    expect(internals(client).requestSender.hasPendingRequest(mine)).toBe(false);
    expect(internals(client).requestSender.hasPendingRequest(other)).toBe(true);
  });

  it('un taskId inconnu ne solde rien et ne lève pas', async () => {
    const { client } = buildClient();
    await send(client, 'm-long');

    await expect(wire(client, skipped({ taskId: 'forged-task-id' }))).resolves.toBeUndefined();

    expect(internals(client).requestSender.getPendingRequestsCount()).toBe(1);
  });

  it.each([[42], [{ id: 'x' }], [['t']], [''], [null]])(
    'un taskId mal typé (%p) est ignoré : rien soldé, aucun taskId propagé',
    async (badTaskId) => {
      const { client } = buildClient();
      const events: Array<Record<string, unknown>> = [];
      client.on('translationSkipped', (e) => events.push(e as Record<string, unknown>));
      await send(client, 'm-long');

      await wire(client, skipped({ taskId: badTaskId }));

      expect(internals(client).requestSender.getPendingRequestsCount()).toBe(1);
      expect(events).toHaveLength(1);
      expect('taskId' in events[0]).toBe(false);
    }
  );

  it("ne compte aucune erreur reçue dans les stats", async () => {
    const { client } = buildClient();
    const taskId = await send(client, 'm-long');

    await wire(client, skipped({ taskId }));
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(client.getStats().errors_received).toBe(0);
  });

  it('un skipped rejoué après solde est inoffensif (idempotent)', async () => {
    const { client, sent } = buildClient();
    const taskId = await send(client, 'm-long');

    await wire(client, skipped({ taskId }));
    await wire(client, skipped({ taskId }));
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(internals(client).requestSender.getPendingRequestsCount()).toBe(0);
    expect(sent).toHaveLength(1);
  });
});
