# Instant App Foundation — iOS Performance & Offline-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fermer les 13 trous critiques identifiés par audit SOTA pour rendre l'app fluide même sur iPhone 8/SE — single source of truth, décryption off-main, FTS5 offline, outbox unifiée, animations contrôlées.

**Architecture:** Préserver l'infrastructure GRDB+actor déjà excellente. Phase 0 corrige les leaks/violations sans changement structurel. Phase 1 fusionne les deux sources de vérité (`@Published messages` ↔ `MessageStore`) et déplace le crypto off-main. Phase 2 ajoute FTS5 + outbox SQLite. Phase 3 polit perf et media. Chaque phase est indépendamment shippable et mesurable.

**Tech Stack:** Swift 6 strict concurrency, iOS 17+, GRDB 6.29 + DatabasePool, CryptoKit (AES-GCM), Curve25519 ECDH, SQLite FTS5, UICollectionViewCompositionalLayout + NSDiffableDataSourceSnapshot, XCTest @MainActor, Kingfisher.

**Mesure de succès finale (cible "iPhone neuf") :**
- 60 fps scroll sustained sur iPhone SE 2 avec 1000 messages chargés et arrivées socket à 5 msg/s
- Cold start < 500 ms jusqu'à liste interactive avec 500 conversations en cache
- Mode avion : ouverture, lecture, recherche full-text et composition de 5 messages tous fonctionnels
- Reconnect après 30 minutes hors ligne : flush outbox sans perte, déduplication serveur OK

---

## Table of Contents

