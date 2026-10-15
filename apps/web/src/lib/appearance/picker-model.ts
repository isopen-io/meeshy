import type { AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import { PHOTO_BLUR_MAX, PHOTO_VEIL_MAX, PHOTO_VEIL_STEP, type ConversationAppearance, type ConversationBackground } from '@meeshy/shared/types/conversation-appearance';
import type { GamutKey } from '@meeshy/shared/utils/appearance-gamut';

/**
 * **LE MODÈLE DU SÉLECTEUR « FOND ET COULEUR »** (#10631, § 9) — la logique PURE
 * des gestes : chaque toucher rend la NOUVELLE apparence (jamais une mutation),
 * que le composant applique aussitôt (optimiste) et envoie. Aucun geste ne perd
 * un réglage voisin : changer de fond garde l'accent, changer d'accent garde le
 * fond.
 */
/** Un geste du sélecteur : calculé sur l'apparence COURANTE au moment de l'application, jamais sur celle du dernier rendu (deux touchers rapides se cumulent). */
export type AppearanceChange = (current: ConversationAppearance) => ConversationAppearance;

/** Les défauts d'iOS (`ConversationAppearanceViewModel.selectPhoto`) : voile 0,3, aucun flou. */
export const PICKER_PHOTO_DEFAULTS = { veil: 0.3, blur: 0 } as const;

export const withBackground = (appearance: ConversationAppearance, background: ConversationBackground): ConversationAppearance => ({ ...appearance, background });

export const withAccent = (appearance: ConversationAppearance, accent: GamutKey | null): ConversationAppearance => ({ ...appearance, accent });

export const withAnimate = (appearance: ConversationAppearance, animate: boolean): ConversationAppearance => ({ ...appearance, animate });

export const signatureBackground = (): ConversationBackground => ({ kind: 'signature' });

export const designBackground = (pack: string, design: string): ConversationBackground => ({ kind: 'design', pack, design });

export const solidBackground = (color: GamutKey): ConversationBackground => ({ kind: 'solid', color });

/** Choisir une photo garde le voile et le flou déjà réglés sur une photo précédente. */
export function photoBackground(previous: ConversationBackground, attachmentId: string): ConversationBackground {
  const { veil, blur } = previous.kind === 'photo' ? previous : PICKER_PHOTO_DEFAULTS;
  return { kind: 'photo', attachmentId, veil, blur };
}

/** Le voile : par pas de 0,05 entre 0 et 0,8 ; le flou : entier entre 0 et 24. */
export const clampVeil = (value: number): number => Math.min(PHOTO_VEIL_MAX, Math.max(0, Number((Math.round(value / PHOTO_VEIL_STEP) * PHOTO_VEIL_STEP).toFixed(2))));
export const clampBlur = (value: number): number => Math.min(PHOTO_BLUR_MAX, Math.max(0, Math.round(value)));

export function withPhotoTuning(appearance: ConversationAppearance, tuning: { readonly veil?: number; readonly blur?: number }): ConversationAppearance {
  const { background } = appearance;
  if (background.kind !== 'photo') return appearance;
  return {
    ...appearance,
    background: {
      ...background,
      veil: tuning.veil === undefined ? background.veil : clampVeil(tuning.veil),
      blur: tuning.blur === undefined ? background.blur : clampBlur(tuning.blur),
    },
  };
}

/** L'interrupteur « Animations » n'existe que si le modèle choisi porte une couche animée. */
export const hasAnimatedLayer = (design: AppearanceDesign | undefined): boolean => design?.lottie !== undefined;

export const isChosen = (background: ConversationBackground, candidate: ConversationBackground): boolean => JSON.stringify(background) === JSON.stringify(candidate);

/**
 * La flèche suivante dans un groupe de choix (clavier). En RTL la flèche
 * droite RECULE : la lecture va de droite à gauche.
 */
export function arrowTarget(params: { readonly count: number; readonly index: number; readonly key: string; readonly rtl: boolean }): number | null {
  const { count, index, key, rtl } = params;
  if (count === 0) return null;
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
  if (key === forward || key === 'ArrowDown') return (index + 1) % count;
  if (key === backward || key === 'ArrowUp') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

export const SHOP_PATH = '/settings?volet=packs&domaine=wallpaper';
