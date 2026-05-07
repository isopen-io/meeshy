# Story Notifications UX & Reply Banner Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner du contexte aux notifications de story (active → canvas avec sheet pré-déployée ; expirée → écran random + CTA), et corriger la bannière reply-to-story qui persiste après envoi/cancel.

**Architecture:** Smart route unique `.storyNotificationTarget(storyId, intent, context)`. La vue cible décide en runtime entre rendre `StoryActiveBridge` (qui propage vers le pattern existant `storyViewerRequest` + `.fullScreenCover` avec `initialAction`) ou `StoryExpiredContent` (fond random + contexte + CTA). Bug fix séparé : `DraftStore.clearReplyReference` purgé sur send/cancel uniquement.

**Tech Stack:** SwiftUI, Swift 6 concurrency, XCTest, MeeshySDK existant, MeeshyUI (default isolation @MainActor).

**Spec:** `docs/superpowers/specs/2026-05-07-story-notifications-ux-design.md`

---

## Adaptations vs spec (issues de l'audit)

| Spec | Réalité du code | Ajustement |
|------|-----------------|------------|
| `APIStory` | `APIPost` (les stories sont des posts) | Tout référence à `APIStory` → `APIPost` |
| `StoryService.cachedStory(id:)` | Inexistant | À créer (lookup via `CacheCoordinator` ou local dict) |
| `StoryService.fetchStory(id:)` | Inexistant | À créer (endpoint `GET /posts/{id}`) |
| `StoryCanvasReaderView` + sheet | `StoryViewerView` + `showCommentsOverlay` + `StoryViewersSheet` | Réutilise `StoryViewerView` via `storyViewerRequest`, étendre avec `initialAction` |
| `@Binding var isPaused` | `pauseTimer()`/`resumeTimer()` existent déjà | Pas besoin d'ajout |
| Présentation NavigationStack | Stories utilisent `.fullScreenCover` via `storyViewerRequest` | `StoryActiveBridge` route vers ce mécanisme existant + dismiss self |

---

## File Structure

### À créer (12 fichiers)

| Path | Responsabilité |
|------|----------------|
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationIntent.swift` | Enum `StoryIntent { .comments, .reactions }` + struct `NotificationContext` |
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetScreen.swift` | Vue racine, switch sur LoadState |
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift` | ViewModel cache-first + network |
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationLoadingView.swift` | Skeleton pendant le load |
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryActiveBridge.swift` | Bridge: setup `storyViewerRequest` + dismiss |
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryExpiredContent.swift` | Écran story expirée |
| `apps/ios/MeeshyTests/Features/Stories/Notifications/StoryNotificationTargetViewModelTests.swift` | Unit tests ViewModel |
| `apps/ios/MeeshyTests/Features/Stories/Notifications/StoryExpiredContentTests.swift` | Component tests |
| `apps/ios/MeeshyTests/Features/Stories/Notifications/StoryActiveBridgeTests.swift` | Component tests |
| `apps/ios/MeeshyTests/Features/Main/Services/DraftStoreReplyTests.swift` | Unit tests DraftStore |
| `apps/ios/MeeshyTests/Features/Main/Views/ConversationReplyContextTests.swift` | Tests bug fix bannière |
| `apps/ios/MeeshyUITests/Stories/StoryNotificationFlowUITests.swift` | UI tests scénarios |

### À modifier (10 fichiers)

| Path | Changement |
|------|------------|
| `apps/ios/Meeshy/Features/Main/Navigation/Router.swift` | + 1 case `storyNotificationTarget(storyId, intent, context)` |
| `apps/ios/Meeshy/Features/Main/Views/RootView.swift` | + destination handler ; + mapping `.storyReaction`/`.postComment` (postType==STORY) → push nouvelle route |
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` | + paramètre `initialAction: InitialAction? = nil` ; déclenche `showCommentsOverlay` ou `showViewersSheet` au `onAppear` |
| `apps/ios/Meeshy/Features/Stories/Models/StoryViewerRequest.swift` (à localiser) | + `initialAction: StoryViewerInitialAction?` |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/StoryService.swift` | + `func cachedPost(id: String) -> APIPost?` ; + `func fetchPost(id: String) async throws -> APIPost` |
| `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift` | + extension `Color.luminance` |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` (extension `StoryBackgroundPalette`) | + `randomBackgroundColorAsColor() -> Color` |
| `apps/ios/Meeshy/Features/Main/Services/DraftStore.swift` | + extension `clearReplyReference(conversationId:)` |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` | + helper `clearReplyContext()` |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift` (l. 66, 245) + `+AttachmentHandlers.swift` (l. 76) | Remplacer `pendingReplyReference = nil` par `clearReplyContext()` |
| `apps/ios/Meeshy/Localizable.xcstrings` | + 4 clés (FR + EN) |

---

## Implementation Order

Phases ordonnées par découplage. La Phase A est isolée et ship-able seule.

```
Phase A (DraftStore fix)        ← ship dès qu'elle est verte
   ↓
Phase B (SDK Foundation)         ← dépendances pour C, D, F
   ↓
Phase C (ViewModel)              ← dépend B
   ↓
Phase D (StoryExpiredContent)    ← dépend B
   ↓
Phase E (Loading view)           ← indépendant
   ↓
Phase F (StoryActiveBridge)      ← dépend D, et de l'extension StoryViewerView
   ↓
Phase G (Route + RootView wiring) ← dépend C, D, F
   ↓
Phase H (StoryNotificationTargetScreen) ← compose tout
   ↓
Phase I (UI tests)               ← validation finale
```

---

# Phase A — Bug Fix : DraftStore Reply Cleanup

Objectif isolé : la bannière reply-to-story ne réapparaît plus après send/cancel + retour dans la conversation. Cette phase est commitable indépendamment et résout le bug observé.

## Task A.1 — Tests DraftStore.clearReplyReference

**Files:**
- Create: `apps/ios/MeeshyTests/Features/Main/Services/DraftStoreReplyTests.swift`

- [ ] **Step 1 : Lire la signature du DraftStore actuel pour adapter les tests**

```bash
# Repérer la struct Draft, les types des champs, les méthodes existantes
grep -nE "struct Draft|class DraftStore|var replyToId|func persist|func loadDraft" \
  apps/ios/Meeshy/Features/Main/Services/DraftStore.swift
```

Note la struct `Draft` (probablement avec `text: String`, `replyToId: String?`, `attachments: [...]`) et le mode de persistance (UserDefaults, file, Core Data, GRDB).

- [ ] **Step 2 : Écrire les 5 tests RED**

```swift
// apps/ios/MeeshyTests/Features/Main/Services/DraftStoreReplyTests.swift
import XCTest
@testable import Meeshy

@MainActor
final class DraftStoreReplyTests: XCTestCase {
    private var store: DraftStore!

    override func setUp() async throws {
        try await super.setUp()
        // Pas de mock — on utilise une instance réelle avec storage éphémère
        store = DraftStore(persistenceURL: FileManager.default.temporaryDirectory
            .appendingPathComponent("DraftStoreReplyTests-\(UUID().uuidString)"))
    }

    override func tearDown() async throws {
        store = nil
        try await super.tearDown()
    }

    func test_clearReplyReference_setsReplyToIdToNil() {
        store.upsertDraft(conversationId: "c1", text: "hi", replyToId: "story_1")
        store.clearReplyReference(conversationId: "c1")
        XCTAssertNil(store.draft(for: "c1")?.replyToId)
    }

    func test_clearReplyReference_preservesText() {
        store.upsertDraft(conversationId: "c1", text: "mon texte", replyToId: "story_1")
        store.clearReplyReference(conversationId: "c1")
        XCTAssertEqual(store.draft(for: "c1")?.text, "mon texte")
    }

    func test_clearReplyReference_preservesAttachments() {
        let attachments = [DraftAttachment(id: "a1", url: URL(fileURLWithPath: "/tmp/a"))]
        store.upsertDraft(conversationId: "c1", text: "", replyToId: "msg_1", attachments: attachments)
        store.clearReplyReference(conversationId: "c1")
        XCTAssertEqual(store.draft(for: "c1")?.attachments?.count, 1)
    }

    func test_clearReplyReference_persistsImmediately() {
        store.upsertDraft(conversationId: "c1", text: "hi", replyToId: "story_1")
        store.clearReplyReference(conversationId: "c1")
        // Reload depuis disk
        let reloaded = DraftStore(persistenceURL: store.persistenceURL)
        XCTAssertNil(reloaded.draft(for: "c1")?.replyToId)
    }

