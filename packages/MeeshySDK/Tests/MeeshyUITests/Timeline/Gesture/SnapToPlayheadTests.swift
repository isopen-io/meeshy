import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 57 — Snap-to-playhead: verify `selection.activeDrag.snappedTo == .playhead`
/// when a clip is dragged near the current playhead position.
@MainActor
final class SnapToPlayheadTests: XCTestCase {

    private func makeSUT(clipStart: Float = 0) -> (sut: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: clipStart, duration: 4)
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return (sut, engine)
    }

    func test_dragNearPlayhead_snapsToPlayhead() async {
        let (sut, _) = makeSUT(clipStart: 0)
        await sut.awaitConfigured()

        // Set playhead at 3.0
        sut.scrub(to: 3.0)

        // Begin drag and move close to playhead (within 0.1s tolerance)
        sut.beginClipDrag(clipId: "clip-1")
        let playheadCandidate = SnapCandidate(kind: .playhead, time: 3.0)
        sut.dragClipMoved(rawTime: 3.05, snapCandidates: [playheadCandidate])

        XCTAssertEqual(sut.selection.activeDrag?.snappedTo, .playhead,
                       "Dragging within 0.1s of playhead must arm the playhead snap")
        XCTAssertEqual(sut.project.mediaObjects.first?.startTime ?? -1, 3.0, accuracy: 0.001,
                       "Clip must snap to playhead position (3.0)")
    }
}
