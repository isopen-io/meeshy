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
      // Coordonnées de SOURCE : `startTime: 2` est la position sur la TIMELINE
      // et n'entre plus dans `SoundUsage`. Sans `sourceStart`, l'entrée est 0.
      { trackId: 'track-a', postMediaId: 'media-a', soundId: undefined, startMs: 0, endMs: 4000 },
      { trackId: 'track-b', postMediaId: undefined, soundId: '507f1f77bcf86cd799439011', startMs: 0, endMs: undefined },
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

  /**
   * Chemin des posts VOCAUX (AudioPostComposer) : l'audio arrive par
   * `mediaIds`, SANS blob `storyEffects`. La capture doit recevoir une piste
   * SYNTHÉTISÉE depuis le PostMedia — c'est elle qui fait entrer les sons des
   * posts/réels publics dans la bibliothèque.
   */
  it('test_createPost_audioMediaWithoutStoryEffects_forwardsASynthesizedTrack', async () => {
    const { spy, captureSounds } = buildCaptureSpy();
    const prisma = buildPrisma();
    (prisma as any).postMedia.findMany = jest.fn<() => Promise<unknown[]>>()
      .mockResolvedValue([{ id: 'media-audio', mimeType: 'audio/mp4', duration: 4000 }]);
    const service = new PostService(prisma, undefined, undefined, undefined, undefined, spy);

    await service.createPost(
      { type: 'POST' as never, visibility: 'PUBLIC' as never, mediaIds: ['media-audio'] },
      'user-1',
    );

    expect(captureSounds.mock.calls[0][0].tracks).toEqual([
      { trackId: 'media:media-audio', postMediaId: 'media-audio', startMs: 0, endMs: 4000 },
    ]);
  });

  /**
   * Une VIDÉO n'entre en bibliothèque que sur opt-in auteur : sans
   * `allowSoundExtraction`, aucune piste synthétisée ; avec, une piste marquée
   * `extractFromVideo` que `SoundCaptureService` démuxera.
   */
  it('test_createPost_videoMedia_followsTheExtractionOptIn', async () => {
    const video = { id: 'media-video', mimeType: 'video/mp4', duration: 9000 };
    for (const { allow, expected } of [
      { allow: undefined, expected: [] },
      {
        allow: true,
        expected: [{
          trackId: 'media:media-video', postMediaId: 'media-video',
          extractFromVideo: true, startMs: 0, endMs: 9000,
        }],
      },
    ]) {
      const { spy, captureSounds } = buildCaptureSpy();
      const prisma = buildPrisma();
      (prisma as any).postMedia.findMany = jest.fn<() => Promise<unknown[]>>()
        .mockResolvedValue([video]);
      const service = new PostService(prisma, undefined, undefined, undefined, undefined, spy);

      await service.createPost(
        {
          type: 'POST' as never, visibility: 'PUBLIC' as never,
          mediaIds: ['media-video'], allowSoundExtraction: allow,
        },
        'user-1',
      );

      expect(captureSounds.mock.calls[0][0].tracks).toEqual(expected);
    }
  });

  /**
   * La lecture des médias qui échoue ne doit NI bloquer la publication NI
   * perdre les pistes du blob : `collectCaptureTracks` dégrade sur
   * `extractCaptureTracks` seul. `mediaIds` est REQUIS ici — sans média
   * attaché la lecture est sautée et le repli ne serait jamais exercé
   * (le `buildPrisma` par défaut n'a pas de `postMedia.findMany`).
   */
  it('test_createPost_mediaReadFailure_stillForwardsBlobTracks', async () => {
    const { spy, captureSounds } = buildCaptureSpy();
    await buildService(spy).createPost(
      {
        type: 'STORY' as never, visibility: 'PUBLIC' as never,
        storyEffects: STORY_EFFECTS, mediaIds: ['media-a'],
      },
      'user-1',
    );
    expect(captureSounds.mock.calls[0][0].tracks).toHaveLength(2);
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

  // MARK: - Qualification REEL par son emprunté (réutilisation d'audio)

  /**
   * Un réel « son de bibliothèque seul » est légitime : la piste `soundId` du
   * blob compte comme audio dans `qualifiesAsReel` (durée du `Sound`), au lieu
   * de dégrader systématiquement en POST faute de médias.
   */
  const borrowedOnlyEffects = {
    audioPlayerObjects: [{ id: 'track-b', soundId: '507f1f77bcf86cd799439011' }],
  };

  function buildReelPrisma(sound: Record<string, unknown> | null) {
    const prisma = buildPrisma();
    (prisma as any).sound = {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(sound ? [sound] : []),
    };
    return prisma;
  }

  async function createdTypeFor(sound: Record<string, unknown> | null) {
    const { spy } = buildCaptureSpy();
    const prisma = buildReelPrisma(sound);
    const service = new PostService(prisma, undefined, undefined, undefined, undefined, spy);
    await service.createPost(
      { type: 'REEL' as never, visibility: 'PUBLIC' as never, storyEffects: borrowedOnlyEffects },
      'user-1',
    );
    const createArgs = (prisma as any).post.create.mock.calls[0][0];
    return createArgs.data.type as string;
  }

  it('test_createPost_borrowedSoundOfThreeSeconds_keepsTheReel', async () => {
    expect(await createdTypeFor({
      durationMs: 5000, isPublic: true, uploaderId: 'someone-else', mutedAt: null,
    })).toBe('REEL');
  });

  it('test_createPost_borrowedSoundTooShort_degradesToPost', async () => {
    expect(await createdTypeFor({
      durationMs: 2000, isPublic: true, uploaderId: 'someone-else', mutedAt: null,
    })).toBe('POST');
  });

  it('test_createPost_privateForeignSound_doesNotQualifyTheReel', async () => {
    // Même garde que `recordBorrowed` : un son privé d'autrui (ou coupé) ne
    // qualifie pas plus un réel qu'il ne se laisse emprunter.
    expect(await createdTypeFor({
      durationMs: 5000, isPublic: false, uploaderId: 'someone-else', mutedAt: null,
    })).toBe('POST');
    expect(await createdTypeFor({
      durationMs: 5000, isPublic: true, uploaderId: 'someone-else', mutedAt: new Date(),
    })).toBe('POST');
  });

  it('test_createPost_ownPrivateSound_qualifiesTheReel', async () => {
    expect(await createdTypeFor({
      durationMs: 5000, isPublic: false, uploaderId: 'user-1', mutedAt: null,
    })).toBe('REEL');
  });
});
