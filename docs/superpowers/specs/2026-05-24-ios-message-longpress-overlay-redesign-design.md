# iOS — Refonte de l'overlay long-press sur message

**Date** : 2026-05-24 (patché 2026-05-24 v2 après revue Opus)
**Auteur** : J. Charles N. M. (validation Claude Opus 4.7)
**Statut** : Design v2 validé après cross-review avec spec flatten (2026-05-22)
**Scope** : `apps/ios/Meeshy/Features/Conversation/`, `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`
**Deployment target** : iOS 16.0 (main app target 17.0 sur certains binaires, mais SDK et compat = iOS 16)
**Prérequis** : la spec flatten `2026-05-22-conversation-flatten-perf-design.md` doit être landed AVANT (cf. Section 12.1)

## 1. Contexte & problème

### 1.1 Comportement actuel

Le long-press sur une bubble de message (`BubbleSwipeContainer` dans `MessageListView.swift:71-77`, `LongPressGesture(minimumDuration: 0.45)`) déclenche `MessagePressedOverlay` (`MessageListView.swift:165-300`) qui :

1. Affiche un backdrop `Color.black.opacity(0.28)`
2. **Recentre** la bubble au milieu de l'écran via une nouvelle instance de `ThemedMessageBubble`, scale `0.92 → 1.0` spring
3. Affiche une `HStack` d'actions (Répondre, Transférer, Réagir, Traduire, Copier, Supprimer) en `.ultraThinMaterial`
4. Dismiss uniquement par tap sur backdrop ou tap action (pas de swipe down)
5. Délai composé `withAnimation(0.28s)` + `DispatchQueue.main.asyncAfter(0.22s)` = ~500ms avant retour à l'état initial

### 1.2 Problèmes identifiés

- **Recentrage** : la bubble quitte sa position d'origine. L'utilisateur perd le repère visuel
- **Animation** : 280ms entry + 500ms exit, perçu lent
- **Double rendu** : la bubble est instanciée deux fois (live cell + overlay), coût mémoire/CPU
- **Pas de swipe-down dismiss** : seul le tap fonctionne
- **`BubbleStandardLayout` sans Equatable** (~1400 lignes) : risque de re-render listé non-gaté
- **Backdrop sans blur** : effet "noir plat" peu premium vs iMessage/WhatsApp

### 1.3 Objectif & règles de cohérence

Refondre l'overlay pour :
- **Garder la bubble à sa position** (lift uniquement si pas de room en dessous, style iMessage strict)
- **Animation plus fluide et réactive** (entry ~280-320ms, exit ~200ms)
- **Backdrop hybride** (blur léger `.regularMaterial` à opacity 0.6 + dim `Color.black` opacity 0.15)
- **Swipe-down dismiss** en plus du tap backdrop
- **Préserver le Prisme Linguistique** : bubble dans l'overlay reste vivante (traductions/audio en cours s'updatent)
- **Préserver l'accent color** par conversation (règle CLAUDE.md)

**Cohérence avec le flatten** (Section 4 de `2026-05-22-conversation-flatten-perf-design.md`) :
- Animations **non-modales** alignées sur `BubbleAnimations.standard = .easeOut(duration: 0.18)` (déjà introduit par le flatten)
- Animations **modales** (entry/exit overlay long-press) = exception documentée, déclarées dans un **nouvel** enum d'alias `BubbleAnimations.overlaySpring` / `BubbleAnimations.overlayDismiss` (cf. Section 6.0), maintenu dans le même fichier `BubbleAnimations.swift` du flatten
- **Pas de `.shadow` sur les surfaces conversation/messages standard** (règle flatten). Exception modale documentée : Section 6.1 (`shadow opacity 0.18` sur bubble overlay) + Section 8.1 (`shadow radius 16` sur `ContextActionMenu`). Justification : élévation Z requise visuellement pour distinguer le plan modal du contenu dimmed dessous

## 2. Approche technique retenue

**Approche C — Frame-tracking + overlay positionné absolu.**

Le système publie le frame écran de chaque cellule via `PreferenceKey`. Au long-press, on fige la frame du message ciblé, on hide la cellule originale (`opacity: 0` via wrapper Equatable), et on affiche une seule instance de `ThemedMessageBubble` positionnée en `.offset()` exact via `MessageContextOverlay`. Le menu se place via `MessageOverlayLayoutEngine` (struct pur, stateless, testable).

### 2.1 Alternatives évaluées

