# Plan C13 — Stickers : une seule source de vérité (passthrough currentEffects)

Date : 2026-07-04 · Chantier : story-sota mission C (it.76) · Réf : `tasks/story-sota-state.md` §C13

## Constat (prouvé it.72/it.76)

- Le canvas lie `$viewModel.currentSlide` (`+Canvas.swift:694`) : gestes (drag/pinch/rotation),
  `deleteElement` (`+Elements.swift:365`), `duplicateElement` (`+Slides.swift:180`) et le
  zOrder mutent `effects.stickerObjects` DIRECTEMENT dans le VM.
- MAIS `mergeEffects` écrase ce champ depuis le `@State` View `stickerObjects`
  (`+SyncRestore.swift:139-140`), rafraîchi UNIQUEMENT au changement de slide
  (`restoreCanvas:84`). Tout sync intermédiaire (couleur de fond, opening, filtre…)
  REVERT les mutations stickers postérieures au dernier slide-switch.
- Dormant tant que les stickers étaient inaccessibles ; C8 (it.72) les a réveillés.

## Cible

Les stickers rejoignent le modèle moderne (parité `textObjects`/`mediaObjects`) :
`currentEffects` est la SEULE source de vérité ; `mergeEffects` ne les authore plus
(passthrough par copie de `current`), et ne dérive plus que la projection legacy
`stickers` (tableau d'emojis, rétro-compat reader).

## Non-objectifs

- Pas de changement du rendu (StorySlideRenderer/SlideMiniPreview lisent déjà effects).
- Pas de format panel sticker (inexistant aujourd'hui).
- Pas de migration de données (le format sérialisé ne change pas).

## Incrément unique (atomique — les deux moitiés sont inséparables)

Un `addSticker` VM sans la bascule merge serait effacé au premier sync ; la bascule sans
le déplacement laisserait le picker écrire un @State devenu lettre morte. Donc UN commit :

1. **VM** : `addSticker(emoji:)` dans `+Elements` (pattern `addText` : append à
   `currentEffects.stickerObjects`, `bringToFront`, décalage en cascade).
2. **mergeEffects** : retire `stickerObjects` de `CanvasAuthoredState` ; passthrough via la
   copie de `current` ; dérive `effects.stickers` (emojis) depuis `current.stickerObjects`
   (choke point unique de la projection legacy).
3. **Purge @State** : déclaration (`StoryComposerView:26`), `resetLocalState`,
   `restoreCanvas`, `buildEffects` arg, granularSync `stickersCount`
   (→ `viewModel.currentEffects`), `composerHasContent`, checks d'emptiness `+Canvas`,
   helper View `addSticker` it.72 (remplacé par l'appel VM), commentaire TopBar.
4. **Tests** : réécrire le pin MergeEffects (« deleted must not resurrect » → nouveau
   contrat passthrough + projection emojis) ; nouveau test VM `addSticker`
   (append + zIndex sommet + cascade) ; test de non-revert : mutation directe
   `currentEffects.stickerObjects[0].x` puis `mergeEffects` → position PRÉSERVÉE.

## Vérification

- Suites : StoryComposerMergeEffectsTests, StoryComposerViewModelTests,
  ComposerLayerActionsTests (zOrder/duplicate/delete stickers), ResetState.
- Build app + simulateur : ajouter 2 stickers → changer la couleur de fond → les stickers
  ne bougent pas ; drag un sticker → changer d'ouverture → position préservée ; delete.

## Pièges connus

- Le test pinné actuel encode l'ANCIEN monde — le réécrire, pas le contourner.
- `effects.stickers` (legacy) doit rester non-nil-cohérent (reader rétro-compat).
- `restoreCanvas` ne doit PAS re-seeder un @State fantôme (supprimé, pas remplacé).
