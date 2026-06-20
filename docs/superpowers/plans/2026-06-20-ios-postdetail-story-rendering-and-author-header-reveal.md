# PostDetail Story Rendering + Author Header Reveal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a story's canvas inline (audio active) when a story is opened in `PostDetailView`, and make the author block (avatar + name + `@pseudo` + view/impression stats) rise into the collapsible header when the author zone scrolls off-screen.

**Architecture:** Reuse the existing `StoryReaderRepresentable` (MeeshyUI) by threading `storyEffects`/`audioUrl` through the domain model `FeedPost` (so they survive the `FeedPost` cache round-trip) and adding a `StoryItem(feedPost:)` / `StoryReaderRepresentable(feedPost:)` convenience init. Extend the already-wired `authorRevealView` (the `CollapsibleHeader` `centerReveal` slot) with a shared reach-line formatter. No gateway change (verified: `GET /posts/:id` uses a Prisma `include`, which preserves all scalar fields including `storyEffects`).

**Tech Stack:** Swift 6 / SwiftUI (iOS 16+), MeeshySDK + MeeshyUI (SPM), XCTest + Swift Testing.

## Global Constraints

- **Reuse over creation**: reuse `StoryReaderRepresentable`, `CollapsibleHeader`, `authorReachLine` logic — do NOT build new renderers. (CLAUDE.md "Maximize reuse").
- **SDK purity**: model changes (`FeedPost`, `StoryItem`, `APIPost.toFeedPost`) live in `packages/MeeshySDK/`. App-side helpers + view wiring live in `apps/ios/`.
- **No redundant boolean+timestamp**, **no `any`**, **immutable-by-default**, **early returns** (CLAUDE.md code style).
- **iOS 16 target**: NO 2-param `.onChange` (use `adaptiveOnChange` if needed). NO `Date.now`-style nondeterminism in tests.
- **Classic xcodeproj (objectVersion 63)**: every NEW `.swift` file in the **app** target needs manual `project.pbxproj` entries (PBXFileReference + PBXBuildFile + group `children` + target Sources build phase). SDK (`packages/MeeshySDK`) is SPM — new files are auto-included, NO pbxproj.
- **Build gate**: `./apps/ios/meeshy.sh build` succeeds AND new tests pass before marking the feature done. Gateway untouched → no `tsc` gateway run.
- **Commits**: end at the last meaningful line — NO `Co-Authored-By` trailer.
- **Stats are author-only**: the `👁 vues · 📊 impressions` cluster shows only when the viewer is the post author (`isPostAuthor`), mirroring `authorReachLine`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` | `FeedPost` domain model | Add `storyEffects`/`audioUrl` stored props + Codable + `isStory`; add `StoryItem(feedPost:)` |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` | `APIPost.toFeedPost()` mapping | Map `storyEffects`/`audioUrl` post-construction |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift` | Inline story reader | Add `init(feedPost:)` convenience |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedPostStoryFieldsTests.swift` | SDK tests (NEW, SPM auto-included) | Round-trip, `isStory`, `toFeedPost`, `StoryItem(feedPost:)` |
| `apps/ios/Meeshy/Features/Main/Views/PostDetailReachAndVisibility.swift` | App pure helpers (NEW) | `PostReachFormatter` + `StoryCanvasVisibility` |
| `apps/ios/MeeshyTests/Unit/Views/PostDetailReachAndVisibilityTests.swift` | App helper tests (NEW) | Formatter + visibility unit tests |
| `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` | Detail screen | Reveal line 2 (`@pseudo`+stats) + inline story canvas + pause wiring |

---

## Task 1: `FeedPost` carries `storyEffects` / `audioUrl` (+ `isStory`, + cache round-trip)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` (struct props ~455-464; Codable 525-578; computed near `isReel` ~598)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedPostStoryFieldsTests.swift` (NEW)

