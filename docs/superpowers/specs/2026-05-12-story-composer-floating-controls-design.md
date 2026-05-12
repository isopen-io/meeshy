# Story Composer — Floating Controls Redesign

**Date** : 2026-05-12
**Auteur** : Brainstorm session (Claude + jcharles)
**Périmètre** : iOS — Bottom controls du composer de stories uniquement
**Statut** : Design validé, plan d'implémentation à produire

---

## 1. Contexte & motivation

Le composer de stories actuel (`StoryComposerView.swift`, 2161 lignes) affiche un `bottomOverlay` permanent dès qu'un outil est sélectionné. Le `ContextualToolbar` (segmented CONTENU/EFFETS + pills) plus le `activeToolPanel` occupent **30 à 40 % de l'écran**, masquant en permanence le canvas pendant l'édition.

**Objectif** : à chaque instant, ne montrer que le strict nécessaire et maximiser la visibilité du canvas. L'utilisateur doit pouvoir :

- accéder rapidement aux outils sans qu'ils volent l'écran
- éditer les éléments existants directement sur le canvas (long-press, double-tap)
- masquer toute l'UI d'un geste pour voir le rendu final

Le redesign introduit **2 FABs flottants** (Contenu / Effets) en bas-gauche, **un bandeau bas multi-état** qui se contracte/déploie au geste, et des **interactions canvas-natives** pour l'édition d'éléments.

**Périmètre cadré** : bottom controls uniquement. L'empty-state picker (l.749) et la top bar (l.491) restent inchangés sauf un binding mineur sur `showTopBar`.

---

## 2. UX flow & règles invariantes

### Règles fondamentales

1. **Empty-picker** : visible uniquement à l'ouverture/création d'un slide (composer vide ET `activeTool == nil`). Une fois quitté, il ne revient pas.
2. **Minimalisme** : à tout instant, ne montrer que ce qui est nécessaire à l'action en cours.
3. **Édition canvas-native** : les éléments déjà placés se manipulent **directement sur le canvas** via long-press (menu) et double-tap (édition).
4. **Canvas plein écran** : un swipe ↓ sur les FABs cache toute l'UI, un tap canvas la ramène.

### Flow utilisateur de référence

```
[Ouverture slide vide]
        ↓
emptyStateLargePicker (4 tuiles : Médias / Texte / Dessin / Fond)
        ↓ tap Média
[Empty-state disparaît, ComposerControlsLayer prend la main]
        ↓
2 FABs visibles (Contenu/Effets) + bandeau bas affichant grille tuiles Contenu
        ↓ tap tuile Média
Bandeau bas devient panel Média (PhotosPicker + element list)
        ↓ user ajoute une photo
Photo apparaît sur canvas
        ↓ swipe ↓ sur bandeau
Bandeau se ferme, FABs restent visibles
        ↓ swipe ↓ sur FAB
FABs disparaissent, top bar disparaît, canvas plein écran
        ↓ tap canvas (zone vide)
FABs + top bar reviennent
        ↓ long-press sur la photo
Menu contextuel : Premier plan / Vers l'avant / Vers l'arrière / Arrière-plan / Dupliquer / Supprimer
        ↓ double-tap sur la photo
Bandeau format média s'ouvre (rotate 90° / scale / crop / filter / dup)
        ↓ tap ✓ done
Bandeau se ferme, retour à l'état précédent (tiles ou hidden)
```

---

## 3. Architecture (Approche B — Extract layer)

### Nouveau fichier

`packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerControlsLayer.swift`

### Hiérarchie

```
ComposerControlsLayer (View)
├── @Bindable var viewModel: StoryComposerViewModel
├── @State var bandStateMachine: BandStateMachine
├── @State var areFabsVisible: Bool = true
├── 12 @Binding éphémères du composer (drawingCanvas, drawingTool,
│   selectedFilter, selectedImage, stickerObjects, fgMediaItem,
│   pickerSelectedTool, editingBgImage, editingElementImage,
│   editingElementVideo, showAudioDocumentPicker, showVoiceRecorderSheet)
└── body:
    ZStack(alignment: .bottomLeading) {
      if bandStateMachine.state != .hidden {
        ComposerBottomBand(state: ..., viewModel: ..., callbacks: ...)
      }
      if areFabsVisible {
        ComposerFABColumn(contenuBadge: ..., effetsBadge: ..., callbacks: ...)
      }
    }
```

