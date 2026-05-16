# Story — Floating Text Edit Mode

**Date** : 2026-05-14
**Cible** : `apps/ios` + `packages/MeeshySDK/Sources/MeeshyUI/Story`
**Statut** : Plan révisé — non implémenté
**Révision** : 2026-05-16 — revue de cohérence vs code réel + précisions UX clavier (voir « Révisions » ci-dessous)
**Driver** : feedback utilisateur smoke-test Section 12 — la vue Texte actuelle (bandeau bas avec sections collapsibles) ne correspond pas à l'UX attendue.

---

## Révisions (2026-05-16)

Revue du plan contre le code réel (`StoryComposerViewModel.swift`, `StoryCanvasUIView.swift`, `StoryModels.swift`, `Controls/`). Changements appliqués :

1. **Bulle « Border » reportée hors V1.** `StoryTextObject` n'a aucun champ `border` (modèle SDK core). L'implémenter exige une extension de modèle + migration `Codable` non chiffrée. La rangée passe de 6 à **5 bulles d'outils** + X. Voir §2.3, §3.1, §3.7, §7.
2. **`mutate(textId:)` n'existe pas.** Helper à créer en Phase 1. Voir §3.2.
3. **Phase 2 simplifiée.** Le canvas a déjà un `singleTapRecognizer` → `onItemTapped`. Pas besoin de toucher `handlePan` ni d'ajouter un callback `onTextTapped`. On patche la branche `.text` du `onItemTapped` existant. Voir §3.3.
4. **Un seul `TextField`.** La preview centrée devient un `Text` non éditable (la version initiale décrivait deux champs éditables sur le même binding — conflit de focus/curseur). Voir §3.4, §3.6.
5. **Sortie clavier explicite + nouveau geste.** Les 4 sorties (X, swipe-down, tap-outside, **re-tap sur le texte en édition**) dismissent toutes le clavier via un funnel unique `keyboardFocus = false`. Voir §2.7, §3.4.
6. **Cleanup code mort.** `ComposerTextFormatBand.swift` + `ComposerTextEditingView.swift` (stubs jamais câblés du cutover floating-controls `a9b4509`) à supprimer. Voir §3.8 bis, Phase 5.
7. **Risque sérialisation en cours d'édition** renforcé (autosave / `granularCanvasSync`). Voir §3.9, Risk #7.

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
- **Swipe-down sur clavier** OU **bulle X** OU **re-tap sur le texte** ferme proprement le mode édition (et le clavier)

---

## 2. Spec UX

### 2.1 États