**Interfaces:**
- Produces: `FeedPost.storyEffects: StoryEffects?`, `FeedPost.audioUrl: String?` (stored `var`, default `nil`), `FeedPost.isStory: Bool`. Both fields are part of `FeedPost`'s `Codable` (decode/encode), so they survive the `CacheCoordinator.feed` round-trip.

- [ ] **Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedPostStoryFieldsTests.swift`:

```swift
import XCTest
@testable import MeeshySDK

final class FeedPostStoryFieldsTests: XCTestCase {

    private func makeStoryEffects() -> StoryEffects {
        // StoryEffects has an all-defaulted init; a bare instance is a valid
        // non-nil canvas payload for round-trip purposes.
        StoryEffects()
    }

    func test_isStory_trueForStoryType_caseInsensitive() {
        XCTAssertTrue(FeedPost(author: "A", type: "STORY", content: "").isStory)
        XCTAssertTrue(FeedPost(author: "A", type: "story", content: "").isStory)
    }

    func test_isStory_falseForNonStory() {
        XCTAssertFalse(FeedPost(author: "A", type: "POST", content: "").isStory)
        XCTAssertFalse(FeedPost(author: "A", type: nil, content: "").isStory)
    }

    func test_codable_roundTrip_preservesStoryEffectsAndAudioUrl() throws {
        var post = FeedPost(author: "A", type: "STORY", content: "hello")
        post.storyEffects = makeStoryEffects()
        post.audioUrl = "https://cdn/x.mp3"

        let data = try JSONEncoder().encode(post)
        let decoded = try JSONDecoder().decode(FeedPost.self, from: data)

        XCTAssertNotNil(decoded.storyEffects)
        XCTAssertEqual(decoded.audioUrl, "https://cdn/x.mp3")
    }

