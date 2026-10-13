/**
 * @jest-environment node
 *
 * #10365 — la puce « Reposté de @auteur » (texte VERROUILLÉ du canvas) ne
 * survit à une republication DIRECTE que si l'original était PUBLIC, en v1
 * (`textObjects`) comme en v3 (`scenes[].objects`), et l'ignorance de
 * l'audience ne se lit jamais comme une permission de nommer.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import { PostType } from '@meeshy/shared/prisma/client';
import { createMockPrisma, makePost, createMockPostReactionService } from './post-service-mocks';
import { repostCreditIsDue, repostSnapshotStoryEffects } from '../../services/posts/repostCreditChips';
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

describe('repostPost — la puce de crédit suit l’audience de l’original', () => {
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

  it('garde la puce v1 d’un original PUBLIC', async () => {
    expect(await repostStory('PUBLIC', v1Effects())).toEqual(v1Effects());
  });

  it('garde la puce v3 d’un original PUBLIC', async () => {
    expect(await repostStory('PUBLIC', v3Effects())).toEqual(v3Effects());
  });

  it('retire la puce v1 d’un original FRIENDS, et rien d’autre', async () => {
    expect(await repostStory('FRIENDS', v1Effects())).toEqual(v1WithoutCredit);
  });

  it('retire la puce v3 d’un original PRIVATE, jamais un objet non textuel', async () => {
    expect(await repostStory('PRIVATE', v3Effects())).toEqual(v3WithoutCredit);
  });

  it('retire la puce quand l’audience de l’original est absente (fail-closed)', async () => {
    expect(await repostStory(null, v1Effects())).toEqual(v1WithoutCredit);
  });
});

describe('repostCreditIsDue', () => {
  it('n’accorde la puce qu’à un original PUBLIC', () => {
    expect(repostCreditIsDue('PUBLIC')).toBe(true);
    for (const visibility of ['FRIENDS', 'PRIVATE', 'COMMUNITY', 'EXCEPT', 'ONLY', 'public', '', null, undefined]) {
      expect(repostCreditIsDue(visibility)).toBe(false);
    }
  });
});

describe('repostSnapshotStoryEffects', () => {
  it('retire aussi un textObjects v1 resté à côté des scènes d’un document v3', () => {
    const mixed = { ...v3Effects(), textObjects: [authorText, credit] };
    expect(repostSnapshotStoryEffects(mixed, 'FRIENDS')).toEqual({ ...v3WithoutCredit, textObjects: [authorText] });
  });

  it('rend le blob intact quand il ne porte aucune puce', () => {
    const effects = { textObjects: [authorText] };
    expect(repostSnapshotStoryEffects(effects, 'FRIENDS')).toBe(effects);
    expect(repostSnapshotStoryEffects(undefined, 'FRIENDS')).toBeUndefined();
  });
});

/**
 * #10497 — la seconde porte. `POST /posts` avec `repostOfId` (composer de
 * republication, « publier aussi en réel ») recevait le canvas tel que le
 * client l'envoie : un client antérieur à la règle y posait la puce sans
 * condition. Le serveur l'applique lui-même, sur la SOURCE désignée.
 */
