/**
 * @jest-environment node
 *
 * `POST /posts` (et son édition) rendaient 201/200 que le contenu alimente la
 * bibliothèque de sons ou non — le client n'avait aucun moyen de distinguer
 * « son capturé » de « son silencieusement écarté » (#6603). Ce fichier
 * prouve que le verdict SYNCHRONE (`soundCaptureVerdict`) atteint bien
 * l'objet rendu par `createPost`/`updatePost`, et qu'il DIFFÈRE exactement
 * comme la recette de production l'a mesuré : même son emprunté, seule la
 * visibilité change.
 *
 * Prisma est entièrement mocké — même harnais que `PostService.
 * detectedLanguage.test.ts` / `PostService.mediaByteReclamation.test.ts`.
 * `SOUND_LIBRARY_ENABLED` n'est PAS positionné : `captureSounds` retourne au
 * tout premier `if` sans toucher Prisma, ce que ce fichier n'a pas besoin de
 * mocker pour vérifier le verdict — son comportement sous le flag actif est
 * couvert par `soundCaptureVerdict.test.ts`.
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

const BORROWED_TRACK = { id: 'trk-1', soundId: 'sound-1' };

function createMockPrisma() {
  const prisma = {
    post: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    postMedia: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    sound: { findMany: jest.fn().mockResolvedValue([]) },
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

function makeCreatedPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    authorId: 'user-1',
    type: 'STORY',
    visibility: 'PUBLIC',
    repostOfId: null,
    content: null,
    metadata: null,
    originalLanguage: null,
    detectedLanguage: null,
    deletedAt: null,
    media: [],
    ...overrides,
  };
}

describe('#6603 — POST /posts sound library verdict (createPost)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    prisma.postMedia.findMany.mockResolvedValue([]);
    service = new PostService(prisma as unknown as PrismaClient, new MediaService());
  });

  const base = {
    type: PostType.STORY,
    storyEffects: { audioPlayerObjects: [BORROWED_TRACK] },
  };

  it('test_publicStory_borrowingASound_isMarkedEligible', async () => {
    prisma.post.create.mockResolvedValue(makeCreatedPost({ visibility: 'PUBLIC' }));
    prisma.post.findUnique.mockResolvedValue(makeCreatedPost({ visibility: 'PUBLIC' }));

    const result = await service.createPost({ ...base, visibility: PostVisibility.PUBLIC }, 'user-1');

    expect((result as { soundLibrary?: unknown }).soundLibrary).toEqual({
      eligible: true,
      tracks: [{ trackId: 'trk-1', submitted: false }], // flag désactivé en test
    });
  });

  it('test_friendsStory_absentVisibilityResolvedToFriends_isMarkedIneligible', async () => {
    prisma.post.create.mockResolvedValue(makeCreatedPost({ visibility: 'FRIENDS' }));
    prisma.post.findUnique.mockResolvedValue(makeCreatedPost({ visibility: 'FRIENDS' }));

    const result = await service.createPost({ ...base, visibility: PostVisibility.FRIENDS }, 'user-1');

    expect((result as { soundLibrary?: unknown }).soundLibrary).toEqual({
      eligible: false,
      tracks: [{ trackId: 'trk-1', submitted: false }],
    });
  });

  it('test_theTwoResponses_DIFFER_onEligibilityAlone', async () => {
    // Mesure exacte de la recette #6581/#6603 : même son emprunté, seule la
    // visibilité change — les deux réponses doivent différer.
    prisma.post.create.mockResolvedValueOnce(makeCreatedPost({ visibility: 'PUBLIC' }));
    prisma.post.findUnique.mockResolvedValueOnce(makeCreatedPost({ visibility: 'PUBLIC' }));
    const publicResult = await service.createPost({ ...base, visibility: PostVisibility.PUBLIC }, 'user-1');

    prisma.post.create.mockResolvedValueOnce(makeCreatedPost({ visibility: 'FRIENDS' }));
    prisma.post.findUnique.mockResolvedValueOnce(makeCreatedPost({ visibility: 'FRIENDS' }));
    const friendsResult = await service.createPost({ ...base, visibility: PostVisibility.FRIENDS }, 'user-1');

    expect((publicResult as { soundLibrary?: { eligible: boolean } }).soundLibrary?.eligible)
      .not.toEqual((friendsResult as { soundLibrary?: { eligible: boolean } }).soundLibrary?.eligible);
  });

  it('test_repost_neverEligible_regardlessOfVisibility', async () => {
    prisma.post.findFirst.mockResolvedValue({
      id: 'source-1', repostOfId: null, originalRepostOfId: null,
      visibility: 'PUBLIC', visibilityUserIds: [],
    });
    prisma.post.create.mockResolvedValue(makeCreatedPost({ visibility: 'PUBLIC', repostOfId: 'source-1' }));
    prisma.post.findUnique.mockResolvedValue(makeCreatedPost({ visibility: 'PUBLIC', repostOfId: 'source-1' }));

    const result = await service.createPost(
      { ...base, visibility: PostVisibility.PUBLIC, repostOfId: 'source-1' },
      'user-1',
    );

    expect((result as { soundLibrary?: { eligible: boolean } }).soundLibrary?.eligible).toBe(false);
  });
});

describe('#6603 — PUT /posts/:id sound library verdict (updatePost)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new PostService(prisma as unknown as PrismaClient, new MediaService());
  });

  function makeExistingPost(overrides: Record<string, unknown> = {}) {
    return {
      id: 'post-1',
      authorId: 'user-1',
      type: 'STORY',
      visibility: 'PUBLIC',
      repostOfId: null,
      content: null,
      metadata: null,
      originalLanguage: 'fr',
      storyEffects: null,
      allowSoundExtraction: false,
      media: [],
      ...overrides,
    };
  }

  // Prisma `update` ignore un champ `undefined` (« ne pas toucher »), plutôt
  // que d'écraser la colonne — `updateData.visibility = data.visibility`
  // (PostService.ts) vaut `undefined` dès que l'appelant ne change pas la
  // visibilité. Un mock qui ferait un spread naïf de `args.data` écraserait
  // `visibility` à `undefined` et fausserait `feedsSoundLibrary` en aval.
  function applyPrismaLikeUpdate(
    existing: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    return { ...existing, ...defined };
  }

  it('test_editingStoryEffects_reportsTheVerdict', async () => {
    prisma.post.findFirst.mockResolvedValue(makeExistingPost());
    prisma.post.update.mockImplementation(async (args: { data: Record<string, unknown> }) =>
      applyPrismaLikeUpdate(makeExistingPost(), args.data));

    const result = await service.updatePost('post-1', 'user-1', {
      storyEffects: { audioPlayerObjects: [BORROWED_TRACK] },
    });

    expect((result as { soundLibrary?: unknown }).soundLibrary).toEqual({
      eligible: true,
      tracks: [{ trackId: 'trk-1', submitted: false }],
    });
  });

  it('test_editingUnrelatedField_omitsTheVerdict', async () => {
    prisma.post.findFirst.mockResolvedValue(makeExistingPost());
    prisma.post.update.mockImplementation(async (args: { data: Record<string, unknown> }) =>
      applyPrismaLikeUpdate(makeExistingPost(), args.data));

    const result = await service.updatePost('post-1', 'user-1', { content: 'nouveau texte' });

    expect((result as { soundLibrary?: unknown }).soundLibrary).toBeUndefined();
  });
});