### Sous-vues (toutes dans le même fichier, toutes Equatable)

| Vue | Rôle | Inputs primitifs |
|---|---|---|
| `ComposerFABColumn` | 2 FABs Contenu+Effets, bas-gauche | `contenuBadge: Int`, `effetsBadge: Int`, `activeCategory: Category?`, callbacks |
| `ComposerBottomBand` | Conteneur, switch sur state | `state: BandState`, viewModel, callbacks |
| `ComposerTilesGrid` | Grille tuiles 1×4 (contenu) ou 1×2 (effets) | `tiles: [TileSpec]`, `onTapTile`, `onSwipeHorizontal` |
| `ComposerToolPanelHost` | Wrap les panels existants (mediaPanel, drawingPanel…) | `tool`, viewModel + bindings |
| `ComposerTextFormatBand` | Bandeau format texte (input accessory du clavier) | `elementId`, viewModel |
| `ComposerMediaFormatBand` | Bandeau format média | `elementId`, viewModel |

### Composer body après refactor (changement minimal)

Remplace les lignes 274-284 actuelles :

```swift
ZStack {
  Color.black.ignoresSafeArea()
  canvasComposerLayer
  VStack { if showTopBar { topBar }; Spacer() }
  if shouldShowEmptyStateLargePicker {
    VStack { Spacer(); emptyStateLargePicker }
  } else {
    ComposerControlsLayer(viewModel: viewModel, /* 7 bindings éphémères */)
  }
}
```

Le binding `showTopBar` devient `!isCanvasZoomed && areFabsVisible`.

---

## 4. Machine d'états (BandStateMachine)

Extraite en **type pure** (sans SwiftUI), testable isolément.

### Enum

```swift
enum BandState: Equatable {
  case hidden
  case tiles(Category)
  case toolPanel(StoryToolMode)
  case formatPanel(ElementKind, elementId: String)
}

enum Category { case contenu, effets }
enum ElementKind { case text, media }

extension StoryToolMode {
  var category: Category {
    switch self {
    case .media, .drawing, .text, .texture: return .contenu
    case .filters, .timeline: return .effets
    }
  }
}
```

### Machine

```swift
struct BandStateMachine: Equatable {
  private(set) var state: BandState = .hidden
  private var lastCategoryBeforeFormat: Category? = nil

  mutating func tapFAB(_ category: Category) { ... }
  mutating func swipeUpOnFAB(_ category: Category) { ... }   // force open tiles
  mutating func swipeDownOnBand() { ... }                     // -> .hidden
  mutating func swipeHorizontalOnBand() { ... }               // swap category, no-op if .toolPanel
  mutating func tapTile(_ tool: StoryToolMode) { ... }        // -> .toolPanel(tool)
  mutating func openFormatPanel(_ kind: ElementKind, id: String) { ... }
  mutating func closeFormatPanel() { ... }                    // restore previous category or .hidden
  mutating func backFromToolPanel() { ... }                   // -> .tiles(tool.category)
}
```

### Table de transitions