describe('createPost avec repostOfId — la puce de crédit suit l’audience de la source', () => {
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

  it('garde la puce d’une source PUBLIC', async () => {
    expect(await publishRepost({ sourceVisibility: 'PUBLIC', storyEffects: v1Effects() })).toEqual(v1Effects());
  });

  it('retire la puce v1 d’une source FRIENDS, et rien d’autre', async () => {
    expect(await publishRepost({ sourceVisibility: 'FRIENDS', storyEffects: v1Effects(), visibility: 'FRIENDS' }))
      .toEqual(v1WithoutCredit);
  });

  it('retire la puce v3 d’une source PRIVATE, jamais un objet non textuel', async () => {
    expect(await publishRepost({ sourceVisibility: 'PRIVATE', storyEffects: v3Effects() })).toEqual(v3WithoutCredit);
  });

  it('retire la puce quand l’audience de la source est absente (fail-closed)', async () => {
    expect(await publishRepost({ sourceVisibility: null, storyEffects: v1Effects() })).toEqual(v1WithoutCredit);
  });

  it('retire aussi la puce du réel publié par la même porte', async () => {
    expect(await publishRepost({ sourceVisibility: 'FRIENDS', storyEffects: v1Effects(), type: PostType.REEL, visibility: 'FRIENDS' }))
      .toEqual(v1WithoutCredit);
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
 * #10498 — la règle s'applique aussi à la LECTURE. `postInclude` sert
 * `repostOf.storyEffects` : le canvas de la republication intermédiaire, puce
 * comprise, partait dans la réponse REST, la diffusion socket et le fil. Et
 * une source PUBLIC repassée ensuite en audience restreinte laissait la puce
 * déjà copiée chez qui l'avait republiée.
 */
describe('withMentions — la puce de crédit servie suit l’audience ACTUELLE de la source', () => {
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
    it(`garde les puces d’une source PUBLIC dans ${path}`, () => {
      const post = withMentions(served('PUBLIC'), reader) as { storyEffects: unknown; repostOf: { storyEffects: unknown } };
      expect(post.storyEffects).toEqual(v1Effects());
      expect(post.repostOf.storyEffects).toEqual(v1Effects());
    });

    it(`retire la puce du canvas cité d’une source FRIENDS dans ${path}`, () => {
      const post = withMentions(served('FRIENDS'), reader) as { repostOf: { storyEffects: unknown } };
      expect(post.repostOf.storyEffects).toEqual(v1WithoutCredit);
    });

    it(`retire la puce déjà copiée quand la source est repassée en audience restreinte dans ${path}`, () => {
      const post = withMentions(served('FRIENDS'), reader) as { storyEffects: unknown };
      expect(post.storyEffects).toEqual(v1WithoutCredit);
    });
  }

  it('retire la puce v3 d’une source COMMUNITY, jamais un objet non textuel', () => {
    const post = withMentions(served('COMMUNITY', v3Effects), WIRE_BROADCAST) as { storyEffects: unknown; repostOf: { storyEffects: unknown } };
    expect(post.storyEffects).toEqual(v3WithoutCredit);
    expect(post.repostOf.storyEffects).toEqual(v3WithoutCredit);
  });

  it('retire la puce quand l’audience chargée de la source est absente (fail-closed)', () => {
    const post = withMentions(served(null), WIRE_BROADCAST) as { storyEffects: unknown; repostOf: { storyEffects: unknown } };
    expect(post.storyEffects).toEqual(v1WithoutCredit);
    expect(post.repostOf.storyEffects).toEqual(v1WithoutCredit);
  });

  it('retire la puce propre d’une republication dont la source PRIVÉE ne voyage plus', () => {
    const post = withMentions(served('PRIVATE'), WIRE_BROADCAST) as { storyEffects: unknown; repostOf: unknown };
    expect(post.repostOf).toBeNull();
    expect(post.storyEffects).toEqual(v1WithoutCredit);
  });

  it('ne touche pas une publication qui n’est pas une republication', () => {
    const post = withMentions({ id: 'p', postMentions: [] as unknown[], storyEffects: v1Effects() }, WIRE_BROADCAST) as { storyEffects: unknown };
    expect(post.storyEffects).toEqual(v1Effects());
  });

  it('garde la puce d’une source disparue — la règle a été appliquée à l’écriture', () => {
    const post = withMentions({ ...served('PUBLIC'), repostOf: null }, WIRE_BROADCAST) as { storyEffects: unknown };
    expect(post.storyEffects).toEqual(v1Effects());
  });

  it('est idempotente sur une publication déjà projetée (rejeu d’idempotence)', () => {
    const once = withMentions(served('PUBLIC'), WIRE_BROADCAST);
    const twice = withMentions(once, WIRE_BROADCAST) as { storyEffects: unknown; repostOf: { storyEffects: unknown } };
    expect(twice.storyEffects).toEqual(v1Effects());
    expect(twice.repostOf.storyEffects).toEqual(v1Effects());
  });
});

/**
 * #10498, revue adversariale — le retrait à la lecture décale l'index PLAT des
 * textes servis. `story:translation-updated` porte cet index, et les clients
 * fusionnent par position dans le canvas SERVI : la traduction de la puce
 * retirée s'y posait sur le texte de l'auteur.
 */
describe('story:translation-updated — l’index diffusé est celui du canvas SERVI', () => {
  type Emitted = { textObjectIndex: number };

  const broadcastFor = async (params: {
    sourceVisibility: string | null;
    storyEffects: Record<string, unknown>;
    textObjectIndex: number;
    isRepost?: boolean;
  }): Promise<Emitted[]> => {
    const emitted: Emitted[] = [];
    const post = {
      authorId: 'author-1',
      visibility: 'PRIVATE',
      visibilityUserIds: [] as string[],
      content: null,
      storyEffects: params.storyEffects,
      repostOf: params.isRepost === false ? null : { visibility: params.sourceVisibility },
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

  it('décale l’index d’un texte posé après une puce retirée (source FRIENDS)', async () => {
    const emitted = await broadcastFor({ sourceVisibility: 'FRIENDS', storyEffects: creditFirst(), textObjectIndex: 1 });
    expect(emitted.map((e) => e.textObjectIndex)).toEqual([0]);
  });

  it('décale aussi l’index plat d’un document v3', async () => {
    const emitted = await broadcastFor({ sourceVisibility: 'PRIVATE', storyEffects: creditFirstV3(), textObjectIndex: 1 });
    expect(emitted.map((e) => e.textObjectIndex)).toEqual([0]);
  });

  it('ne diffuse pas la traduction d’une puce retirée', async () => {
    expect(await broadcastFor({ sourceVisibility: 'FRIENDS', storyEffects: creditFirst(), textObjectIndex: 0 })).toEqual([]);
  });

  it('ne diffuse pas non plus quand l’audience de la source est absente (fail-closed)', async () => {
    expect(await broadcastFor({ sourceVisibility: null, storyEffects: creditFirst(), textObjectIndex: 0 })).toEqual([]);
  });

  it('garde l’index enregistré quand la puce est servie (source PUBLIC)', async () => {
    const emitted = await broadcastFor({ sourceVisibility: 'PUBLIC', storyEffects: creditFirst(), textObjectIndex: 1 });
    expect(emitted.map((e) => e.textObjectIndex)).toEqual([1]);
  });

  it('garde l’index d’une publication qui n’est pas une republication', async () => {
    const emitted = await broadcastFor({ sourceVisibility: null, storyEffects: creditFirst(), textObjectIndex: 1, isRepost: false });
    expect(emitted.map((e) => e.textObjectIndex)).toEqual([1]);
  });
});