- **`matchedGeometryEffect`** rejeté : **frame mal calculée si la source est offscreen** (cellule au bord de viewport lors du long-press) → animation casse. Le coût d'instanciation côté destination est identique à l'approche C, ce n'est pas un critère discriminant
- **Snapshot `UIImage`** rejeté : casse la live preview (traductions/audio figés pendant l'overlay), nécessite `UIViewRepresentable` bridge
- **`.sheet` natif SwiftUI** rejeté : ancré au bas de l'écran, ne sait pas se positionner relativement à un élément source
- **`.contextMenu` natif iOS 16+** rejeté : style verrouillé (liste verticale Apple, pas capsule horizontale), preview en snapshot figé (casse Prisme Linguistique), pas d'`accentColor` par conversation, transition vers panel emoji impossible sans flash visuel

### 2.2 Coût

~600 lignes de code custom à maintenir, justifié par deux invariants architecturaux Meeshy :
1. **Prisme Linguistique** : la preview DOIT être vivante (traductions/audio updates pendant l'overlay)
2. **Accent color déterministe par conversation** (règle CLAUDE.md : "ALL conversation-context components MUST use accentColor")

## 3. Architecture

```
ConversationView
  │
  ├── GeometryReader racine  (fournit availableViewportSize à l'overlay)
  │
  ├── MessageList (ZStack base)
  │   └── chaque MessageRow publie son frame via .background(GeometryReader { PreferenceKey })
  │                          + reçoit isHiddenForOverlay via MessageRowEnvelope wrapper
  │
  ├── MessageFrameTracker  (nouveau, value type stocké en @State)
  │   → [messageId: CGRect] dans screen coordinates, avec LRU 200 entries
  │
  └── MessageContextOverlay  (nouveau, remplace MessagePressedOverlay)
      ├── BlurBackdrop  (.regularMaterial à opacity ramp 0→0.6)
      ├── DimBackdrop   (Color.black opacity ramp 0→0.15)
      ├── ElevatedBubbleHost  (positionnée par .offset() sur frame mémorisée + liftY)
      │   └── ThemedMessageBubble  (seul render, instance unique vivante, isShadowedByOverlay: false)
      └── ContextActionMenu  (positionné via MessageOverlayLayoutEngine)
```

### 3.1 Composants à créer

| Composant | Type | Responsabilité |
|---|---|---|
| `MessageFramePreferenceKey` | `PreferenceKey` | Publie `[messageId: CGRect]` depuis chaque cellule |
| `MessageFrameTracker` | `struct` value type | Bag de frames + LRU 200 entries. Mut. via `update(_:)`, lecture via `frame(for:)`, purge via `removeFrame(for:)` |
| `MessageRowEnvelope` | `struct` Equatable | Wrapper qui propage `isHiddenForOverlay` aux cellules sans casser le gating Equatable (cf. Section 3.5) |
| `MessageContextOverlay` | `View` | Orchestrateur de l'overlay (remplace `MessagePressedOverlay`) |
| `MessageOverlayLayoutEngine` | `struct` stateless | Calcule lift de bubble + placement de menu (fonction pure) |
| `ContextActionMenu` | `View` | Capsule horizontale d'actions (HStack de boutons) |
| `ContextActionButton` | `View` | Bouton icon+label avec press animation |
| `ContextAction` | `struct` | Modèle d'une action (kind, label, icon, role) |
| **Extension** `BubbleAnimations` | `enum` static (fichier du flatten) | Ajoute `overlaySpring`, `overlayDismiss`, `overlayBackdrop` (cf. Section 6.0) |

### 3.2 Composants modifiés

| Composant | Modification |
|---|---|
| `MessageListView` / `BubbleSwipeContainer` | Publie frame via `PreferenceKey`. Long-press duration **0.45s → 0.35s**. Gate `phase == .closed`. Reçoit `MessageRowEnvelope` (incluant `isHiddenForOverlay`) |
| `ConversationOverlayState` | Ajoute `phase: OverlayPhase`, `targetMessage`, `targetFrame`, `layoutOutput`, `dragOffset`, `dragProgress` |
| `ConversationView` | Câble `frameTracker` + `MessageContextOverlay` au lieu de `MessagePressedOverlay`. Propage `isHiddenForOverlay` aux cellules via `MessageRowEnvelope` |
| `ThemedMessageBubble` (et `BubbleStandardLayout` pour la vidéo) | Reçoit `isShadowedByOverlay: Bool` ajouté à l'Equatable contract (cf. Section 9.4 pour le pattern AVPlayer défensif) |

### 3.3 Composants supprimés

- `MessagePressedOverlay` (`MessageListView.swift:165-300`) — remplacé intégralement

### 3.4 Composants conservés

- `MessageOverlayMenu` — reste utilisé pour le panel emoji picker (demi-écran draggable), ouvert depuis le bouton "Réagir" du nouveau `ContextActionMenu`

### 3.5 `MessageRowEnvelope` (wrapper Equatable — détail)

**Fichier** : `apps/ios/Meeshy/Features/Main/Views/MessageRowEnvelope.swift` (nouveau)

**But** : permettre à `ConversationView` de signaler à UNE cellule précise qu'elle doit s'effacer (`opacity: 0`) sans déclencher de re-render des autres cellules.

**Pattern** :

```swift
struct MessageRowEnvelope: Equatable {
    let message: Message                   // identité + contenu
    let presentation: BubblePresentation   // dérivé existant (palette, isMine, etc.)
    let viewState: BubbleViewState         // dérivé existant (deliveryStatus, reactions résumées, etc.)
    let isHiddenForOverlay: Bool           // NOUVEAU — true uniquement pour la cellule ciblée
    let isShadowedByOverlay: Bool          // NOUVEAU — true pour la même cellule (alias sémantique pour le rendu vidéo, cf. 9.4)

    static func == (lhs: Self, rhs: Self) -> Bool {
        // 17 critères existants + 2 nouveaux. Tous booléens/identité, comparaison O(1).
        lhs.message.id == rhs.message.id &&
        lhs.message.updatedAt == rhs.message.updatedAt &&
        // ... 15 autres critères (deliveryStatus, reactions.count, etc.)
        lhs.isHiddenForOverlay == rhs.isHiddenForOverlay &&
        lhs.isShadowedByOverlay == rhs.isShadowedByOverlay
    }
}
```

**Propagation depuis `ConversationView`** :

```swift
ForEach(viewModel.messages) { message in
    let envelope = MessageRowEnvelope(
        message: message,
        presentation: BubblePresentation(message: message, palette: palette, ...),
        viewState: BubbleViewState(message: message, ...),
        isHiddenForOverlay: overlayState.targetMessage?.id == message.id,
        isShadowedByOverlay: overlayState.targetMessage?.id == message.id
    )
    BubbleSwipeContainer(envelope: envelope, ...) {
        ThemedMessageBubble(envelope: envelope, ...)
    }
    .equatable()
}
```

**Garantie de non-régression perf** : quand `overlayState.targetMessage` change (long-press), `ConversationView` body re-évalue. Pour chaque message, `envelope.isHiddenForOverlay` est recalculé. Pour 99% des cellules, le booléen reste `false` → la nouvelle `MessageRowEnvelope` est `==` à l'ancienne → SwiftUI court-circuite le re-render grâce à `.equatable()`. Seule la cellule ciblée voit son envelope changer → cette cellule re-render (transition `opacity: 1 → 0`). **Vérification obligatoire au build** : ajouter `_printChanges()` temporaire dans `ThemedMessageBubble.body` pendant un test manuel de long-press, observer 0 cellule non-ciblée re-rendue.

**Pourquoi ce wrapper** : sans lui, on aurait deux options moins propres :
1. `@Environment(OverlayState)` lu directement dans chaque cellule → chaque cellule observe l'objet entier → re-render universel
2. `Binding<String?>` passé en prop → la cellule lit `.wrappedValue` et compare elle-même → boilerplate et non-Equatable-clean

Le wrapper centralise la décision dans le parent (qui sait déjà `targetMessage?.id`), propage un booléen scalaire, et laisse `.equatable()` faire son job.

**Pourquoi 2 props (`isHiddenForOverlay` + `isShadowedByOverlay`) plutôt qu'une seule** : alias sémantique. La cellule "hide" son layout principal mais doit aussi remplacer ses `AVPlayerLayer` par un `Image` snapshot (cf. Section 9.4). Deux propriétés permettent de découpler les deux comportements si on doit les dissocier dans le futur (ex. : un mode "preview" qui shadow le video sans hide la bubble).

## 4. Frame tracking system

### 4.1 PreferenceKey

```swift
struct MessageFramePreferenceKey: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}
```

### 4.2 Publication côté cellule

```swift
.background(
    GeometryReader { proxy in
        Color.clear.preference(
            key: MessageFramePreferenceKey.self,
            value: [message.id: proxy.frame(in: .global)]
        )
    }
)
```

### 4.3 Réception côté ConversationView

```swift
.onPreferenceChange(MessageFramePreferenceKey.self) { frames in
    frameTracker.update(frames)
}
```

### 4.4 MessageFrameTracker (avec LRU)

```swift
struct MessageFrameTracker {
    private(set) var frames: [String: CGRect] = [:]
    private(set) var accessOrder: [String] = []     // LRU queue
    private let maxEntries: Int = 200

    mutating func update(_ newFrames: [String: CGRect]) {
        for (id, rect) in newFrames {
            if frames[id] == nil {
                accessOrder.append(id)
            } else if let idx = accessOrder.firstIndex(of: id) {
                accessOrder.remove(at: idx)
                accessOrder.append(id)               // move to MRU end
            }
            frames[id] = rect
        }
        // Evict si > maxEntries
        while accessOrder.count > maxEntries {
            let evicted = accessOrder.removeFirst()
            frames.removeValue(forKey: evicted)
        }
    }

    func frame(for messageId: String) -> CGRect? {
        frames[messageId]
    }

    mutating func removeFrame(for messageId: String) {
        frames.removeValue(forKey: messageId)
        accessOrder.removeAll(where: { $0 == messageId })
    }
}
```

### 4.5 Coordinate space

`.global` (écran complet). L'overlay couvre tout l'écran via `ZStack` au niveau racine de `ConversationView`, donc placement direct par `.offset(x: rect.minX, y: rect.minY)`.

**iPad split-view future-proofing** : pour la taille de viewport servant au LayoutEngine, **on ne lit JAMAIS `UIScreen.main.bounds`**. À la place, on utilise un `GeometryReader` racine dans `ConversationView` qui fournit `availableViewportSize: CGSize` à `MessageContextOverlay`. Sur iPad split-view, `UIScreen.main.bounds` retournerait la taille du device complet, pas la fenêtre — bug invisible jusqu'au support iPad. Le `GeometryReader` racine retourne la taille effective de la fenêtre (correcte en split-view).

### 4.6 Pitfall évité

`proxy.frame(in: .global)` change pendant le scroll. **Solution** : on fige la frame au moment du long-press dans `overlayState.targetFrame`. L'overlay observe `overlayState.targetFrame` (snapshot), pas `frameTracker`. Sinon la bubble suivrait le scroll de la liste fantôme dessous.

### 4.7 Purge

Trois mécanismes complémentaires :
1. **LRU 200 entries** dans `update(_:)` (cf. 4.4) — protège contre l'accumulation longue
2. **Purge ciblée au dismiss** : à la fin de `.closing`, `frameTracker.removeFrame(for: messageId)` si le message a été supprimé entre-temps (détecté via `viewModel.messages.first(where:)` toujours `nil`)
3. **Purge au reset de conversation** : à `onDisappear` de `ConversationView`, `frameTracker = MessageFrameTracker()` (clean slate)

### 4.8 Backup plan stockage du tracker

Si `@State` cause des re-renders excessifs de `ConversationView` au scroll (à mesurer en Instruments) → bascule vers une classe Swift 6-compliant :

```swift
@MainActor
final class MessageFrameTracker: ObservableObject {
    private(set) var frames: [String: CGRect] = [:]
    private var accessOrder: [String] = []
    private let maxEntries: Int = 200

    // Pas de @Published intentionnellement — mutations directes sans notification SwiftUI.
    // ConversationView lit via .frame(for:) au moment du long-press uniquement.

    func update(_ newFrames: [String: CGRect]) { /* ... */ }
    func frame(for messageId: String) -> CGRect? { /* ... */ }
    func removeFrame(for messageId: String) { /* ... */ }
}
```

`@MainActor` obligatoire sous defaultIsolation MainActor (cf. memory `feedback_meeshyui_default_isolation`).

## 5. Layout algorithm (lift + menu placement)

### 5.1 Entrées / sorties

```swift
struct OverlayLayoutInput {
    let bubbleSourceFrame: CGRect              // depuis frameTracker, screen coords
    let menuSize: CGSize                        // mesuré au layout du menu (intrinsic)
    let availableViewportSize: CGSize           // fourni par GeometryReader racine (PAS UIScreen.main.bounds)
    let safeAreaInsets: EdgeInsets              // top + bottom safe areas
    let preferredGap: CGFloat = 12              // espace bubble ↔ menu
    let topPadding: CGFloat = 24                // marge top depuis safe area
    let bottomPadding: CGFloat = 24             // marge bottom depuis safe area
}

struct OverlayLayoutOutput {
    let bubbleFinalFrame: CGRect               // après lift et/ou scale-down éventuel
    let bubbleScale: CGFloat                    // 1.0 par défaut, < 1.0 si Cas 0
    let menuFrame: CGRect
    let menuAnchor: MenuAnchor                  // .below ou .above
    let liftOffset: CGFloat                     // négatif = lift vers le haut
}

enum MenuAnchor { case below, above }
```

### 5.2 Algorithme

```
1. safeTop = safeAreaInsets.top + topPadding
2. safeBottom = availableViewportSize.height - safeAreaInsets.bottom - bottomPadding
3. availableHeight = safeBottom - safeTop
4. menuNeeded = menuSize.height + preferredGap
5. minBubbleSpace = bubbleSourceFrame.height

   ─── Cas 0 (NOUVEAU) : bubble plus haute que viewport disponible ───
   if minBubbleSpace + menuNeeded > availableHeight:
       // Scale-down progressif pour qu'elle rentre avec le menu
       targetBubbleHeight = availableHeight - menuNeeded - 8       // marge sécurité 8px
       bubbleScale = max(0.6, targetBubbleHeight / bubbleSourceFrame.height)
       // Au-dessous de 0.6, illisible — on truncate visuellement (overflow clip dans la bubble)
       scaledHeight = bubbleSourceFrame.height * bubbleScale
       bubbleFinalFrame = CGRect(
           x: bubbleSourceFrame.minX,
           y: safeTop,
           width: bubbleSourceFrame.width * bubbleScale,
           height: scaledHeight
       )
       menuY = safeTop + scaledHeight + preferredGap
       menuAnchor = .below
       liftOffset = safeTop - bubbleSourceFrame.minY
       return

   ─── Cas 1 : tout rentre dessous (95% des cas) ───
   roomBelow = safeBottom - bubbleSourceFrame.maxY
   if roomBelow >= menuNeeded:
       bubbleFinalFrame = bubbleSourceFrame       (pas de lift)
       bubbleScale = 1.0
       menuY = bubbleSourceFrame.maxY + preferredGap
       menuAnchor = .below
       return

   ─── Cas 2 : pas de room dessous mais oui dessus ───
   roomAbove = bubbleSourceFrame.minY - safeTop
   if roomAbove >= menuNeeded:
       deficit = menuNeeded - roomBelow
       liftOffset = -deficit                       (bubble remonte juste de ce qu'il faut)
       bubbleFinalFrame = bubbleSourceFrame.offset(y: liftOffset)
       bubbleScale = 1.0
       menuY = bubbleFinalFrame.maxY + preferredGap
       menuAnchor = .below                         (la bubble a bougé, le menu reste dessous)
       return

   ─── Cas 3 : ni dessous ni dessus (cas pathologique iPhone SE) ───
   else:
       liftOffset = safeTop - bubbleSourceFrame.minY
       bubbleFinalFrame = bubbleSourceFrame.offset(y: liftOffset)
       bubbleScale = 1.0
       menuY = bubbleFinalFrame.maxY + preferredGap
       menuAnchor = .below
       return
```

### 5.3 Cas typiques

- **Cas 0** : message ultra-long (texte > 800pt) sur iPhone SE/8 (écran 568-667pt). Scale-down + clamp au safe area top
- **Cas 1** : 95% des cas. Bubble immobile, menu apparaît en dessous (iMessage strict)
- **Cas 2** : bubble près du bas (récent message reçu). Bubble lifte de juste assez
- **Cas 3** : edge case (vieux message en haut + écran SE 1ère gen). Comportement de fallback prévisible

### 5.4 Menu horizontal

`bubbleSourceFrame.midX` détermine `menuFrame.midX`. Si débordement à droite/gauche → clamp à `[16, availableViewportSize.width - 16 - menuWidth]`. Le menu n'a pas de pointer/queue, le clamp est invisible.

### 5.5 Testabilité

`MessageOverlayLayoutEngine.compute(input:)` est une fonction pure → unit tests sans SwiftUI (cf. section 11.1).

## 6. Animation timing

### 6.0 Constantes (ajoutées au fichier `BubbleAnimations.swift` du flatten)

```swift
// Existant (introduit par le flatten 2026-05-22)
enum BubbleAnimations {
    static let standard: Animation = .easeOut(duration: 0.18)
    static let reactionFeedback: Animation = .easeOut(duration: 0.20)

    // NOUVEAU (exception modale documentée — refonte longpress)
    static let overlaySpring: Animation = .spring(response: 0.32, dampingFraction: 0.85)
    static let overlayBubble: Animation = .spring(response: 0.28, dampingFraction: 0.78)
    static let overlayLift: Animation = .spring(response: 0.35, dampingFraction: 0.82)
    static let overlayMenu: Animation = .spring(response: 0.28, dampingFraction: 0.85)
    static let overlayMenuScale: Animation = .spring(response: 0.30, dampingFraction: 0.78)
    static let overlayDismiss: Animation = .spring(response: 0.22, dampingFraction: 0.90)
    static let overlayDismissBubble: Animation = .spring(response: 0.26, dampingFraction: 0.88)
    static let overlayRevealCrossfade: Animation = .linear(duration: 0.016)   // 1 frame @ 60fps
}
```

**Justification de l'exception spring** (à laisser en commentaire dans le fichier) :
> Les overlays modaux dérogent au `.easeOut(0.18)` standard car ils nécessitent un comportement de progression non-linéaire perceptuellement "pop" : amortissement de fin pour donner du corps à l'élévation Z, équivalent au visual feedback iMessage/WhatsApp. Hors overlay modal, tout reste sur `BubbleAnimations.standard`.

### 6.1 Opening (long-press fire → état stable)

```
t=0       (long-press 0.35s atteint, réduit depuis 0.45s)
  ├ HapticFeedback.medium()                                     [instant]
  ├ overlayState.targetFrame = tracker.frame(for: id)           [instant]
  ├ overlayState.phase = .opening
  └ envelope.isHiddenForOverlay = true  (via re-render parent)  [instant, .linear(0.016) si flash visible]

t=0 → t=240ms  (animation principale)
  ├ backdrop blur intensity:  0   → 1.0   BubbleAnimations.overlaySpring
  ├ backdrop dim opacity:     0   → 0.15  BubbleAnimations.overlaySpring
  ├ bubble scale:             1.0 → 1.03  BubbleAnimations.overlayBubble
  ├ bubble shadow opacity:    0   → 0.18  BubbleAnimations.overlaySpring
  └ bubble liftOffset:        0   → -X    BubbleAnimations.overlayLift  [si cas 2/3]

t=80ms → t=320ms  (menu apparition décalée pour anticipation visuelle)
  ├ menu opacity:    0    → 1     BubbleAnimations.overlayMenu
  ├ menu scale:      0.85 → 1     BubbleAnimations.overlayMenuScale
  └ menu offsetY:    +8   → 0     (slide-up subtil de 8px)

t=320ms : phase = .open, accept tap/swipe input
```

### 6.2 Idle (open)

Aucune animation autonome. État stable. Highlights de boutons sur press.

### 6.3 Closing (dismiss → état fermé)

```
t=0       (tap backdrop / swipe down terminé / action sélectionnée)
  ├ overlayState.phase = .closing
  └ HapticFeedback.light()  [seulement si dismiss par geste, pas par action]

t=0 → t=200ms  (spring reverse, plus rapide que l'opening)
  ├ menu opacity:           1     → 0    BubbleAnimations.overlayDismiss
  ├ menu scale:             1     → 0.85 BubbleAnimations.overlayDismiss
  ├ bubble scale:           1.03  → 1.0  BubbleAnimations.overlayDismissBubble
  ├ bubble liftOffset:      -X    → 0    BubbleAnimations.overlayDismissBubble
  ├ bubble shadow opacity:  0.18  → 0    BubbleAnimations.overlayDismissBubble
  ├ backdrop blur intensity: 1.0  → 0    BubbleAnimations.overlayDismiss
  └ backdrop dim opacity:    0.15 → 0    BubbleAnimations.overlayDismiss

t=184ms → t=200ms  (crossfade pour éviter le flash de double-bubble)
  ├ overlay bubble opacity: 1   → 0   BubbleAnimations.overlayRevealCrossfade
  └ envelope.isHiddenForOverlay = false (live cell reveal) avec opacity 0 → 1 BubbleAnimations.overlayRevealCrossfade

t=200ms
  └ overlayState.phase = .closed, targetFrame = nil, layoutOutput = nil
```

### 6.4 Pourquoi closing plus rapide

Règle UX standard : sortie ~70-80% du temps d'entrée. L'utilisateur a déjà vu le contenu, il ne veut pas attendre.

### 6.5 Animation completion (iOS 16 compatible)

`withAnimation(_:completion:)` n'existe qu'à partir d'iOS 17. Pour iOS 16 (deployment target Meeshy), on définit un helper :

```swift
@MainActor
func withAnimationCompletion(
    _ animation: Animation,
    duration: TimeInterval,
    _ body: @escaping () -> Void,
    completion: @escaping () -> Void
) {
    if #available(iOS 17.0, *) {
        withAnimation(animation, completionCriteria: .logicallyComplete) {
            body()
        } completion: {
            completion()
        }
    } else {
        withAnimation(animation) { body() }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
            completion()
        }
    }
}
```

Sur iOS 16, fallback `Task.sleep` aligné sur la durée nominale de l'animation (paramètre `duration` calé sur le `response` du spring, typiquement 0.20-0.32s). L'écart spring-réel-vs-nominal est < 16ms (1 frame) perceptuellement invisible. Pas de `DispatchQueue.main.asyncAfter` (cancelable, Swift 6-clean via `Task`).

### 6.6 Swipe-down dismiss (interactif)

Pendant `phase == .open`, `DragGesture` sur la bubble :

```swift
.gesture(
    DragGesture(coordinateSpace: .global)              // .global pour éviter ambiguïté avec .offset()
        .onChanged { value in
            let translation = value.location.y - value.startLocation.y
            guard translation > 0 else { return }       // ignore swipe up
            interactiveDismissProgress = min(1, translation / 120)
            bubbleDragOffset = translation
            menuOpacity = 1 - interactiveDismissProgress
        }
        .onEnded { value in
            let predictedTranslation = value.predictedEndLocation.y - value.startLocation.y
            if predictedTranslation > 60 {
                triggerDismiss()
            } else {
                withAnimation(BubbleAnimations.overlayDismissBubble) {
                    bubbleDragOffset = 0
                    menuOpacity = 1
                }
            }
        }
)
```

`coordinateSpace: .global` évite les coordonnées surprenantes que `.local` peut produire après `.offset()`. La translation est calculée manuellement via `value.location.y - value.startLocation.y` au lieu de `value.translation` (qui est déjà en local).

`predictedEndLocation` permet de dismiss sur un swipe court mais rapide (velocity-aware), pas juste sur la distance.

### 6.7 Latence perceptible

- **Time-to-first-pixel-motion** : ≤ 16ms (1 frame, haptic + opacity hide synchrones)
- **Time-to-stable** : 320ms (menu visible)
- **Time-to-dismissed** : 200ms

vs actuel : 280ms entry + 500ms exit. On gagne surtout sur la sortie.

## 7. State machine

### 7.1 ConversationOverlayState étendu

```swift
struct ConversationOverlayState {
    // Existant
    var longPressEnabled: Bool = true

    // Nouveau
    var phase: OverlayPhase = .closed
    var targetMessage: Message? = nil
    var targetFrame: CGRect? = nil
    var layoutOutput: OverlayLayoutOutput? = nil
    var dragOffset: CGFloat = 0
    var dragProgress: CGFloat = 0

    // Existant
    var showReactionPicker: Bool = false
}

enum OverlayPhase: Equatable {
    case closed
    case opening
    case open
    case closing
}
```

### 7.2 Transitions

```
.closed
   │
   │  long-press fire (0.35s) sur message X
   │  ├─ guard: longPressEnabled && phase == .closed && tracker.frame(for: X) != nil
   │  │        && viewModel.messages.contains(where: { $0.id == X })
   │  ├─ guard: pas d'autre overlay actif (cf. Section 10 priorités)
   │  ├─ targetMessage = X
   │  ├─ targetFrame = tracker.frame(for: X)
   │  ├─ layoutOutput = LayoutEngine.compute(...)
   │  ├─ HapticFeedback.medium()
   │  └─ phase = .opening + withAnimationCompletion(...) { phase = .open }
   ▼
.opening  (~240-320ms)
   │
   │  animation terminée
   ▼
.open
   │
   │  ┌── tap backdrop ──────────┐
   │  ├── swipe-down validé ─────┤
   │  ├── tap action button ─────┤── triggerDismiss()
   │  ├── tap "Réagir" ──────────┘── triggerDismiss() puis showReactionPicker = true
   │  ├── push notification overlay request → triggerDismiss() puis route
   │  └── long-press AUTRE bubble  → ignoré (phase != .closed)
   ▼
.closing  (~200ms)
   │
   │  animation terminée
   │  ├─ targetMessage = nil
   │  ├─ targetFrame = nil
   │  ├─ layoutOutput = nil
   │  ├─ dragOffset = 0
   │  └─ phase = .closed
   ▼
.closed (+ optionnel : showReactionPicker = true si action "Réagir")
```

### 7.3 Règles dures

1. **Phase exclusive** : pendant `.opening`/`.closing`, aucun nouveau long-press ne fire. `longPressEnabled` gate dans `BubbleSwipeContainer` lit `phase == .closed`.
2. **Frame figée à l'opening** : si scroll inertiel continue, `targetFrame` ne bouge pas. La bubble overlay reste clouée.
3. **Layout calculé une fois** : `layoutOutput` ne re-compute pas pendant l'overlay. Si clavier ouvre/ferme OU rotation device → dismiss (pas de relayout).
4. **Reveal crossfade** (Section 6.3) : pas de "flash" — overlay bubble fade-out et live cell fade-in en parallèle sur 16ms.
5. **Action handlers** : tap action exécute callback ET trigger dismiss en parallèle. Pas séquentiel.
6. **Bouton "Réagir"** : cas particulier — dismiss puis (au completion) `showReactionPicker = true` qui présente `MessageOverlayMenu` existant.
7. **Priorité d'overlays** (cf. Section 10) : si un overlay plus prioritaire arrive (push notification, app urgence), notre overlay dismiss en premier.

## 8. ContextActionMenu (composant)

### 8.1 Structure

```swift
struct ContextActionMenu: View {
    let actions: [ContextAction]
    let palette: ConversationColorPalette
    let onAction: (ContextAction.Kind) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(actions) { action in
                ContextActionButton(
                    action: action,
                    accentColor: palette.primary,
                    onTap: { onAction(action.kind) }
                )
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.06), lineWidth: 0.5))
        .shadow(color: .black.opacity(0.12), radius: 16, x: 0, y: 4)  // Exception modale documentée Section 1.3
    }
}

struct ContextAction: Identifiable {
    enum Kind { case reply, forward, react, translate, copy, delete, edit, pin, info }
    let id = UUID()
    let kind: Kind
    let label: LocalizedStringResource
    let icon: String
    let role: Role
}

enum Role { case standard, primary, destructive }
```

### 8.2 ContextActionButton

```swift
struct ContextActionButton: View {
    let action: ContextAction
    let accentColor: Color
    let onTap: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button {
            HapticFeedback.light()
            onTap()
        } label: {
            VStack(spacing: 3) {
                Image(systemName: action.icon)
                    .font(.system(size: 17, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                Text(action.label)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
            }
            .foregroundStyle(action.role == .destructive ? Color.red : accentColor)
            .frame(minWidth: 54, minHeight: 48)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isPressed ? Color.white.opacity(0.12) : Color.clear)
            )
            .scaleEffect(isPressed ? 0.92 : 1.0)
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in withAnimation(.spring(response: 0.18, damping: 0.7)) { isPressed = true } }
                .onEnded { _ in withAnimation(.spring(response: 0.22, damping: 0.7)) { isPressed = false } }
        )
    }
}
```

### 8.3 Actions filtrées par contexte

Filtrage en amont par `ConversationView` :

| Action | Visible si |
|---|---|
| Reply | toujours |
| Forward | toujours (sauf message éphémère expiré ou type call) |
| React | toujours sauf admin lock OR message deleted |
| Translate | langue détectée ≠ langue préférée user |
| Copy | message.content non vide (texte/transcription présente) |
| Delete | `isMine || canDeleteForEveryone` (via VM existant) |
| Edit | `isMine && !isExpired && hasContent` (futur) |
| Pin | hasRole `MODERATOR+` ou `BIGBOSS` |
| Info | `isMine && deliveryStatus != .pending` (debugging) |

**Audit/admin mode** : un `BIGBOSS`/`ADMIN` regardant une conversation en mode audit voit toutes les actions disponibles selon ses droits, MAIS les actions destructives (`Delete`, `Pin`) reçoivent un confirmation modal supplémentaire (déjà géré dans le ViewModel existant via `requiresConfirmation`).

**Limite** : 6 actions visibles dans la capsule horizontale. Au-delà → chevron `…` qui ouvre `MessageOverlayMenu` (existant, panel emoji + détails).

### 8.4 Couleurs

Conformité règle CLAUDE.md "ALL conversation-context components MUST use accentColor" :
- Standards : `palette.primary` (déterministe par conversation)
- Destructive : `Color.red` (semantic global, jamais dérivée)

### 8.5 Taille intrinsèque

```swift
ContextActionMenu.estimatedSize(actionCount: Int) → CGSize
// = (54 * count + 10*2 + 6 * (count-1)) x 48 + padding
```

Pas de `PreferenceKey` pour mesurer — déterministe.

## 9. Performance gating

### 9.1 Frame tracking n'invalide pas la liste

`PreferenceKey` publish via `.background(GeometryReader)` est hors du body principal de la cellule. SwiftUI évalue les preferences sans re-render le contenu.

`onPreferenceChange` mute un `@State` struct (`frameTracker`). Si scroll cause re-renders de `ConversationView` → backup plan classe `@MainActor final class MessageFrameTracker: ObservableObject` sans `@Published` (cf. Section 4.8).

### 9.2 Hiding bubble originale ≠ re-render des autres

Cf. Section 3.5 — `MessageRowEnvelope` Equatable propage `isHiddenForOverlay`. Garantie de non-régression : `_printChanges()` temporaire dans `ThemedMessageBubble.body` pendant test manuel → 0 cellule non-ciblée re-rendue.

### 9.3 Gating Equatable existant préservé

`BubbleStandardLayout` (~1400 lignes) reste non-Equatable (hors scope). `ThemedMessageBubble` reste l'unique point d'entrée gating, ses 17 critères Equatable + les 2 nouveaux (`isHiddenForOverlay`, `isShadowedByOverlay`) continuent de filtrer les re-renders.

**Follow-up post-refonte** (hors spec) : rendre `BubbleStandardLayout` Equatable, tracké en lesson.

### 9.4 AVPlayer / inline video — pattern défensif (obligatoire)

**Problème** : `AVPlayerLayer` ne supporte qu'UN seul attachement de layer à la fois. Si la live cell tient un `AVPlayerLayer` (même cachée par `opacity: 0`) ET que la bubble overlay essaie d'attacher le même `AVPlayer` à un autre `AVPlayerLayer` → le premier perd l'output (frame noire) ou l'attache foire silencieusement.

**Solution défensive (à implémenter dès la Phase 4 du rollout, pas en backup)** :

1. **`ThemedMessageBubble` reçoit `isShadowedByOverlay: Bool`** (propagé via `MessageRowEnvelope`).
2. **`BubbleStandardLayout` (pour la vidéo inline)** observe ce flag :
   - `isShadowedByOverlay == false` (cas normal) : rendu normal avec `VideoPlayer(player:)` ou `PlayerView(player:)`
   - `isShadowedByOverlay == true` (overlay actif sur cette cellule) : remplace `VideoPlayer` par un `Image(uiImage: SharedAVPlayerManager.shared.currentFrameSnapshot(for: url))`. La snapshot est capturée à la transition `false → true` via `AVPlayerItemVideoOutput.copyPixelBuffer` ou cache la dernière frame du time observer.
3. **La bubble overlay** (dans `MessageContextOverlay`) reçoit `isShadowedByOverlay: false` → elle est la seule à monter un `VideoPlayer` actif. Le `SharedAVPlayerManager.shared.attach(playerLayer:)` (à créer) garantit qu'il n'y a qu'UN `AVPlayerLayer` connecté à un instant T par URL.
4. **Au dismiss** : la live cell repasse `isShadowedByOverlay: false`, le `VideoPlayer` se ré-attache, le snapshot disparaît. La bubble overlay (qui se fade-out) passe à `isShadowedByOverlay: true` pendant le crossfade → libère le player avant unmount.

**Cas Lottie** : `AnimationManager.shared.pause(forID:)` / `.resume(forID:)` géré symétriquement via le même `isShadowedByOverlay` flag.

**Test obligatoire (cf. Section 11.3)** : `test_videoBubble_longPress_thenDismiss_playerContinuesUninterrupted` — long-press sur vidéo en lecture, vérifier que la lecture continue dans l'overlay et reprend dans la cell après dismiss, sans frame noire.

### 9.5 Coût d'instanciation de la bubble overlay

- **Cache-hit** : mêmes paramètres `message` reference + ViewModels + thème → sous-vues (audio waveform, image thumbnail) hit cache
- **Image/audio re-fetch** : aucun, `CacheCoordinator` shared, URLs identiques, image déjà décodée RAM
- **Audio playback** : `SharedAVPlayerManager.shared` ne sait pas qu'il y a "deux" bubbles. Bubble overlay observe `.onReceive` comme la live. Effet : progression continue dans l'overlay (lifelike, voulu). Comme pour la vidéo (9.4), un seul `AVAudioSession` attaché à un instant T.

### 9.6 Critères de succès quantifiés

Vérifiés en Instruments + XCTMetric au merge :

| Métrique | Cible |
|---|---|
| Time-to-first-pixel-motion | ≤ 16ms (1 frame @ 60fps) |
| Frame drops opening sur iPhone 13 | 0 |
| Frame drops opening sur iPhone 11 (low-end mid) | ≤ 1 |
| Frame drops opening sur iPhone SE 2nd gen (low-end min) | ≤ 2 |
| Memory delta open | < 5 MB |
| Memory delta après 50 cycles open/close | < 10 MB (cf. test stress 11.3) |
| CPU idle `.open` | < 5% |
| SwiftUI `_printChanges()` 5 cycles | 0 cellule non-ciblée re-rendue |

**Note iPhone SE 1ère gen** : non testé. Deployment target iOS 16 mais SE 1ère gen est sur iOS 15.x max → hors support. SE 2nd gen (4.7", A13) reste le worst case testé.

## 10. Edge cases & priorité d'overlays

### 10.1 Priorité d'overlays

Hiérarchie déclarée dans `ConversationView` via un `enum OverlayPriority: Int` :

```swift
enum OverlayPriority: Int, Comparable {
    case messageContext = 100         // notre overlay long-press
    case replyThread = 200             // overlay reply thread (existant)
    case storyViewer = 300             // story viewer (existant)
    case profileSheet = 400            // sheet profile utilisateur
    case incomingCall = 1000           // push notification appel entrant

    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}
```

Règle : un overlay de priorité supérieure arrivant ferme immédiatement (sans animation) tous les overlays de priorité inférieure. Notre `messageContext` (100) est la priorité la plus basse — il dismiss systématiquement face à un autre overlay.

### 10.2 Edge cases

| Cas | Comportement |
|---|---|
| Long-press fire mais message supprimé entre press start et `phase = .opening` | Guard `viewModel.messages.first(where:)`. Si nil → abort silent, purge `frameTracker.removeFrame(for:)` |
| `tracker.frame(for: id)` nil | Safety guard, abort. Impossible en pratique (long-press = cellule onscreen). Log `os_log` pour observabilité |
| Scroll inertiel post long-press | `targetFrame` figée → bubble overlay clouée. Liste dessous scrolle, cachée par backdrop |
| Tap simultané 2 bubbles (multitouch) | `LongPressGesture` mono par défaut. Second appui ignoré tant que `phase != .closed` |
| App backgrounded pendant overlay | `UIApplication.willResignActiveNotification` → `dismissOverlay(animated: false)` |
| Clavier ouvert pendant overlay | `keyboardWillShowNotification` → dismiss immédiat (animated: true) |
| Rotation device pendant overlay | `UIDevice.orientationDidChangeNotification` → dismiss (pas de relayout, frame change donc layout invalide) |
| Message reçoit update (reaction, edit) pendant overlay | Live cell `opacity:0` reçoit update via `MessageRowEnvelope` re-render. Bubble overlay re-render via `ThemedMessageBubble` Equatable → repaint smooth |
| Message disparaît (deleted-for-everyone) | Bubble overlay reste affichée jusqu'au dismiss. Live cell ne réapparaît pas. Tracker auto-purge via 4.7 mécanisme 2 |
| Connexion offline | Actions queue via `OfflineQueue`. UI feedback "queued" après reveal |
| **Bubble plus haute que viewport (texte 800pt / écran 700pt)** | LayoutEngine Cas 0 (Section 5.2) : scale-down jusqu'à 0.6 min + clamp safe top. Au-delà, overflow clip dans la bubble |
| **`loadOlderMessages` déclenché pendant overlay** | Backdrop bloque le scroll user. Frames de la liste shiftent uniquement après dismiss (re-publication automatique via `PreferenceKey`) |
| **iPad split-view ou landscape** | `availableViewportSize` lu via `GeometryReader` racine (pas `UIScreen.main.bounds`) → layout correct. iPad split-view fonctionnel ; iPad multitasking complet (Slide Over, Stage Manager) **hors scope** |
| VoiceOver actif | `accessibilityAddTraits(.isModal)` sur overlay + **focus trap explicite** : `UIAccessibility.post(notification: .layoutChanged, argument: firstButton)` à l'opening, restauration sur live cell au dismiss. Backdrop = `accessibilityLabel("Fermer le menu")`, action `.activate` = dismiss |
| **Switch Control / Voice Control** | `accessibilityElement(children: .contain)` sur overlay container. Boutons en `accessibilityElement(children: .ignore)` avec labels explicites. Test manuel "Tap Reply", "Tap Cancel" |
| Dynamic Type XXL | `ContextActionButton` lit `dynamicTypeSize`. Si `> .xxLarge` → labels masqués, icônes only |
| Reduce Motion activé | Springs remplacés par `.linear(duration: 0.18)`, scale 1.0, opacity-only |
| Long-press bubble audio en lecture | Audio continue, waveform progress visible dans overlay (live) |
| Layout engine produit `menuY` négative (cas impossible avec Cas 0 introduit) | Plus possible. Cas 0 garantit `menuY >= safeTop + scaledHeight + gap > 0` |
| Reaction picker post-dismiss | Séquence : `.closing` (200ms) → completion → `showReactionPicker = true`. Pas parallèle, évite double-overlay |

## 11. Testing strategy

### 11.1 Tests unitaires (sans SwiftUI runtime)

**`MessageOverlayLayoutEngineTests`** (12 tests, fonction pure) :
- `test_compute_bubbleInMiddle_returnsNoLift_menuBelow`
- `test_compute_bubbleAtBottom_returnsLiftUp_menuBelow`
- `test_compute_bubbleAtTop_smallScreen_returnsClampedTop_menuBelow`
- `test_compute_bubbleTallerThanViewport_scalesDownToFit` *(Cas 0)*
- `test_compute_bubbleTallerThanViewport_minScale06_truncatesOverflow` *(Cas 0 extreme)*
- `test_compute_menuOverflowsRight_clampsMenuX`
- `test_compute_menuOverflowsLeft_clampsMenuX`
- `test_compute_actionCount3_returnsSmallerMenu`
- `test_compute_actionCount7_returnsClampedMenu`
- `test_compute_safeAreaTop44_respectsTopPadding`
- `test_compute_bubbleExactlyAtSafeBottom_treatsAsCase2`
- `test_compute_smallSplitViewSize_clampsAllSides` *(iPad future-proofing)*

**`ConversationOverlayStateTests`** (9 tests, mutations) :
- `test_openOverlay_setsPhaseOpening`
- `test_openOverlay_withMissingFrame_doesNotOpen`
- `test_openOverlay_withMissingMessage_doesNotOpen`
- `test_openOverlay_whenAlreadyOpen_isNoOp`
- `test_dismiss_setsPhaseClosing`
- `test_dismiss_clearsTargetAfterAnimation`
- `test_dragOffset_updates`
- `test_reactionAction_triggersDismissThenReactionPicker`
- `test_phaseTransitions_neverSkipState`

**`MessageFrameTrackerTests`** (7 tests) :
- `test_update_merges_doesNotErase`
- `test_frame_returnsCachedFrame`
- `test_frame_unknownId_returnsNil`
- `test_update_doesNotResetExistingFrames`
- `test_update_evictsLRU_when200entriesExceeded` *(NOUVEAU)*
- `test_removeFrame_clearsBothDictAndAccessOrder` *(NOUVEAU)*
- `test_update_mruReorderOnRepeatedAccess` *(NOUVEAU)*

**`MessageRowEnvelopeTests`** (5 tests, Equatable contract) :
- `test_equality_sameMessage_sameFlags_returnsTrue`
- `test_equality_differentIsHiddenForOverlay_returnsFalse`
- `test_equality_differentMessageId_returnsFalse`
- `test_equality_updatedAtChange_returnsFalse`
- `test_equality_reactionsCountChange_returnsFalse`

### 11.2 Tests snapshot SwiftUI

`MessageContextOverlaySnapshotTests` (10 snapshots, lib `SnapshotTesting`) :
- `phase_closed`
- `phase_open_caseMiddle_noLift`
- `phase_open_caseBottom_withLift`
- `phase_open_caseTopClamped`
- `phase_open_caseZero_scaledDown` *(NOUVEAU Cas 0)*
- `phase_open_isMine_withDelete`
- `phase_open_otherUser_noDelete`
- `phase_open_darkMode`
- `phase_open_reduceMotion_active`
- `phase_open_dynamicTypeXXL_iconsOnly` *(NOUVEAU)*

### 11.3 Tests intégration XCUITest

5 scénarios E2E sur simulateur iPhone 16 Pro :
- `test_longPress_thenTapBackdrop_dismisses`
- `test_longPress_thenSwipeDown_dismisses`
- `test_longPress_thenTapReply_setsComposerReplyContext`
- `test_videoBubble_longPress_thenDismiss_playerContinuesUninterrupted` *(NOUVEAU, AVPlayer pattern)*
- `test_50CyclesOpenClose_memoryDeltaWithin10MB` *(NOUVEAU stress, XCTMemoryMetric)*

Test a11y manuel (checklist QA, pas auto) :
- VoiceOver : focus trap respecté, navigation séquentielle dans le menu
- Switch Control : scan navigation atteint chaque bouton, sortie via "Cancel" virtuel
- Voice Control : "Tap Reply", "Tap Translate", etc. fonctionnels

## 12. Rollout plan

### 12.1 Prérequis : flatten landed AVANT

Conformément à la revue Opus, la spec flatten `2026-05-22-conversation-flatten-perf-design.md` doit être landed sur la branche cible AVANT d'attaquer ce sprint. Raisons :
- `BubbleAnimations.standard` doit exister pour que les exceptions modales (Section 6.0) y soient ajoutées comme alias
- Le flatten supprime `conversationHeat`, swipe label `String(localized:)` répétés, etc. → baseline perf plus saine pour mesurer les gains de la longpress refonte
- Le flatten introduit `.equatable()` sur `ThemedConversationRow` → mainteneur comprend le pattern avant de l'étendre via `MessageRowEnvelope`
- Évite le re-work sur fichiers communs (`MessageListView.swift`, `ThemedMessageBubble.swift`)

### 12.2 Pas de feature flag

Remplacement direct de l'overlay actuel. App pre-launch (cf. `feedback_review_plans_before_implementing` memory), pas de backwards-compat à gérer.

### 12.3 Migration progressive en 6 phases dans le PR

| Phase | Contenu | Build/Tests |
|---|---|---|
| 1 | Extension `BubbleAnimations` (Section 6.0) + tests existants verts | Compile + tests inchangés |
| 2 | `MessageOverlayLayoutEngine` + 12 tests (incluant Cas 0) | Pure logic, isolated |
| 3 | `MessageFrameTracker` + LRU + `MessageFramePreferenceKey` + intégration publication frames `MessageListView` (sans consommer) | Compile + 7 tests, comportement actuel inchangé |
| 4 | `MessageRowEnvelope` Equatable + propagation `isShadowedByOverlay` + pattern AVPlayer défensif (Section 9.4) + 5 tests Equatable | Compile + tests, vidéo encore inchangée mais infra prête |
| 5 | `ContextActionMenu` + `ContextActionButton` + 10 snapshots | Compile + snapshot tests |
| 6 | `MessageContextOverlay` (orchestrateur) + animations timings + dismiss gestures + intégration `ConversationView` : `MessagePressedOverlay` retiré, `MessageContextOverlay` câblé. Suppression fichier obsolète + 5 tests XCUITest | Tests intégration verts |

Chaque phase = commit indépendant, build passant, tests verts. Si phase 6 a un souci sur device, on peut revert les phases 5-6 sans casser 1-4.

### 12.4 Sprint estimation (avec flatten landed)

- Phase 1 (`BubbleAnimations` extension) : 0.25 j
- Phase 2 (`MessageOverlayLayoutEngine` + tests Cas 0) : 0.75 j
- Phase 3 (`MessageFrameTracker` LRU + `PreferenceKey` + intégration cellule) : 0.5 j
- Phase 4 (`MessageRowEnvelope` + AVPlayer pattern défensif) : 1 j *(plus complexe que prévu initialement)*
- Phase 5 (`ContextActionMenu` + `ContextActionButton` + snapshots) : 0.5 j
- Phase 6 (`MessageContextOverlay` + animations + dismiss gestures + intégration + XCUITest) : 1.5 j
- Buffer device tests (iPhone SE 2nd gen, iPhone 11, iPhone 16 Pro) + a11y manuel : 1 j

**Total : 5.5 jours** (vs 4.5j v1, +1j pour AVPlayer défensif spec'd upfront + Cas 0)

**Sans flatten landed** : ajouter +1j de rework sur fichiers communs → 6.5 jours, déconseillé.

## 13. Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| `matchedGeometryEffect` rejeté mais `.offset()` direct cause un saut visuel | Bubble "saute" en arrivant | Phase 6 device test précoce. Backup : `matchedGeometryEffect` ré-évalué uniquement si la source est garantie onscreen (cas 1 sur 4 → trop conditionnel, on garde `.offset()`) |
| AVPlayer re-attach cause frame noire | UX dégradée sur bubbles vidéo | Pattern défensif spec'd Section 9.4, implémenté Phase 4 obligatoire, test XCUITest dédié Phase 6 |
| `@State` `MessageFrameTracker` cause re-renders excessifs au scroll | Lag sur la liste | Bascule sur `@MainActor final class MessageFrameTracker: ObservableObject` sans `@Published` (cf. 4.8) |
| `BubbleStandardLayout` non-Equatable cause re-render visible | Pendant overlay open, autres bubbles re-rendent | Wrapper `MessageRowEnvelope` Equatable au call site (Section 3.5). Test `_printChanges()` manuel. Si insuffisant, follow-up post-refonte (hors scope) |
| iPhone SE 2nd gen frame drops > 2 | Cible perf manquée | Réduire l'overshoot scale (1.03 → 1.0), désactiver blur sur appareils marqués `reduceTransparency`. Cas 0 absorbe les bubbles XL |
| `predictedEndLocation` trop sensible / pas assez | Swipe-down dismiss frustrant | Calibrage device test, ajustement possible (40-80px range) |
| iOS 16 `Task.sleep` fallback désync avec spring réel | Crossfade légèrement décalé sur iOS 16 | < 16ms d'écart théorique, imperceptible. iOS 17+ utilise `completionCriteria: .logicallyComplete` (exact) |
| Conflit avec autres overlays (push appel entrant) | Race condition d'affichage | Hiérarchie `OverlayPriority` Section 10.1, dismiss systématique face à priorité supérieure |

## 14. Hors scope

- Refactor de `BubbleStandardLayout` pour le rendre Equatable (~1400 lignes, sprint dédié)
- Refonte du panel emoji picker `MessageOverlayMenu` (conservé tel quel, juste appelé via "Réagir")
- Ajout d'actions nouvelles (Edit, Pin, Info) — leur slot est prévu dans `ContextAction.Kind` mais leur câblage ViewModel/backend = sprint dédié
- iPad multitasking complet (Slide Over, Stage Manager). iPad split-view de base est supporté via `availableViewportSize` (Section 4.5)
- iPhone SE 1ère gen (iOS 15 max, hors deployment target Meeshy iOS 16)
- Animation custom de l'apparition du panel emoji picker post-dismiss (transition par défaut Apple `.sheet` conservée)
- Migration des springs hors-overlay vers `BubbleAnimations.standard` (couvert par le sprint flatten, prérequis)

## 15. Historique des révisions

- **v1 (2026-05-24)** : design initial validé section par section
- **v2 (2026-05-24, après revue Opus cross-spec)** : intégration des 15 critiques de la revue
  - Ajout prérequis "flatten landed" + cohérence animations via `BubbleAnimations` extension (Section 6.0)
  - **NEW Section 3.5** : `MessageRowEnvelope` spec'd explicitement
  - **NEW Section 9.4 expansion** : pattern AVPlayer défensif `isShadowedByOverlay` obligatoire
  - **NEW Cas 0** dans LayoutEngine (bubble > viewport)
  - Remplacement `UIScreen.main.bounds` par `availableViewportSize` via GeometryReader racine
  - Helper `withAnimationCompletion` iOS 16-compatible (Task.sleep fallback)
  - `DragGesture(.global)` au lieu de `.local` pour swipe-down
  - LRU 200 entries sur `MessageFrameTracker`
  - `@MainActor` explicite sur backup tracker class
  - Crossfade 16ms `.linear` pour reveal (évite flash)
  - Hiérarchie `OverlayPriority` (Section 10.1)
  - Tests ajoutés : `MessageRowEnvelopeTests` (5), Cas 0 (2), LRU (3), stress mémoire (1), AVPlayer XCUITest (1)
  - Test target élargi : iPhone SE 2nd gen ajouté comme worst case
  - Estimation 4.5j → 5.5j (Phase 4 plus complexe, Cas 0 ajouté)