    func test_codable_roundTrip_nilStoryFields_stayNil() throws {
        let post = FeedPost(author: "A", content: "plain")
        let data = try JSONEncoder().encode(post)
        let decoded = try JSONDecoder().decode(FeedPost.self, from: data)
        XCTAssertNil(decoded.storyEffects)
        XCTAssertNil(decoded.audioUrl)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/FeedPostStoryFieldsTests -quiet`
Expected: FAIL to compile — `value of type 'FeedPost' has no member 'storyEffects'` / `isStory`.

- [ ] **Step 3: Add stored properties**

In `FeedModels.swift`, inside `struct FeedPost`, just after `public var trackedLinkMap: [String: String] = [:]` (line ~464) add:

```swift
    /// Story canvas payload (`StoryEffects`) when this post is a story. `nil`
    /// for normal posts. Mirrors `RepostContent.storyEffects`. Carried on the
    /// domain model (not just the API model) so the post-detail story canvas
    /// survives the `CacheCoordinator.feed` round-trip.
    public var storyEffects: StoryEffects? = nil
    /// Legacy voice-note audio URL for story/status posts. `nil` for normal posts.
    public var audioUrl: String? = nil
```

- [ ] **Step 4: Add `isStory` computed property**

In `FeedModels.swift`, in the `public extension FeedPost` block next to `isReel` (~line 598), add:

```swift
    /// True when the server marks this post as a story (`type == "STORY"`).
    /// Mirrors `isReel`; used by `PostDetailView` to render the inline canvas.
    var isStory: Bool { (type ?? "").uppercased() == "STORY" }
```

- [ ] **Step 5: Extend Codable — CodingKeys**

In `extension FeedPost: Codable`, append `storyEffects, audioUrl` to the `CodingKeys` enum (line 527-529):

```swift
        case id, author, authorId, authorUsername, authorAvatarURL, type, content, timestamp, likes, isLiked
        case comments, commentCount, repost, repostAuthor, isQuote, media
        case originalLanguage, translations, translatedContent
        case storyEffects, audioUrl
```

- [ ] **Step 6: Extend Codable — decode**

In `init(from:)`, before the `let stableId` line (~552), add:

```swift
        storyEffects = try c.decodeIfPresent(StoryEffects.self, forKey: .storyEffects)
        audioUrl = try c.decodeIfPresent(String.self, forKey: .audioUrl)
```

- [ ] **Step 7: Extend Codable — encode**

In `encode(to:)`, after `try c.encodeIfPresent(translatedContent, forKey: .translatedContent)` (~577), add:

```swift
        try c.encodeIfPresent(storyEffects, forKey: .storyEffects)
        try c.encodeIfPresent(audioUrl, forKey: .audioUrl)
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/FeedPostStoryFieldsTests -quiet`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedPostStoryFieldsTests.swift
git commit -m "feat(sdk): FeedPost carries storyEffects/audioUrl + isStory (cache round-trip)"
```

---

## Task 2: `APIPost.toFeedPost()` maps `storyEffects` / `audioUrl`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift:414` (inside `toFeedPost()`, post-construction block)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedPostStoryFieldsTests.swift` (extend)

**Interfaces:**
- Consumes: `FeedPost.storyEffects` / `.audioUrl` (Task 1), `APIPost.storyEffects` / `.audioUrl` (existing, `PostModels.swift:133,135`).
- Produces: a `FeedPost` from `APIPost.toFeedPost()` that carries the top-level story fields.

- [ ] **Step 1: Write the failing test**

Append to `FeedPostStoryFieldsTests.swift`:

```swift
    func test_toFeedPost_mapsTopLevelStoryEffectsAndAudio() throws {
        // Decode a minimal story APIPost from JSON (real schema, no redefinition).
        let json = """
        {
          "id": "p1",
          "content": "caption",
          "type": "STORY",
          "createdAt": "2026-06-20T10:00:00.000Z",
          "author": { "id": "u1", "name": "Marie", "username": "marie" },
          "storyEffects": {},
          "audioUrl": "https://cdn/voice.mp3"
        }
        """
        let api = try JSONDecoder.meeshyISO8601.decode(APIPost.self, from: Data(json.utf8))
        let post = api.toFeedPost(preferredLanguages: ["fr"])
        XCTAssertNotNil(post.storyEffects)
        XCTAssertEqual(post.audioUrl, "https://cdn/voice.mp3")
        XCTAssertTrue(post.isStory)
    }
```

> NOTE for implementer: confirm the decoder helper name. If `JSONDecoder.meeshyISO8601` does not exist, use the decoder the other `APIPost` decoding tests in `MeeshySDKTests/Models/` use (grep `decode(APIPost.self` in the Tests dir) — reuse it verbatim, do not invent one.

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/FeedPostStoryFieldsTests/test_toFeedPost_mapsTopLevelStoryEffectsAndAudio -quiet`
Expected: FAIL — `post.storyEffects` is `nil`.

- [ ] **Step 3: Add the mapping**

In `PostModels.swift`, in `toFeedPost()`, immediately after `feedPost.playCount = playCount ?? 0` (line 414) and before the `// Outbound-link tracking map` comment (line 415), add:

```swift
        // Story canvas + legacy audio (top-level story posts). The init keeps a
        // stable signature, so we set these post-construction like the counters.
        feedPost.storyEffects = storyEffects
        feedPost.audioUrl = audioUrl
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/FeedPostStoryFieldsTests -quiet`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedPostStoryFieldsTests.swift
git commit -m "feat(sdk): map top-level storyEffects/audioUrl in APIPost.toFeedPost"
```

---

## Task 3: `StoryItem(feedPost:)` + `StoryReaderRepresentable(feedPost:)` convenience inits

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` (add `extension StoryItem` at end of file)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift` (add to the `extension StoryReaderRepresentable` convenience-init block, ~line 215)
- Test: `FeedPostStoryFieldsTests.swift` (extend)

**Interfaces:**
- Consumes: `FeedPost` (Task 1), `StoryItem.init(id:content:media:storyEffects:createdAt:expiresAt:...audioUrl:...isViewed:)` (existing, `StoryModels.swift:1554`), `StoryReaderRepresentable.init(story:preferredContentLanguages:mute:isPaused:)` (existing, `StoryReaderRepresentable.swift:76`).
- Produces: `StoryItem(feedPost: FeedPost)`; `StoryReaderRepresentable(feedPost: FeedPost, preferredContentLanguages: [String]?, mute: Bool, isPaused: Bool)`.

- [ ] **Step 1: Write the failing test**

Append to `FeedPostStoryFieldsTests.swift`:

```swift
    func test_storyItem_fromFeedPost_carriesCanvasFields() {
        var post = FeedPost(author: "Marie", authorId: "u1", type: "STORY", content: "caption")
        post.storyEffects = StoryEffects()
        post.audioUrl = "https://cdn/voice.mp3"
        post.media = [FeedMedia.image()]

        let item = StoryItem(feedPost: post)

        XCTAssertEqual(item.id, post.id)
        XCTAssertEqual(item.content, "caption")
        XCTAssertEqual(item.media.count, 1)
        XCTAssertNotNil(item.storyEffects)
        XCTAssertEqual(item.audioUrl, "https://cdn/voice.mp3")
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/FeedPostStoryFieldsTests/test_storyItem_fromFeedPost_carriesCanvasFields -quiet`
Expected: FAIL to compile — no `StoryItem(feedPost:)`.

- [ ] **Step 3: Add `StoryItem(feedPost:)` core init**

At the END of `FeedModels.swift`, add:

```swift
// MARK: - StoryItem bridge

public extension StoryItem {
    /// Synthesize a `StoryItem` from a story `FeedPost` (post-detail inline
    /// rendering). Mirrors the `RepostContent` bridge used by
    /// `StoryReaderRepresentable.init(repost:)`. `FeedPost` has no `expiresAt`,
    /// which is irrelevant to in-place playback.
    init(feedPost: FeedPost) {
        self.init(
            id: feedPost.id,
            content: feedPost.content,
            media: feedPost.media,
            storyEffects: feedPost.storyEffects,
            createdAt: feedPost.timestamp,
            expiresAt: nil,
            audioUrl: feedPost.audioUrl,
            isViewed: false
        )
    }
}
```

> NOTE for implementer: the `StoryItem` designated init (`StoryModels.swift:1554`) is `init(id:content:media:storyEffects:createdAt:expiresAt:repostOfId:originalRepostOfId:repostAuthorName:visibility:audioUrl:isViewed:...)` — all of `repostOfId`/`originalRepostOfId`/`repostAuthorName`/`visibility` are defaulted, so passing only the labels shown above compiles. `audioUrl:` IS a real param (verified) — keep it.

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/FeedPostStoryFieldsTests/test_storyItem_fromFeedPost_carriesCanvasFields -quiet`
Expected: PASS.

- [ ] **Step 5: Add `StoryReaderRepresentable(feedPost:)` UI init**

In `StoryReaderRepresentable.swift`, inside `extension StoryReaderRepresentable` (after `init(repost:)`, ~line 238), add:

```swift
    /// Construct from a story `FeedPost` (post-detail inline rendering).
    /// Audio active by default; `isPaused` is driven by the host for
    /// viewport-visibility + call-aware pausing.
    public init(feedPost: FeedPost,
                preferredContentLanguages: [String]? = nil,
                mute: Bool = false,
                isPaused: Bool = false) {
        self.init(story: StoryItem(feedPost: feedPost),
                  preferredContentLanguages: preferredContentLanguages ?? [],
                  mute: mute,
                  isPaused: isPaused)
    }
```

- [ ] **Step 6: Build the SDK UI target to verify it compiles**

Run: `xcodebuild build -scheme MeeshyUI -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet`
Expected: BUILD SUCCEEDED.

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedPostStoryFieldsTests.swift
git commit -m "feat(sdk): StoryItem(feedPost:) + StoryReaderRepresentable(feedPost:) inline init"
```

---

## Task 4: App pure helpers — `PostReachFormatter` + `StoryCanvasVisibility`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/PostDetailReachAndVisibility.swift`
- Create: `apps/ios/MeeshyTests/Unit/Views/PostDetailReachAndVisibilityTests.swift`
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj` (register BOTH new files)

**Interfaces:**
- Produces:
  - `PostReachFormatter.compact(_ value: Int) -> String` ("1.2k" / "3.4M")
  - `PostReachFormatter.Components` (`pseudo: String?`, `views: String?`, `impressions: String?`, `Equatable`)
  - `PostReachFormatter.components(username: String?, isAuthor: Bool, openCount: Int, impressionCount: Int) -> Components`
  - `StoryCanvasVisibility.isVisible(canvasFrame: CGRect, viewportHeight: CGFloat) -> Bool`

- [ ] **Step 1: Write the failing tests**

Create `apps/ios/MeeshyTests/Unit/Views/PostDetailReachAndVisibilityTests.swift`:

```swift
import XCTest
import CoreGraphics
@testable import Meeshy

final class PostDetailReachAndVisibilityTests: XCTestCase {

    // MARK: PostReachFormatter.compact
    func test_compact_formatsThousandsAndMillions() {
        XCTAssertEqual(PostReachFormatter.compact(0), "0")
        XCTAssertEqual(PostReachFormatter.compact(999), "999")
        XCTAssertEqual(PostReachFormatter.compact(1_200), "1.2k")
        XCTAssertEqual(PostReachFormatter.compact(3_400_000), "3.4M")
    }

    // MARK: PostReachFormatter.components
    func test_components_author_hasPseudoAndStats() {
        let c = PostReachFormatter.components(username: "marie", isAuthor: true, openCount: 1_200, impressionCount: 3_400)
        XCTAssertEqual(c.pseudo, "@marie")
        XCTAssertEqual(c.views, "1.2k")
        XCTAssertEqual(c.impressions, "3.4k")
    }

    func test_components_nonAuthor_hasPseudoNoStats() {
        let c = PostReachFormatter.components(username: "marie", isAuthor: false, openCount: 1_200, impressionCount: 3_400)
        XCTAssertEqual(c.pseudo, "@marie")
        XCTAssertNil(c.views)
        XCTAssertNil(c.impressions)
    }

    func test_components_noUsername_pseudoNil() {
        let empty = PostReachFormatter.components(username: "", isAuthor: false, openCount: 0, impressionCount: 0)
        XCTAssertNil(empty.pseudo)
        let nilName = PostReachFormatter.components(username: nil, isAuthor: false, openCount: 0, impressionCount: 0)
        XCTAssertNil(nilName.pseudo)
    }

    // MARK: StoryCanvasVisibility.isVisible — global-space frame, 0 = top of screen
    func test_isVisible_fullyAbove_isFalse() {
        XCTAssertFalse(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: -300, width: 300, height: 200), viewportHeight: 800))
    }

    func test_isVisible_fullyBelow_isFalse() {
        XCTAssertFalse(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: 900, width: 300, height: 200), viewportHeight: 800))
    }

    func test_isVisible_partiallyOnScreen_isTrue() {
        XCTAssertTrue(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: -50, width: 300, height: 200), viewportHeight: 800))
        XCTAssertTrue(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: 400, width: 300, height: 200), viewportHeight: 800))
    }
}
```

- [ ] **Step 2: Create the helper file**

Create `apps/ios/Meeshy/Features/Main/Views/PostDetailReachAndVisibility.swift`:

```swift
import CoreGraphics
import Foundation

