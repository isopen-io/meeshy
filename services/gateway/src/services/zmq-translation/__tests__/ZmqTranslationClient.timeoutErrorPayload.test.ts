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

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';
const TIMEOUT_ERROR = 'ZMQ timeout: no response from translator';

type Emitted = Record<string, unknown>;

function buildClient(options: { failResend?: boolean } = {}) {
  const translationErrors: Emitted[] = [];
  const voiceErrors: Emitted[] = [];
  const client = new ZmqTranslationClient();
  let sends = 0;

  (client as any).connectionManager = {
    send: jest.fn(async () => {
      sends += 1;
      if (options.failResend && sends > 1) throw new Error('socket closed');
    }),
  };
  (client as any).requestSender.connectionManager = (client as any).connectionManager;
  client.on('translationError', (event: Emitted) => translationErrors.push(event));
  client.on('voiceAPIError', (event: Emitted) => voiceErrors.push(event));

  return { client, translationErrors, voiceErrors };
}

const sendText = (client: ZmqTranslationClient, deadline?: { timeoutMs?: number; retryEnabled?: boolean }) =>
  client.sendTranslationRequest(
    {
      messageId: MESSAGE_ID,
      text: 'Bonjour',
      sourceLanguage: 'fr',
      targetLanguages: ['en'],
      conversationId: CONVERSATION_ID,
      modelType: 'basic',
    } as any,
    deadline
  );

const expectCompletePayload = (event: Emitted, taskId: string) => {
  expect(event).toStrictEqual({
    taskId,
    messageId: MESSAGE_ID,
    error: TIMEOUT_ERROR,
    conversationId: CONVERSATION_ID,
    metadata: {},
  });
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Le chien de garde d\'une traduction texte émet un TranslationErrorPayload complet (#18232)', () => {
  it('au délai d\'un appelant sans renvoi', async () => {
    const { client, translationErrors } = buildClient();

    const taskId = await sendText(client, { timeoutMs: 10_000, retryEnabled: false });
    await jest.advanceTimersByTimeAsync(10_000);

    expect(translationErrors).toHaveLength(1);
    expectCompletePayload(translationErrors[0], taskId);
  });

  it('quand les renvois sont épuisés', async () => {
    const { client, translationErrors } = buildClient();

    const taskId = await sendText(client);
    await jest.advanceTimersByTimeAsync(30 * 60_000);

    expect(translationErrors).toHaveLength(1);
    expectCompletePayload(translationErrors[0], taskId);
  });

  it('quand un renvoi échoue', async () => {
    const { client, translationErrors } = buildClient({ failResend: true });

    const taskId = await sendText(client);
    await jest.advanceTimersByTimeAsync(30 * 60_000);

    expect(translationErrors).toHaveLength(1);
    expectCompletePayload(translationErrors[0], taskId);
  });
});

describe('Ce qui ne change pas', () => {
  it('le chien de garde voix garde sa forme, sans metadata', async () => {
    const { client, voiceErrors } = buildClient();

    const taskId = await client.sendVoiceAPIRequest({ type: 'voice_translate', taskId: 'voice-task-1', userId: 'user-1' });
    await jest.advanceTimersByTimeAsync(60 * 60_000);

    expect(voiceErrors).toStrictEqual([
      { taskId, requestType: 'voice_translate', error: TIMEOUT_ERROR, errorCode: 'TIMEOUT' },
    ]);
  });
});
