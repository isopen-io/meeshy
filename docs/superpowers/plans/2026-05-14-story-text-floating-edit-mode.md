# Story — Floating Text Edit Mode

**Date** : 2026-05-14
**Cible** : `apps/ios` + `packages/MeeshySDK/Sources/MeeshyUI/Story`
**Statut** : Plan révisé — non implémenté
**Révision** : 2026-05-16 — revue de cohérence vs code réel + 3 passes de feedback utilisateur (voir « Révisions »)
**Driver** : feedback utilisateur smoke-test Section 12 — la vue Texte actuelle (bandeau bas avec sections collapsibles) ne correspond pas à l'UX attendue.

---

## Révisions (2026-05-16)

Revue du plan contre le code réel (`StoryComposerViewModel.swift`, `StoryCanvasUIView.swift`, `StoryModels.swift`, `StoryTextLayer.swift`, `Controls/`) + 3 passes de feedback utilisateur. État consolidé :

1. **Bulle « Border » maintenue en V1.** Border / Background / Color sont tous des contrôles de texte de plein droit, décidés par l'utilisateur. `StoryTextObject` n'a pas de champ `border` → extension modèle SDK (`borderColor` + `borderWidth`) + rendu du contour dans `StoryTextLayer`, cadrés en **Phase 0**. V1 = **presets uniquement** (palettes + épaisseurs / transparences préréglées). Voir §2.3, §3.10.
2. **Le champ d'édition centré est un vrai textarea éditable**, pas une preview en lecture seule. Toucher le texte pendant l'édition **positionne le curseur / sélectionne** — ce n'est PAS une sortie. Voir §2.7, §3.4, §3.6.
3. **Texte affiché en 1:1, intégral, avec retour à la ligne.** Pendant l'édition le texte revient à `scale 1.0` / `rotation 0` ET s'affiche à sa **taille réelle de rendu** : multi-ligne, **wrap automatique**, **aucune troncature `…`**, scroll interne si très long. Le bug actuel (texte trop petit, tronqué) est explicitement à corriger. Voir §2.5, §3.6.
4. **Sorties d'édition (3, toutes dismissent le clavier).** Bulle X, swipe-down clavier, tap-outside (fond assombri) → funnel unique `keyboardFocus = false`. Le re-tap sur le texte n'est PAS une sortie (cf. point 2).
5. **`mutate(textId:)` n'existe pas** → helper à créer en Phase 1. Voir §3.2.
6. **Phase 2 simplifiée** : le canvas a déjà `singleTapRecognizer` → `onItemTapped`. On patche la branche `.text` existante, pas de modif de `handlePan`. Voir §3.3.
7. **Cleanup code mort.** `ComposerTextFormatBand.swift` (stub jamais câblé) à supprimer ; `ComposerTextEditingView.swift` (UITextView representable) peut être recyclé comme base du champ éditable. Voir §3.8 bis.
8. **Risque sérialisation pendant l'édition** (autosave / `granularCanvasSync`). Voir §3.9, Risk #7.

---

## 1. Problème

Le mode d'édition texte actuel est sous-optimal :

1. **Découverte par double-tap** : pour configurer un texte il faut le double-tapper, ce qui n'est pas évident (les utilisateurs essaient un simple tap).
2. **Bandeau bas surchargé** : le `StoryTextEditorView` consomme ~280pt de hauteur sous le canvas avec 4 sections collapsibles (Style / Couleur / Taille / Timing). Le texte que l'utilisateur édite reste invisible derrière le clavier.
3. **Pas de contrôles in-context** : pour changer le style il faut quitter visuellement la zone texte et aller au bandeau bas.
4. **Le texte ne se déplace pas pour rester visible** : pendant l'édition, le texte peut être recouvert par le clavier + le bandeau.
5. **Texte trop petit / tronqué pendant l'édition** : le `TextField` actuel du `StoryTextEditorView` cape la police (~20pt) et limite à 1–4 lignes — le texte réel ne se voit pas tel qu'il sera, et un texte long se tronque.
6. **Pas de moyen évident de sortir** : `swipe-down` sur le bandeau ferme mais la métaphore n'est pas claire.

L'utilisateur veut une UX inspirée des composer bars modernes (Instagram Stories, TikTok, message éphémère timer) :

- **Tap** sur un texte → entre en mode édition focalisée
- **Clavier monte** + **texte se déplace au centre haut**, ramené à sa **taille réelle 1:1**, intégralement visible (wrap, pas de troncature)
- Le texte centré est un **vrai champ éditable** : on touche pour positionner le curseur, sélectionner, manipuler comme une zone de texte
- **Bulles flottantes** apparaissent **au-dessus du texte**, style mini-FAB (60% taille FAB principal)
- **Tap sur une bulle** révèle ses options (palette, slider, alignement)
- **Swipe-down sur clavier** OU **bulle X** OU **tap sur le fond assombri** ferme proprement le mode édition (et le clavier)

---

## 2. Spec UX

### 2.1 États

