/**
 * @jest-environment node
 *
 * #9853 — un son RETIRÉ de la bibliothèque (`Sound.deletedAt`, #9848) ne part
 * plus dans une publication NEUVE, même envoyé par un client qui l'a gardé en
 * cache : la piste quitte le blob avant la persistance, la publication réussit
 * (un ancien client ne voit rien échouer). Une édition ou une republication
 * d'un post qui le liait déjà le garde : retirer un son ne casse rien sous les
 * pieds d'un lecteur.
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
const REMOVED = '64d000000000000000000001';
const LIVE = '64d000000000000000000002';

const soundRows = [
  { id: REMOVED, deletedAt: new Date('2026-11-01'), mutedAt: null, isPublic: true, uploaderId: 'autrui', durationMs: 30000 },
  { id: LIVE, deletedAt: null, mutedAt: null, isPublic: true, uploaderId: 'autrui', durationMs: 30000 },
];

const v1Effects = () => ({
  audioPlayerObjects: [
    { id: 't-removed', soundId: REMOVED, mediaURL: 'https://cdn.example/static/removed.m4a', isBackground: true },
    { id: 't-live', soundId: LIVE, mediaURL: 'https://cdn.example/static/live.m4a' },
  ],
});

const v3Effects = () => ({
  v: 3,
  scenes: [{
    id: 's1',
    objects: [
      { id: 'a-removed', kind: 'audio', payload: { soundId: REMOVED, mediaURL: 'https://cdn.example/static/removed.m4a' } },
      { id: 'a-live', kind: 'audio', payload: { soundId: LIVE } },
      { id: 'txt', kind: 'text', payload: { content: 'Bonjour' } },
    ],
  }],
  sound: { source: { t: 'library', soundId: REMOVED }, volume: 1 },
});

describe('createPost — un son retiré ne part pas dans une publication neuve (#9853)', () => {
  let prisma: ReturnType<typeof createMockPrisma> & { sound: { findMany: jest.Mock } };
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    const base = createMockPrisma();
    prisma = Object.assign(base, {
      sound: {
        findMany: jest.fn(async (args: { where: { id?: { in: string[] } } }) =>
          soundRows.filter((s) => (args.where.id?.in ?? []).includes(s.id))),
      },
    }) as typeof prisma;
    service = new PostService(prisma, new MediaService(), undefined, createMockPostReactionService());
    prisma.post.create.mockImplementation(async (args: { data: Record<string, unknown> }) => makePost({ id: 'story-1', ...args.data }));
  });

  const persisted = async (storyEffects: Record<string, unknown>) => {
    await service.createPost({ type: PostType.STORY, visibility: 'PUBLIC' as never, storyEffects }, AUTHOR);
    return (prisma.post.create.mock.calls[0]?.[0] as { data: { storyEffects: any } }).data.storyEffects;
  };

  it('test_createPost_v1RemovedSoundTrack_isNotPersisted', async () => {
    const effects = await persisted(v1Effects());
    expect(effects.audioPlayerObjects.map((t: { id: string }) => t.id)).toEqual(['t-live']);
  });

  it('test_createPost_v3RemovedSoundObjectAndSceneSound_areNotPersisted', async () => {
    const effects = await persisted(v3Effects());
    expect(effects.scenes[0].objects.map((o: { id: string }) => o.id)).toEqual(['a-live', 'txt']);
    expect(effects).not.toHaveProperty('sound');
  });

  it('test_createPost_liveSoundsOnly_blobUnchanged', async () => {
    const effects = await persisted({ audioPlayerObjects: [v1Effects().audioPlayerObjects[1]] });
    expect(effects).toEqual({ audioPlayerObjects: [v1Effects().audioPlayerObjects[1]] });
  });

  it('test_updatePost_postAlreadyLinkingRemovedSound_keepsTrack', async () => {
    prisma.post.findFirst.mockResolvedValue(makePost({ id: 'story-1', authorId: AUTHOR, type: PostType.STORY, media: [] }));
    prisma.post.update.mockImplementation(async (args: { data: Record<string, unknown> }) => makePost({ id: 'story-1', ...args.data }));
    await service.updatePost('story-1', AUTHOR, { storyEffects: v1Effects() });
    const call = prisma.post.update.mock.calls[0]?.[0] as { data: { storyEffects: any } } | undefined;
    expect(call?.data.storyEffects.audioPlayerObjects.map((t: { id: string }) => t.id)).toEqual(['t-removed', 't-live']);
  });
});