    func test_clearReplyReference_unknownConversationId_isNoOp() {
        store.clearReplyReference(conversationId: "unknown")
        XCTAssertNil(store.draft(for: "unknown"))
    }
}
```

**Note** : adapter les noms de méthodes (`upsertDraft`, `draft(for:)`, `persistenceURL`) à l'API réelle du `DraftStore` après lecture du fichier au Step 1. Si l'API existante diffère, ajuster les tests pour refléter l'usage réel sans réécrire le DraftStore.

- [ ] **Step 3 : Run tests pour vérifier qu'ils échouent (RED)**

```bash
./apps/ios/meeshy.sh test --only-testing:MeeshyTests/DraftStoreReplyTests
```

Expected: tous les tests échouent avec « value of type 'DraftStore' has no member 'clearReplyReference' ».

- [ ] **Step 4 : Commit le RED**

```bash
git add apps/ios/MeeshyTests/Features/Main/Services/DraftStoreReplyTests.swift
git commit -m "test(ios): RED for DraftStore.clearReplyReference"
```

## Task A.2 — Implémenter clearReplyReference (GREEN)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/DraftStore.swift`

- [ ] **Step 1 : Lire la fin du fichier DraftStore.swift pour repérer les patterns d'extension**

```bash
tail -30 apps/ios/Meeshy/Features/Main/Services/DraftStore.swift
```

- [ ] **Step 2 : Ajouter la méthode**

```swift
// À ajouter à la fin du fichier (extension ou dans la class), même style que les autres mutations
extension DraftStore {
    /// Purge la référence reply du draft d'une conversation. Texte et attachments préservés.
    /// No-op si aucun draft n'existe pour ce conversationId.
    func clearReplyReference(conversationId: String) {
        guard var draft = draft(for: conversationId) else { return }
        draft.replyToId = nil
        upsert(draft, for: conversationId)
    }
}
```

**Important** : si la struct `Draft` a un init nominal qui assigne `replyToId`, créer un `Draft(text: draft.text, replyToId: nil, attachments: draft.attachments)` à la place. Garde la cohérence avec les autres mutations existantes (pattern actuel du DraftStore).

- [ ] **Step 3 : Run tests pour vérifier qu'ils passent (GREEN)**

```bash
./apps/ios/meeshy.sh test --only-testing:MeeshyTests/DraftStoreReplyTests
```

Expected : 5/5 tests passent.

- [ ] **Step 4 : Commit le GREEN**

```bash
git add apps/ios/Meeshy/Features/Main/Services/DraftStore.swift
git commit -m "feat(ios): add DraftStore.clearReplyReference"
```

## Task A.3 — Tests ConversationView reply context cleanup

**Files:**
- Create: `apps/ios/MeeshyTests/Features/Main/Views/ConversationReplyContextTests.swift`

- [ ] **Step 1 : Repérer la fonction d'envoi de message à tester**

```bash
grep -nE "func sendMessage|sendMessageWithAttachments|pendingReplyReference" \
  apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift \
  apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift
```

Note : `pendingReplyReference = nil` se trouve aux lignes 66, 76, 245 selon l'audit. Confirme avec le grep.

- [ ] **Step 2 : Écrire les tests RED**

```swift
// apps/ios/MeeshyTests/Features/Main/Views/ConversationReplyContextTests.swift
import XCTest
@testable import Meeshy

@MainActor
final class ConversationReplyContextTests: XCTestCase {
    private var draftStore: DraftStore!
    private var sut: ConversationViewModel!  // ou la struct/objet concret testable

    override func setUp() async throws {
        try await super.setUp()
        draftStore = DraftStore(persistenceURL: FileManager.default.temporaryDirectory
            .appendingPathComponent("ConvReplyTests-\(UUID().uuidString)"))
        // SUT minimum : un objet qui expose clearReplyContext() ou équivalent
        sut = ConversationViewModel(conversationId: "c1", draftStore: draftStore)
    }

    func test_clearReplyContext_purgesPendingReferenceAndDraft() {
        sut.pendingReplyReference = .init(targetId: "story_1", kind: .story)
        draftStore.upsertDraft(conversationId: "c1", text: "hi", replyToId: "story_1")

        sut.clearReplyContext()

        XCTAssertNil(sut.pendingReplyReference)
        XCTAssertNil(draftStore.draft(for: "c1")?.replyToId)
    }

    func test_clearReplyContext_preservesDraftText() {
        draftStore.upsertDraft(conversationId: "c1", text: "mon texte", replyToId: "story_1")
        sut.pendingReplyReference = .init(targetId: "story_1", kind: .story)

        sut.clearReplyContext()

        XCTAssertEqual(draftStore.draft(for: "c1")?.text, "mon texte")
    }

    func test_appReopen_preservesReplyToIdWhenNoSendNorCancel() {
        // Simule : draft existe avec replyToId, pas de send ni cancel
        draftStore.upsertDraft(conversationId: "c1", text: "hi", replyToId: "story_1")

        // Aucun appel à clearReplyContext

        XCTAssertEqual(draftStore.draft(for: "c1")?.replyToId, "story_1")
    }
}
```

**Note** : si `ConversationView` n'a pas de ViewModel testable séparable, créer la fonction `clearReplyContext()` comme une méthode statique ou helper sur un type dédié pour permettre le test (ne pas tester directement la View SwiftUI).

- [ ] **Step 3 : Run RED**

```bash
./apps/ios/meeshy.sh test --only-testing:MeeshyTests/ConversationReplyContextTests
```

Expected: échec sur `clearReplyContext()` inexistant ou ConversationViewModel.

- [ ] **Step 4 : Commit RED**

```bash
git add apps/ios/MeeshyTests/Features/Main/Views/ConversationReplyContextTests.swift
git commit -m "test(ios): RED for ConversationView reply context cleanup"
```

## Task A.4 — Implémenter clearReplyContext + update call sites (GREEN)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift` (lines 66, 245)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift` (line 76)

- [ ] **Step 1 : Ajouter le helper clearReplyContext()**

Si `ConversationView` est une struct SwiftUI sans ViewModel séparé, créer un helper privé. Si un ViewModel/object existe, ajouter la méthode dessus.

```swift
// Dans ConversationView.swift (ou ConversationViewModel selon arch)
private func clearReplyContext() {
    composerState.pendingReplyReference = nil
    DraftStore.shared.clearReplyReference(conversationId: conversation.id)
}
```

**Si l'archi a un ViewModel exposé** (cas testable), expose la méthode publique :

```swift
// ConversationViewModel.swift (à créer ou étendre si pas existant)
@MainActor
final class ConversationViewModel: ObservableObject {
    @Published var pendingReplyReference: ReplyReference?
    let conversationId: String
    private let draftStore: DraftStore

    init(conversationId: String, draftStore: DraftStore = .shared) {
        self.conversationId = conversationId
        self.draftStore = draftStore
    }

    func clearReplyContext() {
        pendingReplyReference = nil
        draftStore.clearReplyReference(conversationId: conversationId)
    }
}
```

**Décision arch** : si la migration vers ViewModel testable est trop invasive, créer un mince `ReplyContextController` injectable qui encapsule juste cette logique (Single Responsibility), et l'utiliser depuis la View ET depuis les tests. Critère : préserver le test sans refactoriser toute la View.

- [ ] **Step 2 : Update les 3 call sites**

```swift
// ConversationView+Composer.swift:66 (après send sans attachment)
- composerState.pendingReplyReference = nil
+ clearReplyContext()

// ConversationView+Composer.swift:245 (cancel banner X button)
- composerState.pendingReplyReference = nil
+ clearReplyContext()

// ConversationView+AttachmentHandlers.swift:76 (send avec attachments)
- composerState.pendingReplyReference = nil
+ clearReplyContext()
```

Vérifier avec grep :

```bash
grep -nE "pendingReplyReference = nil" \
  apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift \
  apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift
```

Doit retourner 0 occurrences après les modifications.

- [ ] **Step 3 : Run tests pour vérifier qu'ils passent (GREEN)**

```bash
./apps/ios/meeshy.sh test --only-testing:MeeshyTests/ConversationReplyContextTests
./apps/ios/meeshy.sh test --only-testing:MeeshyTests/DraftStoreReplyTests
```

Expected : tous verts.

- [ ] **Step 4 : Build complet pour vérifier non-régression**

```bash
./apps/ios/meeshy.sh build
```

Expected : build succeeded.

