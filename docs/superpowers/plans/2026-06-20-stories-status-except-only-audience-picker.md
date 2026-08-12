# Stories/Status — Picker d'audience EXCEPT/ONLY (Incrément 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire un picker d'utilisateurs réutilisable côté iOS, le brancher sur les composers story et status, et réactiver les modes de visibilité `EXCEPT`/`ONLY` (visible par les contacts SAUF / SEULEMENT par des utilisateurs choisis).

**Architecture:** Le backend applique déjà entièrement EXCEPT/ONLY (champ `Post.visibilityUserIds`, surfacing, gate, broadcast) — **zéro travail gateway**. Le travail est iOS : (1) plomber `visibilityUserIds` dans la chaîne de création de story (SDK + app), (2) un `AudienceUserPickerView` réutilisable dans MeeshyUI, (3) le brancher sur les deux composers + réactiver les deux modes.

**Tech Stack:** Swift 6.2 / SwiftUI, MeeshySDK (core, isolation nonisolated) + MeeshyUI (UI, `defaultIsolation(MainActor)`), XCTest. Build via `./apps/ios/meeshy.sh build`. Tests SDK via scheme `MeeshySDK-Package`.

## Global Constraints

- **Pas de travail gateway.** Vérifié : `broadcastStoryCreated`/`broadcastStatusCreated` passent déjà par `getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds)` qui gère ONLY (`return visibilityUserIds`) et EXCEPT (`friendIds.filter(!in list)`). `buildVisibilityFilter`, `canUserViewPost`, `createPost` (persistance) gèrent déjà tout.
- **Périmètre iOS seulement.** Composer web = suivi séparé (non traité ici).
- **Isolation MeeshyUI :** `defaultIsolation(MainActor)` → les VM/Views sont `@MainActor` par défaut ; tout membre de logique pure appelé hors MainActor doit être `nonisolated`. `Bundle.module` est MainActor-isolé → labels via `String(localized:defaultValue:)` **sans** `bundle:`.
- **Tests MeeshyUITests/MeeshySDKTests :** target en isolation `nonisolated` (coreSwiftSettings) → corps de test qui touchent un type `@MainActor` doivent être annotés `@MainActor` explicitement. NE PAS mettre `@MainActor` sur la classe XCTestCase.
- **`.onChange` interdit en brut** → utiliser le wrapper `adaptiveOnChange(of:) { old, new in }` (MeeshyUI), forme 2-paramètres (cf. `StatusComposerView.swift:176`).
- **Mock pattern :** `Mock{Nom}` conforme au protocole, stub `Result<T, Error>` + compteur d'appels.
- **Champs persistés/encodés rollout-safe :** tout nouveau champ traversant une frontière de décodage est **optionnel** + `decodeIfPresent ?? défaut`.
- **Commits :** messages FR conventionnels, **pas** de trailer Co-Authored-By. Worktree partagé avec agent parallèle → commits sélectifs (pathspec explicite), jamais `--amend`, `git rev-parse HEAD` avant toute opération d'historique.
- **Labels copy (verbatim incrément 1) :** `ONLY` = « Seulement… », `EXCEPT` = « Sauf… », `FRIENDS` = « Contacts ».

---

