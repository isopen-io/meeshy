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

/**
 * OÙ TOMBE UN PANNEAU ANCRÉ SUR L'AXE VERTICAL — #5559 défaut 7 : `measure()`
 * (`RowActions`) ne posait `top` qu'à `anchor.bottom + gap`, sans jamais
 * regarder le bas de l'écran. Sur un viewport de 390×640 (un Android
 * d'entrée de gamme, ou tout téléphone en paysage), le menu de la DERNIÈRE
 * rangée débordait de 95 px et deux des quatre lignes devenaient
 * INATTEIGNABLES — et comme le panneau est `position: fixed`, aucun
 * défilement ne les ramène (`scroll` referme même le menu, voir
 * `roving-menu.ts`).
 *
 * Sans mesure DOM de sa propre hauteur : le panneau n'est pas encore monté à
 * l'instant où `measure()` doit DÉCIDER où le monter (portail `RowActions`).
 * L'appelant déduit `estimatedHeight` des cotes qu'il dessine lui-même
 * (nombre de lignes × 44 + rembourrage).
 *
 * `top` est TOUJOURS en coordonnées VIEWPORT (comme `anchorTop`/`anchorBottom`)
 * — le repère d'un `position: fixed`. Un consommateur `position: absolute`
 * (ancré à son propre conteneur, comme `ReadingModeChip`) devrait retrancher
 * la position de ce conteneur avant d'appliquer la valeur ; aucun des deux
 * menus du dépôt n'en a besoin aujourd'hui, `ReadingModeChip` ouvrant toujours
 * près du haut de l'écran.
 */
export type VerticalPopoverBox = {
  readonly top: number;
};

export type VerticalPopoverPlacement = {
  readonly anchorTop: number;
  readonly anchorBottom: number;
  readonly viewportHeight: number;
  /** Hauteur du panneau, DÉDUITE par l'appelant — jamais mesurée au DOM. */
  readonly estimatedHeight: number;
  /** Espace entre l'ancre et le panneau. */
  readonly gap: number;
  /** Marge minimale gardée des DEUX bords (haut et bas) de l'écran. */
  readonly margin: number;
};

export function placePopoverVertical(input: VerticalPopoverPlacement): VerticalPopoverBox {
  const below = input.anchorBottom + input.gap;
  const fitsBelow = below + input.estimatedHeight + input.margin <= input.viewportHeight;
  if (fitsBelow) return { top: below };

  const above = input.anchorTop - input.gap - input.estimatedHeight;
  const fitsAbove = above >= input.margin;
  if (fitsAbove) return { top: above };

  // Ni en dessous ni au-dessus : le panneau excède l'écran des deux côtés —
  // on le RABAT sur la marge du bord bas plutôt que de le laisser déborder
  // d'un côté qu'on aurait pu éviter en partie.
  return { top: Math.max(input.margin, input.viewportHeight - input.estimatedHeight - input.margin) };
}
