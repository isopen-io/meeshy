# iOS — Refonte de l'overlay long-press sur message

**Date** : 2026-05-24
**Auteur** : J. Charles N. M. (validation Claude Opus 4.7)
**Statut** : Design validé, en attente de plan d'implémentation
**Scope** : `apps/ios/Meeshy/Features/Conversation/`, `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`

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

### 1.3 Objectif

Refondre l'overlay pour :
- **Garder la bubble à sa position** (lift uniquement si pas de room en dessous, style iMessage strict)
- **Animation plus fluide et réactive** (entry ~280-320ms, exit ~200ms, springs Apple-tuned)
- **Backdrop hybride** (blur léger `.regularMaterial` à opacity 0.6 + dim `Color.black` opacity 0.15)
- **Swipe-down dismiss** en plus du tap backdrop
- **Préserver le Prisme Linguistique** : bubble dans l'overlay reste vivante (traductions/audio en cours s'updatent)
- **Préserver l'accent color** par conversation (règle CLAUDE.md)

## 2. Approche technique retenue

**Approche C — Frame-tracking + overlay positionné absolu.**

Le système publie le frame écran de chaque cellule via `PreferenceKey`. Au long-press, on fige la frame du message ciblé, on hide la cellule originale (`opacity: 0`), et on affiche une seule instance de `ThemedMessageBubble` positionnée en `.offset()` exact via `MessageContextOverlay`. Le menu se place via `MessageOverlayLayoutEngine` (struct pur, stateless, testable).

### 2.1 Alternatives évaluées

- **`matchedGeometryEffect`** rejeté : quirks dans `ScrollView` (frame mal calculée si offscreen), ré-instancie la bubble côté overlay quand même
- **Snapshot `UIImage`** rejeté : casse la live preview (traductions/audio figés), nécessite `UIViewRepresentable` bridge
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
  ├── MessageList (ZStack base)
  │   └── chaque MessageRow publie son frame via .background(GeometryReader { PreferenceKey })
  │
  ├── MessageFrameTracker  (nouveau, struct dans ConversationView state)
  │   → [messageId: CGRect] dans screen coordinates
  │
  └── MessageContextOverlay  (nouveau, remplace MessagePressedOverlay)
      ├── BlurBackdrop  (.regularMaterial à opacity ramp 0→0.6)
      ├── DimBackdrop   (Color.black opacity ramp 0→0.15)
      ├── ElevatedBubbleHost  (positionnée par .offset() sur frame mémorisée + liftY)
      │   └── ThemedMessageBubble  (seul render, instance unique vivante)
      └── ContextActionMenu  (positionné via MessageOverlayLayoutEngine)
```

### 3.1 Composants à créer

| Composant | Type | Responsabilité |
|---|---|---|
| `MessageFramePreferenceKey` | `PreferenceKey` | Publie `[messageId: CGRect]` depuis chaque cellule |
| `MessageFrameTracker` | `struct` value type | Bag de frames, mut. via `update(_:)`, lecture via `frame(for:)` |
| `MessageContextOverlay` | `View` | Orchestrateur de l'overlay (remplace `MessagePressedOverlay`) |
| `MessageOverlayLayoutEngine` | `struct` stateless | Calcule lift de bubble + placement de menu (pure function) |
| `ContextActionMenu` | `View` | Capsule horizontale d'actions (HStack de boutons) |
| `ContextActionButton` | `View` | Bouton icon+label avec press animation |
| `ContextAction` | `struct` | Modèle d'une action (kind, label, icon, role) |

### 3.2 Composants modifiés

| Composant | Modification |
|---|---|
| `MessageListView` / `BubbleSwipeContainer` | Publie frame via `PreferenceKey`. Long-press duration **0.45s → 0.35s**. Gate `phase == .closed`. Opacity 0 si `targetMessage?.id == message.id` |
| `ConversationOverlayState` | Ajoute `phase: OverlayPhase`, `targetMessage`, `targetFrame`, `layoutOutput`, `dragOffset`, `dragProgress` |
| `ConversationView` | Câble `frameTracker` + `MessageContextOverlay` au lieu de `MessagePressedOverlay`. Propage `isHiddenForOverlay` aux cellules via wrapper Equatable |

### 3.3 Composants supprimés

- `MessagePressedOverlay` (`MessageListView.swift:165-300`) — remplacé intégralement

### 3.4 Composants conservés

- `MessageOverlayMenu` — reste utilisé pour le panel emoji picker (demi-écran draggable), ouvert depuis le bouton "Réagir" du nouveau `ContextActionMenu`

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

### 4.4 MessageFrameTracker

```swift
struct MessageFrameTracker {
    private(set) var frames: [String: CGRect] = [:]

