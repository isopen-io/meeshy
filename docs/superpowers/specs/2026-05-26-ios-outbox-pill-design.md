# iOS Outbox Pill — Fix file d'envoi multi-messages & pastille Synchronisation enrichie

- **Date** : 2026-05-26
- **Statut** : Design validé (brainstorming) — prêt pour implementation plan
- **Owner** : iOS team
- **Scope** : `apps/ios/Meeshy/`, `packages/MeeshySDK/`
- **Type** : Bugfix critique (perte de messages) + UX redesign (pastille de synchronisation)

---

## 1. Problème

### 1.1 Bug critique — perte silencieuse du 2ᵉ message offline

Quand la connexion réseau est dégradée (mauvaise 4G, latence haute) ou perdue **avant** que le toast `Offline` n'apparaisse (le toast actuel attend 10 s avant de s'afficher), envoyer un 2ᵉ message dans la même conversation fait **disparaître** ce message au lieu de l'empiler dans la file d'envoi. Seul le 1ᵉʳ message reste en attente avec son icône horloge.

Touche **tous les types d'envoi** : message texte simple, message avec pièce jointe unique, message avec pièces jointes multiples, message en réponse (`replyTo`), message transféré, citation, audio.

#### Cause racine

`apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1663-1675` :

```swift
// État actuel
if NetworkMonitor.shared.isOffline {
    let queueItem = OfflineQueueItem(...)
    messageStore.insert(.sending(queueItem))
    Task { try? await OfflineQueue.shared.enqueue(queueItem) }  // ⚠ fire-and-forget
    return                                                       // ⚠ pas de guard isSending offline
}
guard !isSending else { return false }   // guard PRÉSENT seulement côté online
isSending = true
```

Deux défauts cumulés :

1. **Pas de guard `isSending` en chemin offline** → deux taps rapides successifs sur « Envoyer » déclenchent deux `sendMessage()` en parallèle.
2. **`Task { try? await ... }` non awaité** → le 2ᵉ appel peut lancer son `Task` avant que le 1ᵉʳ ait fini son `INSERT` GRDB ; race condition sur le mirror in-memory `items: [OfflineQueueItem]` (cap 100, FIFO eviction). Le `try?` masque toute erreur GRDB (lock SQLite, write conflict).

### 1.2 UX — toast Offline invisible 10 s, pastille Sync trop pauvre

`apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift:38-60` :

```swift
.task {
    try? await Task.sleep(for: .seconds(10))   // ⚠ 10 s de zone aveugle
    showOfflineBanner = true
}
```

Pendant ces 10 s :
- L'utilisateur ne voit aucun signal qu'il est offline.
- Il tape un message → 1ʳᵉ bulle apparaît avec horloge ⏰.
- Il tape un 2ᵉ message → disparaît (cf. bug 1.1).

De plus, la pastille existante `.syncing` affiche un simple point pulsant + libellé « Synchronisation… » sans aucune info sur **ce qui est** en cours d'envoi. L'utilisateur n'a aucun feedback du contenu en file.

---

## 2. Objectifs

1. **Garantir l'empilement FIFO de N envois consécutifs** quelle que soit la qualité réseau, sans aucune perte de bulle, sans perte de `replyTo`/`forwardedFrom`/`attachmentIds`/`audio`/`citation`.
2. **Remplacer le toast `Offline` rouge** (et son délai 10 s) par une **pastille `Sync` unifiée enrichie** qui :
   - affiche **chaque** message en file (rotation 1-par-1, fade in/out 250 ms in / 2200 ms hold / 250 ms out)
   - colorise chaque message avec une **couleur pastel cyclée** dans une palette de 8 (rose, lavande, menthe, pêche, ciel, mimosa, lilas, sauge)
   - bascule visuellement entre **3 états** : `.syncing` (online + items), `.offline` (NWPath unsatisfied OU latence > 4 s sur un item inflight), `.failed` (≥ 1 item en `.failed`)