- [ ] **Step 5 : Commit GREEN**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift
git commit -m "fix(ios): purge draft replyToId on send/cancel to clear reply banner"
```

---

# Phase B — SDK Foundation

## Task B.1 — Tests StoryService.cachedPost & fetchPost

**Files:**
- Create/extend: `apps/ios/MeeshySDKTests/StoryServiceTests.swift` (vérifier d'abord si existe)

- [ ] **Step 1 : Vérifier l'existant**

```bash
find packages/MeeshySDK/Tests -name "StoryServiceTests*" -o -name "StoryService*Test*"
```

Si présent, étendre. Sinon, créer.

- [ ] **Step 2 : Tests RED**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/StoryServiceTests.swift
import Testing
@testable import MeeshySDK
import Foundation

@Suite("StoryService cache and fetch")
struct StoryServiceCacheAndFetchTests {

    @Test func cachedPost_whenAbsent_returnsNil() {
        let service = StoryService(api: MockAPIClient())
        #expect(service.cachedPost(id: "missing") == nil)
    }

    @Test func cachedPost_afterList_returnsCachedItem() async throws {
        let mock = MockAPIClient()
        let post = APIPost.fixture(id: "p1")
        mock.stub(.list, with: PaginatedAPIResponse(data: [post], pagination: .none))
        let service = StoryService(api: mock)

        _ = try await service.list(cursor: nil, limit: 20)

        #expect(service.cachedPost(id: "p1")?.id == "p1")
    }

    @Test func fetchPost_returnsAPIPostFromEndpoint() async throws {
        let mock = MockAPIClient()
        let post = APIPost.fixture(id: "p1")
        mock.stub(.getPost(id: "p1"), with: APIResponse(data: post))
        let service = StoryService(api: mock)

        let result = try await service.fetchPost(id: "p1")

        #expect(result.id == "p1")
    }

    @Test func fetchPost_404_throws() async {
        let mock = MockAPIClient()
        mock.stubError(.getPost(id: "missing"), error: APIError.notFound)
        let service = StoryService(api: mock)

        await #expect(throws: APIError.self) {
            _ = try await service.fetchPost(id: "missing")
        }
    }

    @Test func fetchPost_populatesCache() async throws {
        let mock = MockAPIClient()
        let post = APIPost.fixture(id: "p1")
        mock.stub(.getPost(id: "p1"), with: APIResponse(data: post))
        let service = StoryService(api: mock)

        _ = try await service.fetchPost(id: "p1")

        #expect(service.cachedPost(id: "p1")?.id == "p1")
    }
}
```

**Note** : le pattern de mocking et la structure exacte (`MockAPIClient`, `APIResponse`, `PaginatedAPIResponse`) doivent suivre la convention du SDK existant. Lire `packages/MeeshySDK/Tests/` pour s'aligner avant d'écrire (peut-être `XCTest` au lieu de `Testing`).

- [ ] **Step 3 : Run RED**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshySDKTests/StoryServiceCacheAndFetchTests
```

Expected : échec `cachedPost has no member`, `fetchPost has no member`.

- [ ] **Step 4 : Commit RED**

```bash
git add packages/MeeshySDK/Tests/MeeshySDKTests/StoryServiceTests.swift
git commit -m "test(sdk): RED for StoryService.cachedPost and fetchPost"
```

## Task B.2 — Implémenter cachedPost + fetchPost (GREEN)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/StoryService.swift`

- [ ] **Step 1 : Étendre le protocole**

```swift
public protocol StoryServiceProviding: Sendable {
    func list(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func markViewed(storyId: String) async throws
    func delete(storyId: String) async throws
    func react(storyId: String, emoji: String) async throws
    func comment(storyId: String, content: String) async throws -> APIPostComment
    func repost(storyId: String) async throws

    // Nouveaux
    func cachedPost(id: String) -> APIPost?
    func fetchPost(id: String) async throws -> APIPost
}
```

- [ ] **Step 2 : Implémenter dans la class StoryService**

```swift
public final class StoryService: StoryServiceProviding, @unchecked Sendable {
    private let api: APIClientProviding
    private let cacheLock = NSLock()
    private var postCache: [String: APIPost] = [:]   // simple in-memory cache, suffit pour le scope notif

    public init(api: APIClientProviding) {
        self.api = api
    }

    public func list(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        let response = try await api.request(...)  // existant
        cacheLock.lock()
        for post in response.data {
            postCache[post.id] = post
        }
        cacheLock.unlock()
        return response
    }

    public func cachedPost(id: String) -> APIPost? {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        return postCache[id]
    }

    public func fetchPost(id: String) async throws -> APIPost {
        let response: APIResponse<APIPost> = try await api.request(
            method: "GET",
            path: "/posts/\(id)",
            body: nil as String?
        )
        cacheLock.lock()
        postCache[id] = response.data
        cacheLock.unlock()
        return response.data
    }
}
```

**Notes** :
- Le path REST `/posts/{id}` est à confirmer côté gateway (routes existantes). Si différent (ex: `/posts/feed/stories/{id}`), ajuster.
- Le cache est volontairement simple (in-memory, dict). Pour une persistance plus robuste (cross-session), utiliser `CacheCoordinator` du SDK comme dans d'autres services. Acceptable pour ce scope : la story expire après 24h, le cache 1 session suffit.
- Conformité Swift 6 : `NSLock` ou `actor` selon les pratiques du codebase (regarder `MessagingService`/`ConversationService` pour pattern).

- [ ] **Step 3 : Run GREEN**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshySDKTests/StoryServiceCacheAndFetchTests
```

Expected : 5/5 verts.

- [ ] **Step 4 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/StoryService.swift
git commit -m "feat(sdk): add StoryService.cachedPost and fetchPost(id:)"
```

## Task B.3 — Tests Color.luminance

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/ColorLuminanceTests.swift`

- [ ] **Step 1 : Tests RED**

```swift
import Testing
import SwiftUI
@testable import MeeshyUI

@Suite("Color.luminance")
struct ColorLuminanceTests {

    @Test func white_isCloseToOne() {
        let lum = Color.white.luminance
        #expect(lum > 0.95 && lum <= 1.0)
    }

    @Test func black_isCloseToZero() {
        let lum = Color.black.luminance
        #expect(lum >= 0.0 && lum < 0.05)
    }

    @Test func midGray_isCloseToHalf() {
        let lum = Color(red: 0.5, green: 0.5, blue: 0.5).luminance
        #expect(lum > 0.18 && lum < 0.30)  // WCAG : 0.5 sRGB ≈ 0.214 linéaire
    }

    @Test func pureRed_hasExpectedLuminance() {
        let lum = Color(red: 1, green: 0, blue: 0).luminance
        #expect(lum > 0.20 && lum < 0.24)   // WCAG : 0.2126
    }
}
```

- [ ] **Step 2 : Run RED**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/ColorLuminanceTests
```

Expected : `Color has no member 'luminance'`.

- [ ] **Step 3 : Commit RED**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/ColorLuminanceTests.swift
git commit -m "test(ui): RED for Color.luminance"
```

## Task B.4 — Implémenter Color.luminance (GREEN)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift`

- [ ] **Step 1 : Ajouter l'extension à la fin du fichier**

```swift
import UIKit

public extension Color {
    /// Relative luminance per WCAG 2.x.
    /// Returns a value in [0.0, 1.0]. ~0.214 for mid-gray, ~0.2126 for pure red.
    var luminance: CGFloat {
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard ui.getRed(&r, green: &g, blue: &b, alpha: &a) else { return 0 }
        func channel(_ c: CGFloat) -> CGFloat {
            c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
}
```

**Note Swift 6** : `UIColor(self)` peut nécessiter un `@MainActor` dans certains contextes. Si la fonction doit être appelée depuis du code non-isolé, marquer `nonisolated` et utiliser `MainActor.assumeIsolated` ou recalculer manuellement à partir des composants RGB sans passer par UIColor.

- [ ] **Step 2 : Run GREEN**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/ColorLuminanceTests
```

Expected : 4/4 verts.

- [ ] **Step 3 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift
git commit -m "feat(ui): add Color.luminance per WCAG"
```

## Task B.5 — Helper StoryBackgroundPalette.randomBackgroundColorAsColor

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` (extension `StoryBackgroundPalette`)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/StoryBackgroundPaletteTests.swift`

- [ ] **Step 1 : Tests RED**

```swift
import Testing
import SwiftUI
@testable import MeeshyUI

@Suite("StoryBackgroundPalette helpers")
struct StoryBackgroundPaletteHelpersTests {

    @Test func randomBackgroundColorAsColor_returnsNonClearColor() {
        let color = StoryBackgroundPalette.randomBackgroundColorAsColor()
        #expect(color != .clear)
    }

    @Test func randomBackgroundColorAsColor_calledTwice_canDiffer() {
        // Random : pas garanti à 100% mais sur 10 essais c'est probabiliste
        var colors: Set<String> = []
        for _ in 0..<10 {
            colors.insert(StoryBackgroundPalette.randomBackgroundColor())
        }
        #expect(colors.count > 1)
    }
}
```

