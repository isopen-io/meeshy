import XCTest
@testable import MeeshySDK

/// #16665 — `call:screen-capture-alert` porte la sorte de capture, et un
/// `kind` absent (passerelle ou client d'avant) se lit `recording`.
final class CallScreenCaptureAlertTests: XCTestCase {

    private func decode(_ json: String) throws -> CallScreenCaptureAlertData {
        try JSONDecoder().decode(CallScreenCaptureAlertData.self, from: Data(json.utf8))
    }

    func test_alert_withoutKind_readsAsRecording() throws {
        let alert = try decode(#"{"callId":"c1","participantId":"p2","isCapturing":true}"#)

        XCTAssertEqual(alert.captureKind, .recording)
        XCTAssertEqual(alert.capturerId, "p2")
    }

    func test_alert_screenshot_carriesTheCapturer() throws {
        let alert = try decode(#"{"callId":"c1","participantId":"p2","userId":"u2","isCapturing":true,"kind":"screenshot"}"#)

        XCTAssertEqual(alert.captureKind, .screenshot)
        XCTAssertEqual(alert.capturerId, "u2")
    }

    func test_alert_unknownKind_readsAsRecording() throws {
        XCTAssertEqual(try decode(#"{"callId":"c1","participantId":"p2","isCapturing":false,"kind":"hologram"}"#).captureKind, .recording)
    }

    func test_emit_sendsTheKindOnTheWire() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Sockets/MessageSocketManager+CallSignaling.swift")
        let source = try String(contentsOf: root, encoding: .utf8)

        XCTAssertTrue(source.contains(#"socket?.emit("call:screen-capture-detected", ["#))
        XCTAssertTrue(source.contains(#""kind": kind.rawValue"#))
    }
}
