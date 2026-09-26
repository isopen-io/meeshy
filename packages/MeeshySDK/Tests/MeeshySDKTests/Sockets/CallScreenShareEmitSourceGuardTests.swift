import XCTest
@testable import MeeshySDK

/// #8063 — `call:toggle-screen` a la MÊME charge que `call:toggle-video`
/// (`{ callId, enabled }`, validée par `socketMediaToggleSchema` côté
/// passerelle). Garde de source, même technique que
/// `CallEmitSourceGuardTests` : le socket est un client tiers concret, sans
/// double.
final class CallScreenShareEmitSourceGuardTests: XCTestCase {

    private func extensionSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Sockets/MessageSocketManager+ScreenShare.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_emitCallToggleScreen_emitsTheToggleContract() throws {
        let src = try extensionSource()

        XCTAssertTrue(
            src.contains("socket?.emit(\"call:toggle-screen\", [\"callId\": callId, \"enabled\": enabled])"),
            "emitCallToggleScreen must emit 'call:toggle-screen' with {callId, enabled}"
        )
    }

    func test_emitCallToggleScreen_isPublicForTheApp() throws {
        let src = try extensionSource()

        XCTAssertTrue(src.contains("public func emitCallToggleScreen(callId: String, enabled: Bool)"))
    }
}
