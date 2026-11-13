/**
 * #18063 — un `translation_error` ne solde que la traduction TEXTE qu'il vise.
 *
 * Le client soldait toute requête en attente sous le taskId de l'erreur, quel
 * qu'en soit le type : une erreur mal adressée désarmait le deadman et le budget
 * de retry d'une requête audio, transcription ou voix, qui ne revenait plus
 * jamais. Pire, relayée en `translationError`, elle devenait un
 * `translation:failed` diffusé pour le message audio — l'échec d'une traduction
 * texte qui n'avait jamais été demandée. Sous un taskId non texte en attente,
 * l'erreur ne solde rien, ne compte rien, et ne se relaie pas. Ses champs, venus
 * du fil, sont filtrés par type avant d'être relayés (même règle que
 * `translation_skipped`, #18042).
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

const errorFrame = (overrides: Record<string, unknown> = {}) => ({
  type: 'translation_error',
  messageId: 'msg-1',
  conversationId: 'conv-1',
  error: 'boom',
  ...overrides,
});

const sendText = (client: ZmqTranslationClient, targetLanguages: string[] = ['en']) =>
  client.sendTranslationRequest({
    messageId: 'msg-1',
    text: 'bonjour',
    sourceLanguage: 'fr',
    targetLanguages,
    conversationId: 'conv-1',
    modelType: 'medium',
  });

const sendVoice = (client: ZmqTranslationClient) =>
  client.sendVoiceAPIRequest({ type: 'voice_profile_status', taskId: 'voice-task-1', userId: 'user-1' });

const sendAudio = (client: ZmqTranslationClient) =>
  client.sendAudioProcessRequest({
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

const sendTranscription = (client: ZmqTranslationClient) =>
  client.sendTranscriptionOnlyRequest({
    messageId: 'msg-1',
    attachmentId: 'att-1',
    audioData: Buffer.from('RIFF').toString('base64'),
    audioFormat: 'wav',
  });

const sendVoiceProfile = (client: ZmqTranslationClient) =>
  client.sendVoiceProfileRequest({
    type: 'voice_profile_compare',
    request_id: 'vp-1',
  } as Parameters<ZmqTranslationClient['sendVoiceProfileRequest']>[0]);

const collect = (client: ZmqTranslationClient, event: string) => {
  const seen: unknown[] = [];
  client.on(event, (e) => seen.push(e));
  return seen;
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Une erreur sous le taskId d’une requête NON texte la laisse armée', () => {
  it.each([
    ['audio', sendAudio],
    ['transcription', sendTranscription],
    ['voix', sendVoice],
    ['profil vocal', sendVoiceProfile],
  ] as const)('requête %s : reste en attente, rien ne se relaie ni ne se compte', async (_label, send) => {
    const { client } = buildClient();
    const errors = collect(client, 'translationError');
    const taskId = await send(client);

    await wire(client, errorFrame({ taskId }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(true);
    expect(errors).toEqual([]);
    expect(client.getStats().errors_received).toBe(0);
  });

  it('garde le budget de retry : le deadman renvoie encore', async () => {
    const { client, sent } = buildClient();
    const taskId = await sendVoice(client);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(sent).toHaveLength(2);
    expect(internals(client).retryCount.get(taskId)).toBe(1);

    await wire(client, errorFrame({ taskId }));

    expect(internals(client).retryCount.get(taskId)).toBe(1);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(sent).toHaveLength(3);
  });

  it('n’ouvre pas le disjoncteur, quel que soit leur nombre', async () => {
    const { client } = buildClient();
    const taskId = await sendVoice(client);

    for (let i = 0; i < 20; i++) await wire(client, errorFrame({ taskId }));

    await expect(sendText(client)).resolves.toEqual(expect.any(String));
  });

  it('un refus « translation pool full » mal adressé ne se relaie pas non plus', async () => {
    const { client } = buildClient();
    const errors = collect(client, 'translationError');
    const taskId = await sendAudio(client);

    await wire(client, errorFrame({ taskId, error: 'translation pool full' }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(true);
    expect(errors).toEqual([]);
    expect(client.getStats().pool_full_rejections).toBe(0);
  });

  it('un refus UNSUPPORTED_LANGUAGE mal adressé ne solde pas la requête audio', async () => {
    const { client } = buildClient();
    const unsupported = collect(client, 'translationUnsupported');
    const taskId = await sendAudio(client);

    await wire(client, errorFrame({ taskId, errorCode: 'UNSUPPORTED_LANGUAGE', targetLanguage: 'en' }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(true);
    expect(unsupported).toEqual([]);
  });
});

describe('Une erreur de traduction TEXTE se solde comme avant', () => {
  it('solde la requête texte en attente et relaie l’erreur', async () => {
    const { client } = buildClient();
    const errors = collect(client, 'translationError');
    const taskId = await sendText(client);

    await wire(client, errorFrame({ taskId }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(false);
    expect(errors).toEqual([expect.objectContaining({ taskId, messageId: 'msg-1', error: 'boom' })]);
    expect(client.getStats().errors_received).toBe(1);
  });

  it('relaie une erreur sous un taskId inconnu ou déjà soldé', async () => {
    const { client } = buildClient();
    const errors = collect(client, 'translationError');

    await wire(client, errorFrame({ taskId: 'gone-task' }));

    expect(errors).toEqual([expect.objectContaining({ taskId: 'gone-task' })]);
  });

  it('relaie une erreur sans taskId (ancien translator)', async () => {
    const { client } = buildClient();
    const errors = collect(client, 'translationError');

    await wire(client, errorFrame());

    expect(errors).toEqual([{ messageId: 'msg-1', conversationId: 'conv-1', error: 'boom', metadata: {} }]);
  });

  it('laisse armée une traduction texte refusée « translation pool full »', async () => {
    const { client } = buildClient();
    const errors = collect(client, 'translationError');
    const taskId = await sendText(client);

    await wire(client, errorFrame({ taskId, error: 'translation pool full' }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(true);
    expect(errors).toEqual([]);
    expect(client.getStats().pool_full_rejections).toBe(1);
  });

  it('annonce un refus UNSUPPORTED_LANGUAGE sans taskId (ancien translator)', async () => {
    const { client } = buildClient();
    const unsupported = collect(client, 'translationUnsupported');
    const errors = collect(client, 'translationError');

    await wire(client, errorFrame({ errorCode: 'UNSUPPORTED_LANGUAGE', targetLanguage: 'en' }));

    expect(unsupported).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it('ne solde que la langue non servie d’une traduction texte', async () => {
    const { client } = buildClient();
    const unsupported = collect(client, 'translationUnsupported');
    const taskId = await sendText(client, ['en', 'es']);

    await wire(client, errorFrame({ taskId, errorCode: 'UNSUPPORTED_LANGUAGE', targetLanguage: 'en' }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(true);
    expect(unsupported).toHaveLength(1);

    await wire(client, errorFrame({ taskId, errorCode: 'UNSUPPORTED_LANGUAGE', targetLanguage: 'es' }));

    expect(internals(client).requestSender.hasPendingRequest(taskId)).toBe(false);
  });
});

describe('Les champs de l’erreur sont filtrés par type', () => {
  it('rend une chaîne vide pour des identifiants qui n’en sont pas, et un libellé fixe pour l’erreur', async () => {
    const { client } = buildClient();
    const errors = collect(client, 'translationError');

    await wire(client, errorFrame({
      taskId: 42,
      messageId: 42,
      conversationId: { $ne: null },
      error: ['x'],
      errorCode: 7,
      targetLanguage: { lang: 'en' },
      metadata: ['not', 'an', 'object'],
    }));

    expect(errors).toEqual([{ messageId: '', conversationId: '', error: 'unknown error', metadata: {} }]);
  });

  it('écarte les chaînes vides de taskId, errorCode et targetLanguage', async () => {
    const { client } = buildClient();
    const errors = collect(client, 'translationError');

    await wire(client, errorFrame({ taskId: '', errorCode: '', targetLanguage: '' }));

    expect(errors).toEqual([{ messageId: 'msg-1', conversationId: 'conv-1', error: 'boom', metadata: {} }]);
  });

  it('rend {} pour des métadonnées nulles ou scalaires', async () => {
    const { client } = buildClient();
    const errors = collect(client, 'translationError');

    await wire(client, errorFrame({ metadata: null }));
    await wire(client, errorFrame({ metadata: 'x' }));

    expect(errors).toEqual([
      expect.objectContaining({ metadata: {} }),
      expect.objectContaining({ metadata: {} }),
    ]);
  });

  it('garde intacte une trame valide', async () => {
    const { client } = buildClient();
    const errors = collect(client, 'translationError');

    await wire(client, errorFrame({
      taskId: 't-1',
      errorCode: 'MODEL_ERROR',
      targetLanguage: 'de',
      metadata: { attempt: 2 },
    }));

    expect(errors).toEqual([{
      taskId: 't-1',
      messageId: 'msg-1',
      error: 'boom',
      conversationId: 'conv-1',
      errorCode: 'MODEL_ERROR',
      targetLanguage: 'de',
      metadata: { attempt: 2 },
    }]);
  });
});