| Depuis | Geste | Vers |
|---|---|---|
| `.hidden` | tap FAB Contenu | `.tiles(.contenu)` |
| `.hidden` | tap FAB Effets | `.tiles(.effets)` |
| `.hidden` | swipe ↑ FAB Contenu | `.tiles(.contenu)` (idempotent) |
| `.hidden` | swipe ↑ FAB Effets | `.tiles(.effets)` (idempotent) |
| `.hidden` | double-tap élément canvas | `.formatPanel(kind, id)` |
| `.tiles(c)` | tap même FAB | `.hidden` |
| `.tiles(c)` | swipe ↓ bandeau | `.hidden` |
| `.tiles(c)` | tap autre FAB | `.tiles(c.swapped)` |
| `.tiles(c)` | swipe ←→ bandeau | `.tiles(c.swapped)` |
| `.tiles(c)` | tap tuile (tool) | `.toolPanel(tool)` + set `viewModel.activeTool = tool` |
| `.tiles(c)` | double-tap élément canvas | `.formatPanel(kind, id)` (sauve `c`) |
| `.toolPanel(t)` | tap ← retour | `.tiles(t.category)` |
| `.toolPanel(t)` | swipe ↓ bandeau | `.tiles(t.category)` |
| `.toolPanel(t)` | tap autre FAB | `.tiles(otherCategory)` |
| `.toolPanel(t)` | swipe ←→ bandeau | **no-op** (collision sliders) |
| `.toolPanel(t)` | double-tap élément canvas | `.formatPanel(kind, id)` (sauve `t.category`) |
| `.formatPanel(...)` | tap ✓ done | retour `lastCategoryBeforeFormat` ou `.hidden` |
| `.formatPanel(...)` | swipe ↓ bandeau | idem |
| `.formatPanel(...)` | tap canvas hors élément | idem |
| `.formatPanel(...)` | double-tap autre élément | `.formatPanel(newKind, newId)` |

### Côté FABs (orthogonal au bandState)

```swift
@State var areFabsVisible: Bool = true
// swipe ↓ sur FAB -> areFabsVisible = false
// tap canvas zone vide -> areFabsVisible.toggle()
// auto-set à false si bandStateMachine.state == .formatPanel(.text, _)
//   (le clavier remplace les FABs en attention)
```

### Compteurs / badges

- **FAB Contenu** = `mediaCount + audioCount + textCount + (hasDrawing ? 1 : 0)`
- **FAB Effets** = `(filterActive ? 1 : 0) + (timelineHasCustomizations ? 1 : 0)`
- À ajouter au VM : `var timelineHasCustomizations: Bool` (computed sur `timelineViewModel.timeline` : keyframes non vides, transition non default, duration non default)

---

## 5. Layout & dimensions

### FABs

```
┌──────────────────────────────────┐
│           CANVAS                  │
│                                  │
│ ┌──┐                              │
│ │🎨│  56×56pt  FAB Effets (top)   │  ← badge top-trailing
│ │②│                                │
│ ├──┤  12pt spacing                 │
│ │▦▦│  56×56pt  FAB Contenu        │  ← badge top-trailing
│ │④│                                │
│ └──┘  16pt leading, bottom+16pt   │
└──────────────────────────────────┘
```

- Diamètre **56pt**, leading **16pt**, bottom `safeAreaBottom + 16pt`
- Style : `.ultraThinMaterial` + 1pt bord `accent.opacity(0.4)` (indigo400 Contenu, indigo300 Effets)
- Icônes (SF Symbol 22pt semibold) : `square.grid.2x2.fill` (Contenu), `wand.and.stars` (Effets)
- Badge : top-trailing offset `(+6, -6)`, `MeeshyColors.indigo400` Capsule, 9pt bold blanc
- État actif (`bandState.activeCategory == self`) : background → `MeeshyColors.brandGradient`, icône blanche

### Bandeau bas (hauteur par état)

| État | Hauteur | Largeur |
|---|---|---|
| `.tiles(.contenu)` | 110pt | full − 16pt h-margin |
| `.tiles(.effets)` | 110pt | full − 16pt h-margin |
| `.toolPanel(.media)` | 220pt | full − 16pt |
| `.toolPanel(.drawing)` | 140pt | full − 16pt |
| `.toolPanel(.text)` | 140pt | full − 16pt |
| `.toolPanel(.texture)` | 160pt | full − 16pt |
| `.toolPanel(.filters)` | 180pt | full − 16pt |
| `.toolPanel(.timeline)` | sheet `.fraction(0.45)` au lieu du bandeau (logique inchangée vs. actuel) | sheet |
| `.formatPanel(.text)` | 110pt + clavier au-dessus (input accessory) | full |
| `.formatPanel(.media)` | 130pt | full − 16pt |

### Style bandeau

