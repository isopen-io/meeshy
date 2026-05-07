import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 56 — Double tap splits at playhead.
/// Verifies `splitSelectedAtPlayhead()` invoked from a double-tap on the clip.
@MainActor
final class DoubleTapSplitTests: XCTestCase {

    private func makeSUT(clipDuration: Float = 6.0) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: clipDuration)
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return sut
    }

    func test_doubleTap_atPlayhead_splitsSelectedClip() async {
        let sut = makeSUT(clipDuration: 6.0)
        await sut.awaitConfigured()

        sut.selectClip(id: "clip-1")
        sut.scrub(to: 2.0)

        // Simulate double-tap → split at playhead
        sut.splitSelectedAtPlayhead()

        XCTAssertEqual(sut.project.mediaObjects.count, 2,
                       "Double-tap split must produce two clips")

        let durations = sut.project.mediaObjects.compactMap { $0.duration }.sorted()
        XCTAssertEqual(durations[0], 2.0, accuracy: 0.01, "Left half must be 2s")
        XCTAssertEqual(durations[1], 4.0, accuracy: 0.01, "Right half must be 4s")
    }
}
