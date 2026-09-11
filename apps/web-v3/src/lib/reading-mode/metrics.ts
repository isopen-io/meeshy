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
 * L'OPACITÉ DE LA TRANSCRIPTION D'UN VOCAL (revue #5805) — PAS
 * `META_TEXT_OPACITY`.
 *
 * La transcription est du CONTENU (c'est le texte que le Prisme sert), pas
 * de la méta : lui appliquer l'opacité de l'heure la rendait illisible.
 * Mesuré au navigateur sur `/c/c-medias`, encre `--color-ios-ink` sur le fond
 * de la rangée plate : **3,74:1 en schéma clair** à 0,55 — sous le 4,5:1 de
 * l'AA pour du 13 px. À 0,7 : **6,03:1 en clair, 8,79:1 en sombre**.
 *
 * DÉRIVÉE, pas choisie : c'est l'opacité que `inlineSegmentColor(isPast:)`
 * donne au segment DÉJÀ LU (`AudioPlayerView+Transcription.swift`,
 * `white.opacity(0.7)`). iOS peut descendre à 0,25/0,35 sur les segments
 * NON LUS parce que son karaoké rallume le segment actif en pleine couleur ;
 * la v3.1 rend UN paragraphe, sans karaoké (hors tranche) — il doit donc être
 * lisible AU REPOS, et c'est la teinte « lu » qui décrit cet état-là.
 * Le gate `check-thread-states.mjs` (§ 8, médias) MESURE le rapport dans les
 * deux schémas : ce n'est pas une intention.
 */
export const TRANSCRIPT_TEXT_OPACITY = 0.7;

/**
 * `gridMaxWidth` — LA GRILLE DE VISUELS D'UN MESSAGE (#5805). Cote DÉRIVÉE,
 * mais PAS un littéral de `FocalMetrics.swift` (Q5, § 9 de la spécification
 * #5805) : elle vit dans `FocalAttachmentBlock.swift:46`
 * (`FocalMediaGridLayout.gridMaxWidth`) et `BubbleStandardLayout.swift:177`
 * (`gridMaxWidth`), les DEUX à `300`. Elle n'entre donc PAS dans
 * `FOCAL_MAPPINGS` de `scripts/check-curve.mjs` (qui ne lit que
 * `FocalMetrics.swift`) — une partie dédiée lisant `FocalAttachmentBlock.swift`
 * est laissée au lot « grille 2/3/4+ » (issue compagnon), qui y trouvera
 * quatre cotes à garder plutôt qu'une seule.
 */
export const MEDIA_GRID_MAX_WIDTH = 300;

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

/**
 * `FocalMetrics.Scene.restDelay` / `.flattenDuration` / `.enterDuration` —
 * SECONDES côté Swift, ×1000 ici. `enterDuration` (#5694, écart 2) est
 * PARTAGÉE avec la Lentille : `LentilleSceneActivity.noteScroll` anime
 * littéralement `withAnimation(.easeOut(duration:
 * FocalMetrics.Scene.enterDuration))` — la Lentille ne porte pas sa PROPRE
 * cote d'entrée, elle réutilise celle du Fil (`lens/scene.ts` l'importe
 * d'ici plutôt que d'en recopier une jumelle).
 */
export const SCENE_REST_DELAY_MS = 4500;
export const SCENE_FLATTEN_DURATION_MS = 450;
export const SCENE_ENTER_DURATION_MS = 250;

/** `FocalMetrics.Pill.fadeDurationMs` — le fondu du révélé (heure, coches). */
export const REVEAL_FADE_DURATION_MS = 280;

/**
 * LE STICKER (#5936) — DEUX sources Swift distinctes, comme la SCÈNE
 * ci-dessus (PARTIE 2 vs PARTIE 4 de `check-curve.mjs`) : `Sticker.side`
 * vit dans `FocalMetrics.swift:222-223` (rangée plate), `side`/`emojiBox`
 * dans `BubbleSticker.swift:38,44` (bulle — HORS `FocalMetrics`, une
 * SECONDE source que `check-curve.mjs` PARTIE 9 lit séparément).
 */
export const STICKER_SIDE = 112;
export const BUBBLE_STICKER_SIDE = 160;
export const STICKER_EMOJI_BOX = 60;

/** `FocalScrollPerspective.FocalMagnificationLaw.sustainedScrollMs` / `.highVelocityThreshold`. */
export const SUSTAINED_SCROLL_MS = 4000;
export const HIGH_VELOCITY_THRESHOLD = 1200;

/**
 * LE CHROME DU FIL (#5774, travail 3/3) — DÉRIVÉES de
 * `Focal/Chrome/EdgeHiddenChrome.swift` + `Focal/Core/FocalMetrics.swift:278-286`
 * (`HiddenChrome`) : la course et la durée de l'escamotage vers SON bord
 * (en-tête, composeur, bouton « revenir en bas »). `opacityEnd` (0) n'entre
 * PAS ici — un état pleinement transparent n'est pas une cote à dériver,
 * `thread-scene.css` l'écrit en dur comme il le fait déjà pour `.focal-meta`
 * au repos (ligne 40).
 */
export const HIDDEN_CHROME_EDGE_TRAVEL = 28;
export const HIDDEN_CHROME_EASE_OUT_MS = 250;

/**
 * `MessageDayStickyPlacement.topOffset` (`MessageDayStickyOverlay.swift:19`)
 * — « 60 = padding haut du header (8) + rangée de contrôles (~44) + marge
 * (8) — la pill démarre SOUS le header ». `MessageDayStickyOverlay.swift:65`
 * fixe le fondu à `0.18` s.
 */
export const DAY_PILL_TOP = 60;
export const DAY_PILL_FADE_MS = 180;

/**
 * L'EN-TÊTE DE LA v3.1 EST EN FLUX (`routes/thread.tsx:57-61`) — celui d'iOS
 * FLOTTE au-dessus de la liste, et c'est toute la différence : `topOffset`
 * y est mesuré depuis le haut du CADRE, donc il DOIT franchir la hauteur du
 * header ; ici l'enveloppe du défileur COMMENCE déjà au bord bas du header,
 * cette hauteur est donc DÉJÀ DÉPENSÉE.
 *
 * Ce qui reste à poser dans l'enveloppe est le TROISIÈME terme de
 * l'arithmétique iOS — la marge, et elle seule. Poser `topOffset` entier y
 * descendait la pilule 52 px trop bas : mesuré à `y = 120` au navigateur
 * pendant la revue de #5774, contre `y = 76` sur la cible iOS
 * (`targets/thread.focal.scene.light.a11y.txt`).
 *
 * Les deux premiers termes sont DÉRIVÉS du même doc-comment, jamais
 * ré-inventés : `8` (le padding haut du header) et `44` (la rangée de
 * contrôles) — ce sont exactement `py-2` et `size-11` de
 * `components/thread-header.tsx`.
 */
export const DAY_PILL_HEADER_PADDING = 8;
export const DAY_PILL_HEADER_ROW = 44;
export const DAY_PILL_MARGIN = DAY_PILL_TOP - DAY_PILL_HEADER_PADDING - DAY_PILL_HEADER_ROW;

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

/**
 * LES COTES DU CHROME DU FIL (#5774, travail 3/3) — porte SÉPARÉE de
 * `sceneStyleVars()` : le chrome (en-tête, composeur) vit HORS de `<main>`
 * (des FRÈRES, jamais des descendants — `routes/thread.tsx`), donc ces
 * variables se posent sur l'HÔTE COMMUN des trois (le conteneur d'écran qui
 * porte déjà `--accent`, `withAccent()`), jamais sur `<main>` : une variable
 * CSS personnalisée n'atteint que la sous-arborescence de l'élément qui la
 * déclare.
 */
export function chromeStyleVars(): CSSProperties {
  return {
    '--chrome-edge-travel': `${HIDDEN_CHROME_EDGE_TRAVEL}px`,
    '--chrome-ease-out-ms': `${HIDDEN_CHROME_EASE_OUT_MS}ms`,
    '--day-pill-top': `${DAY_PILL_MARGIN}px`,
    '--day-pill-fade-ms': `${DAY_PILL_FADE_MS}ms`,
  } as CSSProperties;
}
