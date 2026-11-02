import XCTest
@testable import MeeshySDK
@testable import MeeshyUI
@testable import Meeshy

/// The reader's playback pipeline owns its clock, its prefetch window and the
/// tasks it launches (#13135): installed once per appearance, re-armed on every
/// slide, torn down on exit.
@MainActor
final class StoryPlaybackPipelineTests: XCTestCase {

    private func makeStory(_ id: String) -> StoryItem {
        StoryItem(id: id, content: "story \(id)", media: [], storyEffects: nil,
                  createdAt: Date(), expiresAt: nil, isViewed: false)
    }

    private func makeWindow(count: Int = 3, index: Int = 0) -> StoryPlaybackWindow {
        StoryPlaybackWindow(stories: (0..<count).map { makeStory("story-\($0)") }, index: index,
                            languages: ["fr"], mute: false, duration: 6, warmItems: [])
    }

    private func makeSUT() -> (StoryPlaybackPipeline, StoryReaderPrefetcher, StoryReaderTimerController) {
        let prefetcher = StoryReaderPrefetcher()
        let timer = StoryReaderTimerController(useDisplayLink: false)
        return (StoryPlaybackPipeline(prefetcher: prefetcher, timer: timer), prefetcher, timer)
    }

    private final class Calls {
        var progress: [Double] = []
        var firstTicks = 0
        var completions = 0
    }

    private func install(_ sut: StoryPlaybackPipeline, into calls: Calls) {
        sut.install(onProgress: { calls.progress.append($0) },
                    onFirstTick: { calls.firstTicks += 1 },
                    onCompletion: { calls.completions += 1 })
    }

    func test_refresh_targetsTheVisibleSlide_andWaitsForItsContent() {
        let (sut, prefetcher, timer) = makeSUT()
        install(sut, into: Calls())

        sut.refresh(makeWindow(index: 1), paused: false)

        XCTAssertEqual(timer.currentSlideId, "story-1")
        XCTAssertFalse(timer.isActive)
        XCTAssertEqual(Set(prefetcher.bootstrapped.keys), ["story-0", "story-1", "story-2"])
    }

    func test_theCurrentCanvasReadiness_startsTheClock() {
        let (sut, prefetcher, timer) = makeSUT()
        install(sut, into: Calls())
        sut.refresh(makeWindow(), paused: false)

        prefetcher.view(for: "story-0")?.onContentReady?()

        XCTAssertTrue(timer.isActive)
    }

    func test_refresh_keepsTheRequestedPause() {
        let (sut, _, timer) = makeSUT()
        install(sut, into: Calls())

        sut.refresh(makeWindow(), paused: true)

        XCTAssertTrue(timer.isPaused)
    }

    func test_refresh_withoutAVisibleSlide_resetsTheClock() {
        let (sut, _, timer) = makeSUT()
        install(sut, into: Calls())
        sut.refresh(makeWindow(), paused: false)
        timer.markContentReady(slideId: "story-0")
        timer._advanceClockForTesting(by: 1)

        sut.refresh(makeWindow(count: 2, index: 5), paused: false)

        XCTAssertFalse(timer.isActive)
        XCTAssertEqual(timer.progress, 0)
    }

    func test_theFirstTick_preparesTheNeighboursOncePerSlide() {
        let (sut, _, timer) = makeSUT()
        let calls = Calls()
        install(sut, into: calls)
        sut.refresh(makeWindow(), paused: false)
        timer.markContentReady(slideId: "story-0")

        timer._advanceClockForTesting(by: 0.5)
        timer._advanceClockForTesting(by: 0.5)
        XCTAssertEqual(calls.firstTicks, 1)
        XCTAssertFalse(calls.progress.isEmpty)

        sut.slideDidStart()
        timer._advanceClockForTesting(by: 0.5)
        XCTAssertEqual(calls.firstTicks, 2)
    }

    func test_theEndOfTheClock_reportsCompletion() {
        let (sut, _, timer) = makeSUT()
        let calls = Calls()
        install(sut, into: calls)
        sut.refresh(makeWindow(), paused: false)
        timer.markContentReady(slideId: "story-0")

        timer._advanceClockForTesting(by: 12)

        XCTAssertEqual(calls.completions, 1)
    }

    func test_aSecondInstall_isANoOp() {
        let (sut, _, timer) = makeSUT()
        let first = Calls()
        install(sut, into: first)
        sut.refresh(makeWindow(), paused: false)
        timer.markContentReady(slideId: "story-0")

        install(sut, into: Calls())
        timer._advanceClockForTesting(by: 1)

        XCTAssertTrue(timer.isActive, "A re-entrant appearance must not reset the running slide")
        XCTAssertEqual(first.firstTicks, 1)
    }

    func test_tearDown_releasesTheCanvases_andAllowsANewInstall() {
        let (sut, prefetcher, timer) = makeSUT()
        install(sut, into: Calls())
        sut.refresh(makeWindow(), paused: false)

        sut.tearDown()
        XCTAssertTrue(prefetcher.bootstrapped.isEmpty)

        let second = Calls()
        install(sut, into: second)
        sut.refresh(makeWindow(), paused: false)
        timer.markContentReady(slideId: "story-0")
        timer._advanceClockForTesting(by: 12)
        XCTAssertEqual(second.completions, 1)
    }
}
