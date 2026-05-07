import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 52 — Clip drag gesture: drive begin/dragMoved/end sequence with snap candidates.
/// Verifies the clip moves to the snapped position and that activeDrag is cleared on end.
@MainActor
final class ClipDragGestureTests: XCTestCase {

    private func makeSUT(startTime: Float = 0) -> (sut: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: startTime)
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return (sut, engine)
    }

    func test_dragGesture_withSnapCandidate_snapsClipToCandidate() async {
        let (sut, _) = makeSUT(startTime: 0)
        await sut.awaitConfigured()

        // Snap candidate at t=2.0
        let candidate = SnapCandidate(kind: .clipStart, time: 2.0)

        // Begin drag
        sut.beginClipDrag(clipId: "clip-1")
        XCTAssertNotNil(sut.selection.activeDrag, "activeDrag must be set after beginClipDrag")

        // Move close enough to snap candidate (within 0.1s tolerance)
        sut.dragClipMoved(rawTime: 2.05, snapCandidates: [candidate])

        // Verify snap took effect
        let clipStart = sut.project.mediaObjects.first?.startTime ?? -99
        XCTAssertEqual(clipStart, 2.0, accuracy: 0.001,
                       "Clip must snap to candidate at 2.0 (was dragged to 2.05, within tolerance 0.1)")
        XCTAssertEqual(sut.selection.activeDrag?.snappedTo, .clipStart,
                       "snappedTo must reflect the winning candidate kind")

        // End drag
        sut.endClipDrag()
        XCTAssertNil(sut.selection.activeDrag, "activeDrag must be cleared after endClipDrag")
        XCTAssertTrue(sut.canUndo, "A MoveClipCommand must be on the stack")
    }
}
