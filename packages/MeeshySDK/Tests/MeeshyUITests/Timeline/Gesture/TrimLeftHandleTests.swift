import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 53 — Trim left handle: `trimClipStart(id:deltaTimeSeconds:)`.
/// Dragging the left handle to the right should shrink the clip from the start.
@MainActor
final class TrimLeftHandleTests: XCTestCase {

    private func makeSUT() -> (sut: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 6)
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return (sut, engine)
    }

    func test_trimClipStart_positive_shrinksFromLeft() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()

        // Trim 1.5s from the left (start moves right, duration shrinks)
        sut.trimClipStart(id: "clip-1", deltaTimeSeconds: 1.5)

        let clip = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertEqual(clip?.startTime ?? 0, 1.5, accuracy: 0.001,
                       "Start time must advance by delta")
        XCTAssertEqual(clip?.duration ?? 0, 4.5, accuracy: 0.001,
                       "Duration must shrink by delta")
        XCTAssertTrue(sut.canUndo, "TrimClipCommand must be on the command stack")
    }
}
