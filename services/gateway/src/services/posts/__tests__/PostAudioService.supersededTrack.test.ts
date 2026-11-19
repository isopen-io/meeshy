/**
 * #19841 — une piste de post prend une clé neuve à chaque écriture : la piste
 * de la même langue qu'elle remplace s'efface une fois la nouvelle inscrite,
 * et rien d'autre.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../ZmqSingleton', () => ({ ZMQSingleton: { getInstanceSync: jest.fn(() => null) } }));

import { PostAudioService } from '../PostAudioService';

type Entry = Parameters<PostAudioService['handleAudioTranslationsReady']>[0]['translations'][string];

const POST_TRACK = (language: string, token: string) =>
  `/api/v1/attachments/file/translated/post/6650a1b2c3d4e5f6a7b8c9d1_${language}_${token.repeat(32)}.mp3`;

const entry = (url?: string): Entry => ({
  type: 'audio',
  transcription: 'texte',
  ...(url ? { path: `/app/uploads/${url}`, url } : {}),
  durationMs: 1000,
  format: 'audio/mp3',
  cloned: false,
  quality: 0.9,
  ttsModel: 'chatterbox',
});

const inscribe = async (existing: Record<string, Entry>, incoming: Record<string, Entry>, update = jest.fn<() => Promise<{ commentId: null }>>().mockResolvedValue({ commentId: null })) => {
  const removed: string[] = [];
  const prisma = {
    postMedia: { findUnique: jest.fn<() => Promise<{ translations: unknown }>>().mockResolvedValue({ translations: existing }), update },
    post: { findFirst: jest.fn<() => Promise<null>>().mockResolvedValue(null) },
  };
  const remover = { delete: async (url: string) => { removed.push(url); } };
  const service = PostAudioService.init(prisma as never, { broadcastPostUpdated: jest.fn() } as never, remover);
  await service.handleAudioTranslationsReady({ postId: 'post-1', postMediaId: 'pm-1', translations: incoming });
  return removed;
};

describe('PostAudioService — la piste remplacée s’efface (#19841)', () => {
  it('efface la piste précédente de la langue réécrite, pas celle des autres langues', async () => {
    const removed = await inscribe({ en: entry(POST_TRACK('en', 'a')), es: entry(POST_TRACK('es', 'b')) }, { en: entry(POST_TRACK('en', 'c')) });

    expect(removed).toEqual([POST_TRACK('en', 'a')]);
  });

  it('n’efface rien quand la nouvelle piste n’a pas pu s’écrire : l’entrée garde la référence précédente', async () => {
    const removed = await inscribe({ en: entry(POST_TRACK('en', 'a')) }, { en: entry() });

    expect(removed).toEqual([]);
  });

  it('n’efface jamais un fichier hors de translated/post/', async () => {
    const removed = await inscribe(
      { en: entry('/api/v1/attachments/file/translated/pm-1_en.mp3'), fr: entry('/api/v1/attachments/file/2026/11/u/voice.m4a') },
      { en: entry(POST_TRACK('en', 'c')), fr: entry(POST_TRACK('fr', 'd')) },
    );

    expect(removed).toEqual([]);
  });

  it('n’efface rien quand l’inscription en base échoue', async () => {
    const removed = await inscribe({ en: entry(POST_TRACK('en', 'a')) }, { en: entry(POST_TRACK('en', 'c')) }, jest.fn<() => Promise<{ commentId: null }>>().mockRejectedValue(new Error('down')));

    expect(removed).toEqual([]);
  });
});
