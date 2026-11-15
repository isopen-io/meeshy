/**
 * **LE ZOOM DU PLEIN ÉCRAN D'UN ÉLÉMENT** (#16267) — loi pure : molette ou
 * pincement du pavé tactile (que le navigateur rend en `wheel` + `ctrlKey`),
 * bascule ×2 au double-clic, boutons + et −, bornés entre ×1 et ×4. Tant que
 * l'élément est zoomé, le passage à l'alternative voisine est bloqué.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
const STEP = 0.5;
const WHEEL_RATE = 0.002;

const clamp = (scale: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));

export const zoomBy = (scale: number, direction: 1 | -1): number => clamp(scale + direction * STEP);

export const toggleZoom = (scale: number): number => (scale > MIN_ZOOM ? MIN_ZOOM : 2);

export const wheelZoom = (scale: number, deltaY: number): number => clamp(scale * Math.exp(-deltaY * WHEEL_RATE));

export const isZoomed = (scale: number): boolean => scale > MIN_ZOOM;