3. **Réactivité visuelle instantanée** : `< 500 ms` entre perte réseau et bascule de la pastille en mode `.offline` (debounce anti-flicker court).
4. **Préserver l'architecture évolutive** : SDK purity (le SDK ne sait rien des couleurs UI), Single Source of Truth (OutboxRecord GRDB), réutilisation maximale des composants existants (cf. § 6).

---

## 3. Architecture

### 3.1 Couches

```
RootView (apps/ios/Meeshy/App/RootView.swift)
  └─ .overlay(alignment: .top) { SyncPillHost(viewModel: SyncPillViewModel) }
                                       │
                                       ├─ Combine SyncPillViewModel.state
                                       │   inputs : OfflineQueue.pendingUIItemsPublisher × NetworkMonitor.isOfflinePublisher
                                       │   derive : pure function (failed > offline > syncing > hidden)
                                       │
                                       └─ SyncPill(items, state)
                                            ├─ SyncPillCapsule  (chrome — couleur, blur, shadow)
                                            ├─ SyncPillIcon     (icône kind ou status)
                                            ├─ SyncPillTitle    (« Synchronisation » | « Hors ligne » | « Échec »)
                                            ├─ SyncPillCounter  (« 2/3 »)
                                            └─ SyncPillRotator
                                                 └─ SyncPillItemView (1 item visible, fade in/out, palette pastel)

SyncPillRouter (singleton @MainActor) : open(_ source) → tabRouter + opener existants
```

### 3.2 Source de vérité

**GRDB table `outbox`** (schéma inchangé, déjà géré par `OutboxRecord`) reste la seule source. Le flux UI passe par :

```
OutboxRecord (GRDB)
   │  (READ WHERE status IN .pending, .inflight, .failed ORDER BY createdAt)
   ▼
[OutboxRecord]
   │  (mapping pur : OutboxUIItem.from(record:) — décode payload UNE FOIS par mutation)
   ▼
[OutboxUIItem]                ← VIEW MODEL léger, exposé par OfflineQueue.pendingUIItemsPublisher
   │
   ▼
SyncPillViewModel.state       ← Combine avec NetworkMonitor.isOfflinePublisher
   │
   ▼
SyncPill (vue)
```

Le `OfflineQueueItem` in-memory (mirror pour hot retry path) reste interne au SDK et n'est PAS consommé par la UI.

### 3.3 États de la pastille

```swift
enum PillState: Equatable {
    case hidden                              // file vide ET online
    case syncing(items: [OutboxUIItem])      // file non vide ET online
    case offline(items: [OutboxUIItem])      // NWPath unsatisfied OU stale inflight > 4 s
    case failed(items: [OutboxUIItem])       // ≥ 1 item en .failed
}
```

Priorité : `failed > offline > syncing > hidden`.

---

## 4. Modèle de données

### 4.1 `OutboxUIItem` (nouveau, SDK)

`packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxUIItem.swift` :

```swift
public struct OutboxUIItem: Sendable, Equatable, Identifiable {
    public let id: String                    // = OutboxRecord.id
    public let kind: Kind
    public let titlePreview: String?         // extrait texte max 60 chars (peut être nil pour audio)
    public let iconKind: IconKind
    public let attachmentCount: Int          // pour badge "+N" (visible si > 1)
    public let source: Source                // pour double-tap routing
    public let status: OutboxStatus          // pending | inflight | failed | exhausted
    public let createdAt: Date

    public enum Kind: Sendable, Equatable {
        case message, reaction, edit, delete
        case story, postComment, postReaction
        case other(String)
    }

    public enum IconKind: Sendable, Equatable {
        case text, audio, image, video, file, reaction, sticker, none
    }

    public enum Source: Sendable, Equatable {
        case conversation(id: String)
        case post(id: String)
        case story(id: String)
        case unknown
    }
}
```

