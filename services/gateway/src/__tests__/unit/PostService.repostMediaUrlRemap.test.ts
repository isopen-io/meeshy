/**
 * @jest-environment node
 *
 * #13614 — le repost d'une story réécrit aussi l'ADRESSE de ses pièces copiées
 * (`mediaURL`), pas seulement `postMediaId` : sinon le fond du repost désigne
 * encore la pièce source, supprimée à l'expiration de la story source.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import { PostType } from '@meeshy/shared/prisma/client';
import { createMockPrisma, makePost, createMockPostReactionService } from './post-service-mocks';

jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) }, init: jest.fn() },
}));

const SOURCE_URL = '/api/v1/attachments/file/s1.jpg';
const COPY_URL = '/api/v1/attachments/file/new-s1.jpg';
const FOREIGN_URL = 'https://cdn.example.com/elsewhere.jpg';

describe('PostService.repostPost — adresses des pièces copiées (#13614)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let mediaService: MediaService;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    mediaService = new MediaService();
    service = new PostService(prisma, mediaService, undefined, createMockPostReactionService());
  });

  const repostWith = async (storyEffects: Record<string, unknown>) => {
    const original = makePost({
      id: 'story-url',
      type: PostType.STORY,
      visibility: 'PUBLIC',
      media: [
        { id: 'orig-media-1', fileUrl: SOURCE_URL, mimeType: 'image/jpeg', filePath: 'p/s1.jpg', fileName: 's1.jpg', originalName: 's1.jpg', fileSize: 1000, order: 0 },
      ],
      storyEffects,
    });
    prisma.post.findFirst.mockResolvedValue(original);
    jest.spyOn(mediaService, 'duplicateMedia').mockResolvedValueOnce({
      fileUrl: COPY_URL, filePath: 'snap/new-s1.jpg', fileName: 'new-s1.jpg', fileSize: 1000, mimeType: 'image/jpeg',
    });
    prisma.post.create.mockResolvedValue(
      makePost({ id: 'repost-url', media: [{ id: 'new-media-1', order: 0, fileUrl: COPY_URL }], storyEffects }),
    );
    prisma.post.update.mockResolvedValue(original);
    return service.repostPost('story-url', 'user-reposter', { targetType: PostType.STORY });
  };

  it('le fond legacy du repost porte l\'adresse de la COPIE, l\'adresse étrangère reste', async () => {
    const result = await repostWith({
      mediaObjects: [
        { id: 'bg', postMediaId: 'orig-media-1', mediaURL: SOURCE_URL, placement: 'background' },
        { id: 'ext', mediaURL: FOREIGN_URL },
      ],
    });

    expect(result?.storyEffects).toEqual({
      mediaObjects: [
        { id: 'bg', postMediaId: 'new-media-1', mediaURL: COPY_URL, placement: 'background' },
        { id: 'ext', mediaURL: FOREIGN_URL },
      ],
    });
  });

  it('le document canvas v3 du repost porte l\'adresse de la COPIE', async () => {
    const result = await repostWith({
      v: 3,
      scenes: [{ id: 's1', objects: [{ id: 'o1', kind: 'media', payload: { postMediaId: 'orig-media-1', mediaURL: SOURCE_URL } }] }],
    });

    const scenes = (result?.storyEffects as unknown as { scenes: Array<{ objects: Array<{ payload: unknown }> }> }).scenes;
    expect(scenes[0].objects[0].payload).toEqual({ postMediaId: 'new-media-1', mediaURL: COPY_URL });
  });
});
