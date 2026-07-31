import { describe, it, expect } from '@jest/globals';
import { extractCaptureTracks } from '../captureTracks';

/**
 * Cette fonction décide de ce qui entre dans la bibliothèque de sons, et elle
 * n'avait AUCUN test tant qu'elle vivait en méthode privée de `PostService`.
 * Le blob `storyEffects` vient entièrement du client : tout y est hostile par
 * défaut.
 */
describe('extractCaptureTracks', () => {
  it('test_noStoryEffects_returnsEmpty', () => {
    expect(extractCaptureTracks(undefined)).toEqual([]);
    expect(extractCaptureTracks({})).toEqual([]);
  });

  it('test_audioPlayerObjectsNotAnArray_returnsEmpty', () => {
    expect(extractCaptureTracks({ audioPlayerObjects: 'nope' })).toEqual([]);
    expect(extractCaptureTracks({ audioPlayerObjects: { id: 't1' } })).toEqual([]);
  });

  it('test_nullEntries_areSkippedWithoutThrowing', () => {
    expect(extractCaptureTracks({ audioPlayerObjects: [null, 42, 'x'] })).toEqual([]);
  });

  it('test_trackWithoutMediaNorSound_isDropped', () => {
    // Une piste qui ne désigne ni fichier propre ni son emprunté n'a rien à
    // capturer : la laisser passer ferait une requête média à vide par piste.
    expect(extractCaptureTracks({ audioPlayerObjects: [{ id: 't1' }] })).toEqual([]);
  });

  it('test_trackWithoutId_isDropped', () => {
    // `trackId` est la moitié de la clé `@@unique([postId, trackId])` : sans
    // lui, deux pistes du même post s'écraseraient.
    expect(extractCaptureTracks({ audioPlayerObjects: [{ postMediaId: 'm1' }] })).toEqual([]);
  });

  it('test_emptyStringIds_areTreatedAsAbsent', () => {
    expect(extractCaptureTracks({ audioPlayerObjects: [{ id: 't1', postMediaId: '', soundId: '' }] }))
      .toEqual([]);
  });

  it('test_nonStringIds_areRejectedNotCoerced', () => {
    // Coercer `{ postMediaId: 42 }` en `'42'` enverrait une requête Prisma sur
    // un ObjectId invalide à chaque publication.
    expect(extractCaptureTracks({ audioPlayerObjects: [{ id: 't1', postMediaId: 42 }] })).toEqual([]);
  });

  it('test_ownedTrack_convertsSecondsToMilliseconds', () => {
    const tracks = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', postMediaId: 'm1', startTime: 1.5, duration: 2.25 }],
    });
    expect(tracks).toEqual([{
      trackId: 't1', postMediaId: 'm1', soundId: undefined, startMs: 1500, endMs: 3750,
    }]);
  });

  it('test_durationWithoutStartTime_leavesEndUndefined', () => {
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', soundId: 's1', duration: 3 }],
    });
    expect(track.startMs).toBeUndefined();
    expect(track.endMs).toBeUndefined();
  });

  it('test_multipleTracks_areAllReturned', () => {
    // Une story porte jusqu'à cinq pistes : ne garder que la première perdrait
    // silencieusement les sons suivants.
    const tracks = extractCaptureTracks({
      audioPlayerObjects: [
        { id: 't1', postMediaId: 'm1' },
        { id: 't2', soundId: 's2' },
        { id: 't3', postMediaId: 'm3' },
      ],
    });
    expect(tracks.map((t) => t.trackId)).toEqual(['t1', 't2', 't3']);
  });
});
