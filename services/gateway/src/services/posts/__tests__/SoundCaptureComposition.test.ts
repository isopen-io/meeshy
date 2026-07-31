import { describe, it, expect, jest } from '@jest/globals';
import { PostService } from '../../PostService';
import type { SoundCaptureService, CaptureContext } from '../SoundCaptureService';

/**
 * La COMPOSITION `PostService` → `SoundCaptureService`, exécutée pour de vrai.
 *
 * Les deux côtés étaient testés unitairement, mais le câblage entre eux n'était
 * gardé que par une recherche de chaîne dans le source : remplacer
 * `tracks: extractCaptureTracks(data.storyEffects)` par `tracks: []` tuait la
 * capture à la publication et laissait la suite entière verte. Ici, on appelle
 * `createPost` et on regarde ce que le service reçoit réellement.
 */

function buildPrisma() {
  const created = {
    id: 'post-1', authorId: 'user-1', metadata: null,
    visibility: 'PUBLIC', repostOfId: null,
  };
  return {
    post: {
      create: jest.fn<() => Promise<unknown>>().mockResolvedValue(created),
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(created),
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        id: 'source-1', repostOfId: null, originalRepostOfId: null,
      }),
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue(created),
    },
    postMedia: {
      updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
    },
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

/** Espion : on ne veut QUE le contexte transmis, aucun accès disque ni base. */
function buildCaptureSpy() {
  const captureSounds = jest.fn<(ctx: CaptureContext) => Promise<void>>().mockResolvedValue(undefined);
  return { spy: { captureSounds } as unknown as SoundCaptureService, captureSounds };
}

const STORY_EFFECTS = {
  audioPlayerObjects: [
    { id: 'track-a', postMediaId: 'media-a', startTime: 2, duration: 4 },
    { id: 'track-b', soundId: '507f1f77bcf86cd799439011' },
  ],
};

function buildService(capture: SoundCaptureService) {
  const prisma = buildPrisma();
  // Les paramètres intermédiaires gardent leurs défauts ; seul le dernier
  // (`soundCaptureService`) est injecté.
  return new PostService(prisma, undefined, undefined, undefined, undefined, capture);
}

describe('PostService → SoundCaptureService (composition réelle)', () => {
  it('test_createPost_forwardsEveryTrackOfTheBlob', async () => {
    const { spy, captureSounds } = buildCaptureSpy();
    await buildService(spy).createPost(
      { type: 'STORY' as never, visibility: 'PUBLIC' as never, storyEffects: STORY_EFFECTS },
      'user-1',
    );

    expect(captureSounds).toHaveBeenCalledTimes(1);
    const ctx = captureSounds.mock.calls[0][0];
    // Les DEUX pistes, converties en millisecondes — pas un tableau vide, pas
    // seulement la première.
    expect(ctx.tracks).toEqual([
      { trackId: 'track-a', postMediaId: 'media-a', soundId: undefined, startMs: 2000, endMs: 6000 },
      { trackId: 'track-b', postMediaId: undefined, soundId: '507f1f77bcf86cd799439011', startMs: undefined, endMs: undefined },
    ]);
    expect(ctx.postId).toBe('post-1');
    expect(ctx.authorId).toBe('user-1');
    expect(ctx.feedsLibrary).toBe(true);
  });

  it('test_createPost_privateStory_doesNotFeedTheLibrary', async () => {
    const { spy, captureSounds } = buildCaptureSpy();
    await buildService(spy).createPost(
      { type: 'STORY' as never, visibility: 'PRIVATE' as never, storyEffects: STORY_EFFECTS },
      'user-1',
    );
    expect(captureSounds.mock.calls[0][0].feedsLibrary).toBe(false);
  });

  /**
   * LE piège d'attribution : `repostPost` duplique les médias SOUS le
   * reposteur, donc republier par `createPost` créerait un `Sound` crédité au
   * reposteur avec l'audio d'autrui. La garde de source correspondante survit à
   * un `|| true` ajouté ; celle-ci non.
   */
  it('test_createPost_repost_doesNotFeedTheLibrary', async () => {
    const { spy, captureSounds } = buildCaptureSpy();
    await buildService(spy).createPost(
      {
        type: 'STORY' as never, visibility: 'PUBLIC' as never,
        repostOfId: 'source-1', storyEffects: STORY_EFFECTS,
      },
      'reposteur',
    );
    expect(captureSounds.mock.calls[0][0].feedsLibrary).toBe(false);
  });


  /**
   * Règle produit du 2026-07-31 : un contenu réservé à une COMMUNAUTÉ alimente
   * lui aussi la bibliothèque. Le son en sort PUBLIC — l'audience du post ne se
   * propage pas à lui, c'est le principe d'indépendance du modèle.
   */
  it('test_createPost_communityStory_feedsTheLibrary', async () => {
    const { spy, captureSounds } = buildCaptureSpy();
    await buildService(spy).createPost(
      { type: 'STORY' as never, visibility: 'COMMUNITY' as never, storyEffects: STORY_EFFECTS },
      'user-1',
    );
    expect(captureSounds.mock.calls[0][0].feedsLibrary).toBe(true);
  });

  it('test_createPost_friendsStory_doesNotFeedTheLibrary', async () => {
    const { spy, captureSounds } = buildCaptureSpy();
    await buildService(spy).createPost(
      { type: 'STORY' as never, visibility: 'FRIENDS' as never, storyEffects: STORY_EFFECTS },
      'user-1',
    );
    expect(captureSounds.mock.calls[0][0].feedsLibrary).toBe(false);
  });

  it('test_createPost_communityRepost_stillDoesNotFeedTheLibrary', async () => {
    // `repostOfId` est rédhibitoire QUELLE QUE SOIT la visibilité : élargir la
    // règle aux communautés ne doit pas rouvrir le piège d'attribution.
    const { spy, captureSounds } = buildCaptureSpy();
    await buildService(spy).createPost(
      {
        type: 'STORY' as never, visibility: 'COMMUNITY' as never,
        repostOfId: 'source-1', storyEffects: STORY_EFFECTS,
      },
      'reposteur',
    );
    expect(captureSounds.mock.calls[0][0].feedsLibrary).toBe(false);
  });

  it('test_createPost_withoutAudio_forwardsAnEmptyTrackList', async () => {
    const { spy, captureSounds } = buildCaptureSpy();
    await buildService(spy).createPost(
      { type: 'POST' as never, visibility: 'PUBLIC' as never },
      'user-1',
    );
    // Appelée quand même : c'est elle qui libère les usages d'une édition qui
    // retire toutes les pistes.
    expect(captureSounds).toHaveBeenCalledTimes(1);
    expect(captureSounds.mock.calls[0][0].tracks).toEqual([]);
  });

  it('test_createPost_captureFailure_doesNotBreakPublishing', async () => {
    const captureSounds = jest.fn<(ctx: CaptureContext) => Promise<void>>()
      .mockRejectedValue(new Error('bibliothèque HS'));
    const spy = { captureSounds } as unknown as SoundCaptureService;
    await expect(buildService(spy).createPost(
      { type: 'STORY' as never, visibility: 'PUBLIC' as never, storyEffects: STORY_EFFECTS },
      'user-1',
    )).resolves.toBeDefined();
  });
});
