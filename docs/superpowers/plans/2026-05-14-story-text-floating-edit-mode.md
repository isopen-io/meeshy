# Story — Floating Text Edit Mode

**Date** : 2026-05-14
**Cible** : `apps/ios` + `packages/MeeshySDK/Sources/MeeshyUI/Story`
**Statut** : Plan — non implémenté
**Driver** : feedback utilisateur smoke-test Section 12 — la vue Texte actuelle (bandeau bas avec sections collapsibles) ne correspond pas à l'UX attendue.

---

## 1. Problème

Le mode d'édition texte actuel est sous-optimal :

1. **Découverte par double-tap** : pour configurer un texte il faut le double-tapper, ce qui n'est pas évident (les utilisateurs essaient un simple tap).
2. **Bandeau bas surchargé** : le `StoryTextEditorView` consomme ~280pt de hauteur sous le canvas avec 4 sections collapsibles (Style / Couleur / Taille / Timing). Le texte que l'utilisateur édite reste invisible derrière le clavier.
3. **Pas de contrôles in-context** : pour changer le style il faut quitter visuellement la zone texte et aller au bandeau bas.
4. **Le texte ne se déplace pas pour rester visible** : pendant l'édition, le texte peut être recouvert par le clavier + le bandeau.
5. **Pas de moyen évident de sortir** : `swipe-down` sur le bandeau ferme mais la métaphore n'est pas claire.

L'utilisateur veut une UX inspirée des composer bars modernes (Instagram Stories, TikTok, message éphémère timer) :

- **Tap** sur un texte → entre en mode édition focalisée
- **Clavier monte** + **texte se déplace au centre haut** (au-dessus du clavier)
- **Bulles flottantes** apparaissent **au-dessus du texte**, style mini-FAB (60% taille FAB principal)
- **Tap sur une bulle** révèle ses options (palette, slider, alignement) **comme le timer éphémère dans la composer bar de messagerie**
- **Swipe-down sur clavier** OU **bulle X** ferme proprement le mode édition

---

## 2. Spec UX

### 2.1 États

```
.inactive
  │ user taps a text on canvas
  ↓
.active(textId, expandedTool: nil)
  │ user types  → text content updates (live preview on canvas via binding)
  │ user taps bubble.X → exit
  │ user swipe-down keyboard → exit
  ↓
.active(textId, expandedTool: .style)
  │ user taps another bubble → switch expandedTool
  │ user taps same bubble → expandedTool = nil
  │ user picks option → option applied (binding writes through), expandedTool stays
  ↓
.inactive  ←  exit (animation 250-300ms)
```

### 2.2 Mise en page floating overlay

```
┌─────────────────────────────────────┐
│ ▒▒ status bar (visible)             │
│                                     │
│         (canvas dimmed @60%)        │
│                                     │
│   ┌─────────────────────────────┐   │
│   │ [Aa] [🎨] [↔] [◇] [⬜] · [X]│   │   ← floating bubbles row
│   └─────────────────────────────┘   │
│                                     │
│   ╔═════════════════════════════╗   │
│   ║                             ║   │
│   ║      Texte en édition       ║   │   ← centered text (live preview)
│   ║                             ║   │
│   ╚═════════════════════════════╝   │
│                                     │
│   ┌─────────────────────────────┐   │
│   │  ◆ ◆ ◆ ◆ ◆ ◆ ◆ ◆ ◆          │   │   ← expandedTool options (color palette, slider, etc.)
│   └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│                                     │
│             KEYBOARD                │   ← system keyboard
│                                     │
└─────────────────────────────────────┘
```

### 2.3 Bulles flottantes

Taille : **36×36 pt** (60% du FAB principal 56×56).
Style : `.ultraThinMaterial` background + indigo accent stroke + icône SF Symbol centrée.
État actif (expandedTool == ce tool) : remplit avec `MeeshyColors.brandGradient`, icône blanche.