    mutating func update(_ newFrames: [String: CGRect]) {
        // Merge incrémental : préserve les frames hors viewport
        // (utile si on long-press une cellule à la limite qui sort en scroll)
        for (id, rect) in newFrames {
            frames[id] = rect
        }
    }

    func frame(for messageId: String) -> CGRect? {
        frames[messageId]
    }
}
```

### 4.5 Coordinate space

`.global` (écran complet). L'overlay couvre tout l'écran via `ZStack` au niveau racine de `ConversationView`, donc placement direct par `.offset(x: rect.minX, y: rect.minY)`.

### 4.6 Pitfall évité

`proxy.frame(in: .global)` change pendant le scroll. **Solution** : on fige la frame au moment du long-press dans `overlayState.targetFrame`. L'overlay observe `overlayState.targetFrame` (snapshot), pas `frameTracker`. Sinon la bubble suivrait le scroll de la liste fantôme dessous.

### 4.7 Cleanup

Aucune purge LRU. Le dict grossit max `N` messages total dans la conversation (qq centaines en pire cas, négligeable mémoire).

### 4.8 Backup plan stockage du tracker

Si `@State` cause des re-renders excessifs de `ConversationView` au scroll (à mesurer en Instruments) → bascule vers `final class FrameTracker: ObservableObject` sans `@Published`, mute direct sans notifier.

## 5. Layout algorithm (lift + menu placement)

### 5.1 Entrées / sorties

```swift
struct OverlayLayoutInput {
    let bubbleSourceFrame: CGRect      // depuis frameTracker, screen coords
    let menuSize: CGSize                // mesuré au layout du menu (intrinsic)
    let screenSize: CGSize              // UIScreen.main.bounds
    let safeAreaInsets: EdgeInsets      // top + bottom safe areas
    let preferredGap: CGFloat = 12      // espace bubble ↔ menu
    let topPadding: CGFloat = 24        // marge top depuis safe area
    let bottomPadding: CGFloat = 24     // marge bottom depuis safe area
}

struct OverlayLayoutOutput {
    let bubbleFinalFrame: CGRect       // après lift éventuel
    let menuFrame: CGRect
    let menuAnchor: MenuAnchor          // .below ou .above
    let liftOffset: CGFloat             // négatif = lift vers le haut
}

