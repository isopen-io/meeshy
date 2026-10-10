import { keyboardInsetOf } from '@/lib/view/scene-yields';

/**
 * **SUR UNE STORY, LA ZONE DE COMMENTAIRES MONTE AVEC LE COMPOSEUR, PLUS
 * ENCORE AVEC LE CLAVIER** (#9894, jumelle web de #9893 — demande porteur du
 * 2026-10-10).
 *
 *  - Composeur absent (visiteur anonyme) ou replié en bulle : la zone garde sa
 *    hauteur de lecture.
 *  - Composeur visible : la zone MONTE — plus de commentaires lisibles
 *    au-dessus de lui.
 *  - Clavier virtuel ouvert : elle monte ENCORE et occupe tout l'espace libre
 *    au-dessus du composeur et du clavier, sous l'encoche.
 *
 * Replier pendant que le clavier se retire ne fait pas redescendre la zone
 * AVANT lui : c'est le clavier qui part qui la fait descendre, à son rythme.
 *
 * Tout est pur : la feuille mesure le clavier (`useVirtualKeyboard`) et pose le
 * résultat ; les hauteurs sont relatives au cadre qui la porte (la scène de la
 * story), donc aucune mesure de cadre n'est nécessaire.
 */
export type CommentsComposerPresence = 'absent' | 'folded' | 'open';
export type CommentsZoneStage = CommentsComposerPresence | 'typing';

/** La part du cadre occupée par la zone, clavier fermé. */
export const COMMENTS_ZONE_SHARE: Readonly<Record<CommentsComposerPresence, number>> = { absent: 0.56, folded: 0.6, open: 0.78 };

/** L'air laissé sous l'encoche quand la zone remplit l'espace libre. */
export const COMMENTS_ZONE_TOP_GAP_PX = 8;

/** La courbe et la durée du clavier iOS, pour monter et descendre avec lui. */
export const COMMENTS_ZONE_TRANSITION = 'height 250ms cubic-bezier(0.2, 0.8, 0.2, 1), bottom 250ms cubic-bezier(0.2, 0.8, 0.2, 1)';

export function commentsZoneStageOf({
  composer,
  keyboardOpen,
}: {
  readonly composer: CommentsComposerPresence;
  readonly keyboardOpen: boolean;
}): CommentsZoneStage {
  if (composer === 'absent' || !keyboardOpen) return composer;
  return 'typing';
}

export type CommentsZone = {
  readonly height: string;
  readonly bottom: number;
  readonly paddingBottom: string;
  readonly transition: string;
};

export function commentsZoneOf({
  stage,
  keyboardInset,
  reducedMotion,
}: {
  readonly stage: CommentsZoneStage;
  readonly keyboardInset: number;
  readonly reducedMotion: boolean;
}): CommentsZone {
  const transition = reducedMotion ? 'none' : COMMENTS_ZONE_TRANSITION;
  if (stage === 'typing') {
    return {
      height: `calc(100% - ${keyboardInset}px - env(safe-area-inset-top, 0px) - ${COMMENTS_ZONE_TOP_GAP_PX}px)`,
      bottom: keyboardInset,
      paddingBottom: '0px',
      transition,
    };
  }
  return { height: `${COMMENTS_ZONE_SHARE[stage] * 100}%`, bottom: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)', transition };
}

/** En deçà, c'est la barre d'adresse qui se replie, pas un clavier. */
export const KEYBOARD_MIN_PX = 120;

/** La hauteur visible de référence, clavier fermé, pour une largeur donnée. */
export type KeyboardBaseline = { readonly width: number; readonly height: number };

export function nextKeyboardBaseline(previous: KeyboardBaseline | null, seen: KeyboardBaseline): KeyboardBaseline {
  if (previous === null || previous.width !== seen.width) return seen;
  return { width: seen.width, height: Math.max(previous.height, seen.height) };
}

/**
 * **LE CLAVIER VIRTUEL, LU AU `visualViewport`.** Safari iOS garde la fenêtre
 * et rétrécit la vue visible : le clavier RECOUVRE (`inset`). La coque Android
 * redimensionne la WebView : rien ne recouvre, mais la vue visible a rétréci
 * par rapport à sa référence — le clavier est ouvert quand même.
 */
export function virtualKeyboardOf({
  innerHeight,
  viewportHeight,
  viewportOffsetTop,
  baseline,
}: {
  readonly innerHeight: number;
  readonly viewportHeight: number;
  readonly viewportOffsetTop: number;
  readonly baseline: KeyboardBaseline;
}): { readonly inset: number; readonly open: boolean } {
  const inset = keyboardInsetOf({ innerHeight, viewportHeight, viewportOffsetTop });
  const shrink = baseline.height - viewportHeight;
  return { inset, open: inset >= KEYBOARD_MIN_PX || shrink >= KEYBOARD_MIN_PX };
}