### 4.2 Mapping `OutboxRecord.kind` → `OutboxUIItem`

| OutboxRecord.kind   | UIItem.kind   | IconKind                                        | Source                          |
|---------------------|---------------|-------------------------------------------------|---------------------------------|
| `.sendMessage`      | `.message`    | `.text` / `.audio` / `.image` / `.video` / `.file` (selon payload) | `.conversation(conversationId)` |
| `.editMessage`      | `.edit`       | comme sendMessage                               | `.conversation(conversationId)` |
| `.deleteMessage`    | `.delete`     | `.text` (libellé « Suppression… »)              | `.conversation(conversationId)` |
| `.sendReaction`     | `.reaction`   | `.reaction` (emoji dans titlePreview)           | `.conversation(conversationId)` |
| `.sendStory`        | `.story`      | `.image` / `.video` selon média                 | `.story(storyId)`               |
| `.sendPostComment`  | `.postComment`| `.text` / `.audio`                              | `.post(postId)`                 |
| `.sendPostReaction` | `.postReaction`| `.reaction`                                    | `.post(postId)`                 |
| autres (block, profile…) | `.other(rawKind)` | `.none`                                  | `.unknown`                      |

`titlePreview` :
- texte → tronqué à 60 chars + ellipsis
- audio sans transcription → `"🎙 Note vocale"`
- image-only → `"📷 Image"`
- vidéo-only → `"🎞 Vidéo"`
- fichier-only → `"📎 Fichier"`
- reaction → l'emoji

### 4.3 Publisher SDK additif

`packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift` — extension non-breaking :

```swift
nonisolated let pendingUIItemsSubject = SendableCurrentValueSubject<[OutboxUIItem]>([])

nonisolated public var pendingUIItemsPublisher: AnyPublisher<[OutboxUIItem], Never> {
    pendingUIItemsSubject.eraseToAnyPublisher()
}

private func refreshPendingUIItems() async {
    // Lit OutboxRecord WHERE status IN (.pending, .inflight, .failed) ORDER BY createdAt
    // Mappe via OutboxUIItem.from(record:)
    // Émet sur pendingUIItemsSubject
}
```

Appelé après chaque mutation (enqueue, retry attempt, success, exhausted, manual cancel). Décodage payload **une fois par mutation** (pas par frame UI).

---

## 5. Fix Bug 1 — enqueue séquentiel garanti

### 5.1 Refactor `ConversationViewModel.sendMessage`

`apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1637-1780` :

```swift
@MainActor
func sendMessage(...) async -> Bool {
    guard !isSending else { return false }       // guard PARTAGÉ online + offline
    isSending = true
    defer { isSending = false }                  // libère en cas de throw

    let clientMessageId = UUID().uuidString
    let bubble = MessageBubble(.sending, clientMessageId: clientMessageId, ...)
    messageStore.insertOptimistic(bubble)        // UI feedback SYNCHRONE immédiat

    if NetworkMonitor.shared.isOffline {
        do {
            try await OfflineQueue.shared.enqueue(queueItem)   // AWAITED
            return true
        } catch {
            messageStore.markFailed(clientMessageId, error: error)
            return false
        }
    }

    // Online : write-ahead enqueue + flusher prend le relais
    do {
        try await OfflineQueue.shared.enqueue(queueItem)
        return true
    } catch {
        messageStore.markFailed(clientMessageId, error: error)
        return false
    }
}
```

### 5.2 Points-clés du fix

