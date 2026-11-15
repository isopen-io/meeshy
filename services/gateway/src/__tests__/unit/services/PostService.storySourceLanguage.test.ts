/**
 * La langue d'origine d'une story (#9861).
 *
 * Constaté sur staging le 2026-10-10 : « Story recette B 9743 r2 », publiée
 * avec `originalLanguage: 'fr'`, portait une traduction `fr` (« Récipit de
 * l'histoire B 9743 r2 ») et aucune `en`. Le pipeline audience de la story
 * ignorait la langue persistée et redétectait le texte : aucun mot connu,
 * donc `'en'` par défaut — le français devenait une cible.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PostService } from '../../../services/PostService';
import { MediaService } from '../../../services/MediaService';
import { ZMQSingleton } from '../../../services/ZmqSingleton';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) },
    init: jest.fn(),
  },
}));

const POST_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439099';
const CONTENT = 'Story recette B 9743 r2';

type Listener = (event: unknown) => Promise<void>;

function createMockPrisma(params: { authorSystemLanguage: string | null; audience: string[] }) {
  const prisma = {
    post: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async (arg: unknown) => ({
        id: POST_ID,
        authorId: USER_ID,
        type: 'STORY',
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        content: CONTENT,
        metadata: null,
        originalLanguage: (arg as { data: { originalLanguage?: string } }).data.originalLanguage ?? null,
        detectedLanguage: null,
        deletedAt: null,
        media: [],
      })),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        systemLanguage: params.authorSystemLanguage,
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null,
      }),
    },
    participant: {
      findMany: jest.fn().mockResolvedValue(params.audience.map((l) => ({ user: { systemLanguage: l } }))),
    },
    postMedia: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $runCommandRaw: jest.fn().mockResolvedValue({ n: 1, nModified: 1, ok: 1 }),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
      : Promise.all(arg as ReadonlyArray<Promise<unknown>>),
  );
  return prisma;
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('PostService — langue d\'origine d\'une story (#9861)', () => {
  let translateSpy: jest.Mock;
  let listeners: Map<string, Listener>;

  beforeEach(() => {
    jest.useFakeTimers();
    translateSpy = jest.fn();
    listeners = new Map();
    jest.spyOn(ZMQSingleton, 'getInstanceSync').mockReturnValue({
      translateToMultipleLanguages: translateSpy,
      translateTextObject: jest.fn(),
      on: jest.fn((event: string, fn: Listener) => listeners.set(event, fn)),
      off: jest.fn(),
    } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const publish = async (
    prisma: ReturnType<typeof createMockPrisma>,
    extra: { originalLanguage?: string; detectedLanguage?: string } = {},
  ) => {
    const service = new PostService(prisma as unknown as PrismaClient, new MediaService());
    await service.createPost(
      { type: PostType.STORY, visibility: PostVisibility.PUBLIC, content: CONTENT, ...extra },
      USER_ID,
    );
    await flush();
  };

  it('traduit depuis la langue déclarée, jamais vers elle', async () => {
    const prisma = createMockPrisma({ authorSystemLanguage: 'fr', audience: ['fr', 'es', 'de', 'ar'] });
    await publish(prisma, { originalLanguage: 'fr' });

    expect(translateSpy).toHaveBeenCalledWith(
      CONTENT,
      'fr',
      ['es', 'de', 'ar'],
      `story:${POST_ID}`,
      `story_context:${POST_ID}`,
    );
  });

  it('sans langue déclarée ni indice dans le texte, retombe sur la langue de l\'auteur', async () => {
    const prisma = createMockPrisma({ authorSystemLanguage: 'fr', audience: ['fr', 'es'] });
    await publish(prisma);

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'fr' }) }),
    );
    expect(translateSpy).toHaveBeenCalledWith(CONTENT, 'fr', ['es'], `story:${POST_ID}`, `story_context:${POST_ID}`);
  });

  it('une mesure du client passe avant la langue de l\'auteur', async () => {
    const prisma = createMockPrisma({ authorSystemLanguage: 'fr', audience: ['fr', 'es'] });
    await publish(prisma, { detectedLanguage: 'es' });

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'es' }) }),
    );
  });

  it('n\'écrit une traduction de story que si la langue d\'origine diffère de la cible', async () => {
    const prisma = createMockPrisma({ authorSystemLanguage: 'fr', audience: ['fr', 'es'] });
    await publish(prisma, { originalLanguage: 'fr' });

    const listener = listeners.get(`translationCompleted:story:${POST_ID}`);
    expect(listener).toBeDefined();
    await listener!({
      taskId: 't',
      targetLanguage: 'es',
      metadata: {},
      result: { messageId: `story:${POST_ID}`, translatedText: 'Historia', confidenceScore: 0.9 },
    });

    const cmd = prisma.$runCommandRaw.mock.calls[0] as [{ updates: Array<{ q: object }> }];
    expect(cmd[0].updates[0].q).toEqual({ _id: { $oid: POST_ID }, originalLanguage: { $ne: 'es' } });
  });
});
