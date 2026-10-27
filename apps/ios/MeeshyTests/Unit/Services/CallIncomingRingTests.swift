import XCTest
@testable import Meeshy
import MeeshySDK

/// `CallIncomingRing` reçoit l'appel qui arrive et le double appel (#11522) :
/// il agit sur l'appel auquel il est attaché, et sur rien d'autre.
@MainActor
final class CallIncomingRingTests: XCTestCase {

    override func tearDown() async throws {
        CallManager.shared.pendingIncomingCall = nil
        CallManager.shared.showCallWaitingBanner = false
        CallManager.shared.answeringPendingCallId = nil
        try await super.tearDown()
    }

    private func makeWaitingCall(callId: String) -> IncomingCall {
        IncomingCall(callId: callId, fromUserId: "caller-1", fromUsername: "Caller",
                     kind: CallKind(isVideo: false), iceServers: nil, conversationId: nil)
    }

    func test_anUnattachedRing_changesNoCall() {
        let manager = CallManager.shared
        manager.pendingIncomingCall = makeWaitingCall(callId: "ring-unattached")
        manager.showCallWaitingBanner = true

        let ring = CallIncomingRing()
        ring.clearPendingIncomingCall(ifMatching: "ring-unattached")
        ring.endRingingFromCancellation(callId: "ring-unattached")

        XCTAssertEqual(manager.pendingIncomingCall?.callId, "ring-unattached")
        XCTAssertTrue(manager.showCallWaitingBanner)
    }

    func test_theCallsRing_dismissesTheBannerOfTheWaitingCallThatHungUp() {
        let manager = CallManager.shared
        manager.pendingIncomingCall = makeWaitingCall(callId: "ring-waiting-1")
        manager.showCallWaitingBanner = true

        manager.incomingRing.clearPendingIncomingCall(ifMatching: "ring-waiting-1")

        XCTAssertNil(manager.pendingIncomingCall)
        XCTAssertFalse(manager.showCallWaitingBanner)
    }

    func test_tappingTheAlertOfTheWaitingCall_ringsNothingNew() {
        let manager = CallManager.shared
        guard manager.callState == .idle else { return XCTFail("l'appel partagé doit être au repos") }
        manager.pendingIncomingCall = makeWaitingCall(callId: "ring-waiting-2")

        manager.incomingRing.handleIncomingCallAlertTap(
            callId: "ring-waiting-2", fromUserId: "caller-1", fromUsername: "Caller",
            isVideo: false, iceServers: nil, conversationId: nil
        )

        XCTAssertEqual(manager.callState, .idle)
        XCTAssertNil(manager.currentCallId)
    }
}