1. **`isSending` partagé** : un seul guard, libéré par `defer`. Bouton « Envoyer » désactivé pendant `isSending` (déjà câblé via `@Published`). Coût UX : ~10-20 ms d'enqueue actor pendant lequel un 2ᵉ tap est ignoré → imperceptible pour une frappe humaine (intervalle minimum ~80 ms).
2. **`messageStore.insertOptimistic` synchrone AVANT `await enqueue`** : bulle visible instantanément. Même si l'enqueue prend 100 ms, l'utilisateur a son feedback.
3. **`try await enqueue` (plus `try?`)** : les erreurs GRDB remontent. `markFailed` met la bulle en état rouge tappable « réessayer ».
4. **Write-ahead aussi en online** : single code path → élimine la classe entière de bugs « online → offline pendant l'envoi ». Aligné sur `2026-05-08-ios-conversation-list-cache-offline-design.md` § 6.
5. **`OfflineQueue` est déjà un actor** → sérialisation FIFO de `enqueue()` native, aucun semaphore custom.

### 5.3 Propagation aux autres entry points

Refactor mécanique à appliquer (chaque fichier reçoit un `guard !isSending else { return }` et change `Task { try? await }` en `try await`) :

- `PostCommentViewModel.sendComment(...)`
- `StoryComposerViewModel.publishStory(...)`
- `MessageEditViewModel.saveEdit(...)`
- `ReactionToggleViewModel.toggle(...)`

Listage exact à effectuer pendant le writing-plans via `grep -rn "Task { try? await OfflineQueue.shared" apps/ios/`.

---

## 6. Réutilisation maximale — inventaire

| Existant                                | Action            | Justification                                                                   |
|-----------------------------------------|-------------------|---------------------------------------------------------------------------------|
| `OfflineQueue` actor                    | **Étendu**        | + `pendingUIItemsPublisher` + `refreshPendingUIItems`. APIs existantes intactes |
| `OutboxRecord` GRDB                     | **Lu** seulement  | Aucun changement de schéma                                                      |
| `OfflineQueueItem` mirror               | **Conservé**      | Sert hot retry path (sendMessage uniquement), pas consommé par UI               |
| `NetworkMonitor.isOffline`              | **Étendu**        | + `isOfflinePublisher` avec debounce 500 ms                                     |
| `ConnectionStatusViewModel`             | **Conservé**      | Pilote d'autres micro-indicateurs (header conversation, etc.)                   |
| `ConnectionBanner.syncingPill` (privée) | **Extraite**      | Promote en `SyncPillCapsule` réutilisable                                       |
| `ConnectionBanner.disconnectedPill/offlinePill` | **Supprimées** | Remplacées par états `.offline`/`.failed` de SyncPill                       |
| `OfflineBanner.swift` (toast rouge)     | **Supprimé**      | Pastille en `.offline` couvre 100 %                                             |
| `MeeshyColors`                          | **Étendu**        | + 8 tokens pastel + tokens pill background light/dark                           |
| `MessageStore`                          | **Étendu**        | + `insertOptimistic`, `markFailed` (réutilise si déjà câblé)                    |
| `ToastManager` (in-app)                 | **Inchangé**      | Couche supérieure, indépendant                                                  |
| `Logger`/`AppLogger`                    | **Réutilisé**     | Traces enqueue + state transitions                                              |

### Création nette (5 fichiers SDK/app + extensions)

1. `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxUIItem.swift`
2. `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift`
3. `apps/ios/Meeshy/Features/Main/Components/SyncPillRotator.swift`
4. `apps/ios/Meeshy/Features/Main/ViewModels/SyncPillViewModel.swift`
5. `apps/ios/Meeshy/Features/Main/Routing/SyncPillRouter.swift`

Le reste = extensions / additions ciblées sur l'existant.

---

## 7. Composant `SyncPill` — détails visuels

### 7.1 Hiérarchie

```
SyncPillHost (observe SyncPillViewModel.state)
└─ SyncPill(state)
   ├─ SyncPillCapsule  : chrome (background pastel ou alert, blur 8pt, shadow soft)
   ├─ SyncPillIcon     : SFSymbol 12 pt — text.bubble.fill / mic.fill / photo.fill / play.rectangle.fill / paperclip.fill / face.smiling.fill
   ├─ SyncPillTitle    : « Synchronisation » | « Hors ligne — N en attente » | « Échec — N à réessayer »
   ├─ SyncPillCounter  : « 1/3 » si plusieurs items
   └─ SyncPillRotator
      └─ SyncPillItemView (1 visible à la fois)
         ├─ icon kind tinté pastel-foncé
         ├─ titlePreview (tronqué à 28 chars selon largeur)
         ├─ badge attachmentCount (« +2 » si > 1)
         └─ status overlay (exclamationmark.circle.fill 10 pt si .failed)
```