- Background : `.ultraThinMaterial` dans `UnevenRoundedRectangle(topLeading: 24, topTrailing: 24)`
- Drag handle : barre 36×4pt grise `opacity 0.4` centrée sur top edge
- Shadow : 0pt offset y, 12pt blur, `black.opacity(0.15)`
- Animation in/out : `UIViewPropertyAnimator` spring `dampingRatio: 0.85`, `duration: 0.3s`, avec `initialVelocity` issu du pan gesture

### Top bar (changement minimal)

```swift
private var showTopBar: Bool { !isCanvasZoomed && areFabsVisible }
```

### Z-index (bas en haut)

1. `Color.black` + `canvasComposerLayer`
2. `emptyStateLargePicker` (si applicable, exclusif avec `ComposerControlsLayer`)
3. `ComposerBottomBand` (dans `ComposerControlsLayer`)
4. `ComposerFABColumn` (dans `ComposerControlsLayer`)
5. `topBar`
6. `canvasZoomResetButton` (overlay)
7. Sheets / fullScreenCover (PhotoEditor, AudioEditor, timeline sheet, …)

---

## 6. Gestes — table complète

### Zones de gestes

| Zone | Geste | Action | Implémentation |
|---|---|---|---|
| **FAB** | Tap | Toggle `bandState` `.hidden` ↔ `.tiles(cat)` ou swap | SwiftUI `Button` |
| **FAB** | Swipe ↑ (translation > 20pt up) | Force `.tiles(cat)` | `UIPanGestureRecognizer` (wrapper) |
| **FAB** | Swipe ↓ (translation > 20pt down) | `areFabsVisible = false` | idem pan recognizer |
| **FAB** | Long-press | Réservé futur (pas d'action v1) | — |
| **Bandeau (zone neutre / drag handle)** | Swipe ↓ | `.hidden` | `UIPanGestureRecognizer` |
| **Bandeau (zone neutre)** | Swipe ←→ | Swap category (no-op si `.toolPanel`) | idem |
| **Bandeau tuile** | Tap | Sélectionne tool → `.toolPanel(tool)` | SwiftUI `Button` |
| **Bandeau (panel list rows)** | Swipe ←→ | `.swipeActions` natifs (delete/edit) | SwiftUI `List` natif |
| **Bandeau panel** | Tap ← retour | `.tiles(category)` | SwiftUI `Button` |
| **Canvas zone vide** | Tap simple | Toggle `areFabsVisible` | SwiftUI `.onTapGesture` |
| **Canvas zone vide** | Pinch / Pan (zoomé) | Existant (inchangé) | — |
| **Canvas élément** | Tap simple | `viewModel.selectedElementId = id` (highlight) | UIKit hit-test existant |
| **Canvas élément** | Double-tap | `bandState.openFormatPanel(kind, id)` | Existant (`onItemDoubleTapped` l.982) |
| **Canvas élément** | Long-press | Menu contextuel (layers/dup/delete) | `UIContextMenuInteraction` (nouveau) |

### Gestion des conflits

1. **Tap canvas vs tap élément** : hit-test CALayer absorbe le tap sur l'élément → pas de propagation au background. Garde-fou existant.
2. **Swipe bandeau vs sliders horizontaux** : swipe ←→ désactivé en `.toolPanel` (où des sliders existent). Activé uniquement en `.tiles`.
3. **`UIPanGestureRecognizer` vs `UITapGestureRecognizer`** : `minimumNumberOfTouches: 1`, `panGesture.shouldRequireFailureOf(tapGesture)` pour que tap < pan.
4. **Pas de geste swipe sur canvas** (pour éviter conflit avec pinch/pan). Toggle FABs = tap simple uniquement.

### Haptics

- Tap FAB : `UIImpactFeedbackGenerator(style: .medium)` (préparé au `viewDidLoad` équivalent)
- Tap tuile : `.medium`
- Swipe ↓ ferme bandeau : `.light`
- Swipe ←→ swap : `.light`
- Long-press menu : `.medium` (déjà standard via `UIContextMenuInteraction`)

---

## 7. Édition canvas-native

### Long-press → menu contextuel

Attaché à `StoryComposerCanvasView` (UIView) via `UIContextMenuInteraction`.

```swift
// Extension de StoryComposerCanvasView
override func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
  guard let item = hitTest(location)?.itemId, let kind = hitTest(location)?.kind else { return nil }
  return UIContextMenuConfiguration(identifier: item as NSString, previewProvider: nil) { _ in
    UIMenu(children: [
      UIMenu(title: "", options: .displayInline, children: [
        UIAction(title: "Premier plan", image: UIImage(systemName: "square.3.layers.3d.top.filled")) { _ in
          self.delegate?.bringToFront(item) },
        UIAction(title: "Vers l'avant", image: UIImage(systemName: "square.2.layers.3d.top.filled")) { _ in
          self.delegate?.bringForward(item) },
        UIAction(title: "Vers l'arrière", image: UIImage(systemName: "square.2.layers.3d.bottom.filled")) { _ in
          self.delegate?.sendBackward(item) },
        UIAction(title: "Arrière-plan", image: UIImage(systemName: "square.3.layers.3d.bottom.filled")) { _ in
          self.delegate?.sendToBack(item) },
      ]),
      UIMenu(title: "", options: .displayInline, children: [
        UIAction(title: "Dupliquer", image: UIImage(systemName: "doc.on.doc")) { _ in
          self.delegate?.duplicate(item) },
        UIAction(title: "Supprimer", image: UIImage(systemName: "trash"), attributes: .destructive) { _ in
          self.delegate?.delete(item) },
      ]),
    ])
  }
}
```

### Nouvelles méthodes du ViewModel

```swift
@MainActor extension StoryComposerViewModel {
  func bringForward(elementId: String)
  func sendBackward(elementId: String)
  func bringToFront(elementId: String)
  func sendToBack(elementId: String)
  func duplicateElement(elementId: String)  // clone +20,+20, new UUID
  func deleteElement(elementId: String)
}
```

Le z-index est déjà géré sur `StoryMediaObject.zIndex`, `StoryTextObject.zIndex`, `StoryStickerObject.zIndex` (cf. tests existants `StoryComposerZIndexTests.swift` à étendre).

### Double-tap → édition

Câblage existant (`onItemDoubleTapped` l.982-993 de `StoryComposerView.swift`) :

```swift
onItemDoubleTapped: { id, kind in
  viewModel.selectedElementId = id
  switch kind {
  case .text:
    bandStateMachine.openFormatPanel(.text, id: id)
    // Le bandeau format texte présente un UITextView qui devient firstResponder,
    // le clavier monte, ComposerTextFormatBand devient inputAccessoryView
  case .media:
    bandStateMachine.openFormatPanel(.media, id: id)
  case .sticker:
    break  // pas d'édition sticker en v1
  }
}
```

### Panel format texte (input accessory du clavier)

```
┌─────────────────────────────────────────┐
│ ✓  [Aa▾font] [B][I][U]  ●●●●  ⇇⇇⇇⇇  │
│ 50pt + safe area                         │
└─────────────────────────────────────────┘
[─── clavier système ───]
```

- ✓ Done : ferme clavier + `bandState.closeFormatPanel()`
- Font picker : tap → sheet `.medium` listant fonts disponibles
- B/I/U : toggle bold/italic/underline → mute `viewModel.currentEffects.textObjects[id]`
- Color : 8 swatches indigo/coral/success/warning/info + 1 bouton `+` pour `UIColorPickerViewController` natif
- Alignment : 4 boutons left/center/right/justify

Implémentation : `UIViewRepresentable` wrappant un `UITextView` avec `inputAccessoryView` = `UIHostingController(rootView: ComposerTextFormatBand)` view.

### Panel format média (bandeau bas standard)

```
┌─────────────────────────────────────────┐
│ ✓  ⟲90°  ⤢scale  ✂crop  ◐filter  ⎘dup │
└─────────────────────────────────────────┘
```

- Rotate 90° : mute `mediaObject.rotation += .pi/2`
- Scale : slider 0.5x – 3x (réutilise `StorySlider`)
- Crop : ouvre `MeeshyMediaEditorView` fullscreen (existant)
- Filter : ouvre sheet avec `StoryFilterPicker` filtrant l'élément (pas le slide)
- Dup : `viewModel.duplicateElement(id)`

---

## 8. Choix bas niveau pour fluidité

| Zone | API | Pourquoi |
|---|---|---|
| Canvas rendering | `CALayer` + Metal (`StoryRenderer`) | Existant, GPU compositing, 120Hz ProMotion |
| Drawing | `PKCanvasView` | Apple Pencil + multi-touch, latence GPU < 9ms |
| Long-press menu | `UIContextMenuInteraction` | Preview natif, transitions iOS, haptic gratuit |
| Édition texte canvas | `UITextView` + `inputAccessoryView` via `UIViewRepresentable` | Bandeau format ancré au clavier sans bug safe-area SwiftUI |
| Gestes bandeau | `UIPanGestureRecognizer` (wrapped) | Velocity / translation précis, exclusivité explicite vs canvas pinch |
| Animation bandeau | `UIViewPropertyAnimator(dampingRatio: 0.85, duration: 0.3)` avec `initialVelocity` du gesture | Continuité geste → mouvement (pas reset SwiftUI implicit) |
| Transform bandeau | `CGAffineTransform(translationX: 0, y: …)` | GPU compositing, pas relayout |
| Haptics | `UIImpactFeedbackGenerator.prepare()` au mount, `.impactOccurred()` à l'event | Warm-up = latence -50ms vs cold trigger |
| Tap/swipe sur tuiles | SwiftUI `Button` + `.onTapGesture` | Suffisant pour static targets |
| Sliders | SwiftUI `Slider` + `.onChange` debounced | Update CALayer côté `StoryRenderer` (déjà GPU) |

**Garde-fous** :
- `allowsHitTesting(false)` sur canvas pendant transitions bandeau (évite double-tap parasite)
- `UIFeedbackGenerator.prepare()` appelé dans `onAppear` du `ComposerControlsLayer`
- Bandeau bouge en `transform.translationY`, pas en `frame` (compositing GPU pur)

---

## 9. Stratégie de bindings

**Décision** : option (a) — bindings explicites.

Les 7+ `@State` du composer body (`drawingCanvas`, `drawingTool`, `selectedFilter`, `selectedImage`, `stickerObjects`, `fgMediaItem`, `pickerSelectedTool`, `editingBgImage`, `editingElementImage`, `editingElementVideo`, `showAudioDocumentPicker`, `showVoiceRecorderSheet`) restent dans `StoryComposerView`. Ils sont passés à `ComposerControlsLayer` via `@Binding`.

Justification :
- `PKCanvasView` et `UIImage?` n'appartiennent pas conceptuellement à un ViewModel (objets UIKit éphémères)
- Reste dans le périmètre cadré ("Bottom controls only")
- Visibilité explicite des dépendances éphémères

**Init verbose acceptée** :

```swift
ComposerControlsLayer(
  viewModel: viewModel,
  drawingCanvas: $drawingCanvas,
  drawingTool: $drawingTool,
  selectedFilter: $selectedFilter,
  selectedImage: $selectedImage,
  stickerObjects: $stickerObjects,
  fgMediaItem: $fgMediaItem,
  pickerSelectedTool: $pickerSelectedTool,
  editingBgImage: $editingBgImage,
  editingElementImage: $editingElementImage,
  editingElementVideo: $editingElementVideo,
  showAudioDocumentPicker: $showAudioDocumentPicker,
  showVoiceRecorderSheet: $showVoiceRecorderSheet
)
```

Un futur refactor (hors scope) pourra extraire ces bindings dans un `ComposerEphemeralState: ObservableObject` séparé du VM principal.

---

## 10. Migration en 4 phases

### Phase 1 — Pure model + tests

- Créer `BandStateMachine.swift` + `BandState.swift` (enums, struct)
- Créer `BandStateTests.swift` (Swift Testing, ~15 tests)
- Ne touche pas l'UI
- **Gate** : tests passent, build SDK passe

### Phase 2 — Layer + sous-vues (code mort temporairement)

- Créer `ComposerControlsLayer.swift` avec toutes sous-vues
- Créer `ComposerControlsLayerTests.swift` (~15 tests, mocks via protocol)
- Le composer body ne l'utilise PAS encore (le code coexiste mais n'est pas câblé)
- **Gate** : tests passent, build app passe, UI inchangée pour l'utilisateur

