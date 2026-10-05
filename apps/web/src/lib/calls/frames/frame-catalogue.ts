import corporate from '@meeshy/shared/design/call-capture-frames/corporate.json';
import deconnecte from '@meeshy/shared/design/call-capture-frames/deconnecte.json';
import distingue from '@meeshy/shared/design/call-capture-frames/distingue.json';
import elegant from '@meeshy/shared/design/call-capture-frames/elegant.json';
import fantastique from '@meeshy/shared/design/call-capture-frames/fantastique.json';
import feerique from '@meeshy/shared/design/call-capture-frames/feerique.json';
import futuriste from '@meeshy/shared/design/call-capture-frames/futuriste.json';
import glauque from '@meeshy/shared/design/call-capture-frames/glauque.json';
import horsNorme from '@meeshy/shared/design/call-capture-frames/hors-norme.json';
import jovial from '@meeshy/shared/design/call-capture-frames/jovial.json';
import morbide from '@meeshy/shared/design/call-capture-frames/morbide.json';
import signature from '@meeshy/shared/design/call-capture-frames/signature.json';

import { expandMotif } from './frame-filter';
import { FRAME_MOODS, FrameMoodFileSchema, type CaptureFrame, type FrameMotif } from './frame-spec';

/**
 * **LE CATALOGUE DES CADRES** — les douze fichiers d'ambiance de
 * `packages/shared/design/call-capture-frames/`, lus au schéma et dépliés en
 * cadres. Un fichier illisible ne fait tomber que SES cadres (fail-closed) ;
 * `frame-catalogue.test.ts` exige qu'aucun ne le soit.
 */

export const RAW_MOOD_FILES: readonly unknown[] = [signature, distingue, elegant, jovial, deconnecte, corporate, fantastique, futuriste, glauque, horsNorme, morbide, feerique];

export function parseMotifs(raw: readonly unknown[]): readonly FrameMotif[] {
  return raw.flatMap((file) => {
    const parsed = FrameMoodFileSchema.safeParse(file);
    return parsed.success ? parsed.data.motifs.filter((motif) => motif.mood === parsed.data.mood) : [];
  });
}

const byMood = (a: CaptureFrame, b: CaptureFrame): number => FRAME_MOODS.indexOf(a.mood) - FRAME_MOODS.indexOf(b.mood);

let cached: readonly CaptureFrame[] | null = null;

/** Tous les cadres, ordonnés par ambiance puis dans l'ordre des fichiers. */
export function captureFrames(): readonly CaptureFrame[] {
  cached ??= [...parseMotifs(RAW_MOOD_FILES).flatMap(expandMotif)].sort(byMood);
  return cached;
}
