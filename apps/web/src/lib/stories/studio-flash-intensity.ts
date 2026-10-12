/**
 * L'INTENSITÉ DU FLASH DE LA CAMÉRA DU STUDIO (#8672) — sortie de
 * `studio-capture-gestures.ts` (#10322) : le studio la lit à l'ouverture
 * (`use-studio-quick-capture.tsx`), et le reste des gestes de capture ne vit
 * qu'avec la caméra, chargée à la demande.
 */
export const FLASH_INTENSITY_MIN = 0.3;

export function flashIntensityOf(value: unknown): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return 1;
  return Math.min(1, Math.max(FLASH_INTENSITY_MIN, number));
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
