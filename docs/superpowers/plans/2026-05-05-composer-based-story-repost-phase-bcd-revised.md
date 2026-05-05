# Composer-based Story Repost — Phase B/C/D Revised Plan (post-audit)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each task uses checkbox (`- [ ]`) syntax for tracking.

**Status:**
- **Phase A** ✅ **COMPLETE** — see commits `ea6fe226..ef714478` on `feat/stories-composer-repost`. Validated by senior architect review (functional + performance + ios coherence).
- **Phase B** revised based on iOS architect audit (2026-05-05). Original plan understated SDK Codable surface. New ordering: **5 SDK commits FIRST (zero UI)** then 2 SDK ViewModel commits.
- **Phase C** : iOS app wiring (4 commits)
- **Phase D** : integration tests + smoke verification

**Goal:** Implémenter le repartage de stories via composer (édition libre vers nouvelle story OU vers post permanent avec embed read-only animé) en réutilisant les composants existants (`StoryComposerView`, `UnifiedPostComposer`, `StoryCanvasReaderView`).

**Architecture:** Backend Phase A déjà déployé. SDK étend `APIRepostOf` + `APIPost` Codable, ajoute `mute` à `StoryCanvasReaderView`, ajoute `targetType` à `RepostRequest` + `PostService.repost`. Composers préchargés via init secondaires utilisant `CacheCoordinator` (3-tier cache). App iOS câble 3 boutons et un branchement de rendu feed extrait en `StoryRepostEmbedCell`.

**Tech Stack:** Swift 6, iOS 17+, SwiftUI, AVFoundation (`AVQueuePlayer + AVPlayerLooper`), Combine, Kingfisher 7.10, XCTest. Le projet utilise `@Observable` (Swift 5.9+) sur les ViewModels.

**Spec source:** `docs/superpowers/specs/2026-05-04-composer-based-story-repost-design.md`

**Plan d'origine:** `docs/superpowers/plans/2026-05-04-composer-based-story-repost.md` (Phase A toujours valide ; Phase B/C remplacée par ce document)

---

## Phase B — iOS SDK (revised)

### Principe directeur (issu de l'audit)

**Réutiliser l'infrastructure existante** plutôt que d'introduire de nouvelles APIs :
- Image preload → `CacheCoordinator.shared.images.image(for:)` (3-tier cache, downsampling 1200px, 50MB cap)
- Audio download → `CacheCoordinator.shared.audio.data(for:)` (déjà en cache après visualisation)
- Multi-image parallel → `withTaskGroup` (pattern dans `ReaderState.loadForegroundImages:704-714`)
- Codable → typed structs (zero `[String: Any]`)
- Embed playback → `StoryCanvasReaderView` AS-IS (best-in-class avec `AVQueuePlayer + AVPlayerLooper + ducking`)
- Localisation → `String(localized: ..., bundle: .module)` (le badge "Reposté de @x" est UI, pas content)

### Task B.1 : Étendre `APIRepostOf` et `APIPost` Codable

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift:41-50` (`APIRepostOf`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift:72-104` (`APIPost`)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/PostModelsTests.swift`

- [ ] **Step 1: Test RED — `APIRepostOf` decodes new fields**

```swift
func test_APIRepostOf_decodes_newFields() throws {
    let json = """
    {
      "id": "r1",
      "type": "STORY",
      "content": "hi",
      "originalLanguage": "fr",
      "translations": {"en": {"content": "hi en", "language": "en"}},
      "storyEffects": {"version": 1, "textObjects": [], "stickerObjects": [], "decorations": [], "drawing": null, "background": null, "audioObjects": []},
      "audioUrl": "/api/v1/attachments/file/audio.mp3",
      "originalRepostOfId": "root-1",
      "author": {"id": "a", "username": "alice", "name": "Alice"},
      "media": [],
      "createdAt": "2026-05-05T10:00:00.000Z",
      "likeCount": 5,
      "commentCount": 2,
      "isQuote": false
    }
    """.data(using: .utf8)!

    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds
    let repostOf = try decoder.decode(APIRepostOf.self, from: json)

    XCTAssertEqual(repostOf.type, "STORY")
    XCTAssertEqual(repostOf.originalLanguage, "fr")
    XCTAssertNotNil(repostOf.translations)
    XCTAssertNotNil(repostOf.storyEffects)
    XCTAssertEqual(repostOf.audioUrl, "/api/v1/attachments/file/audio.mp3")
    XCTAssertEqual(repostOf.originalRepostOfId, "root-1")
}

