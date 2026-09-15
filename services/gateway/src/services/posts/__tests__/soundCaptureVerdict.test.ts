import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { soundCaptureVerdict, orchestrateSoundCapture } from '../soundCaptureVerdict';
import type { SoundCaptureService } from '../SoundCaptureService';

/**
 * #6603 — `POST /posts` rendait 201 que le contenu alimente la bibliothèque
 * de sons ou non, sans qu'aucun champ ne le distingue. `soundCaptureVerdict`
 * est le calcul SYNCHRONE (aucune I/O, aucune promesse) qui donne au client
 * de quoi le savoir, sans attendre `SoundCaptureService.captureSounds`
 * (fire-and-forget, inchangé).
 */
describe('soundCaptureVerdict', () => {
  const ORIGINAL_FLAG = process.env.SOUND_LIBRARY_ENABLED;

  beforeEach(() => {
    // Même lecture que `captureSounds` (`soundLibraryEnabled()`, SoundCaptureService.ts) —
    // le verdict doit refléter le pipeline réellement actif.
    process.env.SOUND_LIBRARY_ENABLED = 'true';
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.SOUND_LIBRARY_ENABLED;
    else process.env.SOUND_LIBRARY_ENABLED = ORIGINAL_FLAG;
  });

  it('test_ineligibleContent_marksEveryTrackDiscarded', () => {
    const verdict = soundCaptureVerdict({
      feedsLibrary: false,
      tracks: [
        { trackId: 't1', postMediaId: 'media-1' },
        { trackId: 't2', soundId: 'sound-1' },
      ],
    });
    expect(verdict).toEqual({
      eligible: false,
      tracks: [
        { trackId: 't1', submitted: false },
        { trackId: 't2', submitted: false },
      ],
    });
  });

  it('test_eligibleContent_submitsOwnedAndBorrowedTracks', () => {
    const verdict = soundCaptureVerdict({
      feedsLibrary: true,
      tracks: [
        { trackId: 't1', postMediaId: 'media-1' },
        { trackId: 't2', soundId: 'sound-1' },
      ],
    });
    expect(verdict).toEqual({
      eligible: true,
      tracks: [
        { trackId: 't1', submitted: true },
        { trackId: 't2', submitted: true },
      ],
    });
  });

  it('test_eligibleContent_discardsATrackWithNeitherReference', () => {
    // Ne devrait pas arriver en pratique (validation en amont), mais le
    // calcul reste défensif : ni `postMediaId` ni `soundId` ⇒ ni empruntée
    // (`recordBorrowed`) ni possédée (`captureOwned`), donc ignorée par
    // `SoundCaptureService` comme par ce verdict.
    const verdict = soundCaptureVerdict({
      feedsLibrary: true,
      tracks: [{ trackId: 't1' }],
    });
    expect(verdict).toEqual({ eligible: true, tracks: [{ trackId: 't1', submitted: false }] });
  });

  it('test_noTracks_rendsAnEmptyTrackListRegardlessOfEligibility', () => {
    expect(soundCaptureVerdict({ feedsLibrary: true, tracks: [] }))
      .toEqual({ eligible: true, tracks: [] });
    expect(soundCaptureVerdict({ feedsLibrary: false, tracks: [] }))
      .toEqual({ eligible: false, tracks: [] });
  });

  it('test_disabledFeatureFlag_neverSubmitsButStillReportsEligibility', () => {
    process.env.SOUND_LIBRARY_ENABLED = 'false';
    const verdict = soundCaptureVerdict({
      feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'media-1' }],
    });
    // `eligible` reste vrai (c'est une propriété du CONTENU) ; `submitted`
    // ment si la bibliothèque est éteinte — même lecture de flag partagée
    // avec `SoundCaptureService.captureSounds`, jamais une seconde.
    expect(verdict).toEqual({ eligible: true, tracks: [{ trackId: 't1', submitted: false }] });
  });
});

/**
 * `orchestrateSoundCapture` est le SEUL appelant de `feedsSoundLibrary` et de
 * `SoundCaptureService.captureSounds` extrait de `PostService` (#6603) : le
 * fichier de câblage (`SoundCaptureWiring.test.ts`) prouve que `createPost`/
 * `updatePost` l'appellent au bon endroit ; ce fichier prouve ce qu'il FAIT.
 */
describe('orchestrateSoundCapture', () => {
  const ORIGINAL_FLAG = process.env.SOUND_LIBRARY_ENABLED;

  beforeEach(() => {
    process.env.SOUND_LIBRARY_ENABLED = 'true';
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.SOUND_LIBRARY_ENABLED;
    else process.env.SOUND_LIBRARY_ENABLED = ORIGINAL_FLAG;
  });

  function fakeSoundCaptureService(): { captureSounds: jest.Mock; instance: SoundCaptureService } {
    const captureSounds = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    return { captureSounds, instance: { captureSounds } as unknown as SoundCaptureService };
  }

  it('test_eligibleVisibility_callsCaptureSoundsAndReturnsAMatchingVerdict', () => {
    const { captureSounds, instance } = fakeSoundCaptureService();
    const onError = jest.fn();

    const verdict = orchestrateSoundCapture({
      postId: 'post-1',
      authorId: 'user-1',
      visibility: 'PUBLIC',
      repostOfId: undefined,
      tracks: [{ trackId: 't1', soundId: 'sound-1' }],
      soundCaptureService: instance,
      onError,
    });

    expect(captureSounds).toHaveBeenCalledWith({
      postId: 'post-1',
      authorId: 'user-1',
      feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: 'sound-1' }],
    });
    expect(verdict).toEqual({ eligible: true, tracks: [{ trackId: 't1', submitted: true }] });
    expect(onError).not.toHaveBeenCalled();
  });

  it('test_repost_neverFeedsTheLibrary_regardlessOfVisibility', () => {
    // Le piège d'attribution : `repostPost` duplique les médias de la source
    // SOUS le reposteur — sans cette exclusion, un `Sound` serait crédité au
    // reposteur avec l'audio d'autrui.
    const { captureSounds, instance } = fakeSoundCaptureService();

    const verdict = orchestrateSoundCapture({
      postId: 'post-1',
      authorId: 'user-1',
      visibility: 'PUBLIC',
      repostOfId: 'source-1',
      tracks: [{ trackId: 't1', soundId: 'sound-1' }],
      soundCaptureService: instance,
      onError: jest.fn(),
    });

    expect(captureSounds).toHaveBeenCalledWith(expect.objectContaining({ feedsLibrary: false }));
    expect(verdict.eligible).toBe(false);
  });

  it('test_captureSoundsRejection_routesToOnErrorRatherThanRejecting', async () => {
    const captureSounds = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('boom'));
    const instance = { captureSounds } as unknown as SoundCaptureService;
    const onError = jest.fn();

    orchestrateSoundCapture({
      postId: 'post-1',
      authorId: 'user-1',
      visibility: 'FRIENDS',
      tracks: [],
      soundCaptureService: instance,
      onError,
    });

    // `captureSounds` reste fire-and-forget : l'appelant ne l'attend pas, donc
    // laisser filer un tour d'event loop avant d'observer le `.catch`.
    await new Promise((resolve) => setImmediate(resolve));
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