- [ ] **Step 2 : Run RED**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/StoryBackgroundPaletteHelpersTests
```

Expected : `randomBackgroundColorAsColor` undefined.

- [ ] **Step 3 : Implémenter le helper**

```swift
// À la fin de StoryComposerView.swift, à côté de l'enum StoryBackgroundPalette
extension StoryBackgroundPalette {
    /// Returns a random background color as SwiftUI Color (uses HSB random).
    static func randomBackgroundColorAsColor() -> Color {
        Color(hex: randomBackgroundColor())
    }
}
```

**Vérifier** : `Color(hex:)` doit exister dans MeeshyUI. Si non, utiliser le pattern existant (recherche via `grep -rn "Color(hex:" packages/MeeshySDK/Sources/`).

- [ ] **Step 4 : Run GREEN + commit**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/StoryBackgroundPaletteHelpersTests
```

Expected : 2/2 verts.

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/StoryBackgroundPaletteTests.swift
git commit -m "feat(ui): add StoryBackgroundPalette.randomBackgroundColorAsColor"
```

---

# Phase C — StoryNotificationTargetViewModel

## Task C.1 — Modèle d'intent + contexte de notification

**Files:**
- Create: `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationIntent.swift`

- [ ] **Step 1 : Créer les types**

```swift
// apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationIntent.swift
import Foundation

public enum StoryIntent: Hashable, Codable {
    case comments
    case reactions
}

public struct StoryNotificationContext: Hashable, Codable {
    public let actorAvatar: String?
    public let actorDisplayName: String
    public let trigger: Trigger
    public let occurredAt: Date

    public enum Trigger: Hashable, Codable {
        case reaction(emoji: String)
        case comment(preview: String)
    }

    public init(
        actorAvatar: String?,
        actorDisplayName: String,
        trigger: Trigger,
        occurredAt: Date
    ) {
        self.actorAvatar = actorAvatar
        self.actorDisplayName = actorDisplayName
        self.trigger = trigger
        self.occurredAt = occurredAt
    }
}

public extension StoryNotificationContext {
    /// Builder depuis une APINotification (mapping côté tap handler).
    static func from(_ notification: APINotification) -> StoryNotificationContext {
        let trigger: Trigger
        switch notification.type {
        case .storyReaction, .statusReaction:
            let emoji = notification.metadata?.reactionEmoji
                ?? notification.metadata?.emoji
                ?? "❤️"
            trigger = .reaction(emoji: emoji)
        default:
            let preview = notification.metadata?.commentPreview
                ?? notification.metadata?.contentPreview
                ?? ""
            trigger = .comment(preview: preview)
        }
        return StoryNotificationContext(
            actorAvatar: notification.actor?.avatarUrl,
            actorDisplayName: notification.actor?.displayName ?? notification.actor?.username ?? "",
            trigger: trigger,
            occurredAt: notification.createdAt ?? Date()
        )
    }
}
```

**Note** : adapter les noms `metadata.reactionEmoji`, `metadata.commentPreview` à la réalité de `NotificationMetadata` (lire `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift:240-280` et adapter).

- [ ] **Step 2 : Build sanity**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 3 : Commit**

```bash
git add apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationIntent.swift
git commit -m "feat(ios): add StoryIntent and StoryNotificationContext models"
```

## Task C.2 — Tests StoryNotificationTargetViewModel (RED)

**Files:**
- Create: `apps/ios/MeeshyTests/Features/Stories/Notifications/StoryNotificationTargetViewModelTests.swift`

- [ ] **Step 1 : Écrire les 7 tests**

```swift
import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class StoryNotificationTargetViewModelTests: XCTestCase {

    private func makeContext() -> StoryNotificationContext {
        StoryNotificationContext(
            actorAvatar: nil,
            actorDisplayName: "Alice",
            trigger: .reaction(emoji: "🔥"),
            occurredAt: Date()
        )
    }

    func test_load_withCachedActiveStory_emitsActiveImmediately() async {
        let mock = MockStoryService()
        let post = APIPost.fixture(id: "p1", expiresAt: Date().addingTimeInterval(3600))
        mock.cachedPostStub["p1"] = post

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )

        await vm.load()

        if case .active(let p) = vm.state { XCTAssertEqual(p.id, "p1") }
        else { XCTFail("Expected .active, got \(vm.state)") }
    }

    func test_load_withCachedExpiredStory_emitsExpiredImmediately() async {
        let mock = MockStoryService()
        let post = APIPost.fixture(id: "p1", expiresAt: Date().addingTimeInterval(-3600))
        mock.cachedPostStub["p1"] = post
        mock.fetchPostStub["p1"] = .failure(APIError.notFound)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .comments,
            context: makeContext(),
            storyService: mock
        )

        await vm.load()
        XCTAssertEqual(vm.state, .expired)
    }

    func test_load_withoutCache_fetchesFromNetwork_thenEmitsActive() async {
        let mock = MockStoryService()
        let post = APIPost.fixture(id: "p1", expiresAt: Date().addingTimeInterval(3600))
        mock.fetchPostStub["p1"] = .success(post)

        let vm = StoryNotificationTargetViewModel(storyId: "p1", intent: .reactions,
                                                  context: makeContext(), storyService: mock)
        await vm.load()

        if case .active(let p) = vm.state { XCTAssertEqual(p.id, "p1") }
        else { XCTFail() }
    }

    func test_load_withoutCache_andNetwork404_emitsExpired() async {
        let mock = MockStoryService()
        mock.fetchPostStub["p1"] = .failure(APIError.notFound)

        let vm = StoryNotificationTargetViewModel(storyId: "p1", intent: .reactions,
                                                  context: makeContext(), storyService: mock)
        await vm.load()
        XCTAssertEqual(vm.state, .expired)
    }

    func test_load_withoutCache_andNetworkError_emitsExpired() async {
        let mock = MockStoryService()
        mock.fetchPostStub["p1"] = .failure(URLError(.notConnectedToInternet))

        let vm = StoryNotificationTargetViewModel(storyId: "p1", intent: .reactions,
                                                  context: makeContext(), storyService: mock)
        await vm.load()
        XCTAssertEqual(vm.state, .expired)
    }

    func test_load_cacheActive_butNetworkReturnsExpired_revalidatesToExpired() async {
        let mock = MockStoryService()
        let cached = APIPost.fixture(id: "p1", expiresAt: Date().addingTimeInterval(60))
        let fresh = APIPost.fixture(id: "p1", expiresAt: Date().addingTimeInterval(-1))
        mock.cachedPostStub["p1"] = cached
        mock.fetchPostStub["p1"] = .success(fresh)

        let vm = StoryNotificationTargetViewModel(storyId: "p1", intent: .reactions,
                                                  context: makeContext(), storyService: mock)
        await vm.load()
        XCTAssertEqual(vm.state, .expired)
    }

    func test_load_idempotent_canBeCalledMultipleTimes() async {
        let mock = MockStoryService()
        let post = APIPost.fixture(id: "p1", expiresAt: Date().addingTimeInterval(3600))
        mock.fetchPostStub["p1"] = .success(post)

        let vm = StoryNotificationTargetViewModel(storyId: "p1", intent: .reactions,
                                                  context: makeContext(), storyService: mock)
        await vm.load()
        await vm.load()
        await vm.load()

        if case .active = vm.state {} else { XCTFail() }
        XCTAssertEqual(mock.fetchPostCallCount["p1"], 3)
    }
}

// MARK: - Mock

final class MockStoryService: StoryServiceProviding {
    var cachedPostStub: [String: APIPost] = [:]
    var fetchPostStub: [String: Result<APIPost, Error>] = [:]
    var fetchPostCallCount: [String: Int] = [:]

    func cachedPost(id: String) -> APIPost? { cachedPostStub[id] }

    func fetchPost(id: String) async throws -> APIPost {
        fetchPostCallCount[id, default: 0] += 1
        switch fetchPostStub[id] {
        case .success(let p): return p
        case .failure(let e): throw e
        case nil: throw APIError.notFound
        }
    }

