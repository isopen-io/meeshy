/**
 * LES COTES DU MENU DU MESSAGE — DÉRIVÉES, gardées par `check-curve.mjs`
 * PARTIE 6 (G3 de la spécification #5814), jamais écrites une seconde fois.
 */

/** `MessageOverlayMenu.swift:230` (`nlEmojiBarHeight`). */
export const RAIL_HEIGHT = 52;
/** `MessageOverlayMenu.swift:231` (`nlGap`) — entre le rail et l'aperçu. */
export const RAIL_GAP = 12;
/** `MessageOverlayMenu.swift:236` (`nlMenuGap`) — entre l'aperçu et la liste. */
export const MENU_GAP = 6;
/** `MessageOverlayMenu.swift:242` (`nlSidePadding`). */
export const SIDE_PADDING = 16;
/** `MessageActionsMenu.swift:36` (`menuWidth`). */
export const MENU_WIDTH = 240;
/** `MessageActionsMenu.rowHeight` — la hauteur d'une entrée, celle du menu
 * système. PRÉSERVÉE par #9043 : seule la bande d'emojis s'allonge. */
export const MENU_ROW_HEIGHT = 44;
/** Le CHROME de la liste (rembourrage vertical) — nombre littéral de
 * `MessageActionsMenu.estimatedSize` (`count * scaledRow + 20`), la MÊME
 * estimation dont `MessageOverlayMenu` se sert pour placer le cluster
 * (`nlMenuHeight`). La première écriture posait `+ 8` en dur dans le
 * composant — un nombre qui ne venait de nulle part (revue #5814). */
export const MENU_CHROME = 20;
/** Le rembourrage vertical rendu de la liste — la moitié du chrome. */
export const MENU_PADDING_Y = MENU_CHROME / 2;
/** La hauteur de la zone du menu pour `rows` entrées — miroir de
 * `MessageActionsMenu.estimatedSize(actionCount:)`. */
export function menuListHeight(rows: number): number {
  return Math.max(1, rows) * MENU_ROW_HEIGHT + MENU_CHROME;
}
/** Plancher de réduction de l'aperçu, jamais agrandi — relevé de 0,4
 * (`MessageOverlayMenu.swift:274`) à 0,75 par #11206 : un texte réduit de
 * plus d'un quart n'est plus celui de la rangée. Sous ce plancher, l'aperçu se
 * TRONQUE avec un fondu (`placeMessageMenuCluster`). */
export const PREVIEW_SCALE_FLOOR = 0.75;
/** La hauteur VISIBLE minimale d'un aperçu tronqué. La troncature fait tenir
 * TOUT le cluster — rail, aperçu ET liste — à l'écran au repos ; seul un écran
 * trop court pour garder ce minimum laisse la liste déborder, et c'est alors le
 * glisser vers le haut (#9043, `revealFloor`) qui la dégage. */
export const PREVIEW_MIN_VISIBLE = 120;
/** La hauteur du fondu qui termine un aperçu tronqué. */
export const PREVIEW_CLIP_FADE = 48;
/** L'élévation de l'aperçu depuis sa rangée, et son retour (#11206) — la
 * durée des entrées du cluster (`thread-menu.css`, 260 ms). */
export const PREVIEW_LIFT_MS = 260;
/** Sous `prefers-reduced-motion`, l'élévation devient un fondu. */
export const PREVIEW_FADE_MS = 150;
/** Tuile du rail dessinée à 34 (débord tactile ±5 = cible réelle 44,
 * `tap-target-34`) — iOS dessine 26 (`EmojiReactionPicker.swift:143`), la
 * charte v3.1 impose ≥ 44 px de cible (§ 1.1 tableau, ligne « rail »). */
export const RAIL_TILE = 34;
export const RAIL_TILE_GAP = 10;
/** Le rembourrage horizontal de la capsule (`thread-menu.css`,
 * `.message-menu-rail { padding: 9px 8px }`) — il ENTRE dans la largeur :
 * `box-sizing: border-box` est le défaut du dépôt. */
export const RAIL_PADDING_X = 8;
/** Largeur du rail — miroir `nlEmojiWidth` réduit à 6 tuiles
 * (`MessageOverlayMenu.swift:242`, 300 pour 20 tuiles ; ici 6 tuiles de 34 +
 * le bouton ＋ de 34, séparées de 10, plus le rembourrage :
 * 7 × 34 + 6 × 10 + 2 × 8 = 314). Revue #5814 : sans les 16 px de
 * rembourrage, la boîte mesurait 298 pour un CONTENU de 298 — les sept
 * tuiles se faisaient rétrécir par `flex-shrink` (≈ 31,7 px chacune) et la
 * cible tactile promise (34 dessinés + 5 de débord = 44) n'était plus tenue. */
export const RAIL_WIDTH = 7 * RAIL_TILE + 6 * RAIL_TILE_GAP + 2 * RAIL_PADDING_X;

/** `MessageOverlayMenu.emojiBandLengthFactor` — **la bande d'emojis s'allonge
 * de ×1,4** (directive porteur 2026-10-01, #9043) : la BANDE, pas les tuiles,
 * dont la taille ne change pas ; l'espace gagné se répartit entre elles. */
export const RAIL_LENGTH_FACTOR = 1.4;
/** La largeur rendue du rail — miroir de `MessageOverlayMenu.emojiBandWidth`,
 * bornée à la largeur disponible. */
export function railBandWidth(available: number): number {
  return Math.min(RAIL_WIDTH * RAIL_LENGTH_FACTOR, Math.max(0, available));
}
