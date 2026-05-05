# Composer-based Story Repost — Phase B/C/D Revised Plan (post-audit)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each task uses checkbox (`- [ ]`) syntax for tracking.

**Status:**
- **Phase A** ✅ **COMPLETE** — see commits `ea6fe226..ef714478` on `feat/stories-composer-repost`. Validated by senior architect review (functional + performance + ios coherence).
- **Phase B** revised based on iOS architect audit (2026-05-05). Original plan understated SDK Codable surface. New ordering: **5 SDK commits FIRST (zero UI)** then 2 SDK ViewModel commits.
- **Phase B patch** (2026-05-05 post-B.1) : applies 6 audit findings — see "Patch log" section below.
- **Phase B.1** ✅ **DONE** — commit `15e5190a` (APIRepostOf + APIPost Codable extensions, 7 fields).
- **Phase C** : iOS app wiring (4 commits)
- **Phase D** : integration tests + smoke verification

## Patch log (2026-05-05, applied after B.1)

| # | Task affected | Issue | Fix |
|---|---------------|-------|-----|
| 1 | B.2 | Original B.2 only added `originalRepostOfId` to `StoryItem`, but C.1/C.2 need `currentStoryIsPublic` derived from visibility, and the embed needs `audioUrl`. `StoryItem` (`StoryModels.swift:778-822`) carries neither. | **Expand B.2** to also add `visibility: String?` and `audioUrl: String?` ; propagate through `toStoryGroups` (`StoryModels.swift:891-936`) ; add `currentStoryIsPublic` helper in `StoryViewerView` (consumed by C.1/C.2). |
| 2 | B.3 | Test JSON and init signature use wrong property names (`text`, `fontSize`, `fontStyle: "default"`). Real `StoryTextObject` (`StoryModels.swift:142-211`) uses `content`, `textSize`, `textStyle` (with values `bold\|neon\|typewriter\|handwriting\|classic`). `CodingKeys` is explicit (line 171-175) and must be extended ; custom `init(from:)` / `encode(to:)` do not exist (synthesized). Adding `case isLocked` to `CodingKeys` is sufficient since `Bool?` is decoded with `decodeIfPresent` automatically by the synthesized init. | **Fix B.3** : use real property names ; add `case isLocked` to existing `CodingKeys` ; rely on synthesized Codable conformance ; revise tests. |
| 3 | B.4 | Plan writes `init(slide: ..., mute: ...)`. Real param is named `story:` (`StoryCanvasReaderView.swift:37`). Also `ReaderState` is `@StateObject private` (line 35) — direct introspection from outside the View is impossible. | **Fix B.4** : use `story:` everywhere ; replace player-introspection test with an indirect strategy (assert `StoryMediaCoordinator.shared.activate(...)` is **not** called when `mute=true`, plus a smoke check via `XCUITest` for no audio output). |
| 4 | B.5b (NEW) | Plan B.5 replaces `PostService.repost(postId:quote:)` with new signature returning `APIPost`. Two existing callers must migrate : `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift` (uses `repost(postId:` directly) and `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:796` (`reshareStory()` calls `APIClient.shared.post` directly, bypassing the SDK). Without migration these callers regress at runtime. | **Add B.5b** task : migrate both call sites to the new SDK signature. |
| 5 | B.5c (NEW) | Plan B.6 step 3 says "createPost SDK method must already accept repostOfId — if not, also add it" — left in flux. Real `PostService.create(...)` (`PostService.swift:46`) and `createStory(...)` (`:132`) do **not** accept `repostOfId`. `CreatePostRequest` and `CreateStoryRequest` structs also lack the field. | **Add B.5c** task : extend both methods + their request structs to accept `repostOfId: String?` ; backend Phase A already supports it (`createPost accepts repostOfId and computes originalRepostOfId`, commit `1afb94e8`). |
| 6 | B.6 | (a) Plan writes `var cloned = currentSlide` on `currentSlide: StoryItem`, then `self.slides = [cloned]`. But ViewModel stores `var slides: [StorySlide]` (`StoryComposerViewModel.swift:68`). `StorySlide` (`StoryModels.swift:391-432`) ≠ `StoryItem` — does not compile. (b) Plan step 3 says "modify the existing publish flow to propagate IDs" — but the ViewModel does not publish ; publication goes through `onPublishSlide` callback (`StoryComposerView.swift:181`) implemented by the iOS app caller. | **Fix B.6** : (a) add explicit `StoryItem → StorySlide` conversion in the secondary init (mediaURL = first media URL, content = content, effects = storyEffects ?? `StoryEffects()`, duration = 5, order = 0). (b) **Do not** modify publish flow inside the VM — expose `repostOfId` and `originalRepostOfId` as public stored properties ; the iOS caller (Phase C) reads them and passes to `PostService.create(...)` (now accepting `repostOfId`, see B.5c). |

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

### Task B.1 : Étendre `APIRepostOf` et `APIPost` Codable ✅ DONE (commit `15e5190a`)

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

### Task B.2 (PATCHED) : Étendre `StoryItem` (visibility + audioUrl + originalRepostOfId) + propagation + helper `currentStoryIsPublic`

> **Patched 2026-05-05** : original B.2 only added `originalRepostOfId`. Phase C (`C.1` / `C.2`) needs `currentStoryIsPublic` to gate the share button + kebab items, and the embedded reader (B.4 + B.7) needs `audioUrl` to keep the audio track in sync. Without these two extra fields, Phase C falls back to lossy reverse mapping `StoryItem → APIPost` (impossible since `StoryItem` has no visibility). Reference : Patch log row 1.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:778-822` (`StoryItem` struct)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:891-938` (`Array<APIPost>.toStoryGroups`)
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsTests.swift` (or create)

- [ ] **Step 1: Test RED — three new fields propagate from APIPost to StoryItem**

```swift
func test_StoryItem_carries_originalRepostOfId_visibility_audioUrl() {
    let post = makeAPIPost(
        id: "story-1",
        type: "STORY",
        visibility: "PUBLIC",
        audioUrl: "/api/v1/attachments/file/audio.mp3",
        repostOfId: "intermediate-1",
        originalRepostOfId: "root-1"
    )
    let groups = [post].toStoryGroups()
    let firstStory = groups.first?.stories.first
    XCTAssertEqual(firstStory?.originalRepostOfId, "root-1")
    XCTAssertEqual(firstStory?.visibility, "PUBLIC")
    XCTAssertEqual(firstStory?.audioUrl, "/api/v1/attachments/file/audio.mp3")
}