```
.inactive
  │ user taps a text on canvas
  ↓
.active(textId, expandedTool: nil)
  │ user types  → text content updates (live preview on canvas via binding)
  │ user taps bubble.X       → exit (keyboard dismissed)
  │ user swipe-down keyboard → exit
  │ user taps the editing text again → exit (keyboard dismissed)
  │ user taps dim background → exit (keyboard dismissed)
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
│   │ [Aa] [🎨] [↔] [◇] [⬜] · [X]│   │   ← floating bubbles row (5 outils + X)
│   └─────────────────────────────┘   │
│                                     │
│   ╔═════════════════════════════╗   │
│   ║                             ║   │
│   ║      Texte en édition       ║   │   ← centered text (live preview, re-tap = exit)
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
| Color | `paintpalette.fill` | Palette `StoryTextColors.palette` (couleurs) en cercles 28pt |
| Size | `textformat.size` | Slider 14-60 + valeur live |
| Align | `text.alignleft` (dynamique selon état) | 3 chips Left / Center / Right |
| Background | `a.square.fill` | Toggle none/solid/glass + picker couleur si solid |
| **X** | `xmark` | **Quitte le mode édition ET dismisse le clavier** (destructive red tint) |

Gap entre bulles : 8pt. Distance au texte : 16pt (margin-bottom du row).

> 🔧 **Révision 2026-05-16** — La bulle **Border** (contour none/thin/thick + couleur) est **retirée de la V1** : `StoryTextObject` (`packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`) ne possède aucun champ `border`. L'ajouter implique d'étendre le modèle SDK core et de migrer le `Codable` (tagged union), travail non chiffré dans ce plan. → Reportée (§7). La rangée comporte donc **5 bulles d'outils + 1 bulle X**.

> 🔧 **Révision 2026-05-16** — La bulle **X est la sortie principale et garantie** : son tap doit *toujours* faire descendre le clavier en plus de fermer le mode. Implémentation : le X ne ferme pas directement le mode — il passe par le funnel unique `keyboardFocus = false` (§3.4), ce qui dismisse le clavier puis déclenche `exitTextEditingMode()`. Aucune sortie ne doit laisser un clavier orphelin.

### 2.4 Options panel (sous le texte)

Affiché si `expandedTool != nil`. Slide-up animation 200ms ease-out depuis `bottom` du texte.

Hauteur : ~70-90pt selon contenu. Fond `.ultraThinMaterial` + rounded 16pt + 16pt padding latéral.

Disparaît : tap sur la même bulle (toggle off), tap sur une autre bulle (remplace).

> 🔧 **Révision 2026-05-16** — La version initiale listait aussi « tap-outside du panel » pour replier le panneau. Supprimé car ambigu avec §2.7 #3 (tap sur le fond assombri = sortie complète du mode). Règle nette : **tap sur le dim background = sortie du mode** ; le repli du panneau se fait uniquement via les bulles.

### 2.5 Position du texte au centre

Au moment où `textEditingMode` passe de `.inactive` à `.active(...)` :
- Le texte sur le canvas anime sa position normalisée de `(text.x, text.y)` vers `(0.5, 0.32)` (centré horizontalement, à 32% de la hauteur — laisse 68% pour le clavier + options panel).
- Animation : `spring(response: 0.30, dampingFraction: 0.85)`.
- À l'exit : retour vers `(text.x, text.y)` originaux (stockés dans `editingTextSnapshot`).

Le **scale** et la **rotation** du texte sont temporairement **mises à 1.0 / 0°** pendant l'édition pour rendre le texte lisible et taillable au clavier, puis restaurés au sortie.

> ⚠️ **Révision 2026-05-16** — Ce déplacement mute le *vrai* `StoryTextObject`. Voir §3.9 + Risk #7 : protéger contre une sérialisation (`granularCanvasSync` / autosave / publish) qui surviendrait pendant l'édition et figerait la position centrée. Mitigation requise, pas optionnelle.

### 2.6 Choix de tap simple vs double-tap

**Décision** : `tap simple` entre en mode édition pour les **textes uniquement**.

Médias et stickers : conservent leur comportement (long-press → menu contextuel, double-tap → MeeshyImageEditorView).

Le `bringForegroundToFront` au tap reste actif (l'élément vient devant les autres).

> 🔧 **Révision 2026-05-16** — Avec le tap simple qui entre en édition, le **double-tap sur un texte** devient ambigu. Décision : le double-tap sur un texte se comporte comme un tap simple (entre en mode édition — idempotent, `enterTextEditingMode` re-appelé sur un texte déjà en édition est un no-op grâce au guard). Le `doubleTapRecognizer` du canvas reste réservé aux médias.

### 2.7 Sortie du mode édition

**Quatre** sorties possibles. **Toutes dismissent le clavier** : elles passent par le funnel unique `keyboardFocus = false`, et un seul `onChange(of: keyboardFocus)` déclenche `exitTextEditingMode()`. Ça garantit qu'aucune sortie ne laisse le clavier monté.

1. **Bulle X** (dernière bulle de la rangée flottante) : tap → `keyboardFocus = false` → clavier descend → exit. Tint rouge destructif, découvrable. ✅
2. **Swipe-down sur le clavier** : `@FocusState` passe à `false` de lui-même → `onChange` → exit. Standard iOS. ✅
3. **Tap-outside** : tap sur la zone canvas assombrie (dim background) hors texte/bulles/options → `keyboardFocus = false` → exit. ✅
4. **Re-tap sur le texte en cours d'édition** : un nouveau tap sur la preview centrée du texte pendant l'édition → `keyboardFocus = false` → exit + clavier dismiss. L'utilisateur « retouche » son texte pour le valider/fermer — geste naturel. ✅

> 🔧 **Révision 2026-05-16** — Ajout de la sortie #4 (re-tap sur le texte) à la demande utilisateur. Conséquence directe : la preview centrale **n'est PAS un champ éditable focalisable** (cf. §3.6) — sinon le tap dessus placerait le curseur au lieu de fermer. La frappe passe par un `TextField` caché unique (§3.4). La preview centrale est un `Text` live + `.onTapGesture` de sortie.

Validation : le texte garde tous ses changements (le binding écrit live). Pas de bouton « Annuler » — les changements sont permanents (l'utilisateur peut éditer à nouveau ou supprimer).

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

    var sfSymbol: String { … }
    var accessibilityLabel: String { … }
}
```

