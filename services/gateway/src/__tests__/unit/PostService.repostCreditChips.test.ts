/**
 * @jest-environment node
 *
 * #10524 — plus AUCUNE puce « Reposté de @auteur » (texte VERROUILLÉ du
 * canvas), quelle que soit l'audience de l'original : le crédit vit dans
 * l'en-tête, après la date (décision porteur 2026-10-13). Elle remplace la
 * règle d'audience de #10365, #10497 et #10498. Le retrait vaut à l'écriture
 * (`repostPost`, `POST /posts`, `updatePost`) comme à la lecture
 * (`withMentions`), en v1 (`textObjects`) comme en v3 (`scenes[].objects`).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import { PostType } from '@meeshy/shared/prisma/client';
import { createMockPrisma, makePost, createMockPostReactionService } from './post-service-mocks';
import { withoutRepostCredits } from '../../services/posts/repostCreditChips';
import { postSignalText } from '../../services/posts/storyContentComposition';
import { withMentions } from '../../services/posts/postReferences';
import { WIRE_BROADCAST } from '../../services/posts/storyEffectsV3';
import { StoryTextObjectTranslationService } from '../../services/posts/StoryTextObjectTranslationService';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) },
    init: jest.fn(),
  },
}));

const credit = { id: 'credit', text: 'Reposté de @ada', isLocked: true };
const authorText = { id: 'mine', text: 'Bonjour' };

const v1Effects = () => ({ textObjects: [authorText, credit], background: '#000000' });
const v1WithoutCredit = { textObjects: [authorText], background: '#000000' };

const v3Effects = () => ({
  v: 3,
  scenes: [
    {
      id: 'scene-1',
      objects: [
        { id: 'mine', kind: 'text', payload: { text: 'Bonjour' } },
        { id: 'credit', kind: 'text', payload: { text: 'Reposté de @ada', isLocked: true } },
        { id: 'photo', kind: 'media', payload: { postMediaId: 'm1', isLocked: true } },
      ],
    },
  ],
});
const v3WithoutCredit = {
  v: 3,
  scenes: [
    {
      id: 'scene-1',
      objects: [
        { id: 'mine', kind: 'text', payload: { text: 'Bonjour' } },
        { id: 'photo', kind: 'media', payload: { postMediaId: 'm1', isLocked: true } },
      ],
    },
  ],
};

const AUDIENCES = ['PUBLIC', 'FRIENDS', 'PRIVATE', null] as const;

describe('repostPost — la copie n’emporte jamais la puce de crédit', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new PostService(prisma, new MediaService(), undefined, createMockPostReactionService());
  });

  const repostStory = async (visibility: string | null | undefined, storyEffects: unknown) => {
    const original = makePost({
      id: 'story-src',
      authorId: 'user-reposter',
      type: PostType.STORY,
      visibility,
      media: [],
      storyEffects,
    });
    prisma.post.findFirst.mockResolvedValue(original);
    prisma.post.create.mockResolvedValue(makePost({ id: 'story-repost' }));
    prisma.post.update.mockResolvedValue(original);
    await service.repostPost('story-src', 'user-reposter', { targetType: PostType.STORY });
    const call = prisma.post.create.mock.calls[0]?.[0] as { data: { storyEffects?: unknown } } | undefined;
    return call?.data.storyEffects;
  };

  for (const visibility of AUDIENCES) {
    it(`retire la puce v1 d’un original ${visibility ?? 'sans audience'}, et rien d’autre`, async () => {
      expect(await repostStory(visibility, v1Effects())).toEqual(v1WithoutCredit);
    });
  }

  it('retire la puce v3 d’un original PUBLIC, jamais un objet non textuel', async () => {
    expect(await repostStory('PUBLIC', v3Effects())).toEqual(v3WithoutCredit);
  });
});

describe('withoutRepostCredits', () => {
  it('retire aussi un textObjects v1 resté à côté des scènes d’un document v3', () => {
    const mixed = { ...v3Effects(), textObjects: [authorText, credit] };
    expect(withoutRepostCredits(mixed)).toEqual({ ...v3WithoutCredit, textObjects: [authorText] });
  });

  it('rend le blob intact quand il ne porte aucune puce', () => {
    const effects = { textObjects: [authorText] };
    expect(withoutRepostCredits(effects)).toBe(effects);
    expect(withoutRepostCredits(undefined)).toBeUndefined();
  });
});

/**
 * #10497 — la seconde porte. `POST /posts` avec `repostOfId` (composer de
 * republication, « publier aussi en réel ») reçoit le canvas tel que le client
 * l'envoie : un client antérieur à #10524 y pose encore la puce.
 */
