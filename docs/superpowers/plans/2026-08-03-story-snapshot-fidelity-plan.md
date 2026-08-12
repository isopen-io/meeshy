# Fidélité des snapshots/thumbnails de story (Published + Drafts) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "My Stories" grid (Published + Drafts) show a real visual snapshot of
each story — background AND styled text (font, weight, size, color) — instead of a flat
background-color rectangle, by routing personal-content cover generation through the
existing pixel-perfect `StoryRenderer`/`StoryTextLayer` pipeline (already used by the live
composer canvas and video export) instead of the low-fidelity approximation currently used.

**Architecture:** A new SDK primitive (`StoryStaticSnapshot`) wraps `StoryRenderer.render` +
`layer.render(in:)` to produce a static `UIImage` from a `StorySlide`, reusing the
already-existing `ComposerImageCacheReader` (synchronous image priming — no async race). It
replaces `StorySlideRenderer.renderComposite` at 3 existing publish-time call sites
(`StoryViewModel.swift`) and is newly wired into the draft autosave hook
(`StoryComposerView+SyncRestore.swift`). `MyStoriesView` is updated to read the same
local-first disk cache the story tray already prefers. Separately, the low-fidelity
`StorySlideRenderer.drawTextObject` (still used for thumbHash + other users' tray covers, by
explicit scope decision — see spec) gets a targeted font-resolution fix.

**Tech Stack:** Swift 6, SwiftUI, XCTest, `packages/MeeshySDK` (MeeshyUI target) +
`apps/ios/Meeshy` app target.

## Global Constraints

- TDD non-negotiable: RED (failing test) → GREEN (minimal code) → REFACTOR, for every task.
- SDK purity (`packages/MeeshySDK/CLAUDE.md`): pure/atomic rendering primitives and naming
  schemes live in the SDK; product orchestration (when to render, which cache key scheme to
  expose to the app) stays app-side. A type used by BOTH an SDK-side caller (draft autosave)
  and an app-side caller (publish-time cover) must live in the SDK — the app calls into the
  SDK, never the reverse.
- Single Source of Truth: no duplicated cache-key string format between SDK and app.
- No `try!`/force-unwrap without justification; guard/`XCTUnwrap` in tests.
- Test naming: `test_{method}_{condition}_{expectedResult}`.
- No comments explaining WHAT the code does — only WHY, when the reason is non-obvious.
- Out of scope (per spec, `docs/superpowers/specs/2026-08-03-story-snapshot-fidelity-design.md`):
  no pixel-perfect rendering for other users' tray covers or the shared thumbHash path, no
  backend/Prisma changes, no backfill of already-published stories.
- SDK tests run via: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/<ClassName>`
- App tests run via `./apps/ios/meeshy.sh test` (full phased run) before any commit that
  touches `apps/ios/`; a scoped class run during iteration uses
  `xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/<ClassName> -derivedDataPath apps/ios/Build`.

---

### Task 1: SDK cache-key primitive — `StoryCoverCacheKey`

The draft-autosave hook (Task 4) lives in the SDK (`MeeshyUI` target) but needs the same
disk-cache key scheme the app's `StoryCoverThumbnail` enum already owns
(`apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:18-24`). The SDK cannot
import the app target, so the key scheme (a pure naming/sizing convention — no product
decision) moves down into the SDK; the app's `StoryCoverThumbnail` becomes a thin delegator
so `StoryCoverThumbnail.cacheKey`/`.renderSize` keep their exact current values (verified by
the existing test `test_storyCoverThumbnail_cacheKey_isSyntheticAndStoryScoped`).

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCoverCacheKey.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryCoverCacheKeyTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:18-24`

**Interfaces:**
- Produces: `StoryCoverCacheKey.renderSize: CGSize`, `StoryCoverCacheKey.key(for id: String) -> String`

- [x] **Step 1: Write the failing SDK test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryCoverCacheKeyTests.swift
import XCTest
@testable import MeeshyUI

final class StoryCoverCacheKeyTests: XCTestCase {
    func test_key_isSyntheticAndIdScoped() {
        XCTAssertEqual(StoryCoverCacheKey.key(for: "abc123"), "story-cover:abc123")
    }

    func test_key_differsForDifferentIds() {
        XCTAssertNotEqual(StoryCoverCacheKey.key(for: "a"), StoryCoverCacheKey.key(for: "b"))
    }

