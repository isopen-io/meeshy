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
}
