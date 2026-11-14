/**
 * #18064 — la `reason` d'un `translation_skipped` vient du fil : elle est bornée
 * à 64 caractères avant d'être journalisée ET relayée. Un translator défaillant
 * ou un pair hostile ne remplit ni le journal ni l'événement d'une chaîne
 * arbitraire ; une raison courte passe intacte.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const info = jest.fn<(message: string) => void>();

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: (message: string) => info(message),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { ZmqMessageHandler } from '../ZmqMessageHandler';
import type { TranslationSkippedPayload } from '../types';

const skippedFrame = (reason: unknown) =>
  Buffer.from(
    JSON.stringify({ type: 'translation_skipped', messageId: 'msg-1', conversationId: 'conv-1', reason }),
    'utf-8'
  );

const relay = async (reason: unknown) => {
  const handler = new ZmqMessageHandler();
  const skipped: TranslationSkippedPayload[] = [];
  handler.on('translationSkipped', (payload: TranslationSkippedPayload) => skipped.push(payload));
  await handler.handleMessage(skippedFrame(reason));
  return skipped;
};

const skipLogs = () => info.mock.calls.map(([message]) => message).filter((message) => message.includes('ignorée'));

describe('La raison d’un refus est bornée à 64 caractères (#18064)', () => {
  beforeEach(() => info.mockClear());

  it('tronque une raison démesurée dans l’événement relayé', async () => {
    const [payload] = await relay('r'.repeat(10_000));
    expect(payload.reason).toBe('r'.repeat(64));
  });

  it('tronque la raison journalisée', async () => {
    await relay('z'.repeat(10_000));
    const logs = skipLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('z'.repeat(64));
    expect(logs[0]).not.toContain('z'.repeat(65));
  });

  it('laisse intacte une raison courte', async () => {
    const [payload] = await relay('message_too_long');
    expect(payload.reason).toBe('message_too_long');
    expect(skipLogs()[0]).toContain('(message_too_long)');
  });

  it('garde exactement 64 caractères à la limite', async () => {
    const [payload] = await relay('a'.repeat(64));
    expect(payload.reason).toBe('a'.repeat(64));
  });
});