```
.inactive
  │ user taps a text on canvas
  ↓
.active(textId, expandedTool: nil)
  │ user types          → text content updates (live, the centered field IS the text)
  │ user taps the text  → cursor moves / text selection (normal editing — NO exit)
  │ user taps bubble.X       → exit (keyboard dismissed)
  │ user swipe-down keyboard → exit
  │ user taps dim background  → exit (keyboard dismissed)
  ↓
.active(textId, expandedTool: .style)
  │ user taps another bubble → switch expandedTool
  │ user taps same bubble → expandedTool = nil
  │ user picks option → option applied (binding writes through), expandedTool stays,
  │                     keyboard stays up, cursor stays in the field
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
│   │[Aa][🎨][↕][⌖][▨][▢] · [X] │   │   ← floating bubbles row (6 outils + X)
│   └─────────────────────────────┘   │
│                                     │
│   ╔═════════════════════════════╗   │
│   ║  Texte en édition, affiché  ║   │   ← editable textarea, real 1:1 size,
│   ║  en 1:1, qui passe à la     ║   │     wraps to multiple lines,
│   ║  ligne, jamais tronqué…     ║   │     tap = cursor, never truncated
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
| Color | `paintpalette.fill` | Palette `StoryTextColors.palette` (couleurs préréglées) en cercles 28pt |
| Size | `textformat.size` | Slider 14-60 + valeur live |
| Align | `text.alignleft` (dynamique selon état) | 3 chips Left / Center / Right |
| Background | `a.square.fill` | Presets fond : `none` / `glass` / couleurs solides avec transparence préréglée |
| Border | `square` | Presets bord : `none` + couleur × épaisseur (fin / moyen / épais) préréglées |
| **X** | `xmark` | **Quitte le mode édition ET dismisse le clavier** (destructive red tint) |

Gap entre bulles : 8pt. Distance au texte : 16pt (margin-bottom du row).

> **Philosophie V1 — presets uniquement.** Les trois contrôles couleur / fond / bord exposent des **valeurs préréglées**, pas de pickers libres :
> - **Color (texte)** : palette `StoryTextColors.palette` (existante). Modèle `textColor` inchangé.
> - **Background** : presets `none` / `glass` / couleurs solides à transparence préréglée. `StoryTextBackgroundStyle.solid(hex:)` accepte déjà un hex **8 chiffres `RRGGBBAA`** (couleur + alpha) — `parseHexColor` le gère (`StoryTextLayer.swift:249-257`). Aucun changement modèle ni renderer.
> - **Border** : presets `none` + couleur (palette) × épaisseur (fin / moyen / épais). Nécessite l'extension modèle + le renderer de §3.10.
>
> Le modèle reste flexible (couleur = hex arbitraire, épaisseur = `Double`) ; seuls les *choix offerts par l'UI V1* sont des presets — exactement comme `textColor` aujourd'hui (modèle = hex libre, UI = palette). Pickers système et sliders continus → post-V1 (§7).

> **La bulle X est la sortie principale et garantie** : son tap doit *toujours* faire descendre le clavier en plus de fermer le mode. Implémentation : le X passe par le funnel unique `keyboardFocus = false` (§3.4) — aucune sortie ne doit laisser un clavier orphelin.

### 2.4 Options panel (sous le texte)

Affiché si `expandedTool != nil`. Slide-up animation 200ms ease-out depuis `bottom` du texte.

Hauteur : ~70-90pt selon contenu. Fond `.ultraThinMaterial` + rounded 16pt + 16pt padding latéral.

Disparaît : tap sur la même bulle (toggle off), tap sur une autre bulle (remplace).

Pendant qu'on manipule une option (palette, slider…), le **clavier reste monté** et le **curseur reste dans le champ** — l'utilisateur peut enchaîner frappe et formatage sans perdre le focus.

> Le repli du panneau se fait uniquement via les bulles. Un tap sur le fond assombri (dim background) = sortie complète du mode (§2.7 #3), pas un repli de panneau.

### 2.5 Position et taille du texte au centre

Au moment où `textEditingMode` passe de `.inactive` à `.active(...)` :

- **Position** : le texte anime sa position normalisée de `(text.x, text.y)` vers `(0.5, 0.32)` (centré horizontalement, à 32% de la hauteur — laisse 68% pour le clavier + options panel). Animation `spring(response: 0.30, dampingFraction: 0.85)`.
- **Transform 1:1** : `scale → 1.0` et `rotation → 0°`, pour que le texte soit droit et à l'échelle normale, lisible et taillable au clavier.
- **Taille réelle, intégrale, wrappée** : le champ d'édition affiche le texte à sa **taille de rendu réelle** (résolue depuis `fontSize` via la géométrie canvas — voir §3.6), **PAS** une police capée. Le champ est **multi-ligne** : il **passe à la ligne automatiquement** (word-wrap), grandit verticalement selon le contenu, et **ne tronque JAMAIS** (`…` interdit). Si le texte est plus haut que l'espace disponible, le champ **scrolle** en interne (comportement textarea).
- À l'exit : retour vers `(text.x, text.y)` + `scale` + `rotation` originaux (stockés dans `editingTextSnapshot`).

> Le bug actuel (`StoryTextEditorView` : `TextField` à police ≤ 20pt, `lineLimit(1...4)`) tronque les textes longs et les affiche trop petits. Le champ flottant corrige ça : taille 1:1, lignes illimitées, wrap, scroll — jamais de troncature.

### 2.6 Choix de tap simple vs double-tap

**Décision** : `tap simple` entre en mode édition pour les **textes uniquement**.

Médias et stickers : conservent leur comportement (long-press → menu contextuel, double-tap → MeeshyImageEditorView).

Le `bringForegroundToFront` au tap reste actif (l'élément vient devant les autres).

Le **double-tap sur un texte** se comporte comme un tap simple (entre en mode édition — idempotent grâce au guard de `enterTextEditingMode`). Le `doubleTapRecognizer` du canvas reste réservé aux médias.

### 2.7 Sortie du mode édition

**Trois** sorties. **Toutes dismissent le clavier** : elles passent par le funnel unique `keyboardFocus = false`, et un seul `onChange(of: keyboardFocus)` déclenche `exitTextEditingMode()`. Aucune sortie ne laisse le clavier monté.

1. **Bulle X** (dernière bulle de la rangée flottante) : tap → `keyboardFocus = false` → clavier descend → exit. Tint rouge destructif, découvrable. ✅
2. **Swipe-down sur le clavier** : `@FocusState` passe à `false` de lui-même → `onChange` → exit. Standard iOS. ✅
3. **Tap sur le fond assombri** (dim background, hors texte / bulles / options) → `keyboardFocus = false` → exit. ✅

> **Le re-tap sur le texte n'est PAS une sortie.** Pendant l'édition, le champ centré est un vrai champ de texte : toucher le texte **positionne le curseur**, permet de **sélectionner**, de manipuler le contenu au doigt comme une zone de texte (`textarea`). Le clavier reste monté, le mode reste actif. (Correction d'une version antérieure du plan qui faisait du re-tap une sortie — erroné.)

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
    case border

    var sfSymbol: String { … }
    var accessibilityLabel: String { … }
}
```

