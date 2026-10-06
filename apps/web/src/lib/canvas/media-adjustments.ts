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
const VIGNETTE_CLEAR_STOP = '45%';
const WARM_TINT = '255, 138, 0';
const COOL_TINT = '0, 122, 255';

export type MediaAdjustmentOverlay = {
  readonly background: string;
  readonly mixBlendMode?: 'soft-light';
};

export type MediaAdjustmentsPaint = {
  readonly filter: string | undefined;
  readonly overlays: readonly MediaAdjustmentOverlay[];
};

export type MediaAdjustmentsPaintOptions = {
  readonly target: MediaAdjustmentTarget;
  /** Pixels du repère design (1080 de large) par pixel de la SOURCE — le rayon
   * du flou CoreImage se compte en pixels de l'image ; 1 quand la source est
   * inconnue. */
  readonly designPixelsPerSourcePixel?: number;
};

const NOTHING: MediaAdjustmentsPaint = { filter: undefined, overlays: [] };

const round4 = (value: number): number => Math.round(value * 10000) / 10000;

function filterChain(values: MediaAdjustments, designPixelsPerSourcePixel: number): readonly string[] {
  const { exposure, brightness, contrast, saturation, vibrance, blur } = values;
  return [
    exposure !== undefined ? `brightness(${round4(2 ** (exposure / SRGB_GAMMA))})` : null,
    brightness !== undefined ? `brightness(${round4((MID_GRAY + brightness) / MID_GRAY)})` : null,
    contrast !== undefined ? `contrast(${round4(contrast)})` : null,
    saturation !== undefined ? `saturate(${round4(saturation)})` : null,
    vibrance !== undefined ? `saturate(${round4(1 + vibrance * VIBRANCE_WEIGHT)})` : null,
    blur !== undefined ? `blur(${cqw((BLUR_SOURCE_PIXELS * blur * designPixelsPerSourcePixel) / DESIGN_WIDTH)})` : null,
  ].filter((step): step is string => step !== null);
}

function overlaysOf({ temperature, vignette }: MediaAdjustments): readonly MediaAdjustmentOverlay[] {
  const tint: readonly MediaAdjustmentOverlay[] =
    temperature === undefined
      ? []
      : [{ background: `rgba(${temperature > 0 ? WARM_TINT : COOL_TINT}, ${round4(Math.abs(temperature) * TINT_ALPHA)})`, mixBlendMode: 'soft-light' }];
  const shade: readonly MediaAdjustmentOverlay[] =
    vignette === undefined
      ? []
      : [{ background: `radial-gradient(ellipse at center, rgba(0, 0, 0, 0) ${VIGNETTE_CLEAR_STOP}, rgba(0, 0, 0, ${round4(Math.min(1, vignette * VIGNETTE_ALPHA_PER_UNIT))}) 100%)` }];
  return [...tint, ...shade];
}

/** La peinture de `payload.adjustments` : une chaîne de filtres CSS (ou
 * `undefined`) et les calques à superposer, dans l'ordre. Rien ne se peint
 * sans réglage actif. */
export function mediaAdjustmentsPaint(
  payload: Readonly<Record<string, unknown>>,
  { target, designPixelsPerSourcePixel = 1 }: MediaAdjustmentsPaintOptions,
): MediaAdjustmentsPaint {
  const values = readMediaAdjustments(payload, target);
  if (values === null) return NOTHING;
  const scale = Number.isFinite(designPixelsPerSourcePixel) && designPixelsPerSourcePixel > 0 ? designPixelsPerSourcePixel : 1;
  const chain = filterChain(values, scale);
  return { filter: chain.length === 0 ? undefined : chain.join(' '), overlays: overlaysOf(values) };
}
