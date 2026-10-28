/**
 * @jest-environment node
 *
 * #13607 — un fond de story publié avec `postMediaId` et sans `mediaURL` est servi
 * avec l'adresse de la pièce désignée, à la création comme à l'édition, pour que
 * les clients Android antérieurs lisent la bonne pièce. Jamais un média étranger.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import { PostType } from '@meeshy/shared/prisma/client';
import { createMockPrisma, makePost, createMockPostReactionService } from './post-service-mocks';

jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) },
    init: jest.fn(),
  },
}));

const AUTHOR = '0a0a0a0a0a0a0a0a0a0a0a01';
const SECOND = '507f1f77bcf86cd7994390b2';
const FIRST = '507f1f77bcf86cd7994390b1';
const STRANGER = '507f1f77bcf86cd7994390b3';
const SECOND_URL = 'https://cdn.example/second.jpg';

const effectsFor = (postMediaId: string) => ({
  mediaObjects: [{ id: 'bg', isBackground: true, postMediaId, scale: 1 }],
});

describe('storyEffects — mediaURL du fond complété depuis la pièce désignée', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new PostService(prisma, new MediaService(), undefined, createMockPostReactionService());
    prisma.post.create.mockImplementation(async (args: { data: Record<string, unknown> }) => makePost({ id: 'story-1', ...args.data }));
    prisma.postMedia.findMany.mockImplementation(async (args: { where: { id?: { in: string[] } } }) =>
      (args.where.id?.in ?? []).filter((id) => id === SECOND).map((id) => ({ id, fileUrl: SECOND_URL })));
  });

  const created = async (postMediaId: string, mediaIds: string[]) => {
    await service.createPost({
      type: PostType.STORY, visibility: 'PUBLIC' as never, mediaIds, storyEffects: effectsFor(postMediaId),
    }, AUTHOR);
    return (prisma.post.create.mock.calls[0]?.[0] as { data: { storyEffects: any } }).data.storyEffects;
  };

  it('à la création, le fond désignant la 2e pièce reçoit son adresse, pas celle de la 1re', async () => {
    const effects = await created(SECOND, [FIRST, SECOND]);
    expect(effects.mediaObjects[0]).toEqual({ id: 'bg', isBackground: true, postMediaId: SECOND, scale: 1, mediaURL: SECOND_URL });
  });

  it('un média étranger à la story ne prête pas son adresse', async () => {
    const effects = await created(STRANGER, [FIRST, SECOND]);
    expect(effects.mediaObjects[0]).not.toHaveProperty('mediaURL');
  });

  it('une pièce que la story ne réclame pas n\'est pas lue', async () => {
    const effects = await created(SECOND, [FIRST]);
    expect(effects.mediaObjects[0]).not.toHaveProperty('mediaURL');
  });

  it('à l\'édition, la pièce déjà portée par le post fournit son adresse', async () => {
    prisma.post.findFirst.mockResolvedValue(makePost({
      id: 'story-1', authorId: AUTHOR, type: PostType.STORY, media: [{ id: SECOND, mimeType: 'image/jpeg', duration: null }],
    }));
    prisma.post.update.mockImplementation(async (args: { data: Record<string, unknown> }) => makePost({ id: 'story-1', ...args.data }));
    await service.updatePost('story-1', AUTHOR, { storyEffects: effectsFor(SECOND) });
    const call = prisma.post.update.mock.calls[0]?.[0] as { data: { storyEffects: any } } | undefined;
    expect(call?.data.storyEffects.mediaObjects[0].mediaURL).toBe(SECOND_URL);
  });
});
