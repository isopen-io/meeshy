/**
 * #18042 — témoins QA indépendants : le `kind` d'une entrée en attente survit au
 * réarmement (deadman + renvoi), chaque pipeline non texte reste armé sous un
 * refus mal adressé, et un refus sans taskId ne solde rien (ancien translator).
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

jest.mock('../utils/zmq-helpers', () => ({
  ...jest.requireActual<typeof import('../utils/zmq-helpers')>('../utils/zmq-helpers'),
  loadAudioAsBinary: jest.fn(async () => ({ buffer: Buffer.from('RIFF'), mimeType: 'audio/wav', size: 4 })),
}));

import { ZmqTranslationClient } from '../ZmqTranslationClient';
import type { ZmqMessageHandler } from '../ZmqMessageHandler';

type SentMessage = Record<string, unknown>;

type ClientInternals = {
  messageHandler: ZmqMessageHandler;
  requestSender: { hasPendingRequest(taskId: string): boolean };
  retryCount: Map<string, number>;
};

const internals = (client: ZmqTranslationClient): ClientInternals => client as unknown as ClientInternals;

function buildClient() {
  const sent: SentMessage[] = [];
  const client = new ZmqTranslationClient();
  const connectionManager = {
    send: jest.fn(async (message: SentMessage) => {
      sent.push(message);
    }),
    sendMultipart: jest.fn(async (message: SentMessage) => {
      sent.push(message);
    }),
  };
  Object.assign(client as object, { connectionManager });
  Object.assign((client as unknown as { requestSender: object }).requestSender, { connectionManager });
  return { client, sent };
}

const wire = (client: ZmqTranslationClient, frame: Record<string, unknown>) =>
  internals(client).messageHandler.handleMessage(Buffer.from(JSON.stringify(frame), 'utf-8'));

const skippedFrame = (overrides: Record<string, unknown> = {}) => ({
  type: 'translation_skipped',
  messageId: 'msg-1',
  conversationId: 'conv-1',
  reason: 'message_too_long',
  ...overrides,
});

const sendText = (client: ZmqTranslationClient) =>
  client.sendTranslationRequest({
    messageId: 'msg-1',
    text: 'bonjour',
    sourceLanguage: 'fr',
    targetLanguages: ['en'],
    conversationId: 'conv-1',
    modelType: 'medium',
  });

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('QA #18042 — le type de la requête survit au réarmement', () => {
  it('solde une traduction texte renvoyée après un deadman, et efface son budget de retry', async () => {
    const { client, sent } = buildClient();
    const errors: unknown[] = [];
    client.on('translationError', (e) => errors.push(e));
    const taskId = await sendText(client);

    await jest.advanceTimersByTimeAsync(30_000);
    expect(sent).toHaveLength(2);
    expect(internals(client).retryCount.get(taskId)).toBe(1);

    await wire(client, skippedFrame({ taskId }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(false);
    expect(internals(client).retryCount.has(taskId)).toBe(false);

    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(sent).toHaveLength(2);
    expect(errors).toEqual([]);
  });
});

describe('QA #18042 — chaque pipeline non texte reste armé sous un refus mal adressé', () => {
  it('laisse armé un traitement audio', async () => {
    const { client } = buildClient();
    const taskId = await client.sendAudioProcessRequest({
      messageId: 'msg-1',
      attachmentId: 'att-1',
      conversationId: 'conv-1',
      senderId: 'user-1',
      audioPath: '/tmp/vocal.wav',
      audioDurationMs: 1200,
      targetLanguages: ['en'],
      generateVoiceClone: false,
      modelType: 'medium',
    });

    await wire(client, skippedFrame({ taskId }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(true);
  });

  it('laisse armée une transcription', async () => {
    const { client } = buildClient();
    const taskId = await client.sendTranscriptionOnlyRequest({
      messageId: 'msg-1',
      attachmentId: 'att-1',
      audioData: Buffer.from('RIFF').toString('base64'),
      audioFormat: 'wav',
    });

    await wire(client, skippedFrame({ taskId }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(true);
  });

  it('laisse armée une requête de profil vocal', async () => {
    const { client } = buildClient();
    const taskId = await client.sendVoiceProfileRequest({
      type: 'voice_profile_compare',
      request_id: 'vp-1',
    } as Parameters<ZmqTranslationClient['sendVoiceProfileRequest']>[0]);

    await wire(client, skippedFrame({ taskId }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(true);
  });
});

describe('QA #18042 — rétrocompatibilité', () => {
  it('un refus sans taskId ne solde aucune traduction texte en attente', async () => {
    const { client } = buildClient();
    const taskId = await sendText(client);

    await wire(client, skippedFrame());

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(true);
    expect(client.getStats().translation_skipped).toBe(1);
  });

  it('un refus pour un taskId inconnu se compte et se relaie sans rien solder ni lever', async () => {
    const { client } = buildClient();
    const skipped: unknown[] = [];
    client.on('translationSkipped', (e) => skipped.push(e));
    const taskId = await sendText(client);

    await wire(client, skippedFrame({ taskId: 'inconnu' }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(true);
    expect(skipped).toHaveLength(1);
    expect(client.getStats().translation_skipped).toBe(1);
    expect(client.getStats().errors_received).toBe(0);
  });
});
