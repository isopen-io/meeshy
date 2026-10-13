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
