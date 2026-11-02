/**
 * **LES RÉGLAGES D'UN MÉDIA POSÉ, PEINTS PAR LE WEB** (#9497, D-175) —
 * `payload.adjustments` d'un objet `media` de CanvasV3, écrit par iOS
 * (`ImageAdjustments`, #9175 image, #9169 vidéo).
 *
 * La LECTURE (bornes, neutre, règle vidéo) est la loi partagée
 * `readMediaAdjustments` ; ce module ne fait que la PEINDRE. iOS cuit la
 * chaîne CoreImage `ImageAdjustmentStage.apply` ; le web l'approche par une
 * chaîne de filtres CSS, dans le même ordre, et par deux calques superposés
 * (la teinte de température, puis la vignette). L'intention est la même, pas
 * le pixel — l'écart assumé est écrit dans `decisions.md` § D-175.
 *
 * | réglage | CoreImage | web |
 * |---|---|---|
 * | exposition | `CIExposureAdjust` (×2^EV en linéaire) | `brightness(2^(EV/2,2))` |
 * | luminosité | `CIColorControls` (+b) | `brightness((0,5+b)/0,5)`, exact au gris moyen |
 * | contraste | `CIColorControls` | `contrast(c)`, même formule |
 * | saturation | `CIColorControls` | `saturate(s)` |
 * | vibrance | `CIVibrance` | `saturate(1 + v/2)` |
 * | température | `CITemperatureAndTint` | calque orangé / bleuté en `soft-light` |
 * | netteté | `CISharpenLuminance` | rien (aucun équivalent CSS) |
 * | flou | `CIGaussianBlur`, rayon 16 px de la source | `blur()` au même rayon, ramené au repère 1080 |
 * | vignette | `CIVignette` | dégradé radial noir superposé |
 * | bloom (#9498) | `CIBloom` | `glow` : un halo SVG (flou + `screen`) que le média référence |
 * | grain (#9498) | bruit noir d'opacité 0,1 × v | calque de bruit `feTurbulence`, même opacité |
 */
import { readMediaAdjustments, type MediaAdjustmentTarget, type MediaAdjustments } from '@meeshy/shared/utils/media-adjustments';

import { cqw } from './units';

const DESIGN_WIDTH = 1080;
const BLUR_SOURCE_PIXELS = 16;
const SRGB_GAMMA = 2.2;
const MID_GRAY = 0.5;
const VIBRANCE_WEIGHT = 0.5;
const TINT_ALPHA = 0.5;
const VIGNETTE_ALPHA_PER_UNIT = 0.5;
const VIGNETTE_CLEAR_STOP = 0.45;
const WARM_TINT = '255, 138, 0';
const COOL_TINT = '0, 122, 255';
/** Le grain de CoreImage : du noir dont l'alpha suit un bruit uniforme, au
 * plus 0,1 (`ImageAdjustmentStage.grain`) — 0,05 à mi-course, le préréglage
 * de l'ancien éditeur. */
const GRAIN_ALPHA_PER_UNIT = 0.1;

export type MediaAdjustmentOverlay = {
  readonly background: string;
  readonly mixBlendMode?: 'soft-light';
};

export type MediaAdjustmentsPaint = {
  readonly filter: string | undefined;
  readonly overlays: readonly MediaAdjustmentOverlay[];
  /** L'intensité du BLOOM (#9498), absente sans bloom : le média la peint par
   * un halo SVG qu'il déclare et référence (`MediaGlowFilter`), après sa
   * chaîne de filtres — un identifiant par instance, que ce module ne connaît pas. */
  readonly glow?: number;
};

/**
 * UN CALQUE EN FORME (#13880) — ce que les calques CSS projettent, et ce
 * qu'un canvas peint lui-même (l'export d'une story) : la teinte en lumière
 * douce, la vignette (transparente jusqu'à `clearStop` du rayon, puis noire
 * jusqu'à `alpha`), le grain (du noir dont l'alpha suit un bruit, au plus `alpha`).
 */
export type MediaAdjustmentLayer =
  | { readonly kind: 'tint'; readonly rgb: string; readonly alpha: number }
  | { readonly kind: 'vignette'; readonly alpha: number; readonly clearStop: number }
  | { readonly kind: 'grain'; readonly alpha: number };

export type MediaAdjustmentsPaintOptions = {
  readonly target: MediaAdjustmentTarget;
  /** L'unité du flou, en pixels du repère design — `cqw` par défaut (le lecteur) ; un canvas la veut en pixels. */
  readonly blurLength?: (designPixels: number) => string;
  /** Pixels du repère design (1080 de large) par pixel de la SOURCE — le rayon
   * du flou CoreImage se compte en pixels de l'image ; 1 quand la source est
   * inconnue. */
  readonly designPixelsPerSourcePixel?: number;
};

