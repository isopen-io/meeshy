# Mes stories — liste comme point d'entrée + gestion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `MyStoriesView` (the existing "Mes stories" list) the default entry point when viewing your own stories, fix a bug where tapping a specific story always opened the first one instead, and add create-from-list + multi-select bulk delete + content-proportional thumbnails.

**Architecture:** Five small, independent SwiftUI changes to existing files under `apps/ios/Meeshy/Features/Main/Views/`, backed by three new pure/testable helper enums (`StoryThumbnailSizing`, `StoryIndexResolver`, `StorySelectionResolver`) following the codebase's established `XxxResolver.swift` + `XxxResolverTests.swift` pattern (e.g. `SkeletonVisibilityResolver`, `CallBubbleGestureResolver`). No SDK changes — every change encodes a Meeshy-specific UX decision (test du grain, `packages/MeeshySDK/CLAUDE.md`).

**Tech Stack:** SwiftUI, XCTest, `@testable import Meeshy`.

**Spec:** `docs/superpowers/specs/2026-07-14-my-stories-list-management-design.md` (reviewed and corrected 2026-07-14).

## Global Constraints

- TDD non-negotiable: write the failing test BEFORE production code, minimum code to pass, no speculative extras (`CLAUDE.md` "TDD is Non-Negotiable").
- Every interactive element gets an explicit `.accessibilityLabel()` (`apps/ios/CLAUDE.md` Accessibility Rules).
- New user-facing strings use `String(localized: "key", defaultValue: "…")` — no manual edits to `Localizable.xcstrings` needed (Xcode auto-extracts; confirmed the existing `story.mine.*` keys aren't in the catalog either).
- Semantic colors (error, success) come from `MeeshyColors` — never hardcode.
- No comments except where a hidden constraint/non-obvious WHY needs explaining — the existing files already follow this, match it.
- `./apps/ios/meeshy.sh build` must succeed after every task before committing. Prefer the faster targeted `xcodebuild build-for-testing` + `test-without-building` loop (`apps/ios/CLAUDE.md` "Reproduire la CI") when iterating on tests within a task; run a full `meeshy.sh build` at minimum once per task.
- **`meeshy.sh` does NOT run `xcodegen generate`** — it builds the committed `project.pbxproj` as-is (`apps/ios/CLAUDE.md` "Gestion de projet Xcode"). Every task in this plan creates at least one new `.swift` file (source or test). Run `cd apps/ios && xcodegen generate` **immediately before every `xcodebuild`/`meeshy.sh build` invocation** that must see a file created earlier in the same task — every command below already includes this; do not drop it when adapting a step.
- **`xcodegen generate` regenerates `project.pbxproj` and can reset `CURRENT_PROJECT_VERSION`** to the `project.yml` placeholder if a higher auto-bumped value was previously committed (known trap — see `apps/ios/CLAUDE.md`). Baseline checked 2026-07-14: the committed value is already `CURRENT_PROJECT_VERSION = 1` (matches `project.yml`'s placeholder), so no restoration is expected in this plan — but re-check with `grep -m1 CURRENT_PROJECT_VERSION apps/ios/Meeshy.xcodeproj/project.pbxproj` before Task 1's first commit; if it differs from `1`, capture that value and after every subsequent `xcodegen generate` run `sed -i '' 's/CURRENT_PROJECT_VERSION = 1;/CURRENT_PROJECT_VERSION = <captured-value>;/g' apps/ios/Meeshy.xcodeproj/project.pbxproj` before committing.
- Because `xcodegen generate` adds the new files' references to `project.pbxproj` (required for `meeshy.sh build/test` to find them locally — CI regenerates its own copy so this isn't required there, but skipping it locally reproduces the exact "cannot find in scope despite the file existing on disk" trap documented in `apps/ios/CLAUDE.md`), **every task's commit step below stages `apps/ios/Meeshy.xcodeproj/project.pbxproj` alongside the new/modified `.swift` files.** Before staging it, sanity-check with `git diff --stat apps/ios/Meeshy.xcodeproj/project.pbxproj` that the diff only adds file references for this task's new files (no unrelated deletions, no version regression) — if anything else changed, stop and investigate rather than committing it blind.
- Commit after each task (small, working increments) — no `Co-Authored-By` trailer in commit messages (project convention).
- Test files: `apps/ios/MeeshyTests/Unit/Views/`, `@testable import Meeshy`, factory-function pattern (no shared mutable `let`/`beforeEach` state).

---

## Task 1: `StoryThumbnailSizing` — content-proportional thumbnail width

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/StoryThumbnailSizing.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/StoryThumbnailSizingTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift:217-233` (`MyStoryRow.thumbnail`)

**Interfaces:**
- Produces: `enum StoryThumbnailSizing { static func width(forAspectRatio: Double?, height: CGFloat = 64) -> CGFloat }`, consumed by `MyStoryRow.thumbnail` in this same task's Step 6.

- [ ] **Step 1: Write the failing test**

Create `apps/ios/MeeshyTests/Unit/Views/StoryThumbnailSizingTests.swift`:

```swift
import XCTest
@testable import Meeshy

final class StoryThumbnailSizingTests: XCTestCase {

    func test_width_portraitNineBySixteen_returnsProportionalWidth() {
        let result = StoryThumbnailSizing.width(forAspectRatio: 0.5625, height: 64)
        XCTAssertEqual(result, 36, accuracy: 0.01)
    }

    func test_width_square_returnsFullHeight() {
        let result = StoryThumbnailSizing.width(forAspectRatio: 1.0, height: 64)
        XCTAssertEqual(result, 64, accuracy: 0.01, "square content clamps at maxWidth (64), not 64*1.0 verbatim coincidentally equal here")
    }

    func test_width_extremeLandscape_clampsToMaxWidth() {
        let result = StoryThumbnailSizing.width(forAspectRatio: 2.5, height: 64)
        XCTAssertEqual(result, 64, accuracy: 0.01, "landscape ratios must clamp at 64pt, never exceed the row's usable width")
    }

    func test_width_extremePortrait_clampsToMinWidth() {
        let result = StoryThumbnailSizing.width(forAspectRatio: 0.2, height: 64)
        XCTAssertEqual(result, 36, accuracy: 0.01, "very narrow portrait content clamps at minWidth (36), stays legible")
    }

    func test_width_nilAspectRatio_fallsBackToNineBySixteen() {
        let result = StoryThumbnailSizing.width(forAspectRatio: nil, height: 64)
        XCTAssertEqual(result, 36, accuracy: 0.01, "text-only stories (no media) fall back to the 9:16 default")
    }

    func test_width_defaultHeightParameter_is64() {
        let result = StoryThumbnailSizing.width(forAspectRatio: 1.0)
        XCTAssertEqual(result, 64, accuracy: 0.01)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build -only-testing:MeeshyTests/StoryThumbnailSizingTests 2>&1 | tail -30`
Expected: FAIL — `cannot find 'StoryThumbnailSizing' in scope` (compile error, not a runtime failure — this is the expected RED state per `apps/ios/CLAUDE.md` "TEST FAILED = compile error").

- [ ] **Step 3: Write minimal implementation**

Create `apps/ios/Meeshy/Features/Main/Views/StoryThumbnailSizing.swift`:

```swift
import CoreGraphics

/// Pure sizing helper for `MyStoryRow` thumbnails. Derives width from the
/// story's real content aspect ratio (width / height, cf.
/// `StoryMediaObject.aspectRatio`) instead of forcing every thumbnail into a
/// fixed 9:16 frame, while keeping row height constant so the list's
/// vertical rhythm never varies.
enum StoryThumbnailSizing {
    /// Fallback ratio (9:16 portrait) used for text-only stories (no media)
    /// or legacy stories with no recorded aspect ratio.
    static let fallbackAspectRatio: Double = 0.5625

    /// Clamp range in points — keeps thumbnails legible at extreme ratios.
    static let minWidth: CGFloat = 36
    static let maxWidth: CGFloat = 64

    static func width(forAspectRatio aspectRatio: Double?, height: CGFloat = 64) -> CGFloat {
        let ratio = aspectRatio ?? fallbackAspectRatio
        let raw = height * CGFloat(ratio)
        return min(max(raw, minWidth), maxWidth)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/ios && xcodebuild test-without-building -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,name=iPhone 16 Pro" -only-testing:MeeshyTests/StoryThumbnailSizingTests -derivedDataPath Build 2>&1 | tail -30`
Expected: PASS (6/6 tests green)

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryThumbnailSizing.swift apps/ios/MeeshyTests/Unit/Views/StoryThumbnailSizingTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/story): StoryThumbnailSizing — largeur de vignette proportionnelle au contenu"
```

- [ ] **Step 6: Wire into `MyStoryRow.thumbnail`**

In `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`, replace:

```swift
    @ViewBuilder
    private var thumbnail: some View {
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        Group {
            if let urlString = thumbnailURLString, !urlString.isEmpty {
                CachedAsyncImage(url: urlString, targetSize: CGSize(width: 44, height: 64)) {
                    shape.fill(accentColor.opacity(0.25))
                }
            } else {
                shape.fill(accentColor.opacity(0.25))
                    .overlay(Image(systemName: "photo").foregroundColor(accentColor))
            }
        }
        .frame(width: 44, height: 64)
        .clipShape(shape)
        .overlay(shape.stroke(accentColor.opacity(0.3), lineWidth: 1))
    }
```

with:

```swift
    @ViewBuilder
    private var thumbnail: some View {
        let width = StoryThumbnailSizing.width(forAspectRatio: story.media.first?.aspectRatio)
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        Group {
            if let urlString = thumbnailURLString, !urlString.isEmpty {
                CachedAsyncImage(url: urlString, targetSize: CGSize(width: width, height: 64)) {
                    shape.fill(accentColor.opacity(0.25))
                }
            } else {
                shape.fill(accentColor.opacity(0.25))
                    .overlay(Image(systemName: "photo").foregroundColor(accentColor))
            }
        }
        .frame(width: width, height: 64)
        .clipShape(shape)
        .overlay(shape.stroke(accentColor.opacity(0.3), lineWidth: 1))
    }
```

- [ ] **Step 7: Build to confirm it compiles**

Run: `cd apps/ios && xcodegen generate && cd .. && ./apps/ios/meeshy.sh build`
Expected: `BUILD SUCCEEDED` (check the tail of the log, not just exit code — `apps/ios/CLAUDE.md` warns exit 0 can still hide a stale-app skip). The `xcodegen generate` is required here: `StoryThumbnailSizing.swift` (Step 3) was created after Step 2's `xcodegen generate`, so it is not yet in `project.pbxproj`.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift
git commit -m "feat(ios/story): vignette Mes stories proportionnelle au ratio réel du contenu"
```

---

## Task 2: `StoryIndexResolver` — fix tapping a row always opening story index 0

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/StoryIndexResolver.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/StoryIndexResolverTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift:43-67`

**Interfaces:**
- Consumes: `StoryGroup` (`packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1910`, `.stories: [StoryItem]`, ascending by `createdAt`), `StoryItem.id: String`.
- Produces: `enum StoryIndexResolver { static func index(forPostId: String?, in: StoryGroup, fallback: Int) -> Int }`.

- [ ] **Step 1: Write the failing test**

Create `apps/ios/MeeshyTests/Unit/Views/StoryIndexResolverTests.swift`:

```swift
import XCTest
@testable import Meeshy
import MeeshySDK

final class StoryIndexResolverTests: XCTestCase {

    private func makeGroup(storyIDs: [String]) -> StoryGroup {
        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let stories = storyIDs.enumerated().map { offset, id in
            StoryItem(id: id, createdAt: base.addingTimeInterval(TimeInterval(offset)))
        }
        return StoryGroup(id: "user-1", username: "alice", avatarColor: "FF2E63", stories: stories)
    }

    func test_index_postIdInMiddleOfGroup_returnsItsIndex() {
        let group = makeGroup(storyIDs: ["s1", "s2", "s3"])

        let result = StoryIndexResolver.index(forPostId: "s2", in: group, fallback: 0)

        XCTAssertEqual(result, 1)
    }

    func test_index_postIdResolvingToIndexZero_returnsZeroExplicitly() {
        let group = makeGroup(storyIDs: ["s1", "s2", "s3"])

        let result = StoryIndexResolver.index(forPostId: "s1", in: group, fallback: 7)

        XCTAssertEqual(result, 0, "index 0 must be honored explicitly, not confused with the fallback")
    }

    func test_index_postIdAbsentFromGroup_returnsFallback() {
        let group = makeGroup(storyIDs: ["s1", "s2", "s3"])

        let result = StoryIndexResolver.index(forPostId: "unknown", in: group, fallback: 2)

        XCTAssertEqual(result, 2)
    }

    func test_index_postIdNil_returnsFallback() {
        let group = makeGroup(storyIDs: ["s1", "s2", "s3"])

        let result = StoryIndexResolver.index(forPostId: nil, in: group, fallback: 1)

        XCTAssertEqual(result, 1)
    }

    func test_index_singleStoryGroup_matchingPostId_returnsZero() {
        let group = makeGroup(storyIDs: ["only-story"])

        let result = StoryIndexResolver.index(forPostId: "only-story", in: group, fallback: 5)

        XCTAssertEqual(result, 0)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build -only-testing:MeeshyTests/StoryIndexResolverTests 2>&1 | tail -30`
Expected: FAIL — `cannot find 'StoryIndexResolver' in scope`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/ios/Meeshy/Features/Main/Views/StoryIndexResolver.swift`:

```swift
import Foundation
import MeeshySDK

/// Pure lookup resolving a story's playback index within its group by id.
/// `StoryViewerContainer` receives `postId` from entry points that know the
/// exact story tapped (My Stories list, notifications, deep links,
/// bookmarks) but historically only used it to trigger a targeted fetch —
/// never to compute where playback should start, so the viewer always
/// opened at `initialStoryIndex` (default 0) regardless of which story was
/// tapped.
///
/// Known limitation, explicitly not fixed here: `StoryViewerView` gates
/// `initialStoryIndex` application with `if initialStoryIndex > 0`, so a
/// resolved index of `0` combined with `startAtFirstUnviewed: true` would
/// fall through to the unviewed-story branch instead. No current caller
/// combines `postId` with `startAtFirstUnviewed: true`, so this resolver's
/// index-0 test above documents the boundary without touching that
/// unrelated code path.
enum StoryIndexResolver {
    /// Returns the index of `postId` within `group.stories`, or `fallback`
    /// when `postId` is `nil` or not found in the group.
    ///
    /// - Important: `group.stories` is ascending by `createdAt` (oldest
    ///   first, the group's read order) — NOT the same order as any
    ///   display-sorted list (e.g. `MyStoriesView.stories`, newest first).
    ///   Search here, never in a display-sorted array.
    static func index(forPostId postId: String?, in group: StoryGroup, fallback: Int) -> Int {
        guard let postId, let idx = group.stories.firstIndex(where: { $0.id == postId }) else {
            return fallback
        }
        return idx
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/ios && xcodebuild test-without-building -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,name=iPhone 16 Pro" -only-testing:MeeshyTests/StoryIndexResolverTests -derivedDataPath Build 2>&1 | tail -30`
Expected: PASS (5/5 tests green)

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryIndexResolver.swift apps/ios/MeeshyTests/Unit/Views/StoryIndexResolverTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/story): StoryIndexResolver — résout l'index de lecture par postId"
```

- [ ] **Step 6: Wire into `StoryViewerContainer.body`**

In `apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift`, replace:

```swift
            if let resolvedIndex = viewModel.groupIndex(forUserId: uid) {
                if singleGroup {
                    StoryViewerView(
                        viewModel: viewModel,
                        groups: [viewModel.storyGroups[resolvedIndex]],
                        currentGroupIndex: 0,
                        isPresented: $isPresented,
                        initialStoryIndex: initialStoryIndex,
                        startAtFirstUnviewed: startAtFirstUnviewed,
                        initialAction: initialAction
                    )
                    .transition(.identity)
                } else {
                    StoryViewerView(
                        viewModel: viewModel,
                        groups: viewModel.storyGroups,
                        currentGroupIndex: resolvedIndex,
                        isPresented: $isPresented,
                        onReplyToStory: onReplyToStory,
                        initialStoryIndex: initialStoryIndex,
                        startAtFirstUnviewed: startAtFirstUnviewed,
                        initialAction: initialAction
                    )
                    .transition(.identity)
                }
            } else if timedOut {
```

with:

```swift
            if let resolvedIndex = viewModel.groupIndex(forUserId: uid) {
                let resolvedStoryIndex = StoryIndexResolver.index(
                    forPostId: postId,
                    in: viewModel.storyGroups[resolvedIndex],
                    fallback: initialStoryIndex
                )
                if singleGroup {
                    StoryViewerView(
                        viewModel: viewModel,
                        groups: [viewModel.storyGroups[resolvedIndex]],
                        currentGroupIndex: 0,
                        isPresented: $isPresented,
                        initialStoryIndex: resolvedStoryIndex,
                        startAtFirstUnviewed: startAtFirstUnviewed,
                        initialAction: initialAction
                    )
                    .transition(.identity)
                } else {
                    StoryViewerView(
                        viewModel: viewModel,
                        groups: viewModel.storyGroups,
                        currentGroupIndex: resolvedIndex,
                        isPresented: $isPresented,
                        onReplyToStory: onReplyToStory,
                        initialStoryIndex: resolvedStoryIndex,
                        startAtFirstUnviewed: startAtFirstUnviewed,
                        initialAction: initialAction
                    )
                    .transition(.identity)
                }
            } else if timedOut {
```

- [ ] **Step 7: Build to confirm it compiles**

Run: `cd apps/ios && xcodegen generate && cd .. && ./apps/ios/meeshy.sh build`
Expected: `BUILD SUCCEEDED`

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift
git commit -m "fix(ios/story): taper une story dans Mes stories ouvre la story tapée, pas toujours la 1re"
```

---

## Task 3: Avatar tap opens the list, not the player

**Files:**
- Test: `apps/ios/MeeshyTests/Unit/Views/StoryTrayMyStoryTapGuardTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift:394-401`

**Interfaces:**
- Consumes: `MyStoryButton.onManageStories: (() -> Void)?` (already exists, always supplied at the one call site, `StoryTrayView.swift:210`).

This is a one-line behavior swap. The codebase's established pattern for
locking down such a specific line of wiring — since there's no ViewInspector
or SwiftUI-hosting test harness in this project — is a "source guard" test
that reads the `.swift` file as text and asserts on its content (see
`apps/ios/MeeshyTests/Unit/Views/ConversationMenuSystemDesignGuardTests.swift`
for the established precedent).

- [ ] **Step 1: Write the failing test**

Create `apps/ios/MeeshyTests/Unit/Views/StoryTrayMyStoryTapGuardTests.swift`:

```swift
import XCTest
@testable import Meeshy

/// Source-analysis guard for the "Ma story" avatar tap behavior.
///
/// Directive user 2026-07-14 : taper l'avatar "Ma story" doit toujours
/// ouvrir la liste de gestion (`MyStoriesView`), jamais lancer la lecture
/// plein écran directement — la lecture directe reste accessible via le
/// menu contextuel ("Voir ma story").
final class StoryTrayMyStoryTapGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_myStoryButton_onTap_hasMyStory_callsOnManageStories_notOnViewMyStory() throws {
        let trayViewSource = try source("Meeshy/Features/Main/Views/StoryTrayView.swift")

        guard let onTapRange = trayViewSource.range(of: "onTap: {") else {
            XCTFail("MyStoryButton doit définir un closure `onTap:`")
            return
        }
        let end = trayViewSource.index(onTapRange.lowerBound, offsetBy: 260, limitedBy: trayViewSource.endIndex)
            ?? trayViewSource.endIndex
        let onTapBlock = String(trayViewSource[onTapRange.lowerBound ..< end])

        guard let hasMyStoryRange = onTapBlock.range(of: "if hasMyStory {"),
              let elseRange = onTapBlock.range(of: "} else {") else {
            XCTFail("Le closure onTap doit contenir `if hasMyStory { ... } else { ... }`. Bloc lu: \(onTapBlock)")
            return
        }
        let hasMyStoryBranch = String(onTapBlock[hasMyStoryRange.upperBound ..< elseRange.lowerBound])

        XCTAssertTrue(
            hasMyStoryBranch.contains("onManageStories?()"),
            "Le tap sur l'avatar « Ma story » doit ouvrir la liste (onManageStories?()), pas lancer la lecture directe. Branche lue: \(hasMyStoryBranch)"
        )
        XCTAssertFalse(
            hasMyStoryBranch.contains("onViewMyStory()"),
            "onViewMyStory() ne doit plus être appelé directement au tap simple — réservé au menu contextuel « Voir ma story »."
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build 2>&1 | tail -30 && xcodebuild test-without-building -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,name=iPhone 16 Pro" -only-testing:MeeshyTests/StoryTrayMyStoryTapGuardTests -derivedDataPath Build 2>&1 | tail -30`
Expected: FAIL — current source has `onViewMyStory()` inside the `if hasMyStory` branch, so `XCTAssertTrue(hasMyStoryBranch.contains("onManageStories?()"))` fails.

- [ ] **Step 3: Write minimal implementation**

In `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`, replace:

```swift
                    onTap: {
                        if hasMyStory {
                            onViewMyStory()
                        } else {
                            viewModel.showStoryComposer = true
                        }
                        HapticFeedback.medium()
                    },
```

with:

```swift
                    onTap: {
                        if hasMyStory {
                            onManageStories?()
                        } else {
                            viewModel.showStoryComposer = true
                        }
                        HapticFeedback.medium()
                    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build 2>&1 | tail -30 && xcodebuild test-without-building -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,name=iPhone 16 Pro" -only-testing:MeeshyTests/StoryTrayMyStoryTapGuardTests -derivedDataPath Build 2>&1 | tail -30`
Expected: PASS

- [ ] **Step 5: Build to confirm the app still compiles as a whole**

Run: `cd apps/ios && xcodegen generate && cd .. && ./apps/ios/meeshy.sh build`
Expected: `BUILD SUCCEEDED`

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift apps/ios/MeeshyTests/Unit/Views/StoryTrayMyStoryTapGuardTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/story): tap avatar « Ma story » ouvre la liste au lieu du player direct"
```

---

## Task 4: "Créer une story" button in `MyStoriesView`

**Files:**
- Test: `apps/ios/MeeshyTests/Unit/Views/MyStoriesCreateStoryGuardTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift:17-23` (struct properties), `:73-79` (toolbar)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift:66-85` (`.sheet` instantiation)

**Interfaces:**
- Produces: `MyStoriesView.onCreateStory: () -> Void` (new required param — every call site must supply it from here on, there is exactly one: `StoryTrayView.swift`).

- [ ] **Step 1: Write the failing test**

Create `apps/ios/MeeshyTests/Unit/Views/MyStoriesCreateStoryGuardTests.swift`:

```swift
import XCTest
@testable import Meeshy

/// Source-analysis guard for the "Créer une story" entry point added to
/// `MyStoriesView`. Directive user 2026-07-14.
final class MyStoriesCreateStoryGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_myStoriesView_declaresOnCreateStoryCallback() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        XCTAssertTrue(
            viewSource.contains("let onCreateStory: () -> Void"),
            "MyStoriesView doit exposer un callback onCreateStory délégué au parent (même pattern que onOpen)."
        )
        XCTAssertTrue(
            viewSource.contains("onCreateStory()"),
            "Le bouton + de la toolbar doit appeler onCreateStory()."
        )
    }

    func test_storyTrayView_wiresOnCreateStory_closingSheetBeforeComposer() throws {
        let traySource = try source("Meeshy/Features/Main/Views/StoryTrayView.swift")

        guard let callbackRange = traySource.range(of: "onCreateStory: {") else {
            XCTFail("StoryTrayView doit fournir onCreateStory: à MyStoriesView")
            return
        }
        let end = traySource.index(callbackRange.lowerBound, offsetBy: 260, limitedBy: traySource.endIndex)
            ?? traySource.endIndex
        let block = String(traySource[callbackRange.lowerBound ..< end])

        XCTAssertTrue(
            block.contains("showMyStories = false"),
            "onCreateStory doit fermer la sheet Mes stories avant de présenter le composer. Bloc lu: \(block)"
        )
        XCTAssertTrue(
            block.contains("viewModel.showStoryComposer = true"),
            "onCreateStory doit finir par ouvrir le composer. Bloc lu: \(block)"
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build -only-testing:MeeshyTests/MyStoriesCreateStoryGuardTests 2>&1 | tail -30`
Expected: FAIL — both assertions fail against current source (no `onCreateStory` anywhere yet).

- [ ] **Step 3: Add the `onCreateStory` param to `MyStoriesView`**

In `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`, replace:

```swift
struct MyStoriesView: View {
    @ObservedObject var viewModel: StoryViewModel
    let userId: String
    @ObservedObject var statusViewModel: StatusViewModel
    /// Ouverture du viewer, gérée par le tray (possède le coordinator).
    let onOpen: (StoryItem) -> Void

    @Environment(\.dismiss) private var dismiss
```

with:

```swift
struct MyStoriesView: View {
    @ObservedObject var viewModel: StoryViewModel
    let userId: String
    @ObservedObject var statusViewModel: StatusViewModel
    /// Ouverture du viewer, gérée par le tray (possède le coordinator).
    let onOpen: (StoryItem) -> Void
    /// Création d'une nouvelle story, gérée par le tray (ferme cette sheet
    /// avant de présenter le composer — évite la course sheet/fullScreenCover).
    let onCreateStory: () -> Void

    @Environment(\.dismiss) private var dismiss
```

- [ ] **Step 4: Add the toolbar button**

In the same file, replace:

```swift
            .navigationTitle(String(localized: "story.mine.title", defaultValue: "Mes stories"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "OK")) { dismiss() }
                }
            }
        }
```

with:

```swift
            .navigationTitle(String(localized: "story.mine.title", defaultValue: "Mes stories"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        onCreateStory()
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                    .accessibilityLabel(String(localized: "story.mine.create", defaultValue: "Créer une story"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "OK")) { dismiss() }
                }
            }
        }
```

- [ ] **Step 5: Wire `onCreateStory` in `StoryTrayView`**

In `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`, replace:

```swift
        .sheet(isPresented: $showMyStories) {
            MyStoriesView(
                viewModel: viewModel,
                userId: AuthManager.shared.currentUser?.id ?? "",
                statusViewModel: statusViewModel,
                onOpen: { story in
                    showMyStories = false
                    let coordinator = storyViewerCoordinator
                    let uid = AuthManager.shared.currentUser?.id ?? ""
                    let postId = story.id
                    // Laisse la sheet se fermer avant le fullScreenCover root
                    // (le coordinator présente au niveau RootView).
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(350))
                        coordinator.present(StoryViewerRequest(
                            id: uid, singleGroup: true, postId: postId))
                    }
                }
            )
        }
```

with:

```swift
        .sheet(isPresented: $showMyStories) {
            MyStoriesView(
                viewModel: viewModel,
                userId: AuthManager.shared.currentUser?.id ?? "",
                statusViewModel: statusViewModel,
                onOpen: { story in
                    showMyStories = false
                    let coordinator = storyViewerCoordinator
                    let uid = AuthManager.shared.currentUser?.id ?? ""
                    let postId = story.id
                    // Laisse la sheet se fermer avant le fullScreenCover root
                    // (le coordinator présente au niveau RootView).
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(350))
                        coordinator.present(StoryViewerRequest(
                            id: uid, singleGroup: true, postId: postId))
                    }
                },
                onCreateStory: {
                    showMyStories = false
                    // Même pattern anti-course que `onOpen` : un .sheet et un
                    // .fullScreenCover actifs en même temps depuis le même
                    // hôte se marchent dessus.
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(350))
                        viewModel.showStoryComposer = true
                    }
                }
            )
        }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build 2>&1 | tail -30 && xcodebuild test-without-building -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,name=iPhone 16 Pro" -only-testing:MeeshyTests/MyStoriesCreateStoryGuardTests -derivedDataPath Build 2>&1 | tail -30`
Expected: PASS (2/2)

- [ ] **Step 7: Build to confirm the app still compiles as a whole**

Run: `cd apps/ios && xcodegen generate && cd .. && ./apps/ios/meeshy.sh build`
Expected: `BUILD SUCCEEDED`

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift apps/ios/MeeshyTests/Unit/Views/MyStoriesCreateStoryGuardTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/story): bouton créer une story depuis la liste Mes stories"
```

---

## Task 5: `StorySelectionResolver` — live-filtered multi-select set

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/StorySelectionResolver.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/StorySelectionResolverTests.swift`

**Interfaces:**
- Produces: `enum StorySelectionResolver { static func liveSelection(selectedIDs: Set<String>, liveIDs: [String]) -> Set<String> }`, used by Task 6.

- [ ] **Step 1: Write the failing test**

Create `apps/ios/MeeshyTests/Unit/Views/StorySelectionResolverTests.swift`:

```swift
import XCTest
@testable import Meeshy

final class StorySelectionResolverTests: XCTestCase {

    func test_liveSelection_allSelectedIDsStillLive_returnsAllOfThem() {
        let result = StorySelectionResolver.liveSelection(
            selectedIDs: ["a", "b"],
            liveIDs: ["a", "b", "c"]
        )
        XCTAssertEqual(result, ["a", "b"])
    }

    func test_liveSelection_oneSelectedIDNoLongerLive_dropsIt() {
        let result = StorySelectionResolver.liveSelection(
            selectedIDs: ["a", "b"],
            liveIDs: ["a", "c"]
        )
        XCTAssertEqual(result, ["a"], "b was removed from the live list (deleted elsewhere) — must be dropped from the selection")
    }

    func test_liveSelection_emptySelection_returnsEmpty() {
        let result = StorySelectionResolver.liveSelection(selectedIDs: [], liveIDs: ["a", "b"])
        XCTAssertTrue(result.isEmpty)
    }

    func test_liveSelection_noneOfSelectionIsLive_returnsEmpty() {
        let result = StorySelectionResolver.liveSelection(selectedIDs: ["x", "y"], liveIDs: ["a", "b"])
        XCTAssertTrue(result.isEmpty)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build -only-testing:MeeshyTests/StorySelectionResolverTests 2>&1 | tail -30`
Expected: FAIL — `cannot find 'StorySelectionResolver' in scope`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/ios/Meeshy/Features/Main/Views/StorySelectionResolver.swift`:

```swift
import Foundation

/// Pure helper keeping a multi-select `Set<String>` in sync with a live list
/// of ids. Selections are never read raw from `@State` — always filtered
/// through `liveSelection` — so an id that vanished mid-selection (real-time
/// deletion from another device, expiry) never inflates a bulk-action count
/// or triggers a doomed network call for a story that's already gone.
enum StorySelectionResolver {
    static func liveSelection(selectedIDs: Set<String>, liveIDs: [String]) -> Set<String> {
        selectedIDs.intersection(Set(liveIDs))
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/ios && xcodebuild test-without-building -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,name=iPhone 16 Pro" -only-testing:MeeshyTests/StorySelectionResolverTests -derivedDataPath Build 2>&1 | tail -30`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StorySelectionResolver.swift apps/ios/MeeshyTests/Unit/Views/StorySelectionResolverTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/story): StorySelectionResolver — sélection multiple filtrée contre la liste vivante"
```

---

## Task 6: Multi-select + bulk delete UI in `MyStoriesView`

**Files:**
- Test: `apps/ios/MeeshyTests/Unit/Views/MyStoriesBulkDeleteGuardTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift` (state, toolbar, row rendering, bottom bar, `bulkDelete()`, `MyStoryRow`)

**Interfaces:**
- Consumes: `StorySelectionResolver.liveSelection(selectedIDs:liveIDs:)` (Task 5), `StoryViewModel.deleteStory(storyId:) async -> Bool` (existing, `StoryViewModel.swift:1603-1625`).

This task is UI wiring (state + row rendering + a confirmation alert), not a
new pure algorithm — `StorySelectionResolver` already carries the one piece
of logic worth unit-testing in isolation. The behavioral contract this task
must satisfy is locked down with a source guard, same pattern as Tasks 3–4.

- [ ] **Step 1: Write the failing test**

Create `apps/ios/MeeshyTests/Unit/Views/MyStoriesBulkDeleteGuardTests.swift`:

```swift
import XCTest
@testable import Meeshy

/// Source-analysis guard for multi-select bulk delete in `MyStoriesView`.
/// Directive user 2026-07-14.
final class MyStoriesBulkDeleteGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_myStoriesView_neverReadsSelectedIDsRaw_outsideItsOwnDeclarationAndToggle() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        XCTAssertTrue(
            viewSource.contains("private var selectedStoryIDs: Set<String>"),
            "MyStoriesView doit exposer selectedStoryIDs (filtré via StorySelectionResolver.liveSelection), pas lire selectedIDs brut ailleurs."
        )
        XCTAssertTrue(
            viewSource.contains("StorySelectionResolver.liveSelection(selectedIDs: selectedIDs, liveIDs: stories.map(\\.id))"),
            "selectedStoryIDs doit être calculé via StorySelectionResolver.liveSelection."
        )
    }

    func test_bulkDelete_reusesExistingDeleteStory_noNewViewModelMethod() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        guard let funcRange = viewSource.range(of: "private func bulkDelete()") else {
            XCTFail("MyStoriesView doit définir bulkDelete()")
            return
        }
        let end = viewSource.index(funcRange.lowerBound, offsetBy: 500, limitedBy: viewSource.endIndex)
            ?? viewSource.endIndex
        let block = String(viewSource[funcRange.lowerBound ..< end])

        XCTAssertTrue(
            block.contains("await viewModel.deleteStory(storyId: id)"),
            "bulkDelete() doit réutiliser StoryViewModel.deleteStory(storyId:) en boucle, pas introduire une nouvelle méthode réseau. Bloc lu: \(block)"
        )
    }

    func test_myStoryRow_selectionCircle_hasAccessibilityLabel() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        XCTAssertTrue(
            viewSource.contains(".accessibilityLabel(isSelected"),
            "Le cercle de sélection doit porter un accessibilityLabel qui change avec isSelected."
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build -only-testing:MeeshyTests/MyStoriesBulkDeleteGuardTests 2>&1 | tail -30`
Expected: FAIL — none of the asserted strings exist in the current source yet.

- [ ] **Step 3: Add selection state and `selectedStoryIDs`**

In `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`, replace:

```swift
    @State private var viewersStory: StoryItem?
    @State private var exportStory: StoryItem?
    @State private var deleteCandidate: StoryItem?
    @State private var isReposting = false
    @StateObject private var exportViewModel = StoryExportShareViewModel()

    private var isDark: Bool { colorScheme == .dark }
    private var accentColor: Color {
        Color(hex: DynamicColorGenerator.colorForName(AuthManager.shared.currentUser?.username ?? ""))
    }

    /// Stories de l'utilisateur, plus récentes d'abord.
    private var stories: [StoryItem] {
        (viewModel.storyGroupForUser(userId: userId)?.stories ?? [])
            .sorted { $0.createdAt > $1.createdAt }
    }
```

with:

```swift
    @State private var viewersStory: StoryItem?
    @State private var exportStory: StoryItem?
    @State private var deleteCandidate: StoryItem?
    @State private var isReposting = false
    @StateObject private var exportViewModel = StoryExportShareViewModel()

    /// Mode sélection multiple (suppression groupée). Directive user 2026-07-14.
    @State private var isSelecting = false
    @State private var selectedIDs: Set<String> = []
    @State private var isBulkDeleteConfirming = false

    private var isDark: Bool { colorScheme == .dark }
    private var accentColor: Color {
        Color(hex: DynamicColorGenerator.colorForName(AuthManager.shared.currentUser?.username ?? ""))
    }

    /// Stories de l'utilisateur, plus récentes d'abord.
    private var stories: [StoryItem] {
        (viewModel.storyGroupForUser(userId: userId)?.stories ?? [])
            .sorted { $0.createdAt > $1.createdAt }
    }

    /// `selectedIDs` filtré contre les stories réellement affichées — une
    /// story supprimée en temps réel (autre appareil) pendant la sélection
    /// disparaît de ce set sans jamais être relue brute.
    private var selectedStoryIDs: Set<String> {
        StorySelectionResolver.liveSelection(selectedIDs: selectedIDs, liveIDs: stories.map(\.id))
    }
```

- [ ] **Step 4: Update row rendering — selection-aware tap, conditional swipe/menu**

In the same file, replace:

```swift
                } else {
                    List {
                        ForEach(stories) { story in
                            MyStoryRow(story: story, accentColor: accentColor, isDark: isDark)
                                .contentShape(Rectangle())
                                .onTapGesture { onOpen(story) }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) { deleteCandidate = story } label: {
                                        Label(String(localized: "common.delete", defaultValue: "Supprimer"),
                                              systemImage: "trash")
                                    }
                                }
                                .contextMenu { actionMenu(for: story) }
                                .listRowBackground(Color.clear)
                        }
                    }
                    .listStyle(.plain)
                }
```

with:

```swift
                } else {
                    List {
                        ForEach(stories) { story in
                            MyStoryRow(
                                story: story,
                                accentColor: accentColor,
                                isDark: isDark,
                                isSelecting: isSelecting,
                                isSelected: selectedStoryIDs.contains(story.id)
                            )
                            .contentShape(Rectangle())
                            .onTapGesture { handleRowTap(story) }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                if !isSelecting {
                                    Button(role: .destructive) { deleteCandidate = story } label: {
                                        Label(String(localized: "common.delete", defaultValue: "Supprimer"),
                                              systemImage: "trash")
                                    }
                                }
                            }
                            .contextMenu {
                                if !isSelecting {
                                    actionMenu(for: story)
                                }
                            }
                            .listRowBackground(Color.clear)
                        }
                    }
                    .listStyle(.plain)
                }
```

- [ ] **Step 5: Add the toolbar toggle and bottom action bar**

In the same file, replace:

```swift
            .navigationTitle(String(localized: "story.mine.title", defaultValue: "Mes stories"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        onCreateStory()
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                    .accessibilityLabel(String(localized: "story.mine.create", defaultValue: "Créer une story"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "OK")) { dismiss() }
                }
            }
        }
