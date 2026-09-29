import XCTest
@testable import MeeshyUI

/// #8725 — un appel qui se pose sur une story gèle son compte à rebours ; sa fin
/// le relance là où il était. Sans ce gel, la slide avançait sous la vue d'appel
/// et l'utilisateur retrouvait, en réduisant, une autre slide que la sienne.
@MainActor
final class StoryReaderTimerInterruptionTests: XCTestCase {

    private func makeSUT() -> (timer: StoryReaderTimerController, interruption: PlaybackInterruption) {
        let interruption = PlaybackInterruption()
        let timer = StoryReaderTimerController(useDisplayLink: false, interruption: interruption)
        timer.contentReadyFailsafe = 0
        timer.setCurrentSlide(id: "s1", duration: 10)
        timer.markContentReady(slideId: "s1")
        return (timer, interruption)
    }

    func test_interruption_freezesTheCountdown() {
        let (timer, interruption) = makeSUT()
        timer._advanceClockForTesting(by: 2)

        interruption.begin()
        timer._advanceClockForTesting(by: 5)

        XCTAssertTrue(timer.isInterrupted)
        XCTAssertEqual(timer.progress, 0.2, accuracy: 0.0001)
    }

    func test_interruptionEnd_resumesWhereTheSlideWas() {
        let (timer, interruption) = makeSUT()
        timer._advanceClockForTesting(by: 2)
        interruption.begin()
        timer._advanceClockForTesting(by: 5)

        interruption.end()
        timer._advanceClockForTesting(by: 1)

        XCTAssertFalse(timer.isInterrupted)
        XCTAssertEqual(timer.progress, 0.3, accuracy: 0.0001)
    }

    func test_interruption_neverCompletesTheSlide() {
        let (timer, interruption) = makeSUT()
        var completed = false
        timer.onCompletion = { completed = true }

        interruption.begin()
        timer._advanceClockForTesting(by: 60)

        XCTAssertFalse(completed, "Une slide ne se termine pas sous la vue d'appel.")
    }

    func test_interruptionEnd_keepsAUserPause() {
        let (timer, interruption) = makeSUT()
        timer.setPaused(true)
        interruption.begin()

        interruption.end()
        timer._advanceClockForTesting(by: 3)

        XCTAssertEqual(timer.progress, 0, accuracy: 0.0001)
    }

    func test_timerMountedDuringAnInterruption_startsFrozen() {
        let interruption = PlaybackInterruption()
        interruption.begin()

        let timer = StoryReaderTimerController(useDisplayLink: false, interruption: interruption)

        XCTAssertTrue(timer.isInterrupted)
    }
}