`allCases` produit 6 bulles d'outils ; l'ordre des cases fixe l'ordre d'affichage. `TextEditTool.border` ne doit pas être livré avant les champs modèle de la Phase 0 (§3.10).

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
    // Idempotent : déjà en édition sur ce texte → no-op (double-tap, ré-entrée).
    if case .active(let current, _) = textEditingMode, current == textId { return }
    guard let text = currentEffects.textObjects.first(where: { $0.id == textId }) else { return }
    editingTextSnapshot = EditingTextSnapshot(
        id: textId,
        originalX: text.x,
        originalY: text.y,
        originalScale: text.scale,
        originalRotation: text.rotation
    )
    // Move text to centered editing position, transform 1:1.
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

> **`mutate(textId:)` n'existe pas** sur `StoryComposerViewModel` — Phase 1 doit le créer. Il reproduit le pattern de mutation `currentEffects` déjà utilisé par `addText()` et `textObjectBinding(for:)` (propage aux observateurs `@Bindable`, déclenche `granularCanvasSync`) :

```swift
private func mutate(textId: String, _ transform: (inout StoryTextObject) -> Void) {
    var effects = currentEffects
    guard let i = effects.textObjects.firstIndex(where: { $0.id == textId }) else { return }
    transform(&effects.textObjects[i])
    currentEffects = effects
}
```

> Le guard d'idempotence en tête de `enterTextEditingMode` couvre le double-tap (§2.6) et toute ré-entrée — sans lui, un 2ᵉ appel écraserait le snapshot par la position déjà centrée `(0.5, 0.32)`, et l'exit ne restaurerait jamais l'originale.

### 3.3 Modifs canvas — routage du tap simple sur texte

`StoryCanvasUIView` possède déjà un `singleTapRecognizer` dédié (`StoryCanvasUIView.swift:1089-1096`, configuré `require(toFail: doubleTapRecognizer)`) qui appelle déjà `onItemTapped?(id, kind)`. Et `StoryComposerView.canvasCore` (`StoryComposerView.swift:1032`) route déjà `onItemTapped` `.text` vers `bandStateMachine.openFormatPanel(.text, id:)`.

**Correction minimale** : pas de nouveau callback, pas de modif du pan recognizer, pas de modif de `StoryCanvasUIView` ni `StoryCanvasRepresentable`. On change uniquement la branche `.text` du `onItemTapped` (et `onItemDoubleTapped`) existant dans `StoryComposerView.canvasCore` :

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

> Pendant l'édition, `FloatingTextEditOverlay` couvre le canvas avec un fond assombri hittable (§3.4) — les taps canvas ne re-déclenchent donc pas `onItemTapped`. Les taps « sur le texte » pendant l'édition atterrissent sur le champ éditable de l'overlay (positionnement curseur — §2.7), pas sur le canvas.

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

                    // 3. Centered EDITABLE text field — real textarea. Tapping it
                    //    moves the cursor / selects text (§2.7). It IS the first
                    //    responder driving the keyboard. Real 1:1 size, wraps,
                    //    never truncates (§2.5, §3.6).
                    TextEditCenteredField(textObject: binding, focused: $keyboardFocus)
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
            }
            .onAppear { keyboardFocus = true }
            .onChange(of: keyboardFocus) { _, isFocused in
                // SINGLE exit funnel: any keyboard dismissal — swipe-down (§2.7 #2),
                // X bubble, tap-outside — lands here → exit edit mode.
                if !isFocused { viewModel.exitTextEditingMode() }
            }
            .animation(.spring(response: 0.30, dampingFraction: 0.85),
                       value: viewModel.textEditingMode)
        }
    }

    /// Unique exit funnel. Resigns the keyboard; `onChange(of: keyboardFocus)`
    /// then runs `exitTextEditingMode()`. Guarantees no exit leaves the
    /// keyboard up. The X bubble and tap-outside both call this.
    private func dismissKeyboardAndExit() {
        keyboardFocus = false
    }

    private func textObjectBinding(for id: String) -> Binding<StoryTextObject>? { … }
}
```

> **Différences clés vs versions antérieures du plan** :
> - **Pas de `TextField` caché.** Le champ centré `TextEditCenteredField` est *lui-même* le champ éditable, focalisable, qui pilote le clavier (`@FocusState` partagé). Un seul champ.
> - **Pas de `.onTapGesture` de sortie sur le champ centré.** Toucher le texte = éditer (curseur / sélection). Seuls le fond assombri et la bulle X déclenchent une sortie.
> - **Funnel unique `dismissKeyboardAndExit()`** : X et tap-outside mettent `keyboardFocus = false` ; `onChange(of: keyboardFocus)` est le seul point qui appelle `exitTextEditingMode()`. Le swipe-down clavier y arrive naturellement. → impossible de sortir sans dismisser le clavier.

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
            // 6 tool bubbles (style / color / size / align / background / border)
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

`TextEditTool.allCases` produit 6 bulles d'outils ; `dismissBubble()` ajoute la 7ᵉ (X).

### 3.6 Nouveau composant — `TextEditCenteredField`

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditCenteredField.swift`