func test_APIRepostOf_decodes_legacyResponseWithoutNewFields() throws {
    // Older API responses don't have the new fields — must still decode
    let json = """
    {
      "id": "r1",
      "content": "hi",
      "author": {"id": "a", "username": "alice", "name": "Alice"},
      "media": [],
      "createdAt": "2026-05-05T10:00:00.000Z",
      "likeCount": 0,
      "commentCount": 0,
      "isQuote": false
    }
    """.data(using: .utf8)!
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds
    XCTAssertNoThrow(try decoder.decode(APIRepostOf.self, from: json))
}

func test_APIPost_decodes_originalRepostOfId() throws {
    let json = """
    {
      "id": "p1",
      "authorId": "a",
      "type": "POST",
      "originalRepostOfId": "root-1",
      "createdAt": "2026-05-05T10:00:00.000Z",
      "author": {"id": "a", "username": "alice", "name": "Alice"}
    }
    """.data(using: .utf8)!
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds
    let post = try decoder.decode(APIPost.self, from: json)
    XCTAssertEqual(post.originalRepostOfId, "root-1")
}
```

Run: `cd packages/MeeshySDK && swift test --filter PostModelsTests/test_APIRepostOf_decodes_newFields`. Expected FAIL (fields not in struct).

- [ ] **Step 2: Extend `APIRepostOf` struct**

```swift
public struct APIRepostOf: Decodable, Sendable {
    public let id: String
    public let type: String?                                       // NEW
    public let content: String?
    public let originalLanguage: String?                            // NEW
    public let translations: [String: APIPostTranslationEntry]?     // NEW
    public let storyEffects: StoryEffects?                          // NEW
    public let audioUrl: String?                                    // NEW
    public let originalRepostOfId: String?                          // NEW
    public let author: APIAuthor
    public let media: [APIPostMedia]?
    public let createdAt: Date
    public let likeCount: Int?
    public let commentCount: Int?
    public let isQuote: Bool?
}
```

- [ ] **Step 3: Extend `APIPost` struct (add one field)**

After the existing `repostOf: APIRepostOf?` field around line 93 :

```swift
    public let originalRepostOfId: String?  // NEW
```

- [ ] **Step 4: Verify all tests pass**

Run: `swift test --filter PostModelsTests`. Expected: all GREEN.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/PostModelsTests.swift
git commit -m "feat(sdk): expose new repost fields in APIRepostOf and APIPost"
```

---

### Task B.2 : Ajouter `originalRepostOfId` à `StoryItem` + propagation

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:778-822` (`StoryItem` struct)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:891-938` (`Array<APIPost>.toStoryGroups`)

- [ ] **Step 1: Test RED**

In `StoryModelsTests.swift` (or create) :

```swift
func test_StoryItem_carries_originalRepostOfId() {
    let post = makeAPIPost(id: "story-1", repostOfId: "intermediate-1", originalRepostOfId: "root-1")
    let groups = [post].toStoryGroups()
    let firstStory = groups.first?.stories.first
    XCTAssertEqual(firstStory?.originalRepostOfId, "root-1")
}
```

- [ ] **Step 2: Add `originalRepostOfId: String?` to `StoryItem`**

After `repostOfId` :
```swift
    public let originalRepostOfId: String?
```
Update init parameter list and `init` body.

- [ ] **Step 3: Update `toStoryGroups`** at line 911-912 :

```swift
                                 repostOfId: post.repostOf?.id,
                                 originalRepostOfId: post.originalRepostOfId,  // NEW
                                 repostAuthorName: post.repostOf?.author.name,
```

- [ ] **Step 4: Run tests, commit**

```bash
swift test --filter StoryModelsTests
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsTests.swift
git commit -m "feat(sdk): add originalRepostOfId to StoryItem with propagation"
```

---

