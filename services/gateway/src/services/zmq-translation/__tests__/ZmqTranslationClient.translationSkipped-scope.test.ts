/**
 * #18042 — un `translation_skipped` ne solde que la traduction TEXTE qu'il vise.
 *
 * Le translator ne publie ce refus que pour une traduction texte trop longue
 * (#17204). Le client soldait pourtant toute requête en attente sous ce taskId,
 * quel qu'en soit le type : un refus mal adressé désarmait le deadman et le
 * budget de retry d'une requête audio ou voix, qui ne revenait plus jamais.
 * Le refus se compte aussi (`translation_skipped`), et ses champs, venus du
 * fil, sont filtrés par type avant d'être relayés.
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

type SentMessage = Record<string, unknown>;

type ClientInternals = {
  messageHandler: ZmqMessageHandler;
  requestSender: { getPendingRequestsCount(): number; hasPendingRequest(taskId: string): boolean };
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

const sendVoice = (client: ZmqTranslationClient) =>
  client.sendVoiceAPIRequest({ type: 'voice_profile_status', taskId: 'voice-task-1', userId: 'user-1' });

const sendText = (client: ZmqTranslationClient) =>
  client.sendTranslationRequest({
    messageId: 'msg-1',
    text: 'x'.repeat(42),
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

describe('Un translation_skipped ne solde que la traduction texte qu’il vise', () => {
  it('laisse armée une requête voix en attente sous le même taskId', async () => {
    const { client, sent } = buildClient();
    const voiceErrors: unknown[] = [];
    client.on('voiceAPIError', (e) => voiceErrors.push(e));

    const taskId = await sendVoice(client);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(sent).toHaveLength(2);
    expect(internals(client).retryCount.get(taskId)).toBe(1);

    await wire(client, skippedFrame({ taskId }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(true);
    expect(internals(client).retryCount.get(taskId)).toBe(1);

    await jest.advanceTimersByTimeAsync(30_000);
    expect(sent).toHaveLength(3);
  });

  it('solde toujours une traduction texte en attente', async () => {
    const { client } = buildClient();
    const taskId = await sendText(client);

    await wire(client, skippedFrame({ taskId }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(false);
  });

  it('relaie le refus même quand il ne solde rien', async () => {
    const { client } = buildClient();
    const skipped: unknown[] = [];
    client.on('translationSkipped', (e) => skipped.push(e));
    const taskId = await sendVoice(client);

    await wire(client, skippedFrame({ taskId }));

    expect(skipped).toEqual([expect.objectContaining({ taskId })]);
  });
});

describe('Le refus se compte dans les statistiques', () => {
  it('part de zéro', () => {
    const { client } = buildClient();
    expect(client.getStats().translation_skipped).toBe(0);
  });

  it('compte chaque refus reçu, avec ou sans taskId, soldant ou non', async () => {
    const { client } = buildClient();
    const textTask = await sendText(client);
    const voiceTask = await sendVoice(client);

    await wire(client, skippedFrame({ taskId: textTask }));
    await wire(client, skippedFrame({ taskId: voiceTask }));
    await wire(client, skippedFrame());

    expect(client.getStats().translation_skipped).toBe(3);
    expect(client.getStats().errors_received).toBe(0);
  });
});

describe('Les champs du refus sont filtrés par type', () => {
  it('rend une chaîne vide pour des identifiants qui n’en sont pas, et « unknown » pour la raison', async () => {
    const { client } = buildClient();
    const skipped: unknown[] = [];
    client.on('translationSkipped', (e) => skipped.push(e));

    await wire(client, skippedFrame({ messageId: 42, conversationId: { $ne: null }, reason: ['x'] }));

    expect(skipped).toEqual([{ messageId: '', conversationId: '', reason: 'unknown' }]);
  });

  it('rend « unknown » pour une raison absente', async () => {
    const { client } = buildClient();
    const skipped: unknown[] = [];
    client.on('translationSkipped', (e) => skipped.push(e));

    await wire(client, { type: 'translation_skipped', messageId: 'msg-1', conversationId: 'conv-1' });

    expect(skipped).toEqual([{ messageId: 'msg-1', conversationId: 'conv-1', reason: 'unknown' }]);
  });

  it('garde intactes des chaînes valides', async () => {
    const { client } = buildClient();
    const skipped: unknown[] = [];
    client.on('translationSkipped', (e) => skipped.push(e));

    await wire(client, skippedFrame({ taskId: 't-1', length: 10_001, max_length: 10_000 }));

    expect(skipped).toEqual([
      { taskId: 't-1', messageId: 'msg-1', conversationId: 'conv-1', reason: 'message_too_long', length: 10_001, maxLength: 10_000 },
    ]);
  });
});