C'est le **champ d'édition principal** : un vrai champ de texte **multi-ligne, éditable**, centré, qui *est* le texte (WYSIWYG). Pas une preview en lecture seule.

Exigences :

- **Éditable comme un textarea** : toucher positionne le curseur, glisser sélectionne, le clavier est piloté par ce champ. `.focused($keyboardFocus)` (binding partagé avec `FloatingTextEditOverlay`).
- **Taille réelle 1:1** : police résolue depuis `textObject.fontSize` mappé design-pixels → points écran via la géométrie canvas (`CanvasGeometry`), pour que le rendu d'édition corresponde exactement au rendu final sur la slide. **Aucun cap de police**, **aucun `minimumScaleFactor`**.
- **Multi-ligne, wrap, zéro troncature** : retour à la ligne automatique (word-wrap), croissance verticale selon le contenu, **jamais** de `…`. Si le texte dépasse la hauteur disponible, scroll interne (textarea).
- **Style WYSIWYG** : applique `textStyle` (police via `storyFont(for:size:)` — `FontStylePicker.swift`), `textColor`, `textAlign`, et reflète live `backgroundStyle` / bord.

**Implémentation recommandée — SwiftUI `TextField` multi-ligne** :

```swift
struct TextEditCenteredField: View {
    @Binding var textObject: StoryTextObject
    var focused: FocusState<Bool>.Binding

    var body: some View {
        TextField("", text: $textObject.text, axis: .vertical)   // axis:.vertical ⇒ wrap, pas de troncature
            .focused(focused)
            .font(storyFont(for: textObject.parsedTextStyle, size: resolvedScreenSize))
            .foregroundColor(Color(hex: textObject.textColor ?? "FFFFFF"))
            .multilineTextAlignment(resolvedAlignment)
            .lineLimit(nil)                                       // lignes illimitées
            .textFieldStyle(.plain)
            // backgroundStyle / bord rendus en arrière-plan ici
    }

    /// fontSize (design-pixels, référentiel 1080) → points écran, 1:1 avec le rendu canvas.
    private var resolvedScreenSize: CGFloat { … }
}
```

`TextField(text:, axis: .vertical)` (iOS 16+) gère nativement : wrap, lignes illimitées, positionnement du curseur au tap, sélection. Pas de troncature avec `axis: .vertical`.

> **Fallback** — si `TextField` n'offre pas une fidélité suffisante (polices custom neon/handwriting, contrôle fin de la sélection, rendu du bord), basculer sur un `UITextView` via `UIViewRepresentable` (`isScrollEnabled = true`, `textContainer.lineBreakMode = .byWordWrapping`, `isEditable = true`). Le fichier mort `ComposerTextEditingView.swift` (§3.8 bis) fournit déjà un `UITextView` representable réutilisable — en retirer le wiring `inputAccessoryView` (inutile : les bulles sont un overlay libre, pas ancré au clavier).

Placeholder : si `textObject.text` est vide (texte fraîchement créé via `addText()`), afficher un placeholder grisé via le 1ᵉʳ argument du `TextField` ou un overlay.

Le canvas reste visible en fond grisé — le texte de la slide (déplacé en `(0.5, 0.32)`, scale 1.0) se redessine en temps réel sous l'overlay.