### 7.2 Animation rotation

| Phase                      | Durée    |
|----------------------------|----------|
| Fade-in message N          | 250 ms   |
| Hold message N affiché     | 2200 ms  |
| Fade-out message N         | 250 ms   |
| Cross-fade → message N+1   | 0 ms gap |

Cycle par message ≈ 2.7 s. Implémentation : `Timer` + `@State currentIndex` + transition `.opacity.combined(with: .move(edge: .top))`.

- Pause auto si **1 seul item**.
- Reprise auto dès qu'un 2ᵉ arrive.
- Pause **utilisateur** 5 s sur `singleTap` (cf. § 8).

### 7.3 Palette pastel rotative

8 couleurs cyclées sur `index % 8` :

```swift
enum PastelPalette: Int, CaseIterable {
    case rose, lavande, menthe, peche, ciel, mimosa, lilas, sauge
}
```

- **Light mode** : saturation ~ 25 %, luminosité ~ 85 %.
- **Dark mode** : luminosité abaissée à ~ 25 % + opacité chrome 0.85 (WCAG AA).
- 3 tokens dédiés dans `MeeshyColors` extension : `syncPillBackgroundLight/Dark`, `syncPillBorder`, `syncPillText`.

### 7.4 Bascule chrome selon `PillState`

| `PillState`  | Background                                                  | Icône               | Title                          | Rotation              |
|--------------|-------------------------------------------------------------|---------------------|--------------------------------|-----------------------|
| `.syncing`   | pastel courant + point pulsant indigo                       | kind de l'item      | « Synchronisation »            | active                |
| `.offline`   | gris-bleu doux (`#E4E7EB` / dark `#2C313A`)                 | `wifi.slash`        | « Hors ligne — N en attente »  | active si N > 1       |
| `.failed`    | rouge pâle (`#FEE2E2` / dark `#3F1B1B`)                     | `exclamationmark.triangle.fill` | « Échec — N à réessayer » | failed en priorité    |
| `.hidden`    | —                                                           | —                   | —                              | composant retiré      |

Toutes les transitions chrome : `.animation(.easeInOut(duration: 0.35), value: state)`.

### 7.5 Position & layout

- `.overlay(alignment: .top)` sur `RootView`.
- Padding top = `safeAreaInset.top + 8`.
- Padding horizontal = 16.
- Z-index : au-dessus des écrans, **sous** les toasts in-app (ToastManager conservé indépendant).
- Une seule instance globale dans toute l'app.

### 7.6 Accessibilité

- `accessibilityElement(children: .ignore)` + label dynamique : « 2 messages en cours d'envoi, premier : Bonjour Marie ».
- VoiceOver : la rotation visuelle ne réannonce pas tous les items (`accessibilityRespondsToUserInteraction(false)`), un nouveau label est posté à chaque rotation.
- **Reduce Motion** (`@Environment(\.accessibilityReduceMotion) == true`) :
  - Désactive la rotation auto.
  - Affiche compteur statique « 2/3 » + 1ᵉʳ item.
  - `DragGesture` horizontal : swipe gauche/droite pour passer item suivant/précédent.

---

## 8. Détection des états — `SyncPillViewModel`

### 8.1 Inputs combinés

