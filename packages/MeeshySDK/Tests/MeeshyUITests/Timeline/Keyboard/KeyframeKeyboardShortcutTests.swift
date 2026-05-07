import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 64 — K shortcut adds keyframe at playhead on selected clip.
/// Exercises `addKeyframeAtPlayhead()` directly (the K shortcut invokes this on the ViewModel).
/// Runtime keyboard dispatch is skipped.
@MainActor
final class KeyframeKeyboardShortcutTests: XCTestCase {

    private func makeSUT() -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 8)
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return sut
    }

    // MARK: - K key behavior (unit-testable portion)

    func test_kShortcut_addsKeyframeAtCurrentPlayhead() async {
        let sut = makeSUT()
        await sut.awaitConfigured()

        sut.selectClip(id: "clip-1")
        sut.scrub(to: 3.0)

        // The K shortcut calls this method
        sut.addKeyframeAtPlayhead(x: 0.5, y: 0.5, scale: 1.0, opacity: 1.0)

        let clip = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertEqual(clip?.keyframes?.count, 1,
                       "K shortcut must add exactly one keyframe")
        XCTAssertEqual(Float(clip?.keyframes?.first?.time ?? -1), 3.0, accuracy: 0.01,
                       "Keyframe must be placed at the current playhead time (relative to clip start)")
    }

    func test_kShortcut_withNoSelection_doesNothing() async {
        let sut = makeSUT()
        await sut.awaitConfigured()

        // No clip selected
        sut.scrub(to: 2.0)
        sut.addKeyframeAtPlayhead(x: 0.5, y: 0.5)

        let clip = sut.project.mediaObjects.first
        XCTAssertNil(clip?.keyframes?.first,
                     "Without selection, K shortcut must not create a keyframe")
    }

    func test_kShortcut_runtimeDispatch_requiresUIWindow() throws {
        try XCTSkipIf(true,
            "Runtime K key dispatch requires UIWindow — covered by Phase 4 XCUITest suite.")
    }
}
