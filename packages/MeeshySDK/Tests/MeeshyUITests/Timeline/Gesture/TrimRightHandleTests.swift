import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 54 — Trim right handle with mediaDuration clamp.
/// Dragging the right handle beyond `mediaDurationLimit` must be clamped.
@MainActor
final class TrimRightHandleTests: XCTestCase {

    private func makeSUT(duration: Float = 4.0) -> (sut: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: duration)
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return (sut, engine)
    }

    func test_trimClipEnd_positive_extendsDuration() async {
        let (sut, _) = makeSUT(duration: 4.0)
        await sut.awaitConfigured()

        sut.trimClipEnd(id: "clip-1", deltaTimeSeconds: 2.0)

        let clip = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertEqual(clip?.duration ?? 0, 6.0, accuracy: 0.001,
                       "Trim right with positive delta must extend duration")
    }

    func test_trimClipEnd_clampsToMediaDurationLimit() async {
        let (sut, _) = makeSUT(duration: 4.0)
        await sut.awaitConfigured()

        // Media source is only 5s long; trying to extend to 8s must be clamped at 5s
        sut.trimClipEnd(id: "clip-1", deltaTimeSeconds: 4.0, mediaDurationLimit: 5.0)

        let clip = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertEqual(clip?.duration ?? 0, 5.0, accuracy: 0.001,
                       "Duration must be clamped to mediaDurationLimit (5.0)")
    }
}
