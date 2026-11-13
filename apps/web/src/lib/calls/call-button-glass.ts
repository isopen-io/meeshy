/**
 * **LE VERRE DE CHAQUE BOUTON DE L'APPEL** (#17345, #17418) — la loi pure,
 * miroir de `CallButtonGlassRule` (iOS, #17323). Directive du porteur : iOS est
 * la référence, le web la reproduit. Chaque bouton est un verre, Fin reste
 * rouge, l'enclenché reste un disque blanc plein à glyphe sombre.
 *
 * Ce que le web impose en plus : un `backdrop-filter` est le geste le plus cher
 * de l'écran. UN SEUL par pilule — celui de la pilule (`.glass-call`) — et les
 * disques de ses boutons sont un voile et un liseré, sans flou à eux. Seul un
 * bouton ISOLÉ, qui flotte hors de toute pilule, porte son propre flou.
 *
 * Le bouton (`call-glass-button.tsx`) ne décide rien : il applique ce que cette
 * loi rend, et la loi se teste sans écran.
 */

/** `disc` : DANS une pilule ou un rail · `glass` : isolé · `active` : enclenché · `danger` : Fin. */
export const CALL_BUTTON_TONES = ['disc', 'glass', 'active', 'danger'] as const;

export type CallButtonTone = (typeof CALL_BUTTON_TONES)[number];

export type CallButtonSurface = 'drawn-disc' | 'own-glass' | 'solid-white' | 'solid-red';

export type CallButtonGlassTreatment = {
  readonly surface: CallButtonSurface;
  /** Le bouton pose-t-il son PROPRE flou d'arrière-plan ? Un seul ton le fait : le bouton isolé. */
  readonly blursBackdrop: boolean;
  /** Plein : le contraste du glyphe ne dépend jamais de ce qui passe sous le verre. */
  readonly hasSolidBacking: boolean;
  /** Le disque dessiné ne réagit pas seul : il s'éclaircit sous le doigt. */
  readonly drawsPressHighlight: boolean;
};

const SURFACE: Readonly<Record<CallButtonTone, CallButtonSurface>> = {
  disc: 'drawn-disc',
  glass: 'own-glass',
  active: 'solid-white',
  danger: 'solid-red',
};

export function callButtonGlassTreatment(tone: CallButtonTone): CallButtonGlassTreatment {
  return {
    surface: SURFACE[tone],
    blursBackdrop: tone === 'glass',
    hasSolidBacking: tone === 'active' || tone === 'danger',
    drawsPressHighlight: tone === 'disc',
  };
}
