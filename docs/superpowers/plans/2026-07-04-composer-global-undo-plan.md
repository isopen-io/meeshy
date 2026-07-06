# Plan C9 — Undo/redo GLOBAL du composer story (snapshots aux choke points)

Date : 2026-07-04 · Chantier : story-sota mission C (it.80) · Réf : `tasks/story-sota-state.md` §C9

## Constat

- Undo/redo n'existe QUE pour le dessin (`DrawingEditFloatingBubbles` → `+DrawingEditing`)
  et, séparément, DANS la timeline (`CommandStack`, 43 tests, persistance cross-crash E4).
- Tout le reste est IRRÉVERSIBLE : ajout/déplacement/suppression/duplication de texte,
  média, sticker ; fond (couleur, media, transform) ; opening effect ; styles texte ;
  opérations de slides (add/remove/move/duplicate). Seul « annuler » global :
  ⋯ → « Supprimer tous les slides » (destructif !).

## Décision d'architecture : SNAPSHOTS, pas commandes

Le modèle command-based (pattern CommandStack timeline) exigerait de convertir des DIZAINES
de call sites de mutation (VM + gestes canvas + panneaux) — risque élevé de trous silencieux.
Le composer possède déjà un état sérialisable compact et UNIFIÉ : `viewModel.slides`
(`[StorySlide]`, Codable, ~qq Ko sans bitmaps — les médias vivent par CLÉS, les bitmaps dans
`loadedImages`/`loadedVideoURLs` hors snapshot). Et les mutations convergent déjà vers des
CHOKE POINTS existants :
- `syncCurrentSlideEffects()` — TOUTE mutation de panneau/toolbar (granularCanvasSync) ;
- `onItemModified` fin de geste canvas (`.ended` → `rebuildLayers`) ;
- ops structurelles VM : `addSlide/removeSlide/moveSlide/duplicateSlide`.

→ Undo global = pile de snapshots `[StorySlide]` + index, poussée à ces points. Simple,
sans trou par construction (tout ce qui atteint `slides` est couvert), testable pur.

## Incréments

### Inc.1 — `ComposerHistoryStore` (SDK building block pur, TDD)
Générique `HistoryStore<S: Equatable>` (MeeshyUI/Story/Controls ou MeeshySDK) :
`push(_ s: S)` (dédup consécutive, tronque le redo, cap 50), `undo(current:) -> S?`,
`redo(current:) -> S?`, `canUndo/canRedo`. ~60 lignes, suite de tests dédiée
(push/undo/redo/cap/dédup/troncature du redo après push post-undo).

### Inc.2 — Câblage capture (app View/VM)
- Seed : snapshot initial à l'entrée du composer (post-restore draft éventuel).
- `syncCurrentSlideEffects()` : push APRÈS écriture (le sync est déjà discret par
  mutation — pas de coalescing supplémentaire requis ; le dédup absorbe les no-ops).
- Fin de geste canvas : `onItemModified` n'est PAS discret (tick par tick pendant le
  drag) → pousser au `.ended` uniquement (le canvas signale déjà la fin de geste via
  `isGestureActive`/rebuild ; sinon débouncer 300 ms côté View).
- Ops slides (add/remove/move/duplicate) : push dans les 4 méthodes VM.
- HORS périmètre de capture : mutations PENDANT le dessin actif (UX undo dédiée existante) ;
  un snapshot unique à la SORTIE du dessin capture le résultat.

### Inc.3 — Restore
`applySnapshot(s)` : `viewModel.slides = s` + clamp `currentSlideIndex` +
`restoreCanvas(from: currentSlide)` + `loadCurrentSlideIntoTimeline()`.
⚠️ PIÈGE MÉDIAS : `deleteElement`/`removeSlide` PURGENT `loadedImages`/`loadedVideoURLs`
(bitmaps) — un undo de suppression média restaurerait une référence SANS bitmap.
→ Inc.3 différencie : la purge des bitmaps devient PARESSEUSE (les clés orphelines ne
sont purgées qu'à l'éviction du snapshot le plus ancien de la pile, ou au dismiss).
Vérifier le coût mémoire réel (les bitmaps restent bornés par le cap d'éléments/slide).

### Inc.4 — UI discrète (grammaire C-DIR2)
- **Shake-to-undo natif** (UndoManager-free : intercepter `motionEnded(.motionShake)`)
  → alerte système-like Annuler/Rétablir OU action directe + haptic.
- 2 icônes `arrow.uturn.backward/forward` DANS le header (visibles UNIQUEMENT si
  `canUndo/canRedo` — n'afficher que l'utile), donc seulement en chrome plein.
- Optionnel (à valider user) : swipe 3 doigts gauche/droite (standard iOS édition).

### Inc.5 — Vérif simulateur
Ajouter texte → déplacer → changer fond → undo ×3 (retour exact) → redo ×3 ;
suppression média + undo (bitmap restauré — piège Inc.3) ; add slide + undo.

## Non-objectifs
- Pas de fusion avec le CommandStack timeline (il reste le moteur interne de la sheet ;
  une session timeline committée = UN snapshot global à la fermeture).
- Pas de persistance cross-crash de la pile globale (E4 couvre déjà la timeline ;
  extension possible plus tard via le même blob draft).

## Risques
- Mémoire : 50 × ~5 Ko = négligeable ; bitmaps différés (Inc.3) à surveiller.
- Cohérence zIndexMap/selectedElementId post-restore : réinitialiser la sélection
  (`selectedElementId = nil`, band reset) à chaque undo/redo — simple et sûr.
