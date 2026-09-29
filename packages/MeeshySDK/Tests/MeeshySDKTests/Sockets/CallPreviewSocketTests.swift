import XCTest
@testable import MeeshySDK

/// #8480 — l'aperçu avant décroché vu du socket : la demande et le signal
/// d'aperçu se décodent, et le signal émis a la forme de `call:signal`.
final class CallPreviewSocketTests: XCTestCase {

    func test_previewRequested_decodes() throws {
        let event = try JSONDecoder().decode(CallPreviewRequestedEvent.self, from: Data(#"{"callId":"c1","userId":"u2"}"#.utf8))
        XCTAssertEqual(event, CallPreviewRequestedEvent(callId: "c1", userId: "u2"))
    }

    func test_previewSignal_decodesLikeACallSignal() throws {
        let json = #"{"callId":"c1","signal":{"type":"offer","from":"u1","to":"u2","sdp":"v=0","negotiationId":2}}"#
        let event = try JSONDecoder().decode(CallAnswerData.self, from: Data(json.utf8))
        XCTAssertEqual(event.signal.type, "offer")
        XCTAssertEqual(event.signal.negotiationId, 2)
    }

    func test_previewSignalPayload_carriesFromToAndEpoch() {
        let payload = MessageSocketManager.callPreviewSignalPayload(callId: "c1", type: "answer", from: "u2", to: "u1", negotiationId: 3, fields: ["sdp": "v=0"])
        XCTAssertEqual(payload["callId"] as? String, "c1")
        let signal = payload["signal"] as? [String: Any]
        XCTAssertEqual(signal?["type"] as? String, "answer")
        XCTAssertEqual(signal?["from"] as? String, "u2")
        XCTAssertEqual(signal?["to"] as? String, "u1")
        XCTAssertEqual(signal?["negotiationId"] as? Int, 3)
        XCTAssertEqual(signal?["sdp"] as? String, "v=0")
    }

    func test_previewHandlers_areRegisteredOnTheSocket() throws {
        let source = try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Sockets/MessageSocketManager.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("registerCallPreviewHandlers(on: socket)"))
    }
}