/// Pure formatter for the author "reach line" (`@pseudo · 👁 vues · 📊 impressions`),
/// shared by the inline author block (`authorReachLine`) and the collapsed header
/// reveal (`authorRevealView`). Stats are author-only.
enum PostReachFormatter {
    /// Compact count: 1.2k / 3.4M. Mirrors the per-card `compactCount` copies.
    static func compact(_ value: Int) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
        if value >= 1_000 { return String(format: "%.1fk", Double(value) / 1_000) }
        return "\(value)"
    }

    struct Components: Equatable {
        let pseudo: String?       // "@marie" or nil
        let views: String?        // "1.2k" or nil (author-only)
        let impressions: String?  // "3.4k" or nil (author-only)
    }

    static func components(username: String?, isAuthor: Bool, openCount: Int, impressionCount: Int) -> Components {
        let pseudo = (username?.isEmpty == false) ? "@\(username!)" : nil
        guard isAuthor else { return Components(pseudo: pseudo, views: nil, impressions: nil) }
        return Components(pseudo: pseudo, views: compact(openCount), impressions: compact(impressionCount))
    }
}

/// Pure visibility test for the inline story canvas inside the detail ScrollView.
/// `canvasFrame` is the canvas frame in GLOBAL space (0 = top of screen);
/// `viewportHeight` is the screen height. Returns true while ANY part is on-screen
/// (pause audio only once the canvas is FULLY off-screen).
enum StoryCanvasVisibility {
    static func isVisible(canvasFrame: CGRect, viewportHeight: CGFloat) -> Bool {
        canvasFrame.maxY > 0 && canvasFrame.minY < viewportHeight
    }
}
```

- [ ] **Step 3: Register both files in `project.pbxproj`**

The app target is a classic xcodeproj. For EACH new file, add 4 entries (use an existing sibling file as a copy-paste template — e.g. find the 4 lines that reference `FeedPostCard.swift` for the source file, and a sibling test file for the test). For `PostDetailReachAndVisibility.swift` (app target `Meeshy`) and `PostDetailReachAndVisibilityTests.swift` (test target `MeeshyTests`):
1. `PBXFileReference` (new UUID A) — the file.
2. `PBXBuildFile` (new UUID B) — `A in Sources`.
3. Add `A` to the enclosing `PBXGroup`'s `children` (the `Views/` group for the source; the `Unit/Views` group for the test).
4. Add `B` to the target's `PBXSourcesBuildPhase` `files` list (Meeshy for the source, MeeshyTests for the test).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./apps/ios/meeshy.sh test --only PostDetailReachAndVisibilityTests`
(If `--only` is unsupported, run `./apps/ios/meeshy.sh test` and confirm `PostDetailReachAndVisibilityTests` is green in the output.)
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/PostDetailReachAndVisibility.swift apps/ios/MeeshyTests/Unit/Views/PostDetailReachAndVisibilityTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): PostReachFormatter + StoryCanvasVisibility pure helpers"
```

---

## Task 5: Author header reveal shows `@pseudo` + stats (Partie A)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` (`authorReachLine` 796-824; `authorRevealView` 662-735; remove private `compactCount` 235-240)