> 🔧 **Révision 2026-05-16** — Le case `.border` est retiré (cf. §2.3). `allCases` produit donc 5 bulles d'outils. Si Border est réintroduit (§7), ajouter le case + le champ modèle d'abord.

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
    // Idempotent : déjà en édition sur ce texte → no-op (double-tap, re-entrée).
    if case .active(let current, _) = textEditingMode, current == textId { return }
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

> 🔧 **Révision 2026-05-16** — `mutate(textId:) { t in … }` **n'existe pas** sur `StoryComposerViewModel`. Phase 1 doit le créer. Il reproduit le pattern de mutation `currentEffects` déjà utilisé par `addText()` et `textObjectBinding(for:)` (propage aux observateurs `@Bindable`, déclenche `granularCanvasSync`) :

```swift
private func mutate(textId: String, _ transform: (inout StoryTextObject) -> Void) {
    var effects = currentEffects
    guard let i = effects.textObjects.firstIndex(where: { $0.id == textId }) else { return }
    transform(&effects.textObjects[i])
    currentEffects = effects
}
```

> 🔧 **Révision 2026-05-16** — Le guard d'idempotence en tête de `enterTextEditingMode` couvre le double-tap (§2.6) et toute ré-entrée — sans lui, un 2ᵉ appel écraserait le snapshot par la position déjà centrée `(0.5, 0.32)`, et l'exit ne restaurerait jamais l'originale.

### 3.3 Modifs canvas — routage du tap simple sur texte

> 🔧 **Révision 2026-05-16** — La version initiale proposait de modifier `handlePan.began/.ended` pour détecter un « tap sans drag » et d'exposer un nouveau callback `onTextTapped`. **C'est redondant** : `StoryCanvasUIView` possède déjà un `singleTapRecognizer` dédié (`StoryCanvasUIView.swift:1089-1096`, configuré `require(toFail: doubleTapRecognizer)`) qui appelle déjà `onItemTapped?(id, kind)`. Et `StoryComposerView.canvasCore` (`StoryComposerView.swift:1032`) route déjà `onItemTapped` `.text` vers `bandStateMachine.openFormatPanel(.text, id:)`.

**Correction** : pas de nouveau callback, pas de modif du pan recognizer, pas de modif de `StoryCanvasUIView` ni `StoryCanvasRepresentable`. On change uniquement la branche `.text` du `onItemTapped` existant dans `StoryComposerView.canvasCore` :

```swift
// StoryComposerView.canvasCore — onItemTapped (existant, SEULE la branche .text change)
onItemTapped: { id, kind in
    HapticFeedback.light()
    viewModel.selectedElementId = id
    switch kind {
    case .text:
        viewModel.enterTextEditingMode(textId: id)   // ← AVANT : bandStateMachine.openFormatPanel(.text, id:)
    case .media:
        bandStateMachine.openFormatPanel(.media, id: id)
    case .sticker:
        break
    }
}
```

Idem pour `onItemDoubleTapped` branche `.text` → `viewModel.enterTextEditingMode(textId: id)` (idempotent, cf. §2.6).

`bringForegroundToFront` au tap reste géré côté `StoryCanvasUIView` (inchangé).

