/**
 * **LE ZOOM DE MA CAMÉRA** (#8441) — la contrainte `zoom` de la piste
 * (`getCapabilities().zoom`), là où le navigateur la propose : Chrome sur
 * Android et la coque Capacitor, qui passent au zoom de l'appareil. Ailleurs
 * (la plupart des webcams, Safari, Firefox), rien n'est affiché.
 *
 * Le zoom se règle sur la CAMÉRA, même quand un effet traite la piste envoyée
 * (`cameraSourceOf`) : ce que j'envoie est ce que la caméra cadre.
 */

export type ZoomRange = { readonly min: number; readonly max: number; readonly step: number };

type ZoomCapability = { readonly min?: unknown; readonly max?: unknown; readonly step?: unknown };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function zoomRangeOf(track: MediaStreamTrack | null): ZoomRange | null {
  if (track === null || typeof track.getCapabilities !== 'function') return null;
  const zoom = (track.getCapabilities() as MediaTrackCapabilities & { readonly zoom?: ZoomCapability }).zoom;
  if (zoom === undefined || !finite(zoom.min) || !finite(zoom.max) || zoom.max <= zoom.min) return null;
  return { min: zoom.min, max: zoom.max, step: finite(zoom.step) && zoom.step > 0 ? zoom.step : 0.01 };
}

export function currentZoom(track: MediaStreamTrack, range: ZoomRange): number {
  const zoom = (track.getSettings() as MediaTrackSettings & { readonly zoom?: unknown }).zoom;
  return finite(zoom) ? zoom : range.min;
}

const round = (value: number): number => Math.round(value * 100) / 100;

export function clampZoom(range: ZoomRange, value: number): number {
  const bounded = Math.max(range.min, Math.min(range.max, value));
  return round(range.min + Math.round((bounded - range.min) / range.step) * range.step);
}

/** Le pincement : le zoom du début du geste, multiplié par l'écart des doigts. */
export const zoomAfterPinch = (range: ZoomRange, start: number, scale: number): number => clampZoom(range, start * scale);

/** La molette (ou le pincement d'un pavé tactile, qui arrive en molette) : vers le haut, on zoome. */
export const zoomAfterWheel = (range: ZoomRange, current: number, deltaY: number): number => clampZoom(range, current * Math.exp(-deltaY / 400));

const NUDGE = 1.25;

/** Un cran des boutons ± : un quart de plus, ou de moins. */
export const zoomNudge = (range: ZoomRange, current: number, direction: 1 | -1): number => clampZoom(range, direction === 1 ? current * NUDGE : current / NUDGE);

export function zoomLabel(value: number, language: string): string {
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value)}×`;
}

type ZoomConstraint = MediaTrackConstraintSet & { readonly zoom?: number };

export function applyZoom(track: MediaStreamTrack, zoom: number): Promise<void> {
  const constraint: ZoomConstraint = { zoom };
  return track.applyConstraints({ advanced: [constraint] });
}