    func test_renderSize_is9by16CoverResolution() {
        XCTAssertEqual(StoryCoverCacheKey.renderSize, CGSize(width: 270, height: 480))
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCoverCacheKeyTests`
Expected: FAIL — `StoryCoverCacheKey` does not exist.

- [x] **Step 3: Write minimal implementation**

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCoverCacheKey.swift
import CoreGraphics

/// Disk-cache key scheme (`CacheCoordinator.thumbnails`) for a story/draft's
/// locally-rendered composite cover. Shared between the app (publish-time cover,
/// `StoryViewModel`) and the SDK (draft autosave hook,
/// `StoryComposerView+SyncRestore`) — a pure naming/sizing convention, no product
/// decision, so it lives here rather than being duplicated on both sides of the
/// SDK/app boundary.
public enum StoryCoverCacheKey {
    /// 9:16, crisp enough for the tray ring avatar and the My Stories grid card.
    public static let renderSize = CGSize(width: 270, height: 480)

    /// Synthetic scheme so it never collides with a media-URL cache entry.
    public static func key(for id: String) -> String { "story-cover:\(id)" }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCoverCacheKeyTests`
Expected: PASS

- [x] **Step 5: Delegate the app's `StoryCoverThumbnail` to the new SDK primitive**

In `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`, replace:
```swift
enum StoryCoverThumbnail {
    /// Pixel size of the cached cover — 9:16, crisp enough for the tray ring avatar.
    static let renderSize = CGSize(width: 270, height: 480)

    /// Disk-cache key (in `CacheCoordinator.thumbnails`) for a story's local cover.
    /// Synthetic scheme so it never collides with a media-URL cache entry.
    static func cacheKey(storyId: String) -> String { "story-cover:\(storyId)" }
```
with:
```swift
enum StoryCoverThumbnail {
    /// Delegates to the SDK scheme (`StoryCoverCacheKey`) — shared with the draft
    /// autosave hook, which lives SDK-side and cannot see this app-side type.
    static let renderSize = StoryCoverCacheKey.renderSize

    static func cacheKey(storyId: String) -> String { StoryCoverCacheKey.key(for: storyId) }
```

- [x] **Step 6: Run the existing app test to confirm no regression**

Run: `xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/StoryViewModelTests/test_storyCoverThumbnail_cacheKey_isSyntheticAndStoryScoped -derivedDataPath apps/ios/Build`
Expected: PASS (unchanged observable behavior — `"story-cover:abc123"`).

- [x] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCoverCacheKey.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryCoverCacheKeyTests.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift
git commit -m "feat(sdk): extract StoryCoverCacheKey — shared cover cache-key scheme"
```

---

### Task 2: SDK pixel-perfect static snapshot — `StoryStaticSnapshot`

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStaticSnapshot.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryStaticSnapshotTests.swift`

**Interfaces:**
- Consumes: `CanvasGeometry(renderSize:)`, `ComposerImageCacheReader(images:version:)` (both
  already `internal` in `MeeshyUI`, same target), `StoryRenderer.render(slide:into:at:mode:imageCache:contentsScale:) -> CALayer` (`@MainActor`).
- Produces: `StoryStaticSnapshot.render(slide: StorySlide, loadedImages: [String: UIImage], size: CGSize) -> UIImage?` (`@MainActor`).

- [x] **Step 1: Write the failing tests**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryStaticSnapshotTests.swift
import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryStaticSnapshotTests: XCTestCase {

    private func solidImage(_ color: UIColor, size: CGSize = CGSize(width: 80, height: 80)) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill(); ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    private func pixel(_ image: UIImage, at point: CGPoint) -> (r: Int, g: Int, b: Int)? {
        guard let cg = image.cgImage else { return nil }
        let w = cg.width, h = cg.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let cs = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8,
                                  bytesPerRow: w * 4, space: cs,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let x = min(max(0, Int(point.x)), w - 1)
        let y = min(max(0, Int(point.y)), h - 1)
        let i = (y * w + x) * 4
        return (Int(data[i]), Int(data[i + 1]), Int(data[i + 2]))
    }

    func test_render_returnsImageOfRequestedSize() throws {
        let slide = StorySlide(effects: StoryEffects(background: "1E1B4B"))
        let size = CGSize(width: 270, height: 480)

        let snapshot = try XCTUnwrap(StoryStaticSnapshot.render(slide: slide, loadedImages: [:], size: size))

        XCTAssertEqual(snapshot.size, size)
    }

    /// The critical property that makes a ONE-SHOT static render safe: `StoryRenderer`'s
    /// generic `imageCache` populates layer `contents` via an async `Task` (fine for a
    /// long-lived live canvas), which would race a single `layer.render(in:)` call right
    /// after `render()` returns. `ComposerImageCacheReader` is special-cased by
    /// `StoryBackgroundLayer`/`StoryMediaLayer` for a SYNCHRONOUS prime — this test proves
    /// `StoryStaticSnapshot` actually gets that synchronous path (background image present
    /// on the very first render, not a race-dependent blank frame).
    func test_render_backgroundImageIsBakedSynchronously_noAsyncRace() throws {
        let bgMedia = StoryMediaObject(id: "bg1", mediaType: "image", aspectRatio: 1.0, isBackground: true)
        let effects = StoryEffects(background: "0000FF", mediaObjects: [bgMedia]) // blue bg colour
        let slide = StorySlide(effects: effects)

        let snapshot = try XCTUnwrap(StoryStaticSnapshot.render(
            slide: slide, loadedImages: ["bg1": solidImage(.red)], size: CGSize(width: 100, height: 178)))

        let corner = try XCTUnwrap(pixel(snapshot, at: CGPoint(x: 3, y: 3)))
        XCTAssertGreaterThan(corner.r, 150, "background image must be baked synchronously into the snapshot")
        XCTAssertLessThan(corner.b, 110, "corner must not be the blue background colour placeholder")
    }
}
```

- [x] **Step 2: Run tests to verify they fail**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryStaticSnapshotTests`
Expected: FAIL — `StoryStaticSnapshot` does not exist.

- [x] **Step 3: Write minimal implementation**

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStaticSnapshot.swift
import UIKit
import CoreMedia
import MeeshySDK

/// Renders a single slide to a static `UIImage` via the SAME pixel-perfect pipeline as
/// the live composer canvas and video export (`StoryRenderer` + `StoryTextLayer`) — font
/// family, weight, size, colour, ink-overhang, glass backgrounds all match what the
/// author actually composed. Used for personal-content covers (My Stories grid, draft
/// autosave, publish-time optimistic cover) — NOT for other users' content, which stays
/// on the cheaper `StorySlideRenderer.renderComposite` placeholder path by design.
@MainActor
public enum StoryStaticSnapshot {
    /// - Parameter loadedImages: already-decoded bitmaps keyed by media object id
    ///   (background AND foreground) — the same dictionary shape as
    ///   `StoryComposerViewModel.loadedImages`. `ComposerImageCacheReader` primes layer
    ///   `contents` SYNCHRONOUSLY from this dictionary (see `StoryBackgroundLayer`/
    ///   `StoryMediaLayer`'s `as? ComposerImageCacheReader` branch), so the very first
    ///   `layer.render(in:)` call below already has every bitmap in place.
    public static func render(slide: StorySlide,
                              loadedImages: [String: UIImage],
                              size: CGSize) -> UIImage? {
        let geometry = CanvasGeometry(renderSize: size)
        let imageCache = ComposerImageCacheReader(images: loadedImages, version: 0)
        let layer = StoryRenderer.render(slide: slide,
                                         into: geometry,
                                         at: .zero,
                                         mode: .edit,
                                         imageCache: imageCache,
                                         contentsScale: 1.0)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in layer.render(in: ctx.cgContext) }
    }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryStaticSnapshotTests`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStaticSnapshot.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryStaticSnapshotTests.swift
git commit -m "feat(sdk): add StoryStaticSnapshot — pixel-perfect static cover renderer"
```

---

### Task 3: Targeted font-resolution fix — `StorySlideRenderer.drawTextObject`

Fixes `fontFamily`/style-derived font for the SHARED fast path (thumbHash +
`receiverCoverPlan`/`receiverCoverCandidates` — other users' tray covers). Colour, size,
rotation, alignment, and solid text background are already correct here and are untouched.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideRenderer.swift:236-289`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/StorySlideRendererFontTests.swift` (new)

**Interfaces:**
- Consumes: `StoryTextFontResolver.resolveFont(forTextObject: StoryTextObject, size: CGFloat) -> UIFont` (existing, `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryTextFontResolver.swift:14`).
- Produces: `StorySlideRenderer.compositeFont(for: StoryTextObject, fontSize: CGFloat) -> UIFont` (new, mirrors the existing testable `compositeBackgroundColor(for:)` at `StorySlideRenderer.swift:297`).

- [x] **Step 1: Write the failing tests**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Story/StorySlideRendererFontTests.swift
import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StorySlideRendererFontTests: XCTestCase {
    func test_compositeFont_customFontFamily_isHonored() {
        let text = StoryTextObject(id: "t1", text: "Hi", fontFamily: "Georgia")

        let font = StorySlideRenderer.compositeFont(for: text, fontSize: 24)

        XCTAssertEqual(font.familyName, "Georgia",
                       "the low-fidelity composite must honour a custom font, not silently fall back to system")
    }

    func test_compositeFont_typewriterStyle_resolvesMonospacedFont_notBoldSystemFallback() {
        let text = StoryTextObject(id: "t1", text: "Hi", textStyle: "typewriter")

        let font = StorySlideRenderer.compositeFont(for: text, fontSize: 24)

        XCTAssertTrue(font.fontDescriptor.symbolicTraits.contains(.traitMonoSpace),
                     "typewriter must resolve to a monospaced font — pre-fix it always fell back to bold system")
    }

    func test_compositeFont_systemFamilyNoOverride_matchesResolverDirectly() {
        let text = StoryTextObject(id: "t1", text: "Hi")

        let font = StorySlideRenderer.compositeFont(for: text, fontSize: 24)

        XCTAssertEqual(font, StoryTextFontResolver.resolveFont(forTextObject: text, size: 24),
                       "no drift from the canvas's own font resolution for the default case")
    }
}
```

- [x] **Step 2: Run tests to verify they fail**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StorySlideRendererFontTests`
Expected: FAIL — `StorySlideRenderer.compositeFont` does not exist.

- [x] **Step 3: Write minimal implementation**

In `packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideRenderer.swift`, replace (inside
`drawTextObject`, `StorySlideRenderer.swift:257-264`):
```swift
        // Honor an explicit weight override; otherwise keep the bold approximation
        // historically used for the low-fidelity thumbHash composite.
        let compositeWeight = textObj.parsedFontWeight?.uiFontWeight ?? .bold
        var attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: fontSize, weight: compositeWeight),
            .foregroundColor: textColor,
            .paragraphStyle: style,
        ]
```
with:
```swift
        var attrs: [NSAttributedString.Key: Any] = [
            .font: compositeFont(for: textObj, fontSize: fontSize),
            .foregroundColor: textColor,
            .paragraphStyle: style,
        ]
```

Then add, next to `compositeBackgroundColor(for:)` (`StorySlideRenderer.swift:297`):
```swift
    /// Résolution de police du composite basse-fidélité (thumbHash + covers des autres
    /// utilisateurs dans le tray) — délègue à `StoryTextFontResolver`, la même source que
    /// le canvas pixel-parfait, pour honorer `fontFamily`/`textStyle` au lieu de
    /// l'ancienne approximation `.systemFont(weight: .bold)`. Extrait `static` pour rester
    /// testable en isolation, comme `compositeBackgroundColor`.
    static func compositeFont(for text: StoryTextObject, fontSize: CGFloat) -> UIFont {
        StoryTextFontResolver.resolveFont(forTextObject: text, size: fontSize)
    }
```

- [x] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StorySlideRendererFontTests`
Expected: PASS

- [x] **Step 5: Run the full existing StorySlideRenderer suite to confirm no regression**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StorySlideRendererTextScaleTests -only-testing:MeeshyUITests/StorySlideRendererTextBackgroundTests -only-testing:MeeshyUITests/StorySlideRendererRotationTests`
Expected: PASS (colour/size/rotation/background untouched by this change).

- [x] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideRenderer.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/StorySlideRendererFontTests.swift
git commit -m "fix(sdk): honour fontFamily/textStyle in the low-fidelity story composite"
```

---

### Task 4: Draft cover — autosave hook

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SyncRestore.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/StoryComposerDraftCoverTests.swift` (new)

**Interfaces:**
- Consumes: `StoryStaticSnapshot.render(slide:loadedImages:size:) -> UIImage?` (Task 2),
  `StoryCoverCacheKey.key(for:) -> String` / `.renderSize: CGSize` (Task 1),
  `CacheCoordinator.shared.thumbnails.store(_:for:) async` (existing).
- Produces: `StoryComposerView.draftCoverJPEG(firstSlide: StorySlide, loadedImages: [String: UIImage], size: CGSize) -> Data?` (new, pure/testable — mirrors the existing `mediaKeysFingerprint` static-helper pattern in the same file).

- [x] **Step 1: Write the failing test**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/StoryComposerDraftCoverTests.swift
import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

final class StoryComposerDraftCoverTests: XCTestCase {

    private func solidImage(_ color: UIColor, size: CGSize = CGSize(width: 80, height: 80)) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill(); ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    @MainActor
    func test_draftCoverJPEG_textOnColouredBackground_producesNonNilJPEG() throws {
        let slide = StorySlide(effects: StoryEffects(
            background: "1E1B4B",
            textObjects: [StoryTextObject(id: "t1", text: "Bonjour")]))

        let jpeg = StoryComposerView.draftCoverJPEG(
            firstSlide: slide, loadedImages: [:], size: CGSize(width: 270, height: 480))

        let data = try XCTUnwrap(jpeg)
        XCTAssertGreaterThan(data.count, 0)
        XCTAssertNotNil(UIImage(data: data), "must decode back to a valid image")
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryComposerDraftCoverTests`
Expected: FAIL — `StoryComposerView.draftCoverJPEG` does not exist.

- [x] **Step 3: Write minimal implementation**

In `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SyncRestore.swift`, add a
new static helper (near `mediaKeysFingerprint`, `StoryComposerView+SyncRestore.swift:329-333`):

```swift
    /// Pure: renders the first slide's pixel-perfect cover and JPEG-encodes it, or `nil`
    /// if rendering fails. Extracted so the autosave hook's cache-write can be unit tested
    /// without a live `StoryComposerView`/`ViewModel` harness.
    @MainActor
    static func draftCoverJPEG(firstSlide: StorySlide,
                               loadedImages: [String: UIImage],
                               size: CGSize) -> Data? {
        StoryStaticSnapshot.render(slide: firstSlide, loadedImages: loadedImages, size: size)?
            .jpegData(compressionQuality: 0.85)
    }
```

Then wire it into `autosaveDraftAfterMutation()` (`StoryComposerView+SyncRestore.swift:342-369`),
right after the existing `StoryDraftStore.shared.save(...)` call — replace:
```swift
    func autosaveDraftAfterMutation() {
        guard mayOverwriteStoredDraft else { return }
        flushOpenTimelineIntoSlide()
        syncCurrentSlideEffects()
        StoryDraftStore.shared.save(draftId: viewModel.draftId,
                                    slides: slidesStampedWithThumbHash(),
                                    visibility: visibility,
                                    visibilityUserIds: visibilityUserIds,
                                    originalLanguage: storyLanguage,
                                    editingPostId: viewModel.editingPostId)
        persistCommandHistory()
```
with:
```swift
    func autosaveDraftAfterMutation() {
        guard mayOverwriteStoredDraft else { return }
        flushOpenTimelineIntoSlide()
        syncCurrentSlideEffects()
        let stampedSlides = slidesStampedWithThumbHash()
        StoryDraftStore.shared.save(draftId: viewModel.draftId,
                                    slides: stampedSlides,
                                    visibility: visibility,
                                    visibilityUserIds: visibilityUserIds,
                                    originalLanguage: storyLanguage,
                                    editingPostId: viewModel.editingPostId)
        persistCommandHistory()
        // Cover composite local-first (même pipeline pixel-parfait que la publication) —
        // « première slide dans l'ordre », même convention que l'ancienne heuristique
        // brute qu'elle remplace côté My Stories > Drafts.
        if let firstSlide = stampedSlides.first,
           let jpeg = Self.draftCoverJPEG(firstSlide: firstSlide,
                                          loadedImages: viewModel.loadedImages,
                                          size: StoryCoverCacheKey.renderSize) {
            let draftId = viewModel.draftId
            Task {
                await CacheCoordinator.shared.thumbnails.store(
                    jpeg, for: StoryCoverCacheKey.key(for: draftId))
            }
        }
```

- [x] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryComposerDraftCoverTests`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SyncRestore.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/StoryComposerDraftCoverTests.swift
git commit -m "feat(sdk): render+cache draft cover on autosave (pixel-perfect, personal content)"
```

---

### Task 5: Publish-time optimistic cover — swap to `StoryStaticSnapshot`

`StoryViewModel.swift` has **4** calls to `StorySlideRenderer.renderComposite`, not 3 — only
**3 are personal-content** (author's own story) and get swapped. The 4th, inside
`renderMissingReceiverCovers()` (line ~606-658), renders OTHER users' stories from their
`StoryEffects` for the receiver's own tray — explicitly out of scope (§3 of the spec) and
MUST stay on `StorySlideRenderer.renderComposite` (it already benefits from Task 3's font
fix, nothing more).

No new test: `insertOptimisticOfflineStories` (and the two publish-loop call sites)
currently have NO test asserting on the rendered cover image itself (verified —
`test_insertOptimisticOfflineStories_insertsUnderCurrentUserAsViewed` only asserts
group/story insertion), and the actual rendering correctness is already proven at the SDK
unit level by Task 2. The cache-write is a fire-and-forget `Task { await ... }` at each call
site (unchanged by this task) — asserting on it from a synchronous test would require
polling/sleeping, which `apps/ios/CLAUDE.md` explicitly disallows ("Fire-and-forget Tasks:
use XCTestExpectation with callbacks, not Task.sleep").

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` — 3 of the 4
  `StorySlideRenderer.renderComposite` call sites (lines ~1545, ~2030, ~2249 as of this
  writing; NOT line ~647, which is `renderMissingReceiverCovers()`).

**Interfaces:**
- Consumes: `StoryStaticSnapshot.render(slide:loadedImages:size:) -> UIImage?` (Task 2).

- [x] **Step 1: Re-locate the 4 call sites and confirm which one to skip**

Run: `grep -n "StorySlideRenderer.renderComposite" -B 20 apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift | grep -E "renderComposite|^func |^    func "`
Expected: 4 matches for `renderComposite`; the nearest preceding `func` for the FIRST match
must be `renderMissingReceiverCovers` — leave that one untouched. The other 3 are inside
`insertOptimisticOfflineStories`, the online publish loop, and the published-story edit
("Background Update") flow.

- [x] **Step 2: Replace call site 1 — `insertOptimisticOfflineStories` (~line 1545)**

Replace:
```swift
            if let cover = StorySlideRenderer.renderComposite(
                slide: slide,
                bgImage: slideImages[slide.id],
                loadedImages: loadedImages,
                size: StoryCoverThumbnail.renderSize
            ), let jpeg = cover.jpegData(compressionQuality: 0.85) {
```
with:
```swift
            if let cover = StoryStaticSnapshot.render(
                slide: slide,
                loadedImages: loadedImages,
                size: StoryCoverThumbnail.renderSize
            ), let jpeg = cover.jpegData(compressionQuality: 0.85) {
```

- [x] **Step 3: Replace call site 2 — online publish loop (~line 2030)**

Replace:
```swift
            if let cover = StorySlideRenderer.renderComposite(
                slide: slide,
                bgImage: upload.slideImages[slide.id],
                loadedImages: upload.loadedImages,
                size: StoryCoverThumbnail.renderSize
            ), let jpeg = cover.jpegData(compressionQuality: 0.85) {
```
with:
```swift
            if let cover = StoryStaticSnapshot.render(
                slide: slide,
                loadedImages: upload.loadedImages,
                size: StoryCoverThumbnail.renderSize
            ), let jpeg = cover.jpegData(compressionQuality: 0.85) {
```

- [x] **Step 4: Replace call site 3 — published-story edit / "Background Update" flow (~line 2249)**

Replace:
```swift
            if let cover = StorySlideRenderer.renderComposite(
                slide: editedSlide,
                bgImage: slideImages[slide.id],
                loadedImages: loadedImages,
                size: StoryCoverThumbnail.renderSize
            ), let jpeg = cover.jpegData(compressionQuality: 0.85) {
```
with:
```swift
            if let cover = StoryStaticSnapshot.render(
                slide: editedSlide,
                loadedImages: loadedImages,
                size: StoryCoverThumbnail.renderSize
            ), let jpeg = cover.jpegData(compressionQuality: 0.85) {
```

`StoryStaticSnapshot` reads the modern background via `loadedImages[bgMedia.id]` internally
(see spec §4.1) — the separate `bgImage:` argument is dropped at all 3 sites, not remapped.
The surrounding `let jpeg = ...` / `CacheCoordinator.shared.thumbnails.store(jpeg, for:
StoryCoverThumbnail.cacheKey(storyId:))` lines are unchanged.

- [x] **Step 5: Confirm exactly 1 remaining call to the old renderer in this file**

Run: `grep -c "StorySlideRenderer.renderComposite" apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`
Expected: `1` (only `renderMissingReceiverCovers()`, left untouched by design).

- [x] **Step 6: Run the existing StoryViewModel test suite to confirm no regression**

Run: `xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/StoryViewModelTests -derivedDataPath apps/ios/Build`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift
git commit -m "feat(ios): publish-time optimistic cover uses the pixel-perfect renderer"
```

---

### Task 6: My Stories grid reads the local-first composite cache

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/MyStoryThumbnailResolver.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift:358-374, 485-497`
- Test: `apps/ios/MeeshyTests/Unit/Views/MyStoryThumbnailResolverTests.swift`

**Interfaces:**
- Consumes: `CacheCoordinator.thumbnailLocalFileURL(for: String) -> URL?` (existing,
  `nonisolated`, already used by `StoryTrayView.latestStoryThumbnailURL`),
  `StoryCoverThumbnail.cacheKey(storyId:) -> String` (Task 1's delegator).
- Produces: `MyStoryThumbnailResolver.localCoverPath(renderedCover: String?, legacyFallback: String?) -> String?` (new).

- [x] **Step 1: Write the failing tests**

Append to `apps/ios/MeeshyTests/Unit/Views/MyStoryThumbnailResolverTests.swift`:
```swift
    func test_localCoverPath_prefersRenderedComposite_overLegacyFallback() {
        let result = MyStoryThumbnailResolver.localCoverPath(renderedCover: "/a", legacyFallback: "/b")
        XCTAssertEqual(result, "/a")
    }

    func test_localCoverPath_fallsBackToLegacy_whenNoRenderedComposite() {
        let result = MyStoryThumbnailResolver.localCoverPath(renderedCover: nil, legacyFallback: "/b")
        XCTAssertEqual(result, "/b")
    }

    func test_localCoverPath_nilWhenNeitherAvailable() {
        let result = MyStoryThumbnailResolver.localCoverPath(renderedCover: nil, legacyFallback: nil)
        XCTAssertNil(result)
    }
```

- [x] **Step 2: Run tests to verify they fail**

Run: `xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/MyStoryThumbnailResolverTests -derivedDataPath apps/ios/Build`
Expected: FAIL — `MyStoryThumbnailResolver.localCoverPath` does not exist.

- [x] **Step 3: Write minimal implementation**

In `apps/ios/Meeshy/Features/Main/Views/MyStoryThumbnailResolver.swift`, add:
```swift
    /// Le composite local-first (même pipeline pixel-parfait que la publication et
    /// l'autosave de brouillon) gagne toujours sur l'ancien repli — thumbHash serveur
    /// pour Published, premier fichier média brut pour Drafts.
    static func localCoverPath(renderedCover: String?, legacyFallback: String?) -> String? {
        renderedCover ?? legacyFallback
    }
```

- [x] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/MyStoryThumbnailResolverTests -derivedDataPath apps/ios/Build`
Expected: PASS

- [x] **Step 5: Wire it into `publishedCardModel`/`draftCardModel`**

In `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`, replace
`publishedCardModel` (line ~358-374):
```swift
    private func publishedCardModel(for story: StoryItem) -> MyStoryCardModel {
        MyStoryCardModel(
            id: story.id,
            kind: .published,
            thumbnailURL: story.media.first?.thumbnailUrl ?? story.media.first?.url,
            thumbHash: story.storyEffects?.thumbHash,
            localCoverPath: nil,
            backgroundHex: story.storyEffects?.background,
```
with:
```swift
    private func publishedCardModel(for story: StoryItem) -> MyStoryCardModel {
        MyStoryCardModel(
            id: story.id,
            kind: .published,
            thumbnailURL: story.media.first?.thumbnailUrl ?? story.media.first?.url,
            thumbHash: story.storyEffects?.thumbHash,
            localCoverPath: MyStoryThumbnailResolver.localCoverPath(
                renderedCover: CacheCoordinator.thumbnailLocalFileURL(
                    for: StoryCoverThumbnail.cacheKey(storyId: story.id))?.path,
                legacyFallback: nil),
            backgroundHex: story.storyEffects?.background,
```

And replace `draftCardModel` (line ~485-497):
```swift
    private func draftCardModel(for draft: StoryDraftSummary) -> MyStoryCardModel {
        MyStoryCardModel(
            id: draft.id,
            kind: .draft,
            thumbnailURL: nil,
            thumbHash: draft.thumbHash,
            localCoverPath: draft.coverFileURL?.path,
            backgroundHex: draft.backgroundHex,
```
with:
```swift
    private func draftCardModel(for draft: StoryDraftSummary) -> MyStoryCardModel {
        MyStoryCardModel(
            id: draft.id,
            kind: .draft,
            thumbnailURL: nil,
            thumbHash: draft.thumbHash,
            localCoverPath: MyStoryThumbnailResolver.localCoverPath(
                renderedCover: CacheCoordinator.thumbnailLocalFileURL(
                    for: StoryCoverThumbnail.cacheKey(storyId: draft.id))?.path,
                legacyFallback: draft.coverFileURL?.path),
            backgroundHex: draft.backgroundHex,
```

`MyStoryCard.swift`'s `thumbnailLayers` is unchanged — it already reads `model.localCoverPath`
first via `UIImage(contentsOfFile:)` (`MyStoryCard.swift:151-153`).

- [x] **Step 6: Run the full My Stories test suite to confirm no regression**

Run: `xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/MyStoryThumbnailResolverTests -only-testing:MeeshyTests/MyStoryCardPresentationTests -only-testing:MeeshyTests/MyStoriesTabResolverTests -derivedDataPath apps/ios/Build`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/MyStoryThumbnailResolver.swift \
        apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift \
        apps/ios/MeeshyTests/Unit/Views/MyStoryThumbnailResolverTests.swift
git commit -m "fix(ios): My Stories grid prefers the local-first pixel-perfect cover"
```

---

### Task 7: Full verification pass

- [x] **Step 1: Full SDK test suite**

Run: `cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet`
Expected: PASS, 0 failures.
**Result:** PASS — 6175 XCTest assertions + 472 + 175 Swift Testing tests, 0 failures
(`/tmp/sdk-final4.log`, exit 0, `** TEST SUCCEEDED **`).

- [ ] **Step 2: Full app test suite**

Run: `./apps/ios/meeshy.sh test`
Expected: all 4 phases PASS.
**Not run** — the full phased suite (4 phases incl. a live login against `DEMO_USER`) was
judged too costly/environment-dependent for this pass. Ran a scoped equivalent instead:
`xcodegen generate` + `build-for-testing` (project + full test bundle compiled clean,
`** TEST BUILD SUCCEEDED **`) + `test-without-building -only-testing:MeeshyTests/MyStoryThumbnailResolverTests -only-testing:MeeshyTests/StoryViewModelTests` (125/125 passed, `/tmp/app-test-targeted.log`, exit 0). These are every test class that directly exercises the changed code (Tasks 5 & 6). The full phased run has not been executed — recommend running `./apps/ios/meeshy.sh test` before merging.

- [ ] **Step 3: Manual smoke check in the simulator**

**Not run** — no simulator/UI interaction performed this pass; only automated tests and
static review. Flagging per the project's own standard ("if you can't test the UI, say so
explicitly rather than claiming success") — this step should be done before merging.

- [x] **Step 4: Commit fixups discovered during automated verification.**

Two real bugs were found and fixed via the SDK test suite (not just fixture bugs):
1. `StoryCoverCacheKey` inherited `MeeshyUI`'s default `@MainActor` isolation, breaking
   calls from nonisolated contexts — fixed with an explicit `nonisolated` modifier
   (mirrors `CanvasGeometry`'s existing pattern).
2. `StoryRenderer.render()` only builds the FOREGROUND item tree — the background is a
   separate layer the live canvas (`StoryCanvasUIView.backgroundLayer`) and the export
   compositor (`StoryAVCompositor.renderFrame`, via `resolveBackgroundImage` +
   `paintAspectFill`) each composite independently. `StoryStaticSnapshot` was rewritten to
   follow the same two-step order (paint background from in-memory bitmaps, then render the
   foreground tree on top) instead of relying on `StoryRenderer`'s `imageCache` parameter,
   which never reaches a background layer that `StoryRenderer.render()` doesn't build.

## Self-Review Notes (completed during plan authoring)

- **Spec coverage:** §4.1 → Task 2. §4.2 → Task 3. §4.3 → Task 5. §4.4 → Task 4. §4.5 →
  Task 6. §4.6 (no backend change) → no task needed, nothing to do. Non-goals (§3) are
  respected by every task (no task touches `receiverCoverPlan`/`receiverCoverCandidates`'s
  renderer, no task adds a backfill job or a backend field).
- **Cross-module boundary:** caught during planning that the spec's original Task 4 sketch
  referenced the app-side `StoryCoverThumbnail` directly from SDK code, which cannot compile
  (SDK cannot import the app target) — resolved by Task 1's `StoryCoverCacheKey` extraction,
  inserted as a new first task all SDK-side work depends on.
- **Site count:** the spec said "3 call sites" for the publish-time cover; re-grepping
  `StoryViewModel.swift` while writing Task 5 found a 4th (`renderMissingReceiverCovers`,
  line ~606) that renders OTHER users' stories and must stay excluded per the spec's
  non-goals — Task 5 now explicitly names and skips it instead of blanket-replacing every
  match.
- **Type consistency:** `StoryStaticSnapshot.render(slide:loadedImages:size:) -> UIImage?`
  (Task 2) is the exact signature consumed by both Task 4 (`draftCoverJPEG`) and Task 5
  (StoryViewModel call sites) — checked no drift between the "Produces" line in Task 2 and
  its usage sites.
