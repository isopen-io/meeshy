import XCTest
@testable import Meeshy

/// « Raccrocher et répondre » : pendant la passation (0,5 s), `pendingIncomingCall` est DÉJÀ vide et seul
/// `answeringPendingCallId` nomme l'appel en attente. Si son appelant raccroche pendant ce temps, la fermeture
/// distante (`clearPendingIncomingCall(ifMatching:)`) sortait sur son garde `pendingIncomingCall?.callId == callId`
/// — toujours faux — et la passation sonnait ensuite pour un appel que le serveur avait déjà démonté.
@MainActor
final class CallWaitingHandoffCancellationTests: XCTestCase {

    override func tearDown() async throws {
        CallManager.shared.answeringPendingCallId = nil
        CallManager.shared.pendingIncomingCall = nil
        try await super.tearDown()
    }

    func test_theWaitingCallerHangingUpDuringTheHandoff_cancelsTheAnswer() {
        let manager = CallManager.shared
        manager.pendingIncomingCall = nil
        manager.answeringPendingCallId = "call-waiting-1"

        manager.clearPendingIncomingCall(ifMatching: "call-waiting-1")

        XCTAssertNil(manager.answeringPendingCallId, "la passation ne répondra pas à un appel déjà raccroché")
    }

    func test_anotherCallEnding_leavesTheHandoffAlone() {
        let manager = CallManager.shared
        manager.pendingIncomingCall = nil
        manager.answeringPendingCallId = "call-waiting-1"

        manager.clearPendingIncomingCall(ifMatching: "some-other-call")

        XCTAssertEqual(manager.answeringPendingCallId, "call-waiting-1")
    }

    func test_beforeTheHandoff_theBannerStillClears() {
        let manager = CallManager.shared
        manager.pendingIncomingCall = IncomingCall(callId: "call-waiting-2", fromUserId: "u", fromUsername: "Ada",
                                                   kind: .audio, iceServers: nil, conversationId: nil)
        manager.showCallWaitingBanner = true

        manager.clearPendingIncomingCall(ifMatching: "call-waiting-2")

        XCTAssertNil(manager.pendingIncomingCall)
        XCTAssertFalse(manager.showCallWaitingBanner)
    }
}