> ⚠️ Pendant l'édition, `FloatingTextEditOverlay` couvre le canvas avec un fond assombri hittable (§3.4) — les taps canvas ne re-déclenchent donc pas `onItemTapped`. Le « re-tap sur le texte » (§2.7 #4) est capté par la preview centrée *dans l'overlay*, pas par le canvas.

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
                // 1. Dim canvas behind — tap-outside exits (§2.7 #3)
                Color.black.opacity(0.40)
                    .ignoresSafeArea()
                    .onTapGesture { dismissKeyboardAndExit() }

                VStack(spacing: 0) {
                    Spacer(minLength: 80)

                    // 2. Floating bubble row (above text). The X bubble exits.
                    TextEditFloatingBubbles(
                        expandedTool: expandedTool,
                        onSelectTool: { tool in
                            viewModel.setExpandedTool(viewModel.textEditingMode.expandedTool == tool ? nil : tool)
                            HapticFeedback.light()
                        },
                        onDismiss: { dismissKeyboardAndExit() }   // X bubble (§2.7 #1)
                    )
                    .padding(.horizontal, 16)

                    // 3. Centered text preview — NON-editable Text. Re-tapping
                    //    it exits the mode (§2.7 #4). Typing flows through the
                    //    hidden TextField (item 5), the single editable field.
                    TextEditCenteredPreview(textObject: binding)
                        .padding(.horizontal, 24)
                        .padding(.top, 16)
                        .contentShape(Rectangle())
                        .onTapGesture { dismissKeyboardAndExit() }

                    // 4. Expanded tool options panel (if any)
                    if let tool = expandedTool {
                        TextEditToolOptions(tool: tool, textObject: binding)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    Spacer()
                }

                // 5. Hidden TextField — the SINGLE editable field; drives the
                //    keyboard. Not hit-testable: focus is set programmatically.
                TextField("", text: binding.text)
                    .focused($keyboardFocus)
                    .opacity(0)
                    .frame(width: 1, height: 1)
                    .allowsHitTesting(false)
            }
            .onAppear { keyboardFocus = true }
            .onChange(of: keyboardFocus) { _, isFocused in
                // SINGLE exit funnel: any keyboard dismissal — swipe-down (§2.7 #2),
                // X bubble, tap-outside, re-tap text — lands here → exit edit mode.
                if !isFocused { viewModel.exitTextEditingMode() }
            }
            .animation(.spring(response: 0.30, dampingFraction: 0.85),
                       value: viewModel.textEditingMode)
        }
    }

    /// Unique exit funnel. Resigns the keyboard; `onChange(of: keyboardFocus)`
    /// then runs `exitTextEditingMode()`. Guarantees no exit path leaves the
    /// keyboard up — every exit (X, tap-outside, re-tap text) calls this.
    private func dismissKeyboardAndExit() {
        keyboardFocus = false
    }

    private func textObjectBinding(for id: String) -> Binding<StoryTextObject>? { … }
}
```

> 🔧 **Révision 2026-05-16** — Trois changements vs version initiale :
> 1. **Funnel unique `dismissKeyboardAndExit()`** : X, tap-outside et re-tap-texte ne ferment plus le mode directement — ils mettent `keyboardFocus = false`. Le `onChange(of: keyboardFocus)` est le *seul* point qui appelle `exitTextEditingMode()`. Le swipe-down clavier y arrive aussi naturellement. → impossible de sortir sans dismisser le clavier.
> 2. **Re-tap sur le texte** : `TextEditCenteredPreview` reçoit `.contentShape(Rectangle())` + `.onTapGesture { dismissKeyboardAndExit() }`.
> 3. **Un seul `TextField`** : le champ caché (item 5) est le *seul* champ éditable, marqué `allowsHitTesting(false)` (focus programmatique uniquement). La preview centrée n'est plus un `TextField`.

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
            // 5 tool bubbles (style / color / size / align / background)
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

    /// The X bubble — guaranteed exit. Routes through `onDismiss` which the
    /// parent maps to `dismissKeyboardAndExit()` so the keyboard always drops.
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
            .accessibilityHint("Ferme l'éditeur et masque le clavier")
    }
}
```

`TextEditTool.allCases` produit 5 bulles d'outils ; `dismissBubble()` ajoute la 6ᵉ (X).

### 3.6 Nouveau composant — `TextEditCenteredPreview`

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditCenteredPreview.swift`

Affiche le texte **en lecture seule** (`Text`, **pas** `TextField`) au centre, stylé selon les propriétés courantes du `StoryTextObject` (police via la résolution canvas, couleur, taille, alignement, fond). C'est une **preview live non focalisable** : la frappe passe par le `TextField` caché unique de `FloatingTextEditOverlay` (§3.4 item 5), et ce composant ne fait que refléter `binding.text` à chaque keystroke (le canvas re-render via `slidesEqualForCanvas`).

> 🔧 **Révision 2026-05-16** — La version initiale décrivait ici « un `TextField` éditable au centre ». Corrigé pour 2 raisons : (a) deux `TextField` éditables sur le même `binding.text` (celui-ci + le caché de §3.4) = conflit de focus/curseur ; (b) un champ focalisable empêcherait le geste « re-tap pour sortir » (§2.7 #4) car le tap placerait le curseur. → preview = `Text` non éditable, le tap dessus déclenche la sortie.

Placeholder : si `binding.text` est vide (texte fraîchement créé via `addText()`), afficher un placeholder grisé (« Saisissez votre texte… ») dans le `Text`.

Curseur : optionnel en V1. Si un curseur visible est souhaité, le rendre purement décoratif (barre `|` animée en fin de texte) — il ne reflète pas une position d'insertion réelle.

Le canvas reste visible en fond grisé (option B retenue) — l'utilisateur voit le texte se transformer en temps réel ; l'overlay `Color.black.opacity(0.40)` le rend modestement visible derrière.

### 3.7 Nouveau composant — `TextEditToolOptions`

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift`