**Interfaces:**
- Consumes: `PostReachFormatter.components(...)`, `PostReachFormatter.compact(...)` (Task 4); existing `isPostAuthor`, `post.authorUsername`, `post.postOpenCount`, `post.impressionCount`.
- Produces: collapsed-header `centerReveal` whose line 2 is `@pseudo · 👁 vues · 📊 impressions` (author) or `@pseudo` (non-author) or absent (no pseudo).

- [ ] **Step 1: Replace the private `compactCount` with the shared formatter**

In `PostDetailView.swift`, DELETE the `compactCount` helper (lines 235-240) and replace its two call sites in `authorReachLine` (lines 812, 815) `Self.compactCount(...)` → `PostReachFormatter.compact(...)`. (This removes the soon-unused private func to avoid a warning-as-failure build.)

- [ ] **Step 2: Build to confirm `authorReachLine` still compiles**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (inline reach line unchanged visually).

- [ ] **Step 3: Add the reveal secondary line**

In `authorRevealView(_:)`, replace the `VStack(alignment: .leading, spacing: 1)` block (lines 675-683) — currently name + relative time — with name + the shared reach line:

```swift
                    VStack(alignment: .leading, spacing: 1) {
                        Text(post.author)
                            .font(.subheadline.weight(.bold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                        let reach = PostReachFormatter.components(
                            username: post.authorUsername,
                            isAuthor: isPostAuthor,
                            openCount: post.postOpenCount,
                            impressionCount: post.impressionCount
                        )
                        if reach.pseudo != nil || reach.views != nil {
                            HStack(spacing: 4) {
                                if let pseudo = reach.pseudo {
                                    Text(pseudo)
                                        .font(.caption2)
                                        .foregroundColor(theme.textMuted)
                                        .lineLimit(1)
                                }
                                if let views = reach.views, let impressions = reach.impressions {
                                    if reach.pseudo != nil {
                                        Text("·").font(.caption2).foregroundColor(theme.textMuted)
                                    }
                                    HStack(spacing: 3) {
                                        Image(systemName: "eye.fill").font(.system(size: 9, weight: .semibold))
                                        Text(views).font(.system(size: 10, weight: .medium))
                                        Text("·").font(.caption2)
                                        Image(systemName: "chart.bar.fill").font(.system(size: 9, weight: .semibold))
                                        Text(impressions).font(.system(size: 10, weight: .medium))
                                    }
                                    .foregroundColor(theme.textMuted)
                                }
                            }
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(String(localized: "feed.post.reach", defaultValue: "Vues et impressions", bundle: .main))
                            .accessibilityValue("\(post.postOpenCount) · \(post.impressionCount)")
                        }
                    }
```