```swift
@MainActor
final class SyncPillViewModel: ObservableObject {
    @Published private(set) var state: PillState = .hidden

    init(
        offlineQueue: OfflineQueueProviding = OfflineQueue.shared,
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared
    ) {
        Publishers.CombineLatest(
            offlineQueue.pendingUIItemsPublisher,
            networkMonitor.isOfflinePublisher
        )
        .map { items, isOffline in
            Self.derive(items: items, isOffline: isOffline)
        }
        .receive(on: DispatchQueue.main)
        .assign(to: &$state)
    }

    static func derive(
        items: [OutboxUIItem],
        isOffline: Bool,
        now: Date = Date()
    ) -> PillState {
        if items.contains(where: { $0.status == .failed }) {
            return .failed(items: items)
        }
        let hasStaleInflight = items.contains {
            $0.status == .inflight && now.timeIntervalSince($0.createdAt) > 4.0
        }
        if isOffline || hasStaleInflight {
            return .offline(items: items)
        }
        if !items.isEmpty {
            return .syncing(items: items)
        }
        return .hidden
    }
}
```

### 8.2 Suppression du délai 10 s

`NetworkMonitor` expose un publisher debouncé court (500 ms) :

```swift
nonisolated public var isOfflinePublisher: AnyPublisher<Bool, Never> {
    isOfflineSubject
        .removeDuplicates()
        .debounce(for: .milliseconds(500), scheduler: DispatchQueue.global())
        .eraseToAnyPublisher()
}
```

Le `ConnectionBanner.swift:38-60` `try? await Task.sleep(for: .seconds(10))` est **supprimé**.

### 8.3 Détection latence silencieuse

Réseau présent mais sockets timeout : `NetworkMonitor.isOffline` reste `false`. On bascule la pastille en `.offline` si **un item est en `.inflight` depuis > 4 s** (`hasStaleInflight` ci-dessus). 4 s = compromis (3 s = false positives sur 3G lent, 5 s = trop tardif, 10 s actuels = inacceptable).

`now` injectable → tests sans `Task.sleep`.

### 8.4 Récupération auto

- Reconnexion + items drainés → `.hidden` instantané (fade-out global de la pastille).
- Reconnexion mais items encore `.pending`/`.inflight` → reste `.syncing` jusqu'à drainage (déjà géré par `OutboxFlusher` sur reconnexion).
- Item passe `.applied` → retiré du publisher → rotation reflète la nouvelle liste.

---

## 9. Interactions — single tap, double tap, swipe

### 9.1 Single tap

- Comportement : avance manuellement à l'item suivant. Pause auto-rotation 5 s, puis reprise.
- Implémentation : `SyncPillRotator.advance()` + sub-Timer `userPaused: Bool`.

### 9.2 Double tap

- Comportement : ouvre l'objet source du message courant (conversation / post / story). Rotation en pause pendant la navigation.
- `SyncPillRouter` (singleton @MainActor) :

```swift
@MainActor public protocol SyncPillRouting {
    func open(_ source: OutboxUIItem.Source) async
}

@MainActor final class SyncPillRouter: SyncPillRouting {
    let tabRouter: TabRouting
    let conversationOpener: ConversationOpening
    let postOpener: PostOpening
    let storyOpener: StoryOpening

    func open(_ source: OutboxUIItem.Source) async {
        switch source {
        case .conversation(let id):
            tabRouter.switchTo(.conversations)
            await conversationOpener.open(conversationId: id)
        case .post(let id):
            tabRouter.switchTo(.feed)
            await postOpener.open(postId: id)
        case .story(let id):
            tabRouter.switchTo(.feed)
            await storyOpener.open(storyId: id)
        case .unknown:
            return
        }
    }
}
```

Les openers (`ConversationOpening`, `PostOpening`, `StoryOpening`) sont **existants** (ou des wrappers à découvrir pendant le writing-plans sur `MainTabViewModel` / `FeedNavigator` / `StoryNavigator`). On NE crée PAS un nouveau système de navigation ; on assemble.

### 9.3 Conflit `TapGesture` × `DoubleTapGesture`

Solution standard SwiftUI :