```

with:

```swift
            .navigationTitle(String(localized: "story.mine.title", defaultValue: "Mes stories"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        onCreateStory()
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                    .accessibilityLabel(String(localized: "story.mine.create", defaultValue: "Créer une story"))
                }
                if !stories.isEmpty {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            isSelecting.toggle()
                            if !isSelecting { selectedIDs.removeAll() }
                        } label: {
                            Text(isSelecting
                                 ? String(localized: "common.cancel", defaultValue: "Annuler")
                                 : String(localized: "story.mine.select", defaultValue: "Sélectionner"))
                        }
                        .accessibilityLabel(isSelecting
                            ? String(localized: "story.mine.select.cancel", defaultValue: "Annuler la sélection")
                            : String(localized: "story.mine.select", defaultValue: "Sélectionner"))
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "OK")) { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if isSelecting && !selectedStoryIDs.isEmpty {
                    bulkDeleteBar
                }
            }
        }
```

- [ ] **Step 6: Add the bulk-delete confirmation alert**

In the same file, immediately after the existing single-delete `.alert` block (right after its closing `}` — the one with `message: { Text(String(localized: "story.mine.delete.message"...` — and still before the final closing `}` of `var body`), insert:

```swift
        .alert(
            String(localized: "story.mine.delete.selected.title", defaultValue: "Supprimer les stories sélectionnées ?"),
            isPresented: $isBulkDeleteConfirming
        ) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler"), role: .cancel) {}
            Button(String(localized: "common.delete", defaultValue: "Supprimer"), role: .destructive) {
                bulkDelete()
            }
        } message: {
            Text(String(localized: "story.mine.delete.selected.message",
                        defaultValue: "Cette action est définitive. Ces stories ne seront plus visibles par personne."))
        }
```

So the full tail of `var body` reads:

```swift
        } message: {
            Text(String(localized: "story.mine.delete.message",
                        defaultValue: "Cette action est définitive. La story ne sera plus visible par personne."))
        }
        .alert(
            String(localized: "story.mine.delete.selected.title", defaultValue: "Supprimer les stories sélectionnées ?"),
            isPresented: $isBulkDeleteConfirming
        ) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler"), role: .cancel) {}
            Button(String(localized: "common.delete", defaultValue: "Supprimer"), role: .destructive) {
                bulkDelete()
            }
        } message: {
            Text(String(localized: "story.mine.delete.selected.message",
                        defaultValue: "Cette action est définitive. Ces stories ne seront plus visibles par personne."))
        }
    }
