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
      // Fenêtre de SOURCE : `startTime: 1.5` était la position sur la TIMELINE
      // et n'entre plus ici. Sans `sourceStart`, on entre le fichier à 0.
      trackId: 't1', postMediaId: 'm1', soundId: undefined, startMs: 0, endMs: 2250,
    }]);
  });

  it('test_durationWithoutSourceStart_entersTheSourceAtZero', () => {
    // Ancien contrat : `startMs` restait indéfini sans `startTime`. Nouveau :
    // c'est une coordonnée de SOURCE, et un client qui ne déclare pas
    // `sourceStart` entre le fichier à 0 — c'est 0, pas « inconnu ».
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', soundId: 's1', duration: 3 }],
    });
    expect(track.startMs).toBe(0);
    expect(track.endMs).toBe(3000);
  });

  // MARK: - Coordonnées de source (2026-08-02)

  it('test_sourceWindow_isWrittenInSourceCoordinates', () => {
    // La piste démarre à 30 s SUR LA TIMELINE, mais n'utilise le son qu'à
    // partir de 12 s DANS LE FICHIER, sur 8 s.
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{
        id: 't1', soundId: 's1',
        startTime: 30, duration: 8,
        sourceStart: 12, intrinsicDuration: 90,
      }],
    });
    expect(track.startMs).toBe(12000);
    expect(track.endMs).toBe(20000);
  });

  it('test_excerptIsClampedToRemainingSource', () => {
    // Fenêtre de 60 s sur un extrait qui n'a que 10 s de source restante : la
    // piste BOUCLE. La part utilisée du son reste 10 s, pas 60.
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{
        id: 't1', soundId: 's1',
        startTime: 0, duration: 60,
        sourceStart: 80, intrinsicDuration: 90,
      }],
    });
    expect(track.startMs).toBe(80000);
    expect(track.endMs).toBe(90000);
  });

  it('test_sourceStartBeyondIntrinsic_yieldsEmptyExcerpt', () => {
    // Blob incohérent (client hostile) : jamais de durée négative en base.
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{
        id: 't1', soundId: 's1', duration: 5,
        sourceStart: 100, intrinsicDuration: 90,
      }],
    });
    expect(track.endMs).toBe(track.startMs);
  });

  it('test_nonFiniteValues_areTreatedAsAbsent', () => {
    // `typeof NaN === 'number'` : sans test de finitude, `Math.round` ferait
    // entrer NaN en base.
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{
        id: 't1', soundId: 's1',
        sourceStart: Number.NaN, duration: Number.POSITIVE_INFINITY,
      }],
    });
    expect(track.startMs).toBe(0);
    expect(track.endMs).toBeUndefined();
  });

  it('test_durationAbsent_leavesEndUndefined', () => {
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', soundId: 's1', sourceStart: 3 }],
    });
    expect(track.startMs).toBe(3000);
    expect(track.endMs).toBeUndefined();
  });

  // MARK: - Forme d'onde (Sound.waveform n'avait aucun écrivain)

  it('test_waveformSamples_areCarriedThrough', () => {
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', postMediaId: 'm1', waveformSamples: [0.1, 0.9, 0.4] }],
    });
    expect(track.waveform).toEqual([0.1, 0.9, 0.4]);
  });

  it('test_waveformSamples_nonArrayOrEmpty_isUndefined', () => {
    const [a] = extractCaptureTracks({ audioPlayerObjects: [{ id: 't1', postMediaId: 'm1' }] });
    expect(a.waveform).toBeUndefined();
    const [b] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', postMediaId: 'm1', waveformSamples: 'nope' }],
    });
    expect(b.waveform).toBeUndefined();
    const [c] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', postMediaId: 'm1', waveformSamples: [] }],
    });
    expect(c.waveform).toBeUndefined();
  });

  it('test_waveformSamples_nonNumericEntriesAreDropped', () => {
    // `Float[]` en Prisma/Mongo n'accepte pas NaN, et le tableau vient du
    // client.
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{
        id: 't1', postMediaId: 'm1',
        waveformSamples: [0.2, 'x', null, Number.NaN, 0.8],
      }],
    });
    expect(track.waveform).toEqual([0.2, 0.8]);
  });

  it('test_waveformSamples_areCappedAtTheSchemaLimit', () => {
    // Même plafond que `StoryAudioObjectSchema.waveformSamples` : une piste ne
    // grave pas un blob de plusieurs Mo dans une colonne Float[].
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{
        id: 't1', postMediaId: 'm1',
        waveformSamples: new Array(5000).fill(0.5) as number[],
      }],
    });
    expect(track.waveform).toHaveLength(2048);
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