    // Stubs minimaux pour conformer
    func list(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> { fatalError() }
    func markViewed(storyId: String) async throws {}
    func delete(storyId: String) async throws {}
    func react(storyId: String, emoji: String) async throws {}
    func comment(storyId: String, content: String) async throws -> APIPostComment { fatalError() }
    func repost(storyId: String) async throws {}
}

extension APIPost {
    static func fixture(id: String, expiresAt: Date? = nil) -> APIPost {
        // À adapter à l'init existant d'APIPost
        APIPost(id: id, /* ... */ expiresAt: expiresAt /* ... */)
    }
}

extension StoryNotificationTargetViewModel.LoadState: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        switch (lhs, rhs) {
        case (.loading, .loading), (.expired, .expired): return true
        case (.active(let a), .active(let b)): return a.id == b.id
        default: return false
        }
    }
}
```

**Note** : `APIPost.fixture(...)` doit s'aligner sur l'init réel d'`APIPost` dans `PostModels.swift`. Lister tous les champs requis et fournir des défauts sains.

- [ ] **Step 2 : Run RED**

```bash
./apps/ios/meeshy.sh test --only-testing:MeeshyTests/StoryNotificationTargetViewModelTests
```

Expected : `StoryNotificationTargetViewModel has no member`. Tests échouent.

- [ ] **Step 3 : Commit RED**

```bash
git add apps/ios/MeeshyTests/Features/Stories/Notifications/StoryNotificationTargetViewModelTests.swift
git commit -m "test(ios): RED for StoryNotificationTargetViewModel"
```

## Task C.3 — Implémenter StoryNotificationTargetViewModel (GREEN)

**Files:**
- Create: `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift`

- [ ] **Step 1 : Implémentation**

```swift
import Foundation
import SwiftUI
import MeeshySDK

@MainActor
public final class StoryNotificationTargetViewModel: ObservableObject {

    public enum LoadState {
        case loading
        case active(APIPost)
        case expired
    }

    @Published public private(set) var state: LoadState = .loading

    public let storyId: String
    public let intent: StoryIntent
    public let context: StoryNotificationContext

    private let storyService: StoryServiceProviding

    public init(
        storyId: String,
        intent: StoryIntent,
        context: StoryNotificationContext,
        storyService: StoryServiceProviding
    ) {
        self.storyId = storyId
        self.intent = intent
        self.context = context
        self.storyService = storyService
    }

    public func load() async {
        // Cache-first
        if let cached = storyService.cachedPost(id: storyId) {
            state = isExpired(cached) ? .expired : .active(cached)
        }
        // Network revalidation
        do {
            let fresh = try await storyService.fetchPost(id: storyId)
            state = isExpired(fresh) ? .expired : .active(fresh)
        } catch {
            if case .loading = state { state = .expired }
        }
    }

    private func isExpired(_ post: APIPost) -> Bool {
        guard let expiresAt = post.expiresAt else { return false }
        return expiresAt <= Date.now
    }
}
```

- [ ] **Step 2 : Run GREEN**

```bash
./apps/ios/meeshy.sh test --only-testing:MeeshyTests/StoryNotificationTargetViewModelTests
```

Expected : 7/7 verts.

- [ ] **Step 3 : Commit**

```bash
git add apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift
git commit -m "feat(ios): add StoryNotificationTargetViewModel with cache-first load"
```

---

# Phase D — StoryExpiredContent

## Task D.1 — Localizations xcstrings

**Files:**
- Modify: `apps/ios/Meeshy/Localizable.xcstrings`

- [ ] **Step 1 : Repérer le format actuel**

```bash
head -40 apps/ios/Meeshy/Localizable.xcstrings
```

- [ ] **Step 2 : Ajouter les 4 clés (FR primaire, EN secondaire)**

```json
"notifications.story.expired.title" : {
  "extractionState" : "manual",
  "localizations" : {
    "en" : { "stringUnit" : { "state" : "translated", "value" : "Story expired" } },
    "fr" : { "stringUnit" : { "state" : "translated", "value" : "Story expirée" } }
  }
},
"notifications.story.expired.subtitle" : {
  "extractionState" : "manual",
  "localizations" : {
    "en" : { "stringUnit" : { "state" : "translated", "value" : "This story is no longer available." } },
    "fr" : { "stringUnit" : { "state" : "translated", "value" : "Cette story n'est plus disponible." } }
  }
},
"notifications.story.expired.cta.create" : {
  "extractionState" : "manual",
  "localizations" : {
    "en" : { "stringUnit" : { "state" : "translated", "value" : "Create a story" } },
    "fr" : { "stringUnit" : { "state" : "translated", "value" : "Créer une story" } }
  }
},
"notifications.story.expired.back" : {
  "extractionState" : "manual",
  "localizations" : {
    "en" : { "stringUnit" : { "state" : "translated", "value" : "Back to notifications" } },
    "fr" : { "stringUnit" : { "state" : "translated", "value" : "Retour aux notifications" } }
  }
}
```

À insérer dans la section `"strings" : { ... }` au bon endroit (alphabétique ou en fin selon convention).

- [ ] **Step 3 : Sanity (compile + open in Xcode pour vérifier le JSON)**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Localizable.xcstrings
git commit -m "feat(ios): localizations for story-expired notification screen"
```

## Task D.2 — Tests StoryExpiredContent (RED)

**Files:**
- Create: `apps/ios/MeeshyTests/Features/Stories/Notifications/StoryExpiredContentTests.swift`

- [ ] **Step 1 : Tests RED**

```swift
import XCTest
import SwiftUI
@testable import Meeshy
@testable import MeeshyUI

@MainActor
final class StoryExpiredContentTests: XCTestCase {

    private func reactionContext(emoji: String = "😍") -> StoryNotificationContext {
        StoryNotificationContext(
            actorAvatar: nil,
            actorDisplayName: "Marie",
            trigger: .reaction(emoji: emoji),
            occurredAt: Date()
        )
    }

    private func commentContext(preview: String = "Trop belle") -> StoryNotificationContext {
        StoryNotificationContext(
            actorAvatar: nil,
            actorDisplayName: "Marie",
            trigger: .comment(preview: preview),
            occurredAt: Date()
        )
    }

    func test_render_reactionTrigger_showsEmojiAndActor() throws {
        let view = StoryExpiredContent(storyId: "s1", context: reactionContext(emoji: "🔥"))
        // Vérifier via ViewInspector OU snapshot OU body type
        // (à choisir selon convention codebase)
        XCTAssertNotNil(view.body)
        // Si ViewInspector dispo :
        // let inspected = try view.inspect()
        // XCTAssertTrue(try inspected.find(text: "🔥").string().contains("🔥"))
    }

    func test_render_commentTrigger_showsExcerpt() throws {
        let view = StoryExpiredContent(storyId: "s1", context: commentContext(preview: "Magnifique"))
        XCTAssertNotNil(view.body)
        // ViewInspector : find(text: "Magnifique")
    }

    func test_backgroundColor_isStableWithinSameInstance() {
        let view = StoryExpiredContent(storyId: "s1", context: reactionContext())
        // Sur un même @State, le bg doit être stable
        // À tester via snapshot ou via accès au state interne (KVO ou wrapper de test)
    }

    func test_textColor_adaptsToLuminance() {
        let lightBg = Color.white
        let darkBg = Color.black
        XCTAssertEqual(StoryExpiredContent.foregroundOnBackground(lightBg), .black)
        XCTAssertEqual(StoryExpiredContent.foregroundOnBackground(darkBg), .white)
    }
}
```

**Pattern à confirmer** : si `ViewInspector` n'est pas dispo, exposer une fonction statique pure `foregroundOnBackground(_:)` (pour tester la logique) et déléguer le rendu au manuel/UI test. C'est OK : le rendu visuel est couvert par les UI tests Phase I.

- [ ] **Step 2 : Run RED + commit**

```bash
./apps/ios/meeshy.sh test --only-testing:MeeshyTests/StoryExpiredContentTests
git add apps/ios/MeeshyTests/Features/Stories/Notifications/StoryExpiredContentTests.swift
git commit -m "test(ios): RED for StoryExpiredContent"
```

## Task D.3 — Implémenter StoryExpiredContent (GREEN)

**Files:**
- Create: `apps/ios/Meeshy/Features/Stories/Notifications/StoryExpiredContent.swift`

- [ ] **Step 1 : Implémentation**

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

public struct StoryExpiredContent: View {

    public let storyId: String
    public let context: StoryNotificationContext

    @EnvironmentObject private var router: Router
    @Environment(\.dismiss) private var dismiss

    @State private var background: Color = StoryBackgroundPalette.randomBackgroundColorAsColor()

    public init(storyId: String, context: StoryNotificationContext) {
        self.storyId = storyId
        self.context = context
    }

