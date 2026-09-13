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

/**
 * LE CLUSTER DU MENU DU MESSAGE (#5814) — port ligne à ligne de
 * `MessageOverlayMenu.swift:230-289` : rail de réactions AU-DESSUS, aperçu
 * du message au centre, liste d'actions AU-DESSOUS. Loi PURE, sans DOM —
 * même discipline que `placePopover`/`placePopoverVertical` ci-dessus.
 *
 * `previewScale` ne dépasse JAMAIS 1 — l'aperçu est réduit, jamais agrandi
 * (`PREVIEW_SCALE_FLOOR` est un PLANCHER) — et `anchorX` suit le bord de
 * l'ancre selon `isMine`, comme `MessageOverlayMenu.swift:255-257`
 * (`isMe ? maxX - w/2 : minX + w/2`).
 */
export type MessageMenuClusterInput = {
  readonly anchor: {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly width: number;
    readonly height: number;
  };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly safe: { readonly top: number; readonly bottom: number };
  readonly menuHeight: number;
  readonly isMine: boolean;
  /** Cotes DÉRIVÉES (`message-menu-metrics.ts`) — jamais des nombres en dur ici. */
  readonly railHeight: number;
  readonly railGap: number;
  readonly menuGap: number;
  readonly sidePadding: number;
  readonly menuWidth: number;
  readonly railWidth: number;
  readonly previewScaleFloor: number;
};

export type MessageMenuClusterPlacement = {
  readonly railTop: number;
  readonly previewTop: number;
  readonly previewScale: number;
  readonly menuTop: number;
  readonly anchorX: number;
  readonly menuLeft: number;
  readonly railLeft: number;
};

export function placeMessageMenuCluster(input: MessageMenuClusterInput): MessageMenuClusterPlacement {
  const { anchor, viewport, safe, menuHeight, isMine } = input;
  const { railHeight, railGap, menuGap, sidePadding, menuWidth, railWidth, previewScaleFloor } = input;

  // `nlAvailTop` / `nlAvailBottom` / `nlAvailable` (:242-244).
  const availTop = safe.top + 12;
  const availBottom = viewport.height - safe.bottom - 12;
  const available = Math.max(160, availBottom - availTop);

  // `nlChrome` / `nlFitScale` (:245-249) — l'aperçu se réduit SEULEMENT.
  const chrome = railHeight + railGap + menuGap + menuHeight;
  const previewScale =
    anchor.height + chrome > available
      ? Math.max(previewScaleFloor, Math.min(1, (available - chrome) / Math.max(1, anchor.height)))
      : 1;

  const previewWidth = anchor.width * previewScale;
  const previewHeight = anchor.height * previewScale;
  const clusterHeight = railHeight + railGap + previewHeight + menuGap + menuHeight;

  // `nlAnchorX` (:255-257).
  const anchorX = isMine ? anchor.right - previewWidth / 2 : anchor.left + previewWidth / 2;

  // `nlDesiredTop` / `nlClusterTop` (:258-259).
  const desiredTop = anchor.top - railHeight - railGap;
  const clusterTop = Math.max(availTop, Math.min(desiredTop, availBottom - clusterHeight));

  const railTop = clusterTop;
  const previewTop = clusterTop + railHeight + railGap;
  const menuTop = previewTop + previewHeight + menuGap;

  const menuLeft = Math.max(sidePadding, Math.min(viewport.width - sidePadding - menuWidth, anchorX - menuWidth / 2));
  const clampedRailWidth = Math.min(railWidth, Math.max(0, viewport.width - 2 * sidePadding));
  const railLeft = Math.max(
    sidePadding,
    Math.min(viewport.width - sidePadding - clampedRailWidth, anchorX - clampedRailWidth / 2),
  );

  return { railTop, previewTop, previewScale, menuTop, anchorX, menuLeft, railLeft };
}
