import Combine
import XCTest
import MeeshyUI
@testable import Meeshy

// **#9859 — le temps qui passe ne vit plus dans le lecteur de story.**
// La progression était un `@State` du lecteur écrit à chaque tick : le lecteur
// entier se réévaluait jusqu'à 60 fois par seconde, et la story qui boucle sous
// les commentaires (#9821) rendait ce coût permanent (75 à 90 % de processeur).

@MainActor
final class StoryPlaybackProgressClockTests: XCTestCase {

    // MARK: - La règle de publication

    func test_committedFraction_invisibleDelta_publishesNothing() {
        XCTAssertNil(StoryPlaybackProgressClock.committedFraction(raw: 0.5001, current: 0.5))
    }

    func test_committedFraction_visibleDelta_publishesTheNewFraction() {
        XCTAssertEqual(StoryPlaybackProgressClock.committedFraction(raw: 0.51, current: 0.5), 0.51)
    }

    /// Une boucle part de la fin : la barre doit retomber à zéro, sans s'arrêter
    /// à mi-chemin ni rester pleine.
    func test_committedFraction_zero_alwaysPublishes() {
        XCTAssertEqual(StoryPlaybackProgressClock.committedFraction(raw: 0, current: 1), 0)
        XCTAssertEqual(StoryPlaybackProgressClock.committedFraction(raw: 0, current: 0.001), 0)
    }

    func test_committedFraction_theEnd_alwaysPublishes() {
        XCTAssertEqual(StoryPlaybackProgressClock.committedFraction(raw: 1, current: 0.9995), 1)
    }

    func test_committedFraction_sameValue_publishesNothing() {
        XCTAssertNil(StoryPlaybackProgressClock.committedFraction(raw: 0, current: 0))
        XCTAssertNil(StoryPlaybackProgressClock.committedFraction(raw: 1, current: 1))
    }

    func test_committedFraction_outOfRange_isClamped() {
        XCTAssertEqual(StoryPlaybackProgressClock.committedFraction(raw: 1.4, current: 0.5), 1)
        XCTAssertEqual(StoryPlaybackProgressClock.committedFraction(raw: -0.2, current: 0.5), 0)
        XCTAssertEqual(StoryPlaybackProgressClock.committedFraction(raw: .nan, current: 0.5), 0)
    }

    // MARK: - L'horloge

    /// Une story de 5 s tiquée à 60 Hz : 300 ticks, mais la barre ne se
    /// redessine qu'aux écarts visibles, et finit pleine.
    func test_aSlideTickedAt60Hz_publishesAtMostOncePerVisibleStep_andEndsFull() {
        let clock = StoryPlaybackProgressClock()
        var publications = 0
        let sink = clock.objectWillChange.sink { publications += 1 }
        let ticks = 300
        for tick in 1...ticks { clock.publish(Double(tick) / Double(ticks)) }
        sink.cancel()
        XCTAssertEqual(clock.fraction, 1)
        XCTAssertLessThanOrEqual(publications, ticks)
        XCTAssertGreaterThan(publications, 0)
    }

    /// Le cœur de #9859 : à 120 Hz sur une story de 15 s, les publications
    /// sont bornées par la largeur de la barre, pas par la cadence d'écran.
    func test_publicationsAreBoundedByTheBarWidth_notByTheDisplayRate() {
        let clock = StoryPlaybackProgressClock()
        var publications = 0
        let sink = clock.objectWillChange.sink { publications += 1 }
        let ticks = 15 * 120
        for tick in 1...ticks { clock.publish(Double(tick) / Double(ticks)) }
        sink.cancel()
        XCTAssertLessThanOrEqual(publications, Int(1 / StoryPlaybackProgressClock.granularity) + 1)
    }

    func test_reset_bringsTheBarBackToZero() {
        let clock = StoryPlaybackProgressClock()
        clock.publish(0.7)
        clock.reset()
        XCTAssertEqual(clock.fraction, 0)
    }

    // MARK: - Le câblage au compte à rebours

    /// Pause puis reprise : la barre garde sa position exacte, sans saut.
    func test_pauseAndResume_keepTheExactPosition() {
        let timer = StoryReaderTimerController(useDisplayLink: false)
        let clock = StoryPlaybackProgressClock()
        timer.onProgressChange = { clock.publish($0) }
        timer.setCurrentSlide(id: "s1", duration: 10)
        timer.markContentReady(slideId: "s1")
        timer._advanceClockForTesting(by: 4)
        timer.setPaused(true)
        timer._advanceClockForTesting(by: 30)
        XCTAssertEqual(clock.fraction, 0.4, accuracy: 0.001)
        timer.setPaused(false)
        timer._advanceClockForTesting(by: 1)
        XCTAssertEqual(clock.fraction, 0.5, accuracy: 0.001)
    }

    /// La boucle (`seek(toFraction: 0)` sous `storyDidReachItsEnd`) remet la
    /// barre à zéro, et la fin ne part qu'une fois par passage.
    func test_theLoop_resetsTheBar_andTheEndFiresOncePerPass() {
        let timer = StoryReaderTimerController(useDisplayLink: false)
        let clock = StoryPlaybackProgressClock()
        var ends = 0
        timer.onProgressChange = { clock.publish($0) }
        timer.onCompletion = { ends += 1; timer.seek(toFraction: 0) }
        timer.setCurrentSlide(id: "s1", duration: 5)
        timer.markContentReady(slideId: "s1")
        timer._advanceClockForTesting(by: 5)
        XCTAssertEqual(ends, 1)
        XCTAssertEqual(clock.fraction, 0)
        timer._advanceClockForTesting(by: 2.5)
        XCTAssertEqual(clock.fraction, 0.5, accuracy: 0.001)
        timer._advanceClockForTesting(by: 2.5)
        XCTAssertEqual(ends, 2)
    }
}