### 3.7 Nouveau composant — `TextEditToolOptions`

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift`

Switch sur `TextEditTool` → rend les bons controls (presets V1) :

- **style** : `ScrollView(.horizontal)` de chips style (réutilise la logique de `StoryTextEditorView.styleSection`)
- **color** : `ScrollView(.horizontal)` de cercles couleur — palette `StoryTextColors.palette` (réutilise `colorSection`)
- **size** : `Slider` 14-60 + label (réutilise `sizeSection`)
- **align** : `Picker(.segmented)` Left/Center/Right
- **background** : presets `none` / `glass` / couleurs solides — mappe sur `StoryTextBackgroundStyle` (`.none` / `.solid(hex: RRGGBBAA)` / `.glass(radius:)`, déjà dans le SDK). La transparence est portée par l'alpha du hex 8 chiffres.
- **border** : presets `none` + couleur × épaisseur — écrit `borderColor` / `borderWidth` sur `StoryTextObject` (champs ajoutés en Phase 0, §3.10)

Reuse maximal des bouts du `StoryTextEditorView` actuel : extraire `styleSection` / `colorSection` / `sizeSection` en sous-composants partagés (Phase 4).

> **Cible** : le `StoryTextEditorView` actuel **n'est PAS supprimé** — il reste accessible depuis la liste des textes du `ComposerToolPanelHost.textPanel` (bouton « éditer » → `onEditText` → `bandStateMachine.openFormatPanel(.text, id:)`). Le mode floating est l'entrée par défaut au tap canvas. Deux points d'entrée, deux UX — divergence assumée mais à surveiller post-launch.

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

`Controls/ComposerTextFormatBand.swift` et `Controls/ComposerTextEditingView.swift` sont des **stubs jamais câblés** (créés par le cutover floating-controls `a9b4509`, boutons inertes, `formatPanel(.text)` route vers `StoryTextEditorView`).

- **`ComposerTextFormatBand.swift`** → barre de format ancrée au clavier, non utilisée par ce design (les bulles sont un overlay libre). **À supprimer** (Phase 5), après `grep -rn "ComposerTextFormatBand" packages/MeeshySDK/Sources` de non-référencement.
- **`ComposerTextEditingView.swift`** → `UITextView` representable. **Recyclable** : c'est exactement le type de champ éditable requis par §3.6 (fallback `UITextView`). Option : le réutiliser comme base de `TextEditCenteredField` (retirer le wiring `inputAccessoryView`), plutôt que le supprimer puis réécrire. À trancher en Phase 3 selon le choix `TextField` vs `UITextView`.

### 3.9 Cleanup à la fermeture / changement slide / sérialisation

Dans `StoryComposerViewModel.commitCurrentSlide()` ou `setCurrentSlideIndex(_:)`, prepend :

```swift
if textEditingMode != .inactive {
    exitTextEditingMode()  // restore position before slide swap
}
```

Idem dans `viewModel.deleteElement(id:)` — si on supprime le texte en cours d'édition, snapshot devient invalide → `editingTextSnapshot = nil; textEditingMode = .inactive`.

> ⚠️ **Sérialisation pendant l'édition.** `enterTextEditingMode` écrit la position centrée `(0.5, 0.32)` + transform 1:1 dans le *vrai* `StoryTextObject` via `currentEffects`. Si `granularCanvasSync`, un autosave, ou un `publish` se déclenche **pendant** l'édition (avant l'exit qui restaure), la position centrée est **sérialisée durablement** — le texte resterait centré après réouverture de la story.
>
> Mitigation obligatoire (choisir une) :
> - **(A)** Tout chemin de commit/sérialisation appelle `exitTextEditingMode()` en pré-étape (restaure la position avant de sérialiser). À étendre à *tous* les points de sérialisation — auditer `granularCanvasSync` + le path de publish.
> - **(B)** *(recommandé, plus robuste)* Ne pas muter le modèle pour le recentrage : appliquer position + transform 1:1 comme **override purement view-layer** (le canvas / l'overlay dessine le texte édité centré sans toucher `x/y/scale/rotation`). Supprime le snapshot, le restore, et tout risque de sérialisation. Coût : la logique de rendu doit accepter un override pour l'élément en édition. À évaluer en Phase 1 — si faisable sans surcoût majeur, préférer (B).
>
> Note : le **contenu du texte** (`text`), lui, DOIT être écrit live dans le modèle (c'est l'édition même) — seul le *recentrage géométrique* est concerné par ce risque.

### 3.10 — Modèle SDK & rendu : contrôles Color / Background / Border

> Section ajoutée — cadre le support modèle / rendu des trois contrôles de texte. V1 = presets uniquement (§2.3).

**Color (texte) — aucun changement.** `StoryTextObject.textColor: String?` (hex) existe et est rendu. V1 UI = palette `StoryTextColors.palette`.

**Background — aucun changement modèle ni renderer.** `StoryTextObject.backgroundStyle: StoryTextBackgroundStyle?` existe (`.none` / `.solid(hex:)` / `.glass(radius:)`). `solid(hex:)` accepte un hex **8 chiffres `RRGGBBAA`** ; `StoryTextLayer.parseHexColor` décode déjà l'alpha (`StoryTextLayer.swift:249-257`). La transparence du fond est donc déjà supportée — V1 expose des presets (p.ex. opaque / 50% / glass).

**Border — NOUVEAU (Phase 0).** Aucun champ ni rendu de bord aujourd'hui : `StoryTextLayer` n'a aucun code de stroke/outline. Deux ajouts :

1. **Modèle** — `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`, struct `StoryTextObject` :

```swift
/// Contour / outline du texte. `borderColor == nil` ⇒ pas de bord
/// (pas de booléen séparé — cf. règle CLAUDE.md « no redundant boolean »).
public var borderColor: String?      // hex "RRGGBB" / "RRGGBBAA"
public var borderWidth: Double?      // design-pixels (référentiel 1080) ; nil ⇒ défaut 3.0
```

   - Ajouter `borderColor`, `borderWidth` aux `CodingKeys` (pas de clé legacy — champs neufs optionnels ⇒ décodage des stories existantes intact).
   - Étendre l'`init` (defaults `nil`).
   - Cohérent avec le pattern existant `textColor: String?` / `textBg: String?` / `fontSize: Double`.

2. **Renderer** — `packages/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift` : dessiner le contour des glyphes. Le texte est rendu via `CATextLayer` + `NSAttributedString`. Quand `borderColor != nil`, ajouter les attributs `.strokeColor` (UIColor depuis `parseHexColor`) et `.strokeWidth` **négatif** (négatif = remplir + contourer ; positif = texte creux). Échelonner `borderWidth` (design-px) par le facteur de rendu canvas, comme `fontSize`.
   - Vérifier que l'export MP4 (`StoryExporter` / `StoryAVCompositor`) réutilise `StoryTextLayer` → le bord est baké automatiquement ; sinon répliquer l'attribut côté export.

3. **Presets V1** — l'UI `TextEditToolOptions` case `.border` propose : 1 chip `none` + une palette de couleurs (réutilise `StoryTextColors.palette`) + 3 épaisseurs préréglées (`fin` ≈ 2, `moyen` ≈ 4, `épais` ≈ 8 design-px). `none` ⇒ `borderColor = nil`.

> ⚠️ Le rendu de texte contouré via `CATextLayer` peut présenter des artefacts selon la version d'iOS. Fallback si besoin : un 2ᵉ `CATextLayer` derrière, même texte, couleur = bord, légèrement dilaté — mais privilégier d'abord l'attribut `.strokeWidth`.

---

## 4. Tests

### 4.1 ViewModel — `StoryComposerViewModel_TextEditingTests.swift`

| Test | Comportement |
|------|--------------|
| `test_enterMode_snapshotsOriginalProperties` | enter mode → `editingTextSnapshot` contient x/y/scale/rotation d'origine |
| `test_enterMode_movesTextToCenterAndResetsTransform` | text.x == 0.5, text.y == 0.32, scale == 1.0, rotation == 0 |
| `test_enterMode_alreadyEditingSameText_isNoOp` | ré-entrée sur le même id → snapshot inchangé (guard d'idempotence) |
| `test_exitMode_restoresOriginalProperties` | exit → x/y/scale/rotation reviennent aux valeurs du snapshot |
| `test_exitMode_clearsSnapshot` | editingTextSnapshot == nil après exit |
| `test_setExpandedTool_storesInState` | textEditingMode.expandedTool reflète |
| `test_setExpandedTool_whileInactive_noop` | inactive + setExpandedTool → reste inactive |
| `test_enterMode_invalidTextId_noop` | id introuvable → mode reste inactive |
| `test_slideSwitch_autoExitsEditMode` | currentSlideIndex change → mode → inactive + position restaurée |
| `test_deleteElement_whileEditing_clearsState` | delete du texte édité → snapshot vidé, mode inactive |
| `test_mutate_helper_propagatesToCurrentEffects` | `mutate(textId:)` écrit via `currentEffects` |

### 4.2 UI Snapshot — `FloatingTextEditOverlayTests.swift`

Snapshots :
- Bubbles row inactive (no expanded tool) — light & dark — **6 bulles + X**
- Bubbles row with style expanded — light & dark
- Bubbles row with color expanded — palette visible
- Centered field with each TextEditTool's options panel (style / color / size / align / background / border) — light & dark
- **Centered field avec texte long multi-ligne** — vérifie wrap + croissance verticale, **aucune troncature `…`**

### 4.3 Integration — `StoryComposerTextEditIntegrationTests.swift`

| Test | Comportement |
|------|--------------|
| `test_canvasTapOnText_entersEditMode` | tap sur un texte canvas → `textEditingMode == .active(id, nil)` |
| `test_canvasTapOnMedia_doesNotEnterTextMode` | tap sur une image → pas de mode texte |
| `test_textTyping_propagatesToCanvas` | frappe dans le champ centré → `currentSlide.textObjects[i].text` se met à jour |
| `test_styleChange_propagatesToCanvas` | change le style via bulle → texte canvas re-render avec la nouvelle police |
| `test_borderPreset_propagatesToModel` | choisir un preset bord → `borderColor` / `borderWidth` écrits sur le textObject |
| `test_backgroundPreset_propagatesToModel` | choisir un preset fond → `backgroundStyle` mis à jour |
| `test_dismissBubble_exitsModeAndDismissesKeyboard` | tap bulle X → `keyboardFocus == false` → mode inactive + position restaurée |
| `test_keyboardSwipeDown_exitsMode` | keyboardFocus = false → mode inactive |
| `test_tapOutsideOverlay_exitsMode` | tap sur le fond assombri → keyboardFocus false → mode inactive |
| `test_tapInsideTextField_whileEditing_keepsModeActive` | tap dans le champ centré → mode reste `.active`, clavier monté (re-tap ≠ sortie) |
| `test_allExits_funnelThroughKeyboardFocus` | chaque sortie (X / swipe / tap-outside) → `keyboardFocus` repasse `false` avant `exitTextEditingMode` |

### 4.4 SDK model — `StoryTextObjectTests.swift` (Phase 0)

| Test | Comportement |
|------|--------------|
| `test_border_codableRoundtrip` | `borderColor` + `borderWidth` survivent encode/decode |
| `test_border_legacyJSON_decodesWithNilBorder` | une story sans champs border décode `borderColor == nil` |
| `test_textLayer_rendersStrokeWhenBorderColorSet` | `StoryTextLayer` applique `.strokeColor` / `.strokeWidth` quand `borderColor != nil` |

---

## 5. Phases d'implémentation

### Phase 0 (SDK model + renderer — Border, ~1.5h)
- [ ] `StoryTextObject` : ajouter `borderColor: String?` + `borderWidth: Double?` + `CodingKeys` + defaults `nil` dans l'`init` (§3.10)
- [ ] `StoryTextLayer` : rendre le contour quand `borderColor != nil` (attributs `NSAttributedString` `.strokeColor` + `.strokeWidth` négatif, épaisseur échelonnée comme `fontSize`)
- [ ] Vérifier le chemin d'export MP4 (`StoryExporter` / `StoryAVCompositor`) — le bord doit être baké
- [ ] Tests SDK : Codable roundtrip + décodage legacy-JSON + rendu stroke (§4.4)
- [ ] **Gate** : build SDK vert, tests passent — aucune couche UI modifiée

### Phase 1 (foundation, ~1.5h)
- [ ] Add `TextEditingMode` enum + `TextEditTool` enum (6 cases, `.border` inclus) to `StoryComposerViewModel.swift`
- [ ] Add the **`mutate(textId:)` private helper** (n'existe pas — cf. §3.2)
- [ ] Add `editingTextSnapshot` private + `enterTextEditingMode` (avec guard d'idempotence) / `exitTextEditingMode` / `setExpandedTool`
- [ ] **Évaluer l'option (B) de §3.9** (recentrage view-layer sans mutation modèle) — si simple, l'adopter et adapter §3.2
- [ ] Unit tests ViewModel (11 tests, §4.1)

### Phase 2 (canvas tap routing, ~0.5h)
- [ ] Patcher la branche `.text` de `onItemTapped` **et** `onItemDoubleTapped` dans `StoryComposerView.canvasCore` → `viewModel.enterTextEditingMode(textId:)`
- [ ] (Aucune modif de `StoryCanvasUIView` / `StoryCanvasRepresentable` / `handlePan` — cf. §3.3)
- [ ] Integration test : tap on text → mode entered ; tap on media → pas de mode texte

### Phase 3 (FloatingTextEditOverlay shell, ~2.5h)
- [ ] Create `FloatingTextEditOverlay.swift` : dim bg + bubble row + champ centré éditable + funnel `dismissKeyboardAndExit()`
- [ ] Create `TextEditFloatingBubbles.swift` (6 tool bubbles + dismiss X)
- [ ] Create `TextEditCenteredField.swift` : champ **multi-ligne éditable**, taille 1:1, wrap, **zéro troncature**, tap = curseur (§3.6) — choisir `TextField(axis:.vertical)` ou `UITextView` representable (recyclage `ComposerTextEditingView`, §3.8 bis)
- [ ] Mount in `StoryComposerView` ZStack + coordinate visibility (opacity + `allowsHitTesting` + animation) avec FABs/band/topBar
- [ ] Snapshot tests, dont le cas texte long multi-ligne
- [ ] Vérifier : les 3 sorties passent toutes par `keyboardFocus = false` ; le tap dans le champ ne sort PAS

### Phase 4 (tool options, ~1.5h)
- [ ] Create `TextEditToolOptions.swift` with switch over `TextEditTool` (6 cases)
- [ ] Refactor `StoryTextEditorView.styleSection / colorSection / sizeSection` en composants partagés
- [ ] Reuse those in TextEditToolOptions ; `background` mappe sur `StoryTextBackgroundStyle` ; `border` écrit `borderColor`/`borderWidth`
- [ ] Wire bubble taps to setExpandedTool
- [ ] Verify chaque changement (style/color/size/align/background/border) live-propagates au canvas

### Phase 5 (polish, cleanup + edge cases, ~1h)
- [ ] Slide switch during edit → auto-exit (étendre à **tous** les points de sérialisation — §3.9 mitigation A)
- [ ] Element delete during edit → clear state
- [ ] **Supprimer le stub mort** `ComposerTextFormatBand.swift` ; recycler ou supprimer `ComposerTextEditingView.swift` selon le choix Phase 3 (§3.8 bis)
- [ ] Accessibility labels on all bubbles ; hint « ferme l'éditeur et masque le clavier » sur X
- [ ] Dynamic Type ; VoiceOver flow (champ → bulles → dismiss)
- [ ] Haptic feedback : light on bubble tap, medium on dismiss

### Phase 6 (manual QA + smoke, ~0.5h)
- [ ] Re-run Section 12 Text-related smoke tests
- [ ] Screenshots light + dark
- [ ] Vérifier : texte long → wrap + scroll, jamais tronqué ; texte petit → affiché 1:1 lisible
- [ ] Vérifier : les 3 sorties font descendre le clavier ; tap dans le texte = curseur, pas sortie
- [ ] Gesture conflict canvas pan/pinch

**Total estimé** : ~8-9h.

---

## 6. Risques

| # | Risque | Mitigation |
|---|--------|-----------|
| 1 | Conflit de gestures : pan recognizer absorbe le tap simple sur texte | **Résolu §3.3** : réutilise le `singleTapRecognizer` existant (`require(toFail: doubleTapRecognizer)`), pas de modif gesture. |
| 2 | Le canvas affiche aussi le texte → confusion avec le champ d'édition | Le texte canvas est recentré en `(0.5, 0.32)` scale 1.0 sous l'overlay ; le champ éditable le superpose à la même position → cohérent. Si confusion, masquer la copie canvas pendant l'édition. |
| 3 | Keyboard dismissal : `@FocusState` ne distingue pas swipe-down vs autre dismiss | OK et **voulu** : tout dismiss du clavier = sortie. Funnel unique `keyboardFocus = false` (§3.4) → déterministe. |
| 4 | Animation jitter quand bubble expanded change rapidement | Debounce léger `setExpandedTool` à 1 toggle / 150ms. |
| 5 | Position 0.32 + clavier + options trop serrés sur petit iPhone (SE) | `editingY` calculé : `max(0.20, (statusBarHeight + 60) / canvasHeight)`. Le champ scrolle en interne si nécessaire. |
| 6 | Performance : re-render canvas à chaque keystroke | `slidesEqualForCanvas` détecte le changement de texte → re-render. Pour textes longs, debounce 80ms l'écriture du binding. |
| 7 | **Sérialisation pendant l'édition** fige la position centrée `(0.5, 0.32)` | **Critique** — §3.9. Option (A) : tout commit appelle `exitTextEditingMode()` en pré-étape. Option (B, recommandée) : recentrage view-layer sans muter le modèle. Couvre aussi le force-quit. |
| 8 | `TextField(axis:.vertical)` insuffisant pour polices custom / sélection fine | Fallback `UITextView` representable (§3.6) — recyclage de `ComposerTextEditingView`. |
| 9 | Texte très long → champ déborde l'écran | Le champ scrolle en interne (textarea) ; jamais de troncature. Hauteur max bornée, scroll au-delà. |

---

## 7. Hors scope (V2 future)

- **Pickers libres couleur / fond / bord** : en V1 ces trois contrôles n'offrent que des **presets** (palettes + épaisseurs / transparences préréglées — §2.3, §3.10). Color pickers système (`UIColorPickerViewController`), slider d'épaisseur de bord continu, slider de transparence de fond continu → reportés post-V1.
- Pinch in/out **sur le canvas** pour redimensionner le texte pendant l'édition — en V1, le slider Size suffit.
- Long-press sur texte → menu contextuel (Modifier / Dupliquer / Supprimer) — déjà dans le menu canvas global, conservé.
- Animation custom du texte (entrance / exit) — gérée par la timeline panel, hors mode édition.
- Markdown / mention support — non requis ici.

---

## 8. Source of truth & references

- Texte object model : `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` → `StoryTextObject` (textStyle, textColor, textAlign, textBg, fontSize, fontFamily, backgroundStyle ; **`borderColor` + `borderWidth` ajoutés en Phase 0**) + `StoryTextBackgroundStyle` (`.none` / `.solid(hex: RRGGBBAA)` / `.glass(radius:)`)
- Rendu texte canvas : `packages/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift` → `resolveFont(...)`, `applyBackgroundStyle(...)`, `parseHexColor(...)` (gère l'alpha 8-digits) ; **rendu du contour ajouté en Phase 0**
- Résolution police SwiftUI : `storyFont(for:size:)` dans `FontStylePicker.swift`
- Existing text panel (à conserver pour la liste des textes) : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditorView.swift`
- Canvas tap routing : `StoryCanvasUIView.swift` (`singleTapRecognizer` → `onItemTapped`, `:1089`) + `StoryComposerView.swift` `canvasCore` (`:1032`)
- Band state machine : `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandStateMachine.swift`
- Code à nettoyer / recycler : `Controls/ComposerTextFormatBand.swift` (supprimer), `Controls/ComposerTextEditingView.swift` (recycler en `UITextView` representable ou supprimer)

