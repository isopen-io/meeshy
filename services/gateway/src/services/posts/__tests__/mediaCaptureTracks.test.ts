import { describe, it, expect } from '@jest/globals';
import { mediaCaptureTracks, MEDIA_TRACK_PREFIX } from '../mediaCaptureTracks';

const audio = (id: string, duration: number | null = 4000) =>
  ({ id, mimeType: 'audio/mp4', duration });
const video = (id: string, duration: number | null = 8000) =>
  ({ id, mimeType: 'video/mp4', duration });
const image = (id: string) => ({ id, mimeType: 'image/jpeg', duration: null });

describe('mediaCaptureTracks', () => {
  it('test_audioMedia_producesDeterministicTrackWithFullFileWindow', () => {
    const tracks = mediaCaptureTracks({ media: [audio('m1', 4200)] });
    expect(tracks).toEqual([
      { trackId: `${MEDIA_TRACK_PREFIX}m1`, postMediaId: 'm1', startMs: 0, endMs: 4200 },
    ]);
  });

  it('test_audioMediaWithoutDuration_leavesEndOpen', () => {
    const tracks = mediaCaptureTracks({ media: [audio('m1', null)] });
    expect(tracks).toEqual([
      { trackId: `${MEDIA_TRACK_PREFIX}m1`, postMediaId: 'm1', startMs: 0 },
    ]);
  });

  it('test_imageAndUnknownMime_produceNothing', () => {
    expect(mediaCaptureTracks({ media: [image('m1'), { id: 'm2', mimeType: null }] }))
      .toEqual([]);
  });

  it('test_videoMedia_withoutOptIn_producesNothing', () => {
    // Le démuxage d'une bande-son vidéo exige le consentement explicite de
    // l'auteur (`Post.allowSoundExtraction`) — jamais dérivé de la visibilité.
    expect(mediaCaptureTracks({ media: [video('m1')] })).toEqual([]);
    expect(mediaCaptureTracks({ media: [video('m1')], allowVideoExtraction: false })).toEqual([]);
  });

  it('test_videoMedia_withOptIn_producesExtractionTrack', () => {
    const tracks = mediaCaptureTracks({ media: [video('m1', 9000)], allowVideoExtraction: true });
    expect(tracks).toEqual([
      {
        trackId: `${MEDIA_TRACK_PREFIX}m1`,
        postMediaId: 'm1',
        extractFromVideo: true,
        startMs: 0,
        endMs: 9000,
      },
    ]);
  });

  it('test_mediaAlreadyClaimedByStoryEffectsTrack_isLeftToThatTrack', () => {
    // Un composer riche référence déjà son média dans `storyEffects` : la
    // synthèse en double créerait DEUX usages pour le même son sur ce post.
    const tracks = mediaCaptureTracks({
      media: [audio('m1'), audio('m2')],
      storyEffectsTracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(tracks.map((t) => t.postMediaId)).toEqual(['m2']);
  });

  it('test_borrowedStoryTrackWithoutPostMediaId_doesNotBlockSynthesis', () => {
    const tracks = mediaCaptureTracks({
      media: [audio('m1')],
      storyEffectsTracks: [{ trackId: 't1', soundId: 'aabbccddeeff001122334455' }],
    });
    expect(tracks.map((t) => t.postMediaId)).toEqual(['m1']);
  });
});