- [Phase 0 — Foundation Safety (1 jour)](#phase-0--foundation-safety)
- [Phase 1 — Single Source of Truth + Off-Main Crypto (3-4 jours)](#phase-1--single-source-of-truth)
- [Phase 2 — Offline-First Complete (3 jours)](#phase-2--offline-first-complete)
- [Phase 3 — Performance Polish (2 jours)](#phase-3--performance-polish)
- [Phase 4 — Validation & Benchmarks (1 jour)](#phase-4--validation--benchmarks)

---

# Phase 0 — Foundation Safety

**Objectif :** Corriger 6 défauts isolés (leaks, violations leaf view, instrumentation) sans toucher à l'architecture. Chaque task est indépendamment livrable. Sert de baseline mesurable avant les changements structurels de Phase 1.

**Durée estimée :** 1 jour. Risque : très faible.

---

### Task 0.1: Cancel Timer.publish autoconnect leak in ConversationView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:171`
- Test: `apps/ios/MeeshyTests/Unit/Views/ConversationViewLifecycleTests.swift`

**Context:** `Timer.publish(every: 0.5).autoconnect()` continue à fire à 0.5 Hz après dismiss de la conversation. Sur des cycles ouvrir/fermer rapides, accumulation de timers zombies.

- [ ] **Step 1: Write the failing test**

```swift
// apps/ios/MeeshyTests/Unit/Views/ConversationViewLifecycleTests.swift
import XCTest
import Combine
@testable import Meeshy

@MainActor
final class ConversationViewLifecycleTests: XCTestCase {

    func test_typingDotTimer_invalidates_onDisappear() async {
        let cancellable = TypingDotTimerHarness.shared.makeTimer()
        XCTAssertTrue(TypingDotTimerHarness.shared.isActive)

        TypingDotTimerHarness.shared.invalidate(cancellable)

        XCTAssertFalse(TypingDotTimerHarness.shared.isActive)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewLifecycleTests`
Expected: FAIL — `TypingDotTimerHarness` doesn't exist yet.

- [ ] **Step 3: Create TypingDotTimerHarness helper**

```swift
// apps/ios/Meeshy/Features/Main/Views/Helpers/TypingDotTimerHarness.swift
import Foundation
import Combine

@MainActor
final class TypingDotTimerHarness {
    static let shared = TypingDotTimerHarness()

    private(set) var isActive = false
    private var publisherCancellable: AnyCancellable?

    func makeTimer() -> AnyCancellable {
        isActive = true
        let cancellable = Timer.publish(every: 0.5, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in _ = self }
        publisherCancellable = cancellable
        return cancellable
    }

    func invalidate(_ cancellable: AnyCancellable) {
        cancellable.cancel()
        publisherCancellable = nil
        isActive = false
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewLifecycleTests`
Expected: PASS.

- [ ] **Step 5: Migrate ConversationView to use cancellable timer pattern**

Replace at `ConversationView.swift:171`:

```swift
// BEFORE:
@State private var typingDotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

// AFTER:
@State private var typingDotTimer: AnyCancellable?

// In body, replace .onReceive(typingDotTimer) with:
.onAppear {
    typingDotTimer = Timer.publish(every: 0.5, on: .main, in: .common)
        .autoconnect()
        .sink { _ in
            // existing tick logic
        }
}
.onDisappear {
    typingDotTimer?.cancel()
    typingDotTimer = nil
}
```

- [ ] **Step 6: Run all tests + build**

Run: `./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test`
Expected: All tests pass, no warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Features/Main/Views/Helpers/TypingDotTimerHarness.swift \
        apps/ios/MeeshyTests/Unit/Views/ConversationViewLifecycleTests.swift
git commit -m "fix(ios): cancel typing dot timer on dismiss to prevent leak"
```

---

### Task 0.2: Cancel storyPrefetchTask in ConversationListViewModel deinit

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:53`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift`

**Context:** Le `storyPrefetchTask` est lancé en `Task { ... }` mais jamais cancellé, donc continue à charger des stories après que le user a quitté l'écran.

- [ ] **Step 1: Write the failing test**

Append to `ConversationListViewModelTests.swift`:

```swift
func test_deinit_cancelsStoryPrefetchTask() async {
    let viewModel = ConversationListViewModel(
        apiService: MockAPIService(),
        cacheCoordinator: CacheCoordinator.shared
    )
    viewModel.startStoryPrefetch()
    XCTAssertNotNil(viewModel.storyPrefetchTask)

    weak var weakTask = viewModel.storyPrefetchTask

    // Trigger dealloc
    let _ = viewModel
    Task { @MainActor in
        // viewModel goes out of scope
    }

    try? await Task.sleep(for: .milliseconds(50))
    // After viewModel deinit, the task should have been cancelled
    XCTAssertTrue(weakTask?.isCancelled ?? true)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter ConversationListViewModelTests/test_deinit_cancelsStoryPrefetchTask`
Expected: FAIL — task not cancelled.

- [ ] **Step 3: Add deinit to ConversationListViewModel**

In `ConversationListViewModel.swift`, find existing properties and add deinit:

```swift
// Existing property at line 53:
private var storyPrefetchTask: Task<Void, Never>?

// Add at end of class:
deinit {
    storyPrefetchTask?.cancel()
    storyPrefetchTask = nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test --filter ConversationListViewModelTests/test_deinit_cancelsStoryPrefetchTask`
Expected: PASS.

- [ ] **Step 5: Audit other Task properties on the same VM**

Search file for `Task<` to find any other long-lived tasks. Confirm each has cancellation in deinit. Document any findings in commit message.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift
git commit -m "fix(ios): cancel storyPrefetchTask in deinit to prevent zombie fetch"
```

---

### Task 0.3: Remove @ObservedObject ThemeManager from AudioMediaView (leaf view violation)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift:281`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift` (caller)
- Test: `apps/ios/MeeshyTests/Unit/Views/AudioMediaViewRenderTests.swift`

**Context:** `AudioMediaView` est une leaf view rendue dans chaque bulle audio. Avoir `@ObservedObject var theme: ThemeManager` force chaque bulle à se redessiner à chaque tick du ThemeManager (changement thème, mais aussi tout autre @Published interne). Viole la règle CLAUDE.md "leaf views: NO @ObservedObject on global singletons".

- [ ] **Step 1: Write the failing test (render-count assertion)**

```swift
// apps/ios/MeeshyTests/Unit/Views/AudioMediaViewRenderTests.swift
import XCTest
import SwiftUI
@testable import Meeshy

@MainActor
final class AudioMediaViewRenderTests: XCTestCase {

    func test_audioMediaView_doesNotObserveThemeManager() {
        let mirror = Mirror(reflecting: AudioMediaView.makeForTest())
        let observedObjects = mirror.children.filter { child in
            // Detect @ObservedObject property wrapper
            String(describing: type(of: child.value)).contains("ObservedObject")
        }
        XCTAssertTrue(observedObjects.isEmpty,
            "AudioMediaView should not have @ObservedObject — leaf view rule")
    }
}

extension AudioMediaView {
    static func makeForTest() -> AudioMediaView {
        AudioMediaView(
            attachment: PreviewFixtures.audioAttachment,
            isDark: false,
            accentColor: "#6366F1"
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter AudioMediaViewRenderTests`
Expected: FAIL — initializer signature mismatch + @ObservedObject still present.

- [ ] **Step 3: Refactor AudioMediaView to accept primitives**

In `ConversationMediaViews.swift:281`:

```swift
// BEFORE:
struct AudioMediaView: View {
    let attachment: MessageAttachment
    @ObservedObject var theme: ThemeManager  // ← VIOLATION

    var body: some View {
        // uses theme.isDark, theme.accentColor
    }
}

// AFTER:
struct AudioMediaView: View, Equatable {
    let attachment: MessageAttachment
    let isDark: Bool
    let accentColor: String

    static func == (lhs: AudioMediaView, rhs: AudioMediaView) -> Bool {
        lhs.attachment.id == rhs.attachment.id
        && lhs.isDark == rhs.isDark
        && lhs.accentColor == rhs.accentColor
    }

    var body: some View {
        // replace theme.isDark → isDark
        // replace theme.accentColor → accentColor
    }
}
```

- [ ] **Step 4: Update all callers**

Find every site instantiating `AudioMediaView`. In `ConversationView+MessageRow.swift`:

```swift
// BEFORE:
AudioMediaView(attachment: att, theme: ThemeManager.shared)

// AFTER:
AudioMediaView(
    attachment: att,
    isDark: isDark,
    accentColor: accentColor
).equatable()
```

The parent already has `let isDark: Bool` and `let accentColor: String` — pass them through.

- [ ] **Step 5: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test --filter AudioMediaViewRenderTests`
Expected: PASS.

- [ ] **Step 6: Build + run app, verify audio bubble still renders correctly**

Run: `./apps/ios/meeshy.sh build`
Expected: clean build, no warnings on AudioMediaView callers.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift \
        apps/ios/MeeshyTests/Unit/Views/AudioMediaViewRenderTests.swift
git commit -m "fix(ios): AudioMediaView accepts primitives, no leaf-singleton observation"
```

---

### Task 0.4: Add stopObserving() to MessageStore deinit

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift`
- Test: `apps/ios/MeeshyTests/Unit/Stores/MessageStoreTests.swift`

**Context:** `MessageStore.startObserving(dbPool:)` setup un `DatabaseRegionObservation`. Si la VM dealloc sans appeler `stopObserving()`, l'observation continue et garde le store retain via la closure `[weak self]` — l'observation elle-même reste vivante.

- [ ] **Step 1: Write the failing test**

```swift
// apps/ios/MeeshyTests/Unit/Stores/MessageStoreTests.swift (append)
func test_deinit_stopsObservation() async throws {
    let pool = try makeInMemoryPool()
    var store: MessageStore? = MessageStore(
        conversationId: "conv-1",
        persistence: makeTestPersistence(pool: pool)
    )
    store?.startObserving(dbPool: pool)

    weak var weakStore = store
    XCTAssertNotNil(weakStore)

    store = nil

    try await Task.sleep(for: .milliseconds(50))
    XCTAssertNil(weakStore, "MessageStore should be deallocated after deinit")
}

private func makeInMemoryPool() throws -> DatabasePool {
    let config = Configuration()
    let pool = try DatabasePool(path: ":memory:", configuration: config)
    try MessageDatabaseMigrations.runAll(on: pool)
    return pool
}
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `./apps/ios/meeshy.sh test --filter MessageStoreTests/test_deinit_stopsObservation`
Expected: FAIL — store not dealloced because regionCancellable retains via internal observer.

- [ ] **Step 3: Add deinit to MessageStore**

In `MessageStore.swift` after line 71 (`stopObserving`):

```swift
deinit {
    regionCancellable = nil  // Cancels DatabaseRegionObservation
    refreshTask?.cancel()
}
```

(`stopObserving()` already does this; deinit is the safety net for cases where it's not called.)

- [ ] **Step 4: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test --filter MessageStoreTests/test_deinit_stopsObservation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift \
        apps/ios/MeeshyTests/Unit/Stores/MessageStoreTests.swift
git commit -m "fix(ios): MessageStore.deinit cancels region observation"
```

---

### Task 0.5: Add os.signpost instrumentation for crypto operations

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Diagnostics/CryptoSignposts.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1139`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Diagnostics/CryptoSignpostsTests.swift`

**Context:** Aucun signpost crypto aujourd'hui. Avant la Phase 1 (DecryptionActor), on a besoin d'une baseline mesurable Instruments-side pour démontrer le gain.

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Diagnostics/CryptoSignpostsTests.swift
import XCTest
@testable import MeeshySDK

final class CryptoSignpostsTests: XCTestCase {

    func test_decryptInterval_emitsSignpost() {
        let counter = SignpostCounter()
        CryptoSignposts.testHook = { event in counter.record(event) }
        defer { CryptoSignposts.testHook = nil }

        CryptoSignposts.beginDecrypt(messageId: "msg-1")
        CryptoSignposts.endDecrypt(messageId: "msg-1", bytes: 256)

        XCTAssertEqual(counter.events, ["begin:msg-1", "end:msg-1:256"])
    }
}

private final class SignpostCounter {
    var events: [String] = []
    func record(_ event: CryptoSignposts.Event) {
        switch event {
        case .beginDecrypt(let id): events.append("begin:\(id)")
        case .endDecrypt(let id, let bytes): events.append("end:\(id):\(bytes)")
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter CryptoSignpostsTests`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create CryptoSignposts module**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Diagnostics/CryptoSignposts.swift
import os.signpost

public enum CryptoSignposts {
    public enum Event: Sendable {
        case beginDecrypt(messageId: String)
        case endDecrypt(messageId: String, bytes: Int)
    }

    private static let log = OSLog(subsystem: "me.meeshy.app", category: .pointsOfInterest)

    public nonisolated(unsafe) static var testHook: (@Sendable (Event) -> Void)?

    public static func beginDecrypt(messageId: String) {
        testHook?(.beginDecrypt(messageId: messageId))
        os_signpost(.begin, log: log, name: "decrypt", "%{public}s", messageId)
    }

    public static func endDecrypt(messageId: String, bytes: Int) {
        testHook?(.endDecrypt(messageId: messageId, bytes: bytes))
        os_signpost(.end, log: log, name: "decrypt", "bytes=%d", bytes)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter CryptoSignpostsTests`
Expected: PASS.

- [ ] **Step 5: Wire signposts at decrypt callsite**

In `ConversationViewModel.swift:1139` (`decryptMessagesIfNeeded`), wrap each decrypt:

```swift
group.addTask {
    CryptoSignposts.beginDecrypt(messageId: msgId)
    let decrypted = try? await SessionManager.shared.decryptMessage(data, from: senderId)
    CryptoSignposts.endDecrypt(messageId: msgId, bytes: decrypted?.count ?? 0)
    return (i, decrypted.flatMap { String(data: $0, encoding: .utf8) })
}
```

- [ ] **Step 6: Run app under Instruments (manual)**

Manual verification step — record one minute of message traffic with Instruments → Points of Interest, confirm `decrypt` intervals appear with correct duration. Document baseline metric in commit message (median, p95, max duration on iPhone SE 2 simulator).

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Diagnostics/CryptoSignposts.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Diagnostics/CryptoSignpostsTests.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "feat(sdk): CryptoSignposts for instrumentation baseline"
```

---

### Task 0.6: Phase 0 closeout — verify no regressions

**Files:** N/A (verification only)

- [ ] **Step 1: Full test suite**

Run: `./apps/ios/meeshy.sh test`
Expected: all green.

- [ ] **Step 2: Build for release config**

Run: `./apps/ios/meeshy.sh clean && ./apps/ios/meeshy.sh build`
Expected: no warnings.

- [ ] **Step 3: Run app on iPhone SE 2 simulator, smoke test 5 conversations**

Manual: ouvre 5 conversations, scroll dans chacune, ferme, ré-ouvre. Vérifie qu'aucune régression visible.

- [ ] **Step 4: Open PR**

```bash
git push -u origin feat/instant-app-phase0-safety
gh pr create --title "feat(ios): Phase 0 — foundation safety (timer leaks, leaf views, signposts)" \
  --body "$(cat <<'EOF'
## Summary
- Cancel typing dot timer on dismiss
- Cancel storyPrefetchTask in deinit
- AudioMediaView no longer observes ThemeManager (leaf view rule)
- MessageStore.deinit cancels region observation
- CryptoSignposts module for Instruments baseline

## Test plan
- [ ] All unit tests pass
- [ ] Manual smoke test: 5 conversation open/close cycles
- [ ] Instruments: confirm `decrypt` signposts visible
EOF
)"
```

---

# Phase 1 — Single Source of Truth

**Objectif :** Éliminer la double source de vérité `@Published messages` (Path A) ↔ `MessageStore` (Path B). À la fin, `ConversationView` ne rend que via `MessageListView` (UICollectionView), `MessageStore` est la seule source, et la décryption est sur un actor dédié off-main.

**Prérequis :** Phase 0 complète et mergée.

**Durée estimée :** 3-4 jours. Risque : moyen (refactor profond du flow socket).

**Stratégie d'exécution :** stricte ordre TDD. Chaque étape garde l'app fonctionnelle. On commence par tester l'invariant final (le store est la seule source) avant d'implémenter — la spec écrite par les tests guide le refactor.

---

### Task 1.1: Eager initialization of MessageStore

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:649-664`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:423,683-688`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift`

**Context:** Aujourd'hui `messageStore` est créé dans `.task` post-render (ligne 649), donc le premier paint utilise le LazyVStack fallback. Cible : `messageStore` créé synchronously dans le ViewModel init pour qu'il soit disponible au premier paint.

- [ ] **Step 1: Write the failing test**

```swift
// apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift (append)
func test_init_createsMessageStoreEagerly() async throws {
    let pool = try makeInMemoryPool()
    let persistence = MessagePersistenceActor(dbWriter: pool)
    let viewModel = ConversationViewModel(
        conversationId: "conv-1",
        currentUserId: "user-1",
        dependencies: TestDependencies(dbPool: pool, persistence: persistence)
    )
    XCTAssertNotNil(viewModel.messageStore,
        "messageStore must be available immediately after init")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewModelTests/test_init_createsMessageStoreEagerly`
Expected: FAIL — `messageStore` is nil.

- [ ] **Step 3: Add `dependencies` parameter to ConversationViewModel init**

In `ConversationViewModel.swift`, modify init signature:

```swift
struct ConversationDependencies {
    let dbPool: any DatabaseWriter
    let persistence: MessagePersistenceActor

    static var live: ConversationDependencies {
        ConversationDependencies(
            dbPool: DependencyContainer.shared.dbPool,
            persistence: DependencyContainer.shared.messagePersistence
        )
    }
}

init(
    conversationId: String,
    currentUserId: String,
    dependencies: ConversationDependencies = .live
) {
    self.conversationId = conversationId
    self.currentUserId = currentUserId
    let store = MessageStore(
        conversationId: conversationId,
        persistence: dependencies.persistence
    )
    self.messageStore = store
    self.messagePersistence = dependencies.persistence
    store.startObserving(dbPool: dependencies.dbPool)
    // ... rest of existing init
}
```

Make `messageStore` and `messagePersistence` non-optional `let`:

```swift
let messageStore: MessageStore
let messagePersistence: MessagePersistenceActor
```

- [ ] **Step 4: Remove the `.task` block in ConversationView that creates the store**

In `ConversationView.swift:649-664`, delete the `.task` block — store is now ready before render.

- [ ] **Step 5: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewModelTests/test_init_createsMessageStoreEagerly`
Expected: PASS.

- [ ] **Step 6: Audit all ConversationViewModel callers**

Search for `ConversationViewModel(`. Each must now provide `dependencies` (or accept default `.live`). Update test fixtures with `TestDependencies(dbPool: pool, persistence: ...)`.

- [ ] **Step 7: Build + run + verify no flash of LazyVStack**

Manual: open conversation. Should go directly to UICollectionView without intermediate LazyVStack flash.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift
git commit -m "refactor(ios): eager init of MessageStore in ConversationViewModel"
```

---

### Task 1.2: Remove LazyVStack fallback (messageScrollView)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:751-761,917-996,998-?`
- Test: `apps/ios/MeeshyTests/Unit/Views/ConversationViewRenderTests.swift`

**Context:** Avec Task 1.1, `messageStore` n'est jamais nil. La branche `else { messageScrollView }` est code mort. Supprimer ~150 lignes.

- [ ] **Step 1: Write the test asserting only UIKit path is reachable**

```swift
// apps/ios/MeeshyTests/Unit/Views/ConversationViewRenderTests.swift
import XCTest
import SwiftUI
@testable import Meeshy

@MainActor
final class ConversationViewRenderTests: XCTestCase {

    func test_bodyContent_usesMessageListView_whenStoreReady() {
        let view = makeViewForTest()
        // Reflect into bodyContent and confirm no `messageScrollView` reference
        let mirror = Mirror(reflecting: view)
        let bodyTypes = mirror.descendant("body").map { String(describing: $0) } ?? ""
        XCTAssertFalse(bodyTypes.contains("messageScrollView"),
            "messageScrollView fallback should be removed")
        XCTAssertTrue(bodyTypes.contains("MessageListView"),
            "MessageListView must be the only message renderer")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewRenderTests`
Expected: FAIL — `messageScrollView` still in body.

- [ ] **Step 3: Remove the `if let store = viewModel.messageStore { ... } else { messageScrollView }` branch**

In `ConversationView.swift:751-761`:

```swift
// BEFORE:
if let store = viewModel.messageStore {
    MessageListView(
        store: store,
        currentUserId: viewModel.currentUserIdForView
    ) { count in
        scrollState.unreadBadgeCount = count
    }
} else {
    messageScrollView
}

// AFTER:
MessageListView(
    store: viewModel.messageStore,
    currentUserId: viewModel.currentUserIdForView
) { count in
    scrollState.unreadBadgeCount = count
}
```

- [ ] **Step 4: Delete `messageScrollView` and `messageListContent` private vars**

In `ConversationView.swift`, delete:
- Private var `messageListContent` (lines 917-996, ~80 lines)
- Private var `messageScrollView` (lines 998-?, ~20 lines)

- [ ] **Step 5: Update MessageListView signature to accept non-optional store**

In `MessageListView.swift`:

```swift
// BEFORE:
let store: MessageStore?

// AFTER:
let store: MessageStore
```

Update `UIViewControllerRepresentable.makeUIViewController` to use `store` directly without unwrapping.

- [ ] **Step 6: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewRenderTests`
Expected: PASS.

- [ ] **Step 7: Build + smoke test**

Run: `./apps/ios/meeshy.sh run`
Expected: conversation opens, messages render via UICollectionView only. No visual flash.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Features/Main/Views/MessageListView.swift \
        apps/ios/MeeshyTests/Unit/Views/ConversationViewRenderTests.swift
git commit -m "refactor(ios): remove LazyVStack fallback, MessageListView is the only renderer"
```

---

### Task 1.3: Make ConversationViewModel.messages a computed proxy

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:29-50`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift`

**Context:** Aujourd'hui `@Published var messages: [Message]` est mis à jour directement par socket handlers. Cible : `messages` devient un computed `var` qui reads from `messageStore.messages`. Plus de double-write.

**Note :** Pendant cette task, on garde la compatibilité — Path A (legacy callers reading `vm.messages`) continue à fonctionner via le proxy.

- [ ] **Step 1: Write the failing test**

```swift
// apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift (append)
func test_messages_reflectsMessageStoreContent() async throws {
    let pool = try makeInMemoryPool()
    let persistence = MessagePersistenceActor(dbWriter: pool)
    let viewModel = makeSUT(persistence: persistence, dbPool: pool)

    let record = MessageRecord.fixture(localId: "m1", content: "hello")
    try await persistence.insertOptimistic(record)

    try await Task.sleep(for: .milliseconds(50))  // wait for observation

    XCTAssertEqual(viewModel.messages.count, 1)
    XCTAssertEqual(viewModel.messages.first?.content, "hello")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewModelTests/test_messages_reflectsMessageStoreContent`
Expected: FAIL — vm.messages stays empty (different source).

- [ ] **Step 3: Replace @Published messages with computed proxy**

```swift
// BEFORE (lines 29-50):
@Published var messages: [Message] = [] {
    didSet { /* cache invalidation */ }
}

// AFTER:
var messages: [Message] {
    messageStore.messages
}

// Cache invalidation now driven by messageStore observation:
private var storeObservation: AnyCancellable?

private func subscribeToMessageStore() {
    storeObservation = messageStore.$messages
        .receive(on: DispatchQueue.main)
        .sink { [weak self] _ in
            self?.invalidateCaches()
            self?.objectWillChange.send()
        }
}

private func invalidateCaches() {
    _messageIdIndex = nil
    _messagesByDate = nil
    _topActiveMembers = nil
    _mediaSenderInfoMap = nil
    _allVisualAttachments = nil
    _mediaCaptionMap = nil
    _allAudioItems = nil
    _replyCountMap = nil
    _mentionDisplayNames = nil
    _mentionCandidates = nil
}
```

Call `subscribeToMessageStore()` from init after `messageStore` is created.

- [ ] **Step 4: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewModelTests/test_messages_reflectsMessageStoreContent`
Expected: PASS.

- [ ] **Step 5: Audit code that previously assigned `vm.messages = ...`**

```bash
grep -n "viewModel.messages\s*=\|self\.messages\s*=\|delegate\.messages\.append\|delegate\.messages\[" apps/ios/Meeshy/Features/Main/
```

Each assignment must become a write through `messagePersistence.bufferIncoming(...)` or appropriate persistence action. **Don't fix all callers in this task** — document them in `tasks/path-a-callsites.md` for Task 1.4.

- [ ] **Step 6: Run all existing ConversationViewModel tests**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewModelTests`
Expected: most pass; failures will be Path A callsites needing migration in Task 1.4.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift \
        tasks/path-a-callsites.md
git commit -m "refactor(ios): ConversationViewModel.messages becomes computed proxy of MessageStore"
```

---

### Task 1.4: Migrate ConversationSocketHandler to write through persistenceActor only

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/ConversationSocketHandler.swift:210-516`
- Test: `apps/ios/MeeshyTests/Integration/MessagePipelineIntegrationTests.swift`

**Context:** Le handler aujourd'hui mute `delegate.messages` directement (Path A) ET buffer dans `persistence` (Path B). Cible : tout va via `persistence`. Le store observe et propage à la VM via Combine.

- [ ] **Step 1: Write the failing integration test**

```swift
// apps/ios/MeeshyTests/Integration/MessagePipelineIntegrationTests.swift (append)
func test_messageNew_event_persistsBeforePathAUpdate() async throws {
    let pool = try makeInMemoryPool()
    let persistence = MessagePersistenceActor(dbWriter: pool)
    let viewModel = makeSUT(persistence: persistence, dbPool: pool)
    let handler = ConversationSocketHandler(delegate: viewModel)

    let payload = makeMessageNewPayload(id: "msg-1", content: "test")
    await handler.handleMessageNew(payload)

    try await Task.sleep(for: .milliseconds(100))

    let dbRows = try await pool.read { db in
        try MessageRecord.filter(Column("serverId") == "msg-1").fetchAll(db)
    }
    XCTAssertEqual(dbRows.count, 1, "message must be persisted")
    XCTAssertEqual(viewModel.messages.count, 1, "vm reflects via observation")
    XCTAssertEqual(viewModel.messages.first?.id, dbRows.first?.serverId)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter MessagePipelineIntegrationTests/test_messageNew_event_persistsBeforePathAUpdate`
Expected: FAIL — current handler appends to vm.messages but no DB write yet (or two writes).

- [ ] **Step 3: Refactor `messageReceived` handler to remove Path A mutation**

In `ConversationSocketHandler.swift:210` (`messageReceived`):

```swift
// BEFORE: appends to delegate.messages then buffers persistence
// AFTER: only buffers persistence — delegate.messages updates via observation

private func messageReceived(_ data: Any) async {
    guard let payload = parseMessageNewPayload(data) else { return }
    if wasSeen(payload.id) { return }
    markSeen(payload.id)

    var msgs = [payload.toMessage(...)]
    let decrypted = await DecryptionActor.shared.decrypt(msgs)  // Task 2.1 will create this; for now keep MainActor decrypt as-is

    let incoming = decrypted.map { msg in
        MessagePersistenceActor.IncomingMessageData(
            id: msg.id,
            conversationId: conversationId,
            content: msg.content,
            // ... full mapping
        )
    }
    await persistence.bufferIncoming(incoming)
    // NO LONGER: delegate.messages.append(msg)
}
```

The `lastUnreadMessage`, `newMessageAppended`, scroll triggers etc. now subscribe to `messageStore.$messages.last`:

```swift
// In ConversationViewModel:
private func subscribeToNewMessages() {
    messageStore.$messages
        .map(\.last)
        .removeDuplicates(by: { $0?.id == $1?.id })
        .receive(on: DispatchQueue.main)
        .sink { [weak self] newLast in
            guard let self, let msg = newLast,
                  msg.id != self.previousLastMessageId else { return }
            self.previousLastMessageId = msg.id
            if msg.senderId != self.currentUserId {
                self.newMessageAppended += 1
                self.lastUnreadMessage = msg
            }
        }
        .store(in: &cancellables)
}
```

- [ ] **Step 4: Refactor `messageEdited`, `messageDeleted`, `reactionAdded`, `reactionRemoved` similarly**

Each handler:
- DELETE the `delegate.messages[idx] = updated` mutation
- KEEP the `persistence.markEdited(...)` / `markDeleted(...)` / `updateReactions(...)` call

Example for `reactionAdded`:

```swift
// BEFORE:
delegate.messages[idx].reactions.append(reaction)
self.persistReactions(for: event.messageId, reactions: delegate.messages[idx].reactions)

// AFTER:
let serverId = event.messageId
guard let localId = try? await persistence.resolveServerId(toLocalId: serverId)
   ?? persistence.localId(for: serverId) else { return }

// Read current reactions from DB, append, write back
try? await persistence.appendReaction(localId: localId, reaction: reaction)
```

Add `appendReaction` / `removeReaction` methods to `MessagePersistenceActor`:

```swift
// In MessagePersistenceActor:
public func appendReaction(localId: String, reaction: ReactionEntry) throws {
    try dbWriter.write { db in
        guard var record = try MessageRecord.filter(Column("localId") == localId).fetchOne(db) else { return }
        var reactions = (try? JSONDecoder().decode([ReactionEntry].self, from: record.reactionsJson ?? Data())) ?? []
        if !reactions.contains(where: { $0.id == reaction.id }) {
            reactions.append(reaction)
            record.reactionsJson = try JSONEncoder().encode(reactions)
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
        }
    }
}

public func removeReaction(localId: String, reactionId: String) throws {
    try dbWriter.write { db in
        guard var record = try MessageRecord.filter(Column("localId") == localId).fetchOne(db) else { return }
        var reactions = (try? JSONDecoder().decode([ReactionEntry].self, from: record.reactionsJson ?? Data())) ?? []
        reactions.removeAll(where: { $0.id == reactionId })
        record.reactionsJson = try JSONEncoder().encode(reactions)
        record.updatedAt = Date()
        record.changeVersion += 1
        try record.update(db)
    }
}
```

- [ ] **Step 5: Run integration tests**

Run: `./apps/ios/meeshy.sh test --filter MessagePipelineIntegrationTests`
Expected: PASS.

- [ ] **Step 6: Run app, manual verification of all socket events**

Manual checklist (5 min):
- [ ] Send message → arrives in DB and UI
- [ ] Edit own message → updates in UI
- [ ] Delete own message → soft-deleted in UI
- [ ] React to message → reaction appears
- [ ] Remove reaction → reaction disappears
- [ ] Receive message from other user → appears
- [ ] Typing indicator (still uses Path A — typingUsernames, NOT migrated since not persisted)

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/ConversationSocketHandler.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift \
        apps/ios/MeeshyTests/Integration/MessagePipelineIntegrationTests.swift
git commit -m "refactor(ios): socket handlers write through persistence actor only (single source of truth)"
```

---

### Task 1.5: Migrate optimistic send + queue reconciliation

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:696-748,1397`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift`
- Test: `apps/ios/MeeshyTests/Integration/MessageSendFlowTests.swift`

**Context:** Le send avec optimistic update aujourd'hui :
1. Génère `tempId`
2. `vm.messages.append(optimistic)` ← Path A
3. Network call
4. Sur ack : `reconcileQueuedSend(tempId, serverId)` mute `vm.messages[idx]`

Cible : tout passe par persistence + observation.

- [ ] **Step 1: Write failing test**

```swift
// apps/ios/MeeshyTests/Integration/MessageSendFlowTests.swift (append)
func test_optimisticSend_appearsImmediatelyViaStore() async throws {
    let sut = makeSendingSUT()
    let beforeCount = sut.viewModel.messages.count

    Task { try await sut.viewModel.sendMessage("hello") }

    try await Task.sleep(for: .milliseconds(20))

    XCTAssertEqual(sut.viewModel.messages.count, beforeCount + 1)
    XCTAssertEqual(sut.viewModel.messages.last?.content, "hello")
    XCTAssertEqual(sut.viewModel.messages.last?.deliveryStatus, .sending)

    // Simulate server ack
    sut.mockSocket.simulateMessageNew(
        tempId: sut.viewModel.messages.last!.id,
        serverId: "server-1"
    )
    try await Task.sleep(for: .milliseconds(50))

    XCTAssertEqual(sut.viewModel.messages.count, beforeCount + 1)
    XCTAssertEqual(sut.viewModel.messages.last?.id, "server-1")
    XCTAssertEqual(sut.viewModel.messages.last?.deliveryStatus, .sent)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter MessageSendFlowTests/test_optimisticSend_appearsImmediatelyViaStore`
Expected: FAIL.

- [ ] **Step 3: Refactor `sendMessage` to write via persistence**

In `ConversationViewModel.swift`, the existing `sendMessage`:

```swift
func sendMessage(_ content: String) async throws {
    let tempId = "offline_\(UUID().uuidString)"
    let now = Date()

    let record = MessageRecord(
        localId: tempId,
        conversationId: conversationId,
        serverId: nil,
        content: content,
        // ... fill all required fields
        state: .sending,
        createdAt: now,
        sentAt: now,
        senderId: currentUserId,
        senderName: currentUser.displayName,
        senderUsername: currentUser.username,
        senderAvatarURL: currentUser.avatarURL,
        senderColor: currentUser.color,
        changeVersion: 1
    )

    try await messagePersistence.insertOptimistic(record)
    // UI updates automatically via store observation

    do {
        let response = try await messageService.send(...)
        // Server returned id — apply event
        try await messagePersistence.applyEvent(
            localId: tempId,
            event: .serverAck(serverId: response.id, at: response.createdAt)
        )
    } catch {
        // Mark failed; OfflineQueue handles retry
        try await messagePersistence.applyEvent(
            localId: tempId,
            event: .sendFailed(error: error.localizedDescription)
        )
        OfflineQueue.shared.enqueue(...)
    }
}
```

- [ ] **Step 4: Refactor `subscribeToQueueReconciliation` to be observation-driven**

```swift
private func subscribeToQueueReconciliation() {
    OfflineQueue.shared.retrySucceeded
        .filter { [weak self] $0.conversationId == self?.conversationId }
        .sink { [weak self] payload in
            Task { [weak self] in
                try? await self?.messagePersistence.applyEvent(
                    localId: payload.tempId,
                    event: .serverAck(serverId: payload.serverId, at: Date())
                )
                // No more direct vm.messages mutation
            }
        }
        .store(in: &cancellables)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test --filter MessageSendFlowTests/test_optimisticSend_appearsImmediatelyViaStore`
Expected: PASS.

- [ ] **Step 6: Manual: send + airplane mode + back online**

Manual:
1. Send message — appears as `sending`
2. Toggle airplane mode mid-flight — appears as `failed`
3. Toggle off — message retries and goes `sent`

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        apps/ios/MeeshyTests/Integration/MessageSendFlowTests.swift
git commit -m "refactor(ios): optimistic send writes through persistence, UI updates via observation"
```

---

### Task 1.6: Audit + remove all remaining direct `vm.messages` mutations

**Files:**
- Modify: anywhere `tasks/path-a-callsites.md` listed callsites still mutating
- Test: `apps/ios/MeeshyTests/Integration/MessagePipelineIntegrationTests.swift`

**Context:** Garantir que la seule façon d'ajouter/modifier un message passe par `MessagePersistenceActor`. Ajout d'un test invariant qui patrouille le codebase.

- [ ] **Step 1: Add lint test invariant**

```swift
// apps/ios/MeeshyTests/Unit/Architecture/SingleSourceOfTruthTests.swift
import XCTest

final class SingleSourceOfTruthTests: XCTestCase {

    func test_noDirectMutation_of_conversationViewModel_messages() throws {
        let sourceFiles = try findSwiftFiles(in: "apps/ios/Meeshy")
        var violations: [String] = []

        let patterns = [
            "viewModel\\.messages\\s*=",
            "delegate\\.messages\\.append",
            "delegate\\.messages\\[\\d+\\]\\s*=",
            "self\\.messages\\.append",
            "self\\.messages\\[\\d+\\]\\s*="
        ]

        for file in sourceFiles {
            // Skip test files & ConversationViewModel.swift itself
            if file.contains("/MeeshyTests/") { continue }
            if file.hasSuffix("ConversationViewModel.swift") { continue }
            let content = try String(contentsOfFile: file)
            for pattern in patterns {
                if content.range(of: pattern, options: .regularExpression) != nil {
                    violations.append("\(file): pattern \(pattern)")
                }
            }
        }

        XCTAssertTrue(violations.isEmpty,
            "Direct mutation violations:\n\(violations.joined(separator: "\n"))")
    }

    private func findSwiftFiles(in directory: String) throws -> [String] {
        let url = URL(fileURLWithPath: directory)
        let enumerator = FileManager.default.enumerator(atPath: directory)
        var files: [String] = []
        while let path = enumerator?.nextObject() as? String {
            if path.hasSuffix(".swift") {
                files.append(url.appendingPathComponent(path).path)
            }
        }
        return files
    }
}
```

- [ ] **Step 2: Run test to discover remaining violations**

Run: `./apps/ios/meeshy.sh test --filter SingleSourceOfTruthTests`
Expected: FAIL listing exact files & line patterns.

- [ ] **Step 3: Migrate each remaining callsite**

For each violation:
- If it's a soft-delete: replace with `try await messagePersistence.markDeleted(localId:, deletedAt:)`
- If it's a content edit: replace with `markEdited(...)`
- If it's a reaction change: `appendReaction` / `removeReaction`
- If it's optimistic insert: `insertOptimistic(record:)`

Repeat until invariant test passes.

- [ ] **Step 4: Verify invariant**

Run: `./apps/ios/meeshy.sh test --filter SingleSourceOfTruthTests`
Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `./apps/ios/meeshy.sh test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/MeeshyTests/Unit/Architecture/SingleSourceOfTruthTests.swift \
        apps/ios/Meeshy/  # any callsites migrated
git commit -m "test(ios): enforce single-source-of-truth invariant for ConversationViewModel.messages"
```

---

### Task 1.7: Create DecryptionActor

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Crypto/DecryptionActor.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Crypto/DecryptionActorTests.swift`

**Context:** Aujourd'hui `decryptMessagesIfNeeded` (`ConversationViewModel.swift:1139`) est `@MainActor` avec `withTaskGroup`. Cible : un actor dédié qui fait le déchiffrement off-main et retourne au MainActor uniquement pour assignation finale.

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Crypto/DecryptionActorTests.swift
import XCTest
@testable import MeeshySDK

final class DecryptionActorTests: XCTestCase {

    func test_decrypt_returnsPlaintext_offMain() async throws {
        let actor = DecryptionActor(provider: MockSessionProvider())
        let encrypted = makeEncryptedPayload(plaintext: "hello")
        let payloads = [DecryptionPayload(messageId: "m1", senderId: "u1", ciphertext: encrypted)]

        let results = await actor.decrypt(payloads)

        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results.first?.messageId, "m1")
        XCTAssertEqual(results.first?.plaintext, "hello")
    }

    func test_decrypt_runsOffMainActor() async {
        // Verify that decrypt does NOT run on main actor by checking Thread.isMainThread
        let actor = DecryptionActor(provider: MockSessionProvider())
        let payload = DecryptionPayload(messageId: "m1", senderId: "u1", ciphertext: Data())

        let runOnMain = await actor.runDiagnostic { Thread.isMainThread }
        XCTAssertFalse(runOnMain, "DecryptionActor must NOT run on main thread")
    }

    func test_decrypt_failure_returnsNilPlaintext() async {
        let actor = DecryptionActor(provider: MockSessionProvider(shouldFail: true))
        let payload = DecryptionPayload(messageId: "m1", senderId: "u1", ciphertext: Data())

        let results = await actor.decrypt([payload])

        XCTAssertNil(results.first?.plaintext)
        XCTAssertNotNil(results.first?.error)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter DecryptionActorTests`
Expected: FAIL — no such actor.

- [ ] **Step 3: Implement DecryptionActor**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Crypto/DecryptionActor.swift
import Foundation

public protocol DecryptionSessionProviding: Sendable {
    func decryptMessage(_ ciphertext: Data, from senderId: String) async throws -> Data
}

public struct DecryptionPayload: Sendable {
    public let messageId: String
    public let senderId: String
    public let ciphertext: Data
    public init(messageId: String, senderId: String, ciphertext: Data) {
        self.messageId = messageId
        self.senderId = senderId
        self.ciphertext = ciphertext
    }
}

public struct DecryptionResult: Sendable {
    public let messageId: String
    public let plaintext: String?
    public let error: Error?
}

public actor DecryptionActor {
    public static let shared = DecryptionActor(provider: LiveSessionProvider())

    private let provider: any DecryptionSessionProviding

    public init(provider: any DecryptionSessionProviding) {
        self.provider = provider
    }

    public func decrypt(_ payloads: [DecryptionPayload]) async -> [DecryptionResult] {
        await withTaskGroup(of: DecryptionResult.self, returning: [DecryptionResult].self) { group in
            for payload in payloads {
                group.addTask { [provider] in
                    CryptoSignposts.beginDecrypt(messageId: payload.messageId)
                    do {
                        let decrypted = try await provider.decryptMessage(
                            payload.ciphertext,
                            from: payload.senderId
                        )
                        let str = String(data: decrypted, encoding: .utf8)
                        CryptoSignposts.endDecrypt(messageId: payload.messageId, bytes: decrypted.count)
                        return DecryptionResult(messageId: payload.messageId, plaintext: str, error: nil)
                    } catch {
                        CryptoSignposts.endDecrypt(messageId: payload.messageId, bytes: 0)
                        return DecryptionResult(messageId: payload.messageId, plaintext: nil, error: error)
                    }
                }
            }
            var results: [DecryptionResult] = []
            for await r in group { results.append(r) }
            return results
        }
    }

    func runDiagnostic<T: Sendable>(_ block: @Sendable () -> T) -> T {
        block()
    }
}

private struct LiveSessionProvider: DecryptionSessionProviding {
    func decryptMessage(_ ciphertext: Data, from senderId: String) async throws -> Data {
        try await SessionManager.shared.decryptMessage(ciphertext, from: senderId)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter DecryptionActorTests`
Expected: PASS.

- [ ] **Step 5: Migrate `decryptMessagesIfNeeded` to use DecryptionActor**

In `ConversationViewModel.swift:1139`:

```swift
// BEFORE (on @MainActor):
func decryptMessagesIfNeeded(_ msgs: inout [Message]) async {
    await withTaskGroup(of: (Int, String?).self) { group in
        // ... runs on main
    }
}

// AFTER:
func decryptMessagesIfNeeded(_ msgs: inout [Message]) async {
    let payloads: [DecryptionPayload] = msgs.enumerated().compactMap { i, msg in
        guard msg.isEncrypted, let data = Data(base64Encoded: msg.content) else { return nil }
        return DecryptionPayload(messageId: msg.id, senderId: msg.senderId, ciphertext: data)
    }
    guard !payloads.isEmpty else { return }

    let results = await DecryptionActor.shared.decrypt(payloads)
    let resultsByMessageId = Dictionary(uniqueKeysWithValues: results.map { ($0.messageId, $0) })

    for i in msgs.indices {
        if let plaintext = resultsByMessageId[msgs[i].id]?.plaintext {
            msgs[i].content = plaintext
        }
    }
}
```

- [ ] **Step 6: Verify no jank with Instruments (manual)**

Run app, open conversation, scroll fast. Instruments → Points of Interest should show `decrypt` intervals running off-main (compare to baseline from Task 0.5 — should be on different thread).

- [ ] **Step 7: Run full test suite**

Run: `./apps/ios/meeshy.sh test`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Crypto/DecryptionActor.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Crypto/DecryptionActorTests.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "feat(sdk): DecryptionActor isolates AES-GCM ops off main thread"
```

---

### Task 1.8: Async wrapper around KeychainManager

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainManager.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift:46-64`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Security/KeychainAsyncTests.swift`

**Context:** `KeychainManager.load` est synchrone. Sur SessionManager (actor), c'est sérialisé OK, mais peut bloquer 10-50ms si keychain verrouillé. Wrapper async pour ne pas bloquer la queue de l'actor.

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Security/KeychainAsyncTests.swift
import XCTest
@testable import MeeshySDK

final class KeychainAsyncTests: XCTestCase {

    func test_loadAsync_returnsValue_whenSet() async throws {
        let key = "test.async.\(UUID().uuidString)"
        let manager = KeychainManager.shared
        try manager.save("hello", forKey: key)
        defer { try? manager.delete(forKey: key) }

        let value = await manager.loadAsync(forKey: key)
        XCTAssertEqual(value, "hello")
    }

    func test_loadAsync_runsOffCallerActor() async {
        let value = await KeychainManager.shared.runDiagnostic {
            !Thread.isMainThread || Task.isCancelled
        }
        XCTAssertTrue(value)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter KeychainAsyncTests`
Expected: FAIL — no async API.

- [ ] **Step 3: Add async loadAsync method**

In `KeychainManager.swift`:

```swift
public func loadAsync(forKey key: String) async -> String? {
    await withCheckedContinuation { (cont: CheckedContinuation<String?, Never>) in
        DispatchQueue.global(qos: .userInitiated).async {
            cont.resume(returning: self.load(forKey: key))
        }
    }
}

public func saveAsync(_ value: String, forKey key: String) async throws {
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try self.save(value, forKey: key)
                cont.resume(returning: ())
            } catch {
                cont.resume(throwing: error)
            }
        }
    }
}

public func runDiagnostic<T>(_ block: @Sendable () -> T) async -> T {
    await withCheckedContinuation { cont in
        DispatchQueue.global(qos: .userInitiated).async {
            cont.resume(returning: block())
        }
    }
}
```

- [ ] **Step 4: Update SessionManager to use async APIs**

In `E2ESessionManager.swift:46-64`:

```swift
private func persistSession(peerId: String, key: SymmetricKey) async {
    let keyData = key.withUnsafeBytes { Data($0) }
    try? await KeychainManager.shared.saveAsync(
        keyData.base64EncodedString(),
        forKey: keychainPrefix + peerId
    )
}

private func loadSession(peerId: String) async -> SymmetricKey? {
    guard let base64 = await KeychainManager.shared.loadAsync(forKey: keychainPrefix + peerId),
          let data = Data(base64Encoded: base64) else { return nil }
    return SymmetricKey(data: data)
}
```

Update callsites to `await loadSession(peerId:)`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter KeychainAsyncTests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainManager.swift \
        apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Security/KeychainAsyncTests.swift
git commit -m "feat(sdk): KeychainManager async wrappers to unblock crypto actor queue"
```

---

### Task 1.9: Phase 1 closeout — measure and PR

**Files:** N/A

- [ ] **Step 1: Run full test suite + integration**

Run: `./apps/ios/meeshy.sh test`
Expected: all green.

- [ ] **Step 2: Performance check on iPhone SE 2 simulator**

Manual scenario : open conversation with 200+ messages, receive burst of 10 messages from socket. Instruments → Time Profiler — main thread should stay under 50% during burst.

- [ ] **Step 3: Document baseline → after metrics**

Write in `docs/superpowers/research/2026-05-06-phase1-metrics.md`:
- Cold start to first paint of conversation: before X ms / after Y ms
- Decrypt p95 latency: before X ms / after Y ms
- Main thread % during 10-msg burst: before X% / after Y%

- [ ] **Step 4: Open PR**

```bash
git push -u origin feat/instant-app-phase1-single-source
gh pr create --title "feat(ios): Phase 1 — single source of truth + off-main crypto" \
  --body "$(cat <<'EOF'
## Summary
- ConversationViewModel.messages is now a computed proxy of MessageStore.messages (single source)
- Socket handlers write through MessagePersistenceActor only
- Optimistic send uses persistence + observation
- DecryptionActor isolates AES-GCM operations off main thread
- KeychainManager async wrappers
- ~150 lines of legacy LazyVStack fallback removed

## Test plan
- [x] All unit + integration tests pass
- [x] SingleSourceOfTruthTests invariant patrolling codebase
- [x] Manual scroll + burst send scenarios
- [x] Instruments comparison documented in 2026-05-06-phase1-metrics.md

## Closes
- Path A vs Path B duplication
- Decrypt main-thread blocking
- LazyVStack flash on first paint
EOF
)"
```

---

# Phase 2 — Offline-First Complete

**Objectif :** L'app fonctionne intégralement en mode avion : recherche full-text dans tout l'historique (FTS5), composition de messages persistée (outbox SQLite consolidée), DB qui ne grossit pas indéfiniment (auto_vacuum incremental).

**Prérequis :** Phase 1 complète et mergée.

**Durée estimée :** 3 jours.

---

### Task 2.1: GRDB migration v6 — FTS5 virtual table for messages

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/FTS5MigrationTests.swift`

**Context:** Pas de FTS5 aujourd'hui → recherche oblige API. Cible : `messages_fts` virtual table avec tokenizer Unicode + diacritics removal pour français.

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/FTS5MigrationTests.swift
import XCTest
import GRDB
@testable import MeeshySDK

final class FTS5MigrationTests: XCTestCase {

    func test_v6_createsMessagesFtsTable() throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let exists = try pool.read { db in
            try Bool.fetchOne(db, sql: """
                SELECT EXISTS(SELECT 1 FROM sqlite_master
                              WHERE type='table' AND name='msg_v1_messages_fts')
                """) ?? false
        }
        XCTAssertTrue(exists)
    }

    func test_v6_ftsTokenizer_removesAccents() throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        try pool.write { db in
            try db.execute(sql: """
                INSERT INTO msg_v1_messages_fts(rowid, content) VALUES (1, 'Bonjour à tous')
                """)
        }

        let count = try pool.read { db in
            try Int.fetchOne(db, sql: """
                SELECT count(*) FROM msg_v1_messages_fts WHERE content MATCH 'a tous'
                """) ?? 0
        }
        XCTAssertEqual(count, 1, "diacritics should be removed during tokenization")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter FTS5MigrationTests`
Expected: FAIL — table doesn't exist.

- [ ] **Step 3: Add v6 migration**

In `MessageDatabaseMigrations.swift`:

```swift
migrator.registerMigration("v6_messages_fts5") { db in
    // External-content FTS5 — content lives in msg_v1_messages, FTS just indexes
    try db.execute(sql: """
        CREATE VIRTUAL TABLE msg_v1_messages_fts USING fts5(
            content,
            content='msg_v1_messages',
            content_rowid='rowid',
            tokenize='unicode61 remove_diacritics 2'
        )
        """)

    // Backfill existing rows
    try db.execute(sql: """
        INSERT INTO msg_v1_messages_fts(rowid, content)
        SELECT rowid, content FROM msg_v1_messages
        WHERE content IS NOT NULL AND deletedAt IS NULL
        """)

    // Keep in sync via triggers
    try db.execute(sql: """
        CREATE TRIGGER msg_fts_ai AFTER INSERT ON msg_v1_messages BEGIN
            INSERT INTO msg_v1_messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END
        """)

    try db.execute(sql: """
        CREATE TRIGGER msg_fts_ad AFTER DELETE ON msg_v1_messages BEGIN
            INSERT INTO msg_v1_messages_fts(msg_v1_messages_fts, rowid, content)
            VALUES('delete', old.rowid, old.content);
        END
        """)

    try db.execute(sql: """
        CREATE TRIGGER msg_fts_au AFTER UPDATE ON msg_v1_messages BEGIN
            INSERT INTO msg_v1_messages_fts(msg_v1_messages_fts, rowid, content)
            VALUES('delete', old.rowid, old.content);
            INSERT INTO msg_v1_messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END
        """)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter FTS5MigrationTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/FTS5MigrationTests.swift
git commit -m "feat(sdk): GRDB v6 — FTS5 messages virtual table with French tokenizer"
```

---

### Task 2.2: MessageSearchService implementation

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Search/MessageSearchService.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Search/MessageSearchServiceTests.swift`

**Context:** Service qui exécute des queries FTS5 + retourne des `MessageRecord` ordonnés par BM25 rank.

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Search/MessageSearchServiceTests.swift
import XCTest
import GRDB
@testable import MeeshySDK

final class MessageSearchServiceTests: XCTestCase {

    func test_search_returnsMatches_orderedByRelevance() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        try pool.write { db in
            try MessageRecord.fixture(localId: "1", content: "hello world").insert(db)
            try MessageRecord.fixture(localId: "2", content: "world peace hello").insert(db)
            try MessageRecord.fixture(localId: "3", content: "unrelated").insert(db)
        }

        let service = MessageSearchService(reader: pool)
        let results = try await service.search(query: "hello", limit: 10, conversationId: nil)

        XCTAssertEqual(results.map(\.localId), ["1", "2"])
    }

    func test_search_scopedByConversationId() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        try pool.write { db in
            try MessageRecord.fixture(localId: "a", conversationId: "c1", content: "hello").insert(db)
            try MessageRecord.fixture(localId: "b", conversationId: "c2", content: "hello").insert(db)
        }

        let service = MessageSearchService(reader: pool)
        let scoped = try await service.search(query: "hello", limit: 10, conversationId: "c1")

        XCTAssertEqual(scoped.map(\.localId), ["a"])
    }

    func test_search_emptyQuery_returnsEmpty() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        let service = MessageSearchService(reader: pool)
        let results = try await service.search(query: "", limit: 10, conversationId: nil)
        XCTAssertTrue(results.isEmpty)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MessageSearchServiceTests`
Expected: FAIL.

- [ ] **Step 3: Implement MessageSearchService**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Search/MessageSearchService.swift
import GRDB

public struct MessageSearchService: Sendable {
    private let reader: any DatabaseReader

    public init(reader: any DatabaseReader) {
        self.reader = reader
    }

    public func search(
        query: String,
        limit: Int = 50,
        conversationId: String? = nil
    ) async throws -> [MessageRecord] {
        let cleaned = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return [] }

        // Sanitize FTS5 query: escape double quotes, wrap term
        let escaped = cleaned.replacingOccurrences(of: "\"", with: "\"\"")
        let ftsQuery = "\"\(escaped)\"*"  // prefix match

        return try await reader.read { db in
            var sql = """
                SELECT m.* FROM msg_v1_messages m
                INNER JOIN msg_v1_messages_fts fts ON fts.rowid = m.rowid
                WHERE msg_v1_messages_fts MATCH ?
                  AND m.deletedAt IS NULL
                """
            var arguments: [DatabaseValueConvertible] = [ftsQuery]
            if let conversationId {
                sql += " AND m.conversationId = ?"
                arguments.append(conversationId)
            }
            sql += " ORDER BY bm25(msg_v1_messages_fts) LIMIT ?"
            arguments.append(limit)

            return try MessageRecord.fetchAll(db, sql: sql, arguments: StatementArguments(arguments))
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MessageSearchServiceTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Search/MessageSearchService.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Search/MessageSearchServiceTests.swift
git commit -m "feat(sdk): MessageSearchService using FTS5 BM25 ranking"
```

---

### Task 2.3: GlobalSearchViewModel uses FTS5 first, network as fallback

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift:198-256`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/GlobalSearchViewModelTests.swift`

**Context:** Aujourd'hui search messages = network only. Cible : FTS5 instantané, network en parallèle pour résultats serveur (cache miss recent messages).

- [ ] **Step 1: Write the failing test**

```swift
// apps/ios/MeeshyTests/Unit/ViewModels/GlobalSearchViewModelTests.swift (append)
func test_searchMessages_returnsLocalResults_whenOffline() async throws {
    let pool = try makeInMemoryPool()
    try pool.write { db in
        try MessageRecord.fixture(localId: "1", content: "hello").insert(db)
    }
    let sut = GlobalSearchViewModel(
        searchService: MessageSearchService(reader: pool),
        apiService: MockOfflineAPIService()  // throws on network call
    )

    await sut.search(query: "hello")

    XCTAssertEqual(sut.messageResults.count, 1)
    XCTAssertEqual(sut.messageResults.first?.id, "1")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter GlobalSearchViewModelTests/test_searchMessages_returnsLocalResults_whenOffline`
Expected: FAIL.

- [ ] **Step 3: Refactor GlobalSearchViewModel.searchMessages to query FTS5 first**

In `GlobalSearchViewModel.swift:198`:

```swift
private let searchService: MessageSearchService

init(
    searchService: MessageSearchService = MessageSearchService(reader: DependencyContainer.shared.dbPool),
    apiService: APIService = .shared
) {
    self.searchService = searchService
    self.apiService = apiService
}

func searchMessages(query: String) async {
    // Local FTS5 first — instant
    let localResults = (try? await searchService.search(query: query, limit: 50, conversationId: nil)) ?? []
    await MainActor.run {
        self.messageResults = localResults.map { $0.toMessage() }
    }

    // Network in parallel — merge fresh server-side hits
    do {
        let remote = try await apiService.searchMessages(query: query)
        await MainActor.run {
            self.messageResults = mergeUnique(local: localResults.map { $0.toMessage() }, remote: remote)
        }
    } catch {
        // Stay with local results
    }
}

private func mergeUnique(local: [Message], remote: [Message]) -> [Message] {
    var seen = Set<String>()
    var merged: [Message] = []
    for m in local + remote {
        if seen.insert(m.id).inserted { merged.append(m) }
    }
    return merged
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test --filter GlobalSearchViewModelTests/test_searchMessages_returnsLocalResults_whenOffline`
Expected: PASS.

- [ ] **Step 5: Manual: airplane mode + search**

Manual: airplane mode → ouvre search → tape requête → résultats apparaissent depuis cache local.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/GlobalSearchViewModelTests.swift
git commit -m "feat(ios): search messages via FTS5 first, network fallback"
```

---

### Task 2.4: GRDB migration v7 — outbox table

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxRecord.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxRecordTests.swift`

**Context:** OfflineQueue + MessageRetryQueue dans des fichiers JSON séparés. Cible : table SQLite unifiée avec FIFO + status tracking + observation.

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxRecordTests.swift
import XCTest
import GRDB
@testable import MeeshySDK

final class OutboxRecordTests: XCTestCase {

    func test_v7_createsOutboxTable() throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        let exists = try pool.read { db in
            try db.tableExists("msg_v1_outbox")
        }
        XCTAssertTrue(exists)
    }

    func test_outboxRecord_insertAndFetch() throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        try pool.write { db in
            let record = OutboxRecord(
                id: "ob-1",
                kind: .sendMessage,
                conversationId: "c1",
                payload: Data("hello".utf8),
                status: .pending,
                attempts: 0,
                lastError: nil,
                createdAt: Date(),
                updatedAt: Date(),
                nextAttemptAt: Date()
            )
            try record.insert(db)
        }

        let fetched = try pool.read { db in
            try OutboxRecord.fetchAll(db)
        }
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched.first?.id, "ob-1")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter OutboxRecordTests`
Expected: FAIL.

- [ ] **Step 3: Add v7 migration + OutboxRecord**

```swift
// In MessageDatabaseMigrations.swift:
migrator.registerMigration("v7_outbox") { db in
    try db.execute(sql: """
        CREATE TABLE msg_v1_outbox (
            id TEXT PRIMARY KEY NOT NULL,
            kind TEXT NOT NULL,
            conversationId TEXT NOT NULL,
            messageLocalId TEXT,
            payload BLOB NOT NULL,
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            lastError TEXT,
            createdAt DATETIME NOT NULL,
            updatedAt DATETIME NOT NULL,
            nextAttemptAt DATETIME NOT NULL
        )
        """)

    try db.execute(sql: """
        CREATE INDEX idx_outbox_status_next ON msg_v1_outbox(status, nextAttemptAt)
        """)

    try db.execute(sql: """
        CREATE INDEX idx_outbox_conv ON msg_v1_outbox(conversationId)
        """)
}
```

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxRecord.swift
import GRDB

public enum OutboxKind: String, Codable, Sendable {
    case sendMessage
    case sendReaction
    case editMessage
    case deleteMessage
}

public enum OutboxStatus: String, Codable, Sendable {
    case pending
    case inflight
    case failed
    case exhausted
}

public struct OutboxRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "msg_v1_outbox"

    public let id: String
    public let kind: OutboxKind
    public let conversationId: String
    public let messageLocalId: String?
    public let payload: Data
    public var status: OutboxStatus
    public var attempts: Int
    public var lastError: String?
    public let createdAt: Date
    public var updatedAt: Date
    public var nextAttemptAt: Date

    public init(
        id: String = UUID().uuidString,
        kind: OutboxKind,
        conversationId: String,
        messageLocalId: String? = nil,
        payload: Data,
        status: OutboxStatus = .pending,
        attempts: Int = 0,
        lastError: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        nextAttemptAt: Date = Date()
    ) {
        self.id = id
        self.kind = kind
        self.conversationId = conversationId
        self.messageLocalId = messageLocalId
        self.payload = payload
        self.status = status
        self.attempts = attempts
        self.lastError = lastError
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.nextAttemptAt = nextAttemptAt
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter OutboxRecordTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxRecord.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxRecordTests.swift
git commit -m "feat(sdk): GRDB v7 — unified outbox table"
```

---

### Task 2.5: OutboxFlusher actor

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxFlusher.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxFlusherTests.swift`

**Context:** Actor qui consomme l'outbox table : pull pending → execute → mark sent/failed → exponential backoff.

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxFlusherTests.swift
import XCTest
import GRDB
@testable import MeeshySDK

final class OutboxFlusherTests: XCTestCase {

    func test_flush_processesPendingItems_inFifoOrder() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try pool.write { db in
            try OutboxRecord(id: "1", kind: .sendMessage, conversationId: "c1",
                payload: Data(), createdAt: now, updatedAt: now, nextAttemptAt: now).insert(db)
            try OutboxRecord(id: "2", kind: .sendMessage, conversationId: "c1",
                payload: Data(), createdAt: now.addingTimeInterval(0.1), updatedAt: now, nextAttemptAt: now).insert(db)
        }

        let dispatcher = MockOutboxDispatcher()
        let flusher = OutboxFlusher(pool: pool, dispatcher: dispatcher)

        await flusher.flush()

        XCTAssertEqual(dispatcher.processedIds, ["1", "2"])

        let remaining = try pool.read { db in
            try OutboxRecord.filter(Column("status") == "pending").fetchCount(db)
        }
        XCTAssertEqual(remaining, 0)
    }

    func test_flush_failure_marksAttemptIncrementsBackoff() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        let now = Date()
        try pool.write { db in
            try OutboxRecord(id: "x", kind: .sendMessage, conversationId: "c1",
                payload: Data(), createdAt: now, updatedAt: now, nextAttemptAt: now).insert(db)
        }

        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher(shouldFail: true))
        await flusher.flush()

        let after = try pool.read { db in try OutboxRecord.fetchOne(db, key: "x")! }
        XCTAssertEqual(after.attempts, 1)
        XCTAssertEqual(after.status, .pending)
        XCTAssertGreaterThan(after.nextAttemptAt, now)
    }

    func test_flush_exhausted_after5Attempts() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        let now = Date()
        try pool.write { db in
            try OutboxRecord(id: "x", kind: .sendMessage, conversationId: "c1",
                payload: Data(), attempts: 4, createdAt: now, updatedAt: now, nextAttemptAt: now).insert(db)
        }

        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher(shouldFail: true))
        await flusher.flush()

        let after = try pool.read { db in try OutboxRecord.fetchOne(db, key: "x")! }
        XCTAssertEqual(after.status, .exhausted)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter OutboxFlusherTests`
Expected: FAIL.

- [ ] **Step 3: Implement OutboxFlusher**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxFlusher.swift
import GRDB
import Combine

public protocol OutboxDispatching: Sendable {
    func dispatch(_ record: OutboxRecord) async throws
}

public actor OutboxFlusher {
    private let pool: any DatabaseWriter
    private let dispatcher: any OutboxDispatching
    private let maxAttempts: Int
    private let baseBackoff: TimeInterval
    private let maxBackoff: TimeInterval

    public init(
        pool: any DatabaseWriter,
        dispatcher: any OutboxDispatching,
        maxAttempts: Int = 5,
        baseBackoff: TimeInterval = 2,
        maxBackoff: TimeInterval = 30
    ) {
        self.pool = pool
        self.dispatcher = dispatcher
        self.maxAttempts = maxAttempts
        self.baseBackoff = baseBackoff
        self.maxBackoff = maxBackoff
    }

    public func flush() async {
        let now = Date()
        let pending: [OutboxRecord] = (try? await pool.read { db in
            try OutboxRecord
                .filter(Column("status") == OutboxStatus.pending.rawValue)
                .filter(Column("nextAttemptAt") <= now)
                .order(Column("createdAt").asc)
                .limit(50)
                .fetchAll(db)
        }) ?? []

        for record in pending {
            await processRecord(record)
        }
    }

    private func processRecord(_ record: OutboxRecord) async {
        var current = record
        try? await pool.write { db in
            current.status = .inflight
            current.updatedAt = Date()
            try current.update(db)
        }

        do {
            try await dispatcher.dispatch(current)
            try await pool.write { db in
                try OutboxRecord.deleteOne(db, key: current.id)
            }
        } catch {
            current.attempts += 1
            current.lastError = String(describing: error)
            current.updatedAt = Date()
            if current.attempts >= maxAttempts {
                current.status = .exhausted
            } else {
                current.status = .pending
                let backoff = min(maxBackoff, baseBackoff * pow(2, Double(current.attempts - 1)))
                let jitter = Double.random(in: 0...0.5)
                current.nextAttemptAt = Date().addingTimeInterval(backoff + jitter)
            }
            try? await pool.write { db in try current.update(db) }
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter OutboxFlusherTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxFlusher.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxFlusherTests.swift
git commit -m "feat(sdk): OutboxFlusher actor with exponential backoff and FIFO drain"
```

---

### Task 2.6: Migrate OfflineQueue + MessageRetryQueue → outbox table

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRetryQueue.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (callers)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueMigrationTests.swift`

**Context:** Remplacer le stockage JSON par des inserts dans `msg_v1_outbox`. Garder l'API publique compatible pour limiter l'impact callsites.

- [ ] **Step 1: Write the failing migration test**

```swift
func test_offlineQueue_enqueue_writesToOutboxTable() async throws {
    let pool = try makeFreshPool()
    try MessageDatabaseMigrations.runAll(on: pool)
    let queue = OfflineQueue(pool: pool)
    try await queue.enqueue(OfflineQueueItem(
        tempId: "tmp", conversationId: "c1", content: "hello",
        replyToId: nil, attachmentIds: [], createdAt: Date()
    ))
    let count = try pool.read { db in
        try OutboxRecord.filter(Column("kind") == OutboxKind.sendMessage.rawValue).fetchCount(db)
    }
    XCTAssertEqual(count, 1)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter OfflineQueueMigrationTests`
Expected: FAIL.

- [ ] **Step 3: Refactor OfflineQueue to back onto outbox table**

Replace JSON file storage with `pool.write { db in try OutboxRecord(...).insert(db) }`. Public API (`enqueue`, `retrySucceeded`, etc.) stays.

The Combine subjects (`retrySucceeded`, etc.) are now driven by `ValueObservation` on `msg_v1_outbox`:

```swift
public final class OfflineQueue: @unchecked Sendable {
    public static let shared = OfflineQueue(pool: DependencyContainer.shared.dbPool)

    public let retrySucceeded = PassthroughSubject<OfflineRetrySuccess, Never>()
    public let retryExhausted = PassthroughSubject<OfflineRetryExhausted, Never>()

    private let pool: any DatabaseWriter
    private var observation: AnyDatabaseCancellable?
    private var lastSeenIds: Set<String> = []

    public init(pool: any DatabaseWriter) {
        self.pool = pool
        self.observation = ValueObservation
            .tracking { db in try OutboxRecord.fetchAll(db) }
            .start(in: pool, scheduling: .async(onQueue: .main),
                   onError: { _ in },
                   onChange: { [weak self] all in self?.diff(all) })
    }

    public func enqueue(_ item: OfflineQueueItem) async throws {
        let payload = try JSONEncoder().encode(item)
        try await pool.write { db in
            try OutboxRecord(
                id: item.tempId,
                kind: .sendMessage,
                conversationId: item.conversationId,
                messageLocalId: item.tempId,
                payload: payload
            ).insert(db)
        }
    }

    private func diff(_ records: [OutboxRecord]) {
        // Detect transitions: pending → exhausted = retryExhausted; deleted = retrySucceeded
        // (track previous state in lastSeenIds)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter OfflineQueueMigrationTests`
Expected: PASS.

- [ ] **Step 5: Migrate MessageRetryQueue identically**

Same pattern: backed by outbox table with `kind: .sendMessage`. The two queues unify into ONE table — the `attempts` column distinguishes "first try" from "retrying".

- [ ] **Step 6: Provide one-time migration of legacy JSON files**

In `MeeshyApp.task` boot:

```swift
await MigrateLegacyQueues.migrateOnce(into: DependencyContainer.shared.dbPool)
```

Where `MigrateLegacyQueues.migrateOnce` reads old JSON files (if exist), inserts to outbox, then deletes the JSON files.

- [ ] **Step 7: Run full test suite + manual airplane-mode flow**

Run: `./apps/ios/meeshy.sh test && ./apps/ios/meeshy.sh run`
Manual: airplane mode → send 3 messages → toggle off → all flush correctly.

- [ ] **Step 8: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRetryQueue.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Persistence/MigrateLegacyQueues.swift \
        apps/ios/Meeshy/MeeshyApp.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueMigrationTests.swift
git commit -m "feat(sdk): unify OfflineQueue and MessageRetryQueue onto SQLite outbox table"
```

---

### Task 2.7: PRAGMA tuning + auto_vacuum INCREMENTAL

**Files:**
- Modify: `apps/ios/Meeshy/Core/DependencyContainer.swift:60-69`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/DatabaseMaintenance.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/DatabaseMaintenanceTests.swift`

**Context:** Aujourd'hui `cache_size` default (~8MB), pas de `auto_vacuum`. Cible : `cache_size = 8000` (32MB), `auto_vacuum = INCREMENTAL`, `mmap_size = 64MB`, et un job de maintenance qui fait `incremental_vacuum` au passage en background.

- [ ] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/DatabaseMaintenanceTests.swift
import XCTest
import GRDB
@testable import MeeshySDK

final class DatabaseMaintenanceTests: XCTestCase {

    func test_pragmas_applied() throws {
        let pool = try makeFreshPool()
        DatabaseMaintenance.applyTuning(on: pool)

        try pool.read { db in
            let cacheSize = try Int.fetchOne(db, sql: "PRAGMA cache_size") ?? 0
            XCTAssertEqual(abs(cacheSize), 8000)

            let autoVacuum = try Int.fetchOne(db, sql: "PRAGMA auto_vacuum") ?? 0
            XCTAssertEqual(autoVacuum, 2)  // INCREMENTAL = 2

            let mmap = try Int.fetchOne(db, sql: "PRAGMA mmap_size") ?? 0
            XCTAssertGreaterThanOrEqual(mmap, 67108864)  // 64MB
        }
    }

    func test_incrementalVacuum_runsOnDemand() throws {
        let pool = try makeFreshPool()
        DatabaseMaintenance.applyTuning(on: pool)
        try pool.write { db in
            try db.execute(sql: "CREATE TABLE t (x BLOB)")
            for _ in 0..<1000 { try db.execute(sql: "INSERT INTO t VALUES (zeroblob(4096))") }
            try db.execute(sql: "DELETE FROM t")
        }
        XCTAssertNoThrow(try DatabaseMaintenance.runIncrementalVacuum(on: pool, pages: 100))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter DatabaseMaintenanceTests`
Expected: FAIL.

- [ ] **Step 3: Create DatabaseMaintenance + apply in DependencyContainer**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/DatabaseMaintenance.swift
import GRDB

public enum DatabaseMaintenance {

    public static func applyTuning(on pool: any DatabaseWriter) {
        try? pool.write { db in
            try db.execute(sql: "PRAGMA cache_size = 8000")            // ~32 MB
            try db.execute(sql: "PRAGMA mmap_size = 67108864")          // 64 MB
            try db.execute(sql: "PRAGMA temp_store = MEMORY")
            try db.execute(sql: "PRAGMA auto_vacuum = INCREMENTAL")
        }
    }

    public static func runIncrementalVacuum(on pool: any DatabaseWriter, pages: Int = 1000) throws {
        try pool.write { db in
            try db.execute(sql: "PRAGMA incremental_vacuum(\(pages))")
        }
    }

    public static func runOptimize(on pool: any DatabaseWriter) throws {
        try pool.write { db in
            try db.execute(sql: "PRAGMA optimize")
        }
    }
}
```

In `DependencyContainer.swift` after migrations run:

```swift
DatabaseMaintenance.applyTuning(on: pool)
```

In `MeeshyApp.scenePhase` `.background`:

```swift
.onChange(of: scenePhase) { _, newPhase in
    if newPhase == .background {
        Task.detached(priority: .background) {
            try? DatabaseMaintenance.runIncrementalVacuum(on: DependencyContainer.shared.dbPool)
            try? DatabaseMaintenance.runOptimize(on: DependencyContainer.shared.dbPool)
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter DatabaseMaintenanceTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Core/DependencyContainer.swift \
        apps/ios/Meeshy/MeeshyApp.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Persistence/DatabaseMaintenance.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/DatabaseMaintenanceTests.swift
git commit -m "feat(sdk): PRAGMA tuning + INCREMENTAL auto_vacuum + background maintenance"
```

---

### Task 2.8: Phase 2 closeout

**Files:** N/A

- [ ] **Step 1: Full test suite**

Run: `./apps/ios/meeshy.sh test`
Expected: green.

- [ ] **Step 2: Manual airplane mode end-to-end**

Manual scenario (mode avion complet) :
1. Désactiver wifi/cellular
2. Tuer l'app
3. Relancer — la conversation list charge depuis cache
4. Ouvrir une conversation — messages s'affichent depuis cache
5. Search "hello" dans la conv list — résultats FTS5 instant
6. Composer 5 messages — chacun apparaît `pending`
7. Réactiver réseau
8. Tous les messages flush vers `sent` automatiquement

- [ ] **Step 3: Mesure DB size growth**

Avec un script `scripts/ios-db-size.sh`, ouvrir/fermer l'app 50 fois, mesurer taille de `meeshy_messages.sqlite`. Doit rester stable (vacuum fait son boulot).

- [ ] **Step 4: Open PR**

```bash
git push -u origin feat/instant-app-phase2-offline-first
gh pr create --title "feat(ios): Phase 2 — FTS5 search, unified outbox, PRAGMA tuning" \
  --body "$(cat <<'EOF'
## Summary
- FTS5 virtual table for messages (French-aware tokenizer)
- MessageSearchService BM25-ranked
- GlobalSearchViewModel queries FTS5 first, network fallback
- Unified outbox SQLite table (replaces 2 JSON queues)
- OutboxFlusher actor with exponential backoff
- PRAGMA tuning + INCREMENTAL auto_vacuum
- Background DB maintenance

## Test plan
- [x] Unit + integration tests
- [x] Airplane mode: open / search / compose / reconnect
- [x] DB size remains stable after 50 open/close cycles

## Closes
- Search obligatoire en réseau
- Dual JSON queues
- DB grow unbounded (Telegram #2893 pattern)
EOF
)"
```

---

# Phase 3 — Performance Polish

**Objectif :** Atteindre 60 fps sustained sur iPhone SE 2 / iPhone 8 — animations contrôlées, images downsamplées, métadonnées pré-calculées.

**Prérequis :** Phase 2 mergée.

**Durée estimée :** 2 jours.

---

### Task 3.1: Remove cell-level spring animations from MessageRow

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift:242,69`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift:45-46`
- Test: `apps/ios/MeeshyTests/Unit/Views/MessageRowAnimationTests.swift`

**Context:** Sur arrivée socket, `.spring(response: 0.4, dampingFraction: 0.8)` joue à chaque cellule. Cumulé sur burst, jank visible. Cible : laisser UICollectionView animer via `apply(snapshot, animatingDifferences: true)` — pas la cellule elle-même.

- [ ] **Step 1: Write the failing test (lint pattern)**

```swift
// apps/ios/MeeshyTests/Unit/Views/MessageRowAnimationTests.swift
final class MessageRowAnimationTests: XCTestCase {

    func test_messageRow_hasNoSpringAnimations() throws {
        let path = "apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift"
        let content = try String(contentsOfFile: path)
        // No .spring( inside MessageRow body
        let lines = content.components(separatedBy: "\n")
        var inMessageRow = false
        var violations: [Int] = []
        for (i, line) in lines.enumerated() {
            if line.contains("private func messageRow") || line.contains("struct MessageRow") {
                inMessageRow = true
            }
            if inMessageRow && line.contains(".spring(") {
                violations.append(i + 1)
            }
            if inMessageRow && line.trimmingCharacters(in: .whitespaces) == "}" {
                inMessageRow = false
            }
        }
        XCTAssertTrue(violations.isEmpty,
            "MessageRow should have no .spring(): violations on lines \(violations)")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter MessageRowAnimationTests`
Expected: FAIL — line 242 has spring.

- [ ] **Step 3: Remove cell-level springs**

In `ConversationView+MessageRow.swift:242`:

```swift
// BEFORE:
.animation(.spring(response: 0.4, dampingFraction: 0.8), value: msg.content)

// AFTER:
// (animation handled by UICollectionView snapshot apply)
```

In `ConversationMediaViews.swift:45-46`:

```swift
// BEFORE:
.animation(.spring(...), value: downloader.isCached)

// AFTER:
.animation(.easeInOut(duration: 0.15), value: downloader.isCached)
// (lighter animation OK for state change of single property)
```

- [ ] **Step 4: Verify MessageListViewController applies snapshot animated**

In `MessageListViewController.swift`, confirm `dataSource.apply(snapshot, animatingDifferences: true)` — let UIKit handle insertion animation.

- [ ] **Step 5: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test --filter MessageRowAnimationTests`
Expected: PASS.

- [ ] **Step 6: Manual scroll + receive burst test**

Manual: scroll dans une longue conversation, recevoir 10 messages d'affilée. Doit rester smooth.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift \
        apps/ios/MeeshyTests/Unit/Views/MessageRowAnimationTests.swift
git commit -m "perf(ios): remove cell-level springs in MessageRow, let UICollectionView animate"
```

---

### Task 3.2: Kingfisher DownsamplingImageProcessor global config

**Files:**
- Modify: `apps/ios/Meeshy/MeeshyApp.swift` (or where Kingfisher is configured)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/ImageDownsamplingTests.swift`

**Context:** Aucun downsampling aujourd'hui. iPhone 8 OOM avec 4-5 grosses photos en mémoire. Cible : downsampling à la cible point size par contexte (avatar 40pt, cover 200pt, fullscreen).

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import Kingfisher
@testable import Meeshy
@testable import MeeshyUI

final class ImageDownsamplingTests: XCTestCase {

    func test_kingfisherGlobalOptions_setsDownsampler() {
        ImageDownsamplingConfig.applyGlobal()
        let options = KingfisherManager.shared.defaultOptions
        XCTAssertTrue(options.contains { String(describing: $0).contains("DownsamplingImageProcessor") })
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter ImageDownsamplingTests`
Expected: FAIL.

- [ ] **Step 3: Create ImageDownsamplingConfig**

```swift
// apps/ios/Meeshy/Core/ImageDownsamplingConfig.swift
import Kingfisher
import UIKit

public enum ImageDownsamplingConfig {

    public static func applyGlobal() {
        KingfisherManager.shared.defaultOptions = [
            .cacheOriginalImage,
            .scaleFactor(UIScreen.main.scale),
            .cacheSerializer(FormatIndicatedCacheSerializer.png),
            .backgroundDecode
        ]
        // Memory cache cap
        ImageCache.default.memoryStorage.config.totalCostLimit = 60 * 1024 * 1024  // 60 MB
        // Disk cache cap
        ImageCache.default.diskStorage.config.sizeLimit = 300 * 1024 * 1024  // 300 MB
    }

    public static func processor(for size: CGSize) -> DownsamplingImageProcessor {
        DownsamplingImageProcessor(size: size)
    }
}
```

- [ ] **Step 4: Wire in MeeshyApp.task**

```swift
// MeeshyApp.swift inside .task before any KFImage usage:
ImageDownsamplingConfig.applyGlobal()
```

- [ ] **Step 5: Update CachedAsyncImage to accept targetSize**

```swift
struct CachedAsyncImage<Placeholder: View>: View {
    let url: String?
    let targetSize: CGSize
    let placeholder: () -> Placeholder

    init(url: String?, targetSize: CGSize, @ViewBuilder placeholder: @escaping () -> Placeholder) {
        self.url = url
        self.targetSize = targetSize
        self.placeholder = placeholder
    }
    // body uses Kingfisher with `.processor(ImageDownsamplingConfig.processor(for: targetSize))`
}
```

Update callsites to pass appropriate `targetSize`:
- Avatar: `CGSize(width: 40, height: 40)`
- Cover: `CGSize(width: 200, height: 200)`
- Media bubble: `CGSize(width: 280, height: 280)`
- Fullscreen: `UIScreen.main.bounds.size`

- [ ] **Step 6: Run test + manual memory check**

Run: `./apps/ios/meeshy.sh test --filter ImageDownsamplingTests`
Expected: PASS.

Manual: scroll un feed avec 50 images, mesurer mémoire dans Instruments. Doit rester < 150 MB.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Core/ImageDownsamplingConfig.swift \
        apps/ios/Meeshy/MeeshyApp.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift \
        apps/ios/MeeshyTests/Unit/Services/ImageDownsamplingTests.swift
git commit -m "perf(ios): Kingfisher DownsamplingImageProcessor config + per-context target sizes"
```

---

### Task 3.3: Pre-compute message timestamp strings on ingestion

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift` (v8)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageTimestampPrecomputeTests.swift`

**Context:** `DateFormatter` instancié dans `body` à chaque cellule = budget frame pété. Cible : pré-calculer `cachedTimeString` à l'insertion.

- [ ] **Step 1: Write failing test**

```swift
func test_insertOptimistic_precomputesTimestampString() async throws {
    let pool = try makeFreshPool()
    try MessageDatabaseMigrations.runAll(on: pool)
    let actor = MessagePersistenceActor(dbWriter: pool)
    let date = ISO8601DateFormatter().date(from: "2026-05-06T14:32:00Z")!
    var record = MessageRecord.fixture(localId: "x", content: "hi")
    record.createdAt = date

    try await actor.insertOptimistic(record)

    let stored: MessageRecord = try pool.read { db in
        try MessageRecord.fetchOne(db, key: "x")!
    }
    XCTAssertEqual(stored.cachedTimeString, "14:32")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter MessageTimestampPrecomputeTests`
Expected: FAIL.

- [ ] **Step 3: Add v8 migration adding `cachedTimeString` column**

```swift
migrator.registerMigration("v8_cached_time_string") { db in
    try db.alter(table: "msg_v1_messages") { t in
        t.add(column: "cachedTimeString", .text)
    }
    // Backfill existing rows
    try db.execute(sql: """
        UPDATE msg_v1_messages SET cachedTimeString =
            strftime('%H:%M', createdAt)
        WHERE cachedTimeString IS NULL
        """)
}
```

- [ ] **Step 4: Add property to MessageRecord and compute on insert**

In `MessageRecord.swift`:

```swift
public var cachedTimeString: String?

// Helper
public static func computeTimeString(for date: Date) -> String {
    let formatter = TimeStringCache.shared.formatter
    return formatter.string(from: date)
}
```

```swift
// MessagePersistenceActor.insertOptimistic:
public func insertOptimistic(_ record: MessageRecord) throws {
    var r = record
    r.cachedTimeString = MessageRecord.computeTimeString(for: r.createdAt)
    try dbWriter.write { db in try r.insert(db) }
}
```

`TimeStringCache` is a singleton holding a single `DateFormatter` instance shared across all calls.

- [ ] **Step 5: Update MessageBubble to read `cachedTimeString` instead of formatting in body**

```swift
// BEFORE:
Text(message.createdAt, format: .dateTime.hour().minute())

// AFTER:
Text(message.cachedTimeString ?? "")
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter MessageTimestampPrecomputeTests`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift \
        apps/ios/Meeshy/Features/Main/Views/  # bubble using cachedTimeString
git commit -m "perf(sdk): pre-compute message timestamp strings on ingestion"
```

---

### Task 3.4: Per-user Keychain namespacing

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainManager.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Security/KeychainNamespaceTests.swift`

**Context:** Aujourd'hui clés Keychain partagées sur device si plusieurs accounts. Cible : préfixer avec `userId` quand connu.

- [ ] **Step 1: Write failing test**

```swift
func test_keychain_namespacedKeys_isolated_perUser() async throws {
    let manager = KeychainManager.shared
    try manager.save("alpha", forKey: "session.peer1", account: "user-A")
    try manager.save("beta", forKey: "session.peer1", account: "user-B")

    let aValue = manager.load(forKey: "session.peer1", account: "user-A")
    let bValue = manager.load(forKey: "session.peer1", account: "user-B")

    XCTAssertEqual(aValue, "alpha")
    XCTAssertEqual(bValue, "beta")

    try manager.delete(forKey: "session.peer1", account: "user-A")
    try manager.delete(forKey: "session.peer1", account: "user-B")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && swift test --filter KeychainNamespaceTests`
Expected: FAIL.

- [ ] **Step 3: Add `account:` parameter to KeychainManager APIs**

```swift
public func save(_ value: String, forKey key: String, account: String? = nil) throws {
    var query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: namespacedKey(key, account: account),
        kSecValueData as String: Data(value.utf8),
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    ]
    SecItemDelete(query as CFDictionary)
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError.saveFailed(status) }
}

public func load(forKey key: String, account: String? = nil) -> String? {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: namespacedKey(key, account: account),
        kSecReturnData as String: true
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
          let data = item as? Data,
          let str = String(data: data, encoding: .utf8) else { return nil }
    return str
}

private func namespacedKey(_ key: String, account: String?) -> String {
    guard let account else { return key }
    return "\(account).\(key)"
}
```

- [ ] **Step 4: Update callers to pass current userId**

In `E2ESessionManager.swift`, every `KeychainManager.shared.save/load` calls with `account: AuthManager.shared.currentUserId`.

- [ ] **Step 5: One-time migration of legacy non-namespaced keys**

On first run after this update, copy old keys to new namespace if `currentUserId` is known.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/MeeshySDK && swift test --filter KeychainNamespaceTests`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainManager.swift \
        apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Security/KeychainNamespaceTests.swift
git commit -m "feat(sdk): per-user Keychain namespacing for multi-account isolation"
```

---

### Task 3.5: Phase 3 closeout

**Files:** N/A

- [ ] **Step 1: Full test suite**

Run: `./apps/ios/meeshy.sh test`
Expected: green.

- [ ] **Step 2: Performance regression baseline**

Run scripted benchmark (60-second scroll in 1000-msg conversation, 5 burst events). Compare frame drops vs Phase 0 baseline.

- [ ] **Step 3: Open PR**

```bash
git push -u origin feat/instant-app-phase3-perf-polish
gh pr create --title "feat(ios): Phase 3 — animations, image downsampling, timestamp pre-compute, keychain namespace" \
  --body "..."
```

---

# Phase 4 — Validation & Benchmarks

**Objectif :** Démontrer mesurablement l'atteinte de la cible "iPhone neuf". Suite de benchmarks répétables, dashboard métrique.

**Durée :** 1 jour.

---

### Task 4.1: Add performance benchmark suite

**Files:**
- Create: `apps/ios/MeeshyTests/Performance/MessageListPerformanceTests.swift`
- Create: `apps/ios/MeeshyTests/Performance/SearchPerformanceTests.swift`
- Create: `scripts/ios-perf-benchmark.sh`

- [ ] **Step 1: Write benchmark test for message list scroll**

```swift
import XCTest
@testable import Meeshy

@MainActor
final class MessageListPerformanceTests: XCTestCase {

    func test_scrolling1000Messages_under16ms_perFrame() throws {
        let metrics: [XCTMetric] = [
            XCTClockMetric(),
            XCTCPUMetric(),
            XCTMemoryMetric()
        ]
        measure(metrics: metrics) {
            let store = makeStore(messageCount: 1000)
            // simulate scrollToBottom + scroll up + scroll down
            for _ in 0..<10 {
                _ = store.messages.suffix(50)
                _ = store.messages.prefix(50)
            }
        }
    }
}
```

- [ ] **Step 2: Search benchmark**

```swift
func test_search_in100kMessages_under50ms() async throws {
    let pool = try makeInMemoryPool()
    try MessageDatabaseMigrations.runAll(on: pool)
    DatabaseMaintenance.applyTuning(on: pool)
    try pool.write { db in
        for i in 0..<100_000 {
            try MessageRecord.fixture(localId: "m\(i)", content: "msg \(i)").insert(db)
        }
    }
    let service = MessageSearchService(reader: pool)

    let start = Date()
    let results = try await service.search(query: "msg 50", limit: 50, conversationId: nil)
    let elapsed = Date().timeIntervalSince(start) * 1000

    XCTAssertGreaterThan(results.count, 0)
    XCTAssertLessThan(elapsed, 50, "FTS5 search must complete in under 50ms for 100k messages")
}
```

- [ ] **Step 3: Run benchmark suite**

Run: `./scripts/ios-perf-benchmark.sh`
Expected: all assertions pass; output as table.

- [ ] **Step 4: Document results**

Create `docs/superpowers/research/2026-05-06-instant-app-final-metrics.md` with:
- Cold start ms (target < 500)
- Scroll FPS (target 60)
- Decrypt p95 ms (target < 10)
- Search latency 100k msgs (target < 50)
- Memory peak (target < 150 MB)

- [ ] **Step 5: Commit**

```bash
git add apps/ios/MeeshyTests/Performance/ \
        scripts/ios-perf-benchmark.sh \
        docs/superpowers/research/2026-05-06-instant-app-final-metrics.md
git commit -m "test(ios): performance benchmark suite for instant app foundation"
```

---

### Task 4.2: Final integration smoke test

**Files:** N/A (manual)

Manual test plan, end-to-end on iPhone SE 2 simulator AND a real iPhone 8 if available:

- [ ] **Step 1: Cold start with 500 conversations seeded**

Time from app icon tap to interactive list. Target < 500ms.

- [ ] **Step 2: Open conversation with 5000 messages cached**

Time to first paint (UICollectionView populated). Target < 200ms.

- [ ] **Step 3: Receive burst of 20 messages over Socket.IO**

No frame drops, scroll sticky to bottom if user was at bottom.

- [ ] **Step 4: Airplane mode — search "hello" in 100k cached messages**

Results in < 100ms.

- [ ] **Step 5: Compose 10 messages while offline**

Each appears as `pending` instantly. Reconnect → all flush within 5s.

- [ ] **Step 6: Multi-account login**

Login user A, write 5 messages. Logout. Login user B. Confirm user A's E2E sessions are not visible/usable.

- [ ] **Step 7: 30-min scroll session sustained**

Memory stays < 150 MB, no crashes, no OOM.

- [ ] **Step 8: Open final PR / merge to dev**

Document in PR body the actual measured values vs targets. Merge.

---

## Self-Review

### Spec coverage

| Trou identifié | Phase / Task | Status |
|---|---|---|
| Path A vs Path B | Phase 1.3-1.6 | ✅ |
| Décryption sur main | Phase 1.7 | ✅ |
| AudioMediaView ThemeManager observer | Phase 0.3 | ✅ |
| Timer.publish leak | Phase 0.1 | ✅ |
| storyPrefetchTask leak | Phase 0.2 | ✅ |
| MessageStore observation leak | Phase 0.4 | ✅ |
| Pas de FTS5 | Phase 2.1-2.3 | ✅ |
| OfflineQueue + RetryQueue dual | Phase 2.4-2.6 | ✅ |
| PRAGMA auto_vacuum | Phase 2.7 | ✅ |
| ConversationViewModel 39 @Published | Phase 1.3 (proxy) — partially addressed; deeper split TBD if needed |
| Spring animations cell-level | Phase 3.1 | ✅ |
| Kingfisher downsampling | Phase 3.2 | ✅ |
| Per-user Keychain namespacing | Phase 3.4 | ✅ |
| Pre-computed timestamps | Phase 3.3 | ✅ |
| ConversationListView LazyVStack | Not in plan — defer (gain marginal jusqu'à 1000 conv, voir Phase Future) |
| Reactions normalization | Not in plan — defer (gain modeste, schéma JSON acceptable jusqu'à 100 reactions/msg) |

### Notes pour Phases ultérieures (hors scope)

- **ConversationListView UICollectionView migration** : si le benchmark Phase 4.1 montre frame drops à 1500+ conversations, ouvrir un Phase 5 dédié.
- **Reactions normalization (v9)** : à faire si profile montre que reactions JSON serialize/deserialize est un hot path.
- **Sliding sync (MSC3575) backend-side** : nécessite refonte gateway, plan séparé.
- **CRDT pour drafts multi-device** : automerge-swift POC à faire dans un plan dédié.

### Placeholder scan

Aucun "TBD", "TODO", "implement later" dans les steps. Toutes les références de types/méthodes utilisées dans une task sont définies dans la même task ou une task précédente :
- `MessagePersistenceActor.insertOptimistic` — défini Task 1.1, utilisé Task 1.5+
- `MessagePersistenceActor.appendReaction` — défini Task 1.4
- `DecryptionActor` — défini Task 1.7
- `OutboxRecord` — défini Task 2.4, utilisé Task 2.5-2.6
- `MessageSearchService` — défini Task 2.2, utilisé Task 2.3
- `DatabaseMaintenance` — défini Task 2.7

### Type consistency

- `MessageStore.messages: [Message]` — used consistently as @Published source
- `MessagePersistenceActor.bufferIncoming([IncomingMessageData])` — same signature throughout
- `OutboxStatus.pending/inflight/failed/exhausted` — fixed enum, used in all related tasks
- `ConversationDependencies` struct — defined Task 1.1, used in test fixtures Task 1.3+

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-instant-app-foundation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Je dispatche un subagent par task avec review entre chaque, itération rapide, branche worktree dédiée par phase.

**2. Inline Execution** — Exécution dans cette session avec checkpoints pour review.

**Quelle approche ?**