Switch sur `TextEditTool` → rend les bons controls :

- **style** : `ScrollView(.horizontal)` de chips style (réutilise la logique existante de `StoryTextEditorView.styleSection`)
- **color** : `ScrollView(.horizontal)` de cercles couleur (réutilise `colorSection`)
- **size** : `Slider` + label (réutilise `sizeSection`)
- **align** : `Picker(.segmented)` Left/Center/Right
- **background** : `Picker` none/solid/glass + color picker conditionnel si solid — mappe sur `StoryTextBackgroundStyle` (`.none` / `.solid(hex:)` / `.glass(radius:)`, déjà dans le SDK)

> 🔧 **Révision 2026-05-16** — Le case `border` est retiré du switch (cf. §2.3, §7). Le case `background` mappe proprement sur l'enum `StoryTextBackgroundStyle` existant — aucune extension modèle nécessaire.

Reuse maximal des bouts du `StoryTextEditorView` actuel : extraire `styleSection` / `colorSection` / `sizeSection` en sous-composants partagés (Phase 4).

> ⚠️ **Cible** : le `StoryTextEditorView` actuel **n'est PAS supprimé** — il reste accessible depuis la liste des textes du `ComposerToolPanelHost.textPanel` (bouton « éditer » → `onEditText` → `bandStateMachine.openFormatPanel(.text, id:)`). Le mode floating est l'entrée par défaut au tap canvas. Deux points d'entrée, deux UX — divergence assumée mais à surveiller post-launch.

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
                .allowsHitTesting(viewModel.textEditingMode == .inactive)
                .animation(.spring(response: 0.30, dampingFraction: 0.85),
                           value: viewModel.textEditingMode)
    if showTopBar {
        topBar.opacity(viewModel.textEditingMode == .inactive ? 1 : 0)
              .allowsHitTesting(viewModel.textEditingMode == .inactive)
              .animation(.spring(response: 0.30, dampingFraction: 0.85),
                         value: viewModel.textEditingMode)
    }
    // NEW: floating edit overlay sits above everything else.
    FloatingTextEditOverlay(viewModel: viewModel)
        .allowsHitTesting(viewModel.textEditingMode != .inactive)
}
```

### 3.8 bis — Cleanup code mort

> 🔧 **Révision 2026-05-16** — `ComposerTextFormatBand.swift` et `ComposerTextEditingView.swift` (dans `Controls/`) sont des **stubs jamais câblés** : créés par le cutover floating-controls (`a9b4509`), leurs boutons sont inertes (`Button(action: {})`, commentaire « wired in Phase 4 »), et `formatPanel(.text)` route vers `StoryTextEditorView`, pas vers eux. Le mode floating de ce plan les rend définitivement obsolètes. → **À supprimer** (Phase 5). Vérifier au préalable qu'aucun autre fichier ne les référence (`grep -rn "ComposerTextFormatBand\|ComposerTextEditingView" packages/MeeshySDK/Sources`).

### 3.9 Cleanup à la fermeture / changement slide / sérialisation

Dans `StoryComposerViewModel.commitCurrentSlide()` ou `setCurrentSlideIndex(_:)`, prepend :

```swift
if textEditingMode != .inactive {
    exitTextEditingMode()  // restore position before slide swap
}
```

Idem dans `viewModel.deleteElement(id:)` — si on supprime le texte en cours d'édition, snapshot devient invalide → `editingTextSnapshot = nil; textEditingMode = .inactive`.

> ⚠️ **Révision 2026-05-16 — sérialisation pendant l'édition.** `enterTextEditingMode` écrit la position centrée `(0.5, 0.32)` + transform reset dans le *vrai* `StoryTextObject` via `currentEffects`. Si `granularCanvasSync`, un autosave, ou un `publish` se déclenche **pendant** l'édition (avant l'exit qui restaure), la position centrée est **sérialisée durablement** — le texte resterait centré après réouverture de la story.
>
> Mitigation obligatoire (choisir une) :
> - **(A)** Tout chemin de commit/sérialisation appelle `exitTextEditingMode()` en pré-étape (restaure la position avant de sérialiser). À étendre à *tous* les points de sérialisation, pas seulement slide-switch — auditer `granularCanvasSync` + le path de publish.
> - **(B)** *(recommandé, plus robuste)* Ne pas muter le modèle : appliquer le recentrage comme **offset purement view-layer** (le canvas / l'overlay dessine le texte édité centré sans toucher `x/y/scale/rotation`). Supprime le snapshot, le restore, et tout risque de sérialisation. Coût : la logique de rendu doit accepter un override de position pour l'élément en édition. À évaluer en Phase 1 — si faisable sans surcoût majeur, préférer (B) à toute l'approche snapshot de §3.2.

---

## 4. Tests

### 4.1 ViewModel — `StoryComposerViewModel_TextEditingTests.swift`

| Test | Comportement |
|------|--------------|
| `test_enterMode_snapshotsOriginalProperties` | enter mode → `editingTextSnapshot` contains original x/y/scale/rotation |
| `test_enterMode_movesTextToCenterAndResetsTransform` | text.x == 0.5, text.y == 0.32, scale == 1.0, rotation == 0 |
| `test_enterMode_alreadyEditingSameText_isNoOp` | re-enter on the same id → snapshot unchanged (idempotence guard) |
| `test_exitMode_restoresOriginalProperties` | exit → x/y/scale/rotation back to snapshot values |
| `test_exitMode_clearsSnapshot` | editingTextSnapshot == nil after exit |
| `test_setExpandedTool_storesInState` | textEditingMode.expandedTool reflects |
| `test_setExpandedTool_whileInactive_noop` | inactive + setExpandedTool → still inactive |
| `test_enterMode_invalidTextId_noop` | id not found → mode stays inactive |
| `test_slideSwitch_autoExitsEditMode` | currentSlideIndex change → mode → inactive + position restored |
| `test_deleteElement_whileEditing_clearsState` | delete edited text → snapshot cleared, mode inactive |
| `test_mutate_helper_propagatesToCurrentEffects` | `mutate(textId:)` writes through `currentEffects` |

### 4.2 UI Snapshot — `FloatingTextEditOverlayTests.swift`

Snapshots :
- Bubbles row inactive (no expanded tool) — light & dark — **5 bulles + X**
- Bubbles row with style expanded — light & dark
- Bubbles row with color expanded — palette visible
- Centered text with each TextEditTool's options panel (style / color / size / align / background) — light & dark

### 4.3 Integration — `StoryComposerTextEditIntegrationTests.swift`

| Test | Comportement |
|------|--------------|
| `test_canvasTapOnText_entersEditMode` | tap on text canvas element → `textEditingMode == .active(id, nil)` |
| `test_canvasTapOnMedia_doesNotEnterTextMode` | tap on image → no text edit mode |
| `test_textTyping_propagatesToCanvas` | type via hidden TextField → currentSlide.textObjects[i].text updates |
| `test_styleChange_propagatesToCanvas` | change style bubble → text on canvas re-renders with new font |
| `test_dismissBubble_exitsModeAndDismissesKeyboard` | tap X bubble → `keyboardFocus == false` → mode inactive + position restored |
| `test_keyboardSwipeDown_exitsMode` | keyboardFocus = false → mode inactive |
| `test_tapOutsideOverlay_exitsMode` | tap on dim background → keyboardFocus false → mode inactive |
| `test_reTapEditingText_exitsModeAndDismissesKeyboard` | tap on the centered preview while editing → keyboardFocus false → mode inactive + position restored |
| `test_allExits_funnelThroughKeyboardFocus` | chaque sortie (X / swipe / tap-outside / re-tap) → `keyboardFocus` repasse `false` avant `exitTextEditingMode` |

> 🔧 **Révision 2026-05-16** — Ajout de `test_reTapEditingText_exitsModeAndDismissesKeyboard`, `test_allExits_funnelThroughKeyboardFocus`, `test_enterMode_alreadyEditingSameText_isNoOp`, `test_mutate_helper_propagatesToCurrentEffects`. `test_dismissBubble` renommé pour vérifier explicitement le dismiss clavier.

---

## 5. Phases d'implémentation

### Phase 1 (foundation, ~1.5h)
- [ ] Add `TextEditingMode` enum + `TextEditTool` enum (5 cases, **pas** de `.border`) to `StoryComposerViewModel.swift`
- [ ] Add the **`mutate(textId:)` private helper** (n'existe pas — cf. §3.2)
- [ ] Add `editingTextSnapshot` private + `enterTextEditingMode` (avec guard d'idempotence) / `exitTextEditingMode` / `setExpandedTool` methods
- [ ] **Évaluer l'option (B) de §3.9** (recentrage view-layer sans mutation modèle) — si simple, l'adopter et adapter §3.2
- [ ] Unit tests for the ViewModel state machine (11 tests above)

### Phase 2 (canvas tap routing, ~0.5h)
- [ ] Patcher la branche `.text` de `onItemTapped` **et** `onItemDoubleTapped` dans `StoryComposerView.canvasCore` → `viewModel.enterTextEditingMode(textId:)`
- [ ] (Aucune modif de `StoryCanvasUIView` / `StoryCanvasRepresentable` / `handlePan` — cf. §3.3)
- [ ] Integration test: tap on text → mode entered ; tap on media → pas de mode texte

### Phase 3 (FloatingTextEditOverlay shell, ~2h)
- [ ] Create `FloatingTextEditOverlay.swift` : dim bg + bubble row + centered preview + hidden TextField + funnel `dismissKeyboardAndExit()`
- [ ] Create `TextEditFloatingBubbles.swift` (5 tool bubbles + dismiss X)
- [ ] Create `TextEditCenteredPreview.swift` (preview `Text` non éditable + `.onTapGesture` de sortie)
- [ ] Mount in `StoryComposerView` ZStack + coordinate visibility (opacity + `allowsHitTesting` + animation) avec FABs/band/topBar
- [ ] Snapshot tests
- [ ] Vérifier : les 4 sorties passent toutes par `keyboardFocus = false`

### Phase 4 (tool options, ~1.5h)
- [ ] Create `TextEditToolOptions.swift` with switch over `TextEditTool` (5 cases)
- [ ] Refactor existing `StoryTextEditorView.styleSection / colorSection / sizeSection` into shared components
- [ ] Reuse those in TextEditToolOptions ; `background` mappe sur `StoryTextBackgroundStyle`
- [ ] Wire bubble taps to setExpandedTool
- [ ] Verify each tool change live-propagates to canvas

### Phase 5 (polish, cleanup + edge cases, ~1h)
- [ ] Slide switch during edit → auto-exit (étendre à **tous** les points de sérialisation — cf. §3.9 mitigation A)
- [ ] Element delete during edit → clear state
- [ ] **Supprimer les stubs morts** `ComposerTextFormatBand.swift` + `ComposerTextEditingView.swift` (après `grep` de non-référencement — §3.8 bis)
- [ ] Accessibility labels on all bubbles ; hint « ferme l'éditeur et masque le clavier » sur X
- [ ] Dynamic Type support on preview
- [ ] VoiceOver flow (focus order : preview → bubbles → dismiss)
- [ ] Haptic feedback : light on bubble tap, medium on dismiss

### Phase 6 (manual QA + smoke, ~30min)
- [ ] Re-run Section 12 Text-related smoke tests
- [ ] Take screenshots in light + dark mode
- [ ] Verify keyboard dismiss interactions — **les 4 sorties** font bien descendre le clavier
- [ ] Verify gesture conflict with canvas pan/pinch (priorities)

**Total estimé** : ~6.5-7h (Phase 2 raccourcie, Border hors scope).

---

## 6. Risques

| # | Risque | Mitigation |
|---|--------|-----------|
| 1 | Conflit de gestures : pan recognizer absorbe le tap simple sur texte | **Résolu par §3.3** : on réutilise le `singleTapRecognizer` existant (déjà `require(toFail: doubleTapRecognizer)`), pas de modif gesture. |
| 2 | Le canvas continue d'afficher le texte aussi → confusion preview vs réel | L'animation `text.x/y → 0.5, 0.32` ramène le canvas texte au centre ; la preview overlay le superpose à la même position → cohérent. Si confusion, masquer la copie canvas pendant l'édition. |
| 3 | Keyboard dismissal : `@FocusState` ne distingue pas swipe-down vs autre dismiss | OK et **voulu** : tout dismiss du clavier = sortie du mode. Le funnel unique `keyboardFocus = false` (§3.4) rend ça déterministe — X, tap-outside et re-tap-texte y passent aussi. |
| 4 | Animation jitter quand bubble expanded change rapidement | Limit `setExpandedTool` à 1 toggle / 150ms via debounce light. |
| 5 | Position d'édition 0.32 collisionne avec status bar sur petits iPhones (SE) | Calculer `editingY = max(0.20, (statusBarHeight + 60) / canvasHeight)` dynamiquement. |
| 6 | Performance : re-render canvas à chaque keystroke | `slidesEqualForCanvas` détecte text change → re-render. Pour textes longs, debounce 80ms le binding write côté `FloatingTextEditOverlay`. |
| 7 | **Sérialisation pendant l'édition** : autosave / `granularCanvasSync` / publish fige la position centrée `(0.5, 0.32)` | **Critique** — cf. §3.9. Option (A) : tout commit appelle `exitTextEditingMode()` en pré-étape (auditer *tous* les points). Option (B, recommandée) : recentrage view-layer sans muter le modèle. Risk #7 couvre aussi le force-quit (snapshot perdu). |
| 8 | Deux `TextField` sur le même binding (preview + caché) → curseur/focus cassés | **Résolu par §3.6** : un seul champ éditable (le caché) ; la preview est un `Text` non éditable. |

---

## 7. Hors scope (Phase 2 future)

- **Bulle « Border »** (contour none/thin/thick + couleur) : `StoryTextObject` n'a aucun champ `border` (`StoryModels.swift`, modèle SDK core). L'ajouter exige une extension du modèle + migration `Codable` (tagged union) côté SDK, non chiffrée dans ce plan. → Reportée. Réintroduction : ajouter le champ modèle + le case `TextEditTool.border` + le case dans `TextEditToolOptions`.
- Pinch in/out **sur le canvas** pour redimensionner texte pendant édition — pour cette V1, le slider Size suffit.
- Long-press sur texte → menu contextuel (Modifier / Dupliquer / Supprimer) — déjà présent dans le menu canvas global, on conserve.
- Animation custom du texte (entrance / exit) — la timeline panel gère ça, hors mode édition.
- Multi-line text editing avec retours à la ligne dans le preview — le `TextField axis: .vertical` du `StoryTextEditorView` actuel le supportait, à porter dans la centered preview.
- Markdown / mention support — non requis ici.
- Curseur d'insertion réel positionnable (tap dans la preview pour placer le curseur) — en V1 le tap dans la preview = sortie ; la frappe est en append seul.

---

## 8. Source of truth & references

- Texte object model : `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` → `StoryTextObject` (textStyle, textColor, textAlign, textBg, fontSize, fontFamily, backgroundStyle — **pas de champ border**) + `StoryTextBackgroundStyle` (`.none` / `.solid(hex:)` / `.glass(radius:)`)
- Font resolution canvas : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift` → `resolveFont(forTextObject:size:)`
- Existing text panel (à conserver pour la liste des textes) : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditorView.swift`
- Canvas tap routing : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` (`singleTapRecognizer` → `onItemTapped`, `:1089`) + `StoryComposerView.swift` `canvasCore` (`:1032`)
- Band state machine : `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandStateMachine.swift`
- Stubs morts à supprimer : `Controls/ComposerTextFormatBand.swift`, `Controls/ComposerTextEditingView.swift`