```

(the trailing `}` closes `var body: some View`.)

- [ ] **Step 7: Add `handleRowTap`, `bulkDeleteBar`, and `bulkDelete()`**

In the same file, replace:

```swift
    // MARK: Menu

    @ViewBuilder
    private func actionMenu(for story: StoryItem) -> some View {
```

with:

```swift
    // MARK: - Row tap

    private func handleRowTap(_ story: StoryItem) {
        if isSelecting {
            if selectedIDs.contains(story.id) {
                selectedIDs.remove(story.id)
            } else {
                selectedIDs.insert(story.id)
            }
        } else {
            onOpen(story)
        }
    }

    // MARK: - Bulk delete bar

    private var bulkDeleteBar: some View {
        Button {
            isBulkDeleteConfirming = true
        } label: {
            Text(String(localized: "story.mine.delete.selected",
                        defaultValue: "Supprimer (\(selectedStoryIDs.count))"))
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Capsule().fill(MeeshyColors.error))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .accessibilityHint(String(localized: "story.mine.delete.selected.hint",
                                   defaultValue: "Supprime définitivement les stories cochées"))
    }

    // MARK: Menu

    @ViewBuilder
    private func actionMenu(for story: StoryItem) -> some View {
```

Then replace:

```swift
    private func delete(_ story: StoryItem) {
        Task {
            let ok = await viewModel.deleteStory(storyId: story.id)
            await MainActor.run {
                if ok {
                    FeedbackToastManager.shared.showSuccess(
                        String(localized: "story.mine.delete.success", defaultValue: "Story supprimée"))
                } else {
                    FeedbackToastManager.shared.showError(
                        String(localized: "story.mine.delete.error", defaultValue: "Échec de la suppression"))
                }
            }
        }
    }
```

with:

```swift
    private func delete(_ story: StoryItem) {
        Task {
            let ok = await viewModel.deleteStory(storyId: story.id)
            await MainActor.run {
                if ok {
                    FeedbackToastManager.shared.showSuccess(
                        String(localized: "story.mine.delete.success", defaultValue: "Story supprimée"))
                } else {
                    FeedbackToastManager.shared.showError(
                        String(localized: "story.mine.delete.error", defaultValue: "Échec de la suppression"))
                }
            }
        }
    }

    private func bulkDelete() {
        let ids = selectedStoryIDs
        Task {
            var failures = 0
            for id in ids {
                let ok = await viewModel.deleteStory(storyId: id)
                if !ok { failures += 1 }
            }
            await MainActor.run {
                selectedIDs.removeAll()
                isSelecting = false
                if failures == 0 {
                    FeedbackToastManager.shared.showSuccess(
                        String(localized: "story.mine.delete.selected.success", defaultValue: "Stories supprimées"))
                } else {
                    FeedbackToastManager.shared.showError(
                        String(localized: "story.mine.delete.selected.error",
                               defaultValue: "\(failures) suppression(s) ont échoué"))
                }
            }
        }
    }
```

- [ ] **Step 8: Update `MyStoryRow` — selection circle + params**

In the same file, replace:

```swift
private struct MyStoryRow: View {
    let story: StoryItem
    let accentColor: Color
    let isDark: Bool

    /// URL brute (résolue en interne par `CachedAsyncImage` via `MeeshyConfig`).
    private var thumbnailURLString: String? {
        story.media.first?.thumbnailUrl ?? story.media.first?.url
    }

    var body: some View {
        HStack(spacing: 12) {
            thumbnail
            VStack(alignment: .leading, spacing: 4) {
                Text(story.timeAgo)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(isDark ? .white : MeeshyColors.indigo950)
                HStack(spacing: 12) {
                    metric(icon: "eye.fill", value: story.viewCount ?? 0)
                    metric(icon: "heart.fill", value: story.reactionCount)
                    metric(icon: "bubble.left.fill", value: story.commentCount)
                }
            }
            Spacer()
            Image(systemName: "ellipsis")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.secondary)
                .padding(8)
        }
        .padding(.vertical, 4)
    }
```

with:

```swift
private struct MyStoryRow: View {
    let story: StoryItem
    let accentColor: Color
    let isDark: Bool
    var isSelecting: Bool = false
    var isSelected: Bool = false

    /// URL brute (résolue en interne par `CachedAsyncImage` via `MeeshyConfig`).
    private var thumbnailURLString: String? {
        story.media.first?.thumbnailUrl ?? story.media.first?.url
    }

    var body: some View {
        HStack(spacing: 12) {
            if isSelecting {
                selectionCircle
            }
            thumbnail
            VStack(alignment: .leading, spacing: 4) {
                Text(story.timeAgo)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(isDark ? .white : MeeshyColors.indigo950)
                HStack(spacing: 12) {
                    metric(icon: "eye.fill", value: story.viewCount ?? 0)
                    metric(icon: "heart.fill", value: story.reactionCount)
                    metric(icon: "bubble.left.fill", value: story.commentCount)
                }
            }
            Spacer()
            if !isSelecting {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.secondary)
                    .padding(8)
            }
        }
        .padding(.vertical, 4)
    }

    private var selectionCircle: some View {
        Circle()
            .strokeBorder(accentColor, lineWidth: isSelected ? 0 : 1.5)
            .background(Circle().fill(isSelected ? accentColor : Color.clear))
            .overlay {
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .frame(width: 22, height: 22)
            .accessibilityLabel(isSelected
                ? String(localized: "story.mine.selected", defaultValue: "Sélectionné")
                : String(localized: "story.mine.notSelected", defaultValue: "Non sélectionné"))
            .accessibilityAddTraits(.isButton)
    }
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build 2>&1 | tail -30 && xcodebuild test-without-building -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,name=iPhone 16 Pro" -only-testing:MeeshyTests/MyStoriesBulkDeleteGuardTests -derivedDataPath Build 2>&1 | tail -30`
Expected: PASS (3/3)

- [ ] **Step 10: Build to confirm the app still compiles as a whole**

Run: `cd apps/ios && xcodegen generate && cd .. && ./apps/ios/meeshy.sh build`
Expected: `BUILD SUCCEEDED`

- [ ] **Step 11: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift apps/ios/MeeshyTests/Unit/Views/MyStoriesBulkDeleteGuardTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/story): sélection multiple + suppression groupée dans Mes stories"
```

---

## Final Verification

- [ ] **Step 1: Run the full touched-suite test pass**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build 2>&1 | tail -30 && xcodebuild test-without-building -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,name=iPhone 16 Pro" -only-testing:MeeshyTests/StoryThumbnailSizingTests -only-testing:MeeshyTests/StoryIndexResolverTests -only-testing:MeeshyTests/StoryTrayMyStoryTapGuardTests -only-testing:MeeshyTests/MyStoriesCreateStoryGuardTests -only-testing:MeeshyTests/StorySelectionResolverTests -only-testing:MeeshyTests/MyStoriesBulkDeleteGuardTests -derivedDataPath Build 2>&1 | tail -60`
Expected: all 6 suites green.

- [ ] **Step 2: Full app build**

Run: `cd apps/ios && xcodegen generate && cd .. && ./apps/ios/meeshy.sh build`
Expected: `BUILD SUCCEEDED`, no new warnings introduced by the 6 tasks.

- [ ] **Step 3: Manual smoke test on simulator**

Run: `./apps/ios/meeshy.sh run`, then:
1. Tap own avatar in the story tray → `MyStoriesView` opens (list, not player).
2. Tap the "+" → composer opens (list sheet closes first, no visual glitch).
3. Tap a story row (not the first one) → viewer opens on that exact story, then swipes forward through the rest.
4. Tap "Sélectionner" → circles appear, tap 2 rows, bottom bar shows "Supprimer (2)" → confirm → both rows disappear, one success toast.
5. Confirm thumbnails of a portrait vs. a near-square story visibly differ in width.

## Self-Review Notes

- **Spec coverage:** All 5 spec changes map 1:1 to Task 1 (thumbnails), Task 2 (index fix), Task 3 (entry point), Task 4 (create button), Tasks 5–6 (multi-select). The 3 review-driven corrections are implemented in: index-0 documentation → Task 2 Step 3's doc comment (plus the dedicated resolver test); `selectedStoryIDs` live filter → Task 6 Step 3; accessibility labels (toggle + selection circle) → Task 6 Steps 5 and 8.
- **Placeholder scan:** no TBD/TODO; every step has complete code.
- **Type consistency:** `StoryThumbnailSizing.width(forAspectRatio:height:)` used identically in Task 1 Step 6 and nowhere redefined; `StoryIndexResolver.index(forPostId:in:fallback:)` used identically in Task 2 Step 6; `StorySelectionResolver.liveSelection(selectedIDs:liveIDs:)` used identically in Task 6 Step 3; `MyStoriesView.onCreateStory: () -> Void` matches its Task 4 Step 5 call site.
- **Deviation from spec, intentional:** the spec's section 4 sketch used a raw `.swipeActions`/`.contextMenu` wrapped in "a modifier — TBD" comment; this plan resolves it as inline `if !isSelecting { … }` inside the existing modifiers rather than introducing a new `ViewModifier` type, per "no premature abstraction."