### Phase 3 — VM extensions + canvas context menu

- Étendre `StoryComposerViewModel` : `bringForward`, `sendBackward`, `bringToFront`, `sendToBack`, `duplicateElement`, `deleteElement` + `timelineHasCustomizations` computed
- Ajouter `UIContextMenuInteraction` à `StoryComposerCanvasView` (UIView)
- Créer `ComposerLayerActionsTests.swift` (~10 tests z-order/dup/delete)
- Étendre `StoryComposerZIndexTests.swift` existant
- **Gate** : tests passent, le long-press menu marche déjà sur canvas (utilisable manuellement même si bandeau pas câblé)

### Phase 4 — Cutover

- Composer body : remplacer `bottomOverlay` par `ComposerControlsLayer`, mettre à jour `showTopBar` computed
- **Supprimer** : `ContextualToolbar.swift` (179 lignes), `bottomOverlay` (l.931-956), `activeToolPanel` (l.1089-1108)
- Mettre à jour `StoryComposerView_ResetStateTests.swift` (le reset doit clear `bandStateMachine.state = .hidden`)
- **Gate** : tests passent (~50-60 nouveaux), build app passe, smoke tests manuels OK (checklist Section 12)

Chaque phase = une PR séparée. Phase 4 est le seul cutover risqué (état mixte interdit).