### Task 1: SDK — plomberie `visibilityUserIds` dans la création de story

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift:139-153` (`CreateStoryRequest`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift:201-210` (`createStory`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueue.swift:15-71` (`StoryPublishQueueItem`)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/StoryPublishQueueItemTests.swift` (create)

**Interfaces:**
- Produces:
  - `CreateStoryRequest(content:storyEffects:visibility:visibilityUserIds:originalLanguage:mediaIds:repostOfId:)` avec `public let visibilityUserIds: [String]?`.
  - `PostService.createStory(content:storyEffects:visibility:visibilityUserIds:originalLanguage:mediaIds:repostOfId:) async throws -> APIPost` (nouveau param `visibilityUserIds: [String]? = nil`).
  - `StoryPublishQueueItem(visibility:slidesPayload:repostOfId:mediaReferences:tempStoryId:visibilityUserIds:)` avec `public let visibilityUserIds: [String]?`.

- [ ] **Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/StoryPublishQueueItemTests.swift`:
```swift
import XCTest
@testable import MeeshySDK

final class StoryPublishQueueItemTests: XCTestCase {
    func test_codableRoundTrip_preservesVisibilityUserIds() throws {
        let item = StoryPublishQueueItem(
            visibility: "ONLY",
            slidesPayload: Data([1, 2, 3]),
            visibilityUserIds: ["a", "b"]
        )
        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(StoryPublishQueueItem.self, from: data)
        XCTAssertEqual(decoded.visibilityUserIds, ["a", "b"])
    }

    func test_decodeLegacyItem_withoutVisibilityUserIds_defaultsNil() throws {
        // A row persisted before this field existed must still decode.
        let legacy = #"{"id":"1","tempStoryId":"pending_1","visibility":"PUBLIC","slidesPayload":"AQID","createdAt":0,"retryCount":0}"#
            .data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryPublishQueueItem.self, from: legacy)
        XCTAssertNil(decoded.visibilityUserIds)
        XCTAssertEqual(decoded.visibility, "PUBLIC")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:MeeshySDKTests/StoryPublishQueueItemTests -derivedDataPath ../../apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -30`
Expected: FAIL — `extra argument 'visibilityUserIds' in call` (le param n'existe pas encore).

- [ ] **Step 3: Add the field to `StoryPublishQueueItem`**

In `StoryPublishQueue.swift`, after line 33 (`public var lastError: String?`):
```swift
    /// IDs d'utilisateurs ciblés (ONLY) ou exclus (EXCEPT). Optionnel pour
    /// rester rétro-compatible avec les rows persistés avant ce champ.
    public let visibilityUserIds: [String]?
```
Update `CodingKeys` (line 35-38) to include the new key:
```swift
    enum CodingKeys: String, CodingKey {
        case id, tempStoryId, visibility, slidesPayload, repostOfId
        case mediaReferences, createdAt, retryCount, lastError, visibilityUserIds
    }
```
Update the memberwise init (line 40-57) — add the param (last, defaulted) and the assignment:
```swift
    public init(
        visibility: String,
        slidesPayload: Data,
        repostOfId: String? = nil,
        mediaReferences: [StoryMediaReference] = [],
        tempStoryId: String? = nil,
        visibilityUserIds: [String]? = nil
    ) {
        let queueId = UUID().uuidString
        self.id = queueId
        self.tempStoryId = tempStoryId ?? "pending_\(queueId)"
        self.visibility = visibility
        self.slidesPayload = slidesPayload
        self.repostOfId = repostOfId
        self.mediaReferences = mediaReferences
        self.createdAt = Date()
        self.retryCount = 0
        self.lastError = nil
        self.visibilityUserIds = visibilityUserIds
    }
```
Update `init(from:)` (line 59-70) — add a rollout-safe decode before the closing brace:
```swift
        self.visibilityUserIds = try container.decodeIfPresent([String].self, forKey: .visibilityUserIds)
```

- [ ] **Step 4: Add the field to `CreateStoryRequest` and `PostService.createStory`**

In `ServiceModels.swift` `CreateStoryRequest` (139-153), add the stored property after `visibility` and the init param:
```swift
public struct CreateStoryRequest: Encodable {
    public let type = "STORY"
    public let content: String?
    public let storyEffects: StoryEffects?
    public let visibility: String
    public let visibilityUserIds: [String]?
    public let originalLanguage: String?
    public let mediaIds: [String]?
    public let repostOfId: String?

    public init(content: String? = nil, storyEffects: StoryEffects? = nil, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, originalLanguage: String? = nil, mediaIds: [String]? = nil, repostOfId: String? = nil) {
        self.content = content; self.storyEffects = storyEffects; self.visibility = visibility
        self.visibilityUserIds = visibilityUserIds
        self.originalLanguage = originalLanguage; self.mediaIds = mediaIds
        self.repostOfId = repostOfId
    }
}
```
In `PostService.swift` `createStory` (201-210), add the param and forward it. Replace the signature + the `CreateStoryRequest(...)` construction inside the method body so it reads:
```swift
    public func createStory(
        content: String?,
        storyEffects: StoryEffects?,
        visibility: String = "PUBLIC",
        visibilityUserIds: [String]? = nil,
        originalLanguage: String? = nil,
        mediaIds: [String]? = nil,
        repostOfId: String? = nil
    ) async throws -> APIPost {
```
and in its body, the request build adds `visibilityUserIds: visibilityUserIds` (find the existing `CreateStoryRequest(content:` call inside `createStory` and add the argument right after `visibility:`).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:MeeshySDKTests/StoryPublishQueueItemTests -derivedDataPath ../../apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -30`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueue.swift packages/MeeshySDK/Tests/MeeshySDKTests/StoryPublishQueueItemTests.swift
git commit -m "feat(sdk): propage visibilityUserIds dans la création de story (request + queue offline)" -- packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueue.swift packages/MeeshySDK/Tests/MeeshySDKTests/StoryPublishQueueItemTests.swift
```

---

### Task 2: App — `StoryViewModel` propage `visibilityUserIds` (online + offline + drain)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` — `StoryUploadState` (200-229), `executeQueuedPublish` (119-135), `publishStoryInBackground` (600-655), `enqueueStoryForOfflinePublish` (671-748), `runStoryUpload` createStory (957-964)

**Interfaces:**
- Consumes (Task 1): `PostService.createStory(..., visibilityUserIds:)`, `StoryPublishQueueItem(..., visibilityUserIds:)`, `StoryPublishQueueItem.visibilityUserIds: [String]?`.
- Produces:
  - `StoryViewModel.publishStoryInBackground(slides:slideImages:loadedImages:loadedVideoURLs:loadedAudioURLs:originalLanguage:visibility:visibilityUserIds:)` (nouveau dernier param `visibilityUserIds: [String] = []`).
  - `StoryUploadState.visibilityUserIds: [String]` (défaut `[]`).

- [ ] **Step 1: Add `visibilityUserIds` to `StoryUploadState`**

In `StoryViewModel.swift`, in `struct StoryUploadState` (200-229), after `let visibility: String` (line 216):
```swift
        let visibilityUserIds: [String]
```

- [ ] **Step 2: Thread it through `publishStoryInBackground`**

Replace the signature (600-608) to add the param (note `loadedAudioURLs` is `[String: URL]`):
```swift
    func publishStoryInBackground(
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL] = [:],
        originalLanguage: String? = nil,
        visibility: String = "PUBLIC",
        visibilityUserIds: [String] = []
    ) {
```
Then:
- In the offline branch (617-625), add `visibilityUserIds: visibilityUserIds` to the `enqueueStoryForOfflinePublish(...)` call (after `visibility: visibility`).
- In the `StoryUploadState(...)` construction (635-650), add `visibilityUserIds: visibilityUserIds` after `visibility: visibility` (line 649).

- [ ] **Step 3: Thread it through `enqueueStoryForOfflinePublish`**

Replace the signature (671-678) to add the param, and pass it to the queue item (741-747):
```swift
    func enqueueStoryForOfflinePublish(
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL],
        visibility: String,
        visibilityUserIds: [String]
    ) async {
```
and at the `StoryPublishQueueItem(...)` build (741):
```swift
        let item = StoryPublishQueueItem(
            visibility: visibility,
            slidesPayload: payload,
            repostOfId: nil,
            mediaReferences: mediaReferences,
            tempStoryId: tempStoryId,
            visibilityUserIds: visibilityUserIds
        )
```

- [ ] **Step 4: Thread it through the drain path + the upload call**

In `executeQueuedPublish` (119-135), at the `StoryUploadState(...)` build, after `visibility: item.visibility` (line 134):
```swift
            visibility: item.visibility,
            visibilityUserIds: item.visibilityUserIds ?? []
```
In `runStoryUpload` at the `createStory` call (957-964), add the argument after `visibility: upload.visibility`:
```swift
            let post = try await postService.createStory(
                content: slide.content,
                storyEffects: updatedEffects,
                visibility: upload.visibility,
                visibilityUserIds: upload.visibilityUserIds,
                originalLanguage: upload.originalLanguage,
                mediaIds: allMediaIds.isEmpty ? nil : allMediaIds,
                repostOfId: nil
            )
```

- [ ] **Step 5: Build to verify it compiles**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -25`
Expected: BUILD SUCCEEDED. (Pure pass-through plumbing — behaviour covered by Task 1's queue round-trip test and the e2e wiring in Tasks 5-6; no isolated unit test added here.)

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift
git commit -m "feat(ios/story): StoryViewModel propage visibilityUserIds (online/offline/drain)" -- apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift
```

---

### Task 3: Enum — réactiver EXCEPT/ONLY + rendre `PostVisibility` Identifiable

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/PostVisibilityTests.swift` (existant — mettre à jour)

**Interfaces:**
- Produces: `PostVisibility.composerSelectableCases == [.public, .community, .friends, .except, .only, .private]` ; `PostVisibility: Identifiable` avec `var id: String { rawValue }`.

- [ ] **Step 1: Update the existing test (RED)**

In `packages/MeeshySDK/Tests/MeeshyUITests/PostVisibilityTests.swift`, find the test asserting `composerSelectableCases` excludes except/only (increment 1) and replace it with:
```swift
    func test_composerSelectableCases_includesExceptAndOnly() {
        let cases = PostVisibility.composerSelectableCases
        XCTAssertTrue(cases.contains(.except))
        XCTAssertTrue(cases.contains(.only))
        XCTAssertEqual(cases, [.public, .community, .friends, .except, .only, .private])
    }

    func test_identifiable_idIsRawValue() {
        XCTAssertEqual(PostVisibility.only.id, "ONLY")
    }
```
(Remove the old `...excludesExceptAndOnly` assertion entirely.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:MeeshyUITests/PostVisibilityTests -derivedDataPath ../../apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -30`
Expected: FAIL — `composerSelectableCases` lacks except/only AND `PostVisibility` has no member `id`.

- [ ] **Step 3: Implement**

In `PostVisibility.swift`, change the enum declaration to add `Identifiable`:
```swift
public enum PostVisibility: String, CaseIterable, Sendable, Codable, Identifiable {
```
add the `id` after the cases (before `requiresUserSelection`):
```swift
    public nonisolated var id: String { rawValue }
```
and change `composerSelectableCases` (46-48):
```swift
    public nonisolated static var composerSelectableCases: [PostVisibility] {
        [.public, .community, .friends, .except, .only, .private]
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:MeeshyUITests/PostVisibilityTests -derivedDataPath ../../apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -30`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift packages/MeeshySDK/Tests/MeeshyUITests/PostVisibilityTests.swift
git commit -m "feat(ios): réactive EXCEPT/ONLY dans composerSelectableCases + PostVisibility Identifiable" -- packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift packages/MeeshySDK/Tests/MeeshyUITests/PostVisibilityTests.swift
```

---

### Task 4: `AudienceUserPickerView` + VM (MeeshyUI)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/AudienceUserPickerView.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/AudienceUserPickerViewModelTests.swift` (create)

**Interfaces:**
- Consumes: `UserService.searchUsers(query:limit:offset:) async throws -> [UserSearchResult]` ; `UserSearchResult(id:username:displayName:avatar:isOnline:)` (MeeshySDK) ; `AuthManager.shared.currentUser?.id` ; `MeeshyAvatar(name:context:)` with `AvatarContext.userListItem` ; `adaptiveOnChange(of:) { _, _ in }`.
- Produces:
  - `public protocol AudienceUserSearching: Sendable { func searchUsers(query: String, limit: Int, offset: Int) async throws -> [UserSearchResult] }`
  - `extension UserService: AudienceUserSearching {}`
  - `AudienceUserPickerViewModel(initialSelection:[String], currentUserId:String?, userService:AudienceUserSearching = UserService.shared)` with `@Published selectedIds:[String]`, `results:[UserSearchResult]`, `selectedUsers:[UserSearchResult]`, `query:String`, `isSearching:Bool` ; methods `performSearch() async`, `toggle(_:UserSearchResult)`, `isSelected(_:String)->Bool`.
  - `public struct AudienceUserPickerView: View` init `(mode:PostVisibility, initialSelection:[String], currentUserId:String? = AuthManager.shared.currentUser?.id, onDone:@escaping ([String]) -> Void)`.

- [ ] **Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshyUITests/AudienceUserPickerViewModelTests.swift`:
```swift
import XCTest
@testable import MeeshyUI
import MeeshySDK

final class MockAudienceUserSearching: AudienceUserSearching, @unchecked Sendable {
    var stub: Result<[UserSearchResult], Error> = .success([])
    private(set) var callCount = 0
    private(set) var lastQuery: String?
    func searchUsers(query: String, limit: Int, offset: Int) async throws -> [UserSearchResult] {
        callCount += 1
        lastQuery = query
        return try stub.get()
    }
}

final class AudienceUserPickerViewModelTests: XCTestCase {
    @MainActor
    func test_performSearch_populatesResults_excludingSelf() async {
        let mock = MockAudienceUserSearching()
        mock.stub = .success([
            UserSearchResult(id: "me", username: "me"),
            UserSearchResult(id: "u1", username: "ana"),
        ])
        let vm = AudienceUserPickerViewModel(initialSelection: [], currentUserId: "me", userService: mock)
        vm.query = "a"
        await vm.performSearch()
        XCTAssertEqual(vm.results.map(\.id), ["u1"])
        XCTAssertEqual(mock.callCount, 1)
        XCTAssertEqual(mock.lastQuery, "a")
    }

    @MainActor
    func test_performSearch_blankQuery_doesNotCallService() async {
        let mock = MockAudienceUserSearching()
        mock.stub = .success([UserSearchResult(id: "u1", username: "ana")])
        let vm = AudienceUserPickerViewModel(initialSelection: [], currentUserId: nil, userService: mock)
        vm.query = "   "
        await vm.performSearch()
        XCTAssertTrue(vm.results.isEmpty)
        XCTAssertEqual(mock.callCount, 0)
    }

    @MainActor
    func test_toggle_addsThenRemoves() {
        let vm = AudienceUserPickerViewModel(initialSelection: [], currentUserId: nil, userService: MockAudienceUserSearching())
        let u = UserSearchResult(id: "u1", username: "ana")
        vm.toggle(u)
        XCTAssertEqual(vm.selectedIds, ["u1"])
        XCTAssertTrue(vm.isSelected("u1"))
        XCTAssertEqual(vm.selectedUsers.map(\.id), ["u1"])
        vm.toggle(u)
        XCTAssertTrue(vm.selectedIds.isEmpty)
        XCTAssertFalse(vm.isSelected("u1"))
        XCTAssertTrue(vm.selectedUsers.isEmpty)
    }

    @MainActor
    func test_initialSelection_seedsSelectedIds() {
        let vm = AudienceUserPickerViewModel(initialSelection: ["x", "y"], currentUserId: nil, userService: MockAudienceUserSearching())
        XCTAssertEqual(vm.selectedIds, ["x", "y"])
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:MeeshyUITests/AudienceUserPickerViewModelTests -derivedDataPath ../../apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -30`
Expected: FAIL — `cannot find 'AudienceUserPickerViewModel'`/`AudienceUserSearching` in scope (build error in test target).

- [ ] **Step 3: Create the view + VM + protocol**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/AudienceUserPickerView.swift`:
```swift
import SwiftUI
import MeeshySDK

/// Narrow search seam so the picker VM can be unit-tested with a one-method
/// mock instead of conforming to the full `UserServiceProviding`.
public protocol AudienceUserSearching: Sendable {
    func searchUsers(query: String, limit: Int, offset: Int) async throws -> [UserSearchResult]
}

extension UserService: AudienceUserSearching {}

@MainActor
final class AudienceUserPickerViewModel: ObservableObject {
    @Published var query: String = ""
    @Published var results: [UserSearchResult] = []
    @Published var selectedIds: [String]
    @Published var selectedUsers: [UserSearchResult] = []
    @Published var isSearching: Bool = false

    private let userService: AudienceUserSearching
    private let currentUserId: String?

    init(initialSelection: [String],
         currentUserId: String?,
         userService: AudienceUserSearching = UserService.shared) {
        self.selectedIds = initialSelection
        self.currentUserId = currentUserId
        self.userService = userService
    }

    func performSearch() async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { results = []; return }
        isSearching = true
        defer { isSearching = false }
        do {
            let found = try await userService.searchUsers(query: trimmed, limit: 20, offset: 0)
            results = found.filter { $0.id != currentUserId }
        } catch {
            results = []
        }
    }

    func isSelected(_ id: String) -> Bool { selectedIds.contains(id) }

    func toggle(_ user: UserSearchResult) {
        if let idx = selectedIds.firstIndex(of: user.id) {
            selectedIds.remove(at: idx)
            selectedUsers.removeAll { $0.id == user.id }
        } else {
            selectedIds.append(user.id)
            if !selectedUsers.contains(where: { $0.id == user.id }) {
                selectedUsers.append(user)
            }
        }
    }
}

/// Reusable audience picker for ONLY / EXCEPT post visibility. Agnostic: it
/// takes the mode (for copy), an initial selection, and reports the chosen
/// user IDs via `onDone`. Search runs against `/users/search`.
public struct AudienceUserPickerView: View {
    private let mode: PostVisibility
    private let onDone: ([String]) -> Void
    @StateObject private var vm: AudienceUserPickerViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var searchTask: Task<Void, Never>?

    public init(mode: PostVisibility,
                initialSelection: [String],
                currentUserId: String? = AuthManager.shared.currentUser?.id,
                onDone: @escaping ([String]) -> Void) {
        self.mode = mode
        self.onDone = onDone
        _vm = StateObject(wrappedValue: AudienceUserPickerViewModel(
            initialSelection: initialSelection,
            currentUserId: currentUserId
        ))
    }

    private var title: String {
        mode == .only
            ? String(localized: "audience.picker.only.title", defaultValue: "Seulement ces personnes")
            : String(localized: "audience.picker.except.title", defaultValue: "Tout le monde sauf")
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchField
                if !vm.selectedUsers.isEmpty { selectedChips }
                resultsList
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "OK")) {
                        onDone(vm.selectedIds)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(String(localized: "audience.picker.search", defaultValue: "Rechercher…"), text: $vm.query)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if vm.isSearching {
                ProgressView().scaleEffect(0.8)
            } else if !vm.query.isEmpty {
                Button { vm.query = ""; vm.results = [] } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .adaptiveOnChange(of: vm.query) { _, _ in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 350_000_000)
                guard !Task.isCancelled else { return }
                await vm.performSearch()
            }
        }
    }

    private var selectedChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(vm.selectedUsers) { user in
                    HStack(spacing: 6) {
                        Text(user.displayName ?? user.username)
                            .font(.system(size: 13, weight: .medium))
                            .lineLimit(1)
                        Button { vm.toggle(user) } label: {
                            Image(systemName: "xmark.circle.fill").font(.system(size: 13))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Color(.tertiarySystemBackground)))
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.bottom, 8)
    }

    private var resultsList: some View {
        List {
            ForEach(vm.results) { user in
                Button { vm.toggle(user) } label: { row(user) }
                    .buttonStyle(.plain)
            }
        }
        .listStyle(.plain)
    }

    private func row(_ user: UserSearchResult) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(name: user.displayName ?? user.username, context: .userListItem)
            VStack(alignment: .leading, spacing: 2) {
                Text(user.displayName ?? user.username)
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(1)
                Text("@\(user.username)")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: vm.isSelected(user.id) ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 20))
                .foregroundStyle(vm.isSelected(user.id) ? Color.accentColor : Color.secondary)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 4)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:MeeshyUITests/AudienceUserPickerViewModelTests -derivedDataPath ../../apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -30`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/MeeshySDK/Sources/MeeshyUI/Story/AudienceUserPickerView.swift packages/MeeshySDK/Tests/MeeshyUITests/AudienceUserPickerViewModelTests.swift
git commit -m "feat(ios): AudienceUserPickerView réutilisable (recherche + multi-select) pour EXCEPT/ONLY" -- packages/MeeshySDK/Sources/MeeshyUI/Story/AudienceUserPickerView.swift packages/MeeshySDK/Tests/MeeshyUITests/AudienceUserPickerViewModelTests.swift
```

---

### Task 5: Branchement story (`StoryComposerView`) + sites d'appel app

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` — state (213), callback type (233-241), both inits (247, 267), `visibilityMenu` (779-802), invocation (2127), + a `.sheet`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift:221`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift:66`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:568`

**Interfaces:**
- Consumes (Task 2): `StoryViewModel.publishStoryInBackground(..., visibilityUserIds:)`. (Task 3): `PostVisibility: Identifiable`, `.requiresUserSelection`. (Task 4): `AudienceUserPickerView`.
- Produces: `StoryComposerView.onPublishAllInBackground` gains a trailing `_ visibilityUserIds: [String]` parameter (arity 7 → 8).

- [ ] **Step 1: Add picker state**

In `StoryComposerView.swift`, after line 213 (`@State private var visibility: String = "PUBLIC"`):
```swift
    @State private var visibilityUserIds: [String] = []
    @State private var audiencePickerMode: PostVisibility?
```

- [ ] **Step 2: Extend the callback type + both inits**

Replace the `onPublishAllInBackground` property type (233-241):
```swift
    public var onPublishAllInBackground: (
        _ slides: [StorySlide],
        _ slideImages: [String: UIImage],
        _ loadedImages: [String: UIImage],
        _ loadedVideoURLs: [String: URL],
        _ loadedAudioURLs: [String: URL],
        _ originalLanguage: String?,
        _ visibility: String,
        _ visibilityUserIds: [String]
    ) -> Void
```
In BOTH inits, update the `onPublishAllInBackground` parameter type (lines 247 and 267) from
`@escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String) -> Void`
to
`@escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String]) -> Void`.

- [ ] **Step 3: Drive the picker from the menu + show the count on the capsule**

Replace `visibilityMenu` (779-802):
```swift
    private var visibilityMenu: some View {
        Menu {
            ForEach(PostVisibility.composerSelectableCases) { mode in
                Button {
                    visibility = mode.rawValue
                    if mode.requiresUserSelection { audiencePickerMode = mode }
                } label: {
                    Label(mode.label, systemImage: visibility == mode.rawValue ? "checkmark" : mode.icon)
                }
            }
        } label: {
            let current = PostVisibility(rawValue: visibility) ?? .public
            let showCount = current.requiresUserSelection && !visibilityUserIds.isEmpty
            HStack(spacing: 4) {
                Image(systemName: current.icon)
                    .font(.system(size: 12, weight: .semibold))
                Text(showCount ? "\(current.label) (\(visibilityUserIds.count))" : current.label)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .adaptiveGlass(in: Capsule(), tint: .white.opacity(0.18))
        }
        .sheet(item: $audiencePickerMode) { mode in
            AudienceUserPickerView(mode: mode, initialSelection: visibilityUserIds) { ids in
                visibilityUserIds = ids
            }
        }
    }
```

- [ ] **Step 4: Pass the IDs at publish (gated on the mode)**

Replace the invocation (2127):
```swift
            let mode = PostVisibility(rawValue: visibility) ?? .public
            let ids = mode.requiresUserSelection ? visibilityUserIds : []
            onPublishAllInBackground(snapshot.slides, snapshot.bgImages, viewModel.loadedImages, viewModel.loadedVideoURLs, viewModel.loadedAudioURLs, storyLanguage, visibility, ids)
```

- [ ] **Step 5: Update the three call sites to the new arity**

`UnifiedPostComposer.swift:221`:
```swift
                onPublishAllInBackground: { _, _, _, _, _, _, _, _ in },
```
`StoryTrayView.swift:66` — add the closure param and forward it:
```swift
                    onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility, visibilityUserIds in
                        viewModel.publishStoryInBackground(
                            slides: slides,
                            slideImages: slideImages,
                            loadedImages: loadedImages,
                            loadedVideoURLs: loadedVideoURLs,
                            loadedAudioURLs: loadedAudioURLs,
                            originalLanguage: originalLanguage,
                            visibility: visibility,
                            visibilityUserIds: visibilityUserIds
                        )
                    }
```
`StoryViewerView.swift:568` — same param addition + forward (keep the trailing `repostStoryComposerSource = nil`):
```swift
                onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility, visibilityUserIds in
                    viewModel.publishStoryInBackground(
                        slides: slides,
                        slideImages: slideImages,
                        loadedImages: loadedImages,
                        loadedVideoURLs: loadedVideoURLs,
                        loadedAudioURLs: loadedAudioURLs,
                        originalLanguage: originalLanguage,
                        visibility: visibility,
                        visibilityUserIds: visibilityUserIds
                    )
                    repostStoryComposerSource = nil
                }
```

- [ ] **Step 6: Build to verify**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -25`
Expected: BUILD SUCCEEDED.

- [ ] **Step 7: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
git commit -m "feat(ios/story): picker EXCEPT/ONLY dans le header composer + plomberie visibilityUserIds" -- packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
```

---

### Task 6: Branchement status (`StatusComposerView`)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift` — state (21-26), `visibilityPicker` (237-276)

**Interfaces:**
- Consumes (Task 3): `PostVisibility.requiresUserSelection`. (Task 4): `AudienceUserPickerView`. Existing: `selectedUserIds`, `setStatus(..., visibilityUserIds:)`.

- [ ] **Step 1: Add picker presentation state**

In `StatusComposerView.swift`, after line 26 (`@State private var selectedUserIds: [String] = []`):
```swift
    @State private var audiencePickerMode: PostVisibility?
```

- [ ] **Step 2: Drive the picker from the mode buttons + counter + sheet**

Replace `visibilityPicker` (237-276):
```swift
    private var visibilityPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(PostVisibility.composerSelectableCases, id: \.rawValue) { vis in
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedVisibility = vis
                            lastVisibility = vis.rawValue
                        }
                        if vis.requiresUserSelection { audiencePickerMode = vis }
                        HapticFeedback.light()
                    } label: {
                        let showCount = vis.requiresUserSelection && selectedVisibility == vis && !selectedUserIds.isEmpty
                        HStack(spacing: 4) {
                            Image(systemName: vis.icon)
                                .font(.system(size: 11))
                            Text(showCount ? "\(vis.label) (\(selectedUserIds.count))" : vis.label)
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(selectedVisibility == vis ? .white : theme.textSecondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule()
                                .fill(selectedVisibility == vis ?
                                    AnyShapeStyle(MeeshyColors.brandGradient) :
                                    AnyShapeStyle(theme.inputBackground))
                        )
                    }
                }
            }
            .padding(.horizontal, 4)
        }
        .sheet(item: $audiencePickerMode) { mode in
            AudienceUserPickerView(mode: mode, initialSelection: selectedUserIds) { ids in
                selectedUserIds = ids
            }
        }
        .onAppear {
            if let vis = PostVisibility(rawValue: lastVisibility),
               PostVisibility.composerSelectableCases.contains(vis) {
                selectedVisibility = vis
            } else {
                selectedVisibility = .public
            }
        }
    }
```

- [ ] **Step 3: Build to verify**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -25`
Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift
git commit -m "feat(ios/status): picker EXCEPT/ONLY dans le composer status" -- apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift
```

---

### Task 7: Vérification d'intégration

**Files:** none (build + tests).

- [ ] **Step 1: Full SDK test pass**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:MeeshyUITests/AudienceUserPickerViewModelTests -only-testing:MeeshyUITests/PostVisibilityTests -only-testing:MeeshySDKTests/StoryPublishQueueItemTests -derivedDataPath ../../apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -20`
Expected: all PASS.

- [ ] **Step 2: Clean app build**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -25`
Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Verify gateway requires no change**

Confirm (read-only) that `services/gateway/src/socketio/handlers/SocialEventsHandler.ts` `broadcastStoryCreated` / `broadcastStatusCreated` still route through `getVisibilityFilteredRecipients`. No edit, no commit — documentation of the verified invariant.