- [ ] **Step 4: Build + run to verify the reveal**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.
Then `./apps/ios/meeshy.sh run`, open a post detail you authored, scroll until the author zone leaves the screen, and confirm the header center shows **avatar + name** (line 1) and **@pseudo · 👁 N · 📊 N** (line 2). Open someone else's post → line 2 shows `@pseudo` only.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift
git commit -m "feat(ios): collapsed header reveal shows @pseudo + author stats"
```

---

## Task 6: Inline story canvas in PostDetailView (Partie B) + viewport/call pause

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` (state ~28; `postDetailContent` ZONE 2, 336-341; body ScrollView 416-460; add `storyCanvasSection` + frame `PreferenceKey`)

**Interfaces:**
- Consumes: `StoryReaderRepresentable(feedPost:preferredContentLanguages:mute:isPaused:)` (Task 3), `StoryCanvasVisibility.isVisible(...)` (Task 4), `FeedPost.isStory`/`.storyEffects` (Task 1), `CallManager.shared.$callState` (`callState.isActive: Bool`, existing).

- [ ] **Step 1: Add pause state + a frame preference key**

In `PostDetailView.swift`, near the other `@State` (after line 28 `headerScrollOffset`), add:

```swift
    @State private var storyCanvasVisible: Bool = true
    @State private var isCallActive: Bool = false
```

