import XCTest
@testable import MeeshyUI

/// #8017 — relâcher un appui long sur un texte flouté ne le dévoile pas
/// derrière le menu. Seul un TOUCHER dévoile ; une pression qui a duré le temps
/// de l'appui long du message (0,35 s) n'est pas un toucher.
@MainActor
final class ProtectedVeilPressLawTests: XCTestCase {

    private let pressStart = Date(timeIntervalSince1970: 2_000_000_000)

    private func at(_ seconds: TimeInterval) -> Date {
        pressStart.addingTimeInterval(seconds)
    }

    // MARK: - La loi

    func test_reveals_quickTap_reveals() {
        XCTAssertTrue(ProtectedVeilPressLaw.reveals(pressDuration: 0.12))
    }

    func test_reveals_unmeasuredPress_isATapAndReveals() {
        XCTAssertTrue(ProtectedVeilPressLaw.reveals(pressDuration: nil))
    }

    func test_reveals_pressAsLongAsTheMessageLongPress_doesNotReveal() {
        XCTAssertFalse(ProtectedVeilPressLaw.reveals(pressDuration: ProtectedVeilPressLaw.longPressThreshold))
    }

    func test_reveals_longPressReleasedAfterTheMenuOpened_doesNotReveal() {
        XCTAssertFalse(ProtectedVeilPressLaw.reveals(pressDuration: 1.4))
    }

    // MARK: - L'horloge de la pression

    func test_pressDuration_releaseReportedBeforeTheAction_measuresThePress() {
        let clock = ProtectedVeilPressClock()
        clock.pressChanged(isPressed: true, at: at(0))
        clock.pressChanged(isPressed: false, at: at(0.9))

        let duration = clock.pressDuration(endingAt: at(0.9))

        XCTAssertEqual(duration ?? 0, 0.9, accuracy: 0.001)
        XCTAssertFalse(ProtectedVeilPressLaw.reveals(pressDuration: duration))
    }

    func test_pressDuration_actionBeforeTheReleaseIsReported_measuresUpToTheAction() {
        let clock = ProtectedVeilPressClock()
        clock.pressChanged(isPressed: true, at: at(0))

        let duration = clock.pressDuration(endingAt: at(0.8))

        XCTAssertEqual(duration ?? 0, 0.8, accuracy: 0.001)
        XCTAssertFalse(ProtectedVeilPressLaw.reveals(pressDuration: duration))
    }

    func test_pressDuration_quickTap_reveals() {
        let clock = ProtectedVeilPressClock()
        clock.pressChanged(isPressed: true, at: at(0))
        clock.pressChanged(isPressed: false, at: at(0.1))

        XCTAssertTrue(ProtectedVeilPressLaw.reveals(pressDuration: clock.pressDuration(endingAt: at(0.1))))
    }

    func test_pressDuration_cancelledLongPressLongAgo_doesNotSwallowTheNextTap() {
        let clock = ProtectedVeilPressClock()
        clock.pressChanged(isPressed: true, at: at(0))
        clock.pressChanged(isPressed: false, at: at(1))

        XCTAssertNil(clock.pressDuration(endingAt: at(5)))
    }

    func test_reset_forgetsThePress() {
        let clock = ProtectedVeilPressClock()
        clock.pressChanged(isPressed: true, at: at(0))

        clock.reset()

        XCTAssertNil(clock.pressDuration(endingAt: at(2)))
    }
}