```swift
.gesture(
    SpatialTapGesture(count: 2).onEnded { _ in
        Task { await router.open(currentItem.source) }
    }
    .exclusively(before:
        SpatialTapGesture(count: 1).onEnded { _ in
            rotator.advance()
        }
    )
)
```

`.exclusively(before:)` : double tap prioritaire, single tap délivré ~ 250 ms après si pas de 2ᵉ tap. Latence acceptable (single tap = cosmétique).

### 9.4 Reduce Motion → swipe horizontal

```swift
.gesture(
    reduceMotion
    ? AnyGesture(DragGesture().onEnded { value in
        if value.translation.width < -30 { rotator.advance() }
        else if value.translation.width > 30 { rotator.rewind() }
    }.map { _ in () })
    : nil
)
```

Single et double tap restent actifs en Reduce Motion.

### 9.5 Long press

**Pas en v1** (YAGNI). VoiceOver lit déjà le label complet, le double-tap ouvre la conversation source.

---

## 10. Plan de tests (TDD)

### 10.1 Tests SDK — `packages/MeeshySDK/Tests/MeeshySDKTests/`

**`Persistence/OutboxUIItemMappingTests.swift`** (Swift Testing, mapping pur) — ~25 tests :
- 14 kinds × variants attachements
- truncation `titlePreview`
- placeholders audio/image/vidéo/fichier
- unknown kind → no-crash

**`Persistence/OfflineQueuePendingUIItemsPublisherTests.swift`** (XCTest + GRDB in-memory) :
- emit empty when queue empty
- emit one after enqueue sendMessage
- order by createdAt
- reflect status changes pending → inflight → applied
- include `.failed`, exclude `.exhausted`

**`Persistence/OfflineQueueConcurrentEnqueueTests.swift`** — régression directe bug 1 :
- 10 enqueues parallèles → 10 records persistés, IDs distincts
- même `clientMessageId` × 2 → coalesce
- enqueue throws → propage l'erreur

### 10.2 Tests app iOS — `apps/ios/MeeshyTests/`

**`Features/Main/ViewModels/SyncPillViewModelDeriveTests.swift`** (fonction pure) — 9 tests :
- hidden when empty + online
- syncing when pending + online
- offline when isOffline true (queue empty et non-empty)
- failed priority over offline + syncing
- offline from stale inflight > 4 s
- not offline below 4 s
- priority order final

**`Features/Main/ViewModels/ConversationViewModelOfflineQueueTests.swift`** — régression bug 1 (8 tests) :
- send while offline → bubble + enqueue
- two sends while offline → 2 bubbles + 2 enqueues
- 3ᵉ send pendant 1ᵉʳ sending → empilé, pas dropped
- enqueue throws → bubble .failed
- concurrent taps guardés par isSending
- preserve attachmentIds / replyToId / forwardedFromIds

**`Features/Main/Components/SyncPillRotatorTests.swift`** (MockClock) — 6 tests :
- advances on tick
- wraps to zero
- pause 5 s on user advance
- resume after 5 s
- pause when single item
- valid index on items change

**`Features/Main/Routing/SyncPillRouterTests.swift`** — 4 tests :
- open conversation → switch tab + opener
- open post → switch tab + opener
- open story → opener
- open unknown → no-op + log

### 10.3 Snapshot tests

**`Features/Main/Components/SyncPillSnapshotTests.swift`** — 11 snapshots :
- hidden, syncing single text, syncing multi rotation, offline, failed
- × light/dark
- × iPhone 16 Pro / iPhone SE (truncation)
- audio icon, image + badge +2
- Reduce Motion compact static

Baseline générée première run : `SNAPSHOT_TESTING_RECORD=YES`.

### 10.4 XCUITest — `apps/ios/MeeshyUITests/`

**`SyncPill/SyncPillUITests.swift`** — smoke E2E :
- send offline → pastille apparaît
- send 2 offline → rotation visible
- single tap → next
- double tap → ouvre conversation
- reconnect + drain → pastille disparaît

