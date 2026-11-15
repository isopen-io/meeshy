/**
 * #16622 — un appelant qui abandonne une traduction à SON délai ne doit pas
 * laisser le client la re-pousser au traducteur après coup.
 *
 * Le relais des sous-titres d'appel renonce à 10 s ; le client, lui, armait le
 * délai générique (30 s) et ses renvois sous le même taskId. Un sous-titre déjà
 * abandonné revenait donc dans la file du traducteur, devant les sous-titres
 * vivants. `translateText` accepte désormais, en dernier, `{ timeoutMs,
 * retryEnabled }` ; sans ces options, rien ne change.
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

type SentMessage = Record<string, unknown>;

function buildClient() {
  const sent: SentMessage[] = [];
  const failures: Record<string, unknown>[] = [];
  const client = new ZmqTranslationClient();

  (client as any).connectionManager = {
    send: jest.fn(async (message: SentMessage) => {
      sent.push(message);
    }),
  };
  (client as any).requestSender.connectionManager = (client as any).connectionManager;
  client.on('translationError', (event: Record<string, unknown>) => failures.push(event));

  return { client, sent, failures };
}

const pendingCount = (client: ZmqTranslationClient): number =>
  (client as any).requestSender.getPendingRequestsCount();

const translateCaption = (client: ZmqTranslationClient, options?: { timeoutMs?: number; retryEnabled?: boolean }) =>
  client.translateText('Bonjour', 'fr', 'en', 'call-abc-0', 'abc', 'basic', options);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Un appelant qui fixe son délai sans renvoi", () => {
  it("n'est jamais re-poussé au traducteur après son délai", async () => {
    const { client, sent } = buildClient();

    await translateCaption(client, { timeoutMs: 10_000, retryEnabled: false });
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(sent).toHaveLength(1);
  });

  it("se solde à SON délai, pas au délai générique", async () => {
    const { client, failures } = buildClient();

    const taskId = await translateCaption(client, { timeoutMs: 10_000, retryEnabled: false });
    await jest.advanceTimersByTimeAsync(9_999);
    expect(pendingCount(client)).toBe(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(pendingCount(client)).toBe(0);
    expect(failures).toHaveLength(1);
    expect(failures[0].taskId).toBe(taskId);
  });
});

describe('Ce qui ne change pas', () => {
  it('sans options, renvoie la requête sous le même taskId après le délai générique', async () => {
    const { client, sent } = buildClient();

    const taskId = await translateCaption(client);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(sent).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(30_000);
    expect(sent.length).toBeGreaterThan(1);
    expect(sent[sent.length - 1].taskId).toBe(taskId);
  });
});