enum MenuAnchor { case below, above }
```

### 5.2 Algorithme

```
1. safeTop = safeAreaInsets.top + topPadding
2. safeBottom = screenSize.height - safeAreaInsets.bottom - bottomPadding
3. roomBelow = safeBottom - bubbleSourceFrame.maxY
4. roomAbove = bubbleSourceFrame.minY - safeTop
5. menuNeeded = menuSize.height + preferredGap

   ─── Cas 1 : tout rentre dessous ───
   if roomBelow >= menuNeeded:
       bubbleFinalFrame = bubbleSourceFrame  (pas de lift)
       menuY = bubbleSourceFrame.maxY + preferredGap
       menuAnchor = .below
       return

   ─── Cas 2 : pas de room dessous mais oui dessus ───
   else if roomAbove >= menuNeeded:
       deficit = menuNeeded - roomBelow
       liftOffset = -deficit             (bubble remonte juste de ce qu'il faut)
       bubbleFinalFrame = bubbleSourceFrame.offset(y: liftOffset)
       menuY = bubbleFinalFrame.maxY + preferredGap
       menuAnchor = .below                (le menu reste en dessous, c'est la bubble qui a bougé)
       return

   ─── Cas 3 : ni dessous ni dessus (cas pathologique) ───
   else:
       liftOffset = safeTop - bubbleSourceFrame.minY
       bubbleFinalFrame = bubbleSourceFrame.offset(y: liftOffset)
       menuY = bubbleFinalFrame.maxY + preferredGap
       menuAnchor = .below
       return
```

### 5.3 Cas typiques

- **Cas 1** : 95% des cas. Bubble immobile, menu apparaît en dessous (iMessage strict)
- **Cas 2** : bubble près du bas (récent message reçu). Bubble lifte de juste assez
- **Cas 3** : edge case (vieux message + écran SE 1ère gen). Comportement de fallback prévisible

### 5.4 Menu horizontal

`bubbleSourceFrame.midX` détermine `menuFrame.midX`. Si débordement à droite/gauche → clamp à `[16, screenWidth - 16 - menuWidth]`. Le menu n'a pas de pointer/queue, le clamp est invisible.

### 5.5 Testabilité

`MessageOverlayLayoutEngine.compute(input:)` est une fonction pure → unit tests sans SwiftUI (cf. section 9.1).

## 6. Animation timing

### 6.1 Opening (long-press fire → état stable)

```
t=0       (long-press 0.35s atteint, réduit depuis 0.45s)
  ├ HapticFeedback.medium()                              [instant]
  ├ overlayState.targetFrame = tracker.frame(for: id)    [instant]
  ├ overlayState.phase = .opening
  └ originalBubbleOpacity = 0  (hide live cell)          [instant, sans animation]

t=0 → t=240ms  (animation principale, spring interpolé)
  ├ backdrop blur intensity:  0   → 1.0   spring(response: 0.32, damping: 0.92)
  ├ backdrop dim opacity:     0   → 0.15  spring(response: 0.32, damping: 0.92)
  ├ bubble scale:             1.0 → 1.03  spring(response: 0.28, damping: 0.78)
  ├ bubble shadow opacity:    0   → 0.18  spring(response: 0.32, damping: 0.92)
  └ bubble liftOffset:        0   → -X    spring(response: 0.35, damping: 0.82)  [si cas 2/3]

t=80ms → t=320ms  (menu apparition décalée pour anticipation visuelle)
  ├ menu opacity:    0    → 1     spring(response: 0.28, damping: 0.85)
  ├ menu scale:      0.85 → 1     spring(response: 0.30, damping: 0.78)
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
  ├ menu opacity:           1     → 0    spring(response: 0.22, damping: 0.90)
  ├ menu scale:             1     → 0.85 spring(response: 0.22, damping: 0.90)
  ├ bubble scale:           1.03  → 1.0  spring(response: 0.26, damping: 0.88)
  ├ bubble liftOffset:      -X    → 0    spring(response: 0.28, damping: 0.85)
  ├ bubble shadow opacity:  0.18  → 0    spring(response: 0.26, damping: 0.88)
  ├ backdrop blur intensity: 1.0  → 0    spring(response: 0.26, damping: 0.92)
  └ backdrop dim opacity:    0.15 → 0    spring(response: 0.26, damping: 0.92)

t=200ms
  ├ originalBubbleOpacity = 1  (reveal live cell)        [instant]
  └ overlayState.phase = .closed, targetFrame = nil
```

### 6.4 Pourquoi closing plus rapide

Règle UX standard : sortie ~70-80% du temps d'entrée. L'utilisateur a déjà vu le contenu, il ne veut pas attendre.

### 6.5 Pas de `DispatchQueue.main.asyncAfter`

Utilisation de `withAnimation(completion:)` (iOS 17+) ou `Transaction.addAnimationCompletion`. Si l'utilisateur ré-ouvre rapidement, cancel propre.

### 6.6 Swipe-down dismiss (interactif)

Pendant `phase == .open`, `DragGesture` sur la bubble :

```swift
.gesture(
    DragGesture(coordinateSpace: .local)
        .onChanged { value in
            guard value.translation.height > 0 else { return }
            interactiveDismissProgress = min(1, value.translation.height / 120)
            bubbleDragOffset = value.translation.height
            menuOpacity = 1 - interactiveDismissProgress
        }
        .onEnded { value in
            if value.predictedEndTranslation.height > 60 {
                triggerDismiss()
            } else {
                withAnimation(spring) {
                    bubbleDragOffset = 0
                    menuOpacity = 1
                }
            }
        }
)
```

`predictedEndTranslation` permet de dismiss sur un swipe court mais rapide (velocity-aware), pas juste sur la distance.

### 6.7 Latence perceptible

- **Time-to-first-pixel-motion** : 0ms (haptic + opacity hide synchrones)
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
   │  ├─ targetMessage = X
   │  ├─ targetFrame = tracker.frame(for: X)
   │  ├─ layoutOutput = LayoutEngine.compute(...)
   │  ├─ HapticFeedback.medium()
   │  └─ phase = .opening + withAnimation(completion: { phase = .open })
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
   │  └── long-press AUTRE bubble  → ignoré (phase != .closed)
   │
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
3. **Layout calculé une fois** : `layoutOutput` ne re-compute pas pendant l'overlay. Si clavier ouvre/ferme → dismiss d'abord.
4. **Reveal sync avec animation closing** : `originalBubbleOpacity = 1` dans le `completion` du `withAnimation`, jamais avant. Sinon flash de double-bubble.
5. **Action handlers** : tap action exécute callback ET trigger dismiss en parallèle. Pas séquentiel.
6. **Bouton "Réagir"** : cas particulier — dismiss puis (au completion) `showReactionPicker = true` qui présente `MessageOverlayMenu` existant.

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
        .shadow(color: .black.opacity(0.12), radius: 16, x: 0, y: 4)
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

`onPreferenceChange` mute un `@State` struct (`frameTracker`). Si scroll cause re-renders de `ConversationView` → backup plan classe `final class FrameTracker: ObservableObject` sans `@Published`.

### 9.2 Hiding bubble originale ≠ re-render des autres

Passage du `isHiddenForOverlay` calculé en amont via wrapper Equatable :

```swift
struct MessageRowEnvelope: Equatable {
    let message: Message
    let isHiddenForOverlay: Bool
    // ... autres props
}
```

Le parent re-render quand `targetMessage` change, mais propage `isHiddenForOverlay: false` à toutes les cellules sauf la ciblée → grâce à `.equatable()`, les autres skippent.

### 9.3 Gating Equatable existant préservé

`BubbleStandardLayout` (~1400 lignes) reste non-Equatable (hors scope). `ThemedMessageBubble` reste l'unique point d'entrée gating, ses 17 critères Equatable continuent de filtrer les re-renders.

**Follow-up post-refonte** (hors spec) : rendre `BubbleStandardLayout` Equatable, tracké en lesson.

### 9.4 Coût d'instanciation de la bubble overlay

- **Cache-hit** : mêmes paramètres `message` reference + ViewModels + thème → sous-vues (audio waveform, image thumbnail) hit cache
- **Image/audio re-fetch** : aucun, `CacheCoordinator` shared, URLs identiques, image déjà décodée RAM
- **Audio playback** : `SharedAVPlayerManager.shared` ne sait pas qu'il y a "deux" bubbles. Bubble overlay observe `.onReceive` comme la live. Effet : progression continue dans l'overlay (lifelike, voulu)
- **Vidéo inline** : re-attache le même `AVPlayer` existant → pas de re-init. À vérifier au build : si flash noir au re-attach, snapshot `Image` frame courante (pattern existant dans `BubbleStandardLayout`)
- **Stickers Lottie** : pause animations pendant `.opening`/`.open`/`.closing` (`AnimationManager.shared`), reprise au `.closed`

### 9.5 Critères de succès quantifiés

Vérifiés en Instruments + XCTMetric au merge :

| Métrique | Cible |
|---|---|
| Time-to-first-pixel-motion | < 16ms (1 frame @ 60fps) |
| Frame drops opening sur iPhone 13 | 0 |
| Frame drops opening sur iPhone 11 (low-end) | ≤ 1 |
| Memory delta open | < 5 MB |
| CPU idle `.open` | < 5% |
| SwiftUI `_printChanges()` 5 cycles | 0 cellule non-ciblée re-rendue |

## 10. Edge cases

| Cas | Comportement |
|---|---|
| Long-press fire mais message supprimé entre press start et `phase = .opening` | Guard `viewModel.messages.first(where:)`. Si nil → abort silent |
| `tracker.frame(for: id)` nil | Safety guard, abort. Impossible en pratique (long-press = cellule onscreen) |
| Scroll inertiel post long-press | `targetFrame` figée → bubble overlay clouée. Liste dessous scrolle, cachée par backdrop |
| Tap simultané 2 bubbles (multitouch) | `LongPressGesture` mono par défaut. Second appui ignoré tant que `phase != .closed` |
| App backgrounded pendant overlay | `UIApplication.willResignActiveNotification` → `dismissOverlay(animated: false)` |
| Clavier ouvert pendant overlay | `keyboardWillShowNotification` → dismiss immédiat |
| Rotation device pendant overlay | `UIDevice.orientationDidChangeNotification` → dismiss + relayout |
| Message reçoit update (reaction, edit) pendant overlay | Live cell `opacity:0` reçoit update. Bubble overlay re-render via `ThemedMessageBubble` Equatable → repaint smooth |
| Message disparaît (deleted-for-everyone) | Bubble overlay reste affichée jusqu'au dismiss. Live cell ne réapparaît pas. Tracker auto-purge au prochain scroll |
| Connexion offline | Actions queue via `OfflineQueue`. UI feedback "queued" après reveal |
| VoiceOver actif | `accessibilityAddTraits(.isModal)` sur overlay. Focus auto premier bouton. Backdrop = `accessibilityLabel("Fermer le menu")`, tap = dismiss |
| Dynamic Type XXL | `ContextActionButton` lit `dynamicTypeSize`. Si `> .xxLarge` → labels masqués, icônes only |
| Reduce Motion activé | Springs remplacés par `.linear(duration: 0.18)`, scale 1.0, opacity-only |
| Long-press bubble audio en lecture | Audio continue, waveform progress visible dans overlay (live) |
| Layout engine produit `menuY` négative (iPhone SE + grosse bubble) | Cas 3 du LayoutEngine clamp : `bubbleFinalFrame.minY = safeTop` |
| Reaction picker post-dismiss | Séquence : `.closing` (200ms) → completion → `showReactionPicker = true`. Pas parallèle, évite double-overlay |

## 11. Testing strategy

### 11.1 Tests unitaires (sans SwiftUI runtime)

**`MessageOverlayLayoutEngineTests`** (10 tests, fonction pure) :
- `test_compute_bubbleInMiddle_returnsNoLift_menuBelow`
- `test_compute_bubbleAtBottom_returnsLiftUp_menuBelow`
- `test_compute_bubbleAtTop_smallScreen_returnsClampedTop_menuBelow`
- `test_compute_menuOverflowsRight_clampsMenuX`
- `test_compute_menuOverflowsLeft_clampsMenuX`
- `test_compute_actionCount3_returnsSmallerMenu`
- `test_compute_actionCount7_returnsClampedMenu`
- `test_compute_safeAreaTop44_respectsTopPadding`
- `test_compute_reducedMotion_returnsIdenticalLayout`
- `test_compute_bubbleExactlyAtSafeBottom_treatsAsCase2`

**`ConversationOverlayStateTests`** (8 tests, mutations) :
- `test_openOverlay_setsPhaseOpening`
- `test_openOverlay_withMissingFrame_doesNotOpen`
- `test_openOverlay_whenAlreadyOpen_isNoOp`
- `test_dismiss_setsPhaseClosing`
- `test_dismiss_clearsTargetAfterAnimation`
- `test_dragOffset_updates`
- `test_reactionAction_triggersDismissThenReactionPicker`
- `test_phaseTransitions_neverSkipState`

**`MessageFrameTrackerTests`** (4 tests) :
- `test_update_merges_doesNotErase`
- `test_frame_returnsCachedFrame`
- `test_frame_unknownId_returnsNil`
- `test_update_doesNotResetExistingFrames`

### 11.2 Tests snapshot SwiftUI

`MessageContextOverlaySnapshotTests` (8 snapshots, lib `SnapshotTesting`) :
- `phase_closed`
- `phase_open_caseMiddle_noLift`
- `phase_open_caseBottom_withLift`
- `phase_open_caseTopClamped`
- `phase_open_isMine_withDelete`
- `phase_open_otherUser_noDelete`
- `phase_open_darkMode`
- `phase_open_reduceMotion_active`

### 11.3 Tests intégration XCUITest

3 scénarios E2E sur simulateur iPhone 16 Pro :
- `test_longPress_thenTapBackdrop_dismisses`
- `test_longPress_thenSwipeDown_dismisses`
- `test_longPress_thenTapReply_setsComposerReplyContext`

## 12. Rollout plan

### 12.1 Pas de feature flag

Remplacement direct de l'overlay actuel. App pre-launch (cf. `feedback_review_plans_before_implementing` memory), pas de backwards-compat à gérer.

### 12.2 Migration progressive en 5 phases dans le PR

| Phase | Contenu | Build/Tests |
|---|---|---|
| 1 | `MessageOverlayLayoutEngine` + tests | Pure logic, isolated |
| 2 | `MessageFrameTracker` + `MessageFramePreferenceKey` + intégration `MessageListView` (publication frames sans consommer) | Compile + tests, comportement actuel inchangé |
| 3 | `ContextActionMenu` standalone + `ContextActionButton` + snapshots | Compile + snapshot tests |
| 4 | `MessageContextOverlay` (orchestrateur) + animation timings + dismiss gestures | Compile, pas encore câblé |
| 5 | Remplacement dans `ConversationView` : `MessagePressedOverlay` retiré, `MessageContextOverlay` câblé. Suppression fichier obsolète | Tests intégration verts |

Chaque phase = commit indépendant, build passant, tests verts. Si phase 4 a un souci sur device, on peut revert sans casser 1-3.

### 12.3 Sprint estimation

- `MessageOverlayLayoutEngine` + tests : 0.5 j
- `MessageFrameTracker` + `PreferenceKey` + intégration cellule : 0.5 j
- `ContextActionMenu` + `ContextActionButton` + snapshots : 0.5 j
- `MessageContextOverlay` + animations + dismiss gestures : 1.5 j
- Intégration `ConversationView` + cleanup + tests intégration : 0.5 j
- Buffer device tests (iPhone 11, iPhone 13, iPhone 16 Pro) : 1 j

**Total : 4.5 jours**

## 13. Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| `matchedGeometryEffect` rejeté mais on découvre que `.offset()` direct cause un saut visuel | Bubble "saute" en arrivant | Phase 4 device test précoce. Backup : `matchedGeometryEffect` ré-évalué si quirks gérables |
| Re-attach `AVPlayer` cause flash noir | UX dégradée sur bubbles vidéo | Snapshot `Image` frame courante (pattern existant dans `BubbleStandardLayout`) |
| `@State` `FrameTracker` cause re-renders excessifs au scroll | Lag sur la liste | Bascule sur `final class FrameTracker: ObservableObject` sans `@Published` |
| `BubbleStandardLayout` non-Equatable cause re-render visible | Pendant overlay open, autres bubbles re-rendent | Wrapper `MessageRowEnvelope` Equatable au call site. Si insuffisant, follow-up post-refonte (hors scope) |
| iPhone 11 (référence low-end) frame drops > 1 | Cible perf manquée | Réduire l'overshoot scale (1.03 → 1.0), désactiver blur sur appareils marqués `reduceTransparency` |
| `predictedEndTranslation.height > 60` trop sensible / pas assez | Swipe-down dismiss frustrant | Calibrage device test, ajustement possible (40-80 range) |

## 14. Hors scope

- Refactor de `BubbleStandardLayout` pour le rendre Equatable (~1400 lignes, sprint dédié)
- Refonte du panel emoji picker `MessageOverlayMenu` (conservé tel quel, juste appelé via "Réagir")
- Ajout d'actions nouvelles (Edit, Pin, Info) — leur slot est prévu dans `ContextAction.Kind` mais leur câblage ViewModel/backend = sprint dédié
- Support iPad split-view (dismiss au resize, mais layout adaptatif iPad pour overlay = sprint dédié)
- Animation custom de l'apparition du panel emoji picker post-dismiss (transition par défaut Apple `.sheet` conservée)