    public var body: some View {
        ZStack {
            background.ignoresSafeArea()
            VStack(spacing: 24) {
                Spacer()
                actorHeader
                triggerVisual
                triggerExcerpt
                titleBlock
                Spacer()
                createCTA
                backLink
                    .padding(.bottom, 24)
            }
            .padding(.horizontal, 32)
        }
        .foregroundStyle(Self.foregroundOnBackground(background))
    }

    public static func foregroundOnBackground(_ bg: Color) -> Color {
        bg.luminance > 0.6 ? .black : .white
    }

    @ViewBuilder
    private var actorHeader: some View {
        HStack(spacing: 12) {
            avatarView(url: context.actorAvatar, size: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(context.actorDisplayName).font(.headline)
                Text(context.occurredAt.formatted(.relative(presentation: .named)))
                    .font(.caption).opacity(0.7)
            }
            Spacer()
        }
    }

    @ViewBuilder
    private var triggerVisual: some View {
        switch context.trigger {
        case .reaction(let emoji):
            Text(emoji).font(.system(size: 64))
        case .comment:
            Image(systemName: "bubble.left.fill").font(.system(size: 56))
        }
    }

    @ViewBuilder
    private var triggerExcerpt: some View {
        if case .comment(let preview) = context.trigger, !preview.isEmpty {
            Text("« \(preview) »")
                .font(.body.italic())
                .multilineTextAlignment(.center)
                .lineLimit(3)
        }
    }

    @ViewBuilder
    private var titleBlock: some View {
        VStack(spacing: 8) {
            Text("notifications.story.expired.title")
                .font(.title.weight(.semibold))
            Text("notifications.story.expired.subtitle")
                .font(.body)
                .multilineTextAlignment(.center)
                .opacity(0.85)
        }
    }

    @ViewBuilder
    private var createCTA: some View {
        Button {
            // Trigger story composer (mécanisme existant)
            // Cf. audit : pas de route dédiée — utiliser le @Published showStoryComposer du tray, OU envoyer une notif app
            NotificationCenter.default.post(
                name: .openStoryComposer,
                object: nil
            )
            dismiss()
        } label: {
            Label(
                "notifications.story.expired.cta.create",
                systemImage: "plus.circle.fill"
            )
            .font(.headline)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .background(.ultraThinMaterial, in: Capsule())
        }
    }

    @ViewBuilder
    private var backLink: some View {
        Button {
            dismiss()
        } label: {
            Text("notifications.story.expired.back")
                .font(.subheadline)
                .underline()
                .opacity(0.85)
        }
    }

    @ViewBuilder
    private func avatarView(url: String?, size: CGFloat) -> some View {
        // Pattern existant : utiliser le composant avatar du codebase
        if let url = url, let u = URL(string: url) {
            AsyncImage(url: u) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    Circle().fill(.gray.opacity(0.3))
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        } else {
            Circle().fill(.gray.opacity(0.3))
                .frame(width: size, height: size)
                .overlay(Image(systemName: "person.fill"))
        }
    }
}

public extension Notification.Name {
    static let openStoryComposer = Notification.Name("me.meeshy.openStoryComposer")
}
```

**Note** : si le codebase a un avatar component dédié (`UserAvatarView`, `MeeshyAvatar`), l'utiliser à la place de `AsyncImage` brut.

**Note CTA** : le mécanisme exact pour ouvrir le composer dépend de l'arch existante. Audit a montré : `@Published var showStoryComposer: Bool` dans `StoryTrayView` + `.fullScreenCover`. Trois options :
1. NotificationCenter (couplage faible, simple)
2. Injection d'un `@EnvironmentObject` global pour le composer state
3. Closure callback passée par le parent

Choisir option 2 ou 3 selon le pattern le plus cohérent avec le reste (audit `apps/ios/Meeshy/Features/Main/Views/RootView.swift` pour voir où `showStoryComposer` est observé).

- [ ] **Step 2 : Run GREEN**

```bash
./apps/ios/meeshy.sh test --only-testing:MeeshyTests/StoryExpiredContentTests
./apps/ios/meeshy.sh build
```

- [ ] **Step 3 : Commit**

```bash
git add apps/ios/Meeshy/Features/Stories/Notifications/StoryExpiredContent.swift
git commit -m "feat(ios): add StoryExpiredContent screen with random background and CTA"
```

---

# Phase E — StoryNotificationLoadingView

## Task E.1 — Loading skeleton

**Files:**
- Create: `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationLoadingView.swift`

- [ ] **Step 1 : Implémenter (pas de tests : composant trivial visuel)**

```swift
import SwiftUI
import MeeshyUI

public struct StoryNotificationLoadingView: View {
    public init() {}

    public var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                Text("loading")  // utiliser une clé existante si dispo
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
    }
}
```

- [ ] **Step 2 : Build**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 3 : Commit**

```bash
git add apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationLoadingView.swift
git commit -m "feat(ios): add StoryNotificationLoadingView skeleton"
```

---

# Phase F — StoryActiveBridge + StoryViewerRequest extension

## Task F.1 — Étendre StoryViewerRequest avec initialAction

**Files:**
- Modify: fichier qui définit `StoryViewerRequest` (à localiser via grep)

- [ ] **Step 1 : Localiser**

```bash
grep -rn "struct StoryViewerRequest\|class StoryViewerRequest" apps/ios/Meeshy/
```

- [ ] **Step 2 : Étendre**

```swift
public struct StoryViewerRequest: Identifiable {
    public let id: Int   // ou String
    public var initialAction: StoryViewerInitialAction? = nil
    // ... champs existants
}

public enum StoryViewerInitialAction: Hashable {
    case showCommentsOverlay
    case showViewersSheet
}
```

- [ ] **Step 3 : Build**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 4 : Commit**

```bash
git add apps/ios/Meeshy/...
git commit -m "feat(ios): add initialAction to StoryViewerRequest for notification flow"
```

## Task F.2 — Modifier StoryViewerView pour réagir à initialAction

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift`

- [ ] **Step 1 : Ajouter le paramètre + le déclenchement**

```swift
struct StoryViewerView: View {
    // ... params existants
    let initialAction: StoryViewerInitialAction?

    @State private var hasTriggeredInitialAction = false

    init(
        // ... existants
        initialAction: StoryViewerInitialAction? = nil
    ) {
        // ... 
        self.initialAction = initialAction
    }

    var body: some View {
        // ... contenu existant
            .onAppear {
                triggerInitialActionIfNeeded()
            }
    }

    private func triggerInitialActionIfNeeded() {
        guard let action = initialAction, !hasTriggeredInitialAction else { return }
        hasTriggeredInitialAction = true
        // Léger delay pour laisser le canvas reader se monter avant d'ouvrir la sheet
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            switch action {
            case .showCommentsOverlay:
                self.showCommentsOverlay = true
                self.pauseTimer()
            case .showViewersSheet:
                self.showViewersSheet = true
                self.pauseTimer()
            }
        }
    }
}
```

**Note** : `showCommentsOverlay` et `showViewersSheet` sont déjà des `@State` dans `StoryViewerView` (audit lignes 121-122). `pauseTimer()` existe déjà (audit line 722).

- [ ] **Step 2 : Adapter tous les call sites de `StoryViewerView(...)` pour passer `initialAction: nil` par défaut**

```bash
grep -rn "StoryViewerView(" apps/ios/Meeshy/
```

Si le param `initialAction` a une valeur par défaut `nil`, aucun changement requis aux call sites existants (compatibilité ascendante).

- [ ] **Step 3 : Build + commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
git commit -m "feat(ios): support initialAction in StoryViewerView (auto-open comments/viewers)"
```

## Task F.3 — Tests StoryActiveBridge (RED)

**Files:**
- Create: `apps/ios/MeeshyTests/Features/Stories/Notifications/StoryActiveBridgeTests.swift`

- [ ] **Step 1 : Tests**

```swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class StoryActiveBridgeTests: XCTestCase {

    func test_appear_intentComments_setsStoryViewerRequestWithCommentsAction() {
        let coordinator = MockStoryViewerCoordinator()
        let post = APIPost.fixture(id: "p1")
        let bridge = StoryActiveBridge(
            post: post,
            intent: .comments,
            viewerCoordinator: coordinator,
            dismiss: {}
        )

        bridge.handleAppear()

        XCTAssertEqual(coordinator.lastRequest?.id /* ou storyId */, "p1" /* ou index */)
        XCTAssertEqual(coordinator.lastRequest?.initialAction, .showCommentsOverlay)
    }

    func test_appear_intentReactions_setsStoryViewerRequestWithViewersSheet() {
        let coordinator = MockStoryViewerCoordinator()
        let post = APIPost.fixture(id: "p1")
        let bridge = StoryActiveBridge(post: post, intent: .reactions,
                                       viewerCoordinator: coordinator, dismiss: {})

        bridge.handleAppear()

        XCTAssertEqual(coordinator.lastRequest?.initialAction, .showViewersSheet)
    }

    func test_appear_dismissesSelfAfterRequestSet() {
        let coordinator = MockStoryViewerCoordinator()
        let post = APIPost.fixture(id: "p1")
        var dismissed = false
        let bridge = StoryActiveBridge(post: post, intent: .comments,
                                       viewerCoordinator: coordinator,
                                       dismiss: { dismissed = true })

        bridge.handleAppear()
        XCTAssertTrue(dismissed)
    }
}

