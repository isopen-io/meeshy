import XCTest
import CoreMedia
@testable import MeeshyUI

/// #9702 — le lecteur de scène avançait sa tête de lecture de la durée
/// NOMINALE d'une frame (`targetTimestamp − timestamp`) : chaque image perdue
/// la faisait prendre du retard sur l'audio, qui, lui, ne perd rien. Elle
/// avance désormais du temps RÉEL écoulé entre deux ticks.
@MainActor
final class PlayheadTickClockTests: XCTestCase {

    private let frame: CFTimeInterval = 1.0 / 60.0

    func test_elapsed_firstTick_advancesByOneNominalFrame() {
        XCTAssertEqual(PlayheadTickClock.elapsed(previous: nil, now: 10, nominal: frame),
                       frame, accuracy: 1e-9)
    }

    func test_elapsed_droppedFrames_advanceByRealElapsedTime() {
        let elapsed = PlayheadTickClock.elapsed(previous: 10, now: 10 + 3 * frame, nominal: frame)
        XCTAssertEqual(elapsed, 3 * frame, accuracy: 1e-9,
                       "Deux images perdues : la tête de lecture doit rattraper l'audio")
    }

    func test_elapsed_hugeGap_isClampedToOneFrame() {
        let elapsed = PlayheadTickClock.elapsed(previous: 10, now: 42, nominal: frame)
        XCTAssertEqual(elapsed, frame, accuracy: 1e-9,
                       "Un retour d'arrière-plan ne doit pas faire sauter la slide")
    }

    func test_elapsed_nonIncreasingTimestamp_doesNotAdvance() {
        XCTAssertEqual(PlayheadTickClock.elapsed(previous: 10, now: 10, nominal: frame), 0)
        XCTAssertEqual(PlayheadTickClock.elapsed(previous: 10, now: 9, nominal: frame), 0)
    }

    func test_advance_remembersLastTick() {
        var clock = PlayheadTickClock()
        _ = clock.advance(now: 10, nominal: frame)
        let elapsed = clock.advance(now: 10.05, nominal: frame)
        XCTAssertEqual(elapsed, 0.05, accuracy: 1e-9)
    }

    func test_reset_forgetsLastTick_soAResumeAdvancesOneFrame() {
        var clock = PlayheadTickClock()
        _ = clock.advance(now: 10, nominal: frame)
        clock.reset()
        XCTAssertEqual(clock.advance(now: 10.2, nominal: frame), frame, accuracy: 1e-9)
    }

    func test_isDriftCheckDue_firesAtMostOncePerInterval() {
        var clock = PlayheadTickClock()
        XCTAssertFalse(clock.isDriftCheckDue(now: 10))
        XCTAssertFalse(clock.isDriftCheckDue(now: 10.3))
        XCTAssertTrue(clock.isDriftCheckDue(now: 10.5))
        XCTAssertFalse(clock.isDriftCheckDue(now: 10.6))
        XCTAssertTrue(clock.isDriftCheckDue(now: 11.01))
    }

    // MARK: - Drift correction

    func test_driftCorrection_withinThreshold_isNil() {
        XCTAssertNil(VideoDriftCorrection.driftCorrection(expected: 4, actual: 4.2, threshold: 0.3))
    }

    func test_driftCorrection_beyondThreshold_seeksToExpected() {
        let target = VideoDriftCorrection.driftCorrection(expected: 4, actual: 3.5, threshold: 0.3)
        XCTAssertEqual(target?.seconds ?? -1, 4, accuracy: 0.002)
    }

    func test_driftCorrection_videoAhead_isCorrectedToo() {
        let target = VideoDriftCorrection.driftCorrection(expected: 4, actual: 4.6, threshold: 0.3)
        XCTAssertEqual(target?.seconds ?? -1, 4, accuracy: 0.002)
    }

    /// Un recalage EN LECTURE vise vite plutôt qu'à l'image près : un seek
    /// précis qui décode plus de 0,5 s serait annulé par le contrôle suivant,
    /// et ainsi de suite. Sa tolérance reste sous le seuil, sans quoi le point
    /// d'arrivée pourrait lui-même redéclencher un recalage.
    func test_driftSeekTolerance_isNonZeroAndBelowEveryThreshold() {
        let tolerance = VideoDriftCorrection.seekTolerance.seconds
        XCTAssertGreaterThan(tolerance, 0)
        XCTAssertLessThan(tolerance, StoryMediaLayer.timelineSeekDriftThreshold / 2)
        XCTAssertLessThan(tolerance, StoryBackgroundLayer.timelineSeekDriftThreshold / 2)
    }

    func test_driftCorrection_nonFiniteInputs_neverSeek() {
        XCTAssertNil(VideoDriftCorrection.driftCorrection(expected: .nan, actual: 1, threshold: 0.3))
        XCTAssertNil(VideoDriftCorrection.driftCorrection(expected: 1, actual: .infinity, threshold: 0.3))
    }
}
