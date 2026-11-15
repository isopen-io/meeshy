/**
 * #13102 — une tâche audio dont le fichier est SCELLÉ au repos part `atRest`
 * vers le translator, quel que soit l'appelant : rien n'en sera rangé ni
 * journalisé là-bas. L'appelant peut aussi l'imposer (vue unique, flamme).
 * Une tâche ordinaire garde sa trame d'avant, sans le champ.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const mockLoadAudioAsBinary = jest.fn<any>();
jest.mock('../utils/zmq-helpers', () => ({
  loadAudioAsBinary: (...args: unknown[]) => mockLoadAudioAsBinary(...args),
  audioFormatToMimeType: () => 'audio/mp4',
}));

import { ZmqRequestSender } from '../ZmqRequestSender';

const audio = (sealed: boolean) => ({ buffer: Buffer.from('voix'), mimeType: 'audio/mp4', size: 4, ...(sealed ? { sealed: true } : {}) });

function sender() {
  const connection = { send: jest.fn<any>().mockResolvedValue(undefined), sendMultipart: jest.fn<any>().mockResolvedValue(undefined) };
  return { connection, sender: new ZmqRequestSender(connection as never) };
}

const audioRequest = (overrides: Record<string, unknown> = {}) => ({
  messageId: 'bbbbbbbbbbbbbbbbbbbbbbb1', attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', conversationId: 'c', senderId: 's',
  audioPath: '/app/uploads/2026/10/u/x.m4a', audioDurationMs: 1000, targetLanguages: ['en'], generateVoiceClone: false, modelType: 'medium',
  ...overrides,
});

describe('le régime d’une tâche audio vers le translator', () => {
  it.each([
    ['un fichier scellé', true, {}, true],
    ['un appelant qui protège la tâche', false, { atRest: true }, true],
    ['une tâche ordinaire', false, {}, false],
  ])('audio_process — %s', async (_label, sealed, overrides, expected) => {
    mockLoadAudioAsBinary.mockResolvedValueOnce(audio(sealed as boolean));
    const { connection, sender: s } = sender();
    await s.sendAudioProcessRequest(audioRequest(overrides as Record<string, unknown>) as never);
    const payload = (connection.sendMultipart.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect('atRest' in payload).toBe(expected);
    if (expected) expect(payload.atRest).toBe(true);
  });

  it.each([[true, true], [false, false]])('transcription_only — fichier scellé %s', async (sealed, expected) => {
    mockLoadAudioAsBinary.mockResolvedValueOnce(audio(sealed));
    const { connection, sender: s } = sender();
    await s.sendTranscriptionOnlyRequest({ messageId: 'bbbbbbbbbbbbbbbbbbbbbbb1', attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', audioPath: '/app/uploads/x.m4a' } as never);
    const payload = (connection.sendMultipart.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(payload.atRest === true).toBe(expected);
  });

  it('cache_forget ne porte que des identifiants', async () => {
    const { connection, sender: s } = sender();
    await s.sendCacheForgetRequest({ requestId: 'r', attachmentIds: ['aaaaaaaaaaaaaaaaaaaaaaa1'], messageIds: ['bbbbbbbbbbbbbbbbbbbbbbb1'] });
    expect((connection.send.mock.calls[0] as unknown[])[0]).toEqual({ type: 'cache_forget', requestId: 'r', attachmentIds: ['aaaaaaaaaaaaaaaaaaaaaaa1'], messageIds: ['bbbbbbbbbbbbbbbbbbbbbbb1'] });
  });
});
