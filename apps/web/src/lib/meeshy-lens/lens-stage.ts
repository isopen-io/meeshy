import type { Lens } from '@meeshy/shared/types/lens-format';

import { heuristicFaceBox, type Box } from '@/lib/calls/face-effects';
import type { Surface2D } from '@/lib/calls/video-effects-frames';

import type { FrameSize } from './face-anchor';
import type { LensFiles } from './lens-files';
import type { LutCube } from './lens-lut';
import type { LutStage } from './lens-lut-stage';
import { paintLens, type LensPaintEnv } from './lens-paint';
import { lensLutOf, lensUsesFace, planLens, type LensDrawOp, type LensLevel } from './lens-plan';

/**
 * **L'ÉTAGE LENS D'UNE IMAGE D'APPEL** (W14, #11320) — ce que le moteur des
 * images (`video-effects-frames.ts`, dans le worker) appelle quand les
 * réglages portent une lens : l'ÉTALONNAGE par la LUT sur le GPU, avant le
 * canevas ; puis, sur l'image déjà recadrée, le PLAN (`planLens`, sur la boîte
 * du visage que suit le détecteur) et la PEINTURE 2D des cadres, stickers,
 * textes et particules par-dessus.
 *
 * Le visage n'est cherché que si une couche s'y ancre (`lensUsesFace`, W15,
 * #11321) : c'est ce qui fait du modèle à 478 points un chargement « à la
 * première lens de visage ».
 *
 * Tout ce qui manque se passe en silence : sans WebGL2 ou sans le cube de sa
 * LUT, la lens se joue sans étalonnage ; sans un fichier de sticker, sans ce
 * sticker. Une image d'appel part TOUJOURS.
 *
 * Les réglages (`LensSettings`) traversent `postMessage` : une lens LUE
 * (`parseLens`), les langues de l'ÉMETTEUR (le texte est incrusté dans la
 * vidéo envoyée), le palier de dégradation, et les fichiers que l'hôte a lus
 * et décodés (`files`, #11994) — l'étage n'ouvre jamais rien lui-même.
 */
export type LensSettings = { readonly lens: Lens; readonly languages: readonly string[]; readonly level: LensLevel; readonly files?: LensFiles };

export type LensStageEnv = {
  readonly face: (source: CanvasImageSource, frame: FrameSize) => Box;
  readonly cube: (asset: string) => LutCube | null;
  readonly lut?: () => LutStage | null;
  readonly paint: LensPaintEnv;
  /** `prefers-reduced-motion` : le temps de la lens est figé, ses particules ne bougent plus. */
  readonly reducedMotion?: () => boolean;
};

export type LensStage = {
  readonly plan: (settings: LensSettings, source: CanvasImageSource, frame: FrameSize, t: number) => readonly LensDrawOp[];
  readonly grade: (image: CanvasImageSource, settings: LensSettings, frame: FrameSize) => CanvasImageSource;
  readonly paint: (context: Surface2D, ops: readonly LensDrawOp[], frame: FrameSize) => void;
  readonly close: () => void;
};

const FROZEN_T = 0;

export function createLensStage(env: LensStageEnv): LensStage {
  let lut: LutStage | null | undefined;
  /* Les derniers fichiers remis : l'hôte ne les renvoie pas à chaque réglage (`video-effects-pipeline.ts`),
     et leurs noms sont adressés par contenu — un fichier gardé ne sert jamais une autre image que la sienne. */
  let files: LensFiles | undefined;
  const filesOf = (settings: LensSettings): LensFiles | undefined => (files = settings.files ?? files);
  const paintEnv: LensPaintEnv = { ...env.paint, assets: (asset) => files?.images[asset] ?? env.paint.assets(asset) };
  return {
    plan: (settings, source, frame, t) => {
      filesOf(settings);
      return planLens({ ...settings, frame, face: lensUsesFace(settings.lens) ? env.face(source, frame) : heuristicFaceBox(frame), t: env.reducedMotion?.() === true ? FROZEN_T : t });
    },
    grade: (image, settings, frame) => {
      const op = lensLutOf(settings.lens, settings.level);
      if (op === null) return image;
      const cube = filesOf(settings)?.cubes[op.asset] ?? env.cube(op.asset);
      if (cube === null) return image;
      lut ??= env.lut?.() ?? null;
      if (lut === null) return image;
      try {
        return lut.render(image, frame.width, frame.height, cube, op.intensity);
      } catch {
        return image;
      }
    },
    paint: (context, ops, frame) => paintLens(context, ops, frame, paintEnv),
    close: () => {
      lut?.release();
      lut = null;
      files = undefined;
    },
  };
}