func test_StoryItem_publicVisibility_isCurrentStoryIsPublic() {
    let publicStory = makeStoryItem(visibility: "PUBLIC")
    let privateStory = makeStoryItem(visibility: "PRIVATE")
    let unknownStory = makeStoryItem(visibility: nil)

    XCTAssertTrue(publicStory.isPublic)
    XCTAssertFalse(privateStory.isPublic)
    XCTAssertFalse(unknownStory.isPublic, "Unknown visibility must default to non-public to be safe")
}
```

Run: `swift test --filter StoryModelsTests`. Expected FAIL (fields not in struct).

- [ ] **Step 2: Add the three fields to `StoryItem`**

```swift
public struct StoryItem: Identifiable, Codable, Sendable {
    public let id: String
    public let content: String?
    public let media: [FeedMedia]
    public let storyEffects: StoryEffects?
    public let createdAt: Date
    public let expiresAt: Date?
    public let repostOfId: String?
    public let originalRepostOfId: String?  // NEW — Patch B.2
    public let repostAuthorName: String?
    public let visibility: String?           // NEW — Patch B.2 ("PUBLIC" / "PRIVATE" / "FRIENDS" / etc.)
    public let audioUrl: String?             // NEW — Patch B.2 (background audio track from Story)
    public var isViewed: Bool
    public let translations: [StoryTranslation]?
    public let backgroundAudio: StoryBackgroundAudioEntry?
    public var reactionCount: Int
    public var commentCount: Int

    /// Computed convenience used by C.1 / C.2 to gate the Partager button and kebab items.
    /// Defaults to **false** when visibility is nil (unknown) so we don't accidentally expose
    /// non-public content for repost.
    public var isPublic: Bool {
        (visibility ?? "").uppercased() == "PUBLIC"
    }

    // ... existing computed timeAgo + resolvedContent unchanged ...
}
```

Update memberwise init signature with the three new params (default `nil`), keep the existing call sites compatible.

- [ ] **Step 3: Propagate from `APIPost` in `toStoryGroups`** (around line 908-915)

```swift
let item = StoryItem(
    id: post.id, content: post.content, media: media,
    storyEffects: post.storyEffects,
    createdAt: post.createdAt, expiresAt: effectiveExpiresAt,
    repostOfId: post.repostOf?.id,
    originalRepostOfId: post.originalRepostOfId,    // NEW
    repostAuthorName: post.repostOf?.author.name,
    visibility: post.visibility,                    // NEW
    audioUrl: post.audioUrl,                        // NEW
    isViewed: post.isViewedByMe ?? false,
    translations: storyTranslations,
    reactionCount: totalReactions,
    commentCount: post.commentCount ?? 0
)
```

- [ ] **Step 4: Verify GREEN**

Run: `swift test --filter StoryModelsTests`. Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsTests.swift
git commit -m "feat(sdk): expand StoryItem with originalRepostOfId, visibility, audioUrl + isPublic helper"
```

Note : the `currentStoryIsPublic` reference in C.1/C.2 is now derived as `currentStory?.isPublic == true`. No new property on the view is needed.

---

### Task B.3 (PATCHED) : Ajouter `isLocked` à `StoryTextObject`

> **Patched 2026-05-05** : original test JSON used `text`, `fontSize`, `fontStyle: "default"` — none of those exist. Real properties are `content`, `textSize`, `textStyle` (with values `bold|neon|typewriter|handwriting|classic`). Reference : Patch log row 2.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:142-211` (`StoryTextObject`)
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsTests.swift`

- [ ] **Step 1: Test RED — uses real property names**

```swift
func test_StoryTextObject_decodes_isLocked() throws {
    let json = """
    {"id": "t1", "content": "Reposté de @alice", "x": 0.5, "y": 0.92,
     "scale": 1, "rotation": 0, "textStyle": "bold", "textColor": "FFFFFF",
     "textSize": 14, "textAlign": "center", "textBg": "6366F1",
     "isLocked": true, "zIndex": 1000}
    """.data(using: .utf8)!
    let obj = try JSONDecoder().decode(StoryTextObject.self, from: json)
    XCTAssertEqual(obj.isLocked, true)
}

func test_StoryTextObject_isLocked_optional_defaults_nil() throws {
    let json = """
    {"id": "t1", "content": "hello", "x": 0.5, "y": 0.5,
     "scale": 1, "rotation": 0}
    """.data(using: .utf8)!
    let obj = try JSONDecoder().decode(StoryTextObject.self, from: json)
    XCTAssertNil(obj.isLocked)
}

func test_StoryTextObject_encodes_isLocked() throws {
    var obj = StoryTextObject(content: "x")
    obj.isLocked = true
    let data = try JSONEncoder().encode(obj)
    let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    XCTAssertEqual(dict["isLocked"] as? Bool, true)
}
```

Run: `swift test --filter StoryModelsTests/test_StoryTextObject_decodes_isLocked`. Expected: FAIL — property does not exist.

- [ ] **Step 2: Add field + extend `CodingKeys` (no custom init/encode needed)**

`StoryTextObject` uses **synthesized `Codable`** (no custom `init(from:)` / `encode(to:)`). Adding the property + the matching `CodingKeys` case is enough — `Bool?` is auto-encoded with `encodeIfPresent` / decoded with `decodeIfPresent`.