describe('createPost avec repostOfId — la puce envoyée par un ancien client est retirée', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new PostService(prisma, new MediaService(), undefined, createMockPostReactionService());
  });

  const publishRepost = async (params: {
    sourceVisibility: string | null;
    storyEffects: Record<string, unknown>;
    type?: PostType;
    visibility?: string;
  }) => {
    prisma.post.findFirst.mockResolvedValue(makePost({
      id: 'story-src', repostOfId: null, originalRepostOfId: null,
      visibility: params.sourceVisibility, visibilityUserIds: [],
    }));
    prisma.post.create.mockImplementation(async (args: { data: Record<string, unknown> }) => makePost({ id: 'story-repost', ...args.data }));
    await service.createPost({
      type: params.type ?? PostType.STORY,
      visibility: (params.visibility ?? 'PRIVATE') as never,
      repostOfId: 'story-src',
      storyEffects: params.storyEffects,
    }, '0a0a0a0a0a0a0a0a0a0a0a01');
    const call = prisma.post.create.mock.calls[0]?.[0] as { data: { storyEffects?: unknown } } | undefined;
    return call?.data.storyEffects;
  };

  it('retire la puce v1 d’une source PUBLIC, et rien d’autre', async () => {
    expect(await publishRepost({ sourceVisibility: 'PUBLIC', storyEffects: v1Effects(), visibility: 'PUBLIC' }))
      .toEqual(v1WithoutCredit);
  });

  it('retire la puce v3 d’une source PRIVATE, jamais un objet non textuel', async () => {
    expect(await publishRepost({ sourceVisibility: 'PRIVATE', storyEffects: v3Effects() })).toEqual(v3WithoutCredit);
  });

  it('retire aussi la puce du réel publié par la même porte', async () => {
    expect(await publishRepost({ sourceVisibility: 'PUBLIC', storyEffects: v1Effects(), type: PostType.REEL, visibility: 'PUBLIC' }))
      .toEqual(v1WithoutCredit);
  });
});

/**
 * #10522 — `updatePost` réécrivait `storyEffects` tel que le client l'envoie :
 * un ancien client qui renvoie son blob en cache réintroduisait la puce.
 */
describe('updatePost — une édition ne réintroduit pas la puce de crédit', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new PostService(prisma, new MediaService(), undefined, createMockPostReactionService());
  });

  const editedEffects = async (storyEffects: Record<string, unknown>) => {
    const existing = makePost({ id: 'story-repost', authorId: 'user-1', type: PostType.STORY, repostOfId: 'story-src', media: [] });
    prisma.post.findFirst.mockResolvedValue(existing);
    prisma.post.update.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ ...existing, ...args.data }));
    await service.updatePost('story-repost', 'user-1', { storyEffects });
    const call = prisma.post.update.mock.calls[0]?.[0] as { data: { storyEffects?: unknown } } | undefined;
    return call?.data.storyEffects;
  };

  it('retire la puce v1 du canvas édité, et rien d’autre', async () => {
    expect(await editedEffects(v1Effects())).toEqual(v1WithoutCredit);
  });

  it('retire la puce v3 du canvas édité, jamais un objet non textuel', async () => {
    expect(await editedEffects(v3Effects())).toEqual(v3WithoutCredit);
  });
});

