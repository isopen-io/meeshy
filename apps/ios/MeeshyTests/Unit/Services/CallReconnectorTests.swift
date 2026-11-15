import XCTest
@testable import Meeshy

/// `CallReconnector` porte la reconnexion d'un appel établi (#11522). Sans appel
/// attaché, ni la relance ICE ni le rejeu des candidats n'arment ou n'émettent
/// quoi que ce soit.
@MainActor
final class CallReconnectorTests: XCTestCase {

    func test_attemptReconnection_withoutAnAttachedCall_isANoOp() {
        let reconnector = CallReconnector()

        reconnector.attemptReconnection(escalate: false)
        reconnector.attemptReconnection(escalate: true)
    }

    func test_attemptReconnection_defaultsToAnAlwaysCoalescingTrigger() {
        let reconnector: CallReconnectorProviding = CallReconnector()

        reconnector.attemptReconnection()
    }

    func test_scheduleICERestart_withoutAnAttachedCall_isANoOp() {
        let reconnector = CallReconnector()

        reconnector.scheduleICERestart(attempt: 1, backoffSeconds: 0)
    }

    func test_flushPendingIceCandidates_withoutAnAttachedCall_isANoOp() {
        let reconnector = CallReconnector()

        reconnector.flushPendingIceCandidates()
    }
}