### 10.5 Tests existants conservés

- `OfflineQueueTests` (261 lignes), `OutboxFlusherTests`, `OutboxFlusherBandwidthGateTests`, `OfflineEditFlowTests`, `ConnectionStatusViewModelTests` — **0 régression tolérée**.

---

## 11. Critères de complétude

Avant de marquer toute tâche d'implémentation comme « done » :

- [ ] `./apps/ios/meeshy.sh build` vert
- [ ] `./apps/ios/meeshy.sh test` vert (app)
- [ ] Tests SDK : tous nouveaux verts + 0 régression sur 261 existants
- [ ] Snapshot baselines régénérées et committées
- [ ] Smoke manuel mode avion : 5 messages (texte, audio, image, vidéo, reply) → rotation, palette pastel, drainage
- [ ] Smoke manuel single tap → next item visuel
- [ ] Smoke manuel double tap → ouvre conversation
- [ ] Smoke manuel Reduce Motion ON → swipe horizontal OK
- [ ] Smoke manuel VoiceOver → label dynamique correct
- [ ] Aucune régression sur envoi online normal

---

## 12. Hors scope (v1)

- **Cancel/retry manuel par item** depuis la pastille (sera ajouté si demandé après usage).
- **Long press** sur la pastille (YAGNI).
- **Pastille étendue avec liste complète** (architecture le permet — `SyncPillRouter` peut ouvrir un bottom sheet — mais non demandé en v1).
- **Statistiques de file** (temps moyen d'envoi, taux d'échec…).
- **Pastille SUR-mesure par écran** (story plein écran, etc.). En v1 elle est globale partout ; les écrans plein-écran peuvent ajouter un `.allowsHitTesting(false)` localisé plus tard si conflit.

---

## 13. Risques & mitigations

| Risque                                                  | Probabilité | Impact | Mitigation                                                                                       |
|---------------------------------------------------------|-------------|--------|--------------------------------------------------------------------------------------------------|
| `OfflineQueue.refreshPendingUIItems` lent sur grosse file (100+ items) | faible      | moyen  | Limite GRDB `LIMIT 50` côté query UI + paginate. La rotation montre les 50 premiers seulement.   |
| `.exclusively(before:)` latence 250 ms ressentie        | faible      | faible | Si retour utilisateur négatif → custom timer (différé post-v1).                                  |
| Debounce 500 ms anti-flicker masque déconnexions très brèves | faible | faible  | Acceptable — la perception « offline » a besoin de stabilité ; flicker visuel pire que latence. |
| Conflit pastille avec toasts in-app                     | faible      | faible | Z-index hiérarchique : ToastManager > SyncPill > écrans (déjà séparés).                          |
| OutboxRecord schema change cassant `OutboxUIItem.from`  | faible      | élevé  | Couvert par tests de mapping (25 tests) + `case .other(String)` fallback no-crash.               |
| Reduce Motion + double tap simultanés                   | faible      | faible | Gestures cumulables, indépendants. Testé.                                                        |
| Régression sur features non-message (story, post) lors du refactor `Task { try? await }` → `try await` | moyenne | élevé | Inventaire exhaustif `grep -rn` pendant writing-plans + tests dédiés par feature. |

---

## 14. Références

- `docs/superpowers/specs/2026-05-08-ios-conversation-list-cache-offline-design.md` § 6 « Offline queue renforcée et clientMessageId end-to-end »
- `docs/superpowers/specs/2026-03-17-architecture-bible-design.md` Principe I1 (cache-first), I3 (optimistic updates)
- `CLAUDE.md` § Instant App Principles (cache-first, SWR, optimistic, single source of truth)
- `packages/MeeshySDK/CLAUDE.md` § SDK Purity
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift:341-369` (publisher patterns existants)
- `apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift` (pastille à étendre / parties à supprimer)
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1637-1780` (entry point bug 1)
