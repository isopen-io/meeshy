import XCTest
import QuartzCore
@testable import MeeshyUI

/// #9883 — **la lecture du rognage suit l'horloge d'affichage.**
///
/// Le pas de la lecture est une loi pure : tenir la borne haute, revenir à la
/// borne basse. L'horloge qui l'appelle (CADisplayLink, plage 30…60) est
/// remplaçable ; la loi, non.
final class AudioTrimPlaybackStepTests: XCTestCase {

    func test_insideTheSegment_keepsPlayingAtTheCurrentTime() {
        let step = AudioTrimPlaybackStep.next(currentTime: 3.2, playerIsPlaying: true, lowerBound: 2, upperBound: 5)
        XCTAssertEqual(step, .playing(at: 3.2))
    }

    func test_reachingTheUpperBound_finishesAtTheLowerBound() {
        let step = AudioTrimPlaybackStep.next(currentTime: 5, playerIsPlaying: true, lowerBound: 2, upperBound: 5)
        XCTAssertEqual(step, .finished(restingAt: 2))
    }

    func test_pastTheUpperBound_finishesAtTheLowerBound() {
        let step = AudioTrimPlaybackStep.next(currentTime: 5.4, playerIsPlaying: true, lowerBound: 2, upperBound: 5)
        XCTAssertEqual(step, .finished(restingAt: 2))
    }

    func test_aPlayerThatStoppedByItself_finishesAtTheLowerBound() {
        let step = AudioTrimPlaybackStep.next(currentTime: 4, playerIsPlaying: false, lowerBound: 2, upperBound: 5)
        XCTAssertEqual(step, .finished(restingAt: 2))
    }

    func test_theVisualClockRange_isThirtyToSixty() {
        let range = CAFrameRateRange.visualClock
        XCTAssertEqual(range.minimum, 30)
        XCTAssertEqual(range.maximum, 60)
        XCTAssertEqual(range.preferred, 60)
    }
}