---

## 9. Self-Review checklist (post-impl)

- [ ] Tap simple sur un texte → mode édition entre, clavier monte, texte centré
- [ ] Texte canvas se déplace de (x,y) original vers (0.5, 0.32), scale → 1.0, rotation → 0, spring 250ms
- [ ] **Texte affiché à sa taille réelle 1:1** — ni cap de police, ni shrink-to-fit
- [ ] **Texte intégral visible** : multi-ligne, retour à la ligne automatique, **aucune troncature `…`** ; scroll interne si très long
- [ ] **Toucher le texte pendant l'édition positionne le curseur / sélectionne** — ne ferme PAS le mode
- [ ] Bulles flottantes 36×36 au-dessus du texte, style FAB 60% — **6 bulles d'outils + 1 bulle X**
- [ ] Tap sur Style bubble → carrousel des 5 styles apparaît sous le texte (slide-up)
- [ ] Choix d'un style → texte canvas + champ d'édition se mettent à jour live
- [ ] Idem pour Color / Size / Align / Background / Border
- [ ] Border : choisir un preset (couleur × épaisseur) → le contour s'affiche sur le canvas ; `none` → pas de contour
- [ ] Background : un preset à transparence → le fond translucide se rend correctement (alpha 8-digits)
- [ ] Tap sur la même bulle → options se referment ; autre bulle → switch sans flicker ; clavier reste monté
- [ ] **Bulle X → le clavier descend ET le mode se ferme** (jamais de clavier orphelin)
- [ ] **Swipe-down sur clavier → mode édition se ferme, position restaurée**
- [ ] **Tap sur le fond assombri → clavier descend + mode édition se ferme**
- [ ] Les 3 sorties passent par `keyboardFocus = false` (funnel unique)
- [ ] FABs + band + top bar masqués (opacity + non-hittable) pendant édition, restaurés après
- [ ] Changement de slide pendant édition → auto-exit + position restaurée
- [ ] Autosave / publish pendant édition → la position centrée n'est PAS sérialisée (§3.9)
- [ ] Suppression du texte pendant édition → snapshot nettoyé, pas de leak
- [ ] Double-tap sur texte = même effet que tap simple (idempotent)
- [ ] Stub `ComposerTextFormatBand` supprimé ; `ComposerTextEditingView` recyclé ou supprimé ; build vert
- [ ] Accessibility : VoiceOver lit les bulles, navigation rotor fonctionne
- [ ] Light + dark mode : tous les contrôles lisibles
- [ ] Pas de retain cycle (memory graph propre après 10 cycles enter/exit)
- [ ] Tests passent : 3 SDK (Phase 0) + 11 ViewModel + 11 integration + snapshots stables
