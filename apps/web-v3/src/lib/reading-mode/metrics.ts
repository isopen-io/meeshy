/**
 * LES COTES DE LA RANGÉE PLATE — DÉRIVÉES de
 * `apps/ios/Meeshy/Features/Main/Focal/Core/FocalMetrics.swift`, gardées par
 * `scripts/check-curve.mjs` (même dispositif, même raison, que
 * `src/lib/lens/law.ts` pour `LentilleMetrics.swift` : une comparaison
 * texte-à-texte sur des LITTÉRAUX, jamais une importation de tout le SDK
 * SwiftUI dans une application de 25 Ko).
 *
 * Ce ne sont QUE des géométries (px) — aucune couleur : la charte D-4 vaut
 * pour la palette, dérivée via `packages/design-tokens`. Les tailles de
 * TEXTE (`--text-title` = 13, `--text-bubble` = 15) sont, elles, DÉJÀ des
 * jetons dérivés (`src/styles/ios.css` ← `MeeshyFont.subheadSize`/`.bodySize`
 * via `packages/design-tokens/ios.css`) — ce fichier ne les redéclare pas.
 */

/** `FocalMetrics.Row.paddingVertical` / `.paddingHorizontal` — `3/16`. */
export const ROW_PADDING_VERTICAL = 3;
export const ROW_PADDING_HORIZONTAL = 16;

/** `FocalMetrics.Row.groupTopPadding` — respiration entre deux groupes d'expéditeur. */
export const GROUP_TOP_PADDING = 8;

/** `FocalMetrics.Avatar.size` — la pastille RENDUE (22), distincte du cadre réservé (34). */
export const AVATAR_SIZE = 22;

/**
 * `FocalMetrics.Focus.textIndent` = `Focus.avatarSize`(34) + 7 = 41 —
 * « le retrait de l'élue est retenu pour TOUTES les rangées » (`FocalRow.swift:33-40`) :
 * un retrait qui varie ferait sauter la liste au changement de statut de
 * groupe. CONSTANT, jamais recalculé par rangée.
 */
export const AVATAR_FRAME = 34;
/** Littéral (et non `AVATAR_FRAME + 7`) : `scripts/check-curve.mjs` lit une VALEUR, pas une formule. */
export const TEXT_INDENT = 41;

/** `FocalMetrics.Quote.railWidth` — le filet de citation. */
export const QUOTE_RAIL_WIDTH = 2.5;

/** `FocalMetrics.MetaText.lightOpacity` / `.darkOpacity` — méta discrète (heure, « modifié »). */
export const META_TEXT_OPACITY = 0.55;