---

## 11. Stratégie de test

### Test suites nouvelles

1. **`BandStateTests.swift`** (Swift Testing, MeeshyUITests) — ~15 tests pure model
2. **`ComposerControlsLayerTests.swift`** (XCTest @MainActor, MeeshyUITests) — ~15 tests intégration layer ↔ VM
3. **`ComposerLayerActionsTests.swift`** (XCTest, MeeshyUITests) — ~10 tests z-order, duplicate, delete
4. **`ComposerGestureRoutingTests.swift`** (XCTest, MeeshyUITests) — ~10 tests conflits gestes (abstraits)

**Total nouveau** : ~50 tests unitaires.

### Tests à étendre (non régression)

- `StoryComposerViewModelTests.swift` — assurer signature `selectTool` inchangée
- `StoryComposerZIndexTests.swift` — couvrir nouvelles méthodes z-order
- `StoryComposerView_ResetStateTests.swift` — `bandStateMachine` reset à `.hidden` après publish/reset

### Mocks

- `MockStoryComposerViewModel` (existant partiel) → étendre avec call counts pour `bringForward`/`sendBackward`/`bringToFront`/`sendToBack`/`duplicateElement`/`deleteElement`
- Suit pattern CLAUDE.md iOS : `Result<T, Error>` stubs, `var methodCallCount: Int`, `func reset()`