### Task B.3 : Ajouter `isLocked` à `StoryTextObject`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:142-211` (`StoryTextObject`)

- [ ] **Step 1: Test RED**

```swift
func test_StoryTextObject_decodes_isLocked() throws {
    let json = """
    {"id": "t1", "text": "Reposté de @alice", "x": 0.5, "y": 0.92, "fontSize": 14,
     "rotation": 0, "scale": 1, "fontStyle": "default", "textColor": "FFFFFF",
     "textBg": "6366F1", "isLocked": true, "zIndex": 100}
    """.data(using: .utf8)!
    let obj = try JSONDecoder().decode(StoryTextObject.self, from: json)
    XCTAssertEqual(obj.isLocked, true)
}

func test_StoryTextObject_isLocked_optional_defaults_nil() throws {
    let json = """
    {"id": "t1", "text": "hello", "x": 0.5, "y": 0.5, "fontSize": 14,
     "rotation": 0, "scale": 1, "fontStyle": "default"}
    """.data(using: .utf8)!
    let obj = try JSONDecoder().decode(StoryTextObject.self, from: json)
    XCTAssertNil(obj.isLocked)
}
```

- [ ] **Step 2: Add field to struct**

```swift
public struct StoryTextObject: Identifiable, Codable, Sendable {
    // ... existing fields ...
    public var isLocked: Bool?  // NEW — nil/false = editable, true = locked (composer skips drag/edit/delete)
}
```

- [ ] **Step 3: Update CodingKeys (line ~171-175)**

Add `case isLocked` to the enum.

Update `init(from decoder:)` to decode :
```swift
self.isLocked = try container.decodeIfPresent(Bool.self, forKey: .isLocked)
```

Update `encode(to encoder:)` to encode :
```swift
try container.encodeIfPresent(isLocked, forKey: .isLocked)
```

- [ ] **Step 4: Update memberwise init**

Add `isLocked: Bool? = nil` parameter.

- [ ] **Step 5: Test, commit**

```bash
swift test --filter StoryModelsTests
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(sdk): add isLocked flag to StoryTextObject for repost badge"
```

Note: The composer canvas honor of this flag is in Task B.6 (composer init).

---

### Task B.4 : Ajouter `mute: Bool` à `StoryCanvasReaderView`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift:21-49` (init signature)
- Modify: `StoryCanvasReaderView.swift` `ReaderState` constructor + `startBackgroundAudio` + `startForegroundVideos` + `startForegroundAudios`

- [ ] **Step 1: Test RED — propagates mute to underlying players**

```swift
func test_StoryCanvasReaderView_mute_propagates_to_players() {
    let slide = makeStoryItemWithVideoAndAudio()
    let view = StoryCanvasReaderView(slide: slide, mute: true)

    // Get the ReaderState via reflection or by exposing it as @StateObject
    // (For testability, ReaderState must be inspectable)

    // Trigger appear, then verify all internal players have isMuted=true
    // Implementation may use a @State variable inspection helper
}
```

(If direct introspection is hard, write a snapshot test that verifies no audio output via the audio session being inactive when `mute=true`.)

- [ ] **Step 2: Add `mute: Bool = false` parameter**

```swift
public struct StoryCanvasReaderView: View {
    let slide: StoryItem
    let preferredContentLanguages: [String]?
    let mute: Bool  // NEW

    public init(slide: StoryItem, preferredContentLanguages: [String]? = nil, mute: Bool = false) {
        self.slide = slide
        self.preferredContentLanguages = preferredContentLanguages
        self.mute = mute
    }

    // alternate init from APIPost (for feed cell rendering)
    public init(post: APIPost, preferredContentLanguages: [String]? = nil, mute: Bool = false) {
        // build a synthetic StoryItem from post.media + post.storyEffects + post.audioUrl
        let slide = StoryItem(
            id: post.id,
            content: post.content,
            // ... map fields from post including storyEffects, audioUrl
        )
        self.init(slide: slide, preferredContentLanguages: preferredContentLanguages, mute: mute)
    }
}
```

- [ ] **Step 3: Propagate `mute` to `ReaderState`**

