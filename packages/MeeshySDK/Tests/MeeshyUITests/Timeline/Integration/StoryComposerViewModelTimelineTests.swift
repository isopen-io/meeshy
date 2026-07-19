import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryComposerViewModelTimelineTests: XCTestCase {

    func test_timelineViewModel_isLazy_andStable() {
        let composer = StoryComposerViewModel()
        let first = composer.timelineViewModel
        let second = composer.timelineViewModel
        XCTAssertTrue(first === second,
                      "Lazy var must vend the same instance across reads")
    }

    func test_timelineViewModel_modeDefaultsToQuick() {
        let composer = StoryComposerViewModel()
        XCTAssertEqual(composer.timelineViewModel.mode, .quick)
    }

    func test_loadCurrentSlideIntoTimeline_populatesProject() async {
        let composer = StoryComposerViewModel()
        composer.currentSlideDuration = 8
        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()
        XCTAssertEqual(composer.timelineViewModel.project.slideDuration, 8, accuracy: 0.001)
    }

    func test_loadCurrentSlideIntoTimeline_preservesSelectionAcrossSlideSwitch() async {
        let composer = StoryComposerViewModel()
        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()
        composer.timelineViewModel.selectClip(id: "non-existent")
        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()
        // Selection cleared because the new slide does not contain that clip id.
        XCTAssertNil(composer.timelineViewModel.selection.selectedClipId)
    }

    // Regression: the opening/closing effect chips write ONLY to the VM's own
    // `openingEffect`/`closingEffect` (same source the live canvas preview
    // reads) — not synchronously through to `currentSlide.effects.opening`/
    // `.closing`. `TimelineProject(from: slide)` alone would read that stale,
    // unsynced slide-side value, so the Timeline chrome lane would show
    // nothing right after a user picks an effect. The live VM value must win.
    func test_loadCurrentSlideIntoTimeline_prefersLiveVMEffectsOverStaleSlideSnapshot() async {
        let composer = StoryComposerViewModel()
        // currentSlide.effects.opening/.closing remain nil/unsynced — only the
        // VM's own published properties (what the chip UI + canvas actually
        // write to) carry the freshly-picked values.
        composer.openingEffect = .fade
        composer.closingEffect = .zoom

        composer.loadCurrentSlideIntoTimeline()
        await composer.timelineViewModel.awaitConfigured()

        XCTAssertEqual(composer.timelineViewModel.project.openingEffect, .fade)
        XCTAssertEqual(composer.timelineViewModel.project.closingEffect, .zoom)
    }

    // Regression: fixing `loadCurrentSlideIntoTimeline()` to prefer the live
    // VM opening/closing effect (above) is necessary but NOT sufficient — the
    // method's own doc comment promises it also runs "whenever the timeline
    // sheet becomes visible", but until this test was added no call site
    // actually did that. `isTimelineVisible` is flipped to `true` from at
    // least two places (`ComposerControlsLayer` tile tap, `StoryComposerView+
    // TopBar` overflow menu item) — patching each individually is fragile, so
    // the fix is a single centralized `.adaptiveOnChange(of: viewModel.
    // isTimelineVisible)` trigger in `StoryComposerView+Canvas.swift`.
    //
    // This wiring lives in a SwiftUI `View` modifier chain, not on the
    // ViewModel, so it cannot be exercised through `StoryComposerViewModel`
    // directly. Hosting the full `StoryComposerView` in a `UIHostingController`
    // (as `ClipInspector_StateSyncTests` does for the much smaller, standalone
    // `ClipInspector`) is impractical here: `StoryComposerView` owns 45+
    // `@State` properties plus live AVFoundation/memory-observer/media-
    // coordinator side effects with no lightweight fixture (see
    // `StoryComposerView_ResetStateTests.swift`, which reaches the same
    // conclusion for the sibling `resetLocalState()` wiring and falls back to
    // a source-guard). Reusing that established pattern here — a real
    // regression test that fails if the trigger or its call to
    // `loadCurrentSlideIntoTimeline()` is ever removed.
    func test_isTimelineVisible_hasCentralizedReloadTrigger_inCanvasView() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Integration
            .deletingLastPathComponent() // Timeline
            .deletingLastPathComponent() // MeeshyUITests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // MeeshySDK package root
            .appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift")

        guard let source = try? String(contentsOf: url, encoding: .utf8) else {
            throw XCTSkip("StoryComposerView+Canvas.swift not reachable from test bundle (\(url.path))")
        }

        let trigger = ".adaptiveOnChange(of: viewModel.isTimelineVisible)"
        guard let triggerRange = source.range(of: trigger) else {
            XCTFail("""
                Expected a centralized \(trigger) trigger in StoryComposerView+Canvas.swift. \
                `isTimelineVisible` is set to true from multiple entry points (ComposerControlsLayer \
                tile tap, TopBar overflow menu, ...) — without one reactive trigger tied to visibility \
                itself, the timeline chrome lane shows a stale opening/closing effect the first time \
                the sheet opens without a slide switch in between.
                """)
            return
        }

        let tail = source[triggerRange.upperBound...].prefix(200)
        XCTAssertTrue(
            tail.contains("loadCurrentSlideIntoTimeline()"),
            "The isTimelineVisible trigger must call viewModel.loadCurrentSlideIntoTimeline() to refresh the chrome lane snapshot when the sheet appears."
        )
    }

    /// `isTimelineVisible` only flips true on the FIRST entry into the
    /// timeline sheet — switching BETWEEN tabs of an already-open tool sheet
    /// goes through `viewModel.selectTool(_:)`, which changes `activeTool`
    /// but never touches `isTimelineVisible`. Confirmed live on-device: after
    /// picking "Fade" as the opening effect on the Background tab, then
    /// switching to the Timeline tab (activeTool → .timeline, isTimelineVisible
    /// already true from the initial FAB tap so it does NOT re-fire), the
    /// chrome lane still showed a stale snapshot. Without a SECOND trigger
    /// tied to `activeTool`, that path never refreshes.
    func test_activeTool_hasReloadTrigger_inCanvasView() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Integration
            .deletingLastPathComponent() // Timeline
            .deletingLastPathComponent() // MeeshyUITests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // MeeshySDK package root
            .appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift")

        guard let source = try? String(contentsOf: url, encoding: .utf8) else {
            throw XCTSkip("StoryComposerView+Canvas.swift not reachable from test bundle (\(url.path))")
        }

        guard source.contains(".adaptiveOnChange(of: viewModel.activeTool)") else {
            XCTFail("Expected StoryComposerView+Canvas.swift to observe viewModel.activeTool.")
            return
        }

        let anchor = "newTool == .timeline"
        guard let anchorRange = source.range(of: anchor) else {
            XCTFail("""
                Expected the existing `viewModel.activeTool` onChange handler in \
                StoryComposerView+Canvas.swift to branch on `newTool == .timeline`. \
                Switching tabs within an already-open tool sheet goes through `selectTool(_:)`, \
                which changes `activeTool` but never touches `isTimelineVisible` — without this \
                branch, re-visiting the Timeline tab after changing the opening/closing effect on \
                another tab shows a stale chrome lane.
                """)
            return
        }

        let tail = source[anchorRange.upperBound...].prefix(120)
        XCTAssertTrue(
            tail.contains("loadCurrentSlideIntoTimeline()"),
            "The `newTool == .timeline` branch must call viewModel.loadCurrentSlideIntoTimeline() to refresh the chrome lane snapshot."
        )
    }
}