describe('postSignalText — la puce de crédit n’est jamais le texte de l’auteur', () => {
  it('ignore un texte verrouillé v1 dans l’aperçu et les hashtags', () => {
    expect(postSignalText({ storyEffects: v1Effects() })).toBe('Bonjour');
  });

  it('ignore un texte verrouillé v3', () => {
    expect(postSignalText({ storyEffects: v3Effects() })).toBe('Bonjour');
  });

  it('n’a rien à porter quand la puce est le seul texte', () => {
    expect(postSignalText({ storyEffects: { textObjects: [credit] } })).toBeUndefined();
  });
});

/**
 * La règle s'applique aussi à la LECTURE : les lignes écrites avant #10524
 * portent encore la puce, dans leur canvas comme dans le canvas qu'elles
 * citent. Le retrait au service les couvre sans migration, quelle que soit
 * l'audience de la source, chargée ou non, et même quand la source a disparu.
 */
describe('withMentions — aucune puce de crédit n’est servie', () => {
  const served = (sourceVisibility: string | null, effects: () => Record<string, unknown> = v1Effects) => ({
    id: 'repost-1',
    postMentions: [] as unknown[],
    storyEffects: effects(),
    repostOf: { id: 'source-1', visibility: sourceVisibility, moderationHiddenAt: null, storyEffects: effects() },
  });

  const readers = [
    ['la réponse REST', { canvasCaps: 3 }],
    ['la diffusion socket', WIRE_BROADCAST],
  ] as const;

  for (const [path, reader] of readers) {
    it(`retire les puces d’une source PUBLIC dans ${path}`, () => {
      const post = withMentions(served('PUBLIC'), reader) as { storyEffects: unknown; repostOf: { storyEffects: unknown } };
      expect(post.storyEffects).toEqual(v1WithoutCredit);
      expect(post.repostOf.storyEffects).toEqual(v1WithoutCredit);
    });

    it(`retire les puces d’une source FRIENDS dans ${path}`, () => {
      const post = withMentions(served('FRIENDS'), reader) as { storyEffects: unknown; repostOf: { storyEffects: unknown } };
      expect(post.storyEffects).toEqual(v1WithoutCredit);
      expect(post.repostOf.storyEffects).toEqual(v1WithoutCredit);
    });
  }

  it('retire la puce v3, jamais un objet non textuel', () => {
    const post = withMentions(served('PUBLIC', v3Effects), WIRE_BROADCAST) as { storyEffects: unknown; repostOf: { storyEffects: unknown } };
    expect(post.storyEffects).toEqual(v3WithoutCredit);
    expect(post.repostOf.storyEffects).toEqual(v3WithoutCredit);
  });

  it('retire la puce propre d’une republication dont la source PRIVÉE ne voyage plus', () => {
    const post = withMentions(served('PRIVATE'), WIRE_BROADCAST) as { storyEffects: unknown; repostOf: unknown };
    expect(post.repostOf).toBeNull();
    expect(post.storyEffects).toEqual(v1WithoutCredit);
  });

  it('retire la puce d’une republication dont la source a disparu', () => {
    const post = withMentions({ ...served('PUBLIC'), repostOf: null }, WIRE_BROADCAST) as { storyEffects: unknown };
    expect(post.storyEffects).toEqual(v1WithoutCredit);
  });

  it('retire la puce même quand le select n’a pas chargé l’audience de la source', () => {
    const post = withMentions(
      { id: 'repost-1', postMentions: [] as unknown[], storyEffects: v1Effects(), repostOf: { id: 'source-1', storyEffects: v1Effects() } },
      WIRE_BROADCAST,
    ) as { storyEffects: unknown; repostOf: { storyEffects: unknown } };
    expect(post.storyEffects).toEqual(v1WithoutCredit);
    expect(post.repostOf.storyEffects).toEqual(v1WithoutCredit);
  });

  it('est idempotente sur une publication déjà projetée (rejeu d’idempotence)', () => {
    const once = withMentions(served('PUBLIC'), WIRE_BROADCAST);
    const twice = withMentions(once, WIRE_BROADCAST) as { storyEffects: unknown; repostOf: { storyEffects: unknown } };
    expect(twice.storyEffects).toEqual(v1WithoutCredit);
    expect(twice.repostOf.storyEffects).toEqual(v1WithoutCredit);
  });
});

