import XCTest
import MeeshySDK
@testable import Meeshy

/// `CallSignalingRouter` possède les écoutes `call:*` de la passerelle et les
/// livre à l'appel courant (#11522) : un événement de l'appel courant atteint
/// l'appel, celui d'un autre appel ne le touche pas.
@MainActor
final class CallSignalingRouterTests: XCTestCase {

    private func qualityAlert(callId: String) throws -> CallQualityAlertData {
        let json = #"{"callId":"\#(callId)","participantId":"peer","metric":"rtt","value":900,"threshold":400}"#
        return try JSONDecoder().decode(CallQualityAlertData.self, from: Data(json.utf8))
    }

    private func drainMainQueue() async {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
    }

    private func withCurrentCall(_ callId: String?, _ body: (CallManager) async throws -> Void) async rethrows {
        let call = CallManager.shared
        let savedCallId = call.currentCallId
        let savedMedia = call.remoteMedia
        defer {
            call.remoteQualityResetTask?.cancel()
            call.remoteQualityResetTask = nil
            call.currentCallId = savedCallId
            call.remoteMedia = savedMedia
        }
        call.currentCallId = callId
        call.remoteMedia = .initial
        try await body(call)
    }

    func test_qualityAlertForTheCurrentCall_reachesTheCallThroughTheRouter() async throws {
        try await withCurrentCall("router-call") { call in
            let router = CallSignalingRouter()
            router.start(routingTo: call)
            MessageSocketManager.shared.callQualityAlert.send(try qualityAlert(callId: "router-call"))
            await drainMainQueue()
            XCTAssertTrue(call.remoteMedia.isQualityDegraded)
            XCTAssertNotNil(call.remoteQualityResetTask, "the degraded flag clears itself after the reset window")
        }
    }

    func test_qualityAlertForAnotherCall_leavesTheCurrentCallUntouched() async throws {
        try await withCurrentCall("router-call") { call in
            let router = CallSignalingRouter()
            router.start(routingTo: call)
            MessageSocketManager.shared.callQualityAlert.send(try qualityAlert(callId: "another-call"))
            await drainMainQueue()
            XCTAssertFalse(call.remoteMedia.isQualityDegraded)
        }
    }

    func test_startingTwice_subscribesOnce() async throws {
        try await withCurrentCall("router-call") { call in
            let router = CallSignalingRouter()
            router.start(routingTo: call)
            router.start(routingTo: call)
            XCTAssertEqual(router.subscriptionCount, 18, "eighteen socket subjects, never subscribed twice")
        }
    }
}