protocol StoryViewerCoordinating: AnyObject {
    func present(_ request: StoryViewerRequest)
}

final class MockStoryViewerCoordinator: StoryViewerCoordinating {
    var lastRequest: StoryViewerRequest?
    func present(_ request: StoryViewerRequest) {
        lastRequest = request
    }
}
```

- [ ] **Step 2 : Run RED + commit**

```bash
./apps/ios/meeshy.sh test --only-testing:MeeshyTests/StoryActiveBridgeTests
git add apps/ios/MeeshyTests/Features/Stories/Notifications/StoryActiveBridgeTests.swift
git commit -m "test(ios): RED for StoryActiveBridge"
```

## Task F.4 — Implémenter StoryActiveBridge (GREEN)

**Files:**
- Create: `apps/ios/Meeshy/Features/Stories/Notifications/StoryActiveBridge.swift`

- [ ] **Step 1 : Implémentation**

```swift
import SwiftUI
import MeeshySDK

@MainActor
public struct StoryActiveBridge: View {

    let post: APIPost
    let intent: StoryIntent
    let viewerCoordinator: StoryViewerCoordinating
    let dismiss: () -> Void

    public init(
        post: APIPost,
        intent: StoryIntent,
        viewerCoordinator: StoryViewerCoordinating,
        dismiss: @escaping () -> Void
    ) {
        self.post = post
        self.intent = intent
        self.viewerCoordinator = viewerCoordinator
        self.dismiss = dismiss
    }

    public var body: some View {
        StoryNotificationLoadingView()
            .onAppear { handleAppear() }
    }

    public func handleAppear() {
        let action: StoryViewerInitialAction = (intent == .comments)
            ? .showCommentsOverlay
            : .showViewersSheet
        let request = StoryViewerRequest(
            id: /* storyId-based or index */ post.id.hashValue,
            initialAction: action
            // ... autres champs requis selon la struct existante
        )
        viewerCoordinator.present(request)
        dismiss()
    }
}
```

**Note** : adapter les champs de `StoryViewerRequest.init(...)` à la signature exacte (audit a indiqué `StoryViewerRequest(id: storyViewModel.groupIndex(forStoryId: postId))`). Il faudra peut-être passer un `groupIndex` plutôt que le post directement, ou enrichir le viewer pour accepter un `postId`.

- [ ] **Step 2 : Run GREEN + commit**

```bash
./apps/ios/meeshy.sh test --only-testing:MeeshyTests/StoryActiveBridgeTests
git add apps/ios/Meeshy/Features/Stories/Notifications/StoryActiveBridge.swift
git commit -m "feat(ios): add StoryActiveBridge to redirect to StoryViewerView with initial action"
```

---

# Phase G — Route + RootView wiring

## Task G.1 — Ajouter le case Router.Route.storyNotificationTarget

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`

- [ ] **Step 1 : Ajouter le case**

```swift
// Dans enum Router.Route
case storyNotificationTarget(
    storyId: String,
    intent: StoryIntent,
    context: StoryNotificationContext
)
```

- [ ] **Step 2 : Vérifier conformance Hashable/Equatable du Route enum (si l'enum requiert)**

Les types `StoryIntent` et `StoryNotificationContext` doivent être `Hashable` (déjà fait en Task C.1).

- [ ] **Step 3 : Build + commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Navigation/Router.swift
git commit -m "feat(ios): add storyNotificationTarget to Router.Route"
```

## Task G.2 — Ajouter destination handler dans RootView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift`

- [ ] **Step 1 : Localiser le `navigationDestination(for: Router.Route.self)` ou switch équivalent**

```bash
grep -nE "navigationDestination|Router.Route" apps/ios/Meeshy/Features/Main/Views/RootView.swift | head
```

- [ ] **Step 2 : Ajouter le handler**

```swift
// Dans le switch des destinations :
case .storyNotificationTarget(let storyId, let intent, let context):
    StoryNotificationTargetScreen(
        storyId: storyId,
        intent: intent,
        context: context
    )
```

- [ ] **Step 3 : Build + commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/RootView.swift
git commit -m "feat(ios): wire storyNotificationTarget destination in RootView"
```

## Task G.3 — Mapping notification → push de la nouvelle route

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift` (function `navigateFromNotification`, lignes 315-355)

- [ ] **Step 1 : Modifier le switch existant**

```swift
private func navigateFromNotification(_ ctx: NotificationNavContext) {
    let appNotification = ctx.notification  // ou équivalent pour récupérer le APINotification

    switch ctx.type {
    case .storyReaction, .statusReaction:
        if let postId = ctx.postId, !postId.isEmpty {
            router.push(.storyNotificationTarget(
                storyId: postId,
                intent: .reactions,
                context: StoryNotificationContext.from(appNotification)
            ))
        }

    case .postComment, .legacyPostComment, .commentReply:
        // Distinguer story vs post normal via metadata.postType
        if appNotification.metadata?.postType == "STORY",
           let postId = ctx.postId, !postId.isEmpty {
            router.push(.storyNotificationTarget(
                storyId: postId,
                intent: .comments,
                context: StoryNotificationContext.from(appNotification)
            ))
        } else if let postId = ctx.postId, !postId.isEmpty {
            // Comportement existant pour posts normaux
            router.push(.postDetail(postId, nil, showComments: true))
        }

    // ... autres cases inchangés
    }
}
```

**Note critique** : si `metadata.postType` n'est pas systématiquement peuplé côté backend (audit l'a noté comme une lacune), prévoir un fallback : si le `postId` correspond à une story connue (cache `StoryService.cachedPost`), router vers `storyNotificationTarget` ; sinon `postDetail`. Cf. risk dans le spec.

- [ ] **Step 2 : Build + commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/RootView.swift
git commit -m "feat(ios): route story-related notifications to storyNotificationTarget"
```

---

# Phase H — StoryNotificationTargetScreen integration

## Task H.1 — Implémenter l'écran composé

**Files:**
- Create: `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetScreen.swift`

- [ ] **Step 1 : Implémentation**

```swift
import SwiftUI
import MeeshySDK

public struct StoryNotificationTargetScreen: View {

    @StateObject private var vm: StoryNotificationTargetViewModel
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var storyViewerCoordinator: StoryViewerCoordinator

    public init(
        storyId: String,
        intent: StoryIntent,
        context: StoryNotificationContext,
        storyService: StoryServiceProviding = StoryService.shared
    ) {
        _vm = StateObject(wrappedValue: StoryNotificationTargetViewModel(
            storyId: storyId,
            intent: intent,
            context: context,
            storyService: storyService
        ))
    }

    public var body: some View {
        Group {
            switch vm.state {
            case .loading:
                StoryNotificationLoadingView()
            case .active(let post):
                StoryActiveBridge(
                    post: post,
                    intent: vm.intent,
                    viewerCoordinator: storyViewerCoordinator,
                    dismiss: { dismiss() }
                )
            case .expired:
                StoryExpiredContent(storyId: vm.storyId, context: vm.context)
            }
        }
        .task { await vm.load() }
    }
}
```

**Note** : `StoryViewerCoordinator` (avec un `present(_ request:)`) doit exister ou être créé pour brancher `storyViewerRequest` du `RootView`. Si `storyViewerRequest` est juste un `@State` dans `RootView`, créer un `ObservableObject` léger pour le coordonner depuis n'importe quel descendant.

Audit pour voir : `grep -n "storyViewerRequest" apps/ios/Meeshy/`. Si c'est un `@State` dans RootView uniquement, le hisser dans un `@EnvironmentObject` `StoryViewerCoordinator` partagé.

- [ ] **Step 2 : Build + commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetScreen.swift
git commit -m "feat(ios): add StoryNotificationTargetScreen composing VM and sub-views"
```

