import XCTest
@testable import MeeshySDK

/// #8064 — l'accusé d'un verbe d'enregistrement : seul un `success: true`
/// porteur d'un `recordingId` vaut accord ; toute autre forme est un refus.
final class CallRecordingAckTests: XCTestCase {

    private func refusalCode(_ result: Result<String, CallRecordingRefusal>) -> String? {
        guard case .failure(let refusal) = result else { return nil }
        return refusal.code
    }

    func test_ack_success_returnsTheRecordingId() {
        let result = MessageSocketManager.callRecordingAck(["success": true, "recordingId": "rec-1"])
        XCTAssertEqual(try? result.get(), "rec-1")
    }

    func test_ack_refusal_carriesTheGatewayCode() {
        let result = MessageSocketManager.callRecordingAck(["success": false, "code": "NO_PEER_TO_CONSENT"])
        XCTAssertEqual(refusalCode(result), "NO_PEER_TO_CONSENT")
    }

    func test_ack_timeout_isARefusal() {
        let result = MessageSocketManager.callRecordingAck("NO ACK")
        XCTAssertEqual(refusalCode(result), "TIMEOUT")
    }

    func test_ack_successWithoutRecordingId_isARefusal() {
        let result = MessageSocketManager.callRecordingAck(["success": true])
        XCTAssertEqual(refusalCode(result), "MALFORMED_ACK")
    }
}
