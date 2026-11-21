/**
 * #19734 — une traduction TEXTE SEULE (TTS en échec) qui suit une piste
 * vocale de la même langue ne doit pas effacer la référence de cette piste :
 * c'est elle qui fait effacer le fichier avec la pièce.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
}));

import { AudioTranslateService, resetAudioTranslateService } from '../../../services/AudioTranslateService';
import { MockZmqClient, createMockPrisma, emitVoiceSuccess } from '../../helpers/audio-translate-service-doubles';

const FR_TRACK = {
  type: 'audio',
  transcription: 'Bonjour',
  path: '/uploads/translated/att-1_fr.mp3',
  url: '/api/v1/attachments/file/translated/att-1_fr.mp3',
  durationMs: 1800,
  format: 'mp3',
  createdAt: '2026-11-01T00:00:00.000Z',
};

const textOnlyResult = (audioUrl?: string) => ({
  translationId: 'trans-002',
  originalAudio: { transcription: 'Hello', language: 'en', durationMs: 2000, confidence: 0.9 },
  translations: [
    {
      targetLanguage: 'fr',
      translatedText: 'Bonjour à tous',
      ...(audioUrl === undefined ? {} : { audioUrl }),
      durationMs: 0,
      voiceCloned: false,
      voiceQuality: 0,
    },
  ],
  processingTimeMs: 1200,
});

const persistedTranslations = (prisma: ReturnType<typeof createMockPrisma>) => {
  const call = prisma.messageAttachment.update.mock.calls[0][0] as { data: { translations: Record<string, Record<string, unknown>> } };
  return call.data.translations;
};

const translateWith = async (existing: Record<string, unknown>, result: ReturnType<typeof textOnlyResult>) => {
  const zmq = new MockZmqClient();
  const prisma = createMockPrisma();
  prisma.messageAttachment.findUnique.mockResolvedValue({ translations: existing });
  const service = new AudioTranslateService(prisma as never, zmq as never);
  const pending = service.translateSync('user-1', { targetLanguages: ['fr'], attachmentId: 'att-1', saveToDatabase: true });
  emitVoiceSuccess(zmq, result);
  await pending;
  return persistedTranslations(prisma);
};

describe('AudioTranslateService — une traduction texte seule garde la piste précédente (#19734)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetAudioTranslateService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    resetAudioTranslateService();
  });

  it('garde path et url de la voix fr déjà inscrite et inscrit le nouveau texte', async () => {
    const saved = await translateWith({ fr: FR_TRACK }, textOnlyResult());

    expect(saved.fr).toEqual(expect.objectContaining({ transcription: 'Bonjour à tous', path: FR_TRACK.path, url: FR_TRACK.url }));
  });

  it('traite une adresse vide d’un ancien traducteur comme une absence', async () => {
    const saved = await translateWith({ fr: FR_TRACK }, textOnlyResult(''));

    expect(saved.fr).toEqual(expect.objectContaining({ transcription: 'Bonjour à tous', path: FR_TRACK.path, url: FR_TRACK.url }));
  });

  it('ne ressuscite pas la référence d’une piste effacée', async () => {
    const saved = await translateWith({ fr: { ...FR_TRACK, deletedAt: '2026-11-02T00:00:00.000Z' } }, textOnlyResult());

    expect(saved.fr).not.toHaveProperty('path');
    expect(saved.fr).not.toHaveProperty('url');
    expect(saved.fr.transcription).toBe('Bonjour à tous');
  });

  it('remplace la piste quand la nouvelle traduction en apporte une', async () => {
    const saved = await translateWith({ fr: FR_TRACK }, textOnlyResult('/api/v1/attachments/file/translated/att-1_fr_v2.mp3'));

    expect(saved.fr).toEqual(expect.objectContaining({ url: '/api/v1/attachments/file/translated/att-1_fr_v2.mp3', path: '/api/v1/attachments/file/translated/att-1_fr_v2.mp3' }));
  });
});