| Bulle | Icône | Action / Option panel |
|-------|-------|-----------------------|
| Style | `textformat` | Carrousel des 5 styles (bold/neon/typewriter/handwriting/classic) |
| Color | `paintpalette.fill` | Palette `StoryTextColors.palette` (10 couleurs) en cercles 28pt |
| Size | `textformat.size` | Slider 14-60 + valeur live |
| Align | `text.alignleft` (dynamique selon état) | 3 chips Left / Center / Right |
| Background | `a.square.fill` | Toggle none/solid/glass + picker couleur si solid |
| Border | `square` | Toggle none/thin/thick + picker couleur |
| **X** | `xmark` | **Quitte mode édition** (destructive red tint) |

Gap entre bulles : 8pt. Distance au texte : 16pt (margin-bottom du row).

### 2.4 Options panel (sous le texte)

Affiché si `expandedTool != nil`. Slide-up animation 200ms ease-out depuis `bottom` du texte.

Hauteur : ~70-90pt selon contenu. Fond `.ultraThinMaterial` + rounded 16pt + 16pt padding latéral.

Disparaît : tap sur la même bulle, tap sur une autre bulle (remplace), tap-outside du panel.

### 2.5 Position du texte au centre

Au moment où `textEditingMode` passe de `.inactive` à `.active(...)` :
- Le texte sur le canvas anime sa position normalisée de `(text.x, text.y)` vers `(0.5, 0.32)` (centré horizontalement, à 32% de la hauteur — laisse 68% pour le clavier + options panel).
- Animation : `spring(response: 0.30, dampingFraction: 0.85)`.
- À l'exit : retour vers `(text.x, text.y)` originaux (stockés dans `editingTextOriginalPosition`).

Le **scale** et la **rotation** du texte sont temporairement **mises à 1.0 / 0°** pendant l'édition pour rendre le texte lisible et taillable au clavier, puis restaurés au sortie.

### 2.6 Choix de tap simple vs double-tap

**Décision** : `tap simple` entre en mode édition pour les **textes uniquement**.

Médias et stickers : conservent leur comportement (long-press → menu contextuel, double-tap → MeeshyImageEditorView).