/**
 * #10498, revue adversariale — le retrait à la lecture décale l'index PLAT des
 * textes servis. `story:translation-updated` porte cet index, et les clients
 * fusionnent par position dans le canvas SERVI : la traduction de la puce
 * retirée s'y posait sur le texte de l'auteur. La correction reste, la puce
 * n'étant plus jamais servie.
 */
describe('story:translation-updated — l’index diffusé est celui du canvas SERVI', () => {
  type Emitted = { textObjectIndex: number };

  const broadcastFor = async (params: {
    storyEffects: Record<string, unknown>;
    textObjectIndex: number;
  }): Promise<Emitted[]> => {
    const emitted: Emitted[] = [];
    const post = {
      authorId: 'author-1',
      visibility: 'PRIVATE',
      visibilityUserIds: [] as string[],
      content: null,
      storyEffects: params.storyEffects,
    };
    const prisma = {
      post: { findUnique: async (_args: unknown) => post },
      friendRequest: { findMany: async (_args: unknown) => [] as unknown[] },
      $runCommandRaw: async (_cmd: unknown) => ({ ok: 1 }),
    };
    const io = {
      to: (_room: string) => ({
        emit: (event: string, payload: unknown) => {
          if (event === SERVER_EVENTS.STORY_TRANSLATION_UPDATED) emitted.push(payload as Emitted);
        },
      }),
    };
    // @ts-expect-error remise à zéro du singleton privé
    StoryTextObjectTranslationService._shared = null;
    const service = StoryTextObjectTranslationService.init(
      prisma as unknown as Parameters<typeof StoryTextObjectTranslationService.init>[0],
      io as unknown as Parameters<typeof StoryTextObjectTranslationService.init>[1],
    );
    await service.handleTranslationCompleted({
      postId: '507f1f77bcf86cd799439011',
      textObjectIndex: params.textObjectIndex,
      translations: { en: 'Hello' },
    });
    return emitted;
  };

  const creditFirst = () => ({ textObjects: [credit, authorText] });
  const creditFirstV3 = () => ({
    v: 3,
    scenes: [{
      id: 'scene-1',
      objects: [
        { id: 'credit', kind: 'text', payload: { text: 'Reposté de @ada', isLocked: true } },
        { id: 'mine', kind: 'text', payload: { text: 'Bonjour' } },
      ],
    }],
  });

  it('décale l’index d’un texte posé après une puce retirée', async () => {
    const emitted = await broadcastFor({ storyEffects: creditFirst(), textObjectIndex: 1 });
    expect(emitted.map((e) => e.textObjectIndex)).toEqual([0]);
  });

  it('décale aussi l’index plat d’un document v3', async () => {
    const emitted = await broadcastFor({ storyEffects: creditFirstV3(), textObjectIndex: 1 });
    expect(emitted.map((e) => e.textObjectIndex)).toEqual([0]);
  });

  it('ne diffuse pas la traduction d’une puce retirée', async () => {
    expect(await broadcastFor({ storyEffects: creditFirst(), textObjectIndex: 0 })).toEqual([]);
  });

  it('garde l’index d’un canvas sans puce', async () => {
    const emitted = await broadcastFor({ storyEffects: { textObjects: [authorText, { id: 'b', text: 'Salut' }] }, textObjectIndex: 1 });
    expect(emitted.map((e) => e.textObjectIndex)).toEqual([1]);
  });
});