At the BOTTOM of the file (top level, after the `struct PostDetailView` closing brace, alongside other file-private types), add:

```swift
private struct StoryCanvasFrameKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) { value = nextValue() }
}
```

- [ ] **Step 2: Add the `storyCanvasSection` builder**

In `PostDetailView`, near `detailMediaSection` (before line 1342), add:

```swift
    @ViewBuilder
    private func storyCanvasSection(_ post: FeedPost) -> some View {
        StoryReaderRepresentable(
            feedPost: post,
            preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages,
            mute: false,
            isPaused: !storyCanvasVisible || isCallActive
        )
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
        .frame(maxWidth: 460)
        .frame(maxWidth: .infinity, alignment: .center)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .background(
            GeometryReader { geo in
                Color.clear.preference(key: StoryCanvasFrameKey.self, value: geo.frame(in: .global))
            }
        )
        .onPreferenceChange(StoryCanvasFrameKey.self) { frame in
            storyCanvasVisible = StoryCanvasVisibility.isVisible(
                canvasFrame: frame,
                viewportHeight: UIScreen.main.bounds.height
            )
        }
    }
```

- [ ] **Step 3: Gate ZONE 2 on story vs media**

In `postDetailContent(_:)`, replace the ZONE 2 block (lines 336-341):

