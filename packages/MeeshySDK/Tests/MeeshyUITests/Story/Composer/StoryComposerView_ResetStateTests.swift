import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Regression tests for the P0 bug where `viewModel.reset()` wiped the
/// ViewModel side of the composer but the `StoryComposerView`'s composer-local
/// `@State` (stickers, filter, transitions, selected image, audio inputs)
/// survived. The `canvasSyncFingerprint` -> `syncCurrentSlideEffects()` ->
/// `buildEffects()` chain then re-injected those orphans into the fresh empty
/// slide, making "deleted" elements reappear.
///
/// SwiftUI `@State` is private to the View struct and cannot be inspected
/// directly from XCTest, so the unit-level coverage here exercises the
/// ViewModel contract that `resetLocalState()` is designed to keep in sync:
/// after `reset()`, the slide's `effects` MUST be empty. Any future change
/// that loosens that guarantee will surface here, and the call-site fix in
/// `StoryComposerView` (`viewModel.reset()` + `resetLocalState()` together)
/// stays the only thing the View has to do.
///
/// A full UI-level assertion (sticker -> reset -> new slide -> assert no
/// sticker) would require hosting the View in a UI-test harness, which is
/// out of scope for this fix.
@MainActor
final class StoryComposerView_ResetStateTests: XCTestCase {

    // MARK: - ViewModel contract that resetLocalState() relies on

    func test_reset_clearsAllSlideEffects() {
        let vm = StoryComposerViewModel()
        vm.currentEffects = StoryEffects(
            background: "FF00FF",
            filter: "vintage",
            stickerObjects: [
                StorySticker(id: "s1", emoji: "🎉", x: 0.5, y: 0.5, scale: 1, rotation: 0)
            ],
            opening: .fade,
            closing: .slide
        )

        XCTAssertNotNil(vm.currentEffects.filter)
        XCTAssertFalse(vm.currentEffects.stickerObjects?.isEmpty ?? true)
        XCTAssertNotNil(vm.currentEffects.opening)
        XCTAssertNotNil(vm.currentEffects.closing)

        vm.reset()

        XCTAssertEqual(vm.slides.count, 1, "reset() must yield exactly one fresh slide")
        XCTAssertNil(vm.currentEffects.filter, "Effects must be empty after reset()")
        XCTAssertNil(vm.currentEffects.stickerObjects)
        XCTAssertNil(vm.currentEffects.opening)
        XCTAssertNil(vm.currentEffects.closing)
        XCTAssertNil(vm.currentEffects.backgroundAudioId)
        XCTAssertTrue(vm.currentEffects.textObjects.isEmpty)
    }

    func test_reset_clearsLoadedMediaAndDrawing() {
        let vm = StoryComposerViewModel()
        vm.loadedImages["k1"] = UIImage()
        vm.drawingData = Data([0x01, 0x02])
        vm.selectedElementId = "some-id"
        vm.activeTool = .drawing

        vm.reset()

        XCTAssertTrue(vm.loadedImages.isEmpty)
        XCTAssertNil(vm.drawingData)
        XCTAssertNil(vm.selectedElementId)
        XCTAssertNil(vm.activeTool)
    }

    // MARK: - View-level resetLocalState() — not unit-testable

    /// SwiftUI does not expose `@State` storage to XCTest, so we cannot
    /// directly assert that `resetLocalState()` cleared the canvas-local fields
    /// inside the View struct. The behavioural guarantee is enforced at the
    /// call site (line 573): `viewModel.reset()` is ALWAYS followed by
    /// `resetLocalState()`. If a future refactor introduces a second call
    /// site to `viewModel.reset()` without the companion call, the bug will
    /// regress silently — the lint guard below is the cheapest place to catch
    /// that, by failing loudly the moment a stray call appears.
    func test_resetCallSite_isPairedWithLocalStateReset() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Composer
            .deletingLastPathComponent() // Story
            .deletingLastPathComponent() // MeeshyUITests
            .deletingLastPathComponent() // Tests
            .appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView.swift")

        guard let source = try? String(contentsOf: url, encoding: .utf8) else {
            throw XCTSkip("StoryComposerView.swift not reachable from test bundle (\(url.path))")
        }

        let resetCalls = source.components(separatedBy: "viewModel.reset()").count - 1
        let localResets = source.components(separatedBy: "resetLocalState()").count - 1

        XCTAssertGreaterThanOrEqual(
            resetCalls, 1,
            "Expected at least one viewModel.reset() call site in StoryComposerView.swift"
        )
        // Every `viewModel.reset()` must be accompanied by a `resetLocalState()`
        // call (definition + call sites). We expect localResets >= resetCalls + 1
        // (one definition + one call per reset()). The +1 covers the function
        // declaration itself.
        XCTAssertGreaterThanOrEqual(
            localResets, resetCalls + 1,
            "Every viewModel.reset() call site MUST be followed by resetLocalState() — see P0 bug fix. resetCalls=\(resetCalls), localResets=\(localResets)"
        )
    }
}
