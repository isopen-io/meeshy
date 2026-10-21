import XCTest
@testable import MeeshyUI

/// **Un réel qui reboucle repart de zéro, temps et barre avec l'image (#10555).**
final class PlaybackLoopLawTests: XCTestCase {

    // MARK: - Rebouclage

    func test_fraction_atLoopTurn_restartsFromZeroWithTheItem() {
        let endOfTurn = PlaybackProgressLaw.fraction(itemSeconds: 7.95, durationSeconds: 8)
        let startOfNextTurn = PlaybackProgressLaw.fraction(itemSeconds: 0.02, durationSeconds: 8)
        XCTAssertEqual(endOfTurn, 0.99375, accuracy: 1e-9)
        XCTAssertEqual(startOfNextTurn, 0.0025, accuracy: 1e-9,
                       "le tour suivant lit le temps de SON élément : aucune retenue du tour précédent")
        XCTAssertLessThan(startOfNextTurn, endOfTurn)
    }

    func test_fraction_neverLeavesTheBar() {
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: 8.4, durationSeconds: 8), 1)
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: -0.3, durationSeconds: 8), 0)
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: .nan, durationSeconds: 8), 0)
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: .infinity, durationSeconds: 8), 0)
    }

    // MARK: - Durée inconnue puis connue

    func test_fraction_unknownDuration_staysAtZero_thenFollowsOnceKnown() {
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: 1, durationSeconds: 0), 0)
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: 1, durationSeconds: .nan), 0)
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: 1, durationSeconds: .infinity), 0)
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: 1, durationSeconds: -4), 0)
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: 1, durationSeconds: 4), 0.25, accuracy: 1e-9)
    }

    func test_heldDuration_loopSuccessorNotYetMeasured_keepsTheDurationOfItsMedia() {
        XCTAssertEqual(PlaybackProgressLaw.heldDuration(reported: .nan, known: 8, isLoopSuccessor: true), 8,
                       "le successeur de boucle est le MÊME média : sa durée ne retombe pas à zéro le temps d'être relue")
        XCTAssertEqual(PlaybackProgressLaw.heldDuration(reported: 0, known: 8, isLoopSuccessor: true), 8)
    }

    func test_heldDuration_measuredDuration_alwaysWins() {
        XCTAssertEqual(PlaybackProgressLaw.heldDuration(reported: 8.04, known: 8, isLoopSuccessor: true), 8.04)
        XCTAssertEqual(PlaybackProgressLaw.heldDuration(reported: 12, known: 0, isLoopSuccessor: false), 12)
    }

    // MARK: - Changement de réel pendant la lecture

    func test_heldDuration_anotherReel_neverInheritsThePreviousDuration() {
        XCTAssertEqual(PlaybackProgressLaw.heldDuration(reported: .nan, known: 8, isLoopSuccessor: false), 0,
                       "un autre réel dont la durée n'est pas encore connue n'emprunte pas celle du précédent")
        XCTAssertEqual(PlaybackProgressLaw.fraction(
            itemSeconds: 0.4,
            durationSeconds: PlaybackProgressLaw.heldDuration(reported: .nan, known: 8, isLoopSuccessor: false)), 0)
    }

    // MARK: - Pause et reprise

    func test_fraction_pausedHead_isStable_andResumesFromIt() {
        let paused = PlaybackProgressLaw.fraction(itemSeconds: 3, durationSeconds: 12)
        XCTAssertEqual(paused, PlaybackProgressLaw.fraction(itemSeconds: 3, durationSeconds: 12))
        XCTAssertEqual(paused, 0.25, accuracy: 1e-9)
        XCTAssertGreaterThan(PlaybackProgressLaw.fraction(itemSeconds: 3.2, durationSeconds: 12), paused)
    }

    // MARK: - Déplacement

    func test_headAfterSeek_isTheRequestedHead_boundedByTheMedia() {
        XCTAssertEqual(PlaybackProgressLaw.headAfterSeek(target: 5, durationSeconds: 12), 5)
        XCTAssertEqual(PlaybackProgressLaw.headAfterSeek(target: 40, durationSeconds: 12), 12)
        XCTAssertEqual(PlaybackProgressLaw.headAfterSeek(target: -2, durationSeconds: 12), 0)
        XCTAssertEqual(PlaybackProgressLaw.headAfterSeek(target: .nan, durationSeconds: 12), 0)
    }

    func test_headAfterSeek_unknownDuration_keepsTheRequestedHead() {
        XCTAssertEqual(PlaybackProgressLaw.headAfterSeek(target: 5, durationSeconds: 0), 5)
    }

    func test_fraction_afterBackwardSeek_isTheSeekTarget() {
        let head = PlaybackProgressLaw.headAfterSeek(target: 2, durationSeconds: 8)
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: head, durationSeconds: 8), 0.25, accuracy: 1e-9)
    }

    // MARK: - Réel très court

    func test_fraction_veryShortReel_coversTheWholeBarEveryTurn() {
        let duration = 0.4
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: 0.2, durationSeconds: duration), 0.5, accuracy: 1e-9)
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: 0.41, durationSeconds: duration), 1)
        XCTAssertEqual(PlaybackProgressLaw.fraction(itemSeconds: 0, durationSeconds: duration), 0)
    }

    // MARK: - Le tour de boucle du moteur

    func test_loopTurn_successorQueued_waitsForTheQueue_andNeverRewinds() {
        XCTAssertEqual(PlaybackLoopTurn.action(finishedIsCurrent: true, successorQueued: true), .awaitQueueAdvance,
                       "la file enchaîne seule : un retour au début ici rejouerait l'élément fini par-dessus l'enchaînement")
    }

    func test_loopTurn_noSuccessor_rewindsTheCurrentItem() {
        XCTAssertEqual(PlaybackLoopTurn.action(finishedIsCurrent: true, successorQueued: false), .rewindCurrentItem)
    }

    func test_loopTurn_queueAlreadyAdvanced_touchesNothing() {
        XCTAssertEqual(PlaybackLoopTurn.action(finishedIsCurrent: false, successorQueued: false), .alreadyAdvanced)
        XCTAssertEqual(PlaybackLoopTurn.action(finishedIsCurrent: false, successorQueued: true), .alreadyAdvanced)
    }

    // MARK: - L'horloge de scène au tour suivant

    func test_clockRearm_sceneRestartedAfterItsEnd_isDue() {
        XCTAssertTrue(PlaybackClockRearm.isDue(entersPlay: true, modeChanged: false,
                                               clockRunning: false, isOnScreen: true))
    }

    func test_clockRearm_runningClock_isLeftAlone() {
        XCTAssertFalse(PlaybackClockRearm.isDue(entersPlay: true, modeChanged: false,
                                                clockRunning: true, isOnScreen: true))
    }

    func test_clockRearm_modeChange_armsThroughItsOwnPath() {
        XCTAssertFalse(PlaybackClockRearm.isDue(entersPlay: true, modeChanged: true,
                                                clockRunning: false, isOnScreen: true))
    }

    func test_clockRearm_offScreenOrLeavingPlay_armsNothing() {
        XCTAssertFalse(PlaybackClockRearm.isDue(entersPlay: true, modeChanged: false,
                                                clockRunning: false, isOnScreen: false))
        XCTAssertFalse(PlaybackClockRearm.isDue(entersPlay: false, modeChanged: false,
                                                clockRunning: false, isOnScreen: true))
    }
}