```swift
        // ZONE 2: Media
        if post.hasMedia {
            detailMediaSection(post.media)
                .padding(.horizontal, 16)
                .padding(.top, 8)
        }
```

with:

```swift
        // ZONE 2: Story canvas (inline reader) OR standard media
        if post.isStory || post.storyEffects != nil {
            storyCanvasSection(post)
        } else if post.hasMedia {
            detailMediaSection(post.media)
                .padding(.horizontal, 16)
                .padding(.top, 8)
        }
```

- [ ] **Step 4: Drive `isCallActive` from the call state**

In `body`, on the `ScrollViewReader { … }` (or the outer `VStack`), add a call-state subscription. Attach after the existing `.onAppear` on the `ScrollViewReader` (line 450-459):

```swift
                .onReceive(CallManager.shared.$callState) { state in
                    isCallActive = state.isActive
                }
```

> NOTE for implementer: confirm `CallManager.shared.callState.isActive` is the right accessor (used at `FloatingCallPillView.swift:59`, `ConversationView+Header.swift:192`). If `CallManager` is not already imported in this file, it is in the `Meeshy` app module (no import needed — same target).

- [ ] **Step 5: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.

- [ ] **Step 6: Run + manual verification**

Run: `./apps/ios/meeshy.sh run`. Then:
1. Open a STORY in the detail page (e.g. tap a story-repost's author chip, which pushes `.postDetail(repost.id)`, or via a `/story/<id>` deep link that falls back to detail). Confirm the 9:16 canvas plays inline **with audio**, the author header + caption sit above it.
2. Scroll down to the comments until the canvas is fully off-screen → audio STOPS. Scroll back up → it resumes.
3. (If feasible) start/receive a call while a story detail is open → canvas pauses.
4. Open a NORMAL post with images → still renders `detailMediaSection` (no regression).

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift
git commit -m "feat(ios): render story canvas inline in PostDetail (audio active, viewport/call pause)"
```

---

## Final Verification

- [ ] **Step 1: Full SDK test suite (touched models)**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/FeedPostStoryFieldsTests -quiet`
Expected: PASS.

- [ ] **Step 2: App helper tests**

Run: `./apps/ios/meeshy.sh test` — confirm `PostDetailReachAndVisibilityTests` green (and no new failures elsewhere; note the known-flaky `FeedViewModelTests.test_loadMoreIfNeeded` / `ConversationListViewModelTests.schedulePersist_*` — re-run before treating as a regression).

- [ ] **Step 3: Clean app build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED, zero warnings introduced.

- [ ] **Step 4: Confirm gateway untouched**

Run: `git diff --name-only main...HEAD -- services/` → expected: empty (no gateway changes).

---

## Notes / Out of Scope

- `compactCount` remains duplicated in `ReelFeedCard.swift` and `FeedPostCard.swift` — NOT unified here (separate views, out of scope). A future cleanup could route all three through `PostReachFormatter.compact`.
- Tap → fullscreen `StoryViewer` from detail is OUT (requires synthesizing a `StoryGroup` + `StoryViewModel`). The inline reader with audio satisfies the requirement.
- `AVAudioSession` policy: if inline playback interrupts the user's other audio surprisingly, align the session category with the `StoryViewer`'s policy (verify at run, Task 6 Step 6).
