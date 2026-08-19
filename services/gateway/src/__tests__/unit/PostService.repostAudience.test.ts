/**
 * @jest-environment node
 *
 * Loi d'audience de la republication sur le chemin de CRÉATION.
 *
 * `POST /posts` accepte `repostOfId` — le commentaire du schéma le dit
 * explicitement : « for StoryComposer publishing a repost via POST /posts ».
 * Ce chemin ne validait AUCUNE audience : il chargeait la source en ne
 * sélectionnant que `id`, `repostOfId`, `originalRepostOfId`. Un client pouvait
 * donc publier `{ repostOfId: <story PRIVATE>, visibility: 'PUBLIC' }` et
 * contourner intégralement la barrière de `repostPost`.
 *
 * La faille précède le lot « republication de story » (2026-08-19) : le chemin
 * n'avait simplement aucun appelant côté app. Brancher le composeur de repost
 * le rend vivant, donc la loi doit s'y appliquer aussi — la sécurité ne peut
 * pas dépendre de l'endpoint choisi par le client.
 *
 * La loi elle-même vit dans `@meeshy/shared/utils/repost-audience` et porte
 * ses propres témoins (dont la démonstration que les six audiences ne forment
 * pas un ordre total).
 *
 * Prisma est entièrement mocké — même harnais que `PostService.test.ts`.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostVisibility } from '@meeshy/shared/prisma/client';

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

function makeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 'source-1',
    authorId: 'user-1',
    type: 'STORY',
    visibility: 'PUBLIC',
    visibilityUserIds: [],
    content: null,
    metadata: null,
    repostOfId: null,
    originalRepostOfId: null,
    originalLanguage: 'fr',
    deletedAt: null,
    media: [],
    ...overrides,
  };
}

describe('createPost — loi d\'audience de la republication', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    prisma.postMedia.findMany.mockResolvedValue([]);
    prisma.post.create.mockResolvedValue(makeSource({ id: 'repost-1' }));
    service = new PostService(prisma as unknown as PrismaClient, new MediaService());
  });

  it('refuses publishing a PRIVATE source as PUBLIC — la faille que ce lot ferme', async () => {
    prisma.post.findFirst.mockResolvedValue(makeSource({ visibility: 'PRIVATE' }));

    const err: any = await service
      .createPost(
        { visibility: PostVisibility.PUBLIC, repostOfId: 'source-1', content: 'hop' },
        'user-2',
      )
      .catch((e) => e);

    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('REPOST_AUDIENCE_WIDENING');
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('refuses a lateral move between incomparable audiences — FRIENDS source published COMMUNITY', async () => {
    prisma.post.findFirst.mockResolvedValue(makeSource({ visibility: 'FRIENDS' }));

    const err: any = await service
      .createPost(
        { visibility: PostVisibility.COMMUNITY, repostOfId: 'source-1', content: 'hop' },
        'user-2',
      )
      .catch((e) => e);

    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('REPOST_AUDIENCE_WIDENING');
  });

  it('accepts republishing a FRIENDS source as FRIENDS — le cas nominal', async () => {
    prisma.post.findFirst.mockResolvedValue(makeSource({ visibility: 'FRIENDS' }));

    await service.createPost(
      { visibility: PostVisibility.FRIENDS, repostOfId: 'source-1', content: 'hop' },
      'user-2',
    );

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: 'FRIENDS', repostOfId: 'source-1' }),
      }),
    );
  });

  it('accepts a narrowing — FRIENDS source published PRIVATE', async () => {
    prisma.post.findFirst.mockResolvedValue(makeSource({ visibility: 'FRIENDS' }));

    await service.createPost(
      { visibility: PostVisibility.PRIVATE, repostOfId: 'source-1', content: 'hop' },
      'user-2',
    );

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ visibility: 'PRIVATE' }) }),
    );
  });

  it('leaves a PUBLIC source free to publish at any audience', async () => {
    prisma.post.findFirst.mockResolvedValue(makeSource({ visibility: 'PUBLIC' }));

    await service.createPost(
      { visibility: PostVisibility.FRIENDS, repostOfId: 'source-1', content: 'hop' },
      'user-2',
    );

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ visibility: 'FRIENDS' }) }),
    );
  });

  it('leaves an ordinary creation (no repostOfId) untouched by the law', async () => {
    await service.createPost(
      { visibility: PostVisibility.PUBLIC, content: 'un post normal' },
      'user-2',
    );

    // Aucune lecture de source : la loi ne s'invite pas sur le chemin nominal.
    expect(prisma.post.findFirst).not.toHaveBeenCalled();
    expect(prisma.post.create).toHaveBeenCalled();
  });
});