### Build/test gate

- `xcodebuild -scheme MeeshySDK-Package test` (cf. `feedback_meeshysdk_test_scheme.md`)
- `./apps/ios/meeshy.sh build` doit compiler
- Optionnel : `./apps/ios/meeshy.sh test`

---

## 12. Smoke tests manuels (checklist QA)

À valider sur device réel (simulateur OK pour la majorité) :

- [ ] Ouverture slide vide → empty-state picker visible
- [ ] Tap tuile Média → empty-state disparaît, FABs apparaissent en bas-gauche, grille tuiles Contenu déjà déployée
- [ ] Tap tuile Média dans grille → bandeau devient panel Média (PhotosPicker)
- [ ] Tap FAB Effets → bandeau swap vers grille tuiles Effets
- [ ] Swipe ←→ sur grille tuiles → swap Contenu ↔ Effets
- [ ] Swipe ←→ en panel d'outil → ne se passe rien (collision sliders évitée)
- [ ] Swipe ↓ sur bandeau → bandeau se ferme, FABs restent
- [ ] Swipe ↑ sur FAB → ouvre grille tuiles
- [ ] Swipe ↓ sur FAB → FABs disparaissent, top bar disparaît
- [ ] Tap canvas zone vide → FABs + top bar reviennent
- [ ] Long-press sur photo placée → menu Premier plan / Vers l'avant / Vers l'arrière / Arrière-plan / Dupliquer / Supprimer
- [ ] Tap "Premier plan" → photo passe au-dessus des autres éléments
- [ ] Tap "Dupliquer" → clone offset (+20,+20) apparaît
- [ ] Tap "Supprimer" → photo retirée
- [ ] Double-tap sur texte placé → clavier monte + bandeau format au-dessus
- [ ] Modifier font/color/alignment → texte canvas reflète en temps réel
- [ ] Tap ✓ Done → clavier descend, bandeau ferme
- [ ] Double-tap sur photo placée → bandeau format média (rotate, scale, crop, filter, dup)
- [ ] Badges FABs s'incrémentent correctement (ajout texte → +1 sur Contenu)
- [ ] Reset/publish slide → `bandStateMachine.state == .hidden`

