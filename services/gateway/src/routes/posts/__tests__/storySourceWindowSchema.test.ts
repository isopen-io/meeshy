import { describe, it, expect } from '@jest/globals';
import { StoryAudioObjectSchema, StoryMediaObjectSchema } from '../types';

/** Fenêtre de SOURCE (où l'on entre dans le fichier), à ne pas confondre avec
 *  `startTime`, qui dit quand la piste démarre sur la timeline. Le blob vient
 *  entièrement du client et les deux schémas terminent par `.passthrough()` :
 *  un champ temporel non énuméré entrerait sans aucune borne. */
describe('bornes de la fenêtre de source', () => {
  const audioBase = { id: 'track-1', postMediaId: '507f1f77bcf86cd799439011' };
  const mediaBase = { id: 'media-1', postMediaId: '507f1f77bcf86cd799439011' };

  it('test_audio_sourceStartInRange_isAccepted', () => {
    const r = StoryAudioObjectSchema.safeParse({ ...audioBase, sourceStart: 12.5, intrinsicDuration: 90 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sourceStart).toBe(12.5);
      expect(r.data.intrinsicDuration).toBe(90);
    }
  });

  it('test_audio_negativeSourceStart_isRejected', () => {
    expect(StoryAudioObjectSchema.safeParse({ ...audioBase, sourceStart: -1 }).success).toBe(false);
  });

  it('test_audio_absurdSourceStart_isRejected', () => {
    // Même plafond que ses frères `startTime`/`duration` : 86400 s = 24 h.
    expect(StoryAudioObjectSchema.safeParse({ ...audioBase, sourceStart: 86401 }).success).toBe(false);
  });

  it('test_audio_absurdIntrinsicDuration_isRejected', () => {
    expect(StoryAudioObjectSchema.safeParse({ ...audioBase, intrinsicDuration: 86401 }).success).toBe(false);
  });

  it('test_media_sourceStartIsBoundedToo', () => {
    // Le schéma MÉDIA est concerné autant que l'audio : la fenêtre de source
    // est ajoutée aux deux types d'objet.
    expect(StoryMediaObjectSchema.safeParse({ ...mediaBase, sourceStart: 3 }).success).toBe(true);
    expect(StoryMediaObjectSchema.safeParse({ ...mediaBase, sourceStart: -0.5 }).success).toBe(false);
    expect(StoryMediaObjectSchema.safeParse({ ...mediaBase, sourceStart: 999999 }).success).toBe(false);
  });

  it('test_media_intrinsicDurationIsBounded', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...mediaBase, intrinsicDuration: 42 }).success).toBe(true);
    expect(StoryMediaObjectSchema.safeParse({ ...mediaBase, intrinsicDuration: 86401 }).success).toBe(false);
  });

  it('test_absentFields_stayUndefined', () => {
    const r = StoryAudioObjectSchema.safeParse(audioBase);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sourceStart).toBeUndefined();
      expect(r.data.intrinsicDuration).toBeUndefined();
    }
  });
});