## Task H.2 — Hisser storyViewerRequest dans StoryViewerCoordinator

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Coordinators/StoryViewerCoordinator.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift`

- [ ] **Step 1 : Créer le coordinator**

```swift
import SwiftUI

@MainActor
public final class StoryViewerCoordinator: ObservableObject, StoryViewerCoordinating {
    @Published public var pendingRequest: StoryViewerRequest?

    public init() {}

    public func present(_ request: StoryViewerRequest) {
        pendingRequest = request
    }

    public func dismiss() {
        pendingRequest = nil
    }
}
```

- [ ] **Step 2 : Wirer dans RootView**

```swift
// RootView
@StateObject private var storyViewerCoordinator = StoryViewerCoordinator()

var body: some View {
    NavigationStack(...) {
        // ...
    }
    .environmentObject(storyViewerCoordinator)
    .fullScreenCover(item: $storyViewerCoordinator.pendingRequest) { request in
        StoryViewerContainer(request: request)  // ou la vue qui consomme
    }
}
```

Si le pattern `storyViewerRequest` était un `@State` directement dans RootView, migrer ses utilisations vers le coordinator (audit + adapter les appels).

- [ ] **Step 3 : Build + commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Coordinators/StoryViewerCoordinator.swift \
        apps/ios/Meeshy/Features/Main/Views/RootView.swift
git commit -m "refactor(ios): hoist storyViewerRequest into StoryViewerCoordinator EnvObject"
```

---

# Phase I — UI Acceptance Tests

## Task I.1 — Test : story comment notification → canvas + comments overlay

**Files:**
- Create: `apps/ios/MeeshyUITests/Stories/StoryNotificationFlowUITests.swift`

- [ ] **Step 1 : Test**

```swift
import XCTest

final class StoryNotificationFlowUITests: XCTestCase {

    func test_storyCommentNotificationTap_activeStory_opensViewerWithCommentsOverlay() {
        let app = XCUIApplication()
        app.launchArguments += ["-uiTestSeedStory", "active"]
        app.launchArguments += ["-uiTestSeedNotification", "story_comment"]
        app.launch()

        // Login si requis (pattern existant des UI tests)
        // ...

        // Naviguer aux notifications
        app.tabBars.buttons["Notifications"].tap()
        app.cells.containing(NSPredicate(format: "label CONTAINS[c] 'a commenté'")).element.firstMatch.tap()

        // Vérifier que le canvas reader est ouvert + overlay commentaires visible
        XCTAssertTrue(app.otherElements["StoryCanvasReader"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.otherElements["StoryCommentsOverlay"].waitForExistence(timeout: 3))
    }
}
```

**Note** : les `accessibilityIdentifier` (`StoryCanvasReader`, `StoryCommentsOverlay`) doivent être ajoutés aux vues correspondantes pour que le test puisse les trouver. Si pas déjà présents, les ajouter (modification minimale) :

```swift
// Dans StoryViewerView ou StoryCanvasReaderView
.accessibilityIdentifier("StoryCanvasReader")

// Dans storyCommentsOverlay
.accessibilityIdentifier("StoryCommentsOverlay")
```

- [ ] **Step 2 : Run + commit**

```bash
xcodebuild test -workspace apps/ios/Meeshy.xcworkspace \
  -scheme Meeshy \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/StoryNotificationFlowUITests/test_storyCommentNotificationTap_activeStory_opensViewerWithCommentsOverlay
```

## Task I.2 — Test : story reaction notification + story expirée → expired screen

```swift
func test_storyReactionNotificationTap_expiredStory_opensExpiredScreenWithCTA() {
    let app = XCUIApplication()
    app.launchArguments += ["-uiTestSeedStory", "expired"]
    app.launchArguments += ["-uiTestSeedNotification", "story_reaction"]
    app.launch()

    app.tabBars.buttons["Notifications"].tap()
    app.cells.containing(NSPredicate(format: "label CONTAINS[c] 'a réagi'")).element.firstMatch.tap()

    XCTAssertTrue(app.staticTexts["Story expirée"].waitForExistence(timeout: 3))
    XCTAssertTrue(app.buttons["Créer une story"].exists)

    app.buttons["Créer une story"].tap()
    XCTAssertTrue(app.otherElements["StoryComposer"].waitForExistence(timeout: 3))
}
```

## Task I.3 — Test : reply to story sent → banner gone

```swift
func test_replyToStorySent_returningToConversation_bannerIsGone() {
    let app = XCUIApplication()
    app.launchArguments += ["-uiTestSeedStory", "active"]
    app.launchArguments += ["-uiTestSeedConversation", "with-active-story-reply"]
    app.launch()

    // Open conversation with pending story reply
    app.cells["TestConversation"].tap()
    XCTAssertTrue(app.otherElements["StoryReplyBanner"].exists)

    // Type and send
    let composer = app.textFields["MessageComposer"]
    composer.tap()
    composer.typeText("Reply text")
    app.buttons["SendMessage"].tap()

    // Banner should be gone
    XCTAssertFalse(app.otherElements["StoryReplyBanner"].waitForExistence(timeout: 1))

    // Leave + reopen
    app.navigationBars.buttons["Back"].tap()
    app.cells["TestConversation"].tap()

    // Still gone
    XCTAssertFalse(app.otherElements["StoryReplyBanner"].exists)
}
```

- [ ] **Step 1 : Ajouter `accessibilityIdentifier` aux composants concernés**

```swift
// StoryReplyBanner / banner reply view
.accessibilityIdentifier("StoryReplyBanner")

// Composer text field
.accessibilityIdentifier("MessageComposer")

// Send button
.accessibilityIdentifier("SendMessage")
```

- [ ] **Step 2 : Run all UI tests**

```bash
xcodebuild test -workspace apps/ios/Meeshy.xcworkspace \
  -scheme Meeshy \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/StoryNotificationFlowUITests
```

- [ ] **Step 3 : Commit final**

```bash
git add apps/ios/MeeshyUITests/Stories/StoryNotificationFlowUITests.swift \
        apps/ios/Meeshy/...
git commit -m "test(ios): UI acceptance for story notification flows + reply banner cleanup"
```

---

# Final verification

- [ ] **Step 1 : Build complet**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 2 : Tous les tests**

```bash
./apps/ios/meeshy.sh test
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5'
```

Expected : tous verts, build succeeded.

- [ ] **Step 3 : Lancer l'app et tester manuellement**

```bash
./apps/ios/meeshy.sh run
```

Vérifier sur l'app les 3 scénarios :
1. Tap notif commentaire de story active → canvas + commentaires.
2. Tap notif réaction de story expirée → écran « Story expirée » avec fond random + CTA fonctionnel.
3. Reply à une story → send → retour conversation → bannière absente.

---

# Risks & Mitigations

| Risque | Mitigation |
|--------|------------|
| Endpoint `GET /posts/{id}` n'existe pas côté gateway | Audit gateway routes ; si absent, créer un endpoint dédié (hors scope iOS), ou utiliser `/posts/feed/stories?id=...` si supporté |
| `metadata.postType` non systématique côté backend | Fallback dans `navigateFromNotification` : check `StoryService.cachedPost(id: postId)` avant decision |
| `StoryViewerRequest` a un init complexe (groupIndex, etc.) qu'on ne peut pas reproduire depuis un postId seul | Étendre `StoryViewerRequest` pour accepter un `directPostId` ; ou ajouter une méthode `groupIndex(forStoryId:)` accessible depuis StoryActiveBridge |
| Migration `storyViewerRequest` → coordinator casse les autres usages | Lister tous les call sites avant H.2 et adapter ; commit séparé pour visibilité |
| Tests `ViewInspector` pas dispo | Tests purs sur fonctions statiques (`foregroundOnBackground`) + UI tests |
| Swift 6 isolation sur `Color.luminance` | Recalculer en pure RGB sans UIColor si bloqué |

---

# Worktree workflow recommandé

Toutes les phases peuvent vivre dans le même worktree `feat/story-notifications-ux` :

```bash
git worktree add ../v2_meeshy-story-notifications-ux -b feat/story-notifications-ux dev
cd ../v2_meeshy-story-notifications-ux
./apps/ios/meeshy.sh build
```

Phase A peut être merged en isolé dès qu'elle est verte (ship rapide du bug fix). Pour ça, créer une seconde branche dédiée `fix/draft-reply-banner-cleanup` qui contient uniquement les commits de la Phase A, ouvrir une PR rapide.

Si subagents en parallèle : Phase A en une worktree, Phase B-H dans une autre. Phase I (UI tests) en dernier après merge.
