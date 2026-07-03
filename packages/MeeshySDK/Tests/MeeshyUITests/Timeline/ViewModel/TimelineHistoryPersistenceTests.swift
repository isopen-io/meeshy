import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// E4 — undo/redo must survive the timeline sheet lifecycle. The CommandStack
/// used to live and die with the lazy timeline engine: `shutdownTimelineIfNeeded`
/// (canvas teardown) dropped it, and `bootstrap` never reset it, so history was
/// lost on every sheet close AND leaked across slides.
///
/// Key mechanics pinned here: commands are self-inverting (`revert(from:)`), so
/// a stack restored over an already-committed project needs NO replay — undo
/// reverts from the current state. `restoreCommandHistory` (replay variant) is
/// for zero-state projects only and would double-apply AddClip.
@MainActor
final class TimelineHistoryPersistenceTests: XCTestCase {

    private func makeSlideWithOneClip() -> StorySlide {
        var effects = StoryEffects()
        effects.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm1",
                             mediaType: "video", placement: "media",
                             aspectRatio: 1.0,
                             startTime: 0, duration: 5)
        ]
        return StorySlide(id: "slide-history", effects: effects, duration: 5)
    }

    // MARK: - No-replay restore (the committed-project case)

    func test_restoreWithoutReplay_doesNotDoubleApplyCommands() {
        let first = TimelineViewModel(
            engine: MockStoryTimelineEngine(),
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        first.bootstrap(project: TimelineProject(from: makeSlideWithOneClip()),
                        mediaURLs: [:], images: [:])
        first.addMedia(id: "v-added", postMediaId: "pm-added", kind: .video,
                       startTime: 5, duration: 2)
        let committedProject = first.project
        XCTAssertEqual(committedProject.mediaObjects.count, 2)
        let history = first.commandHistorySnapshot()

        // A fresh engine bootstrapped with the COMMITTED project (reloaded
        // slide) — restoring must NOT re-apply AddClip.
        let second = TimelineViewModel(
            engine: MockStoryTimelineEngine(),
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        second.bootstrap(project: committedProject, mediaURLs: [:], images: [:])
        second.restoreCommandHistoryWithoutReplay(history)

        XCTAssertEqual(second.project.mediaObjects.count, 2,
                       "No-replay restore must not duplicate the added clip")
        XCTAssertTrue(second.canUndo, "The restored stack must be undoable")

        second.undo()
        XCTAssertFalse(second.project.mediaObjects.contains { $0.id == "v-added" },
                       "Undo must revert from the committed state (self-inverting command)")
        second.redo()
        XCTAssertTrue(second.project.mediaObjects.contains { $0.id == "v-added" })
    }

    // MARK: - Composer lifecycle: history survives sheet teardown

    func test_reopeningTimeline_preservesUndoHistory() {
        let composer = StoryComposerViewModel()
        composer.slides = [makeSlideWithOneClip()]
        composer.currentSlideIndex = 0

        composer.loadCurrentSlideIntoTimeline()
        composer.timelineViewModel.addMedia(id: "v-added", postMediaId: "pm-added",
                                            kind: .video, startTime: 5, duration: 2)
        XCTAssertTrue(composer.timelineViewModel.canUndo)
        composer.commitTimelineToCurrentSlide()

        composer.shutdownTimelineIfNeeded()
        composer.loadCurrentSlideIntoTimeline()

        XCTAssertTrue(composer.timelineViewModel.canUndo,
                      "Undo history must survive the timeline engine teardown")
        composer.timelineViewModel.undo()
        XCTAssertFalse(composer.timelineViewModel.project.mediaObjects.contains { $0.id == "v-added" },
                       "Undo after reload must revert without replay side-effects")
    }

    // MARK: - Cross-slide isolation (pre-existing leak fixed by the same wiring)

    func test_switchingSlides_doesNotLeakHistoryAcrossSlides() {
        let composer = StoryComposerViewModel()
        var otherEffects = StoryEffects()
        otherEffects.background = "112233"
        composer.slides = [makeSlideWithOneClip(),
                           StorySlide(id: "slide-clean", effects: otherEffects, duration: 5)]
        composer.currentSlideIndex = 0

        composer.loadCurrentSlideIntoTimeline()
        composer.timelineViewModel.addMedia(id: "v-added", postMediaId: "pm-added",
                                            kind: .video, startTime: 5, duration: 2)
        composer.commitTimelineToCurrentSlide()

        composer.currentSlideIndex = 1
        composer.loadCurrentSlideIntoTimeline()

        XCTAssertFalse(composer.timelineViewModel.canUndo,
                       "Slide B must not inherit slide A's undo stack")

        composer.currentSlideIndex = 0
        composer.loadCurrentSlideIntoTimeline()
        XCTAssertTrue(composer.timelineViewModel.canUndo,
                      "Coming back to slide A restores its own history")
    }
}
