import { effectiveMediaRatio, readMediaCrop, type MediaCropRect } from '@meeshy/shared/utils/media-crop';

/**
 * LA TAILLE D'UN MÉDIA POSÉ (#6901, D7) — miroir
 * `StoryMediaLayer.baseMediaDesignSize` (`StoryMediaLayer.swift:425-449`) :
 * un média `content`/`fg` occupe 65 % du petit côté de la scène (jamais
 * 60 %, l'ancienne valeur en dur de `scene-player.tsx:244`), à son rapport
 * EFFECTIF — celui qui reste APRÈS un recadrage déclaré
 * (`effectiveMediaRatio`, `@meeshy/shared/utils/media-crop.ts`), jamais le
 * rapport brut du fichier.
 */

/** `target = 1080 × 0.65` (`StoryMediaLayer.swift:427`). */
export const MEDIA_TARGET_SIDE = 1080 * 0.65;
/** Le côté d'un média presque carré (±0,05) — la valeur EXACTE que
 * `StoryMediaLayer.swift:433` pose, distincte du `target` ci-dessus : le
 * cas carré n'est pas dérivé du target, il est câblé à part côté iOS. */
export const MEDIA_SQUARE_SIDE = 540;
/** `cornerRadiusFraction` (`StoryMediaLayer.swift:391`) — fraction du PETIT côté. */
export const MEDIA_CORNER_FRACTION = 0.06;

export type DesignSize = { readonly width: number; readonly height: number };

const clampRatio = (ratio: number): number => Math.min(Math.max(ratio, 0.1), 10);

/** `baseMediaDesignSize` — un ratio proche de 1 (±0,05) est traité comme
 * carré, exactement (`StoryMediaLayer.swift:433`). */
function baseMediaDesignSize(ratio: number): DesignSize {
  const bounded = clampRatio(ratio);
  if (Math.abs(bounded - 1) < 0.05) return { width: MEDIA_SQUARE_SIDE, height: MEDIA_SQUARE_SIDE };
  if (bounded < 1) return { width: MEDIA_TARGET_SIDE * bounded, height: MEDIA_TARGET_SIDE };
  return { width: MEDIA_TARGET_SIDE, height: MEDIA_TARGET_SIDE / bounded };
}

export function placedMediaDesignSize(params: {
  readonly aspectRatio: number;
  readonly scale?: number;
  readonly crop?: MediaCropRect | null;
}): DesignSize {
  const { aspectRatio, scale = 1, crop } = params;
  const effective = effectiveMediaRatio(aspectRatio, crop ?? null);
  const base = baseMediaDesignSize(effective);
  return { width: base.width * scale, height: base.height * scale };
}

/** Lit `crop` et `scale` directement depuis le `payload` brut d'un objet, en
 * ARTICULATION avec `readMediaCrop` (site unique) — évite qu'un consommateur
 * du moteur recopie la lecture des quatre clés `cropX/Y/W/H`. */
export function placedMediaDesignSizeFromPayload(params: {
  readonly aspectRatio: number;
  readonly payload: Record<string, unknown>;
}): DesignSize {
  const { aspectRatio, payload } = params;
  const scale = typeof payload.scale === 'number' && payload.scale > 0 ? payload.scale : 1;
  return placedMediaDesignSize({ aspectRatio, scale, crop: readMediaCrop(payload) });
}
