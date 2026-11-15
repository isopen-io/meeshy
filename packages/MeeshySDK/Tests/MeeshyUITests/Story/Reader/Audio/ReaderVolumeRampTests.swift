import XCTest
@testable import MeeshyUI

/// #9702 — les fondus du lecteur avançaient d'un PAS par réveil (`i / steps`) :
/// chaque `Task.sleep` qui se réveillait en retard étirait la rampe, et un
/// déclenchement tardif la décalait d'autant. Le volume se lit désormais sur le
/// temps RÉEL écoulé depuis l'instant prévu du fondu.
@MainActor
final class ReaderVolumeRampTests: XCTestCase {

    func test_volume_atStart_isFrom() {
        XCTAssertEqual(ReaderVolumeRamp.volume(from: 0, to: 1, duration: 0.5, elapsed: 0), 0, accuracy: 1e-6)
    }

    func test_volume_isLinearInElapsedTime() {
        XCTAssertEqual(ReaderVolumeRamp.volume(from: 0.2, to: 1, duration: 2, elapsed: 0.5), 0.4, accuracy: 1e-6)
    }

    func test_volume_fadeOut_descends() {
        XCTAssertEqual(ReaderVolumeRamp.volume(from: 1, to: 0, duration: 1, elapsed: 0.25), 0.75, accuracy: 1e-6)
    }

    func test_volume_lateWakeUp_landsWhereTheClockSays_notOneStepFurther() {
        let late = ReaderVolumeRamp.volume(from: 0, to: 1, duration: 1, elapsed: 0.9)
        XCTAssertEqual(late, 0.9, accuracy: 1e-6)
    }

    func test_volume_pastDuration_isClampedToTarget() {
        XCTAssertEqual(ReaderVolumeRamp.volume(from: 0, to: 0.8, duration: 1, elapsed: 3), 0.8, accuracy: 1e-6)
    }

    func test_volume_beforeStart_isClampedToFrom() {
        XCTAssertEqual(ReaderVolumeRamp.volume(from: 0.3, to: 1, duration: 1, elapsed: -1), 0.3, accuracy: 1e-6)
    }

    func test_volume_zeroOrInvalidDuration_jumpsToTarget() {
        XCTAssertEqual(ReaderVolumeRamp.volume(from: 0, to: 1, duration: 0, elapsed: 0), 1)
        XCTAssertEqual(ReaderVolumeRamp.volume(from: 0, to: 1, duration: .nan, elapsed: 0), 1)
    }

    func test_isComplete_onlyOnceTheFullDurationElapsed() {
        XCTAssertFalse(ReaderVolumeRamp.isComplete(duration: 1, elapsed: 0.99))
        XCTAssertTrue(ReaderVolumeRamp.isComplete(duration: 1, elapsed: 1))
    }
}
