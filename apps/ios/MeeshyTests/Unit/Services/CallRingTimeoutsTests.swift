import XCTest
@testable import Meeshy

/// `CallRingTimeouts` possède les deux délais de sonnerie (#11522) : démarrer
/// arme, redémarrer n'en garde qu'un, annuler désarme, la fin d'appel retire tout.
@MainActor
final class CallRingTimeoutsTests: XCTestCase {

    func test_startingTheOutgoingTimeout_armsIt_andCancellingDisarmsIt() {
        let timeouts = CallRingTimeouts()

        timeouts.startOutgoingRingTimeout()
        XCTAssertTrue(timeouts.isOutgoingArmed)

        timeouts.cancelOutgoingRingTimeout()
        XCTAssertFalse(timeouts.isOutgoingArmed)
    }

    func test_startingTheOutgoingTimeoutTwice_leavesOneArmed() {
        let timeouts = CallRingTimeouts()

        timeouts.startOutgoingRingTimeout()
        timeouts.startOutgoingRingTimeout()

        XCTAssertTrue(timeouts.isOutgoingArmed)
        timeouts.cancelAll()
        XCTAssertFalse(timeouts.isOutgoingArmed)
    }

    func test_startingTheIncomingTimeout_armsIt_withoutArmingTheOutgoingOne() {
        let timeouts = CallRingTimeouts()

        timeouts.startIncomingRingTimeout()

        XCTAssertTrue(timeouts.isIncomingArmed)
        XCTAssertFalse(timeouts.isOutgoingArmed)
        timeouts.cancelAll()
    }

    func test_cancellingAll_disarmsBoth() {
        let timeouts = CallRingTimeouts()
        timeouts.startOutgoingRingTimeout()
        timeouts.startIncomingRingTimeout()

        timeouts.cancelAll()

        XCTAssertFalse(timeouts.isOutgoingArmed)
        XCTAssertFalse(timeouts.isIncomingArmed)
    }
}
