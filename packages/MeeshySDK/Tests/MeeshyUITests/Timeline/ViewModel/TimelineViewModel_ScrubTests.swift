import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// P0 perf regression — playhead drag at 60 fps must NOT trigger
/// frame-accurate seeks. `precise: true` carries `.zero` tolerance and
/// forces AVPlayer to decompress a full GOP (~100-500 ms on H.264) per
/// call, freezing the UI during continuous scrubs. `TimelineViewModel`
/// owns an `isScrubbing` flag (flipped by `beginScrub()` / `endScrub()`)
/// that swaps `scrub(to:)` between sub-50 ms (drag) and frame-accurate
/// (release) seeking — mirroring the existing `beginClipDrag` /
/// `endClipDrag` pattern.
@MainActor
final class TimelineViewModel_ScrubTests: XCTestCase {

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

    // MARK: - beginScrub flips precision off

    func test_scrub_duringActiveDrag_callsEngineWithPreciseFalse() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()

        sut.beginScrub()
        XCTAssertTrue(sut.isScrubbing,
                      "beginScrub() must flip isScrubbing to true so 60 fps drags get sub-50ms tolerance")

        sut.scrub(to: 1.0)
        sut.scrub(to: 2.0)
        sut.scrub(to: 3.0)

        XCTAssertEqual(engine.seekCallCount, 3)
        XCTAssertEqual(engine.lastSeekPrecise, false,
                       "Continuous scrub under beginScrub() must forward precise:false to avoid GOP decompression freeze")
        XCTAssertTrue(engine.seekCallsLog.allSatisfy { !$0.precise },
                      "Every intermediate frame of the drag must be precise:false")
    }

    // MARK: - endScrub restores precision

    func test_scrub_afterEndDrag_callsEngineWithPreciseTrue() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()

        sut.beginScrub()
        sut.scrub(to: 4.0)
        sut.endScrub()

        XCTAssertFalse(sut.isScrubbing,
                       "endScrub() must reset isScrubbing so post-release seeks are frame-accurate")

        sut.scrub(to: 4.5)

        XCTAssertEqual(engine.lastSeekPrecise, true,
                       "scrub(to:) outside a beginScrub/endScrub bracket must forward precise:true")
    }

    // MARK: - Default precision (legacy callers)

    func test_scrub_withoutBeginScrub_defaultsToPrecise() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()

        sut.scrub(to: 2.0)

        XCTAssertEqual(engine.lastSeekPrecise, true,
                       "Single-shot scrub(to:) (keyboard, a11y, tests) must stay frame-accurate")
    }

    // MARK: - Explicit-precision overload

    func test_scrub_withExplicitPrecise_overridesIsScrubbingFlag() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()

        sut.beginScrub()
        sut.scrub(to: 1.0, precise: true)

        XCTAssertEqual(engine.lastSeekPrecise, true,
                       "Explicit precise:true must win over isScrubbing for keyboard/a11y stepping during a drag")
    }

    // MARK: - endScrub idempotency

    func test_endScrub_withoutBeginScrub_isNoop() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()

        sut.endScrub()

        XCTAssertFalse(sut.isScrubbing,
                       "endScrub() must be safe to call when no scrub is in flight (gesture teardown)")
        XCTAssertEqual(engine.seekCallCount, 0,
                       "endScrub() outside a scrub must not issue any seek — hosts tear gestures down blindly")
    }

    // MARK: - endScrub anchors the release frame

    func test_endScrub_afterActiveScrub_issuesFinalPreciseSeekAtCurrentTime() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()

        sut.beginScrub()
        sut.scrub(to: 3.2)
        sut.endScrub()

        XCTAssertEqual(engine.lastSeekTime, 3.2,
                       "Releasing a scrub must re-seek the release position so the frame shown is exact")
        XCTAssertEqual(engine.lastSeekPrecise, true,
                       "The release seek must be frame-accurate — every drag frame was sub-50ms tolerant")
    }
}
