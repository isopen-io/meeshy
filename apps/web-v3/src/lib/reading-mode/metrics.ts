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
import type { CSSProperties } from 'react';

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

/**
 * LES COTES DE LA SCÈNE DU FIL (#5648) — l'ÉLECTION d'une rangée au
 * défilement soutenu, DÉRIVÉES de deux sources Swift distinctes et gardées
 * par `scripts/check-curve.mjs` (PARTIE 2 pour `FocalMetrics.swift`, PARTIE 4
 * pour `FocalScrollPerspective.swift`) — même dispositif que les cotes
 * ci-dessus.
 */

/**
 * `FocalScrollPerspective.focusCardCornerRadius` / `.focusCardHorizontalInset`
 * — le rayon et le débord horizontal de la carte teintée qui encadre la
 * rangée élue. L'inset VERTICAL de la carte est `ROW_PADDING_VERTICAL`
 * (`focusCardInnerMargin = Row.paddingVertical`, :188) : pas de constante
 * séparée, la même cote sert les deux.
 */
export const FOCUS_CARD_RADIUS = 18;
export const FOCUS_CARD_HORIZONTAL_INSET = 6;

/**
 * `FocalScrollPerspective.focusCardFillOpacityDark` / `.Light` — la teinte de
 * la carte (accent de la conversation mélangé à cette opacité).
 */
export const FOCUS_CARD_FILL_DARK = 0.16;
export const FOCUS_CARD_FILL_LIGHT = 0.10;

/**
 * `FocalScrollPerspective.focusChipFillOpacity(isDark:isActive:)` — les
 * QUATRE cas du switch (:206-213). Ce lot n'emploie que les deux cas
 * `isActive: false` (le voile des chips de la bande et du tampon, § D-22
 * `apps/web-v3/decisions.md`) : l'ORDRE et l'EFFET du chip « langue
 * affichée » (`isActive: true`) restent l'écart 4 de la spécification #5648
 * (§1.5), hors périmètre — les deux constantes ACTIVE sont gardées par
 * `check-curve.mjs` dès maintenant pour que la dérivation ne se perde pas
 * d'ici que ce chantier les câble.
 */
export const FOCUS_CHIP_FILL_DARK = 0.18;
export const FOCUS_CHIP_FILL_LIGHT = 0.14;
export const FOCUS_CHIP_FILL_ACTIVE_DARK = 0.42;
export const FOCUS_CHIP_FILL_ACTIVE_LIGHT = 0.34;

/** `FocalMetrics.FocusStrip.chipHeight` / `.chipMinWidth` / `.chipInset`. */
export const FOCUS_CHIP_HEIGHT = 24;
export const FOCUS_CHIP_MIN_WIDTH = 32;
export const FOCUS_CHIP_INSET = 4;

/**
 * `FocalScrollPerspective.focusChip` — `.padding(.horizontal, 7)`
 * (`FocalRow.swift:848-864`). Cote iOS comme les autres : elle vit ICI et
 * voyage par `sceneStyleVars()`, jamais en littéral dans `app.css` — cette
 * feuille déclare n'en porter AUCUN.
 */
export const FOCUS_CHIP_PADDING_X = 7;

/** `FocalMetrics.FocusStrip.identityAvatarSize` / `.identityChipHeight` / `.identityNameSize`. */
export const IDENTITY_AVATAR_SIZE = 26;
export const IDENTITY_CHIP_HEIGHT = 34;
export const IDENTITY_NAME_SIZE = 13.5;

/** `FocalMetrics.FocusStrip.flagLimitPlain` / `.flagLimitMagnified`. */
export const FLAG_LIMIT_PLAIN = 3;
export const FLAG_LIMIT_MAGNIFIED = 5;

/**
 * `FocalMetrics.FocusStrip.overhang` / `.identityOverhang` — FORMULES, pas
 * des littéraux Swift (`chipHeight / 2 + focusCardInnerMargin`,
 * `identityChipHeight / 2 + focusCardInnerMargin`) : reprises ici comme
 * calcul plutôt que recopiées en dur, pour que `check-curve.mjs` puisse
 * revérifier la formule (comme il le fait déjà pour `TEXT_INDENT`).
 */