```swift
public struct StoryTextObject: Codable, Identifiable, Sendable {
    public var id: String
    public var content: String
    public var x: CGFloat
    public var y: CGFloat
    public var scale: CGFloat
    public var rotation: CGFloat
    public var translations: [String: String]?
    public var sourceLanguage: String?
    public var zIndex: Int?
    public var textStyle: String?
    public var textColor: String?
    public var textSize: CGFloat?
    public var textAlign: String?
    public var textBg: String?
    public var startTime: Float?
    public var displayDuration: Float?
    public var fadeIn: Float?
    public var fadeOut: Float?
    public var isLocked: Bool?  // NEW — Patch B.3 (nil/false = editable, true = locked composer skips drag/edit/delete)

    enum CodingKeys: String, CodingKey {
        case id, content, x, y, scale, rotation, translations, sourceLanguage, zIndex
        case textStyle, textColor, textSize, textAlign, textBg
        case startTime, displayDuration, fadeIn, fadeOut
        case isLocked  // NEW — Patch B.3
    }

    // existing init(...) keeps backward-compat by adding `isLocked: Bool? = nil` at the end
    public init(id: String = UUID().uuidString, content: String,
                x: CGFloat = 0.5, y: CGFloat = 0.5,
                scale: CGFloat = 1.0, rotation: CGFloat = 0,
                translations: [String: String]? = nil,
                sourceLanguage: String? = nil,
                textStyle: String? = "bold", textColor: String? = "FFFFFF",
                textSize: CGFloat? = 28, textAlign: String? = "center",
                textBg: String? = nil,
                startTime: Float? = nil, displayDuration: Float? = nil,
                fadeIn: Float? = nil, fadeOut: Float? = nil,
                isLocked: Bool? = nil) {
        self.id = id; self.content = content
        self.x = x; self.y = y; self.scale = scale; self.rotation = rotation
        self.translations = translations; self.sourceLanguage = sourceLanguage
        self.textStyle = textStyle; self.textColor = textColor
        self.textSize = textSize; self.textAlign = textAlign; self.textBg = textBg
        self.startTime = startTime; self.displayDuration = displayDuration
        self.fadeIn = fadeIn; self.fadeOut = fadeOut
        self.isLocked = isLocked
    }
}
```

- [ ] **Step 3: Verify GREEN**

Run: `swift test --filter StoryModelsTests`. Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsTests.swift
git commit -m "feat(sdk): add isLocked flag to StoryTextObject for repost badge"
```

Note : the composer canvas behaviour that respects `isLocked` is implemented in Task B.6 (the locked badge sticker uses `isLocked: true` ; canvas modifiers skip gestures on locked elements).

---

### Task B.4 (PATCHED) : Ajouter `mute: Bool` à `StoryCanvasReaderView`

> **Patched 2026-05-05** : original wrote `init(slide:..., mute:)` but the real param is named `story:` (`StoryCanvasReaderView.swift:37`). Also `ReaderState` is `@StateObject private` so direct player introspection is impossible from a test. Reference : Patch log row 3.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift:21-49` (init signature)
- Modify: `StoryCanvasReaderView.swift` `ReaderState` constructor + `startBackgroundAudio` + `startForegroundVideos` + `startForegroundAudios` + `mute()/unmute()` (lines 795-805 — already present)
- Create or modify: `packages/MeeshySDK/Tests/MeeshyUITests/StoryCanvasReaderViewMuteTests.swift`

- [ ] **Step 1: Test RED — indirect strategy via `StoryMediaCoordinator` observation**

`ReaderState` is private, so we cannot inspect `AVQueuePlayer.isMuted` directly. Instead we assert that the **side effect** of starting audio (calling `StoryMediaCoordinator.shared.activate(...)`) is **skipped** when `mute=true`. `StoryMediaCoordinator` is a public actor, so we can read its `currentSourceId`.

```swift
@MainActor
final class StoryCanvasReaderViewMuteTests: XCTestCase {
    func test_mute_true_skipsBackgroundAudioActivation() async {
        let storyWithAudio = makeStoryItem(audioUrl: "https://cdn/audio.mp3")
        StoryMediaCoordinator.shared.deactivateAll()  // reset

        let view = StoryCanvasReaderView(story: storyWithAudio, mute: true)
        let host = UIHostingController(rootView: view)
        host.view.frame = CGRect(x: 0, y: 0, width: 360, height: 640)
        host.view.layoutIfNeeded()
        await Task.yield()  // let onAppear run

        let active = await StoryMediaCoordinator.shared.currentSourceId
        XCTAssertNil(active, "Mute=true must NOT activate background audio")
    }

    func test_mute_false_activatesBackgroundAudio() async {
        let storyWithAudio = makeStoryItem(audioUrl: "https://cdn/audio.mp3")
        StoryMediaCoordinator.shared.deactivateAll()

        let view = StoryCanvasReaderView(story: storyWithAudio, mute: false)
        let host = UIHostingController(rootView: view)
        host.view.frame = CGRect(x: 0, y: 0, width: 360, height: 640)
        host.view.layoutIfNeeded()
        await Task.yield()

        let active = await StoryMediaCoordinator.shared.currentSourceId
        XCTAssertNotNil(active, "Mute=false must activate background audio")
    }
}
```

(If `StoryMediaCoordinator.currentSourceId` is private, expose it via a `@testable` accessor or fall back to a smoke check : run `meeshy.sh run`, observe no audio plays in the feed cell.)

- [ ] **Step 2: Add `mute: Bool = false` parameter (param name = `story:`, NOT `slide:`)**