---

## 9. Self-Review checklist (post-impl)

- [ ] Tap simple sur un texte → mode édition entre, clavier monte, texte centré
- [ ] Texte canvas se déplace de (x,y) original vers (0.5, 0.32) avec spring 250ms
- [ ] Bulles flottantes 36×36 au-dessus du texte, style FAB 60% — **5 bulles d'outils + 1 bulle X**
- [ ] Tap sur Style bubble → carrousel des 5 styles apparaît sous le texte (slide-up)
- [ ] Choix d'un style → texte canvas + preview se mettent à jour live
- [ ] Idem pour Color / Size / Align / Background
- [ ] Tap sur la même bulle → options se referment
- [ ] Tap sur autre bulle → options switchent sans flicker
- [ ] **Bulle X → le clavier descend ET le mode se ferme** (jamais de clavier orphelin)
- [ ] **Swipe-down sur clavier → mode édition se ferme, position restaurée**
- [ ] **Tap-outside (dim bg) → clavier descend + mode édition se ferme**
- [ ] **Re-tap sur le texte en cours d'édition → clavier descend + mode édition se ferme, position restaurée**
- [ ] Les 4 sorties passent par `keyboardFocus = false` (funnel unique) — aucune ne laisse le clavier monté
- [ ] FABs + band + top bar masqués (opacity + non-hittable) pendant édition, restaurés après
- [ ] Changement de slide pendant édition → auto-exit + position restaurée
- [ ] Autosave / publish pendant édition → la position centrée n'est PAS sérialisée (cf. §3.9)
- [ ] Suppression du texte pendant édition → snapshot nettoyé, pas de leak
- [ ] Double-tap sur texte = même effet que tap simple (idempotent)
- [ ] Stubs `ComposerTextFormatBand` / `ComposerTextEditingView` supprimés, build vert
- [ ] Accessibility : VoiceOver lit les bulles, navigation rotor fonctionne
- [ ] Light + dark mode : tous les contrôles lisibles
- [ ] Pas de retain cycle (memory graph propre après 10 cycles enter/exit)
- [ ] Tests passent : 11 ViewModel + 9 integration + snapshots stables