export const FOCUS_STRIP_OVERHANG = FOCUS_CHIP_HEIGHT / 2 + ROW_PADDING_VERTICAL;
export const IDENTITY_OVERHANG = IDENTITY_CHIP_HEIGHT / 2 + ROW_PADDING_VERTICAL;

/** `FocalMetrics.Scene.restDelay` / `.flattenDuration` — SECONDES côté Swift, ×1000 ici. */
export const SCENE_REST_DELAY_MS = 4500;
export const SCENE_FLATTEN_DURATION_MS = 450;

/** `FocalMetrics.Pill.fadeDurationMs` — le fondu du révélé (heure, coches). */
export const REVEAL_FADE_DURATION_MS = 280;

/** `FocalScrollPerspective.FocalMagnificationLaw.sustainedScrollMs` / `.highVelocityThreshold`. */
export const SUSTAINED_SCROLL_MS = 4000;
export const HIGH_VELOCITY_THRESHOLD = 1200;

/**
 * LA SEULE PORTE par laquelle une cote de la scène atteint le CSS — posée
 * sur `<main>` par `thread.tsx`, elle descend par héritage de variable CSS à
 * toute la sous-arborescence (`focal-focus-overlays.tsx`, `app.css`).
 *
 * `--focus-fill-*` et `--focus-chip-fill-*` (et non un `color-mix` calculé en
 * JS) parce que la teinte doit rester REACTIVE au basculement clair/sombre
 * SANS repasser par React : `scheme.ts` bascule une classe sur `<html>`, et
 * `app.css` choisit la variable par sélecteur (`:root.light …`) — exactement
 * le dispositif que ce fichier documente pour `.focus-card` (§5.6 de la
 * spécification #5648). Un composant qui lirait `currentScheme()` en JS
 * resterait figé sur l'ancien schéma tant qu'aucun autre état ne le
 * re-rend — le défaut « bascule à chaud non répercutée » (§ shells, écart c
 * de la mission) que ce lot ne doit pas réintroduire ailleurs dans le fil.
 */
export function sceneStyleVars(): CSSProperties {
  return {
    '--focus-fill-dark': String(FOCUS_CARD_FILL_DARK),
    '--focus-fill-light': String(FOCUS_CARD_FILL_LIGHT),
    '--focus-chip-fill-dark': String(FOCUS_CHIP_FILL_DARK),
    '--focus-chip-fill-light': String(FOCUS_CHIP_FILL_LIGHT),
    '--focus-card-radius': `${FOCUS_CARD_RADIUS}px`,
    '--focus-card-inset-x': `${ROW_PADDING_HORIZONTAL - FOCUS_CARD_HORIZONTAL_INSET}px`,
    '--focus-card-inset-y': `${ROW_PADDING_VERTICAL}px`,
    '--scene-flatten-ms': `${SCENE_FLATTEN_DURATION_MS}ms`,
    '--reveal-fade-ms': `${REVEAL_FADE_DURATION_MS}ms`,
    '--focus-chip-h': `${FOCUS_CHIP_HEIGHT}px`,
    '--focus-chip-minw': `${FOCUS_CHIP_MIN_WIDTH}px`,
    '--focus-chip-inset': `${FOCUS_CHIP_INSET}px`,
    '--focus-chip-pad-x': `${FOCUS_CHIP_PADDING_X}px`,
    /* Les superpositions sont ANCRÉES sur la colonne de contenu (le seul
       ancêtre positionné de la rangée) alors qu'iOS les pose sur le CORPS de
       la rangée, gouttière d'avatar comprise : ce retrait les y ramène
       (`FocalRow.swift:195-212`, overlays de `standardBody`). Sans lui, la
       bande de focus atterrissait SOUS la dernière ligne de texte (mesuré :
       9 px de recouvrement) au lieu de la gouttière, et le chip d'identité
       se posait 41 px à droite de la pastille qu'il remplace. */
    '--focus-text-indent': `${TEXT_INDENT}px`,
    '--focus-identity-overhang': `${IDENTITY_OVERHANG}px`,
    '--focus-strip-overhang': `${FOCUS_STRIP_OVERHANG}px`,
  } as CSSProperties;
}