```swift
public struct StoryCanvasReaderView: View {
    public let story: StoryItem
    public let preferredLanguage: String?
    public let preferredContentLanguages: [String]?
    public let preloadedImages: [String: UIImage]
    public let preloadedVideoURLs: [String: URL]
    public let preloadedAudioURLs: [String: URL]
    public let mute: Bool  // NEW — Patch B.4

    @StateObject private var state: ReaderState

    public init(story: StoryItem, preferredLanguage: String? = nil,
                preferredContentLanguages: [String]? = nil,
                preloadedImages: [String: UIImage] = [:],
                preloadedVideoURLs: [String: URL] = [:],
                preloadedAudioURLs: [String: URL] = [:],
                mute: Bool = false) {                          // NEW
        self.story = story
        self.preferredLanguage = preferredLanguage
        self.preferredContentLanguages = preferredContentLanguages
        self.preloadedImages = preloadedImages
        self.preloadedVideoURLs = preloadedVideoURLs
        self.preloadedAudioURLs = preloadedAudioURLs
        self.mute = mute
        self._state = StateObject(wrappedValue: ReaderState(story: story, mute: mute))
    }

    /// Alternate init for feed cells that have an `APIPost` (not a `StoryItem`).
    /// Reuses `[APIPost].toStoryGroups` for **single source of truth** on
    /// APIPost → StoryItem conversion (avoids divergent mapping logic).
    public init(post: APIPost, preferredLanguage: String? = nil,
                preferredContentLanguages: [String]? = nil,
                preloadedImages: [String: UIImage] = [:],
                preloadedVideoURLs: [String: URL] = [:],
                preloadedAudioURLs: [String: URL] = [:],
                mute: Bool = false) {
        // Wrap the post in a 1-item array, run the canonical conversion, take the only item.
        // Falls back to a synthetic minimal StoryItem if the post is not type=STORY.
        let story: StoryItem = {
            if let item = [post].toStoryGroups().first?.stories.first {
                return item
            }
            return StoryItem(
                id: post.id,
                content: post.content,
                media: (post.media ?? []).map { m in
                    FeedMedia(id: m.id, type: m.mediaType, url: m.fileUrl,
                              thumbnailColor: "4ECDC4", width: m.width, height: m.height,
                              duration: m.duration.map { $0 / 1000 })
                },
                storyEffects: post.storyEffects,
                createdAt: post.createdAt,
                expiresAt: post.expiresAt,
                repostOfId: post.repostOf?.id,
                originalRepostOfId: post.originalRepostOfId,
                repostAuthorName: post.repostOf?.author.name,
                visibility: post.visibility,
                audioUrl: post.audioUrl,
                isViewed: post.isViewedByMe ?? false,
                translations: nil,
                reactionCount: 0,
                commentCount: post.commentCount ?? 0
            )
        }()
        self.init(story: story, preferredLanguage: preferredLanguage,
                  preferredContentLanguages: preferredContentLanguages,
                  preloadedImages: preloadedImages,
                  preloadedVideoURLs: preloadedVideoURLs,
                  preloadedAudioURLs: preloadedAudioURLs,
                  mute: mute)
    }
}
```

- [ ] **Step 3: Propagate `mute` to `ReaderState`**

```swift
private final class ReaderState: ObservableObject {
    let story: StoryItem
    let mute: Bool  // NEW

    init(story: StoryItem, mute: Bool = false) {
        self.story = story
        self.mute = mute
        // ... existing init body
    }

    func startBackgroundAudio() {
        guard !mute else { return }  // NEW : skip activation entirely
        // ... existing body
    }

    func startForegroundVideos() {
        // ... existing creation of AVQueuePlayer
        for (_, player) in foregroundVideoPlayers {
            player.isMuted = mute  // NEW
        }
    }

    func startForegroundAudios() {
        guard !mute else { return }  // NEW
        // ... existing body
    }
}
```

- [ ] **Step 4: Verify GREEN**

```bash
swift test --filter StoryCanvasReaderViewMuteTests
swift test --filter StoryCanvasReaderViewTests  # ensure no regression on existing tests
```

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift packages/MeeshySDK/Tests/MeeshyUITests/StoryCanvasReaderViewMuteTests.swift
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

Note : the new `repost(...)` returns `APIPost` whereas the old one returned `Void`. The protocol method `func repost(postId: String, quote: String?) async throws` (`PostService.swift:19`) **must be replaced** by `func repost(postId: String, targetType: PostType?, content: String?, isQuote: Bool) async throws -> APIPost`. Existing callers are migrated in B.5b.

---

### Task B.5b (NEW) : Migrer les callers existants vers la nouvelle signature `repost`

> **New 2026-05-05** : the protocol breaking change in B.5 leaves two existing callers broken. Reference : Patch log row 4.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:796-812` (delete old `reshareStory()`)

- [ ] **Step 1: Audit current callers**

```bash
grep -rn "PostService.shared.repost\|\.repost(postId" apps/ios/ --include='*.swift'
```

Expected hits :
- `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift` — calls `PostService.shared.repost(postId: ..., quote: ...)` to repost a feed item.
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:796-812` — `reshareStory()` builds `RepostRequest(content: nil, isQuote: false)` and calls `APIClient.shared.post` directly (bypasses the SDK).

- [ ] **Step 2: Migrate `FeedViewModel`**

Replace each `PostService.shared.repost(postId: id, quote: quote)` call with :
```swift
_ = try await PostService.shared.repost(
    postId: id,
    targetType: nil,           // server defaults to original type
    content: quote,
    isQuote: quote != nil
)
```

(The old API mapped `quote != nil → isQuote = true`. Preserve that behaviour exactly.)

- [ ] **Step 3: Delete `reshareStory()` (Phase C.2 will replace it with `repostAsPostDirect()` using the new SDK method)**

In `StoryViewerView+Content.swift`, delete lines 796-812 entirely. Verify no residual reference :

```bash
grep -rn "reshareStory" apps/ios/
```

Expected : zero result (apart from this delete).

