import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 58 — Two-finger free drag disables snap.
/// When `setSnapDisabled(true)` is called (the View does this on two-finger gesture),
/// dragging near a candidate must return the raw position, not the snapped one.
@MainActor
final class TwoFingerDragDisablesSnapTests: XCTestCase {

    private func makeSUT() -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 4)
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return sut
    }

    func test_twoFingerDrag_withSnapDisabled_doesNotSnap() async {
        let sut = makeSUT()
        await sut.awaitConfigured()

        // Simulate two-finger gesture start → disable snap
        sut.setSnapDisabled(true)
        XCTAssertFalse(sut.isSnapEnabled)

        let candidate = SnapCandidate(kind: .clipStart, time: 2.0)
        sut.beginClipDrag(clipId: "clip-1")
        // rawTime is 2.05 — within tolerance of 2.0 candidate, but snap is disabled
        sut.dragClipMoved(rawTime: 2.05, snapCandidates: [candidate])

        let clipStart = sut.project.mediaObjects.first?.startTime ?? -1
        XCTAssertEqual(clipStart, 2.05, accuracy: 0.001,
                       "With snap disabled, clip must sit at raw drag position (2.05) not 2.0")
        XCTAssertNil(sut.selection.activeDrag?.snappedTo,
                     "snappedTo must be nil when snap is disabled")

        sut.endClipDrag()

        // Re-enable snap after two-finger gesture ends
        sut.setSnapDisabled(false)
        XCTAssertTrue(sut.isSnapEnabled)
    }
}
