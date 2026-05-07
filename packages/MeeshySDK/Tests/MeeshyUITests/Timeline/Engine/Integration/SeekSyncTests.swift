import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 66 — Video preview seek syncs audio within ±50ms.
/// Uses `MockStoryTimelineEngine` to verify `seek(to:precise:)` is called
/// with a time matching the scrub position within the ±50ms tolerance.
@MainActor
final class SeekSyncTests: XCTestCase {

    private func makeSUT() -> (sut: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 10)
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return (sut, engine)
    }

    func test_scrub_triggersEngineSeek_withinHalfFrameTolerance() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()

        let targetTime: Float = 4.567

        sut.scrub(to: targetTime)

        XCTAssertEqual(engine.seekCallCount, 1,
                       "scrub(to:) must trigger exactly one engine seek")
        let seekTime = engine.lastSeekTime ?? -1
        XCTAssertEqual(seekTime, targetTime, accuracy: 0.05,
                       "Engine seek time must match scrub position within ±50ms")
        XCTAssertEqual(sut.currentTime, targetTime, accuracy: 0.001,
                       "ViewModel.currentTime must update to scrubbed position")
    }

    func test_scrub_clampsToDuration_engineSeeksAtClampedValue() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()

        // Scrub beyond the slide duration (10s)
        sut.scrub(to: 999)

        let seekTime = engine.lastSeekTime ?? -1
        XCTAssertEqual(seekTime, 10.0, accuracy: 0.001,
                       "Scrub beyond duration must clamp to slideDuration and engine seek at clamped value")
    }

    func test_multiSeek_eachCallForwardsToEngine() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()

        sut.scrub(to: 1.0)
        sut.scrub(to: 3.0)
        sut.scrub(to: 7.5)

        XCTAssertEqual(engine.seekCallCount, 3,
                       "Each scrub call must forward to the engine once")
        XCTAssertEqual(engine.lastSeekTime ?? -1, 7.5, accuracy: 0.001)
    }
}
