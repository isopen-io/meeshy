/**
 * #19734 — sur un post ou une story, une traduction TEXTE SEULE (TTS en échec)
 * qui suit une piste vocale de la même langue garde la référence de cette
 * piste, et les autres langues déjà inscrites restent inscrites.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../ZmqSingleton', () => ({ ZMQSingleton: { getInstanceSync: jest.fn(() => null) } }));

import { PostAudioService } from '../PostAudioService';

type Entry = Parameters<PostAudioService['handleAudioTranslationsReady']>[0]['translations'][string];

const FR_TRACK = {
  type: 'audio',
  transcription: 'Bonjour',
  path: '/uploads/translated/pm-1_fr.mp3',
  url: '/api/v1/attachments/file/translated/pm-1_fr.mp3',
  durationMs: 1800,
  format: 'audio/mp3',
  cloned: false,
  quality: 0.9,
  ttsModel: 'chatterbox',
};

const ES_TRACK = { ...FR_TRACK, transcription: 'Hola', path: '/uploads/translated/pm-1_es.mp3', url: '/api/v1/attachments/file/translated/pm-1_es.mp3' };

const FR_TEXT_ONLY = {
  type: 'audio',
  transcription: 'Bonjour à tous',
  durationMs: 0,
  format: 'audio/mp3',
  cloned: false,
  quality: 0,
  ttsModel: 'chatterbox',
  segments: [],
} as unknown as Entry;

const persistWith = async (existing: Record<string, unknown> | null) => {
  const update = jest.fn<(args: { data: { translations: Record<string, Record<string, unknown>> } }) => Promise<{ commentId: null }>>()
    .mockResolvedValue({ commentId: null });
  const prisma = {
    postMedia: {
      findUnique: jest.fn<() => Promise<{ translations: unknown }>>().mockResolvedValue({ translations: existing }),
      update,
    },
    post: { findFirst: jest.fn<() => Promise<null>>().mockResolvedValue(null) },
  };
  const socialEvents = { broadcastPostUpdated: jest.fn() };
  const service = PostAudioService.init(prisma as never, socialEvents as never);
  await service.handleAudioTranslationsReady({ postId: 'post-1', postMediaId: 'pm-1', translations: { fr: FR_TEXT_ONLY } });
  return update.mock.calls[0][0].data.translations;
};

describe('PostAudioService — une traduction texte seule garde la piste précédente (#19734)', () => {
  it('garde path et url de la voix fr déjà inscrite et inscrit le nouveau texte', async () => {
    const saved = await persistWith({ fr: FR_TRACK });

    expect(saved.fr).toEqual(expect.objectContaining({ transcription: 'Bonjour à tous', path: FR_TRACK.path, url: FR_TRACK.url }));
  });

  it('n’efface pas les autres langues déjà inscrites', async () => {
    const saved = await persistWith({ fr: FR_TRACK, es: ES_TRACK });

    expect(saved.es).toEqual(ES_TRACK);
  });

  it('ne ressuscite pas la référence d’une piste effacée', async () => {
    const saved = await persistWith({ fr: { ...FR_TRACK, deletedAt: '2026-11-02T00:00:00.000Z' } });

    expect(saved.fr).not.toHaveProperty('path');
    expect(saved.fr).not.toHaveProperty('url');
    expect(saved.fr.transcription).toBe('Bonjour à tous');
  });

  it('inscrit la traduction quand le média n’a encore aucune traduction', async () => {
    const saved = await persistWith(null);

    expect(saved).toEqual({ fr: FR_TEXT_ONLY });
  });
});
