/**
 * **LE VERROU, LE ZOOM AU GLISSER ET LE CURSEUR DU FLASH** (#8672, jumelle
 * web de #8671 — directive porteur 2026-09-29) :
 *
 * > « Ajouter une clé pour la vidéo permettant de lock la vidéo et de pouvoir
 * > zoomer : swipe vers le haut et swipe vers le bas ! Quand le flash est
 * > activé, une slide liquid glass s'allonge à droite, collée au bouton, pour
 * > décider de l'intensité du blanc du sol du composeur ! »
 *
 * Les deux axes du doigt qui filme ne se disputent rien : l'axe HORIZONTAL
 * mène au cadenas (posé du côté de début du déclencheur), l'axe VERTICAL
 * zoome. Chaque loi ne lit que son axe.
 */

export type LayoutDirection = 'ltr' | 'rtl';

/** La course qui mène du doigt au cadenas — l'écart entre le centre du
 * déclencheur et celui du cadenas posé à côté de lui. */
export const CAPTURE_LOCK_TRAVEL = 96;

export function captureLock({ dx, direction }: { readonly dx: number; readonly direction: LayoutDirection }): {
  readonly reached: boolean;
  readonly progress: number;
} {
  const toward = direction === 'ltr' ? -dx : dx;
  const progress = Math.min(1, Math.max(0, toward / CAPTURE_LOCK_TRAVEL));
  return { reached: progress >= 1, progress };
}

/**
 * `hardware` : la caméra expose `zoom` (`MediaTrackCapabilities`) — la piste
 * elle-même zoome, l'aperçu et le film avec elle. `recorded` : zoom NUMÉRIQUE
 * du rendu enregistré (un canvas recadre chaque image et c'est lui qui est
 * filmé). `preview` : ni l'un ni l'autre — seul l'aperçu grandit.
 */
export type CameraZoomMode = 'hardware' | 'recorded' | 'preview';

export type CameraZoomRange = {
  readonly mode: CameraZoomMode;
  readonly min: number;
  readonly max: number;
  /** `0` : continu. */
  readonly step: number;
};

/** Le plafond du zoom numérique : au-delà, l'image n'est plus que des pixels. */
const DIGITAL_ZOOM_MAX = 4;

export function zoomRangeOf({
  hardware,
  canvasCapture,
}: {
  readonly hardware: { readonly min: number; readonly max: number; readonly step: number } | null;
  readonly canvasCapture: boolean;
}): CameraZoomRange {
  if (hardware !== null && Number.isFinite(hardware.min) && Number.isFinite(hardware.max) && hardware.max > hardware.min) {
    return { mode: 'hardware', min: hardware.min, max: hardware.max, step: Number.isFinite(hardware.step) && hardware.step > 0 ? hardware.step : 0 };
  }
  return { mode: canvasCapture ? 'recorded' : 'preview', min: 1, max: DIGITAL_ZOOM_MAX, step: 0 };
}

/** Un glisser de cette longueur vers le haut DOUBLE le zoom : la progression
 * est géométrique, le même geste fait le même effet à ×1 comme à ×3. */
const PX_PER_DOUBLING = 140;

export function zoomAfterDrag({ from, dy, range }: { readonly from: number; readonly dy: number; readonly range: CameraZoomRange }): number {
  const raw = from * 2 ** (-dy / PX_PER_DOUBLING);
  const bounded = Math.min(range.max, Math.max(range.min, raw));
  if (range.step <= 0) return bounded;
  const stepped = range.min + Math.round((bounded - range.min) / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, Number(stepped.toFixed(6))));
}

/** Le cadre CENTRÉ qu'un zoom numérique garde de l'image. */
export function digitalZoomCrop({ width, height, zoom }: { readonly width: number; readonly height: number; readonly zoom: number }): {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
} {
  const factor = Number.isFinite(zoom) && zoom > 1 ? zoom : 1;
  const sw = Math.round(width / factor);
  const sh = Math.round(height / factor);
  return { sx: Math.round((width - sw) / 2), sy: Math.round((height - sh) / 2), sw, sh };
}

/** Le curseur n'existe que s'il a un effet : le sol blanc éclaire (caméra
 * avant, ou arrière sans torche). La torche du web n'a pas de puissance
 * réglable — un curseur à côté d'elle ne changerait rien. */
export function flashSliderShown({ flash, plan }: { readonly flash: boolean; readonly plan: 'off' | 'torch' | 'screen' }): boolean {
  return flash && plan === 'screen';
}

export const FLASH_INTENSITY_MIN = 0.3;

export function flashIntensityOf(value: unknown): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return 1;
  return Math.min(1, Math.max(FLASH_INTENSITY_MIN, number));
}

/** Le blanc du sol : plein à 1, un gris lumineux plus bas. */
export function flashFloorColor(intensity: number): string {
  const level = Math.round(255 * flashIntensityOf(intensity));
  // harmony-exempt: lumière physique du sol de capture, un gris calculé par intensité
  return `rgb(${level}, ${level}, ${level})`;
}

type FlashStorage = { readonly getItem: (key: string) => string | null; readonly setItem: (key: string, value: string) => void };

const FLASH_INTENSITY_KEY = 'meeshy.studio.camera.flashIntensity';

/** Mémorisée par lecteur (une commodité, jamais un état partagé) — un
 * stockage bloqué (navigation privée, données coupées) rend le blanc plein. */
export function readFlashIntensity(storage: FlashStorage | null): number {
  try {
    return flashIntensityOf(storage?.getItem(FLASH_INTENSITY_KEY) ?? null);
  } catch {
    return 1;
  }
}

export function writeFlashIntensity(storage: FlashStorage | null, value: number): void {
  try {
    storage?.setItem(FLASH_INTENSITY_KEY, String(flashIntensityOf(value)));
  } catch {
    // Un stockage refusé : la valeur vaut pour cette ouverture seulement.
  }
}