---

## 13. Risques & questions ouvertes

### Risques

1. **Conflits gestes complexes** (pan bandeau vs canvas pinch) — mitigé par `UIPanGestureRecognizer` exclusif et `shouldRequireFailureOf` mais à valider sur device
2. **`inputAccessoryView` SwiftUI bridge** — `UIHostingController` comme inputAccessoryView peut avoir des bugs de safe-area iOS 26.x. Fallback : pure UIKit pour ce bandeau seulement
3. **Régression empty-state → bandState init** — le timing 220ms du tap tuile empty-state doit bien set `bandState = .tiles(category)` après le `selectTool`. Test critique
4. **Type-checker SwiftUI** (composer body déjà fragile l.255, l.316) — l'extraction allège le body, devrait améliorer

### Décisions arrêtées (anciennement ouvertes)

1. **Long-press sticker** : menu réduit `Dupliquer` + `Supprimer` uniquement (pas de z-order, les stickers gardent z toujours top par convention actuelle).
2. **Format texte font picker** : 4 fonts système iOS uniquement en v1 — `system` (default), `system rounded`, `system serif`, `system monospaced`. Pas de fonts custom bundle (à voir post-launch).
3. **Swipe ←→ sur tuile de la grille** : non implémenté. Le swipe horizontal sur les rows des listes internes aux panels (`mediaElementList`, `audioElementList`, `textElementList`) utilise `.swipeActions` SwiftUI natif (comportement actuel inchangé). Les tuiles de la grille `ComposerTilesGrid` ne supportent que tap (pas de swipe). Le swipe ←→ au niveau bandeau (swap category) ne s'applique qu'au container, pas aux tuiles elles-mêmes.

### Hors scope (à brainstormer séparément)

- Refactor `@State` éphémères → `ComposerEphemeralState: ObservableObject`
- Repenser top bar (dismiss/preview/publish/overflow)
- Repenser empty-state (déjà OK, pas demandé)
- Geste swipe sur canvas (rejeté pour conflit pinch)

---

## 14. Références

- Fichiers actuels :
  - `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` (2161 lignes)
  - `packages/MeeshySDK/Sources/MeeshyUI/Story/ContextualToolbar.swift` (179 lignes — à supprimer)
  - `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` (1234 lignes)
  - `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryComposerCanvasView.swift` (canvas UIView)
- Tests existants à respecter :
  - `packages/MeeshySDK/Tests/MeeshyUITests/StoryComposerZIndexTests.swift`
  - `packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/StoryComposerView_ResetStateTests.swift`
  - `packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/StoryComposerViewModelTests.swift`
- Specs liées :
  - `docs/superpowers/specs/2026-04-07-story-composer-ui-design.md` (background color + FOND/FRONT)
  - `docs/superpowers/specs/2026-04-17-story-toolbar-unification-design.md` (CONTENU/EFFETS implémenté actuel)
- Mémoire projet :
  - `feedback_meeshyui_default_isolation.md` — MeeshyUI defaultIsolation MainActor
  - `feedback_meeshysdk_test_scheme.md` — utiliser `MeeshySDK-Package` scheme pour tests
  - `feedback_bundle_module_mainactor_isolation.md` — différer `Bundle.module` côté nonisolated init
