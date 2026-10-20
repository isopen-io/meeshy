import XCTest
import MeeshySDK
@testable import Meeshy

final class CallStateMachineTests: XCTestCase {
    private let everyState: [CallState] = [
        .idle, .ringing(isOutgoing: true), .ringing(isOutgoing: false), .offering,
        .connecting, .connected, .reconnecting(attempt: 1), .ended(reason: .remote)
    ]

    func test_next_ringIncoming_fromIdle_ringsIncoming() {
        XCTAssertEqual(CallStateMachine.next(from: .idle, on: .ring(.incoming)), .ringing(isOutgoing: false))
    }

    func test_next_ringOutgoing_fromIdle_ringsOutgoing() {
        XCTAssertEqual(CallStateMachine.next(from: .idle, on: .ring(.outgoing)), .ringing(isOutgoing: true))
    }

    func test_next_ring_whileACallIsUnderway_isRefused() {
        XCTAssertNil(CallStateMachine.next(from: .connected, on: .ring(.incoming)))
        XCTAssertNil(CallStateMachine.next(from: .connecting, on: .ring(.incoming)))
        XCTAssertNil(CallStateMachine.next(from: .ringing(isOutgoing: false), on: .ring(.incoming)))
    }

    func test_next_ring_withMissedOrUnknownDirection_isRefused() {
        XCTAssertNil(CallStateMachine.next(from: .idle, on: .ring(.missed)))
        XCTAssertNil(CallStateMachine.next(from: .idle, on: .ring(.unknown)))
    }

    func test_next_offerSent_onlyAfterAnOutgoingRing() {
        XCTAssertEqual(CallStateMachine.next(from: .ringing(isOutgoing: true), on: .offerSent), .offering)
        XCTAssertNil(CallStateMachine.next(from: .ringing(isOutgoing: false), on: .offerSent))
        XCTAssertNil(CallStateMachine.next(from: .idle, on: .offerSent))
    }

    func test_next_answered_fromIncomingRingOrOffering_connects() {
        XCTAssertEqual(CallStateMachine.next(from: .ringing(isOutgoing: false), on: .answered), .connecting)
        XCTAssertEqual(CallStateMachine.next(from: .offering, on: .answered), .connecting)
        XCTAssertNil(CallStateMachine.next(from: .idle, on: .answered))
        XCTAssertNil(CallStateMachine.next(from: .ringing(isOutgoing: true), on: .answered))
    }

    func test_next_rejoined_fromIdle_connects_withoutRinging() {
        XCTAssertEqual(CallStateMachine.next(from: .idle, on: .rejoined), .connecting)
        XCTAssertNil(CallStateMachine.next(from: .connected, on: .rejoined))
    }

    func test_next_mediaConnected_fromConnectingOrReconnecting_connects() {
        XCTAssertEqual(CallStateMachine.next(from: .connecting, on: .mediaConnected), .connected)
        XCTAssertEqual(CallStateMachine.next(from: .reconnecting(attempt: 2), on: .mediaConnected), .connected)
        XCTAssertNil(CallStateMachine.next(from: .offering, on: .mediaConnected))
        XCTAssertNil(CallStateMachine.next(from: .ringing(isOutgoing: true), on: .mediaConnected))
    }

    func test_next_linkLost_beforeMediaNegotiation_isRefused() {
        XCTAssertNil(CallStateMachine.next(from: .ringing(isOutgoing: false), on: .linkLost(attempt: 1)))
        XCTAssertNil(CallStateMachine.next(from: .offering, on: .linkLost(attempt: 1)))
        XCTAssertEqual(CallStateMachine.next(from: .connected, on: .linkLost(attempt: 1)), .reconnecting(attempt: 1))
        XCTAssertEqual(CallStateMachine.next(from: .reconnecting(attempt: 1), on: .linkLost(attempt: 2)),
                       .reconnecting(attempt: 2))
        XCTAssertNil(CallStateMachine.next(from: .connected, on: .linkLost(attempt: 0)))
    }

    func test_next_ended_isReachableFromEveryState_includingEnded() {
        for state in everyState {
            XCTAssertEqual(CallStateMachine.next(from: state, on: .ended(.local)), .ended(reason: .local))
        }
    }

    func test_next_settled_onlyFromEnded() {
        XCTAssertEqual(CallStateMachine.next(from: .ended(reason: .missed), on: .settled), .idle)
        XCTAssertNil(CallStateMachine.next(from: .connected, on: .settled))
        XCTAssertNil(CallStateMachine.next(from: .idle, on: .settled))
    }

    func test_isLegal_acceptsEveryTransitionCallManagerPerforms() {
        let performed: [(CallState, CallState)] = [
            (.idle, .ringing(isOutgoing: false)),
            (.idle, .ringing(isOutgoing: true)),
            (.ringing(isOutgoing: true), .offering),
            (.ringing(isOutgoing: false), .connecting),
            (.offering, .connecting),
            (.idle, .connecting),
            (.connecting, .connected),
            (.reconnecting(attempt: 1), .connected),
            (.connected, .reconnecting(attempt: 1)),
            (.reconnecting(attempt: 1), .reconnecting(attempt: 2)),
            (.connected, .ended(reason: .local)),
            (.ringing(isOutgoing: false), .ended(reason: .rejected)),
            (.ended(reason: .remote), .idle),
            (.ended(reason: .remote), .ended(reason: .local))
        ]
        for (from, to) in performed {
            XCTAssertTrue(CallStateMachine.isLegal(from: from, to: to), "\(from) -> \(to)")
        }
    }

    func test_isLegal_refusesASkippedNegotiation() {
        XCTAssertFalse(CallStateMachine.isLegal(from: .ringing(isOutgoing: true), to: .connected))
        XCTAssertFalse(CallStateMachine.isLegal(from: .idle, to: .connected))
    }

    func test_isLegal_acceptsIdentity() {
        for state in everyState {
            XCTAssertTrue(CallStateMachine.isLegal(from: state, to: state))
        }
    }

    func test_status_projectsTheServerVocabulary() {
        XCTAssertEqual(CallStateMachine.status(of: .connected), .active)
        XCTAssertEqual(CallStateMachine.status(of: .ended(reason: .rejected)), .rejected)
        XCTAssertEqual(CallStateMachine.status(of: .ended(reason: .missed)), .missed)
        XCTAssertEqual(CallStateMachine.status(of: .ended(reason: .failed("x"))), .failed)
        XCTAssertEqual(CallStateMachine.status(of: .ended(reason: .remote)), .ended)
        XCTAssertEqual(CallStateMachine.status(of: .offering), .ringing)
        XCTAssertEqual(CallStateMachine.status(of: .reconnecting(attempt: 1)), .reconnecting)
        XCTAssertNil(CallStateMachine.status(of: .idle))
    }
}
