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

const inscribe = async (existing: Record<string, Entry>, incoming: Record<string, Entry>, updateFails = false) => {
  const removed: string[] = [];
  const row = { translations: existing as unknown };
  const update = async (args: { data: { translations: unknown } }) => {
    if (updateFails) throw new Error('down');
    row.translations = args.data.translations;
    return { commentId: null };
  };
  const prisma = {
    postMedia: { findUnique: async () => ({ translations: row.translations }), update },
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

  it('n’efface jamais une adresse de post qui remonte l’arborescence', async () => {
    const climbing = '/api/v1/attachments/file/translated/post/../../2026/11/u/voice.m4a';
    const removed = await inscribe({ en: entry(climbing) }, { en: entry(POST_TRACK('en', 'c')) });

    expect(removed).toEqual([]);
  });

  it('quand l’inscription en base échoue, efface la piste neuve et garde la précédente', async () => {
    const removed = await inscribe({ en: entry(POST_TRACK('en', 'a')) }, { en: entry(POST_TRACK('en', 'c')) }, true);

    expect(removed).toEqual([POST_TRACK('en', 'c')]);
  });
});
