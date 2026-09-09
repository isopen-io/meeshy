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
/** `MessageActionsMenu.swift:18` (`@ScaledMetric` rangée). */
export const MENU_ROW_HEIGHT = 44;
/** Le CHROME de la liste (rembourrage vertical + bordures) — nombre littéral
 * de `MessageActionsMenu.estimatedSize` (`:93` : `count * scaledRow + 20`),
 * la MÊME estimation dont `MessageOverlayMenu` se sert pour placer le cluster
 * (`:266`, `nlMenuHeight`). La première écriture posait `+ 8` en dur dans le
 * composant — un nombre qui ne venait de nulle part (revue #5814). */
export const MENU_CHROME = 20;
/** `MessageOverlayMenu.swift:274` — plancher de réduction de l'aperçu, jamais agrandi. */
export const PREVIEW_SCALE_FLOOR = 0.4;
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