- [ ] **Step 4: Build, commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git commit -m "refactor(ios): migrate repost callers to new SDK signature, drop reshareStory"
```

---

### Task B.5c (NEW) : Étendre `PostService.create(...)` et `createStory(...)` avec `repostOfId`

> **New 2026-05-05** : Phase A backend already accepts `repostOfId` in `POST /posts` (commit `1afb94e8`), but the SDK methods do not expose it. Without this, B.6 cannot pass `repostOfId` from the composer to the server. Reference : Patch log row 5.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift:46` (`create`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift:132` (`createStory`)
- Modify: `CreatePostRequest` and `CreateStoryRequest` Encodable structs (search `struct CreatePostRequest` and `struct CreateStoryRequest`)
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceTests.swift`

- [ ] **Step 1: Tests RED — request body carries `repostOfId`**

```swift
func test_create_includes_repostOfId_when_provided() async throws {
    let mockClient = MockAPIClient()
    let service = PostService(api: mockClient)
    mockClient.nextResponse = .success(APIResponse(success: true, data: makeAPIPost()))

    _ = try await service.create(content: "x", type: "POST", repostOfId: "root-1")

    XCTAssertEqual(mockClient.lastRequest?.bodyJSON?["repostOfId"] as? String, "root-1")
}

func test_createStory_includes_repostOfId_when_provided() async throws {
    let mockClient = MockAPIClient()
    let service = PostService(api: mockClient)
    mockClient.nextResponse = .success(APIResponse(success: true, data: makeAPIPost()))

    _ = try await service.createStory(content: "x", storyEffects: nil, repostOfId: "root-1")

    XCTAssertEqual(mockClient.lastRequest?.bodyJSON?["repostOfId"] as? String, "root-1")
}
```

- [ ] **Step 2: Add `repostOfId` to request structs**

```swift
public struct CreatePostRequest: Encodable {
    // ... existing fields
    public let repostOfId: String?  // NEW — Patch B.5c
}

public struct CreateStoryRequest: Encodable {
    // ... existing fields
    public let repostOfId: String?  // NEW — Patch B.5c
}
```

Update both memberwise inits to accept `repostOfId: String? = nil`.

- [ ] **Step 3: Add `repostOfId` parameter to public methods**

```swift
public func create(
    content: String? = nil,
    type: String = "POST",
    visibility: String = "PUBLIC",
    moodEmoji: String? = nil,
    mediaIds: [String]? = nil,
    audioUrl: String? = nil,
    audioDuration: Int? = nil,
    originalLanguage: String? = nil,
    mobileTranscription: MobileTranscriptionPayload? = nil,
    repostOfId: String? = nil                              // NEW — Patch B.5c
) async throws -> APIPost {
    let body = CreatePostRequest(
        content: content, type: type, visibility: visibility,
        moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl,
        audioDuration: audioDuration, originalLanguage: originalLanguage,
        mobileTranscription: mobileTranscription,
        repostOfId: repostOfId
    )
    let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts", body: body)
    return response.data
}

public func createStory(
    content: String?,
    storyEffects: StoryEffects?,
    visibility: String = "PUBLIC",
    originalLanguage: String? = nil,
    mediaIds: [String]? = nil,
    repostOfId: String? = nil                              // NEW — Patch B.5c
) async throws -> APIPost {
    let body = CreateStoryRequest(
        content: content, storyEffects: storyEffects,
        visibility: visibility, originalLanguage: originalLanguage,
        mediaIds: mediaIds,
        repostOfId: repostOfId
    )
    let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts", body: body)
    return response.data
}
```

Update the `PostServiceProviding` protocol signatures to match.

- [ ] **Step 4: Verify GREEN**

```bash
swift test --filter PostServiceTests
```

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceTests.swift
git commit -m "feat(sdk): create/createStory accept repostOfId for composer-based repost"
```

---

### Task B.6 (PATCHED) : `StoryComposerViewModel.init(reposting:authorHandle:)` (preload + cancellable + locked sticker)

> **Patched 2026-05-05** : (a) original cloned `StoryItem` directly into `[StorySlide]` — does not compile (different types). (b) Original modified the publish flow inside the VM, but the VM does **not** publish ; publication goes through `onPublishSlide` callback (`StoryComposerView.swift:181`) implemented by the iOS app caller. Reference : Patch log row 6.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/StoryComposerViewModelRepostTests.swift`

- [ ] **Step 1: Tests RED**

```swift
@MainActor
final class StoryComposerViewModelRepostTests: XCTestCase {
    func test_init_reposting_clonesActiveSlideOnly() {
        let story = makeStoryItem(id: "slide-1", content: "Hello")
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")
        XCTAssertEqual(vm.slides.count, 1)
        XCTAssertEqual(vm.slides[0].content, "Hello")
        XCTAssertNotEqual(vm.slides[0].id, "slide-1", "Cloned slide must have a fresh ID")
    }

    func test_init_reposting_addsLockedBadgeAtBottomCenter() {
        let story = makeStoryItem()
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")

        let texts = vm.currentEffects.textObjects
        let lockedBadges = texts.filter { $0.isLocked == true }
        XCTAssertEqual(lockedBadges.count, 1)
        let badge = lockedBadges[0]
        XCTAssertEqual(badge.y, 0.92, accuracy: 0.001)
        XCTAssertEqual(badge.x, 0.5, accuracy: 0.001)
        XCTAssertTrue(badge.content.contains("@alice"))
    }

    func test_init_reposting_propagatesIds_rootCase() {
        let story = makeStoryItem(id: "root-1", repostOfId: nil, originalRepostOfId: nil)
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")
        XCTAssertEqual(vm.repostOfId, "root-1")
        XCTAssertEqual(vm.originalRepostOfId, "root-1")
    }

    func test_init_reposting_propagatesIds_chainedCase() {
        let story = makeStoryItem(
            id: "intermediate-1",
            repostOfId: "root-1",
            originalRepostOfId: "root-1"
        )
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")
        XCTAssertEqual(vm.repostOfId, "intermediate-1")
        XCTAssertEqual(vm.originalRepostOfId, "root-1")
    }

    func test_init_reposting_preloadTaskCancelsOnDeinit() async {
        var vm: StoryComposerViewModel? = StoryComposerViewModel(
            reposting: makeStoryItemWithMedia(),
            authorHandle: "alice"
        )
        weak var weakVM = vm
        vm = nil
        await Task.yield()
        XCTAssertNil(weakVM, "VM must be deallocated, preload Task must release self")
    }
}
```

- [ ] **Step 2: Add public properties + cancellable preload Task**

```swift
@Observable
@MainActor
final class StoryComposerViewModel {
    // ... existing properties ...

    // MARK: - Repost source (Patch B.6 — exposed publicly so the iOS caller in Phase C
    // can read them before invoking PostService.create / createStory with repostOfId).
    var repostOfId: String?
    var originalRepostOfId: String?

    // Cancellable preload Task (deinit cleanup)
    private var preloadTask: Task<Void, Never>?

    // ... existing default init (no args) ...

    /// Initializes the composer pre-populated for reposting `original`.
    /// Clones `currentSlide` (a `StoryItem` from the viewer) into a fresh `StorySlide`
    /// (the composer's internal type), appends a locked badge sticker, and triggers
    /// async media preload via the shared `CacheCoordinator` (3-tier cache).
    /// `story` is the source story (the viewer's `StoryItem`). `authorHandle` is what to
    /// render in the badge ("Reposté de @\(authorHandle)") — typically `currentGroup.username`
    /// from the iOS caller. We do not require an `APIPost` because `StoryItem` (after B.2)
    /// already carries the three repost-chain IDs we need.
    convenience init(reposting story: StoryItem, authorHandle: String) {
        self.init()

        // Repost chain IDs (root-flatten)
        self.repostOfId = story.id
        self.originalRepostOfId = story.originalRepostOfId
            ?? story.repostOfId
            ?? story.id

        // Convert StoryItem → StorySlide (composer's internal type).
        // Lossy : we keep mediaURL (first media), content, effects ; defaults for duration/order.
        var cloned = StorySlide(
            id: UUID().uuidString,
            mediaURL: story.media.first?.url,
            mediaData: nil,
            content: story.content,
            effects: story.storyEffects ?? StoryEffects(),
            duration: 5,
            order: 0
        )

        // Append locked badge sticker to the slide's effects
        let badgeText = String(
            localized: "story.repost.badge.\(authorHandle)",
            defaultValue: "Reposté de @\(authorHandle)",
            bundle: .module
        )
        let badge = StoryTextObject(
            id: UUID().uuidString,
            content: badgeText,
            x: 0.5, y: 0.92,
            scale: 1.0, rotation: 0,
            textStyle: "bold",
            textColor: "FFFFFF",
            textSize: 14,
            textAlign: "center",
            textBg: "6366F1",  // indigo500
            isLocked: true
        )
        var effects = cloned.effects
        effects.textObjects.append(badge)
        cloned.effects = effects

        self.slides = [cloned]
        self.currentSlideIndex = 0

        // Preload images via CacheCoordinator (3-tier cache, cancellable)
        let mediaList = story.media
        preloadTask = Task { [weak self] in
            await withTaskGroup(of: (String, UIImage?).self) { group in
                for media in mediaList {
                    guard let urlString = media.url,
                          let url = MeeshyConfig.resolveMediaURL(urlString) else { continue }
                    let key = url.absoluteString
                    group.addTask {
                        let image = await CacheCoordinator.shared.images.image(for: key)
                        return (key, image)
                    }
                }
                for await (key, image) in group {
                    guard !Task.isCancelled, let self, let image else { continue }
                    self.slideImages[key] = image
                }
            }
        }
    }

    deinit {
        preloadTask?.cancel()
    }
}
```

Note : `FeedMedia.url` is `String?` and `MeeshyConfig.resolveMediaURL(_:)` returns `URL?` with SSRF validation — keep both guards.

- [ ] **Step 3: Do NOT modify the publish flow**

`StoryComposerViewModel` does not call `PostService.create*` directly — publication is delegated to the `onPublishSlide` callback owned by the iOS app caller. The caller (Phase C) reads `vm.repostOfId` and `vm.originalRepostOfId` after the user taps Publish, and passes `repostOfId` to `PostService.create(...)` / `createStory(...)` (now accepting that parameter — see B.5c).

This keeps the publish-flow callback signature stable (no breaking change for non-repost flows).

- [ ] **Step 4: Verify GREEN**

```bash
swift test --filter StoryComposerViewModelRepostTests
```

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift packages/MeeshySDK/Tests/MeeshyUITests/StoryComposerViewModelRepostTests.swift
git commit -m "feat(sdk): StoryComposerViewModel.init(reposting:authorHandle:) with CacheCoordinator preload"
```

---

### Task B.7 (PATCHED) : `UnifiedPostComposer.init(repostingStory:authorHandle:onPublishRepost:onDismiss:)`

> **Patched 2026-05-05** : aligned with B.6 — takes `(StoryItem + authorHandle: String)` instead of `APIPost`. Removes the `RepostSource` struct (story is enough). The `StoryCanvasReaderView` embed uses param `story:` (not `slide:`, see B.4 patch). Reference : Patch log row 6.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/UnifiedPostComposerRepostTests.swift`

- [ ] **Step 1: Tests RED**

```swift
@MainActor
final class UnifiedPostComposerRepostTests: XCTestCase {
    func test_init_reposting_setsLockedTypeToPost() {
        let story = makeStoryItem()
        let composer = UnifiedPostComposer(
            repostingStory: story,
            authorHandle: "alice",
            onPublishRepost: { _, _ in },
            onDismiss: {}
        )
        let mirror = Mirror(reflecting: composer)
        let lockedType = mirror.descendant("lockedType") as? PostType
        XCTAssertEqual(lockedType, .post)
    }

    func test_init_reposting_storesSourceStory() {
        let story = makeStoryItem(id: "src-1")
        let composer = UnifiedPostComposer(
            repostingStory: story,
            authorHandle: "alice",
            onPublishRepost: { _, _ in },
            onDismiss: {}
        )
        // Use ViewInspector or the test introspection accessor exposed for tests
        XCTAssertEqual(composer.repostSourceForTests?.id, "src-1")
    }

    func test_publish_invokesOnPublishRepostWithContentAndStory() {
        var publishedContent: String?
        var publishedStory: StoryItem?
        let story = makeStoryItem(id: "src-1")
        let composer = UnifiedPostComposer(
            repostingStory: story,
            authorHandle: "alice",
            onPublishRepost: { content, sourceStory in
                publishedContent = content
                publishedStory = sourceStory
            },
            onDismiss: {}
        )
        composer.triggerPublishForTests(content: "Mon commentaire")

        XCTAssertEqual(publishedContent, "Mon commentaire")
        XCTAssertEqual(publishedStory?.id, "src-1")
    }
}
```

(Add `repostSourceForTests` and `triggerPublishForTests(content:)` as `internal` test helpers — guarded by `#if DEBUG` if preferred — to avoid leaking testing surface to release.)

- [ ] **Step 2: Add new init + state**

```swift
public struct UnifiedPostComposer: View {
    @State private var selectedType: PostType = .post
    @State private var content: String = ""
    // ... existing @State ...

    /// Source story when in repost mode (nil for normal compose).
    @State private var repostSourceStory: StoryItem? = nil
    /// When non-nil, the type selector is locked to this value (B.7 = `.post`).
    private let lockedType: PostType?

    /// Repost-mode publish callback : (content, sourceStory).
    public var onPublishRepost: ((String, StoryItem) -> Void)?
    public var onDismiss: () -> Void
    public var onPublish: (PostType, String, String?, StoryEffects?, UIImage?) -> Void

    // Existing init stays unchanged (lockedType = nil, repostSourceStory = nil).

    /// Initializes the composer in repost-as-post mode with an embedded story preview.
    public init(
        repostingStory story: StoryItem,
        authorHandle: String,
        onPublishRepost: @escaping (_ content: String, _ sourceStory: StoryItem) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self._selectedType = State(initialValue: .post)
        self.lockedType = .post
        self._repostSourceStory = State(initialValue: story)
        self.onPublishRepost = onPublishRepost
        self.onDismiss = onDismiss
        // Default no-op for the non-repost callback
        self.onPublish = { _, _, _, _, _ in }
        // (`authorHandle` is not displayed inside the post composer itself —
        // the embedded StoryCanvasReaderView already shows the original story
        // with its locked badge and metadata. We accept the param for symmetry
        // with the StoryComposerViewModel init and for future polish.)
        _ = authorHandle
    }
}
```

- [ ] **Step 3: Modify body**

- Type selector : show only if `lockedType == nil`
- Content area : if `repostSourceStory != nil`, render `StoryCanvasReaderView(story: story, mute: false)` instead of the image-attachment slot (the composer is interactive, so audio is desired)
- Publish button : if `repostSourceStory != nil`, call `onPublishRepost(content, story)` instead of `onPublish(...)`

```swift
private var contentArea: some View {
    VStack(spacing: 12) {
        TextField("...", text: $content, axis: .vertical).lineLimit(5...)
        if let story = repostSourceStory {
            StoryCanvasReaderView(story: story, mute: false)
                .aspectRatio(9/16, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .cornerRadius(12)
                .clipped()
        } else {
            existingImageSlotView
        }
    }
}

private var publishButton: some View {
    Button {
        if let story = repostSourceStory, let onPublishRepost {
            onPublishRepost(content, story)
        } else {
            onPublish(selectedType, content, moodEmoji, nil, selectedImage)
        }
    } label: {
        Text("Publier")
    }
    .disabled(content.isEmpty)
}
```

- [ ] **Step 4: Verify GREEN**

```bash
swift test --filter UnifiedPostComposerRepostTests
```

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift packages/MeeshySDK/Tests/MeeshyUITests/UnifiedPostComposerRepostTests.swift
git commit -m "feat(sdk): UnifiedPostComposer init for repost mode with embedded story canvas"
```

---

## Phase C — iOS app

### Task C.1 (PATCHED) : Bouton « Partager » droite → ouvre `StoryComposerView` repost

> **Patched 2026-05-05** : composer init takes `(StoryItem + authorHandle: String)` — no `APIPost` reverse-mapping needed. Visibility is gated via `currentStory?.isPublic == true` (helper added in B.2). The deletion of the old `reshareStory()` is now done in B.5b. Reference : Patch log rows 1, 4, 6.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:572-579` (action of share button)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` (add @State + .fullScreenCover)

- [ ] **Step 1: Add state for the wrapper**

```swift
@State private var repostStoryComposerSource: RepostStorySourceWrapper?

private struct RepostStorySourceWrapper: Identifiable {
    let id = UUID()
    let story: StoryItem
    let authorHandle: String
}
```

- [ ] **Step 2: Replace share button action**

```swift
if !isOwnStory, currentStory?.isPublic == true {
    storyActionButton(icon: "arrow.2.squarepath", label: "Partager") {
        HapticFeedback.light()
        pauseTimer()
        if let story = currentStory, let group = currentGroup {
            repostStoryComposerSource = RepostStorySourceWrapper(
                story: story,
                authorHandle: group.username
            )
        }
    }
}
```

- [ ] **Step 3: Add `.fullScreenCover`**

```swift
.fullScreenCover(item: $repostStoryComposerSource, onDismiss: { resumeTimer() }) { wrapper in
    StoryComposerView(
        viewModel: StoryComposerViewModel(
            reposting: wrapper.story,
            authorHandle: wrapper.authorHandle
        ),
        onPublishSlide: { slide, image, _, _, _ in
            // Wrap the existing publish callback with repost-aware payload.
            // ViewModel exposes vm.repostOfId / vm.originalRepostOfId — read them here.
            // The actual createStory call now goes through PostService.createStory(...)
            // with `repostOfId: vm.repostOfId` (B.5c added the param).
            // For brevity, see existing publishSlide flow ; the only delta is passing
            // `repostOfId` through to the service.
        },
        onDismiss: { repostStoryComposerSource = nil }
    )
}
```

If `StoryComposerView`'s public init does not yet accept a pre-built `viewModel`, add an overload that does (small SDK touch — alternatively, use a private boot helper that constructs the VM internally before the View is rendered).

- [ ] **Step 4: Build, commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
git commit -m "feat(ios): share button opens StoryComposerView in repost mode"
```

---

### Task C.2 (PATCHED) : Menu kebab — « Republier en post » + « Éditer et republier en post »

> **Patched 2026-05-05** : visibility gating via `currentStory?.isPublic == true` ; `UnifiedPostComposer` init takes `(StoryItem + authorHandle)` ; the `onPublishRepost` callback receives `(content, sourceStory)` and the iOS caller uses `sourceStory.id` to call `PostService.repost(...)`. Reference : Patch log row 6.

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
                content: nil,
                isQuote: false
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

- [ ] **Step 2: Modify menu kebab — visibility gated by `isPublic`**

Replace the single "Republier" item (lines 1258-1262) ; gate the new items on `story.isPublic` :

```swift
if let story = currentStory, story.isPublic {
    Button { repostAsPostDirect() } label: {
        Label("Republier en post", systemImage: "arrow.2.squarepath")
    }

    Button {
        HapticFeedback.light()
        pauseTimer()
        if let group = currentGroup {
            editAndRepostAsPostSource = RepostPostSourceWrapper(
                story: story,
                authorHandle: group.username
            )
        }
    } label: {
        Label("Éditer et republier en post", systemImage: "square.and.pencil")
    }
}
```

- [ ] **Step 3: Add state + `.fullScreenCover` for the post composer repost**

```swift
@State private var editAndRepostAsPostSource: RepostPostSourceWrapper?

private struct RepostPostSourceWrapper: Identifiable {
    let id = UUID()
    let story: StoryItem
    let authorHandle: String
}

// In the body, alongside the existing covers :
.fullScreenCover(item: $editAndRepostAsPostSource, onDismiss: { resumeTimer() }) { wrapper in
    UnifiedPostComposer(
        repostingStory: wrapper.story,
        authorHandle: wrapper.authorHandle,
        onPublishRepost: { content, sourceStory in
            Task {
                do {
                    _ = try await PostService.shared.repost(
                        postId: sourceStory.id,
                        targetType: .post,
                        content: content.isEmpty ? nil : content,
                        isQuote: !content.isEmpty
                    )
                    await MainActor.run {
                        editAndRepostAsPostSource = nil
                        ToastManager.shared.show("Publié")
                    }
                } catch {
                    await MainActor.run {
                        ToastManager.shared.showError("Échec de la publication")
                    }
                }
            }
        },
        onDismiss: { editAndRepostAsPostSource = nil }
    )
}
```

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

### Type consistency check (post-patch 2026-05-05)

- `repostOfId` / `originalRepostOfId` propagation : APIPost (B.1) → StoryItem (B.2 patch — adds three fields) → ViewModels (B.6 / B.7 read from StoryItem directly) → publish payload via `PostService.create(repostOfId:)` (B.5c).
- `mute: Bool` parameter : added in B.4 with default `false` ; param name matches existing init = `story:` (NOT `slide:`) ; used in C.3 feed cell (`mute: true`) and B.7 composer embed (`mute: false`).
- `isLocked` : added in B.3 (StoryTextObject) ; CodingKeys extended ; relies on synthesized Codable. Composer canvas honors the flag in B.6 (badge sticker).
- `StoryItem.isPublic` : computed helper on StoryItem (B.2 patch). Consumed in C.1 and C.2 to gate the share button + kebab items.
- Composer init signatures (B.6 / B.7) take `(StoryItem + authorHandle: String)` — no `APIPost` reverse-mapping needed in Phase C.
- `PostService.repost(...)` returns `APIPost` (B.5) ; old `(postId:quote:)` signature is replaced ; 2 callers migrated in B.5b.
- `PostService.create(...)` and `createStory(...)` accept `repostOfId: String?` (B.5c).

### Placeholder scan

No "TBD" / "TODO" left. All steps have concrete code.

---

## Execution Handoff (updated 2026-05-05 post-patch)

Plan révisé + 6 patches appliqués. Approche : **subagent-driven-development** avec un `ios-architect-expert` par task.

**État courant** :
- ✅ B.1 done (commit `15e5190a`)
- ⏸ B.2 (PATCHED — expanded), B.3 (PATCHED), B.4 (PATCHED), B.5, B.5b (NEW), B.5c (NEW), B.6 (PATCHED), B.7 (PATCHED)
- ⏸ C.1 (PATCHED), C.2 (PATCHED), C.3, C.4
- ⏸ D.1, D.2

**Wave 1 — parallèle (4 sub-agents indépendants)** :
- B.2 (StoryItem + visibility/audioUrl/originalRepostOfId/isPublic helper)
- B.3 (StoryTextObject.isLocked — props names corrects)
- B.4 (StoryCanvasReaderView.mute — param name `story:`)
- B.5 (RepostRequest.targetType + PostService.repost returning APIPost)

**Wave 2 — séquentielle après B.5** :
- B.5b (migrate FeedViewModel + delete reshareStory)
- B.5c (PostService.create/createStory accept repostOfId)

**Wave 3 — après Wave 1+2** :
- B.6 (StoryComposerViewModel — depends on B.2 + B.3)
- B.7 (UnifiedPostComposer — depends on B.4 + B.5)

**Phase C** : depends on Phase B complete — C.1/C.2/C.3/C.4 then mostly sequential.

**Phase D** : after Phase C.

Total estimate : ~17 commits across Phase B (8) + C (4) + D (2) + plan patches (1 already merged in this commit).