/** Le rayon du bloom (`CIBloom`, 10 px de la source) en fraction de la LARGEUR du média, sur une source supposée large de 1080 px — le halo du lecteur (`MediaGlowFilter`) et celui de l'export. */
export const BLOOM_RADIUS_FRACTION = 10 / 1080;

const NOTHING: MediaAdjustmentsPaint = { filter: undefined, overlays: [] };

const round4 = (value: number): number => Math.round(value * 10000) / 10000;

const cqwLength = (designPixels: number): string => cqw(designPixels / DESIGN_WIDTH);

function filterChain(values: MediaAdjustments, designPixelsPerSourcePixel: number, blurLength: (designPixels: number) => string): readonly string[] {
  const { exposure, brightness, contrast, saturation, vibrance, blur } = values;
  return [
    exposure !== undefined ? `brightness(${round4(2 ** (exposure / SRGB_GAMMA))})` : null,
    brightness !== undefined ? `brightness(${round4((MID_GRAY + brightness) / MID_GRAY)})` : null,
    contrast !== undefined ? `contrast(${round4(contrast)})` : null,
    saturation !== undefined ? `saturate(${round4(saturation)})` : null,
    vibrance !== undefined ? `saturate(${round4(1 + vibrance * VIBRANCE_WEIGHT)})` : null,
    blur !== undefined ? `blur(${blurLength(BLUR_SOURCE_PIXELS * blur * designPixelsPerSourcePixel)})` : null,
  ].filter((step): step is string => step !== null);
}

/** Un bruit en tuile de 256 px : `feTurbulence` donne la valeur, la matrice la
 * porte à l'alpha d'un noir pur — la forme du grain de CoreImage. */
const grainBackground = (alpha: number): string => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><filter id="g">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" stitchTiles="stitch"/>' +
    `<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${alpha} 0 0 0 0"/>` +
    '</filter><rect width="100%" height="100%" filter="url(#g)"/></svg>';
  // Les parenthèses aussi : un `)` nu fermerait le `url(` d'un analyseur CSS strict.
  const encoded = encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `url("data:image/svg+xml,${encoded}")`;
};

function layersOf({ temperature, vignette, grain }: MediaAdjustments): readonly MediaAdjustmentLayer[] {
  const tint: readonly MediaAdjustmentLayer[] =
    temperature === undefined ? [] : [{ kind: 'tint', rgb: temperature > 0 ? WARM_TINT : COOL_TINT, alpha: round4(Math.abs(temperature) * TINT_ALPHA) }];
  const shade: readonly MediaAdjustmentLayer[] =
    vignette === undefined ? [] : [{ kind: 'vignette', alpha: round4(Math.min(1, vignette * VIGNETTE_ALPHA_PER_UNIT)), clearStop: VIGNETTE_CLEAR_STOP }];
  const noise: readonly MediaAdjustmentLayer[] = grain === undefined ? [] : [{ kind: 'grain', alpha: round4(grain * GRAIN_ALPHA_PER_UNIT) }];
  return [...tint, ...shade, ...noise];
}

function overlayOf(layer: MediaAdjustmentLayer): MediaAdjustmentOverlay {
  switch (layer.kind) {
    case 'tint':
      return { background: `rgba(${layer.rgb}, ${layer.alpha})`, mixBlendMode: 'soft-light' };
    case 'vignette':
      return { background: `radial-gradient(ellipse at center, rgba(0, 0, 0, 0) ${layer.clearStop * 100}%, rgba(0, 0, 0, ${layer.alpha}) 100%)` };
    case 'grain':
      return { background: grainBackground(layer.alpha) };
  }
}

/** Les calques des réglages, en forme, dans l'ordre où ils se superposent. */
export function mediaAdjustmentLayers(payload: Readonly<Record<string, unknown>>, target: MediaAdjustmentTarget): readonly MediaAdjustmentLayer[] {
  const values = readMediaAdjustments(payload, target);
  return values === null ? [] : layersOf(values);
}

/** La peinture de `payload.adjustments` : une chaîne de filtres CSS (ou
 * `undefined`) et les calques à superposer, dans l'ordre. Rien ne se peint
 * sans réglage actif. */
export function mediaAdjustmentsPaint(
  payload: Readonly<Record<string, unknown>>,
  { target, designPixelsPerSourcePixel = 1, blurLength = cqwLength }: MediaAdjustmentsPaintOptions,
): MediaAdjustmentsPaint {
  const values = readMediaAdjustments(payload, target);
  if (values === null) return NOTHING;
  const scale = Number.isFinite(designPixelsPerSourcePixel) && designPixelsPerSourcePixel > 0 ? designPixelsPerSourcePixel : 1;
  const chain = filterChain(values, scale, blurLength);
  return {
    filter: chain.length === 0 ? undefined : chain.join(' '),
    overlays: layersOf(values).map(overlayOf),
    ...(values.bloom !== undefined ? { glow: values.bloom } : {}),
  };
}