Le `bringForegroundToFront` au tap reste actif (l'élément vient devant les autres).

### 2.7 Sortie du mode édition

Trois sorties possibles :

1. **Swipe-down sur le clavier** : `UIKeyboardWillHide` notification déclenche `exitTextEditingMode()`. ✅ standard iOS.
2. **Tap sur la bulle X** : explicite. ✅ découvrable.
3. **Tap-outside** : tap sur la zone canvas hors du texte/bulles/options ferme aussi le mode. (Comme overlay sheet.) ✅ familier.

Validation : le texte garde tous ses changements (le binding écrit live). Pas de bouton "Annuler" — les changements sont permanents (l'utilisateur peut éditer à nouveau ou supprimer).

---

## 3. Architecture technique

### 3.1 Nouveaux types

#### `TextEditingMode` (dans `StoryComposerViewModel`)

```swift
enum TextEditingMode: Equatable {
    case inactive
    case active(textId: String, expandedTool: TextEditTool? = nil)

    var activeTextId: String? {
        if case .active(let id, _) = self { return id }
        return nil
    }
    var expandedTool: TextEditTool? {
        if case .active(_, let tool) = self { return tool }
        return nil
    }
}
```

#### `TextEditTool` (Sendable enum)

```swift
public enum TextEditTool: String, CaseIterable, Sendable, Equatable {
    case style
    case color
    case size
    case align
    case background
    case border

    var sfSymbol: String { … }
    var accessibilityLabel: String { … }
}
```

### 3.2 Modifs ViewModel

```swift
// StoryComposerViewModel additions
var textEditingMode: TextEditingMode = .inactive

/// Originals snapshotted at edit-mode entry, restored at exit.
private struct EditingTextSnapshot: Equatable {
    let id: String
    let originalX: Double
    let originalY: Double
    let originalScale: Double
    let originalRotation: Double
}
private var editingTextSnapshot: EditingTextSnapshot?

func enterTextEditingMode(textId: String) {
    guard let text = currentEffects.textObjects.first(where: { $0.id == textId }) else { return }
    editingTextSnapshot = EditingTextSnapshot(
        id: textId,
        originalX: text.x,
        originalY: text.y,
        originalScale: text.scale,
        originalRotation: text.rotation
    )
    // Move text to centered editing position (no scale/rotation).
    mutate(textId: textId) { t in
        t.x = 0.5
        t.y = 0.32
        t.scale = 1.0
        t.rotation = 0.0
    }
    textEditingMode = .active(textId: textId, expandedTool: nil)
}

func exitTextEditingMode() {
    guard let snapshot = editingTextSnapshot else {
        textEditingMode = .inactive
        return
    }
    // Restore position/scale/rotation.
    mutate(textId: snapshot.id) { t in
        t.x = snapshot.originalX
        t.y = snapshot.originalY
        t.scale = snapshot.originalScale
        t.rotation = snapshot.originalRotation
    }
    editingTextSnapshot = nil
    textEditingMode = .inactive
}

func setExpandedTool(_ tool: TextEditTool?) {
    guard case .active(let id, _) = textEditingMode else { return }
    textEditingMode = .active(textId: id, expandedTool: tool)
}
```

### 3.3 Modifs canvas

#### `StoryCanvasUIView.handlePan.began` (single-tap detection)

Actuellement `handlePan.began` set `manipulatedItemId` + `bringForegroundToFront`. Ajouter une route texte :

```swift
case .began:
    guard let id = hitTestItem(at: location), …
    manipulatedItemId = id
    bringForegroundToFront(id: id)

    // NEW: texts open the floating editor on touch instead of waiting for
    // a double-tap. Drag is still possible on long-press → if the user
    // actually moves the finger, we cancel the edit-mode-entry intent.
    if let kind = itemKind(forId: id), kind == .text {
        pendingTextEditEntryId = id  // tentative
    }
```

#### Si .changed sans drag suffisant → `pendingTextEditEntryId` reste, et au `.ended` sans translation → enter edit mode

```swift
case .ended:
    if let pendingId = pendingTextEditEntryId,
       abs(recognizer.translation(in: self).x) < 6,
       abs(recognizer.translation(in: self).y) < 6 {
        onTextTapped?(pendingId)  // ← parent SwiftUI consume this
    }
    pendingTextEditEntryId = nil
    manipulatedItemId = nil
    …
```

Nouveau callback exposé :

```swift
public var onTextTapped: ((String) -> Void)?
```

Wired dans `StoryComposerCanvasView.makeUIView`, parent `StoryComposerView.canvasCore` :

```swift
StoryComposerCanvasView(
    slide: $viewModel.currentSlide,
    onItemDoubleTapped: { … },
    onItemDuplicated: { … },
    onTextTapped: { id in
        viewModel.enterTextEditingMode(textId: id)
    }
)
```

### 3.4 Nouveau composant — `FloatingTextEditOverlay`

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Story/FloatingTextEditOverlay.swift`

```swift
public struct FloatingTextEditOverlay: View {
    @Bindable var viewModel: StoryComposerViewModel
    @FocusState private var keyboardFocus: Bool
    @Environment(\.colorScheme) private var colorScheme

    public var body: some View {
        if case .active(let textId, let expandedTool) = viewModel.textEditingMode,
           let binding = textObjectBinding(for: textId) {
            ZStack {
                // 1. Dim canvas behind
                Color.black.opacity(0.40)
                    .ignoresSafeArea()
                    .onTapGesture { viewModel.exitTextEditingMode() }

                VStack(spacing: 0) {
                    Spacer(minLength: 80)

                    // 2. Floating bubble row (above text)
                    TextEditFloatingBubbles(
                        expandedTool: expandedTool,
                        onSelectTool: { tool in
                            viewModel.setExpandedTool(viewModel.textEditingMode.expandedTool == tool ? nil : tool)
                            HapticFeedback.light()
                        },
                        onDismiss: { viewModel.exitTextEditingMode() }
                    )
                    .padding(.horizontal, 16)

                    // 3. Centered text preview (driven by binding)
                    TextEditCenteredPreview(textObject: binding)
                        .padding(.horizontal, 24)
                        .padding(.top, 16)

                    // 4. Expanded tool options panel (if any)
                    if let tool = expandedTool {
                        TextEditToolOptions(tool: tool, textObject: binding)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    Spacer()
                }

                // 5. Hidden TextField to drive the keyboard
                TextField("", text: binding.text)
                    .focused($keyboardFocus)
                    .opacity(0).frame(width: 1, height: 1)
            }
            .onAppear { keyboardFocus = true }
            .onChange(of: keyboardFocus) { _, isFocused in
                // Keyboard dismissed via swipe-down → exit edit mode.
                if !isFocused { viewModel.exitTextEditingMode() }
            }
            .animation(.spring(response: 0.30, dampingFraction: 0.85),
                       value: viewModel.textEditingMode)
        }
    }

    private func textObjectBinding(for id: String) -> Binding<StoryTextObject>? { … }
}
```

### 3.5 Nouveau composant — `TextEditFloatingBubbles`

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditFloatingBubbles.swift`

```swift
struct TextEditFloatingBubbles: View {
    let expandedTool: TextEditTool?
    let onSelectTool: (TextEditTool) -> Void
    let onDismiss: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 8) {
            ForEach(TextEditTool.allCases, id: \.self) { tool in
                bubble(tool: tool, isActive: expandedTool == tool)
                    .onTapGesture { onSelectTool(tool) }
            }
            Spacer()
            dismissBubble()
        }
    }

    private func bubble(tool: TextEditTool, isActive: Bool) -> some View {
        Image(systemName: tool.sfSymbol)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(isActive ? .white : (colorScheme == .dark ? .white : MeeshyColors.indigo950))
            .frame(width: 36, height: 36)
            .background(
                Circle()
                    .fill(isActive ? AnyShapeStyle(MeeshyColors.brandGradient) : AnyShapeStyle(Material.ultraThinMaterial))
                    .overlay(Circle().stroke(MeeshyColors.indigo400.opacity(0.5), lineWidth: 0.8))
                    .shadow(color: .black.opacity(0.15), radius: 6, y: 3)
            )
            .accessibilityLabel(tool.accessibilityLabel)
    }

    private func dismissBubble() -> some View {
        Image(systemName: "xmark")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 36, height: 36)
            .background(
                Circle()
                    .fill(MeeshyColors.error.opacity(0.85))
                    .shadow(color: MeeshyColors.error.opacity(0.4), radius: 5, y: 2)
            )
            .onTapGesture { HapticFeedback.medium(); onDismiss() }
            .accessibilityLabel("Terminer l'édition du texte")
    }
}
```

### 3.6 Nouveau composant — `TextEditCenteredPreview`

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditCenteredPreview.swift`

Affiche un `TextField` éditable au centre, stylé selon les propriétés actuelles du `StoryTextObject`. Sert de PREVIEW live — la frappe au clavier alimente directement le `binding.text`, et le canvas (qui re-render via `slidesEqualForCanvas`) suit.

Le canvas peut soit :
- (A) **être masqué pendant l'édition** (la preview centrale est la seule source visible)
- (B) **rester visible** (le texte sur le canvas continue de se redessiner en fond grisé)

Choix recommandé : **(B)** — l'utilisateur voit le texte se transformer en temps réel à sa position d'édition, sans confusion entre "preview" et "réel". L'overlay sombre `Color.black.opacity(0.40)` rend le canvas modestement visible derrière.

### 3.7 Nouveau composant — `TextEditToolOptions`

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift`

Switch sur `TextEditTool` → rend les bons controls :

- **style** : `ScrollView(.horizontal)` de chips style (réutilise la logique existante de `StoryTextEditorView.styleSection`)
- **color** : `ScrollView(.horizontal)` de cercles couleur (réutilise `colorSection`)
- **size** : `Slider` + label (réutilise `sizeSection`)
- **align** : `Picker(.segmented)` Left/Center/Right
- **background** : `Picker` none/solid/glass + color picker conditionnel
- **border** : toggle thin/thick + color picker

Reuse maximal des bouts du `StoryTextEditorView` actuel. **Cible : le `StoryTextEditorView` actuel n'est PAS supprimé** — il reste accessible depuis la liste des textes (Phase 2). Le mode floating est l'entrée par défaut au tap canvas.

### 3.8 Visibilité coordonnée

Quand `viewModel.textEditingMode != .inactive` :
- `ComposerControlsLayer` (FABs + band) → opacity 0 + non-hittable
- `topBar` → opacity 0 + non-hittable
- `FloatingTextEditOverlay` → opacity 1

Implémentation dans `StoryComposerView` :

```swift
ZStack {
    canvasCore
    bottomRegion.opacity(viewModel.textEditingMode == .inactive ? 1 : 0)
                .animation(.spring(response: 0.30, dampingFraction: 0.85),
                           value: viewModel.textEditingMode)
    if showTopBar {
        topBar.opacity(viewModel.textEditingMode == .inactive ? 1 : 0)
              .animation(.spring(response: 0.30, dampingFraction: 0.85),
                         value: viewModel.textEditingMode)
    }
    // NEW: floating edit overlay sits above everything else.
    FloatingTextEditOverlay(viewModel: viewModel)
        .allowsHitTesting(viewModel.textEditingMode != .inactive)
}
```

### 3.9 Cleanup à la fermeture / changement slide

Dans `StoryComposerViewModel.commitCurrentSlide()` ou `setCurrentSlideIndex(_:)`, prepend :

```swift
if textEditingMode != .inactive {
    exitTextEditingMode()  // restore position before slide swap
}
```

Idem dans `viewModel.deleteElement(id:)` — si on supprime le texte en cours d'édition, snapshot devient invalide → `editingTextSnapshot = nil; textEditingMode = .inactive`.

---

## 4. Tests

### 4.1 ViewModel — `StoryComposerViewModel_TextEditingTests.swift`

| Test | Comportement |
|------|--------------|
| `test_enterMode_snapshotsOriginalProperties` | enter mode → `editingTextSnapshot` contains original x/y/scale/rotation |
| `test_enterMode_movesTextToCenterAndResetsTransform` | text.x == 0.5, text.y == 0.32, scale == 1.0, rotation == 0 |
| `test_exitMode_restoresOriginalProperties` | exit → x/y/scale/rotation back to snapshot values |
| `test_exitMode_clearsSnapshot` | editingTextSnapshot == nil after exit |
| `test_setExpandedTool_storesInState` | textEditingMode.expandedTool reflects |
| `test_setExpandedTool_whileInactive_noop` | inactive + setExpandedTool → still inactive |
| `test_enterMode_invalidTextId_noop` | id not found → mode stays inactive |
| `test_slideSwitch_autoExitsEditMode` | currentSlideIndex change → mode → inactive + position restored |
| `test_deleteElement_whileEditing_clearsState` | delete edited text → snapshot cleared, mode inactive |

### 4.2 UI Snapshot — `FloatingTextEditOverlayTests.swift`

Snapshots :
- Bubbles row inactive (no expanded tool) — light & dark
- Bubbles row with style expanded — light & dark
- Bubbles row with color expanded — palette visible
- Centered text with each TextEditTool's options panel — light & dark

### 4.3 Integration — `StoryComposerTextEditIntegrationTests.swift`

| Test | Comportement |
|------|--------------|
| `test_canvasTapOnText_entersEditMode` | tap on text canvas element → `textEditingMode == .active(id, nil)` |
| `test_canvasTapOnMedia_doesNotEnterTextMode` | tap on image → no text edit mode |
| `test_textTyping_propagatesToCanvas` | type via overlay TextField → currentSlide.textObjects[i].text updates |
| `test_styleChange_propagatesToCanvas` | change style bubble → text on canvas re-renders with new font |
| `test_dismissBubble_exitsMode` | tap X bubble → mode inactive + position restored |
| `test_keyboardSwipeDown_exitsMode` | keyboardFocus = false → mode inactive |
| `test_tapOutsideOverlay_exitsMode` | tap on dim background → mode inactive |

---

## 5. Phases d'implémentation

### Phase 1 (foundation, ~1.5h)
- [ ] Add `TextEditingMode` enum + `TextEditTool` enum to `StoryComposerViewModel.swift`
- [ ] Add `editingTextSnapshot` private + `enterTextEditingMode` / `exitTextEditingMode` / `setExpandedTool` methods
- [ ] Unit tests for the ViewModel state machine (9 tests above)

### Phase 2 (canvas tap routing, ~1h)
- [ ] Add `onTextTapped` callback to `StoryCanvasUIView`
- [ ] Modify `handlePan.began/.ended` to detect "single tap on text without drag" → fire `onTextTapped`
- [ ] Wire callback in `StoryCanvasRepresentable` + `StoryComposerView.canvasCore`
- [ ] Integration test: tap on text → mode entered

### Phase 3 (FloatingTextEditOverlay shell, ~2h)
- [ ] Create `FloatingTextEditOverlay.swift` with dim bg + bubble row + centered preview + hidden TextField
- [ ] Create `TextEditFloatingBubbles.swift` (6 tool bubbles + dismiss X)
- [ ] Create `TextEditCenteredPreview.swift` (preview rendering)
- [ ] Mount in `StoryComposerView` ZStack
- [ ] Coordinate visibility with FABs/band/topBar (opacity + animation)
- [ ] Snapshot tests

### Phase 4 (tool options, ~1.5h)
- [ ] Create `TextEditToolOptions.swift` with switch over `TextEditTool`
- [ ] Refactor existing `StoryTextEditorView.styleSection / colorSection / sizeSection` into shared components
- [ ] Reuse those in TextEditToolOptions
- [ ] Wire bubble taps to setExpandedTool
- [ ] Verify each tool change live-propagates to canvas

### Phase 5 (polish + edge cases, ~1h)
- [ ] Slide switch during edit → auto-exit
- [ ] Element delete during edit → clear state
- [ ] Accessibility labels on all bubbles
- [ ] Dynamic Type support on preview
- [ ] VoiceOver flow (focus order : preview → bubbles → dismiss)
- [ ] Haptic feedback : light on bubble tap, medium on dismiss

### Phase 6 (manual QA + smoke, ~30min)
- [ ] Re-run Section 12 Text-related smoke tests
- [ ] Take screenshots in light + dark mode
- [ ] Verify keyboard dismiss interactions
- [ ] Verify gesture conflict with canvas pan/pinch (priorities)

**Total estimé** : ~7-8h

---

## 6. Risques

| # | Risque | Mitigation |
|---|--------|-----------|
| 1 | Conflit de gestures : pan recognizer absorbe le tap simple sur texte | Use `UITapGestureRecognizer` (single-tap) avec `require(toFail: pan)` côté texte — sinon `.began/.ended` du pan recognizer avec translation threshold. Prototype et A/B. |
| 2 | Le canvas continue d'afficher le texte aussi → confusion preview vs réel | L'animation `text.x/y → 0.5, 0.32` ramène le canvas texte au centre. La preview overlay le superpose à la même position → cohérent. Si la perception reste confuse, basculer sur option (A) (masquer la copie canvas pendant l'édition). |
| 3 | Keyboard dismissal détection : `@FocusState` ne distingue pas swipe-down vs autre dismiss | OK : tout dismiss du keyboard = sortir du mode édition. Cohérent UX. |
| 4 | Animation jitter quand bubble expanded change rapidement | Limit `setExpandedTool` à 1 toggle / 150ms via debounce light. |
| 5 | Position d'édition 0.32 collisionne avec status bar sur petits iPhones (SE) | Calculer `editingY = max(0.20, (statusBarHeight + 60) / canvasHeight)` dynamiquement. |
| 6 | Performance : re-render canvas à chaque keystroke | `slidesEqualForCanvas` détecte text change → re-render. Pour textes longs, debounce 80ms le binding write côté FloatingTextEditOverlay. |
| 7 | Si l'utilisateur force-quit l'app pendant edit mode, `editingTextSnapshot` est perdu → position centrée persistée | Auto-exit dans `viewModel.commit()` + persister `textEditingMode` comme `.inactive` au serialize. |

---

## 7. Hors scope (Phase 2 future)

- Pinch in/out **sur le canvas** pour redimensionner texte pendant édition — pour cette V1, le slider Size suffit.
- Long-press sur texte → menu contextuel (Modifier / Dupliquer / Supprimer) — déjà présent dans le menu canvas global, on conserve.
- Animation custom du texte (entrance / exit) — la timeline panel gère ça, hors mode édition.
- Multi-line text editing avec retours à la ligne dans le preview — le `TextField axis: .vertical` du `StoryTextEditorView` actuel le supportait, à porter dans la centered preview.
- Markdown / mention support — non requis ici.

---

## 8. Source of truth & references

- Texte object model : `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` → `StoryTextObject` (textStyle, textColor, textAlign, textBg, fontSize, fontFamily, backgroundStyle)
- Font resolution canvas : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift` → `resolveFont(forTextObject:size:)` (corrigé 2026-05-14 commit local)
- Existing text panel (à conserver pour Phase 2 — liste des textes) : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditorView.swift`
- Band state machine : `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandStateMachine.swift`
- Canvas gestures : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`

---

## 9. Self-Review checklist (post-impl)

- [ ] Tap simple sur un texte → mode édition entre, clavier monte, texte centré
- [ ] Texte canvas se déplace de (x,y) original vers (0.5, 0.32) avec spring 250ms
- [ ] Bulles flottantes 36×36 au-dessus du texte, style FAB 60%
- [ ] Tap sur Style bubble → carrousel des 5 styles apparaît sous le texte (slide-up)
- [ ] Choix d'un style → texte canvas + preview se mettent à jour live
- [ ] Idem pour Color / Size / Align / Background / Border
- [ ] Tap sur la même bulle → options se referment
- [ ] Tap sur autre bulle → options switchent sans flicker
- [ ] Swipe-down sur clavier → mode édition se ferme, position restaurée
- [ ] Tap sur bulle X → mode édition se ferme, position restaurée
- [ ] Tap-outside (dim bg) → mode édition se ferme
- [ ] FABs + band + top bar masqués pendant édition, restaurés après
- [ ] Changement de slide pendant édition → auto-exit + position restaurée
- [ ] Suppression du texte pendant édition → snapshot nettoyé, pas de leak
- [ ] Accessibility : VoiceOver lit les bulles, navigation rotor fonctionne
- [ ] Light + dark mode : tous les contrôles lisibles
- [ ] Pas de retain cycle (memory graph propre après 10 cycles enter/exit)
- [ ] 16 tests passent (9 ViewModel + 7 integration) + snapshots stable
