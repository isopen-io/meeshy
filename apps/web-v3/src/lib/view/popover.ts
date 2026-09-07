/**
 * OÙ TOMBE UN PANNEAU ANCRÉ À UN CONTRÔLE — loi PURE, sans DOM, parce qu'elle
 * se trompe silencieusement : un menu qui déborde de l'écran ne lève rien, ne
 * rougit nulle part, et se voit seulement sur une capture qu'on regarde.
 *
 * Elle a été écrite pour le menu des modes de lecture (#5566), dont le chip
 * vit dans la grappe d'action de l'en-tête : aligné à droite de son ancre, un
 * panneau de 256 px commençait à `x = −16` sur un écran de 390 (mesuré). Elle
 * vaut pour TOUT panneau ancré à venir — c'est pour ça qu'elle est ici et non
 * dans le composant.
 *
 * Convention : `right` est l'offset CSS `right` dans le repère de l'ancre
 * (0 = bord droit du panneau aligné sur celui de l'ancre ; NÉGATIF = poussé
 * vers la droite). Il n'est jamais POSITIF — un panneau ne se décale pas vers
 * la gauche de son ancre, il n'y gagnerait rien.
 */

export type PopoverBox = {
  readonly right: number;
  readonly width: number;
};

export type PopoverPlacement = {
  /** Bord droit de l'ancre, en coordonnées d'écran (`getBoundingClientRect().right`). */
  readonly anchorRight: number;
  readonly viewportWidth: number;
  readonly preferredWidth: number;
  /** Marge minimale gardée des DEUX bords de l'écran. */
  readonly margin: number;
};

export function placePopover(input: PopoverPlacement): PopoverBox {
  const width = Math.min(input.preferredWidth, Math.max(0, input.viewportWidth - 2 * input.margin));
  return { right: Math.min(0, input.anchorRight - width - input.margin), width };
}
