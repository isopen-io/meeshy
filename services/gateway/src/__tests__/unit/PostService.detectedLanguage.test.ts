/**
 * @jest-environment node
 *
 * createPost — persistance de `detectedLanguage` (#5422).
 *
 * La mesure on-device (`detectMeasuredLanguage`, tinyld, #5349) n'était
 * jamais persistée sur `Post` — un choix assumé à l'époque (§ commentaire de
 * `routes/posts/core.ts` avant ce lot) : elle ne servait que la traduction
 * FIRE-AND-FORGET déclenchée à la publication. `PostTranslationService.
 * translateOnDemand`, lui, relit la ligne plus tard (traduction demandée
 * après coup depuis la feuille « Traductions ») et n'avait aucun moyen de
 * retrouver cette mesure : il retombait sur la détection regex maison,
 * strictement moins bonne qu'une mesure réelle déjà faite. Voir #5422.
 *
 * Prisma est entièrement mocké — même harnais que `PostService.
 * repostAudience.test.ts` (extrait, pour ne pas grossir un fichier déjà
 * hors budget, `PostService.test.ts`).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';

jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) },
    init: jest.fn(),
  },
}));

function createMockPrisma() {
  const prisma = {
    post: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    postMedia: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    postView: { deleteMany: jest.fn() },
    postReaction: { deleteMany: jest.fn() },
    postImpression: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
      : Promise.all(arg as ReadonlyArray<Promise<unknown>>),
  );
  return prisma;
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    authorId: 'user-1',
    type: 'POST',
    visibility: 'PUBLIC',
    visibilityUserIds: [],
    content: null,
    metadata: null,
    originalLanguage: null,
    detectedLanguage: null,
    deletedAt: null,
    media: [],
    ...overrides,
  };
}

describe('createPost — detectedLanguage persistence (#5422)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    prisma.postMedia.findMany.mockResolvedValue([]);
    prisma.post.create.mockResolvedValue(makePost());
    service = new PostService(prisma as unknown as PrismaClient, new MediaService());
  });

  const base = { type: PostType.POST, visibility: PostVisibility.PUBLIC };

  it('persists a measured detectedLanguage as-is', async () => {
    await service.createPost({ ...base, content: 'Ola tudo bem', detectedLanguage: 'pt' }, 'user-1');
    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ detectedLanguage: 'pt' }) }),
    );
  });

  it('canonicalizes a region-tagged measurement before persisting (pt-BR -> pt)', async () => {
    await service.createPost({ ...base, content: 'Ola tudo bem', detectedLanguage: 'pt-BR' }, 'user-1');
    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ detectedLanguage: 'pt' }) }),
    );
  });

  it('persists undefined when the composer measured nothing reliable', async () => {
    await service.createPost({ ...base, content: 'Hi' }, 'user-1');
    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ detectedLanguage: undefined }) }),
    );
  });

  it('never overrides a provided originalLanguage — it is a mere backup, not a claim', async () => {
    await service.createPost(
      { ...base, content: 'Bonjour', originalLanguage: 'fr', detectedLanguage: 'es' },
      'user-1',
    );
    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ originalLanguage: 'fr', detectedLanguage: 'es' }),
      }),
    );
  });
});
