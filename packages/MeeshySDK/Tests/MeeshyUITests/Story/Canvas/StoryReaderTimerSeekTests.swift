import XCTest
@testable import MeeshyUI

/// #7878 — la barre de la story se parcourt au doigt : le compte à rebours
/// reprend DEPUIS la position choisie, et l'avance automatique se réarme quand
/// on recule après la fin.
@MainActor
final class StoryReaderTimerSeekTests: XCTestCase {

    private func activeTimer(duration: TimeInterval = 10) -> StoryReaderTimerController {
        let timer = StoryReaderTimerController(useDisplayLink: false)
        timer.contentReadyFailsafe = 0
        timer.setCurrentSlide(id: "s", duration: duration)
        timer.markContentReady(slideId: "s")
        return timer
    }

    func test_seek_half_setsProgressAndPublishesIt() {
        let timer = activeTimer()
        var published: [Double] = []
        timer.onProgressChange = { published.append($0) }

        timer.seek(toFraction: 0.5)

        XCTAssertEqual(timer.progress, 0.5, accuracy: 0.0001)
        XCTAssertEqual(published.last ?? -1, 0.5, accuracy: 0.0001)
    }

    func test_seek_thenAdvance_continuesFromTheChosenPosition() {
        let timer = activeTimer(duration: 10)

        timer.seek(toFraction: 0.5)
        timer._advanceClockForTesting(by: 1)

        XCTAssertEqual(timer.progress, 0.6, accuracy: 0.0001)
    }

    func test_seek_outOfRange_isClamped() {
        let timer = activeTimer()

        timer.seek(toFraction: -2)
        XCTAssertEqual(timer.progress, 0, accuracy: 0.0001)

        timer.seek(toFraction: .nan)
        XCTAssertEqual(timer.progress, 0, accuracy: 0.0001)
    }

    func test_seek_toTheEnd_completesOnce() {
        let timer = activeTimer()
        var completions = 0
        timer.onCompletion = { completions += 1 }

        timer.seek(toFraction: 1)
        timer.seek(toFraction: 1)

        XCTAssertEqual(completions, 1)
    }

    func test_seek_backAfterCompletion_rearmsTheAutoAdvance() {
        let timer = activeTimer(duration: 4)
        var completions = 0
        timer.onCompletion = { completions += 1 }
        timer._advanceClockForTesting(by: 4)
        XCTAssertEqual(completions, 1)

        timer.seek(toFraction: 0.5)
        timer._advanceClockForTesting(by: 2)

        XCTAssertEqual(completions, 2, "Reculer après la fin réarme l'avance automatique")
    }

    func test_seek_whilePaused_staysPaused() {
        let timer = activeTimer(duration: 10)
        timer.setPaused(true)

        timer.seek(toFraction: 0.3)
        timer._advanceClockForTesting(by: 2)

        XCTAssertEqual(timer.progress, 0.3, accuracy: 0.0001)
    }
}