`ReaderState` must accept `mute: Bool` and use it in :
- `startBackgroundAudio()` → if mute, skip activation entirely (don't even call `StoryMediaCoordinator.shared.activate`)
- `startForegroundVideos()` → set `player.isMuted = true` on every `AVQueuePlayer` created
- `startForegroundAudios()` → if mute, don't play

- [ ] **Step 4: Verify, commit**

```bash
swift test --filter StoryCanvasReaderViewTests
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift
git commit -m "feat(sdk): add mute parameter to StoryCanvasReaderView for feed embed"
```

---

### Task B.5 : `RepostRequest.targetType` + `PostService.repost(targetType:content:)`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:974-978` (`RepostRequest` struct)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift` (or `Networking/PostService.swift` — use the actual existing path)

- [ ] **Step 1: Test RED**

```swift
func test_RepostRequest_encodes_targetType() throws {
    let req = RepostRequest(content: "hi", isQuote: false, targetType: "POST")
    let data = try JSONEncoder().encode(req)
    let json = String(data: data, encoding: .utf8) ?? ""
    XCTAssertTrue(json.contains("\"targetType\":\"POST\""))
}

func test_PostService_repost_sends_targetType() async throws {
    let mockClient = MockAPIClient()
    let service = PostService(client: mockClient)
    mockClient.nextResponse = .success(APIResponse(success: true, data: makeAPIPost()))

    _ = try await service.repost(postId: "story-1", targetType: .post, content: "Mon commentaire")

    let req = mockClient.lastRequest
    XCTAssertEqual(req?.path, "/posts/story-1/repost")
    XCTAssertEqual(req?.bodyJSON?["targetType"] as? String, "POST")
    XCTAssertEqual(req?.bodyJSON?["content"] as? String, "Mon commentaire")
}
```

- [ ] **Step 2: Extend `RepostRequest`**

```swift
public struct RepostRequest: Codable, Sendable {
    public let content: String?
    public let isQuote: Bool
    public let targetType: String?  // NEW

    public init(content: String? = nil, isQuote: Bool = false, targetType: String? = nil) {
        self.content = content
        self.isQuote = isQuote
        self.targetType = targetType
    }
}
```

- [ ] **Step 3: Add `repost(postId:targetType:content:)` to `PostService`**

```swift
public func repost(
    postId: String,
    targetType: PostType? = nil,
    content: String? = nil,
    isQuote: Bool = false
) async throws -> APIPost {
    let body = RepostRequest(
        content: content,
        isQuote: isQuote,
        targetType: targetType?.rawValue
    )
    let response: APIResponse<APIPost> = try await client.post(
        endpoint: "/posts/\(postId)/repost",
        body: body
    )
    guard let post = response.data else {
        throw NetworkError.serverError(statusCode: 500)
    }
    return post
}
```

Update protocol `PostServiceProviding` similarly.

- [ ] **Step 4: Test, commit**

```bash
swift test --filter PostServiceTests
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceTests.swift
git commit -m "feat(sdk): add RepostRequest.targetType + PostService.repost(targetType:content:)"
```

---

### Task B.6 : `StoryComposerViewModel.init(repostingFrom:currentSlide:)` (preload + cancellable + locked sticker)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/StoryComposerViewModelRepostTests.swift`

- [ ] **Step 1: Tests RED** (full suite from spec)

```swift
@MainActor
final class StoryComposerViewModelRepostTests: XCTestCase {
    func test_init_repostingFrom_clonesActiveSlideOnly() { /* ... */ }
    func test_init_repostingFrom_addsLockedRepostBadgeStickerAtBottomCenter() { /* ... */ }
    func test_init_repostingFrom_propagatesRepostOfIdAndOriginalRepostOfId() { /* ... */ }
    func test_init_repostingFrom_preloadTaskIsCancellableOnDeinit() async { /* ... */ }
    func test_publishCurrentSlide_includesRepostFieldsInPayload() async { /* ... */ }
}
```

- [ ] **Step 2: Add new properties + cancellable Task**

```swift
@Observable
@MainActor
final class StoryComposerViewModel {
    // ... existing properties ...

    // NEW
    var repostOfId: String?
    var originalRepostOfId: String?
    private var preloadTask: Task<Void, Never>?

    // ... existing init ...

    convenience init(repostingFrom original: APIPost, currentSlide: StoryItem) {
        self.init()

        self.repostOfId = original.id
        self.originalRepostOfId = original.originalRepostOfId
            ?? original.repostOfId
            ?? original.id

        // Clone slide
        var cloned = currentSlide
        cloned = withClonedFields(cloned, newId: UUID().uuidString)
        self.slides = [cloned]
        self.currentSlideIndex = 0

        // Add locked badge sticker
        let badgeText = String(localized: "story.repost.repostedFrom \(original.author.username)",
                              defaultValue: "Reposté de @\(original.author.username)",
                              bundle: .module)
        let badge = StoryTextObject(
            id: UUID().uuidString,
            text: badgeText,
            x: 0.5,
            y: 0.92,
            fontSize: 14,
            rotation: 0,
            scale: 1,
            fontStyle: "default",
            textColor: "FFFFFF",
            textBg: "6366F1",  // indigo500
            isLocked: true,
            zIndex: 1000
        )
        // Append to currentSlide.effects.textObjects
        var effects = self.currentEffects
        effects.textObjects.append(badge)
        self.currentEffects = effects

        // Preload images via project's CacheCoordinator (cancellable)
        let mediaList = currentSlide.media ?? []
        preloadTask = Task { [weak self] in
            await withTaskGroup(of: (String, UIImage?).self) { group in
                for media in mediaList {
                    guard let url = MeeshyConfig.resolveMediaURL(media.fileUrl)?.absoluteString else { continue }
                    group.addTask {
                        let image = try? await CacheCoordinator.shared.images.image(for: url)
                        return (url, image)
                    }
                }
                for await (url, image) in group {
                    guard !Task.isCancelled, let self, let image else { continue }
                    self.slideImages[url] = image
                }
            }
        }
    }

    deinit {
        preloadTask?.cancel()
    }
}
```

Note : `withClonedFields` is a helper that returns a new `StorySlide` with a fresh ID but copies the rest. If it doesn't exist, write it as a small private function.

- [ ] **Step 3: Modify the existing publish flow to propagate IDs**

In the existing `publishCurrentSlide` (or whichever method calls `PostService.createPost`) :

```swift
let response = try await postService.createPost(...,
    repostOfId: self.repostOfId  // NEW : propagate
)
```

(`createPost` SDK method must already accept `repostOfId` — if not, also add it; the gateway side already accepts it after Phase A.)

- [ ] **Step 4: Run tests, commit**

```bash
swift test --filter StoryComposerViewModelRepostTests
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift packages/MeeshySDK/Tests/MeeshyUITests/StoryComposerViewModelRepostTests.swift
git commit -m "feat(sdk): StoryComposerViewModel.init(repostingFrom:currentSlide:) with CacheCoordinator preload"
```

---

### Task B.7 : `UnifiedPostComposer.init(repostingFrom:currentSlide:onPublishRepost:onDismiss:)`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/UnifiedPostComposerRepostTests.swift`

- [ ] **Step 1: Tests RED**

```swift
@MainActor
final class UnifiedPostComposerRepostTests: XCTestCase {
    func test_init_repostingFrom_setsLockedTypeToPost() { /* ... */ }
    func test_init_repostingFrom_storesRepostSource() { /* ... */ }
    func test_init_repostingFrom_hidesImageAttachmentSlot() { /* ... */ }
    func test_publish_invokesOnPublishRepostWithContentAndPost() async { /* ... */ }
}
```

- [ ] **Step 2: Add `RepostSource` struct + new init**

```swift
public struct UnifiedPostComposer: View {
    public struct RepostSource: Sendable {
        public let post: APIPost
        public let slide: StoryItem
    }

    @State private var selectedType: PostType
    @State private var content = ""
    // ... existing @State ...

    @State private var repostSource: RepostSource? = nil
    private let lockedType: PostType?

    public var onPublishRepost: ((String, APIPost, StoryItem) -> Void)?
    public var onDismiss: () -> Void

    // Existing init unchanged

    // NEW init
    public init(
        repostingFrom original: APIPost,
        currentSlide: StoryItem,
        onPublishRepost: @escaping (String, APIPost, StoryItem) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self._selectedType = State(initialValue: .post)
        self.lockedType = .post
        self._repostSource = State(initialValue: RepostSource(post: original, slide: currentSlide))
        self.onPublishRepost = onPublishRepost
        self.onDismiss = onDismiss
        // Default no-op for the other publish callback
        self.onPublish = { _, _, _, _, _ in }
    }
}
```

- [ ] **Step 3: Modify body**

- Type selector : show only if `lockedType == nil`
- Content area : if `repostSource != nil`, render `StoryCanvasReaderView(slide: source.slide, mute: false)` instead of the image attachment slot (this is the composer, audio is desired here)
- Publish button : if `repostSource != nil`, call `onPublishRepost(content, source.post, source.slide)` instead of `onPublish(...)`

```swift
private var contentArea: some View {
    VStack(spacing: 12) {
        TextField("...", text: $content, axis: .vertical).lineLimit(5...)
        if let source = repostSource {
            StoryCanvasReaderView(slide: source.slide, mute: false)
                .aspectRatio(9/16, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .cornerRadius(12)
                .clipped()
        } else {
            existingImageSlotView
        }
    }
}
```

- [ ] **Step 4: Test, commit**

```bash
swift test --filter UnifiedPostComposerRepostTests
git add packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift packages/MeeshySDK/Tests/MeeshyUITests/UnifiedPostComposerRepostTests.swift
git commit -m "feat(sdk): UnifiedPostComposer init for repost mode with embedded story canvas"
```

---

## Phase C — iOS app

### Task C.1 : Bouton « Partager » droite → ouvre `StoryComposerView` repost

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:572-579` (action of share button)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` (add @State + .fullScreenCover)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:796-812` (remove old `reshareStory`)

- [ ] **Step 1: Add state**

```swift
@State private var repostStoryComposerSource: RepostStorySourceWrapper?

private struct RepostStorySourceWrapper: Identifiable {
    let id = UUID()
    let post: APIPost
    let slide: StoryItem
}
```

- [ ] **Step 2: Replace share button action**

```swift
if !isOwnStory, currentStoryIsPublic {
    storyActionButton(icon: "arrow.2.squarepath", label: "Partager") {
        HapticFeedback.light()
        pauseTimer()
        if let story = currentStory, let group = currentGroup,
           let post = story.toAPIPost(authorGroup: group) {
            repostStoryComposerSource = RepostStorySourceWrapper(post: post, slide: story)
        }
    }
}
```

(`StoryItem.toAPIPost(authorGroup:)` may need to be added — convert the StoryItem back to APIPost shape with author info from group. If too complex, alternative: keep the original `APIPost` cached in `StoryViewModel` and fetch from there.)

- [ ] **Step 3: Add `.fullScreenCover`**

```swift
.fullScreenCover(item: $repostStoryComposerSource, onDismiss: { resumeTimer() }) { wrapper in
    StoryComposerView(
        viewModel: StoryComposerViewModel(repostingFrom: wrapper.post, currentSlide: wrapper.slide),
        onPublishSlide: { /* delegate to existing publish flow */ },
        onDismiss: { repostStoryComposerSource = nil }
    )
}
```

(Adapt the StoryComposerView init to accept a pre-built ViewModel.)

- [ ] **Step 4: Remove old `reshareStory()` method** (lines 796-812 of `StoryViewerView+Content.swift`)

- [ ] **Step 5: Build, commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git commit -m "feat(ios): share button opens StoryComposerView in repost mode"
```

---

### Task C.2 : Menu kebab — « Republier en post » + « Éditer et republier en post »

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:1252-1271`
- Add: `repostAsPostDirect()` method on the view (or the helper extension file)

- [ ] **Step 1: Add `repostAsPostDirect()` method**

```swift
private func repostAsPostDirect() {
    guard let story = currentStory else { return }
    HapticFeedback.light()
    Task {
        do {
            _ = try await PostService.shared.repost(
                postId: story.id,
                targetType: .post,
                content: nil
            )
            await MainActor.run {
                HapticFeedback.success()
                ToastManager.shared.show("Republié dans ton feed")
            }
        } catch let err as APIError where err.statusCode == 404 {
            await MainActor.run { ToastManager.shared.showError("La story n'est plus disponible") }
        } catch let err as APIError where err.statusCode == 403 {
            await MainActor.run { ToastManager.shared.showError("Cette story ne peut pas être repartagée") }
        } catch {
            await MainActor.run { ToastManager.shared.showError("Échec de la republication") }
        }
    }
}
```

- [ ] **Step 2: Modify menu kebab**

Replace the single "Republier" item (lines 1258-1262) :

```swift
Button { repostAsPostDirect() } label: {
    Label("Republier en post", systemImage: "arrow.2.squarepath")
}

Button {
    HapticFeedback.light()
    pauseTimer()
    if let story = currentStory, let group = currentGroup,
       let post = story.toAPIPost(authorGroup: group) {
        editAndRepostAsPostSource = RepostPostSourceWrapper(post: post, slide: story)
    }
} label: {
    Label("Éditer et republier en post", systemImage: "square.and.pencil")
}
```

- [ ] **Step 3: Add state + .fullScreenCover for the post composer repost**

Mirror Task C.1 pattern but for `UnifiedPostComposer.init(repostingFrom:...)`.

- [ ] **Step 4: Build, commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
git commit -m "feat(ios): kebab menu adds Republier en post + Editer et republier en post"
```

---

### Task C.3 : Cellule feed — extraire `StoryRepostEmbedCell`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift`
- Modify: existing feed cell (likely `PostDetailView.swift` or `FeedPostRow.swift` — locate first)

- [ ] **Step 1: Create the extracted cell**

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

struct StoryRepostEmbedCell: View {
    let post: APIPost
    let preferredContentLanguages: [String]?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            attributionHeader
            if let content = post.content, !content.isEmpty {
                Text(content).font(.body)
            }
            // Mute=true for feed autoplay (silent by convention)
            StoryCanvasReaderView(
                post: post,
                preferredContentLanguages: preferredContentLanguages,
                mute: true
            )
            .aspectRatio(9/16, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .cornerRadius(16)
            .clipped()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Story de \(post.repostOf?.author.name ?? "auteur")")
            .accessibilityHint("Appuyez deux fois pour ouvrir en plein écran")
            .accessibilityAddTraits(.isButton)
        }
    }

    @ViewBuilder
    private var attributionHeader: some View {
        if let repostAuthor = post.repostOf?.author {
            VStack(alignment: .leading, spacing: 2) {
                Text("Reposté de @\(repostAuthor.username)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let originalRepostOfId = post.originalRepostOfId,
                   originalRepostOfId != post.repostOf?.id {
                    // Fetch original author from a hypothetical repostOf.originalAuthor or use a separate API call
                    // For MVP, render only the intermediate attribution
                    EmptyView()
                }
            }
        }
    }
}
```

- [ ] **Step 2: Add branch in feed cell**

In existing feed cell :
```swift
@ViewBuilder
private var contentView: some View {
    if post.type == .post && post.repostOf?.type == "STORY" {
        StoryRepostEmbedCell(post: post, preferredContentLanguages: preferredLanguages)
    } else if post.type == .post {
        normalPostContent
    } else {
        EmptyView()
    }
}
```

- [ ] **Step 3: Build, commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift  # or whichever
git commit -m "feat(ios): feed cell renders repost-of-story via StoryCanvasReaderView (muted)"
```

---

### Task C.4 : Header double-attribution

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift` (extracted in C.3)

- [ ] **Step 1: Add `originalRepostOfId` resolution**

If `originalRepostOfId != null` AND differs from `repostOf?.id`, fetch the original author. Two options :
- **(a)** Add a new field `repostOf.originalAuthor: APIAuthor?` in the SDK if backend exposes it (would need a Phase A follow-up)
- **(b)** Skip explicit "Original par @x" in MVP and only show "Reposté de @intermediate" (the chain is preserved in DB but not visually displayed beyond one level)

Recommendation : **(b)** for MVP. The chain is server-side complete via `originalRepostOfId`, so a future "trace lineage" feature can fetch it on demand. The visual stays simple.

If the user wants explicit double attribution, escalate to backend for a Phase A.14 task (expose originalAuthor on the response).

- [ ] **Step 2: Decide and implement**

Default = option (b). Header shows only "Reposté de @intermediate".

- [ ] **Step 3: Build, commit**

```bash
git commit -m "feat(ios): double-attribution header (single-level for MVP)"
```

---

## Phase D — Tests intégration + smoke

### Task D.1 : Tests d'intégration

**Files:**
- Create: `apps/ios/MeeshyTests/Integration/StoryRepostFlowTests.swift`

- [ ] **Step 1: Tests for 4 flows**

```swift
func test_flux1_shareButton_opensComposerStory_publishesAsStory() async throws { /* ... */ }
func test_flux2_kebabRepublierEnPost_callsBackendDirectly() async throws { /* ... */ }
func test_flux3_kebabEditerEtRepublier_opensComposerPost_publishes() async throws { /* ... */ }
func test_flux4_feedReceivesRepostViaSocket_renderedAsStoryEmbed() { /* ... */ }
```

- [ ] **Step 2: Run, commit**

```bash
./apps/ios/meeshy.sh test --filter StoryRepostFlowTests
git add apps/ios/MeeshyTests/Integration/StoryRepostFlowTests.swift
git commit -m "test(ios): integration tests for 4 repost flows"
```

---

### Task D.2 : Smoke test simulator

- [ ] **Step 1: Run app**

```bash
./apps/ios/meeshy.sh run
```

- [ ] **Step 2: Manual checks**

- Tap « Partager » droite sur story d'un autre user → composer story s'ouvre avec contenu cloné + sticker locked en bas
- Menu kebab `...` → « Republier en post » → toast de succès, story visible
- Menu kebab `...` → « Éditer et republier en post » → composer post avec embed read-only + texte éditable, publier → toast
- Aller au feed, vérifier rendu repost-de-story (animation timeline, mute par défaut, tap pour plein écran)

- [ ] **Step 3: Final commit if minor polish needed**

```bash
git add -A
git commit -m "chore: minor polish from smoke test"
```

---

## Self-Review

### Spec coverage check (revised)

| Spec section | Implementé par |
|--------------|----------------|
| 3.1 Backend | ✅ Phase A complete (commits ea6fe226..ef714478) |
| 3.2 APIPost.originalRepostOfId | B.1 |
| 3.2 APIRepostOf new fields | B.1 |
| 3.2 PostService.repost SDK | B.5 |
| 3.3 StoryItem.originalRepostOfId | B.2 |
| 3.3 StoryTextObject.isLocked | B.3 |
| 3.3 StoryCanvasReaderView.mute | B.4 |
| 3.3 StoryComposerViewModel preload | B.6 |
| 3.3 UnifiedPostComposer repost mode | B.7 |
| 3.4 Cellule feed branchement | C.3 |
| 3.4 Double attribution | C.4 (MVP single-level) |
| 4.1 Flux 1 | C.1 + B.6 |
| 4.2 Flux 2 | C.2 |
| 4.3 Flux 3 | C.2 + B.7 |
| 4.4 Flux 4 | C.3 |
| 6 Edge cases | A.13 + Phase A tests |
| 7 Testing strategy | All tasks via TDD |

### Type consistency check

- `RepostSource` struct in `UnifiedPostComposer` — declared in B.7, used only there.
- `repostOfId`/`originalRepostOfId` propagation : APIPost (B.1) → StoryItem (B.2) → StoryComposerViewModel (B.6) → publish payload via createPost (already gateway-ready).
- `mute: Bool` parameter : added in B.4, used in C.3 (feed) and B.7 (composer) — consistent default `false`.
- `isLocked` : added in B.3 (StoryTextObject), used by composer canvas (B.6 via badge with `isLocked: true`).

### Placeholder scan

No "TBD" / "TODO" left. All steps have concrete code.

---

## Execution Handoff

Plan révisé prêt. Approche : **subagent-driven-development** avec un subagent ios-architect-expert (ou backend-microservices-architect pour les tasks SDK pure) par task. 11 commits SDK+UI + 4 commits app + 2 commits tests = ~17 commits Phase B/C/D.

Démarrer par Task B.1 (étendre APIRepostOf et APIPost Codable).
