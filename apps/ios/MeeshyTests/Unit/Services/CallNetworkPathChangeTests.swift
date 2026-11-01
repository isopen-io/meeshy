import XCTest
import Network
@testable import Meeshy

/// La règle d'un changement de chemin réseau pendant un appel (#11522) : perte,
/// retour et bascule d'interface ne commandent la reconnexion qu'en appel actif.
@MainActor
final class CallNetworkPathChangeTests: XCTestCase {

    private func evaluate(
        previousStatus: NWPath.Status = .satisfied,
        previousInterface: NWInterface.InterfaceType? = .wifi,
        status: NWPath.Status = .satisfied,
        interface: NWInterface.InterfaceType? = .wifi,
        callState: CallState = .connected
    ) -> CallNetworkPathChange {
        CallNetworkPathChange.evaluate(
            previousStatus: previousStatus,
            previousInterface: previousInterface,
            status: status,
            interface: interface,
            callState: callState
        )
    }

    func test_lostPath_inConnectedCall_isLost() {
        let change = evaluate(status: .unsatisfied)

        XCTAssertEqual(change.action, .lost)
    }

    func test_pathBackSatisfied_inReconnectingCall_isRecovered() {
        let change = evaluate(previousStatus: .unsatisfied, callState: .reconnecting(attempt: 1))

        XCTAssertEqual(change.action, .recovered)
    }

    func test_wifiToCellular_inConnectedCall_isHandoff_andCountsATransition() {
        let change = evaluate(interface: .cellular)

        XCTAssertEqual(change.action, .handoff)
        XCTAssertTrue(change.countsTransition)
    }

    func test_firstObservedInterface_isNotAHandoff() {
        let change = evaluate(previousInterface: nil, interface: .cellular)

        XCTAssertEqual(change.action, .none)
        XCTAssertFalse(change.countsTransition)
    }

    func test_idleAndRinging_neverReact() {
        XCTAssertEqual(evaluate(status: .unsatisfied, callState: .idle).action, .none)
        XCTAssertEqual(evaluate(interface: .cellular, callState: .ringing(isOutgoing: true)).action, .none)
        XCTAssertFalse(evaluate(interface: .cellular, callState: .idle).countsTransition)
    }

    func test_connectingCountsAsAnActiveCall() {
        let change = evaluate(interface: .cellular, callState: .connecting)

        XCTAssertEqual(change.action, .handoff)
        XCTAssertTrue(change.countsTransition)
    }
}
