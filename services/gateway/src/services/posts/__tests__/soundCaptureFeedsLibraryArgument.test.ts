/**
 * #6581 — le `feedsLibrary` que `PostService` REMET À `captureSounds`.
 *
 * ─── POURQUOI CE FICHIER EXISTE ───────────────────────────────────────────
 *
 * Le cliquet de visibilité (`routes/posts/__tests__/core.story-visibility-sound-library.test.ts`)
 * grave la chaîne « défaut de la route → `feedsSoundLibrary` → `SoundCaptureService` »
 * en la RECOMPOSANT à la main : il monte `POST /posts` sous
 * `jest.mock('../../../services/PostService')`, lit la visibilité résolue, puis
 * appelle lui-même `feedsSoundLibrary(...)` et `captureSounds(...)`. Les deux
 * bouts sont réels ; le MAILLON QUI LES JOINT est simulé.
 *
 * Conséquence mesurée : poser `feedsLibrary: true` EN DUR à `PostService.ts`
 * — la régression exacte que ce cliquet existe pour attraper, toute story même
 * PRIVATE alimentant alors la bibliothèque publique — le laisse 4/4 VERT.
 *
 * Ce fichier ferme cet espace. Il construit un VRAI `PostService`, lui injecte
 * un `SoundCaptureService` espion, et lit l'argument que les DEUX sites de
 * capture lui remettent réellement — `createPost` et `updatePost`, la troisième
 * porte du piège d'attribution, jusqu'ici jamais exercée.
 *
 * Il n'assert RIEN sur la règle elle-même (`feedsSoundLibrary` a sa propre
 * suite exhaustive) : il assert que ce site l'APPELLE, avec SES entrées, et
 * que le verdict ARRIVE au service de capture.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../PostService';
import { MediaService } from '../../MediaService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';

jest.mock('../../posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) },
    init: jest.fn(),
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const AUTHOR = 'user-atabeth';
const SOUND_ID = 'a1b2c3d4e5f60718293a4b5c';
const TRACK_ID = 'trk-rumba';

/** Le blob que le composer envoie pour une story qui emprunte un son. */
const STORY_EFFECTS = {
  audioPlayerObjects: [{ id: TRACK_ID, soundId: SOUND_ID, isBackground: true, duration: 6 }],
};

type CaptureCall = { feedsLibrary: boolean; postId: string; tracks: readonly unknown[] };

function makeCaptureSpy() {
  const calls: CaptureCall[] = [];
  return {
    calls,
    service: {
      captureSounds: jest.fn<any>(async (ctx: CaptureCall) => { calls.push(ctx); }),
      releasePost: jest.fn<any>().mockResolvedValue(undefined),
    },
  };
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-6581',
    authorId: AUTHOR,
    type: 'STORY',
    visibility: 'PUBLIC',
    visibilityUserIds: [],
    content: null,
    metadata: null,
    originalLanguage: null,
    detectedLanguage: null,
    repostOfId: null,
    storyEffects: STORY_EFFECTS,
    allowSoundExtraction: false,
    deletedAt: null,
    media: [],
    ...overrides,
  };
}

function makePrisma() {
  const prisma = {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(makePost()),
      findUnique: jest.fn<any>().mockResolvedValue(makePost()),
      create: jest.fn<any>().mockResolvedValue(makePost()),
      update: jest.fn<any>().mockResolvedValue(makePost()),
    },
    postMedia: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    postView: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    postReaction: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    postImpression: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn<any>(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
      : Promise.all(arg as ReadonlyArray<Promise<unknown>>),
  );
  return prisma;
}

/**
 * La capture est FIRE-AND-FORGET (`.catch(...)` sans `await`) : publier ne
 * dépend jamais de la bibliothèque. Un témoin doit donc laisser la
 * micro-tâche se dérouler avant de lire ce que le service a reçu.
 */
const laisserLaCaptureSeDerouler = () => new Promise((resolve) => setImmediate(resolve));

describe('PostService.createPost — le verdict de bibliothèque ARRIVE au service de capture (#6581)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let capture: ReturnType<typeof makeCaptureSpy>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    capture = makeCaptureSpy();
    service = new PostService(
      prisma as unknown as PrismaClient,
      new MediaService(),
      undefined,
      undefined,
      undefined,
      capture.service as never,
    );
  });

  it.each([
    [PostVisibility.PUBLIC, true],
    [PostVisibility.COMMUNITY, true],
    [PostVisibility.FRIENDS, false],
    [PostVisibility.PRIVATE, false],
  ])('une story %s remet feedsLibrary=%s — la visibilité de l’appel gouverne', async (visibility, attendu) => {
    prisma.post.create.mockResolvedValue(makePost({ visibility }));

    await service.createPost(
      { type: PostType.STORY, visibility, storyEffects: STORY_EFFECTS },
      AUTHOR,
    );
    await laisserLaCaptureSeDerouler();

    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0].feedsLibrary).toBe(attendu);
  });

  it('un REPOST public ne remet JAMAIS true — le piège d’attribution, première porte', async () => {
    prisma.post.create.mockResolvedValue(makePost({ repostOfId: 'post-source' }));

    await service.createPost(
      {
        type: PostType.STORY,
        visibility: PostVisibility.PUBLIC,
        storyEffects: STORY_EFFECTS,
        repostOfId: 'post-source',
      },
      AUTHOR,
    );
    await laisserLaCaptureSeDerouler();

    expect(capture.calls[0].feedsLibrary).toBe(false);
  });
});

describe('PostService.updatePost — la TROISIÈME porte remet le même verdict (#6581)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let capture: ReturnType<typeof makeCaptureSpy>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    capture = makeCaptureSpy();
    service = new PostService(
      prisma as unknown as PrismaClient,
      new MediaService(),
      undefined,
      undefined,
      undefined,
      capture.service as never,
    );
  });

  it.each([
    [PostVisibility.PUBLIC, true],
    [PostVisibility.FRIENDS, false],
  ])('une édition qui pose %s remet feedsLibrary=%s — lu sur la ligne ÉCRITE', async (visibility, attendu) => {
    prisma.post.update.mockResolvedValue(makePost({ visibility }));

    await service.updatePost('post-6581', AUTHOR, { visibility, storyEffects: STORY_EFFECTS });
    await laisserLaCaptureSeDerouler();

    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0].feedsLibrary).toBe(attendu);
  });

  it('éditer un REPOST public ne remet jamais true — troisième porte du piège d’attribution', async () => {
    prisma.post.findFirst.mockResolvedValue(makePost({ repostOfId: 'post-source' }));
    prisma.post.update.mockResolvedValue(makePost({ repostOfId: 'post-source', visibility: 'PUBLIC' }));

    await service.updatePost('post-6581', AUTHOR, {
      visibility: PostVisibility.PUBLIC,
      storyEffects: STORY_EFFECTS,
    });
    await laisserLaCaptureSeDerouler();

    expect(capture.calls[0].feedsLibrary).toBe(false);
  });
});
